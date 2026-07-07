import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchTikTokVideos } from "@/lib/apify/clockworks-tiktok";
import {
  classifyTier,
  computePhase3Stats,
  computePhase3StatsWithMonthly,
  fetchInfluencers,
  fetchUniqueInfluencerIds,
  type InfluencerRow,
} from "./phase3";
import type { Phase35Stats, Phase3Stats, TopCreator } from "../types";

type SupaClient = SupabaseClient<Database>;

// 200 → 50: 단일 batch가 300s sync 한도 초과해 fail하는 케이스 방지.
// 1,988명 unknown 기준 200 batch = 10 (단일 fail 위험 큼) / 50 batch = 40 (안전).
const CLOCKWORKS_BATCH = 50;
const CONTENTS_FETCH_CHUNK = 200;

// WS5 §3 (DATA_감사 F2) — unknown 풀이 클 때만 "영상 N개 이상" 크리에이터로 enrich를
// 좁힌다 (전수 대비 소액으로 티어 분포 답 품질 대부분 확보). 소형 풀은 전수 유지.
const ENRICH_MIN_VIDEOS = Math.max(1, Number(process.env.BP_ENRICH_MIN_VIDEOS || 3));
const ENRICH_ALL_UNDER = Math.max(0, Number(process.env.BP_ENRICH_ALL_UNDER || 300));

/** unknown 풀 크기에 따른 이번 실행의 최소 영상 수 조건. */
function minVideosFor(unknownCount: number): number {
  return unknownCount <= ENRICH_ALL_UNDER ? 1 : ENRICH_MIN_VIDEOS;
}

/**
 * Phase 3.5 — Clockworks 폴백으로 unknown 인플 fans 채우기
 *
 * Step-level batch 처리 — orchestrator가 setup → batch loop → finalize 호출.
 */

export type Phase35Setup = {
  brand_id: string;
  country: string;
  unique_inflids: string[];
  unknown_url_pairs: Array<{ inflId: string; url: string }>;
  skipped_reason?: string;
};

export type Phase35BatchResult = {
  filled: number;
  cost: number;
  attempted: number;
};

/**
 * Setup 단계 — case 정보 + unknown 인플 영상 URL 수집.
 */
export async function fetchPhase35Setup(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase35Setup> {
  if (!process.env.APIFY_TOKEN) {
    return {
      brand_id: "",
      country: "",
      unique_inflids: [],
      unknown_url_pairs: [],
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }

  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const uniqueIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );
  if (uniqueIds.length === 0) {
    return {
      brand_id: c.brand_id,
      country: c.country,
      unique_inflids: [],
      unknown_url_pairs: [],
      skipped_reason: "인플 0명",
    };
  }

  const allInfluencers = await fetchInfluencers(supabase, uniqueIds);
  const unknowns = allInfluencers.filter((i) => i.follower_count == null);
  if (unknowns.length === 0) {
    return {
      brand_id: c.brand_id,
      country: c.country,
      unique_inflids: uniqueIds,
      unknown_url_pairs: [],
      skipped_reason: "Unknown 0명",
    };
  }

  const idToUrl = await fetchOneUrlPerInfluencer(
    supabase,
    c.brand_id,
    c.country,
    unknowns.map((u) => u.id),
  );
  const pairs: Array<{ inflId: string; url: string }> = [];
  for (const [inflId, url] of idToUrl.entries()) {
    pairs.push({ inflId, url });
  }
  if (pairs.length === 0) {
    return {
      brand_id: c.brand_id,
      country: c.country,
      unique_inflids: uniqueIds,
      unknown_url_pairs: [],
      skipped_reason: "URL 매핑 가능한 unknown 0명",
    };
  }

  return {
    brand_id: c.brand_id,
    country: c.country,
    unique_inflids: uniqueIds,
    unknown_url_pairs: pairs,
  };
}

/**
 * Batch 처리 — N URL씩 clockworks 호출 + influencers update.
 */
export async function processPhase35Batch(
  supabase: SupaClient,
  pairs: Array<{ inflId: string; url: string }>,
): Promise<Phase35BatchResult> {
  // video_id 기반 매칭 — clockworks가 webVideoUrl(canonical)로 반환해서
  // 우리가 보낸 contents.url(쿼리·trailing slash 등 변형)과 정확 매칭 안 되는 경우 많음.
  const videoIdOf = (u: string): string | null => {
    const m = u.match(/\/(?:video|photo)\/(\d+)/);
    return m?.[1] ?? null;
  };
  const idToInflId = new Map<string, string>();
  for (const p of pairs) {
    const vid = videoIdOf(p.url);
    if (vid) idToInflId.set(vid, p.inflId);
  }

  const result = await fetchTikTokVideos({
    postURLs: pairs.map((p) => p.url),
  });
  if (result.skipped_reason) {
    return { filled: 0, cost: 0, attempted: pairs.length };
  }

  let filled = 0;
  for (const item of result.items) {
    const vid = videoIdOf(item.url);
    const inflId = vid ? idToInflId.get(vid) : undefined;
    if (!inflId || item.fans == null) continue;

    const tier = classifyTier(item.fans);
    const dbTier = tier === "unknown" || tier === "sub-nano" ? null : tier;

    const updates: {
      follower_count: number;
      tier: string | null;
      fans_source: string;
      external_id?: string;
    } = {
      follower_count: item.fans,
      tier: dbTier,
      fans_source: "apify_clockworks",
    };
    if (item.user_id) updates.external_id = item.user_id;

    const { error } = await supabase
      .from("influencers")
      .update(updates)
      .eq("id", inflId);
    if (!error) filled += 1;
  }

  return {
    filled,
    cost: result.cost_estimate_usd,
    attempted: pairs.length,
  };
}

/**
 * Finalize — fresh phase3 stats + top_creators 보강.
 */
export async function finalizePhase35(
  supabase: SupaClient,
  setup: Phase35Setup,
  batchResults: Phase35BatchResult[],
  existingTopCreators: TopCreator[],
): Promise<{
  phase35: Phase35Stats;
  phase3Updated: Phase3Stats;
  topCreatorsUpdated: TopCreator[];
}> {
  if (setup.skipped_reason) {
    const allInfluencers =
      setup.unique_inflids.length > 0
        ? await fetchInfluencers(supabase, setup.unique_inflids)
        : [];
    // ★ phase3.5 skip 분기에서도 activityByMonth 포함된 phase3 계산 — 안 그러면
    //   wrap fallback 이 tier_dist_by_month 없는 phase3 만들어서 옛 phase3 결과 덮어씌움.
    //   (이전: SharkNinja / Anua 등 phase35.skipped_reason="Unknown 0명" 일 때
    //    A 차트 tier stack 데이터 잃음 — 사용자 캡쳐 1번 문제)
    const phase3Updated =
      setup.brand_id && setup.country
        ? await computePhase3StatsWithMonthly(
            supabase,
            setup.brand_id,
            setup.country,
            allInfluencers,
          )
        : undefined;
    return wrap(
      empty35(setup.skipped_reason),
      allInfluencers,
      existingTopCreators,
      phase3Updated,
    );
  }

  let total_filled = 0;
  let total_cost = 0;
  for (const r of batchResults) {
    total_filled += r.filled;
    total_cost += r.cost;
  }

  const updatedInfluencers = await fetchInfluencers(
    supabase,
    setup.unique_inflids,
  );
  const phase3Updated = await computePhase3StatsWithMonthly(
    supabase,
    setup.brand_id,
    setup.country,
    updatedInfluencers,
  );
  const topCreatorsUpdated = existingTopCreators.map((tc) => {
    const i = updatedInfluencers.find((x) => x.handle === tc.handle);
    return {
      ...tc,
      follower_count: i?.follower_count ?? tc.follower_count,
    };
  });

  const phase35: Phase35Stats = {
    total_unknown_before: setup.unknown_url_pairs.length,
    total_attempted: setup.unknown_url_pairs.length,
    total_filled,
    cost_actual_usd: total_cost,
    computed_at: new Date().toISOString(),
  };

  return { phase35, phase3Updated, topCreatorsUpdated };
}

/**
 * Legacy single-call entrypoint.
 */
export async function runPhase35Fans(
  supabase: SupaClient,
  case_id: string,
  existingTopCreators: TopCreator[],
): Promise<{
  phase35: Phase35Stats;
  phase3Updated: Phase3Stats;
  topCreatorsUpdated: TopCreator[];
}> {
  if (!process.env.APIFY_TOKEN) {
    return wrap(empty35("APIFY_TOKEN 미설정"), [], existingTopCreators);
  }

  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  // 1. 케이스 스코프 인플루언서
  const uniqueIds = await fetchUniqueInfluencerIds(
    supabase,
    c.brand_id,
    c.country,
  );
  if (uniqueIds.length === 0) {
    return wrap(empty35("인플 0명"), [], existingTopCreators);
  }

  // 2. 그 중 fans null인 unknown
  const allInfluencers = await fetchInfluencers(supabase, uniqueIds);
  const unknowns = allInfluencers.filter((i) => i.follower_count == null);
  if (unknowns.length === 0) {
    const phase3Updated = await computePhase3StatsWithMonthly(
      supabase,
      c.brand_id,
      c.country,
      allInfluencers,
    );
    return wrap(empty35("Unknown 0명"), allInfluencers, existingTopCreators, phase3Updated);
  }

  // 3. unknown → 영상 URL 1개씩 매핑
  const idToUrl = await fetchOneUrlPerInfluencer(
    supabase,
    c.brand_id,
    c.country,
    unknowns.map((u) => u.id),
  );
  const allUrls = Array.from(idToUrl.values());
  if (allUrls.length === 0) {
    return wrap(
      empty35("URL 매핑 가능한 unknown 0명"),
      allInfluencers,
      existingTopCreators,
    );
  }

  // 4. clockworks 배치 호출
  // video_id 기반 매칭 (clockworks canonical URL과 contents.url 변형 차이 우회)
  const videoIdOf = (u: string): string | null => {
    const m = u.match(/\/(?:video|photo)\/(\d+)/);
    return m?.[1] ?? null;
  };
  const idToInflId = new Map<string, string>();
  for (const [inflId, url] of idToUrl.entries()) {
    const vid = videoIdOf(url);
    if (vid) idToInflId.set(vid, inflId);
  }

  let totalCost = 0;
  let total_filled = 0;
  let skipReason: string | undefined;

  for (let i = 0; i < allUrls.length; i += CLOCKWORKS_BATCH) {
    const batch = allUrls.slice(i, i + CLOCKWORKS_BATCH);
    const result = await fetchTikTokVideos({ postURLs: batch });
    if (result.skipped_reason) {
      skipReason = result.skipped_reason;
      break;
    }
    totalCost += result.cost_estimate_usd;

    // 각 응답 → influencer 업데이트
    for (const item of result.items) {
      const vid = videoIdOf(item.url);
      const inflId = vid ? idToInflId.get(vid) : undefined;
      if (!inflId || item.fans == null) continue;

      const tier = classifyTier(item.fans);
      const dbTier =
        tier === "unknown" || tier === "sub-nano" ? null : tier;

      const updates: {
        follower_count: number;
        tier: string | null;
        fans_source: string;
        external_id?: string;
      } = {
        follower_count: item.fans,
        tier: dbTier,
        fans_source: "apify_clockworks",
      };
      if (item.user_id) updates.external_id = item.user_id;

      const { error } = await supabase
        .from("influencers")
        .update(updates)
        .eq("id", inflId);
      if (!error) total_filled += 1;
    }
  }

  // 5. fresh phase3 stats 재계산 + top_creators 보강
  const updatedInfluencers = await fetchInfluencers(supabase, uniqueIds);
  const phase3Updated = await computePhase3StatsWithMonthly(
    supabase,
    c.brand_id,
    c.country,
    updatedInfluencers,
  );
  const topCreatorsUpdated = existingTopCreators.map((tc) => {
    const i = updatedInfluencers.find((x) => x.handle === tc.handle);
    return {
      ...tc,
      follower_count: i?.follower_count ?? tc.follower_count,
    };
  });

  const phase35: Phase35Stats = {
    total_unknown_before: unknowns.length,
    total_attempted: allUrls.length,
    total_filled,
    cost_actual_usd: totalCost,
    skipped_reason: skipReason,
    computed_at: new Date().toISOString(),
  };

  return { phase35, phase3Updated, topCreatorsUpdated };
}

// =============================================================================
// helpers
// =============================================================================

/**
 * 각 인플의 영상 1개 URL을 contents에서 가져옴.
 * 최신 영상 우선 (uploaded_at desc) — 삭제 위험 적음.
 */
async function fetchOneUrlPerInfluencer(
  supabase: SupaClient,
  brand_id: string,
  country: string,
  inflIds: string[],
): Promise<Map<string, string>> {
  // WS5 §3: 대형 unknown 풀에서는 영상 minVideos개 미만 크리에이터를 enrich 대상에서
  // 제외 (조회당 과금이라 1~2편 단발 크리에이터는 티어 답 기여 대비 비용이 큼).
  const minVideos = minVideosFor(inflIds.length);
  const out = new Map<string, string>();
  const counts = new Map<string, number>();
  for (let i = 0; i < inflIds.length; i += CONTENTS_FETCH_CHUNK) {
    const slice = inflIds.slice(i, i + CONTENTS_FETCH_CHUNK);
    const { data, error } = await supabase
      .from("contents")
      .select("influencer_id, url, uploaded_at")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .in("influencer_id", slice)
      .order("uploaded_at", { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    for (const r of data ?? []) {
      if (!r.influencer_id || !r.url) continue;
      counts.set(r.influencer_id, (counts.get(r.influencer_id) ?? 0) + 1);
      if (out.has(r.influencer_id)) continue; // 첫 번째(최신)만
      out.set(r.influencer_id, r.url);
    }
  }
  if (minVideos > 1) {
    let dropped = 0;
    for (const [inflId, n] of counts.entries()) {
      if (n < minVideos && out.delete(inflId)) dropped += 1;
    }
    if (dropped > 0) {
      console.log(
        `[phase3.5] 조건부 enrich: 영상 ${minVideos}개 미만 ${dropped}명 제외 (대상 ${out.size}명 유지)`,
      );
    }
  }
  return out;
}

function empty35(reason: string): Phase35Stats {
  return {
    total_unknown_before: 0,
    total_attempted: 0,
    total_filled: 0,
    cost_actual_usd: 0,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}

function wrap(
  phase35: Phase35Stats,
  allInfluencers: InfluencerRow[],
  existingTopCreators: TopCreator[],
  phase3Updated?: Phase3Stats,
): {
  phase35: Phase35Stats;
  phase3Updated: Phase3Stats;
  topCreatorsUpdated: TopCreator[];
} {
  const phase3 =
    phase3Updated ??
    (allInfluencers.length > 0
      ? computePhase3Stats(allInfluencers)
      : emptyPhase3());
  return {
    phase35,
    phase3Updated: phase3,
    topCreatorsUpdated: existingTopCreators,
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
