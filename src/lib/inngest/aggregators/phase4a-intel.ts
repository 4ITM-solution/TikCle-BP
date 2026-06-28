import type { SupabaseClient } from "@supabase/supabase-js";
import { tagAdCreative } from "@/lib/anthropic/ad-creative-tagger";
import { calcVisionCost } from "@/lib/anthropic/vision-tagger";
import { parseCreatorFromUtm } from "../meta-utm";

/**
 * Phase 4a.5 — 광고 크리에이티브 인텔리전스
 *
 * 케이스의 meta_ads 각 광고에 대해:
 *  1) UTM 파싱 → inferred_creator_handle (브랜드직접 UGC 출처 힌트, 무료)
 *  2) 썸네일 + 캡션 → Sonnet Vision → ad_intel (origin/format/hook/5축 신호)
 *
 * 효율(active_days)과 교차 집계되어 winner/loser 패턴을 만든다.
 * 비전 호출은 thumbnail_url 있는 광고만. 동시성 제한 + 캐시 프롬프트.
 */

const VISION_CONCURRENCY = 5;

type SupaClient = SupabaseClient;

type AdRow = {
  id: string;
  ad_archive_id: string | null;
  thumbnail_url: string | null;
  body_text: string | null;
  format: string | null;
  link_url: string | null;
  creator_page_name: string | null;
};

export type Phase4aIntelStats = {
  total_ads: number;
  utm_handles: number;
  vision_tagged: number;
  vision_failed: number;
  cost_usd: number;
  tokens_input: number;
  tokens_output: number;
  skipped_reason?: string;
  computed_at: string;
};

export async function runPhase4aIntel(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4aIntelStats> {
  const now = new Date().toISOString();
  const empty = (reason: string): Phase4aIntelStats => ({
    total_ads: 0,
    utm_handles: 0,
    vision_tagged: 0,
    vision_failed: 0,
    cost_usd: 0,
    tokens_input: 0,
    tokens_output: 0,
    skipped_reason: reason,
    computed_at: now,
  });

  const { data: rows, error } = await supabase
    .from("meta_ads")
    .select(
      "id, ad_archive_id, thumbnail_url, body_text, format, link_url, creator_page_name",
    )
    .eq("case_id", case_id);
  if (error) return empty(`meta_ads fetch: ${error.message}`);
  const ads = (rows ?? []) as AdRow[];
  if (ads.length === 0) return empty("광고 0개");

  // 1) UTM 파싱 (전체, 무료) — inferred_creator_handle 업데이트
  let utmHandles = 0;
  for (const ad of ads) {
    const handle = parseCreatorFromUtm(ad.link_url);
    if (handle) {
      utmHandles += 1;
      await supabase
        .from("meta_ads")
        .update({ inferred_creator_handle: handle })
        .eq("id", ad.id);
    }
  }

  // 2) 비전 태깅 — thumbnail 있는 광고만
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ...empty("ANTHROPIC_API_KEY 미설정 (UTM만 처리)"),
      total_ads: ads.length,
      utm_handles: utmHandles,
    };
  }
  const taggable = ads.filter((a) => a.thumbnail_url);

  let vision_tagged = 0;
  let vision_failed = 0;
  let tIn = 0;
  let tOut = 0;
  let tCacheR = 0;
  let tCacheW = 0;

  for (let i = 0; i < taggable.length; i += VISION_CONCURRENCY) {
    const slice = taggable.slice(i, i + VISION_CONCURRENCY);
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
      if (res?.status !== "fulfilled") {
        vision_failed += 1;
        continue;
      }
      tIn += res.value.tokens_input;
      tOut += res.value.tokens_output;
      tCacheR += res.value.tokens_cache_read;
      tCacheW += res.value.tokens_cache_write;
      if (!res.value.intel) {
        vision_failed += 1;
        continue;
      }
      const { error: uErr } = await supabase
        .from("meta_ads")
        .update({ ad_intel: res.value.intel as never })
        .eq("id", ad.id);
      if (uErr) {
        vision_failed += 1;
      } else {
        vision_tagged += 1;
      }
    }
  }

  return {
    total_ads: ads.length,
    utm_handles: utmHandles,
    vision_tagged,
    vision_failed,
    cost_usd: calcVisionCost({
      tokens_input: tIn,
      tokens_output: tOut,
      tokens_cache_read: tCacheR,
      tokens_cache_write: tCacheW,
    }),
    tokens_input: tIn,
    tokens_output: tOut,
    computed_at: now,
  };
}
