import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { lookupInfluencerFans } from "@/lib/influencer-db/lookup";
import type {
  Phase2Stats,
  Phase3Stats,
  TierBucket,
  TierDistribution,
  TopCreator,
} from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_PAGE = 1000;

/**
 * Phase 3 — Influencer Lookup & Tier Classification (v1)
 *
 * 1. brand+country 스코프의 contents에서 unique influencer 추출
 * 2. 외부 DB 룩업 → fans 가져옴 (influencer_db_tt)
 * 3. tier 분류 (Mega/Macro/Mid/Micro/Nano/Sub-nano/unknown)
 * 4. influencers 테이블 업데이트
 * 5. 티어 분포 + Phase 2의 top_creators 보강
 *
 * v1 한계: clockworks 폴백 없음 (DB에 없는 핸들은 unknown)
 *         lemur shop creator 필터 없음 (TikTok Shop 케이스만 필요)
 */
export async function runPhase3(
  supabase: SupaClient,
  case_id: string,
  existingPhase2: Phase2Stats,
): Promise<{ phase3: Phase3Stats; updatedTopCreators: TopCreator[] }> {
  // 1. 케이스 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, brand_id, country")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  // 2. brand+country 스코프 contents에서 unique influencer_id 추출
  const uniqueInfluencerIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );

  if (uniqueInfluencerIds.length === 0) {
    return {
      phase3: emptyPhase3(),
      updatedTopCreators: existingPhase2.top_creators,
    };
  }

  // 3. influencers 테이블에서 핸들 + 기존 fans 정보 조회
  const influencers = await fetchInfluencers(supabase, uniqueInfluencerIds);

  // 4. fans 정보 없는 핸들 추출 (룩업 대상)
  const needLookup = influencers.filter(
    (i) => i.follower_count == null || i.fans_source == null,
  );
  const lookupHandles = needLookup.map((i) => i.handle);

  // 5. 외부 DB 룩업 (fans + Shop 여부 동시)
  const lookupMap = await lookupInfluencerFans(lookupHandles);

  // 6. influencers 업데이트 (룩업 성공한 것만)
  const now = new Date().toISOString();
  const updates = needLookup
    .filter((i) => lookupMap.has(i.handle))
    .map((i) => {
      const r = lookupMap.get(i.handle)!;
      const tier =
        r.follower_count != null ? classifyTier(r.follower_count) : null;
      // DB enum은 mega/macro/mid/micro/nano만 — sub-nano와 unknown은 NULL
      const dbTier =
        tier === null || tier === "unknown" || tier === "sub-nano" ? null : tier;
      return {
        id: i.id,
        follower_count: r.follower_count,
        tier: dbTier,
        fans_source: "influencer_db_tt" as const,
        is_tiktok_shop_creator: r.is_tiktok_shop_creator,
        tiktok_shop_checked_at:
          r.is_tiktok_shop_creator !== null ? now : null,
      };
    });

  for (const u of updates) {
    const { error } = await supabase
      .from("influencers")
      .update({
        follower_count: u.follower_count,
        tier: u.tier,
        fans_source: u.fans_source,
        is_tiktok_shop_creator: u.is_tiktok_shop_creator,
        tiktok_shop_checked_at: u.tiktok_shop_checked_at,
      })
      .eq("id", u.id);
    if (error) {
      throw new Error(
        `influencer update ${u.id}: ${error.message || JSON.stringify(error)}`,
      );
    }
  }

  // 7. 최종 분포 계산 (전체 influencer 재조회로 fresh 데이터)
  const allInfluencers = await fetchInfluencers(supabase, uniqueInfluencerIds);
  // 7-1. 월별 활동 인플 집계 (각 월에 영상 1개라도 만든 unique 인플)
  const activityByMonth = await fetchInfluencerActivityByMonth(
    supabase,
    c.brand_id,
    c.country,
  );
  const phase3 = computePhase3Stats(allInfluencers, activityByMonth);

  // 8. Phase 2의 top_creators에 fans 보강
  const updatedTopCreators = existingPhase2.top_creators.map((tc) => {
    const i = allInfluencers.find((x) => x.handle === tc.handle);
    return {
      ...tc,
      follower_count: i?.follower_count ?? tc.follower_count,
    };
  });

  return { phase3, updatedTopCreators };
}

// =============================================================================
// helpers
// =============================================================================

export async function fetchUniqueInfluencerIds(
  supabase: SupaClient,
  brand_id: string,
  country: string,
): Promise<string[]> {
  const set = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("influencer_id")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .not("influencer_id", "is", null)
      .range(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(`contents.influencer_id fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.influencer_id) set.add(r.influencer_id);
    }
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return Array.from(set);
}

/**
 * 월별 활동 인플 집계.
 * 각 월(YYYY-MM)에 영상 1개라도 만든 unique influencer_id의 Set.
 * 한 인플이 같은 달에 5개 영상 만들어도 1번만 카운트.
 */
export async function fetchInfluencerActivityByMonth(
  supabase: SupaClient,
  brand_id: string,
  country: string,
): Promise<Map<string, Set<string>>> {
  const byMonth = new Map<string, Set<string>>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("influencer_id, uploaded_at")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .not("influencer_id", "is", null)
      .not("uploaded_at", "is", null)
      .range(from, from + FETCH_PAGE - 1);
    if (error)
      throw new Error(`contents activity fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.influencer_id || !r.uploaded_at) continue;
      const month = String(r.uploaded_at).slice(0, 7); // "YYYY-MM"
      if (!byMonth.has(month)) byMonth.set(month, new Set());
      byMonth.get(month)!.add(r.influencer_id);
    }
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return byMonth;
}

export type InfluencerRow = {
  id: string;
  handle: string;
  follower_count: number | null;
  fans_source: string | null;
  tier: string | null;
};

export async function fetchInfluencers(
  supabase: SupaClient,
  ids: string[],
): Promise<InfluencerRow[]> {
  const all: InfluencerRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("influencers")
      .select("id, handle, follower_count, fans_source, tier")
      .in("id", chunk);
    if (error) {
      throw new Error(
        `influencer fetch chunk ${i}: ${error.message || JSON.stringify(error)}`,
      );
    }
    all.push(...(data ?? []));
  }
  return all;
}

/**
 * 사용자 정의 임계값:
 *   Mega ≥ 1M / Macro ≥ 500K / Mid ≥ 100K / Micro ≥ 10K / Nano ≥ 1K
 *   0~999 = sub-nano (fans 알지만 작음)
 *   null  = unknown (외부 DB 매칭 실패)
 *   둘 다 DB tier 컬럼엔 NULL로 저장 (enum에 없음).
 */
export function classifyTier(fans: number | null): TierBucket {
  if (fans == null) return "unknown";
  if (fans >= 1_000_000) return "mega";
  if (fans >= 500_000) return "macro";
  if (fans >= 100_000) return "mid";
  if (fans >= 10_000) return "micro";
  if (fans >= 1_000) return "nano";
  return "sub-nano";
}

function emptyTierDist(): TierDistribution {
  return {
    mega: 0,
    macro: 0,
    mid: 0,
    micro: 0,
    nano: 0,
    "sub-nano": 0,
    unknown: 0,
  };
}

function tierOf(i: InfluencerRow): TierBucket {
  // DB tier가 있으면 그걸 우선, 없으면 fans 기반 재분류
  // (sub-nano는 DB에 NULL로 저장되니 fans로 재계산해야 unknown과 구분됨)
  return i.tier ? (i.tier as TierBucket) : classifyTier(i.follower_count);
}

export function computePhase3Stats(
  influencers: InfluencerRow[],
  activityByMonth?: Map<string, Set<string>>,
): Phase3Stats {
  const dist = emptyTierDist();
  const sources = {
    influencer_db_tt: 0,
    apify_clockworks: 0,
    manual: 0,
    other: 0,
  };
  let withFans = 0;

  // 인플 ID → tier 매핑 (월별 집계에서 재사용)
  const tierByInfluencerId = new Map<string, TierBucket>();

  for (const i of influencers) {
    const tier = tierOf(i);
    tierByInfluencerId.set(i.id, tier);
    if (dist[tier] !== undefined) {
      dist[tier] += 1;
    } else {
      dist.unknown += 1;
    }
    if (i.follower_count != null) withFans += 1;

    if (i.fans_source === "influencer_db_tt") sources.influencer_db_tt += 1;
    else if (i.fans_source === "apify_clockworks") sources.apify_clockworks += 1;
    else if (i.fans_source === "manual") sources.manual += 1;
    else if (i.fans_source) sources.other += 1;
  }

  // 월별 unique 인플 분포 (전체 분포와 동일한 인플 unique 단위 기준)
  let tier_dist_by_month: Record<string, TierDistribution> | undefined;
  if (activityByMonth && activityByMonth.size > 0) {
    tier_dist_by_month = {};
    for (const [month, infIds] of activityByMonth.entries()) {
      const m = emptyTierDist();
      for (const id of infIds) {
        const t = tierByInfluencerId.get(id) ?? "unknown";
        m[t] = (m[t] ?? 0) + 1;
      }
      tier_dist_by_month[month] = m;
    }
  }

  return {
    tier_distribution: dist,
    total_creators: influencers.length,
    total_with_fans: withFans,
    total_unknown: dist.unknown,
    fans_sources: sources,
    tier_dist_by_month,
    computed_at: new Date().toISOString(),
  };
}

function emptyPhase3(): Phase3Stats {
  return {
    tier_distribution: {
      mega: 0,
      macro: 0,
      mid: 0,
      micro: 0,
      nano: 0,
      "sub-nano": 0,
      unknown: 0,
    },
    total_creators: 0,
    total_with_fans: 0,
    total_unknown: 0,
    fans_sources: {
      influencer_db_tt: 0,
      apify_clockworks: 0,
      manual: 0,
      other: 0,
    },
    computed_at: new Date().toISOString(),
  };
}
