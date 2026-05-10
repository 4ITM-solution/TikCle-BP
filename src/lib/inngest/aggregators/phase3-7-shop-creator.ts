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
/** Shop creator 데이터 TTL — 이 일수 지난 데이터는 lemur 재호출. */
const SHOP_CREATOR_TTL_DAYS = 30;

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
  /** 이 case scope의 모든 unique influencer ids (DB count 시 사용). candidates는 NULL 인플만 — 다름. */
  all_inflids: string[];
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
    return {
      total_inflids: 0,
      candidates: [],
      all_inflids: [],
      skipped_reason: "APIFY_TOKEN 미설정",
    };
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
      all_inflids: [],
      skipped_reason: "tiktok_shop 채널 아님 (skip)",
    };
  }
  // 비-US tiktok_shop은 lemur DB가 SEA/MENA TT Shop creator를 거의 안 가져
  // (Indonesia 케이스 9%만 매칭). 호출해봐야 무의미하니 skip하고 모든 인플을
  // shop creator로 가정 (SEA TT Shop은 사실상 모든 큰 활동 인플이 Shop 등록).
  if (c.country !== "US") {
    return {
      total_inflids: 0,
      candidates: [],
      all_inflids: [],
      skipped_reason: `비-US tiktok_shop (country=${c.country}) — lemur가 SEA/MENA TT Shop을 안 인덱싱해서 skip. 모든 인플을 Shop creator로 간주.`,
    };
  }

  const inflIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );
  if (inflIds.length === 0) {
    return {
      total_inflids: 0,
      candidates: [],
      all_inflids: [],
      skipped_reason: "인플 0명",
    };
  }

  // 후보: is_tiktok_shop_creator IS NULL (한 번도 판별 안 됨)
  // OR tiktok_shop_checked_at이 TTL일 전 (오래된 데이터 — 인플의 Shop 활동/GMV 변할 수 있음)
  const ttlCutoff = new Date(
    Date.now() - SHOP_CREATOR_TTL_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  const candidates: Array<{ id: string; handle: string }> = [];
  for (let i = 0; i < inflIds.length; i += FETCH_CHUNK) {
    const slice = inflIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("influencers")
      .select("id, handle, is_tiktok_shop_creator, tiktok_shop_checked_at")
      .in("id", slice)
      .or(
        `is_tiktok_shop_creator.is.null,tiktok_shop_checked_at.lt.${ttlCutoff}`,
      );
    if (error) throw new Error(`influencers fetch: ${error.message}`);
    for (const r of data ?? []) {
      if (r.handle) candidates.push({ id: r.id, handle: r.handle });
    }
  }

  if (candidates.length === 0) {
    return {
      total_inflids: inflIds.length,
      candidates: [],
      all_inflids: inflIds,
      skipped_reason: "이미 모든 인플 판별 완료",
    };
  }

  return {
    total_inflids: inflIds.length,
    candidates,
    all_inflids: inflIds,
  };
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
      // GMV / performance (lemur stats — Shop creator만 채워짐)
      lifetime_gmv_usd: item.lifetime_gmv_usd,
      gpm_usd: item.gpm_usd,
      post_rate: item.post_rate,
      total_brand_collabs: item.total_brand_collabs,
      top_brands: item.top_brands as never,
      shop_creator_gmv_range: item.gmv_range,
      // follower_count는 phase3.5도 박는 컬럼 — 응답에 있을 때만 update (덮어쓰기 방지)
      ...(item.follower_count != null
        ? { follower_count: item.follower_count }
        : {}),
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
 * Finalize — batch 결과 합산 + DB count로 stats 재산출.
 *
 * batch local 카운트는 update error로 누락 가능 (옛 ver: 3197/3719가 update fail로
 * stats total_shop=37만 박힘). DB의 is_tiktok_shop_creator 분포가 진실 — case scope
 * 전체 인플 풀에서 직접 count.
 */
export async function finalizePhase37(
  supabase: SupaClient,
  setup: Phase37Setup,
  batchResults: Phase37BatchResult[],
): Promise<Phase37Stats> {
  if (setup.skipped_reason) {
    return empty37(setup.skipped_reason);
  }

  let total_update_errors = 0;
  let totalCost = 0;
  const sample_update_errors: string[] = [];
  let debug_first_item_keys: string[] | undefined;
  let debug_first_item_sample: string | undefined;

  for (const r of batchResults) {
    total_update_errors += r.total_update_errors_local;
    totalCost += r.cost_estimate_usd;
    for (const e of r.sample_update_errors) {
      if (sample_update_errors.length < 5) sample_update_errors.push(e);
    }
    if (!debug_first_item_keys && r.debug_first_item_keys) {
      debug_first_item_keys = r.debug_first_item_keys;
      debug_first_item_sample = r.debug_first_item_sample;
    }
  }

  // case scope 전체 인플 풀 (all_inflids) 기반 DB count.
  // 이게 사용자가 보고 싶은 "이 brand+country 인플 중 Shop인 사람 수".
  let total_shop = 0;
  let total_non_shop = 0;
  let total_null = 0;
  for (let i = 0; i < setup.all_inflids.length; i += FETCH_CHUNK) {
    const slice = setup.all_inflids.slice(i, i + FETCH_CHUNK);
    const { data } = await supabase
      .from("influencers")
      .select("is_tiktok_shop_creator")
      .in("id", slice);
    for (const r of data ?? []) {
      if (r.is_tiktok_shop_creator === true) total_shop += 1;
      else if (r.is_tiktok_shop_creator === false) total_non_shop += 1;
      else total_null += 1;
    }
  }

  return {
    total_candidates: setup.all_inflids.length,
    total_attempted: setup.candidates.length,
    total_shop_creators: total_shop,
    total_non_shop,
    total_unmatched: total_null, // null = lemur 응답 없음 또는 update fail로 미반영
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
  return finalizePhase37(supabase, setup, [result]);
}
