import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcVisionCost,
  visionTagOne,
} from "@/lib/anthropic/vision-tagger";
import type { Phase4bVisionStats, Phase4bSampleStats } from "../types";

type SupaClient = SupabaseClient<Database>;

const VISION_CONCURRENCY = 5; // Anthropic API 동시 호출 수

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
  if (sample.sample_content_ids.length === 0) {
    return empty("샘플 0개");
  }

  // 1. 샘플 영상의 caption + ASR + cover 가져옴
  const inputs = await fetchVisionInputs(
    supabase,
    case_id,
    sample.sample_content_ids,
  );

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

      const { error } = await supabase
        .from("case_video_analyses")
        .upsert(
          {
            case_id,
            content_id: item.content_id,
            vision_tags: res.value.tags as never,
          },
          { onConflict: "case_id,content_id" },
        );
      if (error) {
        total_failed += 1;
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
  content_id: string;
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
      if (!a.cover_url) continue;
      inputs.push({
        content_id: a.content_id,
        cover_url: a.cover_url,
        caption: captionById.get(a.content_id) ?? null,
        asr_text: a.asr_text,
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
