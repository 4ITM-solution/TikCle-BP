import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  checkShopCreators,
  type LemurShopCreatorItem,
} from "@/lib/apify/lemur-shop-creators";
import { fetchUniqueInfluencerIds } from "./phase3";
import type { Phase37Stats } from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_CHUNK = 200;

/**
 * Phase 3.7 — Shop Creator 판별 (tiktok_shop 채널 전용)
 *
 * 큰 후보군(수천 명)을 위한 step-level batch 처리:
 *   1. fetchPhase37Setup — case 정보 + candidate 리스트 수집 (빠름)
 *   2. processPhase37Batch — N명씩 lemur 호출 + DB update (~1-2분)
 *   3. finalizePhase37 — 통계 집계 (빠름)
 *
 * Orchestrator가 step.run으로 각 단계를 별도 invocation으로 실행 → 각 단계가
 * Vercel 함수 한도 내에 들어옴.
 */

export type Phase37Setup = {
  total_inflids: number;
  candidates: Array<{ id: string; handle: string }>;
  skipped_reason?: string;
};

export type Phase37BatchResult = {
  items: LemurShopCreatorItem[]; // lemur 응답 (handle별)
  raw_count: number;
  total_shop_local: number;
  total_non_shop_local: number;
  total_update_errors_local: number;
  sample_update_errors: string[];
  cost_estimate_usd: number;
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
};

/**
 * Setup 단계 — case 정보 + 판별 대상 후보군 수집.
 */
export async function fetchPhase37Setup(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase37Setup> {
  if (!process.env.APIFY_TOKEN) {
    return { total_inflids: 0, candidates: [], skipped_reason: "APIFY_TOKEN 미설정" };
  }

  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, channel, country")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  if (c.channel !== "tiktok_shop") {
    return {
      total_inflids: 0,
      candidates: [],
      skipped_reason: "tiktok_shop 채널 아님 (skip)",
    };
  }

  const inflIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );
  if (inflIds.length === 0) {
    return { total_inflids: 0, candidates: [], skipped_reason: "인플 0명" };
  }

  // is_tiktok_shop_creator IS NULL인 후보만
  const candidates: Array<{ id: string; handle: string }> = [];
  for (let i = 0; i < inflIds.length; i += FETCH_CHUNK) {
    const slice = inflIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("influencers")
      .select("id, handle, is_tiktok_shop_creator")
      .in("id", slice)
      .is("is_tiktok_shop_creator", null);
    if (error) throw new Error(`influencers fetch: ${error.message}`);
    for (const r of data ?? []) {
      if (r.handle) candidates.push({ id: r.id, handle: r.handle });
    }
  }

  if (candidates.length === 0) {
    return {
      total_inflids: inflIds.length,
      candidates: [],
      skipped_reason: "이미 모든 인플 판별 완료",
    };
  }

  return { total_inflids: inflIds.length, candidates };
}

/**
 * Batch 처리 — 핸들 N개에 대해 lemur 호출 + DB update.
 * Vercel 함수 한도(800s) 안에 충분히 들어가는 크기로 호출.
 */
export async function processPhase37Batch(
  supabase: SupaClient,
  candidates: Array<{ id: string; handle: string }>,
): Promise<Phase37BatchResult> {
  const handles = candidates.map((c) => c.handle);
  const result = await checkShopCreators({ handles });

  if (result.skipped_reason) {
    return {
      items: [],
      raw_count: 0,
      total_shop_local: 0,
      total_non_shop_local: 0,
      total_update_errors_local: 0,
      sample_update_errors: [`skipped: ${result.skipped_reason}`],
      cost_estimate_usd: 0,
      debug_first_item_keys: result.debug_first_item_keys,
      debug_first_item_sample: result.debug_first_item_sample,
    };
  }

  // handle → id 매핑
  const handleToId = new Map<string, string>();
  for (const c of candidates) {
    handleToId.set(c.handle.replace(/^@/, "").toLowerCase().trim(), c.id);
  }

  const now = new Date().toISOString();
  let total_shop = 0;
  let total_non_shop = 0;
  let total_update_errors = 0;
  const sample_update_errors: string[] = [];

  for (const item of result.items) {
    const inflId = handleToId.get(item.handle);
    if (!inflId) continue;

    const updates = {
      is_tiktok_shop_creator: item.is_shop_creator,
      shop_creator_class: item.shop_creator_class,
      tiktok_shop_checked_at: now,
    };

    const { error } = await supabase
      .from("influencers")
      .update(updates)
      .eq("id", inflId);
    if (error) {
      total_update_errors += 1;
      if (sample_update_errors.length < 5) {
        sample_update_errors.push(
          `${inflId.slice(0, 8)}: ${error.message.slice(0, 120)}`,
        );
      }
      continue;
    }

    if (item.is_shop_creator) total_shop += 1;
    else total_non_shop += 1;
  }

  return {
    items: result.items,
    raw_count: result.raw_count,
    total_shop_local: total_shop,
    total_non_shop_local: total_non_shop,
    total_update_errors_local: total_update_errors,
    sample_update_errors,
    cost_estimate_usd: result.cost_estimate_usd,
    debug_first_item_keys: result.debug_first_item_keys,
    debug_first_item_sample: result.debug_first_item_sample,
  };
}

/**
 * Finalize — 모든 batch 결과 합산 → Phase37Stats 반환.
 */
export function finalizePhase37(
  setup: Phase37Setup,
  batchResults: Phase37BatchResult[],
): Phase37Stats {
  if (setup.skipped_reason) {
    return empty37(setup.skipped_reason);
  }

  let total_shop = 0;
  let total_non_shop = 0;
  let total_update_errors = 0;
  let totalCost = 0;
  const matchedHandles = new Set<string>();
  const sample_update_errors: string[] = [];
  let debug_first_item_keys: string[] | undefined;
  let debug_first_item_sample: string | undefined;

  for (const r of batchResults) {
    total_shop += r.total_shop_local;
    total_non_shop += r.total_non_shop_local;
    total_update_errors += r.total_update_errors_local;
    totalCost += r.cost_estimate_usd;
    for (const item of r.items) matchedHandles.add(item.handle);
    for (const e of r.sample_update_errors) {
      if (sample_update_errors.length < 5) sample_update_errors.push(e);
    }
    if (!debug_first_item_keys && r.debug_first_item_keys) {
      debug_first_item_keys = r.debug_first_item_keys;
      debug_first_item_sample = r.debug_first_item_sample;
    }
  }

  const total_unmatched = setup.candidates.length - matchedHandles.size;

  return {
    total_candidates: setup.candidates.length,
    total_attempted: setup.candidates.length,
    total_shop_creators: total_shop,
    total_non_shop: total_non_shop,
    total_unmatched,
    total_update_errors,
    sample_update_errors,
    cost_actual_usd: totalCost,
    debug_first_item_keys,
    debug_first_item_sample,
    computed_at: new Date().toISOString(),
  };
}

export function empty37(reason: string): Phase37Stats {
  return {
    total_candidates: 0,
    total_attempted: 0,
    total_shop_creators: 0,
    total_non_shop: 0,
    total_unmatched: 0,
    total_update_errors: 0,
    sample_update_errors: [],
    cost_actual_usd: 0,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Legacy 단일 entrypoint — 작은 케이스에 그대로 사용 가능.
 * 큰 케이스는 orchestrator에서 fetchSetup → processBatch loop → finalize 패턴 사용.
 */
export async function runPhase37ShopCreator(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase37Stats> {
  const setup = await fetchPhase37Setup(supabase, case_id);
  if (setup.skipped_reason) return empty37(setup.skipped_reason);
  if (setup.candidates.length === 0) {
    return empty37("이미 모든 인플 판별 완료");
  }
  const result = await processPhase37Batch(supabase, setup.candidates);
  return finalizePhase37(setup, [result]);
}
