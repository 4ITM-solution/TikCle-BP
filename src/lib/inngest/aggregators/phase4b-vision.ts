import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcVisionCost,
  visionTagOne,
} from "@/lib/anthropic/vision-tagger";
import { downloadAndStore } from "@/lib/storage/asset-downloader";
import type { Phase4bVisionStats, Phase4bSampleStats } from "../types";

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
 * 의존성:
 *   - sample_content_ids (Phase 4b.1)
 *   - case_video_analyses의 cover_url, asr_text (Phase 4b.2)
 *   - contents.caption
 *
 * 비용: 300 영상 × ~$0.012 = ~$3.5 (캐싱 포함)
 */
export async function runPhase4bVision(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bVisionStats> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return empty("ANTHROPIC_API_KEY 미설정");
  }
  if (sample.sample_content_ids.length === 0 && (sample.sample_items?.length ?? 0) === 0) {
    return empty("샘플 0개");
  }

  // 1. TK 샘플 영상의 caption + ASR + cover 가져옴
  const tkInputs = await fetchVisionInputs(
    supabase,
    case_id,
    sample.sample_content_ids,
  );
  // Stage 2: IG/YT sample 영상의 cover + caption
  const igYtInputs = sample.sample_items
    ? await fetchVisionInputsIgYt(supabase, case_id, sample.sample_items)
    : [];
  const inputs = [...tkInputs, ...igYtInputs];

  if (inputs.length === 0) {
    return empty("vision 입력 0개 (cover_url 누락)");
  }

  // 2. Vision 태깅 (병렬, 동시 N개)
  let total_attempted = 0;
  let total_with_tags = 0;
  let total_failed = 0;
  let total_no_cover = sample.sample_content_ids.length - inputs.length;
  let tokens_in = 0;
  let tokens_out = 0;
  let tokens_cache_r = 0;
  let tokens_cache_w = 0;
  const failure_reasons: Array<{ reason: string; cover_url?: string }> = [];

  for (let i = 0; i < inputs.length; i += VISION_CONCURRENCY) {
    const slice = inputs.slice(i, i + VISION_CONCURRENCY);
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
      total_attempted += 1;
      const item = slice[j]!;
      const res = results[j];
      if (res?.status !== "fulfilled") {
        total_failed += 1;
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
        total_failed += 1;
        continue;
      }

      // platform 별 upsert: TK 는 content_id 기반, IG/YT 는 platform+external_ref 기반
      // generated types 안 multi-platform 미반영 (옛 schema)이라 cast 우회.
      const isTk = item.platform === "tiktok";
      const sb = supabase as unknown as {
        from: (t: string) => {
          upsert: (
            v: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error } = isTk
        ? await sb.from("case_video_analyses").upsert(
            {
              case_id,
              content_id: item.content_id,
              platform: "tiktok",
              cover_url: item.cover_url,
              vision_tags: res.value.tags,
            },
            { onConflict: "case_id,content_id" },
          )
        : await sb.from("case_video_analyses").upsert(
            {
              case_id,
              platform: item.platform,
              external_ref: item.external_ref,
              cover_url: item.cover_url,
              vision_tags: res.value.tags,
            },
            { onConflict: "case_id,platform,external_ref" },
          );
      if (error) {
        total_failed += 1;
        console.error("[vision] upsert fail", {
          platform: item.platform,
          ref: item.external_ref ?? item.content_id,
          err: error.message,
        });
      } else {
        total_with_tags += 1;
      }
    }
  }

  const cost = calcVisionCost({
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    tokens_cache_write: tokens_cache_w,
  });

  // 디버그용: 사용 중인 키의 prefix(앞 16자) + suffix(뒤 6자) — 사용자가 console에서 매칭 검증
  const rawKey = process.env.ANTHROPIC_API_KEY ?? "";
  const keyPreview =
    rawKey.length > 0
      ? `${rawKey.slice(0, 16)}…${rawKey.slice(-6)} (len=${rawKey.length})`
      : "(empty)";

  return {
    total_attempted,
    total_with_tags,
    total_failed,
    total_no_cover,
    cost_actual_usd: cost,
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    failure_reasons: failure_reasons.length > 0 ? failure_reasons : undefined,
    api_key_preview: keyPreview,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

type VisionInput = {
  platform: "tiktok" | "instagram" | "youtube";
  content_id: string | null;
  external_ref: string | null;
  cover_url: string;
  caption: string | null;
  asr_text: string | null;
};

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
    const { data: analyses, error: aErr } = await supabase
      .from("case_video_analyses")
      .select("content_id, cover_url, asr_text")
      .eq("case_id", case_id)
      .in("content_id", chunk);
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
 * sample.sample_items 의 platform='instagram'/'youtube' 박힌 거 사용 (cover_url 박힘).
 */
async function fetchVisionInputsIgYt(
  supabase: SupaClient,
  case_id: string,
  sampleItems: Array<{ platform: string; external_ref: string | null; cover_url: string | null }>,
): Promise<VisionInput[]> {
  const inputs: VisionInput[] = [];
  const igRefs = sampleItems
    .filter((it) => it.platform === "instagram" && it.cover_url && it.external_ref)
    .map((it) => ({ ref: it.external_ref as string, cover: it.cover_url as string }));
  const ytRefs = sampleItems
    .filter((it) => it.platform === "youtube" && it.cover_url && it.external_ref)
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

    // IG cover는 cdninstagram.com 호스트 → Anthropic Vision의 URL fetch가
    // 인스타 robots.txt에 막혀 400 ("disallowed by robots.txt"). TikTok처럼
    // URL source 직행 불가. → 우리 서버가 다운로드해서 Supabase storage(case-assets)에
    // re-host 후 그 public URL을 Anthropic에 넘긴다 (supabase.co는 robots 차단 없음).
    // re-host 실패 시 원본 URL 폴백 (어차피 400 나지만 다른 IG는 계속 진행).
    const coverByRef = new Map<string, string>();
    for (let i = 0; i < igRefs.length; i += REHOST_CONCURRENCY) {
      const slice = igRefs.slice(i, i + REHOST_CONCURRENCY);
      const rehosted = await Promise.all(
        slice.map(async (x) => {
          const safeRef = x.ref.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
          const storageUrl = await downloadAndStore(
            supabase,
            x.cover,
            `vision-covers/${case_id}/ig_${safeRef}.jpg`,
            "image/jpeg",
          );
          return { ref: x.ref, url: storageUrl ?? x.cover };
        }),
      );
      for (const r of rehosted) coverByRef.set(r.ref, r.url);
    }

    for (const x of igRefs) {
      inputs.push({
        platform: "instagram",
        content_id: null,
        external_ref: x.ref,
        cover_url: coverByRef.get(x.ref) ?? x.cover,
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
