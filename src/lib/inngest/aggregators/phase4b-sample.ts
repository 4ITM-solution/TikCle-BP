import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  Phase4bSampleStats,
  SampleEntry,
  SampleItemV2,
  SamplePickReason,
  TierBucket,
} from "../types";
import { classifyTier } from "./phase3";

type SupaClient = SupabaseClient<Database>;

const FETCH_PAGE = 1000;

// 기본 설정 (필요시 옵션으로 빼기)
const WINDOW_DAYS = 90;
const PER_TIER_COUNT = 50; // 6 tiers × 50 = 300
const SAVE_RATE_VIEWS_MIN = 10_000;
const SAVE_RATE_TOP_COUNT = 30;
const IG_SAMPLE_MAX = 500; // IG video top view 기준 sample
const YT_SAMPLE_MAX = 300; // YT top view 기준 sample

/**
 * Phase 4b.1 — Analysis Sample Selection
 *
 * 분석할 영상 ~300개 선정.
 *   - 최근 90일 (uploaded_at)
 *   - 티어별 조회수 top 50 (mega/macro/mid/micro/nano/sub-nano)
 *   - 추가: 뷰 10K+ 중 save_rate top 30 (위와 dedup)
 *
 * 결과: content_id 리스트를 key_stats.phase4b_sample에 저장 →
 * 다음 phase (ASR / Vision / 클러스터링)에서 이 리스트만 처리.
 */
export async function runPhase4bSample(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4bSampleStats> {
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, brand_id, country, channel")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - WINDOW_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  // 1. 최근 90일 contents 가져옴 (페이지네이션)
  const rawContents = await fetchRecentContents(
    supabase,
    c.brand_id,
    c.country,
    cutoffDate,
  );

  if (rawContents.length === 0) {
    return emptyStats(cutoffDate);
  }

  // 2. influencer_id → tier + shop_creator 여부 매핑 (influencers 조회)
  const uniqueInflIds = Array.from(
    new Set(rawContents.map((x) => x.influencer_id).filter((x): x is string => !!x)),
  );
  const inflMeta = await fetchInfluencerMeta(supabase, uniqueInflIds);

  // 3. tiktok_shop 케이스: shop creator인 인플의 콘텐츠만 남김
  //    (Phase 3.7에서 is_tiktok_shop_creator를 채워둠. null인 인플은 제외)
  const isTikTokShop = c.channel === "tiktok_shop";
  const contents = isTikTokShop
    ? rawContents.filter((row) => {
        if (!row.influencer_id) return false;
        const m = inflMeta.get(row.influencer_id);
        return m?.is_shop_creator === true;
      })
    : rawContents;

  // 4. 각 콘텐츠에 tier + save_rate 부여
  type WithMeta = (typeof rawContents)[number] & {
    tier: TierBucket;
    save_rate: number | null;
  };
  const enriched: WithMeta[] = contents.map((c) => {
    const meta = c.influencer_id ? inflMeta.get(c.influencer_id) : undefined;
    const tier = meta?.tier ?? "unknown";
    const save_rate =
      c.collect_count != null && c.views && c.views > 0
        ? c.collect_count / c.views
        : null;
    return { ...c, tier, save_rate };
  });

  // 4. 티어별 조회수 top N
  const tiers: TierBucket[] = [
    "mega",
    "macro",
    "mid",
    "micro",
    "nano",
    "sub-nano",
    "unknown",
  ];

  const picks = new Map<string, SampleEntry>();
  const reasonByContent = new Map<string, SamplePickReason>();

  for (const tier of tiers) {
    const tierItems = enriched
      .filter((e) => e.tier === tier && (e.views ?? 0) > 0)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, PER_TIER_COUNT);

    for (const e of tierItems) {
      if (picks.has(e.id)) continue;
      picks.set(e.id, toEntry(e, "tier_top_views"));
      reasonByContent.set(e.id, "tier_top_views");
    }
  }

  // 5. 뷰 10K+ 중 save_rate top 30 — 이미 picked인 건 스킵
  const saveRateCandidates = enriched
    .filter(
      (e) =>
        (e.views ?? 0) >= SAVE_RATE_VIEWS_MIN &&
        e.save_rate != null &&
        !picks.has(e.id),
    )
    .sort((a, b) => (b.save_rate ?? 0) - (a.save_rate ?? 0))
    .slice(0, SAVE_RATE_TOP_COUNT);

  for (const e of saveRateCandidates) {
    picks.set(e.id, toEntry(e, "high_save_rate"));
    reasonByContent.set(e.id, "high_save_rate");
  }

  // 6. 통계 산출
  const all = Array.from(picks.values());
  const by_tier: Record<TierBucket, number> = {
    mega: 0,
    macro: 0,
    mid: 0,
    micro: 0,
    nano: 0,
    "sub-nano": 0,
    unknown: 0,
  };
  const by_pick_reason: Record<SamplePickReason, number> = {
    tier_top_views: 0,
    high_save_rate: 0,
  };
  for (const e of all) {
    by_tier[e.tier] += 1;
    by_pick_reason[e.picked_by] += 1;
  }

  // UI 미리보기 (조회수 top 12)
  const preview = [...all]
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);

  // ─── Stage 2: IG/YT 영상도 sample (vision 통합 cluster 용) ───
  // IG: ig_posts 의 video_view_count desc top N
  const igItems: SampleItemV2[] = [];
  {
    const { data: igRows } = await supabase
      .from("ig_posts")
      .select("ig_id, url, display_url, video_url, video_view_count, video_play_count, likes_count")
      .eq("case_id", case_id)
      .order("video_view_count", { ascending: false, nullsFirst: false })
      .limit(IG_SAMPLE_MAX);
    for (const r of igRows ?? []) {
      if (!r.display_url) continue; // cover 없으면 vision X
      igItems.push({
        platform: "instagram",
        content_id: null,
        external_ref: r.ig_id,
        cover_url: r.display_url,
        video_url: r.video_url ?? null,
        url: r.url ?? "",
        views: r.video_view_count ?? r.video_play_count ?? r.likes_count ?? null,
      });
    }
  }
  // YT: yt_videos top view N
  const ytItems: SampleItemV2[] = [];
  {
    const { data: ytRows } = await supabase
      .from("yt_videos")
      .select("yt_id, url, thumbnail_url, view_count")
      .eq("case_id", case_id)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(YT_SAMPLE_MAX);
    for (const r of ytRows ?? []) {
      if (!r.thumbnail_url) continue;
      ytItems.push({
        platform: "youtube",
        content_id: null,
        external_ref: r.yt_id,
        cover_url: r.thumbnail_url,
        video_url: null,
        url: r.url ?? "",
        views: r.view_count ?? null,
      });
    }
  }
  // TK item — sample_items 안에도 박음 (vision phase 통합 처리용)
  const tkItems: SampleItemV2[] = all.map((e) => ({
    platform: "tiktok" as const,
    content_id: e.content_id,
    external_ref: null,
    cover_url: null, // ASR phase 끝나면 case_video_analyses 에 박힘
    video_url: null,
    url: e.url,
    views: e.views,
  }));
  const sample_items: SampleItemV2[] = [...tkItems, ...igItems, ...ytItems];

  return {
    total_picked: all.length,
    by_tier,
    by_pick_reason,
    window_days: WINDOW_DAYS,
    cutoff_date: cutoffDate,
    sample_content_ids: all.map((e) => e.content_id),
    sample_items,
    ig_sample_count: igItems.length,
    yt_sample_count: ytItems.length,
    preview,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

type ContentRow = {
  id: string;
  url: string;
  uploaded_at: string | null;
  views: number | null;
  collect_count: number | null;
  influencer_id: string | null;
};

async function fetchRecentContents(
  supabase: SupaClient,
  brand_id: string,
  country: string,
  cutoffDate: string,
): Promise<ContentRow[]> {
  const all: ContentRow[] = [];
  let from = 0;
  // Phase 4b.1 sample 은 TikTok 영상 한정 (Phase 4b.3 vision = TikTok cover_url 기반).
  // contents 테이블에 YouTube/IG URL 도 들어가는 케이스 (SharkNinja 등) 있어 명시적 filter.
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("id, url, uploaded_at, views, collect_count, influencer_id")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .gte("uploaded_at", cutoffDate)
      .ilike("url", "%tiktok.com%")
      .range(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(`contents recent fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return all;
}

type InflMeta = {
  tier: TierBucket;
  is_shop_creator: boolean | null;
};

async function fetchInfluencerMeta(
  supabase: SupaClient,
  ids: string[],
): Promise<Map<string, InflMeta>> {
  const map = new Map<string, InflMeta>();
  if (ids.length === 0) return map;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("influencers")
      .select("id, tier, follower_count, is_tiktok_shop_creator")
      .in("id", chunk);
    if (error) throw new Error(`infl meta lookup: ${error.message}`);
    for (const r of data ?? []) {
      const tier =
        (r.tier as TierBucket | null) ?? classifyTier(r.follower_count);
      map.set(r.id, {
        tier,
        is_shop_creator: r.is_tiktok_shop_creator,
      });
    }
  }
  return map;
}

function toEntry(
  e: {
    id: string;
    url: string;
    uploaded_at: string | null;
    views: number | null;
    collect_count: number | null;
    save_rate: number | null;
    tier: TierBucket;
  },
  reason: SamplePickReason,
): SampleEntry {
  return {
    content_id: e.id,
    url: e.url,
    tier: e.tier,
    views: e.views ?? 0,
    collect_count: e.collect_count,
    save_rate: e.save_rate,
    uploaded_at: e.uploaded_at,
    picked_by: reason,
  };
}

function emptyStats(cutoffDate: string): Phase4bSampleStats {
  return {
    total_picked: 0,
    by_tier: {
      mega: 0,
      macro: 0,
      mid: 0,
      micro: 0,
      nano: 0,
      "sub-nano": 0,
      unknown: 0,
    },
    by_pick_reason: { tier_top_views: 0, high_save_rate: 0 },
    window_days: WINDOW_DAYS,
    cutoff_date: cutoffDate,
    sample_content_ids: [],
    preview: [],
    computed_at: new Date().toISOString(),
  };
}
