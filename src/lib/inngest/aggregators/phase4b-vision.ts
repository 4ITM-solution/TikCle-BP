import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcVisionCost,
  visionTagOne,
} from "@/lib/anthropic/vision-tagger";
import { stableUrlKey, tagInputHash } from "@/lib/anthropic/dedup";
import { downloadAndStore } from "@/lib/storage/asset-downloader";
import type {
  Phase4bVisionStats,
  Phase4bSampleStats,
  VisionTags,
} from "../types";

type SupaClient = SupabaseClient<Database>;

const VISION_CONCURRENCY = 5; // Anthropic API 동시 호출 수
const REHOST_CONCURRENCY = 8; // IG cover re-host 동시 fetch 수

/**
 * Phase 4b.3 — Vision Tagging
 *
 * sample 영상의 cover image + caption + ASR을 Sonnet Vision에 보내
 * 구조화된 태그 (hook_tags / content_angle / body_format / ...) 회수.
 *
 * 결과: case_video_analyses.vision_tags (jsonb)
 *
 * Step-level batch 처리. Orchestrator가 N개씩 batch로 step.run 호출
 * (IG 500 + TK 가 한 step에 몰리면 함수 timeout → Internal Server Error 였음).
 *   - fetchPhase4bVisionInputs: 입력 리스트 빌드 (setup, 1 step)
 *   - processPhase4bVisionBatch: IG cover re-host + vision 태깅 + upsert (batch step)
 *   - finalizePhase4bVision: 집계
 */

type VisionInput = {
  platform: "tiktok" | "instagram" | "youtube";
  content_id: string | null;
  external_ref: string | null;
  cover_url: string;
  caption: string | null;
  asr_text: string | null;
};

export type Phase4bVisionSetup = {
  inputs: VisionInput[];
  total_sample_content_ids: number;
  skipped_reason?: string;
};

export type Phase4bVisionBatchResult = {
  attempted: number;
  with_tags: number;
  failed: number;
  reused: number; // 동일 입력 해시 재사용(LLM 미호출)으로 채운 수 — WS3 §3
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  failure_reasons: Array<{ reason: string; cover_url?: string }>;
};

/**
 * Phase 4b.3 setup — vision 입력 리스트(TK + IG/YT) 빌드.
 * IG cover re-host는 batch 단계에서 (setup을 가볍게 유지).
 */
export async function fetchPhase4bVisionInputs(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bVisionSetup> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { inputs: [], total_sample_content_ids: 0, skipped_reason: "ANTHROPIC_API_KEY 미설정" };
  }
  if (
    sample.sample_content_ids.length === 0 &&
    (sample.sample_items?.length ?? 0) === 0
  ) {
    return { inputs: [], total_sample_content_ids: 0, skipped_reason: "샘플 0개" };
  }

  const tkInputs = await fetchVisionInputs(
    supabase,
    case_id,
    sample.sample_content_ids,
  );
  const igYtInputs = sample.sample_items
    ? await fetchVisionInputsIgYt(supabase, case_id, sample.sample_items)
    : [];
  const inputs = [...tkInputs, ...igYtInputs];

  return {
    inputs,
    total_sample_content_ids: sample.sample_content_ids.length,
    skipped_reason:
      inputs.length === 0 ? "vision 입력 0개 (cover_url 누락)" : undefined,
  };
}

/**
 * Phase 4b.3 batch — inputs 일부를 IG cover re-host + Sonnet vision 태깅 + upsert.
 */
export async function processPhase4bVisionBatch(
  supabase: SupaClient,
  case_id: string,
  inputs: VisionInput[],
): Promise<Phase4bVisionBatchResult> {
  // ── 0. 태깅 입력 해시 (재호스트 前 원본 cover url 기준) — 동일 입력 재태깅 방지(WS3 §3) ──
  const hashByInput = new Map<VisionInput, string>();
  for (const it of inputs) {
    hashByInput.set(
      it,
      tagInputHash([stableUrlKey(it.cover_url), it.caption, it.asr_text]),
    );
  }
  // 이미 같은 입력으로 태깅된 결과(타 케이스 포함) 조회 → LLM 없이 복사.
  const reuseMap = await fetchReusableVisionTags(
    supabase,
    Array.from(new Set(hashByInput.values())),
  );

  // IG cover는 cdninstagram.com 호스트 → Anthropic Vision의 URL fetch가
  // 인스타 robots.txt에 막혀 400 ("disallowed by robots.txt"). TikTok처럼
  // URL source 직행 불가. → 우리 서버가 다운로드해서 Supabase storage(case-assets,
  // public)에 re-host 후 그 URL을 Anthropic에 넘긴다. re-host 실패 시 원본 폴백.
  // ★ 재사용 hit인 IG 항목은 LLM에 안 넘기므로 재호스트도 생략 (불필요한 다운로드 방지).
  const igItems = inputs.filter(
    (it) => it.platform === "instagram" && !reuseMap.has(hashByInput.get(it)!),
  );
  for (let i = 0; i < igItems.length; i += REHOST_CONCURRENCY) {
    const slice = igItems.slice(i, i + REHOST_CONCURRENCY);
    await Promise.all(
      slice.map(async (it) => {
        const ref = it.external_ref ?? "";
        const safeRef = ref.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
        const storageUrl = await downloadAndStore(
          supabase,
          it.cover_url,
          `vision-covers/${case_id}/ig_${safeRef}.jpg`,
          "image/jpeg",
        );
        if (storageUrl) it.cover_url = storageUrl;
      }),
    );
  }

  let attempted = 0;
  let with_tags = 0;
  let failed = 0;
  let reused = 0;
  let tokens_in = 0;
  let tokens_out = 0;
  let tokens_cache_r = 0;
  let tokens_cache_w = 0;
  const failure_reasons: Array<{ reason: string; cover_url?: string }> = [];

  // platform 별 upsert (해시 포함): TK 는 content_id 기반, IG/YT 는 platform+external_ref.
  // generated types 안 multi-platform·tag_input_hash 미반영이라 cast 우회.
  const sb = supabase as unknown as {
    from: (t: string) => {
      upsert: (
        v: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const upsertTags = async (
    item: VisionInput,
    tags: VisionTags,
  ): Promise<boolean> => {
    const isTk = item.platform === "tiktok";
    const hash = hashByInput.get(item);
    const { error } = isTk
      ? await sb.from("case_video_analyses").upsert(
          {
            case_id,
            content_id: item.content_id,
            platform: "tiktok",
            cover_url: item.cover_url,
            vision_tags: tags,
            tag_input_hash: hash,
          },
          { onConflict: "case_id,content_id" },
        )
      : await sb.from("case_video_analyses").upsert(
          {
            case_id,
            platform: item.platform,
            external_ref: item.external_ref,
            cover_url: item.cover_url,
            vision_tags: tags,
            tag_input_hash: hash,
          },
          { onConflict: "case_id,platform,external_ref" },
        );
    if (error) {
      console.error("[vision] upsert fail", {
        platform: item.platform,
        ref: item.external_ref ?? item.content_id,
        err: error.message,
      });
      return false;
    }
    return true;
  };

  // ── 1. 재사용 pass: reuseMap hit → LLM 없이 태그 복사 ──
  const toTag: VisionInput[] = [];
  for (const it of inputs) {
    const cached = reuseMap.get(hashByInput.get(it)!);
    if (!cached) {
      toTag.push(it);
      continue;
    }
    attempted += 1;
    if (await upsertTags(it, cached)) {
      with_tags += 1;
      reused += 1;
    } else {
      failed += 1;
    }
  }

  // ── 2. batch 내 동일 해시 dedup: hash별 대표 1건만 LLM 호출, 나머지는 결과 공유 ──
  const repByHash = new Map<string, VisionInput>();
  const sharersByHash = new Map<string, VisionInput[]>();
  for (const it of toTag) {
    const h = hashByInput.get(it)!;
    const rep = repByHash.get(h);
    if (!rep) {
      repByHash.set(h, it);
      sharersByHash.set(h, []);
    } else {
      sharersByHash.get(h)!.push(it);
    }
  }
  const reps = Array.from(repByHash.values());

  for (let i = 0; i < reps.length; i += VISION_CONCURRENCY) {
    const slice = reps.slice(i, i + VISION_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((it) =>
        visionTagOne({
          cover_url: it.cover_url,
          caption: it.caption,
          asr_text: it.asr_text,
        }),
      ),
    );

    for (let j = 0; j < results.length; j += 1) {
      const item = slice[j]!;
      const h = hashByInput.get(item)!;
      const group = [item, ...(sharersByHash.get(h) ?? [])];
      const res = results[j];
      if (res?.status !== "fulfilled") {
        attempted += group.length;
        failed += group.length;
        const err = res?.reason as unknown;
        const reason =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : typeof err === "string"
              ? err
              : JSON.stringify(err)?.slice(0, 500) ?? "unknown";
        console.error("[vision] failed", {
          content_id: item.content_id,
          cover_url: item.cover_url,
          reason,
        });
        if (failure_reasons.length < 5) {
          failure_reasons.push({ reason, cover_url: item.cover_url });
        }
        continue;
      }
      tokens_in += res.value.tokens_input;
      tokens_out += res.value.tokens_output;
      tokens_cache_r += res.value.tokens_cache_read;
      tokens_cache_w += res.value.tokens_cache_write;

      if (!res.value.tags) {
        attempted += group.length;
        failed += group.length;
        continue;
      }

      const tags = res.value.tags;
      // 대표 1건 태깅 결과를 그룹(동일 입력) 전원에 upsert. 2건째부터는 재사용 카운트.
      for (let g = 0; g < group.length; g += 1) {
        attempted += 1;
        if (await upsertTags(group[g]!, tags)) {
          with_tags += 1;
          if (g > 0) reused += 1;
        } else {
          failed += 1;
        }
      }
    }
  }

  return {
    attempted,
    with_tags,
    failed,
    reused,
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    tokens_cache_write: tokens_cache_w,
    failure_reasons,
  };
}

/**
 * 동일 태깅 입력 해시로 이미 vision_tags가 있는 행을 케이스 무관 조회 → hash→tags 맵.
 * PostgREST 1000행/in() 한도(R2) 회피 위해 청크로 나눠 조회.
 */
async function fetchReusableVisionTags(
  supabase: SupaClient,
  hashes: string[],
): Promise<Map<string, VisionTags>> {
  const out = new Map<string, VisionTags>();
  if (hashes.length === 0) return out;
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        in: (
          col: string,
          vals: string[],
        ) => {
          not: (
            col: string,
            op: string,
            v: null,
          ) => Promise<{
            data:
              | Array<{ tag_input_hash: string | null; vision_tags: VisionTags | null }>
              | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  const CHUNK = 300;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("case_video_analyses")
      .select("tag_input_hash, vision_tags")
      .in("tag_input_hash", chunk)
      .not("vision_tags", "is", null);
    // BE-11 (CX1-F5): dedup 조회 실패를 무시(빈 맵→전량 재태깅=조용한 과금)하지 않는다.
    //   error면 throw → 배치가 실패로 종료되어 Inngest 재시도(partial). 비용 절감 캐시가
    //   실패했을 때 곧바로 새 LLM 호출로 넘어가지 않는 게 안전(CX F5 정책).
    if (error) {
      const m =
        typeof error === "object" && error && "message" in error
          ? (error as { message: string }).message
          : String(error);
      throw new Error(`vision dedup 재사용 조회 실패(재시도): ${m}`);
    }
    for (const r of data ?? []) {
      if (r.tag_input_hash && r.vision_tags && !out.has(r.tag_input_hash)) {
        out.set(r.tag_input_hash, r.vision_tags);
      }
    }
  }
  return out;
}

export function finalizePhase4bVision(
  batchResults: Phase4bVisionBatchResult[],
  totalSampleContentIds: number,
  skippedReason?: string,
): Phase4bVisionStats {
  if (skippedReason && batchResults.length === 0) return empty(skippedReason);

  let total_attempted = 0;
  let total_with_tags = 0;
  let total_failed = 0;
  let total_reused = 0;
  let tokens_in = 0;
  let tokens_out = 0;
  let tokens_cache_r = 0;
  let tokens_cache_w = 0;
  const failure_reasons: Array<{ reason: string; cover_url?: string }> = [];

  for (const r of batchResults) {
    total_attempted += r.attempted;
    total_with_tags += r.with_tags;
    total_failed += r.failed;
    total_reused += r.reused;
    tokens_in += r.tokens_input;
    tokens_out += r.tokens_output;
    tokens_cache_r += r.tokens_cache_read;
    tokens_cache_w += r.tokens_cache_write;
    for (const fr of r.failure_reasons) {
      if (failure_reasons.length < 5) failure_reasons.push(fr);
    }
  }

  const cost = calcVisionCost({
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    tokens_cache_write: tokens_cache_w,
  });

  // 디버그용: 사용 중인 키의 prefix/suffix
  const rawKey = process.env.ANTHROPIC_API_KEY ?? "";
  const keyPreview =
    rawKey.length > 0
      ? `${rawKey.slice(0, 16)}…${rawKey.slice(-6)} (len=${rawKey.length})`
      : "(empty)";

  return {
    total_attempted,
    total_with_tags,
    total_failed,
    total_reused,
    total_no_cover: Math.max(0, totalSampleContentIds - total_attempted),
    cost_actual_usd: cost,
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    failure_reasons: failure_reasons.length > 0 ? failure_reasons : undefined,
    api_key_preview: keyPreview,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Legacy single-call entrypoint — small case 그대로 사용 가능
 * (setup → 단일 batch → finalize).
 */
export async function runPhase4bVision(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bVisionStats> {
  const setup = await fetchPhase4bVisionInputs(supabase, case_id, sample);
  if (setup.skipped_reason && setup.inputs.length === 0) {
    return empty(setup.skipped_reason);
  }
  const batch = await processPhase4bVisionBatch(supabase, case_id, setup.inputs);
  return finalizePhase4bVision([batch], setup.total_sample_content_ids);
}

// =============================================================================
// helpers
// =============================================================================

async function fetchVisionInputs(
  supabase: SupaClient,
  case_id: string,
  contentIds: string[],
): Promise<VisionInput[]> {
  const inputs: VisionInput[] = [];
  const CHUNK = 200;

  for (let i = 0; i < contentIds.length; i += CHUNK) {
    const chunk = contentIds.slice(i, i + CHUNK);

    // contents의 caption 가져옴
    const { data: contents, error: cErr } = await supabase
      .from("contents")
      .select("id, caption")
      .in("id", chunk);
    if (cErr) throw new Error(`contents fetch: ${cErr.message}`);

    // case_video_analyses의 cover_url + asr_text
    // ★ WS1 (§3.3): vision_tags 이미 있는 행은 재태깅 제외 — 유료 결과 1회 원칙.
    const { data: analyses, error: aErr } = await supabase
      .from("case_video_analyses")
      .select("content_id, cover_url, asr_text")
      .eq("case_id", case_id)
      .in("content_id", chunk)
      .is("vision_tags", null);
    if (aErr) throw new Error(`analyses fetch: ${aErr.message}`);

    const captionById = new Map(
      (contents ?? []).map((c) => [c.id, c.caption]),
    );
    for (const a of analyses ?? []) {
      if (!a.cover_url || !a.content_id) continue;
      inputs.push({
        platform: "tiktok",
        content_id: a.content_id,
        external_ref: null,
        cover_url: a.cover_url,
        caption: captionById.get(a.content_id) ?? null,
        asr_text: a.asr_text,
      });
    }
  }
  return inputs;
}

/**
 * Stage 2 — IG/YT 영상의 vision input fetch.
 * sample.sample_items 의 platform='instagram'/'youtube' 항목 사용 (cover_url 보유).
 * IG cover re-host는 여기서 하지 않고 batch(processPhase4bVisionBatch)에서 처리.
 */
async function fetchVisionInputsIgYt(
  supabase: SupaClient,
  case_id: string,
  sampleItems: Array<{ platform: string; external_ref: string | null; cover_url: string | null }>,
): Promise<VisionInput[]> {
  const inputs: VisionInput[] = [];

  // ★ WS1 (§3.3): 이미 vision_tags 박힌 IG/YT external_ref는 재태깅 제외.
  //   (generated types에 platform/external_ref 미반영 — clusters와 같은 cast 우회)
  const sbLoose = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          neq: (col: string, v: string) => {
            not: (col: string, op: string, v: null) => Promise<{
              data: Array<{ platform: string; external_ref: string | null }> | null;
            }>;
          };
        };
      };
    };
  };
  const { data: taggedRows } = await sbLoose
    .from("case_video_analyses")
    .select("platform, external_ref")
    .eq("case_id", case_id)
    .neq("platform", "tiktok")
    .not("vision_tags", "is", null);
  const taggedIg = new Set(
    (taggedRows ?? [])
      .filter((r) => r.platform === "instagram" && r.external_ref)
      .map((r) => r.external_ref as string),
  );
  const taggedYt = new Set(
    (taggedRows ?? [])
      .filter((r) => r.platform === "youtube" && r.external_ref)
      .map((r) => r.external_ref as string),
  );

  const igRefs = sampleItems
    .filter((it) => it.platform === "instagram" && it.cover_url && it.external_ref)
    .filter((it) => !taggedIg.has(it.external_ref as string))
    .map((it) => ({ ref: it.external_ref as string, cover: it.cover_url as string }));
  const ytRefs = sampleItems
    .filter((it) => it.platform === "youtube" && it.cover_url && it.external_ref)
    .filter((it) => !taggedYt.has(it.external_ref as string))
    .map((it) => ({ ref: it.external_ref as string, cover: it.cover_url as string }));

  // IG caption fetch
  if (igRefs.length > 0) {
    const ids = igRefs.map((x) => x.ref);
    const { data: igRows } = await supabase
      .from("ig_posts")
      .select("ig_id, caption")
      .eq("case_id", case_id)
      .in("ig_id", ids);
    const capByIg = new Map((igRows ?? []).map((r) => [r.ig_id, r.caption]));
    for (const x of igRefs) {
      inputs.push({
        platform: "instagram",
        content_id: null,
        external_ref: x.ref,
        cover_url: x.cover,
        caption: capByIg.get(x.ref) ?? null,
        asr_text: null,
      });
    }
  }
  // YT title+description fetch
  if (ytRefs.length > 0) {
    const ids = ytRefs.map((x) => x.ref);
    const { data: ytRows } = await supabase
      .from("yt_videos")
      .select("yt_id, title, description")
      .eq("case_id", case_id)
      .in("yt_id", ids);
    const capByYt = new Map(
      (ytRows ?? []).map((r) => [r.yt_id, `${r.title ?? ""}\n${(r.description ?? "").slice(0, 200)}`.trim() || null]),
    );
    for (const x of ytRefs) {
      inputs.push({
        platform: "youtube",
        content_id: null,
        external_ref: x.ref,
        cover_url: x.cover,
        caption: capByYt.get(x.ref) ?? null,
        asr_text: null,
      });
    }
  }
  return inputs;
}

function empty(reason: string): Phase4bVisionStats {
  return {
    total_attempted: 0,
    total_with_tags: 0,
    total_failed: 0,
    total_no_cover: 0,
    cost_actual_usd: 0,
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
