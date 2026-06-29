import type { SupabaseClient } from "@supabase/supabase-js";
import { tagAdCreative } from "@/lib/anthropic/ad-creative-tagger";
import { calcVisionCost } from "@/lib/anthropic/vision-tagger";
import { parseCreatorFromUtm } from "../meta-utm";

/**
 * Phase 4a.6 — 광고 크리에이티브 인텔리전스
 *
 *  1) UTM 파싱 → inferred_creator_handle (1회, 무료)
 *  2) 썸네일+캡션 → Sonnet Vision → ad_intel (origin/format/hook/5축)
 *
 * ⚠️ 비전은 광고가 많으면(Medicube 300+) 한 step.run에서 다 돌리면 Vercel
 *    maxDuration(800s) 초과 → 중간에 죽음. 그래서 **미태깅(ad_intel IS NULL)만
 *    limit씩 배치**로 처리하고, run-analysis가 batch step을 루프로 호출(멱등·재개 가능).
 */

const VISION_CONCURRENCY = 5;

type SupaClient = SupabaseClient;

export type Phase4aUtmStats = {
  total_ads: number;
  utm_handles: number;
  computed_at: string;
};

export type Phase4aVisionBatchStats = {
  vision_tagged: number;
  vision_failed: number;
  remaining: number; // 아직 태깅 안 된 thumbnail 광고 수 (이번 배치 후)
  cost_usd: number;
  tokens_input: number;
  tokens_output: number;
  skipped_reason?: string;
};

/** UTM에서 소스 크리에이터 핸들 파싱 (전체 1회). 이미 채워진 건 스킵. */
export async function runPhase4aUtm(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4aUtmStats> {
  const now = new Date().toISOString();
  const { data: rows } = await supabase
    .from("meta_ads")
    .select("id, link_url")
    .eq("case_id", case_id)
    .is("inferred_creator_handle", null)
    .not("link_url", "is", null);
  const ads = rows ?? [];
  let utmHandles = 0;
  for (const ad of ads as Array<{ id: string; link_url: string | null }>) {
    const handle = parseCreatorFromUtm(ad.link_url);
    if (handle) {
      utmHandles += 1;
      await supabase
        .from("meta_ads")
        .update({ inferred_creator_handle: handle })
        .eq("id", ad.id);
    }
  }
  return { total_ads: ads.length, utm_handles: utmHandles, computed_at: now };
}

/**
 * 미태깅 광고(ad_intel IS NULL, thumbnail 있음)를 limit개만 비전 태깅.
 * run-analysis가 remaining===0 또는 진전 없을 때까지 반복 호출.
 */
export async function runPhase4aVisionBatch(
  supabase: SupaClient,
  case_id: string,
  limit: number,
): Promise<Phase4aVisionBatchStats> {
  const base = {
    vision_tagged: 0,
    vision_failed: 0,
    remaining: 0,
    cost_usd: 0,
    tokens_input: 0,
    tokens_output: 0,
  };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...base, skipped_reason: "ANTHROPIC_API_KEY 미설정" };
  }

  const { data: rows, error } = await supabase
    .from("meta_ads")
    .select("id, thumbnail_url, body_text, format, creator_page_name")
    .eq("case_id", case_id)
    .is("ad_intel", null)
    .not("thumbnail_url", "is", null)
    .limit(limit);
  if (error) return { ...base, skipped_reason: `fetch: ${error.message}` };
  const ads = (rows ?? []) as Array<{
    id: string;
    thumbnail_url: string | null;
    body_text: string | null;
    format: string | null;
    creator_page_name: string | null;
  }>;
  if (ads.length === 0) return base;

  let vision_tagged = 0;
  let vision_failed = 0;
  let tIn = 0,
    tOut = 0,
    tCacheR = 0,
    tCacheW = 0;

  for (let i = 0; i < ads.length; i += VISION_CONCURRENCY) {
    const slice = ads.slice(i, i + VISION_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((ad) =>
        tagAdCreative({
          thumbnail_url: ad.thumbnail_url as string,
          caption: ad.body_text,
          format: ad.format,
          is_partnership: !!ad.creator_page_name,
        }),
      ),
    );
    for (let j = 0; j < results.length; j += 1) {
      const ad = slice[j]!;
      const res = results[j];
      if (res?.status !== "fulfilled" || !res.value.intel) {
        vision_failed += 1;
        // 실패해도 sentinel로 마킹 → 다음 배치 재선택 방지(무한루프 차단)
        await supabase
          .from("meta_ads")
          .update({ ad_intel: { failed: true } as never })
          .eq("id", ad.id);
        if (res?.status === "fulfilled") {
          tIn += res.value.tokens_input;
          tOut += res.value.tokens_output;
          tCacheR += res.value.tokens_cache_read;
          tCacheW += res.value.tokens_cache_write;
        }
        continue;
      }
      tIn += res.value.tokens_input;
      tOut += res.value.tokens_output;
      tCacheR += res.value.tokens_cache_read;
      tCacheW += res.value.tokens_cache_write;
      const { error: uErr } = await supabase
        .from("meta_ads")
        .update({ ad_intel: res.value.intel as never })
        .eq("id", ad.id);
      if (uErr) vision_failed += 1;
      else vision_tagged += 1;
    }
  }

  // 남은 미태깅 수
  const { count: remaining } = await supabase
    .from("meta_ads")
    .select("id", { count: "exact", head: true })
    .eq("case_id", case_id)
    .is("ad_intel", null)
    .not("thumbnail_url", "is", null);

  return {
    vision_tagged,
    vision_failed,
    remaining: remaining ?? 0,
    cost_usd: calcVisionCost({
      tokens_input: tIn,
      tokens_output: tOut,
      tokens_cache_read: tCacheR,
      tokens_cache_write: tCacheW,
    }),
    tokens_input: tIn,
    tokens_output: tOut,
  };
}
