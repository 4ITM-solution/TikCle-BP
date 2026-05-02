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

/**
 * Phase 4b.2 — ASR Collection
 *
 * Step-level batch 처리. Orchestrator가 50 URL씩 batch로 step.run 호출.
 * 각 step.run은 ~1-2분 (clockworks + ASR + DB upsert).
 */

export type Phase4bAsrSetup = {
  contents: Array<{ id: string; url: string; influencer_id: string | null }>;
  skipped_reason?: string;
};

export type Phase4bAsrBatchResult = {
  saved_asr: number;
  saved_cover: number;
  updated_fans: number;
  updated_user_id: number;
  cost: number;
  attempted: number;
  debug_keys: string[];
};

export async function fetchPhase4bAsrSetup(
  supabase: SupaClient,
  sample: Phase4bSampleStats,
): Promise<Phase4bAsrSetup> {
  if (sample.sample_content_ids.length === 0) {
    return { contents: [], skipped_reason: "샘플 0개" };
  }

  const { data, error } = await supabase
    .from("contents")
    .select("id, url, influencer_id")
    .in("id", sample.sample_content_ids);
  if (error) throw new Error(`contents fetch: ${error.message}`);
  if (!data || data.length === 0) {
    return { contents: [], skipped_reason: "contents 0개" };
  }
  return { contents: data };
}

export async function processPhase4bAsrBatch(
  supabase: SupaClient,
  case_id: string,
  contents: Array<{ id: string; url: string; influencer_id: string | null }>,
): Promise<Phase4bAsrBatchResult> {
  const urlToContent = new Map(contents.map((c) => [c.url, c]));
  const urls = contents.map((c) => c.url);

  const result = await fetchTikTokVideos({ postURLs: urls });
  if (result.skipped_reason) {
    return {
      saved_asr: 0,
      saved_cover: 0,
      updated_fans: 0,
      updated_user_id: 0,
      cost: 0,
      attempted: 0,
      debug_keys: [`skipped: ${result.skipped_reason}`],
    };
  }

  // ASR 텍스트 fetch (concurrent)
  const itemsWithAsr: Array<
    (typeof result.items)[number] & { asr_text: string | null }
  > = [];
  for (let i = 0; i < result.items.length; i += ASR_FETCH_CONCURRENCY) {
    const slice = result.items.slice(i, i + ASR_FETCH_CONCURRENCY);
    const fetched = await Promise.all(
      slice.map(async (it) => ({
        ...it,
        asr_text: it.asr_subtitle_url
          ? await fetchAndParseSubtitle(it.asr_subtitle_url)
          : null,
      })),
    );
    itemsWithAsr.push(...fetched);
  }

  let saved_asr = 0;
  let saved_cover = 0;
  let updated_fans = 0;
  let updated_user_id = 0;
  const debug_keys: string[] = [];
  if (result.items[0]) {
    debug_keys.push(
      `cover_url=${result.items[0].cover_url ? "set" : "null"}`,
      `video_download_url=${result.items[0].video_download_url ? "set" : "null"}`,
      `asr_subtitle_url=${result.items[0].asr_subtitle_url ? "set" : "null"}`,
      `fans=${result.items[0].fans ?? "null"}`,
    );
  }

  for (const item of itemsWithAsr) {
    const content = urlToContent.get(item.url);
    if (!content) continue;

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
      if (!error) {
        if (item.asr_text) saved_asr += 1;
        if (item.cover_url) saved_cover += 1;
      }
    }

    if (content.influencer_id && (item.fans != null || item.user_id)) {
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
    saved_asr,
    saved_cover,
    updated_fans,
    updated_user_id,
    cost: result.cost_estimate_usd,
    attempted: result.items.length,
    debug_keys,
  };
}

export function finalizePhase4bAsr(
  batchResults: Phase4bAsrBatchResult[],
  skippedReason?: string,
): Phase4bAsrStats {
  if (skippedReason) return empty(skippedReason);

  let total_attempted = 0;
  let total_with_asr = 0;
  let total_with_cover = 0;
  let total_with_fans_updated = 0;
  let total_with_user_id_updated = 0;
  let cost = 0;
  const debug_first_item_keys: string[] = [];

  for (const r of batchResults) {
    total_attempted += r.attempted;
    total_with_asr += r.saved_asr;
    total_with_cover += r.saved_cover;
    total_with_fans_updated += r.updated_fans;
    total_with_user_id_updated += r.updated_user_id;
    cost += r.cost;
    if (debug_first_item_keys.length === 0 && r.debug_keys.length > 0) {
      debug_first_item_keys.push(...r.debug_keys);
    }
  }

  return {
    total_attempted,
    total_with_asr,
    total_with_cover,
    total_with_fans_updated,
    total_with_user_id_updated,
    cost_actual_usd: cost,
    debug_first_item_keys,
    computed_at: new Date().toISOString(),
  };
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

/**
 * Legacy entrypoint — small case 그대로 사용 가능.
 */
export async function runPhase4bAsr(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bAsrStats> {
  const setup = await fetchPhase4bAsrSetup(supabase, sample);
  if (setup.skipped_reason) return empty(setup.skipped_reason);
  const result = await processPhase4bAsrBatch(supabase, case_id, setup.contents);
  return finalizePhase4bAsr([result]);
}
