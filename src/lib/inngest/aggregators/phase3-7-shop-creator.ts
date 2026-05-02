import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { checkShopCreators } from "@/lib/apify/lemur-shop-creators";
import { fetchUniqueInfluencerIds } from "./phase3";
import type { Phase37Stats } from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_CHUNK = 200;

/**
 * Phase 3.7 — Shop Creator 판별 (tiktok_shop 채널 전용)
 *
 * 1. brand+country 인플루언서 중 is_tiktok_shop_creator IS NULL인 것 추출
 * 2. lemur/tiktok-shop-creators actor 호출 → handle별 Shop creator 여부 판별
 * 3. influencers 테이블 업데이트 (is_tiktok_shop_creator + shop_creator_class)
 *
 * 결과: Phase 4b.1이 tiktok_shop 케이스에서 sample을 shop creators로 좁힐 때 사용.
 *
 * 비용: ~$0.005/check (예: 400명 → ~$2)
 */
export async function runPhase37ShopCreator(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase37Stats> {
  if (!process.env.APIFY_TOKEN) {
    return empty37("APIFY_TOKEN 미설정");
  }

  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, channel, country")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  if (c.channel !== "tiktok_shop") {
    return empty37("tiktok_shop 채널 아님 (skip)");
  }

  // 1. 케이스 스코프 인플 ID
  const inflIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );
  if (inflIds.length === 0) {
    return empty37("인플 0명");
  }

  // 2. is_tiktok_shop_creator IS NULL인 후보만 추출
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
      total_candidates: 0,
      total_attempted: 0,
      total_shop_creators: 0,
      total_non_shop: 0,
      total_unmatched: 0,
      total_update_errors: 0,
      sample_update_errors: [],
      cost_actual_usd: 0,
      skipped_reason: "이미 모든 인플 판별 완료",
      computed_at: new Date().toISOString(),
    };
  }

  // 3. lemur 호출
  const handles = candidates.map((c) => c.handle);
  const result = await checkShopCreators({ handles });

  if (result.skipped_reason) {
    return {
      total_candidates: candidates.length,
      total_attempted: 0,
      total_shop_creators: 0,
      total_non_shop: 0,
      total_unmatched: candidates.length,
      total_update_errors: 0,
      sample_update_errors: [],
      cost_actual_usd: 0,
      skipped_reason: result.skipped_reason,
      computed_at: new Date().toISOString(),
    };
  }

  // 4. handle 정규화 → influencer_id 매핑
  const handleToId = new Map<string, string>();
  for (const c of candidates) {
    handleToId.set(c.handle.replace(/^@/, "").toLowerCase().trim(), c.id);
  }

  const now = new Date().toISOString();
  let total_shop = 0;
  let total_non_shop = 0;
  let total_update_errors = 0;
  const matchedIds = new Set<string>();
  const sample_update_errors: string[] = [];

  for (const item of result.items) {
    const inflId = handleToId.get(item.handle);
    if (!inflId) continue;
    matchedIds.add(inflId);

    // external_id 업데이트 제외 — unique constraint 충돌 가능. lemur user_id는 신뢰도 낮음.
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

  const total_unmatched = candidates.length - matchedIds.size;

  return {
    total_candidates: candidates.length,
    total_attempted: candidates.length,
    total_shop_creators: total_shop,
    total_non_shop: total_non_shop,
    total_unmatched,
    total_update_errors,
    sample_update_errors,
    cost_actual_usd: result.cost_estimate_usd,
    debug_first_item_keys: result.debug_first_item_keys,
    debug_first_item_sample: result.debug_first_item_sample,
    computed_at: new Date().toISOString(),
  };
}

function empty37(reason: string): Phase37Stats {
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
