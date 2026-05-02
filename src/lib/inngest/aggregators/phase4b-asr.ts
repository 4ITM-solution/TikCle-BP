import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchAndParseSubtitle,
  fetchTikTokVideos,
} from "@/lib/apify/clockworks-tiktok";
import { classifyTier } from "./phase3";
import type { Phase4bAsrStats, Phase4bSampleStats } from "../types";

type SupaClient = SupabaseClient<Database>;

const ASR_FETCH_CONCURRENCY = 10;
const CLOCKWORKS_BATCH = 200; // actor 한 번에 보내는 URL 수

/**
 * Phase 4b.2 — ASR Collection
 *
 * sample_content_ids의 영상을 clockworks로 호출 → ASR 자막 + author 메타 회수.
 * 결과:
 *   - case_video_analyses 테이블에 asr_text 저장
 *   - 부수효과: influencers의 fans / external_id (user_id) 채워짐
 */
export async function runPhase4bAsr(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bAsrStats> {
  if (sample.sample_content_ids.length === 0) {
    return empty("샘플 0개");
  }

  // 1. 샘플 영상 URL + influencer_id 매핑 가져오기
  const { data: contents, error: cErr } = await supabase
    .from("contents")
    .select("id, url, influencer_id")
    .in("id", sample.sample_content_ids);
  if (cErr) throw new Error(`contents fetch: ${cErr.message}`);
  if (!contents || contents.length === 0) return empty("contents 0개");

  const urlToContent = new Map(contents.map((c) => [c.url, c]));
  const allUrls = contents.map((c) => c.url);

  // 2. clockworks 호출 (배치)
  const allItems: Awaited<
    ReturnType<typeof fetchTikTokVideos>
  >["items"] = [];
  let totalCost = 0;
  let skipReason: string | undefined;

  for (let i = 0; i < allUrls.length; i += CLOCKWORKS_BATCH) {
    const batch = allUrls.slice(i, i + CLOCKWORKS_BATCH);
    const result = await fetchTikTokVideos({ postURLs: batch });
    if (result.skipped_reason) {
      skipReason = result.skipped_reason;
      break;
    }
    allItems.push(...result.items);
    totalCost += result.cost_estimate_usd;
  }

  if (skipReason) return empty(skipReason);

  // 3. ASR 텍스트 fetch (병렬, 동시 N개)
  const itemsWithAsr = await fetchAsrTexts(allItems);

  // 4. case_video_analyses에 저장 + influencers 보강
  let saved_asr = 0;
  let saved_cover = 0;
  let updated_fans = 0;
  let updated_user_id = 0;
  // 디버그: 첫 item의 키 구조
  const debug_first_item_keys: string[] = [];
  if (allItems[0]) {
    debug_first_item_keys.push(
      `cover_url=${allItems[0].cover_url ? "set" : "null"}`,
      `video_download_url=${allItems[0].video_download_url ? "set" : "null"}`,
      `asr_subtitle_url=${allItems[0].asr_subtitle_url ? "set" : "null"}`,
      `fans=${allItems[0].fans ?? "null"}`,
      `user_id=${allItems[0].user_id ?? "null"}`,
    );
  }

  for (const item of itemsWithAsr) {
    const content = urlToContent.get(item.url);
    if (!content) continue;

    // 4a. asr_text + cover_url + video_download_url 저장 (있는 것만)
    if (item.asr_text || item.cover_url || item.video_download_url) {
      const { error } = await supabase
        .from("case_video_analyses")
        .upsert(
          {
            case_id,
            content_id: content.id,
            asr_text: item.asr_text,
            cover_url: item.cover_url,
            video_download_url: item.video_download_url,
          },
          { onConflict: "case_id,content_id" },
        );
      if (error) {
        console.error("[phase4b-asr] upsert error:", error.message);
      } else {
        if (item.asr_text) saved_asr += 1;
        if (item.cover_url) saved_cover += 1;
      }
    }

    // 4b. influencer 보강 (fans + user_id)
    if (content.influencer_id && (item.fans != null || item.user_id)) {
      // 기존 정보 비교해서 업데이트할 게 있는 것만
      const { data: cur } = await supabase
        .from("influencers")
        .select("follower_count, fans_source, external_id, handle")
        .eq("id", content.influencer_id)
        .maybeSingle();

      const updates: {
        follower_count?: number | null;
        tier?: string | null;
        fans_source?: string | null;
        external_id?: string;
      } = {};

      // fans가 우리 DB에 없으면 채움
      if (
        item.fans != null &&
        (cur?.follower_count == null || cur.fans_source !== "influencer_db_tt")
      ) {
        const tier = classifyTier(item.fans);
        updates.follower_count = item.fans;
        updates.tier =
          tier === "unknown" || tier === "sub-nano" ? null : tier;
        updates.fans_source = "apify_clockworks";
        updated_fans += 1;
      }
      // external_id가 username으로 임시 저장돼있고 user_id를 받았으면 교체
      if (
        item.user_id &&
        cur?.external_id === cur?.handle &&
        cur?.external_id !== item.user_id
      ) {
        updates.external_id = item.user_id;
        updated_user_id += 1;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("influencers")
          .update(updates)
          .eq("id", content.influencer_id);
      }
    }
  }

  return {
    total_attempted: allItems.length,
    total_with_asr: saved_asr,
    total_with_cover: saved_cover,
    total_with_fans_updated: updated_fans,
    total_with_user_id_updated: updated_user_id,
    cost_actual_usd: totalCost,
    debug_first_item_keys,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

type ItemWithAsr = Awaited<ReturnType<typeof fetchTikTokVideos>>["items"][number] & {
  asr_text: string | null;
};

async function fetchAsrTexts(
  items: Awaited<ReturnType<typeof fetchTikTokVideos>>["items"],
): Promise<ItemWithAsr[]> {
  const results: ItemWithAsr[] = [];
  for (let i = 0; i < items.length; i += ASR_FETCH_CONCURRENCY) {
    const slice = items.slice(i, i + ASR_FETCH_CONCURRENCY);
    const fetched = await Promise.all(
      slice.map(async (it) => ({
        ...it,
        asr_text: it.asr_subtitle_url
          ? await fetchAndParseSubtitle(it.asr_subtitle_url)
          : null,
      })),
    );
    results.push(...fetched);
  }
  return results;
}

function empty(reason: string): Phase4bAsrStats {
  return {
    total_attempted: 0,
    total_with_asr: 0,
    total_with_cover: 0,
    total_with_fans_updated: 0,
    total_with_user_id_updated: 0,
    cost_actual_usd: 0,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
