import Link from "next/link";
import { notFound } from "next/navigation";
import { createServer } from "@/lib/supabase/server";
import { ExolytSection } from "@/components/case-detail/ExolytSection";
import { BrandViewTrendsSection } from "@/components/case-detail/BrandViewTrendsSection";
import { YoutubeSeedingSection } from "@/components/case-detail/YoutubeSeedingSection";
import {
  AmazonSalesSection,
  type SkuRow,
} from "@/components/case-detail/AmazonSalesSection";
import { BsrSection } from "@/components/case-detail/BsrSection";
import { ShopdoraSection } from "@/components/case-detail/ShopdoraSection";
import { KalodataSection } from "@/components/case-detail/KalodataSection";
import { TiktokShopUsAffiliateSection } from "@/components/case-detail/TiktokShopUsAffiliateSection";
import { TiktokProductFinderSection } from "@/components/case-detail/TiktokProductFinderSection";
import { StartPhase15Button } from "@/components/case-detail/StartPhase15Button";
import { StartAnalysisButton } from "@/components/case-detail/StartAnalysisButton";
import { DeleteCaseButton } from "@/components/case-detail/DeleteCaseButton";
import { DevTestActions } from "@/components/case-detail/RunningPlaceholder";
import { MiniDashboard } from "@/components/case-detail/MiniDashboard";
import { PhaseProgressToggle } from "@/components/case-detail/PhaseProgressToggle";
import { SectionTOC } from "@/components/case-detail/SectionTOC";
import { AutoRefresh } from "@/components/case-detail/AutoRefresh";
import { RevenueTierPicker } from "@/components/case-detail/RevenueTierPicker";
import {
  TopGmvShopCreators,
  type TopGmvCreator,
} from "@/components/case-detail/TopGmvShopCreators";
import type { ShopGmvDistribution } from "@/components/case-detail/ShopCreatorGmvDistribution";
import {
  IgBrandMonitorSection,
  type IgAuthorRow,
  type IgPaidVideoRow,
  type IgSourceDist,
  type IgHashtagStat,
} from "@/components/case-detail/IgBrandMonitorSection";
import {
  IgPrepBox,
  type IgPrepDebug,
} from "@/components/case-detail/IgPrepBox";
import {
  IgPostlearnBox,
  type IgPostlearnDiff,
} from "@/components/case-detail/IgPostlearnBox";
import {
  YtBrandMonitorSection,
  type YtChannelRow,
  type YtPaidVideoRow,
  type YtSourceDist,
  type YtTypeDist,
} from "@/components/case-detail/YtBrandMonitorSection";
import {
  YtPrepBox,
  type YtPrepDebug,
} from "@/components/case-detail/YtPrepBox";
import {
  YtPostlearnBox,
  type YtPostlearnDiff,
} from "@/components/case-detail/YtPostlearnBox";
import type { IgConfig } from "@/lib/inngest/aggregators/phase4c-ig-monitor";
import type { YtConfig } from "@/lib/inngest/aggregators/phase4d-yt-monitor";
import { RegionScopeToggle } from "@/components/case-detail/RegionScopeToggle";
import {
  getRegionScope,
  isLikelyUs,
} from "@/lib/case-detail/region-filter";
import {
  monthlyTrend as buildMonthlyTrend,
  poolSummary as buildPoolSummary,
  tierDistributionIg,
  tierDistributionYt,
  type MonthlyBucket,
  type PoolSummary,
  type TierBucket,
} from "@/lib/case-detail/bp-analytics";
import type { KeyStats } from "@/lib/inngest/types";
import type {
  KalodataBrandKpi,
  KalodataCreatorXlsxRow,
  KalodataVideoRow,
  KalodataVideoXlsxRow,
  KalodataLiveRow,
} from "@/lib/parsers/kalodata";
import type {
  Phase2Stats,
  Phase3Stats,
  Phase35Stats,
  Phase37Stats,
  Phase4aStats,
  Phase4bAsrStats,
  Phase4bClusterStats,
  Phase4bSampleStats,
  Phase4bSkuStats,
  Phase4bVisionStats,
  Phase5Stats,
} from "@/lib/inngest/types";
import { estimateCost } from "@/lib/cost-estimate";
import { fetchExchangeRates } from "@/lib/case-detail/exchange-rates-server";
import { defaultCurrency } from "@/lib/case-detail/countries";

export const dynamic = "force-dynamic";

type ReusableInfo = {
  other_case_label: string;
  row_count: number;
};

export type MetaAdListItem = {
  id: string;
  ad_archive_id: string | null;
  page_name: string | null;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  body_text: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  is_brand_official: boolean;
  creator_page_name: string | null;
  partner_page_name: string | null;
  partner_page_id: string | null;
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServer();

  // 1. 케이스
  const { data: c, error } = await supabase
    .from("cases")
    .select(
      "id, country, channel, status, revenue_tier, brand_keyword, brand_meta_pages, tiktok_shop_store_url, ig_config, yt_config, options, key_stats, created_at, updated_at, brand:brands(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--color-accent)" }}>오류: {error.message}</p>
      </div>
    );
  }
  if (!c) notFound();
  const brand = (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)";
  const brand_id_q = await supabase
    .from("cases")
    .select("brand_id")
    .eq("id", id)
    .single();
  const brand_id = brand_id_q.data?.brand_id;

  // 2. 콘텐츠 적재 상태 (brand+country 스코프)
  const { count: contentCount } = brand_id
    ? await supabase
        .from("contents")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brand_id)
        .eq("country", c.country)
    : { count: 0 };

  const reusedAlready =
    !!c.options &&
    typeof c.options === "object" &&
    !Array.isArray(c.options) &&
    (c.options as Record<string, unknown>).exolyt_reused === true;

  // 3. 재사용 가능한 다른 케이스 찾기
  let reusable: ReusableInfo | null = null;
  if (
    brand_id &&
    (contentCount ?? 0) > 0 &&
    !reusedAlready &&
    // 현재 케이스에 직접 업로드된 적 없는 경우만 권유
    !((contentCount ?? 0) > 0 && c.status !== "draft")
  ) {
    const { data: otherCases } = await supabase
      .from("cases")
      .select("country, channel")
      .eq("brand_id", brand_id)
      .eq("country", c.country)
      .neq("id", id)
      .limit(1);
    if (otherCases && otherCases.length > 0) {
      const o = otherCases[0]!;
      reusable = {
        other_case_label: `${brand} · ${o.country} · ${o.channel}`,
        row_count: contentCount ?? 0,
      };
    }
  }

  // 4. SKU + BSR 상태 (Amazon · Shopee 케이스 — products/case_product_sales 기반)
  let skuRows: SkuRow[] = [];
  // asin/ext_id → 제품 메타 (서브카테고리·출시 시기). 매출 표에 표시용.
  const skuMeta: Record<
    string,
    { subcategory: string | null; launch_date: string | null }
  > = {};
  if (
    c.channel === "amazon" ||
    c.channel === "shopee" ||
    c.channel === "tiktok_shop"
  ) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, asin, external_product_id, name, product_url, country, subcategory, launch_date")
      .eq("case_id", c.id);

    for (const p of prods ?? []) {
      const k = p.asin ?? p.external_product_id;
      if (k) {
        skuMeta[k] = {
          subcategory: p.subcategory,
          launch_date: p.launch_date,
        };
      }
    }

    const productIds = (prods ?? []).map((p) => p.id);

    const { data: salesRows } = productIds.length
      ? await supabase
          .from("case_product_sales")
          .select("product_id, units_30d, revenue_30d, currency, period_end")
          .eq("case_id", c.id)
      : {
          data: [] as Array<{
            product_id: string;
            units_30d: number | null;
            revenue_30d: number | null;
            currency: string;
            period_end: string | null;
          }>,
        };

    // hasBsr 체크 — 각 product별로 sales_snapshot에 row가 있는지만 확인.
    // .select("product_id") 전체 fetch는 Supabase 기본 limit 1000에 걸려서
    // 시계열 row 합계가 1000 넘으면 일부 product가 빠지는 stale 버그 발생.
    // → product별로 head count query 7~10개 병렬이 정확하면서 payload도 작음.
    const bsrSet = new Set<string>();
    if (productIds.length > 0) {
      const checks = await Promise.all(
        productIds.map(async (pid) => {
          const { count } = await supabase
            .from("sales_snapshot")
            .select("*", { count: "exact", head: true })
            .eq("product_id", pid);
          return [pid, (count ?? 0) > 0] as const;
        }),
      );
      for (const [pid, has] of checks) {
        if (has) bsrSet.add(pid);
      }
    }
    const salesByProduct = new Map(
      (salesRows ?? []).map((s) => [
        s.product_id,
        { units_30d: s.units_30d, revenue_30d: s.revenue_30d, currency: s.currency },
      ]),
    );

    skuRows = (prods ?? [])
      .map((p) => {
        const sales = salesByProduct.get(p.id);
        // Shopee는 asin이 null이고 external_product_id가 식별자
        const identifier = p.asin ?? p.external_product_id ?? "";
        return {
          id: p.id,
          asin: identifier,
          external_product_id: p.external_product_id ?? null,
          name: p.name,
          url:
            p.product_url ??
            (p.asin ? `https://www.amazon.com/dp/${p.asin}` : null),
          units_30d: sales?.units_30d ?? null,
          revenue_30d: sales?.revenue_30d ?? null,
          currency: sales?.currency ?? "USD",
          country: p.country ?? null,
          hasBsr: bsrSet.has(p.id),
        };
      })
      .sort((a, b) => (b.revenue_30d ?? 0) - (a.revenue_30d ?? 0));
  }

  // 4b. Meta 광고 전체 list (UI에서 월별 필터/더보기에 사용).
  // Meta Ads는 채널 무관 — amazon/tiktok_shop/shopee 모두 같은 브랜드의 FB/IG
  // 광고 잡힘. (옛 코드는 amazon만 — SharkNinja TT Shop에서 Meta 광고 분석
  // 필요해서 가드 풀음 — 2026-05-27)
  let metaAdsList: MetaAdListItem[] = [];
  if (c.status === "ready") {
    const { data: ads } = await supabase
      .from("meta_ads")
      .select(
        "id, ad_archive_id, page_name, format, start_date, end_date, is_active, body_text, link_url, thumbnail_url, video_url, is_brand_official, creator_page_name, partner_page_name, partner_page_id",
      )
      .eq("case_id", c.id)
      .order("start_date", { ascending: false })
      .limit(2000);
    metaAdsList = (ads ?? []).map((a) => ({
      id: a.id,
      ad_archive_id: a.ad_archive_id ?? null,
      page_name: a.page_name ?? null,
      format: a.format ?? null,
      start_date: a.start_date ?? null,
      end_date: a.end_date ?? null,
      is_active: a.is_active ?? null,
      body_text: a.body_text ?? null,
      link_url: a.link_url ?? null,
      thumbnail_url: a.thumbnail_url ?? null,
      video_url: a.video_url ?? null,
      is_brand_official: a.is_brand_official ?? false,
      creator_page_name: a.creator_page_name ?? null,
      partner_page_name: a.partner_page_name ?? null,
      partner_page_id: a.partner_page_id ?? null,
    }));
  }

  // 4b-IG. Phase 4c (IG Brand Monitoring) — ig_config 있고 분석 끝났으면 데이터 fetch.
  // 카테고리 정의자 BP 분석용. cases.ig_config + ig_posts/ig_authors 정규화 테이블.
  const keyStats = (c.key_stats ?? {}) as KeyStats;
  const phase4cStats = keyStats.phase4c ?? null;
  const igConfig = (c.ig_config ?? null) as {
    ig_owned_usernames?: string[];
  } | null;

  // 4b-IG-prep. 자동 발굴 결과 (cases.options.ig_config_suggested).
  // 사용자가 IgPrepBox에서 "자동 발굴 시작" 누르면 박힘. accept 누르면 ig_config로 commit.
  const optionsObj = (c.options ?? {}) as Record<string, unknown>;
  const regionScope = getRegionScope(optionsObj);
  const igConfigSuggested =
    (optionsObj.ig_config_suggested as IgConfig | undefined) ?? null;
  const igPrepDebug =
    (optionsObj.ig_prep_debug as IgPrepDebug | undefined) ?? null;

  // 4b-IG-postlearn. 1차 phase4c 결과에서 자동 학습한 config.
  const igConfigLearned =
    (optionsObj.ig_config_learned as IgConfig | undefined) ?? null;
  const igPostlearnDiff =
    (optionsObj.ig_postlearn_diff as IgPostlearnDiff | undefined) ?? null;

  // 4b-YT. Phase 4d (YouTube Brand Monitoring) — phase4c와 같은 패턴.
  const phase4dStats = keyStats.phase4d ?? null;
  const ytConfig = (c.yt_config ?? null) as {
    yt_owned_channels?: string[];
  } | null;
  const ytOwnedChannels = ytConfig?.yt_owned_channels ?? [];
  const ytConfigSuggested =
    (optionsObj.yt_config_suggested as YtConfig | undefined) ?? null;
  const ytPrepDebug =
    (optionsObj.yt_prep_debug as YtPrepDebug | undefined) ?? null;
  const ytConfigLearned =
    (optionsObj.yt_config_learned as YtConfig | undefined) ?? null;
  const ytPostlearnDiff =
    (optionsObj.yt_postlearn_diff as YtPostlearnDiff | undefined) ?? null;

  let ytTopChannels: YtChannelRow[] = [];
  let ytTopPaidVideos: YtPaidVideoRow[] = [];
  let ytSourceDist: YtSourceDist[] = [];
  let ytTypeDist: YtTypeDist[] = [];
  let ytTierDist: TierBucket[] = [];
  let ytMonthlyTrend: MonthlyBucket[] = [];
  let ytPoolSummary: PoolSummary = {
    total_authors: 0,
    paid_authors: 0,
    owned_authors: 0,
    repeat_authors: 0,
    one_off_authors: 0,
    top5_views_share_pct: 0,
  };

  if (phase4dStats && !phase4dStats.skipped_reason) {
    try {
      const { data: chRaw } = await supabase
        .from("yt_channels")
        .select(
          "channel_name, channel_url, subscriber_count, total_videos, brand_matched_videos, paid_videos, shorts_count, longform_count, max_views, total_views, tier",
        )
        .eq("case_id", c.id)
        .order("max_views", { ascending: false, nullsFirst: false })
        .limit(regionScope === "us-only" ? 60 : 25);
      const filtered = (chRaw ?? []).filter((c2) =>
        regionScope === "us-only" ? isLikelyUs(null, c2.channel_name) : true,
      );
      ytTopChannels = filtered.slice(0, 25) as YtChannelRow[];
    } catch (e) {
      console.warn("[yt] top channels fail:", e);
    }

    try {
      const { data: paidRaw } = await supabase
        .from("yt_videos")
        .select(
          "id, yt_id, channel_name, title, description, view_count, like_count, paid_signal, monetization_status, url, thumbnail_url, type, duration_seconds",
        )
        .eq("case_id", c.id)
        .not("paid_signal", "is", null)
        .order("view_count", { ascending: false, nullsFirst: false })
        .limit(regionScope === "us-only" ? 30 : 12);
      const filtered = (paidRaw ?? []).filter((v) =>
        regionScope === "us-only"
          ? isLikelyUs(`${v.title ?? ""} ${v.description ?? ""}`, v.channel_name)
          : true,
      );
      ytTopPaidVideos = filtered.slice(0, 12) as YtPaidVideoRow[];
    } catch (e) {
      console.warn("[yt] top paid fail:", e);
    }

    try {
      const { data: srcRaw } = await supabase
        .from("yt_videos")
        .select("source, channel_name")
        .eq("case_id", c.id)
        .limit(5000);
      const srcMap = new Map<string, { videos: number; channels: Set<string> }>();
      for (const r of srcRaw ?? []) {
        if (!r.source) continue;
        let agg = srcMap.get(r.source);
        if (!agg) {
          agg = { videos: 0, channels: new Set() };
          srcMap.set(r.source, agg);
        }
        agg.videos += 1;
        if (r.channel_name) agg.channels.add(r.channel_name);
      }
      ytSourceDist = Array.from(srcMap.entries())
        .map(([source, v]) => ({ source, videos: v.videos, channels: v.channels.size }))
        .sort((a, b) => b.videos - a.videos);
    } catch (e) {
      console.warn("[yt] source dist fail:", e);
    }

    // YT tier 분포 + pool summary
    try {
      const { data: allCh } = await supabase
        .from("yt_channels")
        .select(
          "channel_name, channel_url, subscriber_count, max_views, paid_videos, brand_matched_videos, total_views",
        )
        .eq("case_id", c.id)
        .limit(5000);
      const filtered = (allCh ?? []).filter((c2) =>
        regionScope === "us-only" ? isLikelyUs(null, c2.channel_name) : true,
      );
      ytTierDist = tierDistributionYt(
        filtered.map((c2) => ({
          subscriber_count: c2.subscriber_count,
          brand_matched_videos: c2.brand_matched_videos ?? 0,
          paid_videos: c2.paid_videos ?? 0,
        })),
      );
      ytPoolSummary = buildPoolSummary(
        filtered.map((c2) => ({
          max_likes: c2.max_views,        // YT은 max_views로 proxy
          max_views: c2.max_views,
          paid_posts: c2.paid_videos ?? 0,
          brand_matched_posts: c2.brand_matched_videos ?? 0,
          total_views: c2.total_views,
          channel_name: c2.channel_name,
          channel_url: c2.channel_url ?? undefined,
        })),
        ytOwnedChannels,
      );
    } catch (e) {
      console.warn("[yt] tier/pool fail:", e);
    }

    // YT 월별 트렌드
    try {
      const { data: monthRaw } = await supabase
        .from("yt_videos")
        .select("uploaded_at, paid_signal, view_count, channel_name")
        .eq("case_id", c.id)
        .eq("brand_matched", true)
        .limit(5000);
      const filtered = (monthRaw ?? []).filter((r) =>
        regionScope === "us-only" ? isLikelyUs(null, r.channel_name) : true,
      );
      ytMonthlyTrend = buildMonthlyTrend(filtered);
    } catch (e) {
      console.warn("[yt] monthly trend fail:", e);
    }

    try {
      const { data: typeRaw } = await supabase
        .from("yt_videos")
        .select("type, paid_signal")
        .eq("case_id", c.id)
        .eq("brand_matched", true)
        .limit(5000);
      const typeMap = new Map<string, { count: number; paid: number }>();
      for (const r of typeRaw ?? []) {
        const t = r.type ?? "unknown";
        let agg = typeMap.get(t);
        if (!agg) {
          agg = { count: 0, paid: 0 };
          typeMap.set(t, agg);
        }
        agg.count += 1;
        if (r.paid_signal) agg.paid += 1;
      }
      ytTypeDist = Array.from(typeMap.entries())
        .map(([type, v]) => ({ type, count: v.count, paid: v.paid }))
        .sort((a, b) => b.count - a.count);
    } catch (e) {
      console.warn("[yt] type dist fail:", e);
    }
  }

  let igTopAuthors: IgAuthorRow[] = [];
  let igTierDist: TierBucket[] = [];
  let igMonthlyTrend: MonthlyBucket[] = [];
  let igPoolSummary: PoolSummary = {
    total_authors: 0,
    paid_authors: 0,
    owned_authors: 0,
    repeat_authors: 0,
    one_off_authors: 0,
    top5_views_share_pct: 0,
  };
  let igTopPaidVideos: IgPaidVideoRow[] = [];
  let igSourceDist: IgSourceDist[] = [];
  let igTopHashtags: IgHashtagStat[] = [];
  const igOwnedUsernames = igConfig?.ig_owned_usernames ?? [];

  if (phase4cStats && !phase4cStats.skipped_reason) {
    // 4개 fetch 모두 try/catch로 감싸서 일부 fail해도 page는 살아있게.
    try {
      // region_scope=us-only면 fetch 후 휴리스틱 필터. limit 늘려서 필터 후에도 25개 남게.
      const { data: authorsRaw } = await supabase
        .from("ig_authors")
        .select(
          "username, full_name, total_posts, brand_matched_posts, paid_posts, max_likes, max_views, total_likes, tier",
        )
        .eq("case_id", c.id)
        .order("max_likes", { ascending: false, nullsFirst: false })
        .limit(regionScope === "us-only" ? 60 : 25);
      const filtered = (authorsRaw ?? []).filter((a) =>
        regionScope === "us-only" ? isLikelyUs(null, a.username) : true,
      );
      igTopAuthors = filtered.slice(0, 25) as IgAuthorRow[];
    } catch (e) {
      console.warn("[ig] top authors fetch fail:", e);
    }

    try {
      const { data: paidRaw } = await supabase
        .from("ig_posts")
        .select(
          "id, owner_username, owner_full_name, caption, likes_count, comments_count, video_play_count, paid_signal, url, display_url, posted_at",
        )
        .eq("case_id", c.id)
        .not("paid_signal", "is", null)
        .order("video_play_count", { ascending: false, nullsFirst: false })
        .limit(regionScope === "us-only" ? 30 : 12);
      const filtered = (paidRaw ?? []).filter((v) =>
        regionScope === "us-only"
          ? isLikelyUs(v.caption, v.owner_username)
          : true,
      );
      igTopPaidVideos = filtered.slice(0, 12) as IgPaidVideoRow[];
    } catch (e) {
      console.warn("[ig] top paid videos fetch fail:", e);
    }

    try {
      // 큰 fetch 위험 — limit 5000으로 cap
      const { data: srcRaw } = await supabase
        .from("ig_posts")
        .select("source, owner_username")
        .eq("case_id", c.id)
        .limit(5000);
      const srcMap = new Map<
        string,
        { posts: number; authors: Set<string> }
      >();
      for (const r of srcRaw ?? []) {
        if (!r.source) continue;
        let agg = srcMap.get(r.source);
        if (!agg) {
          agg = { posts: 0, authors: new Set() };
          srcMap.set(r.source, agg);
        }
        agg.posts += 1;
        if (r.owner_username) agg.authors.add(r.owner_username);
      }
      igSourceDist = Array.from(srcMap.entries())
        .map(([source, v]) => ({
          source,
          posts: v.posts,
          authors: v.authors.size,
        }))
        .sort((a, b) => b.posts - a.posts);
    } catch (e) {
      console.warn("[ig] source dist fetch fail:", e);
    }

    // IG 풀 전체 (tier 분포 + pool summary용 — top 25뿐 아니라 모든 author)
    try {
      const { data: allAuthors } = await supabase
        .from("ig_authors")
        .select("username, max_likes, max_views, paid_posts, brand_matched_posts, total_likes")
        .eq("case_id", c.id)
        .limit(5000);
      const filtered = (allAuthors ?? []).filter((a) =>
        regionScope === "us-only" ? isLikelyUs(null, a.username) : true,
      );
      igTierDist = tierDistributionIg(
        filtered.map((a) => ({
          max_likes: a.max_likes,
          brand_matched_posts: a.brand_matched_posts ?? 0,
          paid_posts: a.paid_posts ?? 0,
        })),
      );
      igPoolSummary = buildPoolSummary(
        filtered.map((a) => ({
          max_likes: a.max_likes,
          max_views: a.max_views,
          paid_posts: a.paid_posts ?? 0,
          brand_matched_posts: a.brand_matched_posts ?? 0,
          total_likes: a.total_likes,
          username: a.username,
        })),
        igOwnedUsernames,
      );
    } catch (e) {
      console.warn("[ig] tier/pool fetch fail:", e);
    }

    // IG 월별 트렌드 (posted_at + paid_signal)
    try {
      const { data: monthRaw } = await supabase
        .from("ig_posts")
        .select("posted_at, paid_signal, likes_count, owner_username")
        .eq("case_id", c.id)
        .eq("brand_matched", true)
        .limit(5000);
      const filtered = (monthRaw ?? []).filter((r) =>
        regionScope === "us-only" ? isLikelyUs(null, r.owner_username) : true,
      );
      igMonthlyTrend = buildMonthlyTrend(filtered);
    } catch (e) {
      console.warn("[ig] monthly trend fail:", e);
    }

    try {
      const { data: hashtagRaw } = await supabase
        .from("ig_posts")
        .select("hashtags, paid_signal")
        .eq("case_id", c.id)
        .eq("brand_matched", true)
        .limit(5000);
      const tagMap = new Map<string, { posts: number; paid: number }>();
      for (const r of hashtagRaw ?? []) {
        if (!Array.isArray(r.hashtags)) continue;
        const isPaid = !!r.paid_signal;
        for (const t of r.hashtags) {
          if (typeof t !== "string") continue;
          let agg = tagMap.get(t);
          if (!agg) {
            agg = { posts: 0, paid: 0 };
            tagMap.set(t, agg);
          }
          agg.posts += 1;
          if (isPaid) agg.paid += 1;
        }
      }
      igTopHashtags = Array.from(tagMap.entries())
        .filter(([, v]) => v.posts >= 20)
        .map(([tag, v]) => ({
          tag,
          posts: v.posts,
          paid: v.paid,
          paid_pct: (v.paid * 100) / v.posts,
        }))
        .sort((a, b) => b.paid_pct - a.paid_pct)
        .slice(0, 20);
    } catch (e) {
      console.warn("[ig] hashtag fetch fail:", e);
    }
  }

  // 4c. Top GMV Shop creator + Shop GMV 분포 (TikTok Shop case + ready 한정)
  let topGmvCreators: TopGmvCreator[] = [];
  let shopGmvDistribution: ShopGmvDistribution | null = null;
  let caseInfluencerIds: string[] = [];
  if (c.channel === "tiktok_shop" && c.status === "ready" && brand_id) {
    // 0) case scope unique influencer ids — 두 모듈 공용
    const { data: ic } = await supabase
      .from("contents")
      .select("influencer_id")
      .eq("brand_id", brand_id)
      .eq("country", c.country)
      .not("influencer_id", "is", null)
      .limit(20000);
    const idSet = new Set<string>();
    for (const r of ic ?? []) if (r.influencer_id) idSet.add(r.influencer_id);
    caseInfluencerIds = Array.from(idSet);

    // 1) brand+country scope의 Shop creator 중 GMV 큰 순 5명
    const { data: gmvInfls } = await supabase
      .from("influencers")
      .select(
        "id, handle, follower_count, lifetime_gmv_usd, gpm_usd, post_rate, total_brand_collabs, shop_creator_gmv_range",
      )
      .eq("is_tiktok_shop_creator", true)
      .gt("lifetime_gmv_usd", 0)
      .in("id", caseInfluencerIds)
      .order("lifetime_gmv_usd", { ascending: false })
      .limit(5);

    // 2) 각 인플의 top 3 영상 (brand scope)
    if (gmvInfls && gmvInfls.length > 0) {
      const topPromises = gmvInfls.map(async (i) => {
        const { data: vids } = await supabase
          .from("contents")
          .select("url, views, caption, is_ad")
          .eq("brand_id", brand_id)
          .eq("country", c.country)
          .eq("influencer_id", i.id)
          .order("views", { ascending: false, nullsFirst: false })
          .limit(3);
        const { count: total } = await supabase
          .from("contents")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand_id)
          .eq("country", c.country)
          .eq("influencer_id", i.id);
        const { count: promoted } = await supabase
          .from("contents")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand_id)
          .eq("country", c.country)
          .eq("influencer_id", i.id)
          .eq("is_ad", true);
        return {
          handle: i.handle,
          follower_count: i.follower_count,
          lifetime_gmv_usd: i.lifetime_gmv_usd,
          gpm_usd: i.gpm_usd,
          post_rate: i.post_rate,
          total_brand_collabs: i.total_brand_collabs,
          shop_creator_gmv_range: i.shop_creator_gmv_range,
          top_videos: (vids ?? []).map((v) => ({
            url: v.url,
            views: v.views ?? 0,
            caption: v.caption,
            is_ad: v.is_ad ?? false,
          })),
          total_videos: total ?? 0,
          promoted_videos: promoted ?? 0,
        } as TopGmvCreator;
      });
      topGmvCreators = await Promise.all(topPromises);
    }

    // 2) Shop creator GMV 분포 — case scope의 모든 Shop creator
    const buckets = { zero: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    let totalShop = 0;
    let nullGmv = 0;
    for (let i = 0; i < caseInfluencerIds.length; i += 1000) {
      const slice = caseInfluencerIds.slice(i, i + 1000);
      const { data: dist } = await supabase
        .from("influencers")
        .select("lifetime_gmv_usd")
        .eq("is_tiktok_shop_creator", true)
        .in("id", slice);
      for (const r of dist ?? []) {
        totalShop += 1;
        if (r.lifetime_gmv_usd == null) {
          nullGmv += 1;
          continue;
        }
        const g = Number(r.lifetime_gmv_usd);
        if (g === 0) buckets.zero += 1;
        else if (g < 1000) buckets.b1 += 1;
        else if (g < 10000) buckets.b2 += 1;
        else if (g < 100000) buckets.b3 += 1;
        else buckets.b4 += 1;
      }
    }
    if (totalShop > 0) {
      shopGmvDistribution = {
        total_shop_creators: totalShop,
        not_yet_backfilled: nullGmv,
        buckets: [
          { label: "$0 (역대 0건)", count: buckets.zero, color: "#9ca3af" },
          { label: "$1~$1K", count: buckets.b1, color: "#facc15" },
          { label: "$1K~$10K", count: buckets.b2, color: "#84cc16" },
          { label: "$10K~$100K", count: buckets.b3, color: "#10b981" },
          { label: "$100K+ (검증)", count: buckets.b4, color: "#0ea5e9" },
        ],
      };
    }
  }

  // 4d. brand_view_trends (Exolyt social listener 주간 viral views)
  let weeklyViews: Array<{
    week_start: string;
    total_views: number;
    total_videos: number;
  }> = [];
  if (brand_id) {
    const { data: bvt } = await supabase
      .from("brand_view_trends")
      .select("week_start, total_views, total_videos")
      .eq("brand_id", brand_id)
      .order("week_start", { ascending: true });
    weeklyViews = (bvt ?? []).map((r) => ({
      week_start: r.week_start,
      total_views: Number(r.total_views),
      total_videos: Number(r.total_videos),
    }));
  }

  // 5. 분석 시작 가능 여부
  // tiktok_shop은 스토어 URL만 있으면 분석 시작 가능 (Phase 1.5에서 자동 수집)
  const exolytDone = (contentCount ?? 0) > 0 || reusedAlready;
  const salesDone =
    c.channel === "amazon"
      ? skuRows.length > 0
      : c.channel === "tiktok_shop"
        ? c.country === "US"
          ? !!c.tiktok_shop_store_url
          : skuRows.length > 0 // SEA: Kalodata 적재 필요
        : c.channel === "shopee"
          ? skuRows.length > 0
          : true;
  const ready = exolytDone && salesDone && c.status === "draft";

  let reason = "";
  if (c.status !== "draft") reason = `현재 상태: ${c.status}`;
  else if (!exolytDone) {
    // TT Shop US는 Affiliate CSV로 영상 URL 박혀도 contents에 들어가 exolytDone 충족됨 — 안내 명시
    if (c.channel === "tiktok_shop" && c.country === "US")
      reason =
        "영상 데이터 필요 — Exolyt CSV 또는 Affiliate CSV (TT Shop) 둘 중 하나";
    else reason = "exolyt 데이터 업로드/재사용 필요";
  } else if (!salesDone) {
    if (c.channel === "amazon") reason = "30일 매출 CSV 업로드 필요";
    else if (c.channel === "tiktok_shop" && c.country === "US")
      reason = "TikTok Shop 스토어 URL 필요";
    else if (c.channel === "tiktok_shop")
      reason = "Kalodata 텍스트 업로드 필요 (SEA)";
    else if (c.channel === "shopee") reason = "Shopdora 매출 텍스트 업로드 필요";
  }

  // 5a-1. 통화 + 환율 (ready 케이스에서 SKU 매출/단가 표시용)
  const caseCurrency = defaultCurrency(c.country);
  const exchangeRates = await fetchExchangeRates();

  // 5b. 비용 추정
  const costEstimate = estimateCost({
    channel: c.channel,
    brand_keyword: c.brand_keyword,
    brand_meta_pages: c.brand_meta_pages,
    tiktok_shop_store_url: c.tiktok_shop_store_url,
    hasApifyToken: !!process.env.APIFY_TOKEN,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  });

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      <nav className="breadcrumb">
        <Link href="/cases">Browse</Link>
        <span className="sep">/</span>
        {brand_id ? (
          <Link href={`/brands/${brand_id}`}>{brand}</Link>
        ) : (
          <span>{brand}</span>
        )}
        <span className="sep">/</span>
        <span>
          {c.country}/{c.channel.toUpperCase()}
        </span>
      </nav>

      {/* Header */}
      <div className="section-card" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {brand}
          </h1>
          <span className={`status-pill ${c.status}`}>{c.status}</span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <a
              href={`/api/cases/${c.id}/creators-csv`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
                background: "var(--color-info-soft)",
                color: "var(--color-info)",
                border: "1px solid var(--color-info)",
                borderRadius: 4,
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
              }}
              title="이 케이스 협업 인플 전체 CSV 다운로드"
            >
              ⬇ 인플 CSV
            </a>
            <DeleteCaseButton
              case_id={c.id}
              brand_label={`${brand} · ${c.country} · ${c.channel.toUpperCase()}`}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <span className="case-tag country">{c.country}</span>
          <span className="case-tag platform">{c.channel.toUpperCase()}</span>
          <RevenueTierPicker
            case_id={c.id}
            current={c.revenue_tier ?? null}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--color-g100)",
          }}
        >
          <span>
            생성{" "}
            <b style={{ color: "var(--color-ink)" }}>
              {new Date(c.created_at).toLocaleString("ko-KR")}
            </b>
          </span>
          <span>
            업데이트{" "}
            <b style={{ color: "var(--color-ink)" }}>
              {new Date(c.updated_at).toLocaleString("ko-KR")}
            </b>
          </span>
          <span>
            id <b style={{ color: "var(--color-ink)" }}>{c.id.slice(0, 8)}</b>
          </span>
        </div>
      </div>

      {/* Status branch */}
      {c.status === "draft" ? (
        <>
          {/* Section 02: 데이터 업로드 */}
          <section className="section-card" style={{ marginBottom: 14 }}>
            <div className="section-head">
              <span className="section-num">SECTION 02</span>
              <span className="section-title">데이터 업로드</span>
              <span className={`section-status ${ready ? "done" : "partial"}`}>
                {ready ? "완료" : "진행중"}
              </span>
            </div>

            {c.channel === "tiktok_shop" && c.country === "US" && (
              <div
                style={{
                  background: "var(--color-info-soft, rgba(0,100,255,0.05))",
                  border: "1px solid var(--color-info)",
                  borderRadius: 6,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--color-g700)",
                  lineHeight: 1.6,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--color-info)",
                    marginBottom: 6,
                  }}
                >
                  💡 TT Shop US 케이스 — 영상 데이터 받는 2가지 경로
                </div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li style={{ marginBottom: 4 }}>
                    <b>Exolyt CSV (1차 추천)</b> — Exolyt social listener에서
                    1년치 영상 export → 아래 첫 슬롯에 업로드. 캡션·views·해시태그
                    등 풍부. Phase 4b 분석 깊어짐.
                  </li>
                  <li>
                    <b>Affiliate CSV 우회 (Exolyt 못 받을 때)</b> — TikTok Shop{" "}
                    <b>Seller Center 접근 권한 필요</b>. Seller Center → 제품 상세
                    → Affiliate Creators 섹션 → Export CSV → 아래 "TikTok Shop US
                    affiliate" 슬롯에 업로드. 영상 URL만 들어와 캡션·views 비어
                    있음 → Phase 4b 분석 일부만.
                  </li>
                </ol>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--color-g500)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  → 둘 중 하나만 있으면 분석 시작 가능. 둘 다 있으면 영상 풀 +
                  affiliate 매핑 둘 다 살려서 최고.
                </div>
              </div>
            )}

            <ExolytSection
              case_id={c.id}
              hasContents={(contentCount ?? 0) > 0 && !reusedAlready && !reusable}
              reusable={reusable}
              reusedAlready={reusedAlready}
              contentCount={contentCount ?? 0}
            />

            {c.channel === "amazon" && (
              <>
                <AmazonSalesSection
                  case_id={c.id}
                  skuRows={skuRows}
                  caseCountry={c.country}
                  exchangeRates={exchangeRates}
                />
                <BsrSection case_id={c.id} skuRows={skuRows} caseCountry={c.country} />
              </>
            )}

            {c.channel === "shopee" && (
              <ShopdoraSection
                case_id={c.id}
                productCount={skuRows.length}
              />
            )}

            {c.channel === "tiktok_shop" && c.country === "US" && (
              <>
                <div
                  style={{
                    background: "var(--color-g25)",
                    border: "1px dashed var(--color-g200)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    fontSize: 12,
                    color: "var(--color-g500)",
                    lineHeight: 1.6,
                  }}
                >
                  <b style={{ color: "var(--color-ink)" }}>
                    TikTok Shop 매출/제품 자동 수집 (US)
                  </b>
                  <br />
                  분석 시작 시 Phase 1.5에서 pro100chok actor가 아래 스토어 URL을 통해 제품·가격·누적 판매량을 가져옵니다. <b>매출 데이터는 변형 옵션 가격대 큰 제품에서 부정확할 수 있어 — Helium10 paste로 정정 권장.</b>
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "white",
                      borderRadius: 4,
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: c.tiktok_shop_store_url
                        ? "var(--color-g600)"
                        : "var(--color-accent)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.tiktok_shop_store_url ?? "⚠ 스토어 URL 비어있음"}
                  </div>
                  {c.tiktok_shop_store_url && (
                    <StartPhase15Button
                      case_id={c.id}
                      status={c.status}
                      hasProducts={skuRows.length > 0}
                    />
                  )}
                </div>

                <TiktokProductFinderSection
                  case_id={c.id}
                  products={skuRows.map((s) => ({
                    id: s.id,
                    name: s.name ?? "",
                    asin: s.asin || null,
                    external_product_id: s.external_product_id,
                    revenue_30d: s.revenue_30d,
                  }))}
                  existingProducts={
                    Object.keys(
                      (c.key_stats as {
                        tt_shop_us_helium10?: Record<string, unknown>;
                      })?.tt_shop_us_helium10 ?? {},
                    ).length
                  }
                  hasUndo={
                    ((c.key_stats as { _last_undo?: { type?: string } })
                      ?._last_undo?.type ?? "") ===
                    "helium10_product_finder"
                  }
                />
                <TiktokShopUsAffiliateSection
                  case_id={c.id}
                  products={skuRows.map((s) => ({
                    id: s.id,
                    name: s.name ?? "",
                    asin: s.asin || null,
                    external_product_id: s.external_product_id,
                    revenue_30d: s.revenue_30d,
                  }))}
                  existingAffiliates={
                    Array.isArray(
                      (c.key_stats as { tt_shop_us_affiliates?: unknown[] })
                        ?.tt_shop_us_affiliates,
                    )
                      ? (
                          c.key_stats as { tt_shop_us_affiliates: unknown[] }
                        ).tt_shop_us_affiliates.length
                      : 0
                  }
                />
              </>
            )}

            {c.channel === "tiktok_shop" && c.country !== "US" && (
              <KalodataSection
                case_id={c.id}
                productCount={skuRows.length}
              />
            )}
          </section>

          <StartAnalysisButton
            case_id={c.id}
            ready={ready}
            reason={reason}
            costEstimate={costEstimate}
          />
        </>
      ) : c.status === "ready" ? (
        // key_stats null이어도 (분석 안 한 새 케이스) IG/YT BP 박스 노출 필요.
        // main flow 안의 ks?.phase2 분기로 "분석 안 함" 메시지 자동 처리.
        <>
          {/* ready 케이스에도 추가 업로드 가능 — 우회 brand 만드는 패턴 차단 */}
          <details
            className="section-card"
            style={{ marginBottom: 14 }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--color-g600)",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>📥</span>
              데이터 추가 업로드 (분석된 케이스에 신규 데이터 머지)
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--color-g400)",
                  fontWeight: 500,
                }}
              >
                ▼ 펼치기
              </span>
            </summary>
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--color-g100)",
              }}
            >
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  background: "var(--color-info-soft)",
                  border: "1px solid #C7D6E8",
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: "var(--color-info)",
                }}
              >
                기존 분석 결과는 그대로 유지됩니다. 데이터 추가 후
                <b> 분석 재실행</b>을 별도로 트리거해야 새 데이터가 반영됩니다.
                <br />⚠️ <b>새 브랜드/케이스를 만들지 마세요</b> — 같은 브랜드+국가는
                이 케이스로 직접 업로드하면 자동 머지됩니다 (url 충돌은 GREATEST로
                안전 머지).
              </div>
              <ExolytSection
                case_id={c.id}
                hasContents={
                  (contentCount ?? 0) > 0 && !reusedAlready && !reusable
                }
                reusable={reusable}
                reusedAlready={reusedAlready}
                contentCount={contentCount ?? 0}
              />
              <BrandViewTrendsSection
                case_id={c.id}
                existingWeeks={weeklyViews.length}
              />
              <YoutubeSeedingSection
                case_id={c.id}
                existingRuns={
                  Array.isArray(
                    (
                      c.key_stats as {
                        youtube_seeding_runs?: unknown[];
                      }
                    )?.youtube_seeding_runs,
                  )
                    ? (
                        c.key_stats as {
                          youtube_seeding_runs: unknown[];
                        }
                      ).youtube_seeding_runs.length
                    : 0
                }
              />
              {c.channel === "amazon" && (
                <>
                  <AmazonSalesSection
                    case_id={c.id}
                    skuRows={skuRows}
                    caseCountry={c.country}
                    exchangeRates={exchangeRates}
                  />
                  <BsrSection
                    case_id={c.id}
                    skuRows={skuRows}
                    caseCountry={c.country}
                  />
                </>
              )}
              {c.channel === "shopee" && (
                <ShopdoraSection
                  case_id={c.id}
                  productCount={skuRows.length}
                />
              )}
              {c.channel === "tiktok_shop" && c.country !== "US" && (
                <KalodataSection
                  case_id={c.id}
                  productCount={skuRows.length}
                />
              )}
              {c.channel === "tiktok_shop" && c.country === "US" && (
                <>
                  <TiktokProductFinderSection
                    case_id={c.id}
                    products={skuRows.map((s) => ({
                      id: s.id,
                      name: s.name ?? "",
                      asin: s.asin || null,
                      external_product_id: s.external_product_id,
                    }))}
                    existingProducts={
                      Object.keys(
                        (c.key_stats as {
                          tt_shop_us_helium10?: Record<string, unknown>;
                        })?.tt_shop_us_helium10 ?? {},
                      ).length
                    }
                    hasUndo={
                      ((c.key_stats as { _last_undo?: { type?: string } })
                        ?._last_undo?.type ?? "") ===
                      "helium10_product_finder"
                    }
                  />
                  <TiktokShopUsAffiliateSection
                    case_id={c.id}
                    products={skuRows.map((s) => ({
                      id: s.id,
                      name: s.name ?? "",
                      asin: s.asin || null,
                      external_product_id: s.external_product_id,
                    }))}
                    existingAffiliates={
                      Array.isArray(
                        (c.key_stats as { tt_shop_us_affiliates?: unknown[] })
                          ?.tt_shop_us_affiliates,
                      )
                        ? (
                            c.key_stats as { tt_shop_us_affiliates: unknown[] }
                          ).tt_shop_us_affiliates.length
                        : 0
                    }
                  />
                </>
              )}
            </div>
          </details>

          {/* BP 분석 (IG + YT) 상단 — region scope toggle */}
          <div
            style={{
              marginTop: 24,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h2 style={{ fontSize: 18, margin: 0 }}>
              🎯 BP 카테고리 정의자 분석 (IG + YouTube)
            </h2>
            <RegionScopeToggle case_id={c.id} currentScope={regionScope} />
          </div>

          {/* IG Brand Monitoring (Phase 4c) — 카테고리 정의자 BP 분석용.
              데이터 추가 업로드 토글 밖, ready 케이스의 main flow에 노출. */}
          <IgPrepBox
            case_id={c.id}
            hasIgConfig={!!c.ig_config}
            suggestedConfig={igConfigSuggested}
            debug={igPrepDebug}
          />
          <IgPostlearnBox
            case_id={c.id}
            hasPhase4c={!!phase4cStats && !phase4cStats.skipped_reason}
            learnedConfig={igConfigLearned}
            diff={igPostlearnDiff}
          />
          {phase4cStats && !phase4cStats.skipped_reason && (
            <IgBrandMonitorSection
              phase4c={phase4cStats}
              ownedUsernames={igOwnedUsernames}
              topAuthors={igTopAuthors}
              topPaidVideos={igTopPaidVideos}
              sourceDist={igSourceDist}
              topHashtags={igTopHashtags}
              tierDist={igTierDist}
              monthlyTrend={igMonthlyTrend}
              poolSummary={igPoolSummary}
            />
          )}

          <YtPrepBox
            case_id={c.id}
            hasYtConfig={!!c.yt_config}
            suggestedConfig={ytConfigSuggested}
            debug={ytPrepDebug}
          />
          <YtPostlearnBox
            case_id={c.id}
            hasPhase4d={!!phase4dStats && !phase4dStats.skipped_reason}
            learnedConfig={ytConfigLearned}
            diff={ytPostlearnDiff}
          />
          {phase4dStats && !phase4dStats.skipped_reason && (
            <YtBrandMonitorSection
              phase4d={phase4dStats}
              ownedChannels={ytOwnedChannels}
              topChannels={ytTopChannels}
              topPaidVideos={ytTopPaidVideos}
              sourceDist={ytSourceDist}
              typeDist={ytTypeDist}
              tierDist={ytTierDist}
              monthlyTrend={ytMonthlyTrend}
              poolSummary={ytPoolSummary}
            />
          )}

          {(() => {
            const ks = c.key_stats as {
              phase2?: Phase2Stats;
              phase3?: Phase3Stats;
              phase35?: Phase35Stats;
              phase37?: Phase37Stats;
              phase4a?: Phase4aStats;
              phase4b_sample?: Phase4bSampleStats;
              phase4b_asr?: Phase4bAsrStats;
              phase4b_vision?: Phase4bVisionStats;
              phase4b_clusters?: Phase4bClusterStats;
              phase4b_sku?: Phase4bSkuStats;
              phase5?: Phase5Stats;
              last_error?: { message: string; at: string };
              // Kalodata (SEA TikTok Shop) — uploadKalodata / uploadKalodataCreatorsXlsx / uploadKalodataVideosXlsx로 적재
              kalodata_brand?: KalodataBrandKpi | null;
              kalodata_creators_xlsx?: KalodataCreatorXlsxRow[];
              kalodata_videos?: KalodataVideoRow[];
              kalodata_videos_xlsx?: KalodataVideoXlsxRow[];
              kalodata_lives?: KalodataLiveRow[];
              kalodata_creators_meta?: {
                shop?: string | null;
                period_start?: string | null;
                period_end?: string | null;
                account_type_filter?: string | null;
              } | null;
            } | null;
            const lastError = ks?.last_error;
            if (!ks?.phase2) {
              // BP-only 케이스 (ig_config 또는 yt_config 박혀있으면) — Dyson/Poppi 같은 IG/YT 전용
              // TikTok Exolyt / Amazon 데이터 안 박는 케이스. phase2 없는 게 정상.
              const isBpOnly = !!c.ig_config || !!c.yt_config;
              return (
                <>
                  <div
                    style={{
                      padding: 18,
                      marginBottom: 14,
                      background: isBpOnly
                        ? "var(--color-info-soft)"
                        : "var(--color-warn-soft)",
                      border: `1px solid ${isBpOnly ? "var(--color-info)" : "var(--color-warn)"}`,
                      borderRadius: 8,
                      fontSize: 12,
                      color: isBpOnly ? "var(--color-info)" : "var(--color-warn)",
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {isBpOnly
                        ? "ℹ BP 분석 전용 케이스 (TikTok/Amazon 데이터 없음)"
                        : "⚠ key_stats에 phase2 결과가 없어요"}
                    </div>
                    {isBpOnly ? (
                      <>
                        이 케이스는 <b>IG / YouTube 카테고리 정의자 분석 전용</b>으로
                        만들어진 케이스. 위 🎯 BP 박스에서 자동 발굴 → Phase 4c (IG) /
                        Phase 4d (YT) 만 돌리면 됨. Phase 2~5 (Exolyt·Amazon 분석)는
                        스킵해도 OK — 데이터 없으니까.
                      </>
                    ) : (
                      <>
                        다른 phase 결과(3 / 4a / 4b.* / 5)는 살아 있는데 phase2만 누락. 아래 PhaseProgress 펼쳐서{" "}
                        <b>Phase 2만 재실행</b>하면 다른 결과는 보존된 채 phase2가 채워져요.
                      </>
                    )}
                  </div>
                  <PhaseProgressToggle
                    case_id={c.id}
                    keyStats={(ks ?? {}) as KeyStats}
                  />
                  <DevTestActions
                    case_id={c.id}
                    status={c.status}
                    costEstimate={costEstimate}
                  />
                </>
              );
            }
            return (
              <>
                {lastError && (
                  <div
                    style={{
                      padding: "12px 14px",
                      marginBottom: 14,
                      background: "var(--color-accent-soft)",
                      border: "1px solid var(--color-accent)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-accent)",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      ⚠ 직전 분석 실행이 실패했어요
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--color-g600)",
                        wordBreak: "break-all",
                      }}
                    >
                      {lastError.message}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-g400)",
                        marginTop: 4,
                      }}
                    >
                      {lastError.at} · 아래 PhaseProgress의 "분석 재실행"
                      또는 개별 phase 재실행 버튼으로 다시 시도하세요
                    </div>
                  </div>
                )}
                <PhaseProgressToggle
                  case_id={c.id}
                  keyStats={ks as KeyStats}
                />
                <div style={{ height: 14 }} />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 180px",
                    gap: 24,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <MiniDashboard
                      phase2={ks.phase2}
                      phase3={ks.phase3}
                      phase35={ks.phase35}
                      phase37={ks.phase37}
                      phase4a={ks.phase4a}
                      phase4bSample={ks.phase4b_sample}
                      phase4bAsr={ks.phase4b_asr}
                      phase4bVision={ks.phase4b_vision}
                      phase4bClusters={ks.phase4b_clusters}
                      phase4bSku={ks.phase4b_sku}
                      phase5={ks.phase5}
                      metaAdsList={metaAdsList}
                      currency={caseCurrency}
                      caseCountry={c.country}
                      exchangeRates={exchangeRates}
                      topGmvCreators={topGmvCreators}
                      shopGmvDistribution={shopGmvDistribution}
                      weeklyViews={weeklyViews}
                      skuMeta={skuMeta}
                      kalodata={{
                        brand: ks.kalodata_brand,
                        creators: ks.kalodata_creators_xlsx,
                        videos: ks.kalodata_videos,
                        videosXlsx: ks.kalodata_videos_xlsx,
                        lives: ks.kalodata_lives,
                        meta: ks.kalodata_creators_meta,
                      }}
                    />
                  </div>
                  <SectionTOC
                    items={[
                      { id: "section-a", letter: "A", label: "콘텐츠 활동" },
                      ...(ks.phase3
                        ? [
                            {
                              id: "section-b",
                              letter: "B",
                              label: "인플루언서 활동",
                            },
                          ]
                        : []),
                      ...(ks.phase4b_sample
                        ? [
                            {
                              id: "section-c",
                              letter: "C",
                              label: "콘텐츠 포맷 분석",
                            },
                          ]
                        : []),
                      ...(ks.phase2.sales_summary
                        ? [
                            {
                              id: "section-d",
                              letter: "D",
                              label: "매출 & 랭킹",
                            },
                          ]
                        : []),
                      ...(ks.phase4a
                        ? [
                            {
                              id: "section-e",
                              letter: "E",
                              label: "Meta 광고",
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </>
            );
          })()}
          <DevTestActions
            case_id={c.id}
            status={c.status}
            costEstimate={costEstimate}
          />
        </>
      ) : (
        <>
          <AutoRefresh enabled intervalMs={5000} />
          <div
            style={{
              padding: 18,
              background: "var(--color-warn-soft)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-warn)",
            }}
          >
            ⟳ 분석 진행 중 (status: <b>{c.status}</b>) — 5초마다 자동 갱신됨. 완료 시 자동 표시.
            로컬 dev라면 Inngest dev server (
            <span className="font-mono">localhost:8288</span>) → Runs 탭에서 실시간 진행 추적.
          </div>
          <DevTestActions
            case_id={c.id}
            status={c.status}
            costEstimate={costEstimate}
          />
        </>
      )}
    </div>
  );
}
