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
import { SectionAMockup } from "@/components/case-detail/mockup/SectionAMockup";
import { SectionEMockup } from "@/components/case-detail/mockup/SectionEMockup";
import { SectionBMockup } from "@/components/case-detail/mockup/SectionBMockup";
import { SectionCMockup } from "@/components/case-detail/mockup/SectionCMockup";
import { SectionBoundary } from "@/components/case-detail/SectionBoundary";
import { computeUspKeywords } from "@/lib/inngest/aggregators/phase5-position";
import { SectionDMockup } from "@/components/case-detail/mockup/SectionDMockup";
import {
  CaseStatusStripMockup,
  KpiStripMockup,
  DataChannelsMockup,
  PhaseProgressMockup,
  InsightCardMockup,
} from "@/components/case-detail/mockup/HeaderMockup";
// mockup CSS는 src/app/globals.css 끝에 append 됨 (.bp-mockup scope).
import { PhaseProgressToggle } from "@/components/case-detail/PhaseProgressToggle";
import { CaseStatusStrip } from "@/components/case-detail/CaseStatusStrip";
import { CaseDevFooter } from "@/components/case-detail/CaseDevFooter";
import { listMergeCandidates } from "@/app/cases/[id]/case-actions";
import {
  CaseInsightCard,
  type AxisCardData,
  type CrossPlatformAuthor,
} from "@/components/case-detail/CaseInsightCard";
import { DataChannelGrid } from "@/components/case-detail/DataChannelGrid";
import { CaseKpiStrip } from "@/components/case-detail/CaseKpiStrip";
import { CaseSideTOC } from "@/components/case-detail/CaseSideTOC";
import { CaseHeader } from "@/components/case-detail/CaseHeader";
import type { DataChannel } from "@/lib/supabase/types";
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
import { IgProfileScrapeBox } from "@/components/case-detail/IgProfileScrapeBox";
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
  crossPlatformAuthors,
  monthlyTrend as buildMonthlyTrend,
  poolSummary as buildPoolSummary,
  tierDistributionIg,
  tierDistributionYt,
  type CrossPlatformMatch,
  type MonthlyBucket,
  type PoolSummary,
  type TierBucket,
} from "@/lib/case-detail/bp-analytics";
import { BpUnifiedAnalysisSection } from "@/components/case-detail/BpUnifiedAnalysisSection";
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
// Server actions 박힌 이 page 박힘 통해 invoke 박힘 (uploadAmazonSales / runIgProfileScrape 등).
// 기본 60초 박힘 — Apify scrape 박힘 172초+ 박혀서 504 timeout 박힘. Fluid 박힘 max 800.
export const maxDuration = 800;

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
      "id, country, channel, status, revenue_tier, brand_keyword, brand_meta_pages, tiktok_shop_store_url, ig_config, yt_config, options, key_stats, data_channels, analyzed_at, created_at, updated_at, brand:brands(name)",
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
      .select("id, asin, external_product_id, name, product_url, country, subcategory, launch_date, channel")
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
          channel: (p as { channel?: string }).channel ?? null,
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
  let crossPlatformMatches: CrossPlatformMatch[] = [];

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

  // Cross-platform 매칭 — IG/YT 둘 다 있을 때 작성자 이름 부분 일치로 추정
  if (phase4cStats && phase4dStats && !phase4cStats.skipped_reason && !phase4dStats.skipped_reason) {
    try {
      const [{ data: igAll }, { data: ytAll }] = await Promise.all([
        supabase
          .from("ig_authors")
          .select("username, brand_matched_posts, paid_posts, max_likes")
          .eq("case_id", c.id)
          .limit(5000),
        supabase
          .from("yt_channels")
          .select("channel_name, brand_matched_videos, paid_videos, max_views")
          .eq("case_id", c.id)
          .limit(5000),
      ]);
      crossPlatformMatches = crossPlatformAuthors(
        (igAll ?? []).map((a) => ({
          username: a.username,
          brand_matched_posts: a.brand_matched_posts ?? 0,
          paid_posts: a.paid_posts ?? 0,
          max_likes: a.max_likes,
        })),
        (ytAll ?? []).map((ch) => ({
          channel_name: ch.channel_name,
          brand_matched_videos: ch.brand_matched_videos ?? 0,
          paid_videos: ch.paid_videos ?? 0,
          max_views: ch.max_views,
        })),
      );
    } catch (e) {
      console.warn("[bp-unified] cross-platform match fail:", e);
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
          "username, full_name, total_posts, brand_matched_posts, paid_posts, max_likes, max_views, total_likes, tier, followers",
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

    // 2) Shop creator GMV 분포 — mockup 10 bar (log scale 박힘)
    const HG_DEFS: Array<{ label: string; min: number; max: number; color: string }> = [
      { label: "$0", min: 0, max: 0, color: "#9ca3af" },
      { label: "$1~$100", min: 1, max: 100, color: "#fde68a" },
      { label: "$100~$500", min: 100, max: 500, color: "#fcd34d" },
      { label: "$500~$1K", min: 500, max: 1_000, color: "#facc15" },
      { label: "$1K~$5K", min: 1_000, max: 5_000, color: "#a3e635" },
      { label: "$5K~$10K", min: 5_000, max: 10_000, color: "#84cc16" },
      { label: "$10K~$50K", min: 10_000, max: 50_000, color: "#22c55e" },
      { label: "$50K~$100K", min: 50_000, max: 100_000, color: "#10b981" },
      { label: "$100K~$500K", min: 100_000, max: 500_000, color: "#06b6d4" },
      { label: "$500K+", min: 500_000, max: Infinity, color: "#0ea5e9" },
    ];
    const hgCounts = new Array(HG_DEFS.length).fill(0);
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
        for (let bi = 0; bi < HG_DEFS.length; bi++) {
          const def = HG_DEFS[bi]!;
          // $0 bucket — 정확히 0만
          if (def.min === 0 && def.max === 0) {
            if (g === 0) { hgCounts[bi] += 1; break; }
          } else if (g >= def.min && g < def.max) {
            hgCounts[bi] += 1;
            break;
          }
        }
      }
    }
    if (totalShop > 0) {
      shopGmvDistribution = {
        total_shop_creators: totalShop,
        not_yet_backfilled: nullGmv,
        buckets: HG_DEFS.map((def, i) => ({
          label: def.label,
          count: hgCounts[i],
          color: def.color,
        })),
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

  // ★ products channel + category/launch_date/price 분포
  // identifier = asin (Amazon) OR external_product_id (Kalodata: "kalodata_p_..." 등)
  // — SectionDMockup 채널 toggle + SKU 표 컬럼 enrichment (옛 phase2 cache 에 새 field 없을 때 직접 박음)
  const skuChannelMap: Record<string, string> = {};
  const skuMetaMap: Record<
    string,
    { category: string | null; launch_date: string | null; price: number | null }
  > = {};
  {
    const { data } = await supabase
      .from("products")
      .select("asin, external_product_id, channel, category, launch_date, price")
      .eq("case_id", c.id);
    for (const r of data ?? []) {
      const id = r.asin ?? r.external_product_id;
      if (!id) continue;
      skuChannelMap[id] = String(r.channel ?? "");
      skuMetaMap[id] = {
        category: r.category ?? null,
        launch_date: r.launch_date ?? null,
        price: r.price != null ? Number(r.price) : null,
      };
    }
  }
  const availableSalesChannels = Array.from(new Set(Object.values(skuChannelMap).filter(Boolean))) as string[];

  // ── SKU별 명시적 영상 (contents.product_id 링크) + 조회수 + 어필리에이트 GMV ──
  // 사용자가 "제품 선택"해서 올린 어필리에이트/영상은 contents.product_id로 SKU에 직접
  // 연결됨. Vision 매칭(phase4b, 500K 임계) 없이 이 명시적 링크로 SKU별 영상·매출 표시.
  type SkuVideo = {
    url: string;
    views: number;
    gmv: number | null;
    items: number | null;
    handle: string | null;
    is_ad: boolean;
  };
  const skuVideoMap: Record<string, SkuVideo[]> = {};
  {
    const { data: prodIdRows } = await supabase
      .from("products")
      .select("id, asin, external_product_id")
      .eq("case_id", c.id);
    const pidToAsin = new Map<string, string>();
    for (const p of prodIdRows ?? []) {
      const asin = p.asin ?? p.external_product_id;
      if (asin) pidToAsin.set(p.id, asin);
    }
    const pids = [...pidToAsin.keys()];
    if (pids.length > 0) {
      const { data: ctRows } = await supabase
        .from("contents")
        .select("url, views, product_id, influencer_id, is_ad")
        .in("product_id", pids)
        .limit(5000);
      const inflIds = [
        ...new Set((ctRows ?? []).map((r) => r.influencer_id).filter(Boolean)),
      ] as string[];
      const inflHandle = new Map<string, string>();
      if (inflIds.length > 0) {
        const { data: inflRows } = await supabase
          .from("influencers")
          .select("id, handle")
          .in("id", inflIds);
        for (const r of inflRows ?? []) if (r.handle) inflHandle.set(r.id, r.handle);
      }
      // handle → 어필리에이트 GMV + 판매량 (handle별 최대 GMV row 채택)
      const affByHandle = new Map<string, { gmv: number; items: number }>();
      const affArr = (
        c.key_stats as {
          tt_shop_us_affiliates?: Array<{
            handle?: string;
            gmv_30d_usd?: number;
            items_sold_30d?: number;
          }>;
        }
      )?.tt_shop_us_affiliates;
      if (Array.isArray(affArr)) {
        for (const a of affArr) {
          if (!a?.handle) continue;
          const g = a.gmv_30d_usd ?? 0;
          const ex = affByHandle.get(a.handle);
          if (!ex || g > ex.gmv)
            affByHandle.set(a.handle, { gmv: g, items: a.items_sold_30d ?? 0 });
        }
      }
      // 영상을 작성자별로 그룹 → 작성자 GMV/판매량을 "조회수 비중"으로 영상별 분배.
      //   영상 1개 작성자 = 그대로, 여러 개 = 조회수 비례 (합계 보존). 조회수 0이면 균등.
      type Vid = { url: string; views: number; asin: string; is_ad: boolean; handle: string | null };
      const vidsByHandle = new Map<string, Vid[]>();
      for (const r of ctRows ?? []) {
        if (!r.product_id) continue;
        const asin = pidToAsin.get(r.product_id);
        if (!asin) continue;
        const handle = r.influencer_id
          ? inflHandle.get(r.influencer_id) ?? null
          : null;
        const key = handle ?? `__solo__${r.url}`;
        const arr = vidsByHandle.get(key) ?? [];
        arr.push({ url: r.url, views: r.views ?? 0, asin, is_ad: !!r.is_ad, handle });
        vidsByHandle.set(key, arr);
      }
      for (const [key, vids] of vidsByHandle) {
        const aff = key.startsWith("__solo__") ? undefined : affByHandle.get(key);
        const totalViews = vids.reduce((s, v) => s + v.views, 0);
        for (const v of vids) {
          let gmv: number | null = null;
          let items: number | null = null;
          if (aff) {
            const share = totalViews > 0 ? v.views / totalViews : 1 / vids.length;
            gmv = aff.gmv * share;
            items = aff.items * share;
          }
          (skuVideoMap[v.asin] ??= []).push({
            url: v.url,
            views: v.views,
            gmv,
            items,
            handle: v.handle,
            is_ad: v.is_ad,
          });
        }
      }
      // "뷰 Top 영상" 박스용 — 조회수순. (영상별 매출 탭은 자체적으로 GMV순 정렬)
      for (const k in skuVideoMap) skuVideoMap[k]!.sort((a, b) => b.views - a.views);
    }
  }

  // ── Amazon BSR — SKU별 월별 시계열 + 상승시점(inflection) + 당시 브랜드 영상 ──
  //   phase2.bsr_series는 매출 Top5(TT샵, BSR 없음)로 계산돼 Amazon BSR을 놓침 →
  //   sales_snapshot에서 직접. 전체 SKU=모든 라인 / 개별=상승시점+당시 영상.
  type BsrInflectionPt = {
    month: string;
    from: number;
    to: number;
    videos: Array<{ url: string; views: number; caption: string | null }>;
  };
  type BsrSkuData = {
    asin: string;
    name: string;
    series: Array<{ m: string; bsr: number }>;
    inflections: BsrInflectionPt[];
  };
  const bsrSkus: BsrSkuData[] = [];
  {
    const { data: amzProds } = await supabase
      .from("products")
      .select("id, asin, name")
      .eq("case_id", c.id)
      .eq("channel", "amazon");
    const amz = (amzProds ?? []).filter((p) => p.asin);
    if (amz.length > 0) {
      const pidList = amz.map((p) => p.id);
      const { data: snaps } = await supabase
        .from("sales_snapshot")
        .select("product_id, bsr, collected_at")
        .in("product_id", pidList)
        .not("bsr", "is", null)
        .order("collected_at", { ascending: true });
      const { data: bvids } = brand_id
        ? await supabase
            .from("contents")
            .select("url, views, caption, uploaded_at")
            .eq("brand_id", brand_id)
            .ilike("url", "%tiktok.com%")
            .not("uploaded_at", "is", null)
            .limit(5000)
        : { data: [] as Array<{ url: string; views: number | null; caption: string | null; uploaded_at: string | null }> };
      // 제품별 월별 min BSR (랭크는 낮을수록 좋음)
      const byPid = new Map<string, Map<string, number>>();
      for (const s of snaps ?? []) {
        if (s.bsr == null) continue;
        const m = String(s.collected_at).slice(0, 7);
        const mm = byPid.get(s.product_id) ?? new Map<string, number>();
        const cur = mm.get(m);
        if (cur == null || s.bsr < cur) mm.set(m, s.bsr);
        byPid.set(s.product_id, mm);
      }
      // 월별 브랜드 영상 (상관용)
      const vidsByMonth = new Map<string, Array<{ url: string; views: number; caption: string | null }>>();
      for (const v of bvids ?? []) {
        const m = String(v.uploaded_at).slice(0, 7);
        const arr = vidsByMonth.get(m) ?? [];
        arr.push({ url: v.url, views: v.views ?? 0, caption: v.caption ?? null });
        vidsByMonth.set(m, arr);
      }
      for (const p of amz) {
        const mm = byPid.get(p.id);
        if (!mm || mm.size < 2) continue;
        const months = [...mm.keys()].sort();
        const series = months.map((m) => ({ m, bsr: mm.get(m)! }));
        // inflection: 전월 대비 BSR 40%+ 개선(하락) & 8만위 이내 도달
        const inflections: BsrInflectionPt[] = [];
        for (let i = 1; i < series.length; i++) {
          const prevPt = series[i - 1];
          const curPt = series[i];
          if (!prevPt || !curPt) continue;
          const prev = prevPt.bsr;
          const cur = curPt.bsr;
          if (cur < prev * 0.6 && cur < 80000) {
            const month = curPt.m;
            const vids = (vidsByMonth.get(month) ?? [])
              .sort((a, b) => b.views - a.views)
              .slice(0, 3);
            inflections.push({ month, from: prev, to: cur, videos: vids });
          }
        }
        bsrSkus.push({ asin: p.asin!, name: p.name ?? p.asin!, series, inflections });
      }
      bsrSkus.sort((a, b) => Math.min(...a.series.map((s) => s.bsr)) - Math.min(...b.series.map((s) => s.bsr)));
    }
  }

  // ★ USP 키워드 — 채널별(all/tk/ig/yt) 키워드 + 키워드별 매칭 영상 top3.
  //   TK: phase5 키워드 + contents ilike (기존). IG/YT: 해당 테이블 캡션 코퍼스에서
  //   computeUspKeywords 재계산 + in-memory 매칭. all: 세 채널 키워드 병합.
  const uspBundle = await (async () => {
    type Kw = { keyword: string; count: number; pct: number };
    type Vid = { url: string; caption: string; views: number };
    type ChK = "all" | "tk" | "ig" | "yt";
    const keywords: Record<ChK, Kw[]> = { all: [], tk: [], ig: [], yt: [] };
    const videos: Record<ChK, Record<string, Vid[]>> = { all: {}, tk: {}, ig: {}, yt: {} };

    // TK 키워드 (phase5 재사용)
    const ksU = (c.key_stats ?? {}) as { phase5?: { usp_keywords?: Kw[] } };
    keywords.tk = (ksU.phase5?.usp_keywords ?? []).slice(0, 24);

    // IG / YT 코퍼스 fetch (case-scoped)
    const igCorpus: Vid[] = [];
    {
      let from = 0;
      for (;;) {
        const { data } = await supabase
          .from("ig_posts")
          .select("caption, url, video_view_count, video_play_count, likes_count")
          .eq("case_id", c.id)
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        for (const r of data) {
          igCorpus.push({
            url: r.url ?? "",
            caption: r.caption ?? "",
            views: r.video_view_count ?? r.video_play_count ?? r.likes_count ?? 0,
          });
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }
    const ytCorpus: Vid[] = [];
    {
      const { data } = await supabase
        .from("yt_videos")
        .select("title, description, url, view_count")
        .eq("case_id", c.id);
      for (const r of data ?? []) {
        ytCorpus.push({
          url: r.url ?? "",
          caption: `${r.title ?? ""}\n${(r.description ?? "").slice(0, 200)}`.trim(),
          views: r.view_count ?? 0,
        });
      }
    }
    keywords.ig = computeUspKeywords(igCorpus.map((v) => ({ caption: v.caption })), brand).usp_keywords.slice(0, 24);
    keywords.yt = computeUspKeywords(ytCorpus.map((v) => ({ caption: v.caption })), brand).usp_keywords.slice(0, 24);

    // all = 세 채널 키워드 count 병합
    const mergeMap = new Map<string, Kw>();
    for (const list of [keywords.tk, keywords.ig, keywords.yt]) {
      for (const k of list) {
        const cur = mergeMap.get(k.keyword) ?? { keyword: k.keyword, count: 0, pct: 0 };
        cur.count += k.count;
        cur.pct = Math.max(cur.pct, k.pct);
        mergeMap.set(k.keyword, cur);
      }
    }
    keywords.all = [...mergeMap.values()].sort((a, b) => b.count - a.count).slice(0, 24);

    // 샘플영상
    const matchIn = (corpus: Vid[], kw: string) =>
      corpus
        .filter((v) => v.caption.toLowerCase().includes(kw.toLowerCase()))
        .sort((a, b) => b.views - a.views)
        .slice(0, 3);
    for (const k of keywords.ig) videos.ig[k.keyword] = matchIn(igCorpus, k.keyword);
    for (const k of keywords.yt) videos.yt[k.keyword] = matchIn(ytCorpus, k.keyword);

    // TK 샘플영상 — contents ilike (기존 로직, 병렬)
    if (brand_id && keywords.tk.length > 0) {
      const results = await Promise.all(
        keywords.tk.map((k) =>
          supabase
            .from("contents")
            .select("url, caption, views")
            .eq("brand_id", brand_id)
            .eq("country", c.country)
            .ilike("caption", `%${k.keyword}%`)
            .order("views", { ascending: false, nullsFirst: false })
            .limit(3)
            .then((r) => ({ kw: k.keyword, data: r.data })),
        ),
      );
      for (const { kw, data } of results) {
        if (data && data.length > 0) {
          videos.tk[kw] = data.map((r) => ({ url: r.url, caption: r.caption ?? "", views: r.views ?? 0 }));
        }
      }
    }
    // all 샘플영상 = kw 별 tk+ig+yt 매칭 합쳐 views top3
    for (const k of keywords.all) {
      const combined = [
        ...(videos.tk[k.keyword] ?? []),
        ...matchIn(igCorpus, k.keyword),
        ...matchIn(ytCorpus, k.keyword),
      ]
        .sort((a, b) => b.views - a.views)
        .slice(0, 3);
      if (combined.length > 0) videos.all[k.keyword] = combined;
    }

    return { keywords, videos };
  })();
  const uspByChannel = uspBundle.keywords;
  const uspVideosByChannel = uspBundle.videos;

  // ★ meta_clusters 보정 — 클러스터 step 이 타임아웃으로 key_stats 저장 전 죽어도
  //   content_clusters DB(is_meta + parent_cluster_id)에서 복원해 C 섹션이 안 비게.
  //   key_stats 에 meta_clusters 있으면 그걸 우선, 없으면 DB 복원.
  type MetaClusterUi = {
    id: string; name: string; description: string; hook_pattern: string;
    body_pattern: string; member_count: number;
    child_clusters: Array<{ id: string; name: string; member_count: number }>;
  };
  const metaClustersEffective: MetaClusterUi[] = await (async () => {
    const fromKs = (c.key_stats as { phase4b_clusters?: { meta_clusters?: MetaClusterUi[] } })?.phase4b_clusters?.meta_clusters;
    if (fromKs && fromKs.length > 0) return fromKs;
    const { data: ccRows } = await supabase
      .from("content_clusters")
      .select("id, name, description, hook_pattern, body_pattern, is_meta, parent_cluster_id, member_count, display_order")
      .eq("case_id", c.id);
    if (!ccRows || ccRows.length === 0) return fromKs ?? [];
    const metas = ccRows.filter((r) => r.is_meta).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const kidsByParent = new Map<string, typeof ccRows>();
    for (const r of ccRows) {
      if (!r.is_meta && r.parent_cluster_id) {
        const arr = kidsByParent.get(r.parent_cluster_id) ?? [];
        arr.push(r);
        kidsByParent.set(r.parent_cluster_id, arr);
      }
    }
    return metas.map((m) => {
      const kids = (kidsByParent.get(m.id) ?? []).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      return {
        id: m.id,
        name: m.name ?? "",
        description: m.description ?? "",
        hook_pattern: m.hook_pattern ?? "",
        body_pattern: m.body_pattern ?? "",
        member_count: m.member_count || kids.reduce((s, k) => s + (k.member_count ?? 0), 0),
        child_clusters: kids.map((k) => ({ id: k.id, name: k.name ?? "", member_count: k.member_count ?? 0 })),
      };
    });
  })();

  // SectionC 에 넘길 phase4b_clusters — key_stats 가 비어도 DB 복원본으로 meta_clusters 채움.
  const phase4bClustersForUi =
    metaClustersEffective.length > 0
      ? ({ ...(keyStats.phase4b_clusters ?? ({} as NonNullable<typeof keyStats.phase4b_clusters>)), meta_clusters: metaClustersEffective })
      : keyStats.phase4b_clusters;

  // ★ Cluster 통합 집계 — 채널별(all/tk/ig/yt) 재집계.
  //    멤버에 platform+external_ref 가 있어 TK(contents)/IG(ig_posts)/YT(yt_videos)
  //    를 통합 멤버 리스트로 정규화 → 채널 subset 별로 metrics/topVideos/tier/heatmap/gmv 산출.
  //    clusterChannelBreakdown(채널 필터 토글용 카운트)은 별도 유지.
  const clusterBundle = await (async () => {
    type TierKey = "mega" | "macro" | "mid" | "micro" | "nano" | "sub-nano" | "unknown";
    type ChKey = "tk" | "ig" | "yt";
    const TIERS: TierKey[] = ["mega", "macro", "mid", "micro", "nano", "sub-nano", "unknown"];
    const tierOf = (n: number | null | undefined): TierKey => {
      if (n == null) return "unknown";
      if (n >= 1_000_000) return "mega";
      if (n >= 500_000) return "macro";
      if (n >= 100_000) return "mid";
      if (n >= 10_000) return "micro";
      if (n >= 1_000) return "nano";
      return "sub-nano";
    };

    type CSlice = {
      clusterMetrics: Record<string, { avg_views: number; paid_count: number; save_rate_pct: number; member_count: number }>;
      clusterTopVideos: Record<string, Array<{ url: string; views: number; caption: string | null }>>;
      tierClusterHeatmap: { tiers: TierKey[]; metas: Array<{ id: string; name: string }>; cells: Record<string, Record<string, number>> };
      clusterGmvByMonth: Record<string, Record<string, number>>;
      heatmap: Array<{ meta_id: string; meta_name: string; total_videos: number; total_views: number; cells: Array<{ month: string; video_count: number; views_sum: number; paid_count: number }> }>;
      month_order: string[];
    };
    const emptySlice = (metas: Array<{ id: string; name: string }>): CSlice => ({
      clusterMetrics: {},
      clusterTopVideos: {},
      tierClusterHeatmap: { tiers: TIERS, metas, cells: {} },
      clusterGmvByMonth: {},
      heatmap: [],
      month_order: [],
    });
    const emptyBundle = {
      clusterChannelBreakdown: {} as Record<string, { tk: number; ig: number; yt: number }>,
      channelData: { all: emptySlice([]), tk: emptySlice([]), ig: emptySlice([]), yt: emptySlice([]) } as Record<"all" | ChKey, CSlice>,
    };

    const metaList = metaClustersEffective;
    if (metaList.length === 0) return emptyBundle;
    const metasMeta = metaList.map((m) => ({ id: m.id, name: m.name }));
    const metaNameById = new Map(metasMeta.map((m) => [m.id, m.name]));
    const childToMeta = new Map<string, string>();
    for (const m of metaList) for (const cc of m.child_clusters ?? []) childToMeta.set(cc.id, m.id);
    const childIds = [...childToMeta.keys()];
    if (childIds.length === 0) return emptyBundle;

    // ① cluster_members fetch (platform + content_id + external_ref)
    const memberChunks: string[][] = [];
    for (let i = 0; i < childIds.length; i += 200) memberChunks.push(childIds.slice(i, i + 200));
    const memberResults = await Promise.all(
      memberChunks.map((slice) =>
        supabase
          .from("content_cluster_members")
          .select("cluster_id, platform, content_id, external_ref")
          .in("cluster_id", slice),
      ),
    );
    const allMembers: Array<{ cluster_id: string; platform: string; content_id: string | null; external_ref: string | null }> = [];
    for (const r of memberResults) for (const row of r.data ?? []) allMembers.push(row);

    // clusterChannelBreakdown
    const breakdown = emptyBundle.clusterChannelBreakdown;
    for (const r of allMembers) {
      const metaId = childToMeta.get(r.cluster_id);
      if (!metaId) continue;
      if (!breakdown[metaId]) breakdown[metaId] = { tk: 0, ig: 0, yt: 0 };
      if (r.platform === "tiktok") breakdown[metaId].tk += 1;
      else if (r.platform === "instagram") breakdown[metaId].ig += 1;
      else if (r.platform === "youtube") breakdown[metaId].yt += 1;
    }

    // ② 채널별 source fetch (TK contents / IG ig_posts / YT yt_videos)
    const tkMembers = allMembers.filter((r) => r.platform === "tiktok" && r.content_id);
    const igMembers = allMembers.filter((r) => r.platform === "instagram" && r.external_ref);
    const ytMembers = allMembers.filter((r) => r.platform === "youtube" && r.external_ref);
    const tkIds = [...new Set(tkMembers.map((m) => m.content_id!))];
    const igRefs = [...new Set(igMembers.map((m) => m.external_ref!))];
    const ytRefs = [...new Set(ytMembers.map((m) => m.external_ref!))];

    const chunk = (arr: string[], n = 200) => {
      const out: string[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    const [tkRows, igRows, ytRows] = await Promise.all([
      tkIds.length === 0 ? Promise.resolve([] as Array<Record<string, unknown>>) : Promise.all(
        chunk(tkIds).map((slice) =>
          supabase.from("contents").select("id, url, views, caption, is_ad, collect_count, influencer_id, uploaded_at").in("id", slice),
        ),
      ).then((res) => res.flatMap((r) => r.data ?? [])),
      igRefs.length === 0 ? Promise.resolve([] as Array<Record<string, unknown>>) : Promise.all(
        chunk(igRefs).map((slice) =>
          supabase.from("ig_posts").select("ig_id, url, caption, video_view_count, video_play_count, likes_count, posted_at, paid_signal").eq("case_id", c.id).in("ig_id", slice),
        ),
      ).then((res) => res.flatMap((r) => r.data ?? [])),
      ytRefs.length === 0 ? Promise.resolve([] as Array<Record<string, unknown>>) : Promise.all(
        chunk(ytRefs).map((slice) =>
          supabase.from("yt_videos").select("yt_id, url, title, description, view_count, uploaded_at, paid_signal, subscriber_count").eq("case_id", c.id).in("yt_id", slice),
        ),
      ).then((res) => res.flatMap((r) => r.data ?? [])),
    ]);

    // ③ influencers (TK tier)
    const inflIds = [...new Set(tkRows.map((r) => r.influencer_id as string | null).filter((x): x is string => !!x))];
    const tierByInfl = new Map<string, TierKey>();
    if (inflIds.length > 0) {
      const inflResults = await Promise.all(
        chunk(inflIds).map((slice) => supabase.from("influencers").select("id, follower_count").in("id", slice)),
      );
      for (const r of inflResults) for (const row of r.data ?? []) tierByInfl.set(row.id, tierOf(row.follower_count));
    }

    // ④ Kalodata gmv map (TK only)
    const kdVids = (keyStats as unknown as { kalodata_videos_xlsx?: Array<{ video_url: string | null; publish_date: string | null; revenue_usd: number | null }> }).kalodata_videos_xlsx ?? [];
    const kdMap = new Map<string, { month: string; gmv: number }>();
    for (const v of kdVids) {
      if (!v.video_url || !v.publish_date || (v.revenue_usd ?? 0) <= 0) continue;
      kdMap.set(v.video_url, { month: v.publish_date.slice(0, 7), gmv: v.revenue_usd ?? 0 });
    }

    // ⑤ 통합 멤버 정규화
    type UM = {
      metaId: string; ch: ChKey; url: string; views: number; caption: string | null;
      is_ad: boolean; tier: TierKey; month: string | null; saveRate: number | null;
      gmv: { month: string; gmv: number } | null;
    };
    const tkSrc = new Map(tkRows.map((r) => [r.id as string, r]));
    const igSrc = new Map(igRows.map((r) => [r.ig_id as string, r]));
    const ytSrc = new Map(ytRows.map((r) => [r.yt_id as string, r]));
    const unified: UM[] = [];

    for (const m of tkMembers) {
      const metaId = childToMeta.get(m.cluster_id);
      const s = tkSrc.get(m.content_id!);
      if (!metaId || !s) continue;
      const views = (s.views as number) ?? 0;
      const collect = (s.collect_count as number) ?? 0;
      const url = (s.url as string) ?? "";
      unified.push({
        metaId, ch: "tk", url, views, caption: (s.caption as string | null) ?? null,
        is_ad: !!s.is_ad,
        tier: s.influencer_id ? tierByInfl.get(s.influencer_id as string) ?? "unknown" : "unknown",
        month: s.uploaded_at ? String(s.uploaded_at).slice(0, 7) : null,
        saveRate: views > 0 && collect > 0 ? (collect / views) * 100 : null,
        gmv: kdMap.get(url) ?? null,
      });
    }
    for (const m of igMembers) {
      const metaId = childToMeta.get(m.cluster_id);
      const s = igSrc.get(m.external_ref!);
      if (!metaId || !s) continue;
      unified.push({
        metaId, ch: "ig", url: (s.url as string) ?? "",
        views: ((s.video_view_count as number) ?? (s.video_play_count as number) ?? (s.likes_count as number) ?? 0),
        caption: (s.caption as string | null) ?? null,
        is_ad: !!s.paid_signal, tier: "unknown",
        month: s.posted_at ? String(s.posted_at).slice(0, 7) : null,
        saveRate: null, gmv: null,
      });
    }
    for (const m of ytMembers) {
      const metaId = childToMeta.get(m.cluster_id);
      const s = ytSrc.get(m.external_ref!);
      if (!metaId || !s) continue;
      unified.push({
        metaId, ch: "yt", url: (s.url as string) ?? "",
        views: (s.view_count as number) ?? 0,
        caption: `${(s.title as string) ?? ""}\n${((s.description as string) ?? "").slice(0, 200)}`.trim() || null,
        is_ad: !!s.paid_signal, tier: tierOf(s.subscriber_count as number | null),
        month: s.uploaded_at ? String(s.uploaded_at).slice(0, 7) : null,
        saveRate: null, gmv: null,
      });
    }

    // ⑥ 채널 subset 별 집계
    const aggregate = (members: UM[]): CSlice => {
      const slice = emptySlice(metasMeta);
      for (const t of TIERS) slice.tierClusterHeatmap.cells[t] = {};
      const metricsAgg = new Map<string, { totalViews: number; n: number; paid: number; saveRates: number[] }>();
      const topVids = new Map<string, Array<{ url: string; views: number; caption: string | null }>>();
      const grid = new Map<string, { views_sum: number; video_count: number; paid_count: number }>(); // metaId|month
      const metaTotals = new Map<string, { views: number; videos: number }>();
      const monthSet = new Set<string>();

      for (const u of members) {
        // metrics
        const cur = metricsAgg.get(u.metaId) ?? { totalViews: 0, n: 0, paid: 0, saveRates: [] };
        cur.totalViews += u.views; cur.n += 1; if (u.is_ad) cur.paid += 1;
        if (u.saveRate != null) cur.saveRates.push(u.saveRate);
        metricsAgg.set(u.metaId, cur);
        // top videos
        if (!topVids.has(u.metaId)) topVids.set(u.metaId, []);
        topVids.get(u.metaId)!.push({ url: u.url, views: u.views, caption: u.caption });
        // tier
        slice.tierClusterHeatmap.cells[u.tier]![u.metaId] = (slice.tierClusterHeatmap.cells[u.tier]![u.metaId] ?? 0) + 1;
        // gmv
        if (u.gmv) {
          const gm = (slice.clusterGmvByMonth[u.metaId] ??= {});
          gm[u.gmv.month] = (gm[u.gmv.month] ?? 0) + u.gmv.gmv;
        }
        // heatmap grid
        if (u.month) {
          monthSet.add(u.month);
          const key = `${u.metaId}|${u.month}`;
          const g = grid.get(key) ?? { views_sum: 0, video_count: 0, paid_count: 0 };
          g.views_sum += u.views; g.video_count += 1; if (u.is_ad) g.paid_count += 1;
          grid.set(key, g);
          const tt = metaTotals.get(u.metaId) ?? { views: 0, videos: 0 };
          tt.views += u.views; tt.videos += 1; metaTotals.set(u.metaId, tt);
        }
      }
      for (const [metaId, v] of metricsAgg) {
        const sorted = [...v.saveRates].sort((a, b) => a - b);
        slice.clusterMetrics[metaId] = {
          avg_views: v.n > 0 ? Math.round(v.totalViews / v.n) : 0,
          paid_count: v.paid,
          save_rate_pct: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0,
          member_count: v.n,
        };
      }
      for (const [metaId, list] of topVids) slice.clusterTopVideos[metaId] = list.sort((a, b) => b.views - a.views).slice(0, 3);
      // heatmap rows — meta member_count desc, 데이터 있는 month 최근 12개
      slice.month_order = [...monthSet].sort().slice(-12);
      const metaOrder = [...metaTotals.entries()].sort((a, b) => b[1].videos - a[1].videos).map(([id]) => id);
      for (const metaId of metaOrder) {
        const tt = metaTotals.get(metaId)!;
        slice.heatmap.push({
          meta_id: metaId,
          meta_name: metaNameById.get(metaId) ?? metaId,
          total_videos: tt.videos,
          total_views: tt.views,
          cells: slice.month_order.map((mo) => {
            const g = grid.get(`${metaId}|${mo}`);
            return { month: mo, video_count: g?.video_count ?? 0, views_sum: g?.views_sum ?? 0, paid_count: g?.paid_count ?? 0 };
          }),
        });
      }
      return slice;
    };

    return {
      clusterChannelBreakdown: breakdown,
      channelData: {
        all: aggregate(unified),
        tk: aggregate(unified.filter((u) => u.ch === "tk")),
        ig: aggregate(unified.filter((u) => u.ch === "ig")),
        yt: aggregate(unified.filter((u) => u.ch === "yt")),
      } as Record<"all" | ChKey, CSlice>,
    };
  })();
  const clusterChannelBreakdown = clusterBundle.clusterChannelBreakdown;
  const clusterChannelData = clusterBundle.channelData;

  // ★ 5개 작은 SQL Promise.all 병렬 (dataRanges / kalodataInOtherCases / relatedCases / tierDistByChannel / igAuthors count)
  const [dataRanges, kalodataInOtherCases, relatedCases, tierDistByChannel, igAuthorsCounts] = await Promise.all([
    // 1) dataRanges — 각 채널 min/max date
    (async () => {
      const out: Record<string, { min: string | null; max: string | null }> = {};
      const tkBase = brand_id
        ? supabase.from("contents").select("uploaded_at").eq("brand_id", brand_id).eq("country", c.country).not("uploaded_at", "is", null)
        : null;
      const [
        tkMinRes, tkMaxRes, maMinRes, maMaxRes, igMinRes, igMaxRes, ytMinRes, ytMaxRes, cpsAllRes,
      ] = await Promise.all([
        tkBase ? tkBase.order("uploaded_at", { ascending: true }).limit(1) : Promise.resolve({ data: null as Array<{ uploaded_at: string | null }> | null }),
        tkBase ? tkBase.order("uploaded_at", { ascending: false }).limit(1) : Promise.resolve({ data: null as Array<{ uploaded_at: string | null }> | null }),
        supabase.from("meta_ads").select("start_date").eq("case_id", c.id).not("start_date", "is", null).order("start_date", { ascending: true }).limit(1),
        supabase.from("meta_ads").select("start_date").eq("case_id", c.id).not("start_date", "is", null).order("start_date", { ascending: false }).limit(1),
        supabase.from("ig_posts").select("posted_at").eq("case_id", c.id).not("posted_at", "is", null).order("posted_at", { ascending: true }).limit(1),
        supabase.from("ig_posts").select("posted_at").eq("case_id", c.id).not("posted_at", "is", null).order("posted_at", { ascending: false }).limit(1),
        supabase.from("yt_videos").select("uploaded_at").eq("case_id", c.id).not("uploaded_at", "is", null).order("uploaded_at", { ascending: true }).limit(1),
        supabase.from("yt_videos").select("uploaded_at").eq("case_id", c.id).not("uploaded_at", "is", null).order("uploaded_at", { ascending: false }).limit(1),
        supabase.from("case_product_sales").select("period_start, period_end, product_id").eq("case_id", c.id).not("period_end", "is", null),
      ]);
      if (tkMinRes.data?.[0] || tkMaxRes.data?.[0]) {
        out.tiktok_video = {
          min: tkMinRes.data?.[0]?.uploaded_at?.slice(0, 10) ?? null,
          max: tkMaxRes.data?.[0]?.uploaded_at?.slice(0, 10) ?? null,
        };
      }
      if (maMinRes.data?.[0] || maMaxRes.data?.[0]) {
        out.meta_ads = { min: maMinRes.data?.[0]?.start_date ?? null, max: maMaxRes.data?.[0]?.start_date ?? null };
      }
      if (igMinRes.data?.[0] || igMaxRes.data?.[0]) {
        out.instagram = {
          min: igMinRes.data?.[0]?.posted_at?.slice(0, 10) ?? null,
          max: igMaxRes.data?.[0]?.posted_at?.slice(0, 10) ?? null,
        };
      }
      if (ytMinRes.data?.[0] || ytMaxRes.data?.[0]) {
        out.youtube = {
          min: ytMinRes.data?.[0]?.uploaded_at?.slice(0, 10) ?? null,
          max: ytMaxRes.data?.[0]?.uploaded_at?.slice(0, 10) ?? null,
        };
      }
      const cpsAll = cpsAllRes.data;
      if (cpsAll && cpsAll.length > 0) {
        const productIds = [...new Set(cpsAll.map((r) => r.product_id).filter(Boolean))] as string[];
        const chunks: string[][] = [];
        for (let i = 0; i < productIds.length; i += 200) chunks.push(productIds.slice(i, i + 200));
        const prodResults = await Promise.all(
          chunks.map((slice) => supabase.from("products").select("id, channel").in("id", slice)),
        );
        const channelByProduct = new Map<string, string>();
        for (const pr of prodResults) {
          for (const p of pr.data ?? []) if (p.channel) channelByProduct.set(p.id, String(p.channel));
        }
        const salesByCh = new Map<string, { min: string | null; max: string | null }>();
        for (const r of cpsAll) {
          const ch = r.product_id ? channelByProduct.get(r.product_id) : null;
          if (!ch) continue;
          const cur = salesByCh.get(ch) ?? { min: null, max: null };
          if (r.period_start && (!cur.min || r.period_start < cur.min)) cur.min = r.period_start;
          if (r.period_end && (!cur.max || r.period_end > cur.max)) cur.max = r.period_end;
          salesByCh.set(ch, cur);
        }
        for (const [ch, range] of salesByCh) {
          const key = ch === "amazon" ? "amazon" : ch === "tiktok_shop" ? "tt_shop" : ch === "shopee" ? "shopee" : null;
          if (key && (range.min || range.max)) out[key] = range;
        }
      }
      return out;
    })(),
    // 2) kalodataInOtherCases — 같은 brand 다른 case 의 kalodata 적재 hint
    (async () => {
      if (!brand_id) return [] as Array<{ id: string; country: string; channel: string | null; n_videos: number; n_xlsx: number; n_lives: number }>;
      const { data } = await supabase
        .from("cases")
        .select("id, country, channel, key_stats")
        .eq("brand_id", brand_id)
        .neq("id", c.id);
      return (data ?? [])
        .map((r) => {
          const ks = (r.key_stats ?? {}) as Record<string, unknown>;
          const n_videos = Array.isArray(ks.kalodata_videos) ? (ks.kalodata_videos as unknown[]).length : 0;
          const n_xlsx = Array.isArray(ks.kalodata_videos_xlsx) ? (ks.kalodata_videos_xlsx as unknown[]).length : 0;
          const n_lives = Array.isArray(ks.kalodata_lives) ? (ks.kalodata_lives as unknown[]).length : 0;
          return { id: r.id, country: r.country, channel: r.channel, n_videos, n_xlsx, n_lives };
        })
        .filter((r) => r.n_videos + r.n_xlsx + r.n_lives > 0);
    })(),
    // 3) relatedCases — 같은 country 다른 brand ready case 4개
    (async () => {
      if (!c.country) return [] as Array<{ label: string; href: string }>;
      const { data } = await supabase
        .from("cases")
        .select("id, country, brand:brands(name)")
        .eq("country", c.country)
        .neq("id", c.id)
        .eq("status", "ready")
        .limit(4);
      return (data ?? []).map((r) => ({
        label: `${(r.brand as unknown as { name: string } | null)?.name ?? "(no brand)"} (${r.country})`,
        href: `/cases/${r.id}`,
      }));
    })(),
    // 4) tierDistByChannel — TK/IG/YT 각 follower 기준 tier (IG/YT 한 번 fetch 후 igAuthorsCounts 계산 같이)
    (async () => {
      type TK2 = "mega" | "macro" | "mid" | "micro" | "nano" | "sub-nano" | "unknown";
      const empty = (): Record<TK2, number> => ({ mega: 0, macro: 0, mid: 0, micro: 0, nano: 0, "sub-nano": 0, unknown: 0 });
      const tierOf = (n: number | null | undefined): TK2 => {
        if (n == null) return "unknown";
        if (n >= 1_000_000) return "mega";
        if (n >= 500_000) return "macro";
        if (n >= 100_000) return "mid";
        if (n >= 10_000) return "micro";
        if (n >= 1_000) return "nano";
        return "sub-nano";
      };
      const out: Record<"tk" | "ig" | "yt", Record<TK2, number>> = { tk: empty(), ig: empty(), yt: empty() };
      const [igAuth, ytCh] = await Promise.all([
        supabase.from("ig_authors").select("followers").eq("case_id", c.id).limit(10000),
        supabase.from("yt_channels").select("subscriber_count").eq("case_id", c.id).limit(10000),
      ]);
      for (const a of igAuth.data ?? []) out.ig[tierOf(a.followers)] += 1;
      for (const ch of ytCh.data ?? []) out.yt[tierOf(ch.subscriber_count)] += 1;
      const tkTd = (c.key_stats as { phase3?: { tier_distribution?: Record<TK2, number> } })?.phase3?.tier_distribution;
      if (tkTd) out.tk = { ...empty(), ...tkTd };
      return out;
    })(),
    // 5) igAuthors total + with_followers — IgProfileScrapeBox 용
    (async () => {
      const [totalRes, withRes] = await Promise.all([
        supabase.from("ig_authors").select("id", { count: "exact", head: true }).eq("case_id", c.id),
        supabase.from("ig_authors").select("id", { count: "exact", head: true }).eq("case_id", c.id).not("followers", "is", null),
      ]);
      return { total: totalRes.count ?? 0, withFollowers: withRes.count ?? 0 };
    })(),
  ]);
  const igAuthorsTotal = igAuthorsCounts.total;
  const igAuthorsWithFollowers = igAuthorsCounts.withFollowers;

  // ★ 채널별 월별 티어 분포(명수) — Section A 티어 stack / Section B 월필터가 채널에 반응하도록.
  //   TK: phase3.tier_dist_by_month(기존). IG: ig_posts(월·작성자) ↔ ig_authors(followers→tier)
  //   의 월별 distinct 작성자 명수. YT: 데이터 없어 빈값. all = TK+IG 월별 병합.
  //   (버그: 기존엔 모든 채널이 phase3 TK 월별만 봐서 채널 바꿔도 티어가 동일했음)
  const monthlyTierByChannel = await (async () => {
    type TK3 = "mega" | "macro" | "mid" | "micro" | "nano" | "sub-nano" | "unknown";
    const tierOf = (n: number | null | undefined): TK3 =>
      n == null ? "unknown" : n >= 1_000_000 ? "mega" : n >= 500_000 ? "macro" : n >= 100_000 ? "mid" : n >= 10_000 ? "micro" : n >= 1_000 ? "nano" : "sub-nano";
    const emptyTd = (): Record<TK3, number> => ({ mega: 0, macro: 0, mid: 0, micro: 0, nano: 0, "sub-nano": 0, unknown: 0 });
    const tk = ((keyStats.phase3 as { tier_dist_by_month?: Record<string, Record<TK3, number>> } | undefined)?.tier_dist_by_month) ?? {};

    // IG 작성자 → tier
    const igTierByUser = new Map<string, TK3>();
    {
      const { data } = await supabase.from("ig_authors").select("username, followers").eq("case_id", c.id).limit(10000);
      for (const a of data ?? []) if (a.username) igTierByUser.set(a.username, tierOf(a.followers));
    }
    // IG 월별 tier → distinct 작성자
    const igMonthAuthors = new Map<string, Map<TK3, Set<string>>>();
    {
      let from = 0;
      for (;;) {
        const { data } = await supabase.from("ig_posts").select("owner_username, posted_at").eq("case_id", c.id).range(from, from + 999);
        if (!data || data.length === 0) break;
        for (const p of data) {
          if (!p.owner_username || !p.posted_at) continue;
          const mo = String(p.posted_at).slice(0, 7);
          const tier = igTierByUser.get(p.owner_username) ?? "unknown";
          let mm = igMonthAuthors.get(mo);
          if (!mm) { mm = new Map(); igMonthAuthors.set(mo, mm); }
          let st = mm.get(tier);
          if (!st) { st = new Set(); mm.set(tier, st); }
          st.add(p.owner_username);
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }
    const ig: Record<string, Record<TK3, number>> = {};
    for (const [mo, mm] of igMonthAuthors) {
      const td = emptyTd();
      for (const [tier, set] of mm) td[tier] = set.size;
      ig[mo] = td;
    }
    // all = TK + IG 월별 명수 병합
    const all: Record<string, Record<TK3, number>> = {};
    for (const src of [tk, ig]) {
      for (const mo of Object.keys(src)) {
        if (!all[mo]) all[mo] = emptyTd();
        const s = src[mo]!;
        for (const k of Object.keys(s) as TK3[]) all[mo][k] += s[k] ?? 0;
      }
    }
    return { all, tk, ig, yt: {} as Record<string, Record<TK3, number>> };
  })();

  // ★ IG / YT Top 작성자 박힘 박힘 Top 3 영상 fetch — SectionBMockup 클릭 → iframe embed 박힘 박힘.
  const [igTopAuthorVideos, ytTopChannelVideos] = await Promise.all([
    (async () => {
      const usernames = igTopAuthors.slice(0, 25).map((a) => a.username).filter(Boolean);
      const map = new Map<string, Array<{ url: string; views: number; caption: string | null }>>();
      if (usernames.length === 0) return map;
      const { data } = await supabase
        .from("ig_posts")
        .select("owner_username, url, video_play_count, likes_count, caption")
        .eq("case_id", c.id)
        .in("owner_username", usernames)
        .order("likes_count", { ascending: false, nullsFirst: false })
        .limit(usernames.length * 20);
      for (const p of data ?? []) {
        const owner = (p as { owner_username?: string | null }).owner_username;
        const url = (p as { url?: string | null }).url;
        if (!owner || !url) continue;
        const cur = map.get(owner) ?? [];
        if (cur.length >= 3) continue; // 박힘 박힘 박힘 박힘 박힘 박힘 박힘 likes desc 박힘 박힘 박힘 박힘 3 박힘 박힘
        const views = (p as { video_play_count?: number | null }).video_play_count
          ?? (p as { likes_count?: number | null }).likes_count
          ?? 0;
        const caption = (p as { caption?: string | null }).caption;
        cur.push({ url, views, caption: caption ? caption.slice(0, 100) : null });
        map.set(owner, cur);
      }
      return map;
    })(),
    (async () => {
      const names = ytTopChannels.slice(0, 25).map((c2) => c2.channel_name).filter(Boolean);
      const map = new Map<string, Array<{ url: string; views: number; caption: string | null }>>();
      if (names.length === 0) return map;
      const { data } = await supabase
        .from("yt_videos")
        .select("channel_name, url, views, title")
        .eq("case_id", c.id)
        .in("channel_name", names)
        .order("views", { ascending: false, nullsFirst: false })
        .limit(names.length * 20);
      for (const v of data ?? []) {
        const ch = (v as { channel_name?: string | null }).channel_name;
        const url = (v as { url?: string | null }).url;
        if (!ch || !url) continue;
        const cur = map.get(ch) ?? [];
        if (cur.length >= 3) continue;
        const views = (v as { views?: number | null }).views ?? 0;
        const title = (v as { title?: string | null }).title;
        cur.push({ url, views, caption: title ? title.slice(0, 100) : null });
        map.set(ch, cur);
      }
      return map;
    })(),
  ]);

  // 5b. 비용 추정
  const costEstimate = estimateCost({
    channel: c.channel,
    brand_keyword: c.brand_keyword,
    brand_meta_pages: c.brand_meta_pages,
    tiktok_shop_store_url: c.tiktok_shop_store_url,
    hasApifyToken: !!process.env.APIFY_TOKEN,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  });

  // CaseStatusStrip 용 — data_channels별 row 수 매핑.
  // 각 phase의 stats에서 해당 채널 수치 뽑아서 strip에 한 줄로 노출.
  // ★ case.data_channels 만 의존 X — phase 결과 또는 products 있으면 자동 active (upload action 이 컬럼 update 안 해도 detect)
  const dataChannelsRaw = (c.data_channels ?? []) as DataChannel[];
  const dataChannels: DataChannel[] = (() => {
    const set = new Set<DataChannel>(dataChannelsRaw);
    const ksAuto = (c.key_stats ?? {}) as {
      phase2?: { total_contents?: number; sales_summary?: { total_revenue?: number } };
      phase4a?: { total_ads?: number };
      phase4c?: { total_unique?: number; total_posts?: number };
      phase4d?: { total_unique?: number; total_videos?: number };
    };
    if ((ksAuto.phase2?.total_contents ?? 0) > 0) set.add("tiktok_video");
    if ((ksAuto.phase4a?.total_ads ?? 0) > 0) set.add("meta_ads");
    if ((ksAuto.phase4c?.total_unique ?? ksAuto.phase4c?.total_posts ?? 0) > 0) set.add("instagram");
    if ((ksAuto.phase4d?.total_unique ?? ksAuto.phase4d?.total_videos ?? 0) > 0) set.add("youtube");
    // 매출 채널 (products.channel 분포 기반)
    for (const ch of availableSalesChannels ?? []) {
      if (ch === "amazon") set.add("amazon");
      else if (ch === "tiktok_shop") set.add("tt_shop");
      else if (ch === "shopee") set.add("shopee");
    }
    return [...set];
  })();
  const ksForStrip = (c.key_stats ?? {}) as {
    phase2?: { total_contents?: number; sales_summary?: { total_revenue?: number } };
    phase4a?: { total_ads?: number };
    phase4c?: { total_posts?: number };
    phase4d?: { total_videos?: number };
  };
  const channelStats: Partial<Record<DataChannel, string>> = {};
  if (dataChannels.includes("tiktok_video") && ksForStrip.phase2?.total_contents) {
    const n = ksForStrip.phase2.total_contents;
    channelStats.tiktok_video = n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
  }
  if (dataChannels.includes("meta_ads") && ksForStrip.phase4a?.total_ads) {
    channelStats.meta_ads = `${ksForStrip.phase4a.total_ads}`;
  }
  if (dataChannels.includes("instagram") && ksForStrip.phase4c?.total_posts) {
    channelStats.instagram = `${ksForStrip.phase4c.total_posts}`;
  }
  if (dataChannels.includes("youtube") && ksForStrip.phase4d?.total_videos) {
    channelStats.youtube = `${ksForStrip.phase4d.total_videos}`;
  }
  if (dataChannels.includes("amazon") || dataChannels.includes("tt_shop") || dataChannels.includes("shopee")) {
    const rev = ksForStrip.phase2?.sales_summary?.total_revenue;
    if (rev) {
      const label = rev >= 1_000_000
        ? `$${(rev / 1_000_000).toFixed(1)}M`
        : rev >= 1000
          ? `$${(rev / 1000).toFixed(0)}K`
          : `$${rev}`;
      if (dataChannels.includes("amazon")) channelStats.amazon = label;
      if (dataChannels.includes("tt_shop")) channelStats.tt_shop = label;
      if (dataChannels.includes("shopee")) channelStats.shopee = label;
    }
  }

  return (
    <>
      <div className="bp-mockup">
        <CaseStatusStripMockup
          brand={brand}
          country={c.country}
          channel={c.channel}
          status={c.status}
          revenueTier={
            c.revenue_tier ? `★${"★".repeat(Math.max(0, Number(c.revenue_tier) - 1))}` : null
          }
          dataChannels={dataChannels}
          channelStats={channelStats}
          analyzedAt={c.analyzed_at}
          actions={
            <CaseHeader
              case_id={c.id}
              brand={brand}
              country={c.country}
              channel={c.channel}
              status={c.status}
              revenueTier={c.revenue_tier}
              regionScope={regionScope}
              createdAt={c.created_at}
              updatedAt={c.updated_at}
              actionsOnly
            />
          }
        />
      </div>
    <div style={{ padding: "24px 32px", maxWidth: 1680 }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <CaseSideTOC />

        <div style={{ minWidth: 0 }}>
        {/* CaseHeaderMockup 제거 — status-strip 상단 dark bar 안 흡수됨 (brand / tier / actions). */}

      {/* Status branch */}
      {c.status === "draft" ? (
        <>
          {/* ★ Phase 4: 데이터 채널 그리드 — 활성/비활성 한눈에. 입력은 Section 02 토글 유지 */}
          <div id="sec-channels" style={{ scrollMarginTop: 80 }} />
          <DataChannelGrid
            cards={[
              "tiktok_video" as DataChannel,
              "amazon" as DataChannel,
              "tt_shop" as DataChannel,
              "shopee" as DataChannel,
              "meta_ads" as DataChannel,
              "instagram" as DataChannel,
              "youtube" as DataChannel,
            ].map((ch) => ({
              channel: ch,
              active: dataChannels.includes(ch),
              stat: channelStats[ch],
              sub: dataChannels.includes(ch)
                ? "활성"
                : "이 케이스 사용 안 함",
            }))}
          />

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

            {/* Kalodata — 모든 tiktok_shop(US 포함). US는 Helium10/어필리에이트와 함께 선택 가능. */}
            {c.channel === "tiktok_shop" && (
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
        // A 모델: 데이터 추가 details 통째 제거. 각 entry 는 DataChannelsMockup 카드 클릭 시
        // 인라인 expand panel 안 render (channelEntries prop). channel 분기 제거 — 모든 entry 항상.
        <>

          {/* IG/YT prep/postlearn/brand monitor 박스 통째 제거 — mockup 에 없음.
              IG/YT 데이터는 이미 case_id 기반 phase4c/4d 로 분석되어 mockup A/B/C 안 통합됨. */}

          {(() => {
            const ks = (c.key_stats ?? {}) as {
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
            };
            const lastError = ks.last_error;
            // phase2 없으면 mockup main path 그대로 가되 SectionA~E + G 만 skip (이미 그 guard 박힘).
            // KPI / 데이터 채널 / Phase Progress 는 phase2 없어도 표시 — 사용자가 데이터 채널 카드 클릭해서 적재 가능해야.
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

                <div id="sec-kpi" style={{ scrollMarginTop: 80 }} />
                {/* ★ Phase 5-A: 상단 KpiStrip + 데이터 채널 + Phase Progress — phase2 없어도 데이터 채널 카드 노출 */}
                {(() => {
                  const totalVids = ks.phase2?.total_contents ?? 0;
                  const totalInf = ks.phase2?.total_unique_creators ?? 0;
                  // Phase 2 의 ig_total_videos 가 옛 cache 값일 수 있음 → phase4c.total_unique 직접 사용 (더 신선)
                  const igTotal =
                    (ks as { phase4c?: { total_unique?: number; total_posts?: number; unique_authors?: number } }).phase4c?.total_unique ??
                    (ks as { phase4c?: { total_posts?: number } }).phase4c?.total_posts ??
                    0;
                  const igAuthors = (ks as { phase4c?: { unique_authors?: number } }).phase4c?.unique_authors ?? 0;
                  const ytTotal =
                    (ks as { phase4d?: { total_unique?: number; total_videos?: number; unique_channels?: number } }).phase4d?.total_unique ??
                    (ks as { phase4d?: { total_videos?: number } }).phase4d?.total_videos ??
                    0;
                  const ytChannels = (ks as { phase4d?: { unique_channels?: number } }).phase4d?.unique_channels ?? 0;
                  const allVids = totalVids + igTotal + ytTotal;
                  // 인플 풀 = TK creators + IG authors + YT channels (단순 합산, 중복은 cross-channel matrix 에서만 dedup)
                  const allInf = totalInf + igAuthors + ytChannels;
                  // sum view (top_creators max_views top 100 합산 → 근사)
                  const tcViews = (ks.phase2?.top_creators ?? []).reduce(
                    (s, c) => s + (c.max_views ?? 0),
                    0,
                  );
                  const viewsLabel = tcViews >= 1_000_000_000
                    ? `${(tcViews / 1_000_000_000).toFixed(1)}B`
                    : tcViews >= 1_000_000
                      ? `${Math.round(tcViews / 1_000_000)}M`
                      : `${Math.round(tcViews / 1000)}K`;

                  const rev = ks.phase2?.sales_summary?.total_revenue;
                  const salesLabel = rev
                    ? rev >= 1_000_000
                      ? `$${(rev / 1_000_000).toFixed(1)}M`
                      : `$${Math.round(rev / 1000)}K`
                    : null;

                  const adTotal = ks.phase4a?.total_ads ?? 0;
                  const adPartner = ks.phase4a?.partnership_creators ?? 0;

                  return (
                    <div className="bp-mockup">
                      <SectionBoundary name="KPI 스트립">
                      <KpiStripMockup
                        totalVideos={allVids}
                        videoBreakdown={`TK ${totalVids.toLocaleString()} · IG ${igTotal.toLocaleString()} · YT ${ytTotal.toLocaleString()}`}
                        totalCreators={allInf}
                        creatorBreakdown={`TK ${totalInf} · IG ${igAuthors} · YT ${ytChannels}`}
                        totalViews={tcViews}
                        viewBreakdown={"top creator 합산 추정"}
                        ttShopGmv30d={rev ?? null}
                        gmvTrend={(() => {
                          const summary = ks.phase2?.sales_summary;
                          if (!summary) return undefined;
                          const prev = summary.prev_period_revenue;
                          const cur = summary.total_revenue ?? 0;
                          const skuLabel = summary.sku_count
                            ? ` · ${summary.sku_count} SKU`
                            : "";
                          if (prev != null && prev > 0) {
                            const pct = ((cur - prev) / prev) * 100;
                            const arrow = pct >= 0 ? "▲" : "▼";
                            return `${arrow} ${Math.abs(pct).toFixed(0)}% vs 직전${skuLabel}`;
                          }
                          return summary.sku_count ? `${summary.sku_count} SKU` : undefined;
                        })()}
                        metaAds={adTotal}
                        metaBreakdown={adTotal > 0 ? `brand ${(ks.phase4a?.brand_official_ads ?? 0)} · partner ${adPartner}` : undefined}
                        costEstimate={costEstimate.total_max_usd}
                        costBreakdown={"예상 최대"}
                      />
                      </SectionBoundary>
                      {/* Phase progress — KPI 바로 다음으로 이동 (사용자 요청) */}
                      <PhaseProgressMockup ks={ks as KeyStats} case_id={c.id} />
                      {/* mockup line 542-559: 데이터 채널 — sub 풍부화 (mockup 형식 일치) */}
                      <DataChannelsMockup
                        case_id={c.id}
                        dataChannels={dataChannels}
                        channelDetails={(() => {
                          const tkViews = (ks.phase2?.top_creators ?? []).reduce((s, c) => s + (c.max_views ?? 0), 0);
                          const fmtViews = (n: number) =>
                            n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
                          const fmtUsd = (n: number) =>
                            n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
                          // 데이터 수집 기간 라벨 ("2025-08-01 ~ 2026-05-26")
                          const rangeLabel = (key: string): string | null => {
                            const r = dataRanges[key];
                            if (!r || (!r.min && !r.max)) return null;
                            return `📅 ${r.min ?? "?"} ~ ${r.max ?? "?"}`;
                          };
                          const subWith = (key: string, base: string): string => {
                            const r = rangeLabel(key);
                            return r ? `${r} · ${base}` : base;
                          };
                          const details: Partial<Record<DataChannel, { stat: string; sub?: string }>> = {};
                          if (dataChannels.includes("tiktok_video")) {
                            const n = ks.phase2?.total_contents ?? 0;
                            details.tiktok_video = {
                              stat: `${n.toLocaleString()} 영상 · ${fmtViews(tkViews)} views`,
                              sub: subWith("tiktok_video", "Exolyt CSV"),
                            };
                          }
                          if (dataChannels.includes("tt_shop")) {
                            const skun = ks.phase2?.sales_summary?.sku_count ?? 0;
                            const rev = ks.phase2?.sales_summary?.total_revenue ?? 0;
                            details.tt_shop = {
                              stat: `${skun} 제품${rev > 0 ? ` · ${fmtUsd(rev)} GMV` : ""}`,
                              sub: subWith("tt_shop", "store URL · Helium10"),
                            };
                          }
                          if (dataChannels.includes("meta_ads")) {
                            const ads = ks.phase4a?.total_ads ?? 0;
                            const partner = ks.phase4a?.partnership_creators ?? 0;
                            details.meta_ads = {
                              stat: `${ads.toLocaleString()} 광고${partner > 0 ? ` · ${partner} partnership` : ""}`,
                              sub: subWith("meta_ads", `하이브리드 $${(ks.phase4a?.cost_actual_usd ?? 0).toFixed(2)}`),
                            };
                          }
                          if (dataChannels.includes("instagram")) {
                            const ph4c = (ks as { phase4c?: { total_unique?: number; unique_authors?: number } }).phase4c;
                            const posts = ph4c?.total_unique ?? 0;
                            const authors = ph4c?.unique_authors ?? 0;
                            details.instagram = {
                              stat: `${posts.toLocaleString()} posts${authors > 0 ? ` · ${authors} authors` : ""}`,
                              sub: subWith("instagram", "Phase 4c"),
                            };
                          }
                          if (dataChannels.includes("youtube")) {
                            const ph4d = (ks as { phase4d?: { total_unique?: number; unique_channels?: number } }).phase4d;
                            const vids = ph4d?.total_unique ?? 0;
                            const chans = ph4d?.unique_channels ?? 0;
                            details.youtube = {
                              stat: `${vids.toLocaleString()} 영상${chans > 0 ? ` · ${chans} 채널` : ""}`,
                              sub: subWith("youtube", "Phase 4d"),
                            };
                          }
                          if (dataChannels.includes("amazon")) {
                            const rev = ks.phase2?.sales_summary?.total_revenue ?? 0;
                            details.amazon = {
                              stat: rev > 0 ? `${fmtUsd(rev)} 매출` : "—",
                              sub: subWith("amazon", "Amazon"),
                            };
                          }
                          if (dataChannels.includes("shopee")) {
                            const rev = ks.phase2?.sales_summary?.total_revenue ?? 0;
                            details.shopee = {
                              stat: rev > 0 ? `${fmtUsd(rev)} 매출` : "—",
                              sub: subWith("shopee", "Shopee"),
                            };
                          }
                          return details;
                        })()}
                        channelEntries={{
                          tiktok_video: (
                            <>
                              <ExolytSection
                                case_id={c.id}
                                hasContents={(contentCount ?? 0) > 0 && !reusedAlready && !reusable}
                                reusable={reusable}
                                reusedAlready={reusedAlready}
                                contentCount={contentCount ?? 0}
                              />
                              <BrandViewTrendsSection case_id={c.id} existingWeeks={weeklyViews.length} />
                            </>
                          ),
                          youtube: (
                            <>
                              <YoutubeSeedingSection
                                case_id={c.id}
                                existingRuns={
                                  Array.isArray((c.key_stats as { youtube_seeding_runs?: unknown[] })?.youtube_seeding_runs)
                                    ? (c.key_stats as { youtube_seeding_runs: unknown[] }).youtube_seeding_runs.length
                                    : 0
                                }
                              />
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
                            </>
                          ),
                          instagram: (
                            <>
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
                                <IgProfileScrapeBox
                                  case_id={c.id}
                                  authorsTotal={igAuthorsTotal}
                                  authorsWithFollowers={igAuthorsWithFollowers}
                                />
                              )}
                            </>
                          ),
                          amazon: (
                            <>
                              <AmazonSalesSection
                                case_id={c.id}
                                skuRows={skuRows}
                                caseCountry={c.country}
                                exchangeRates={exchangeRates}
                                expectedChannel="amazon"
                              />
                              <BsrSection
                                case_id={c.id}
                                skuRows={skuRows.filter((s) => (s.channel ?? null) === "amazon")}
                                caseCountry={c.country}
                              />
                            </>
                          ),
                          shopee: <ShopdoraSection case_id={c.id} productCount={skuRows.length} />,
                          tt_shop: (
                            // US: Helium10 + 어필리에이트 + Kalodata 모두 선택 가능.
                            // 비US: Kalodata만.
                            <>
                              {c.country === "US" && (
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
                                      Object.keys((c.key_stats as { tt_shop_us_helium10?: Record<string, unknown> })?.tt_shop_us_helium10 ?? {}).length
                                    }
                                    hasUndo={
                                      ((c.key_stats as { _last_undo?: { type?: string } })?._last_undo?.type ?? "") === "helium10_product_finder"
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
                                      Array.isArray((c.key_stats as { tt_shop_us_affiliates?: unknown[] })?.tt_shop_us_affiliates)
                                        ? (c.key_stats as { tt_shop_us_affiliates: unknown[] }).tt_shop_us_affiliates.length
                                        : 0
                                    }
                                  />
                                </>
                              )}
                              <KalodataSection case_id={c.id} productCount={skuRows.length} />
                            </>
                          ),
                          meta_ads: (
                            <div style={{ padding: 12, fontSize: 11, color: "var(--color-info)", background: "var(--color-info-soft)", borderRadius: 6 }}>
                              📢 Meta 광고는 brand 설정에서 <code>brand_meta_pages</code> 또는 <code>brand_keyword</code> 박아야 자동 수집됩니다. brand 페이지에서 입력 후 Phase 4a 재실행.
                            </div>
                          ),
                        }}
                      />
                    </div>
                  );
                })()}

                <div id="sec-g" style={{ scrollMarginTop: 80 }} />
                {/* ★ G 종합 인사이트 — Phase 2: phase별 stats 자동 조립 (Phase 5 synthesis 도착 전까지 fallback) */}
                {(() => {
                  const axes: AxisCardData[] = [];
                  const ks2 = ks.phase2;
                  const ks3 = ks.phase3;
                  const ks4a = ks.phase4a;
                  const ks4bC = ks.phase4b_clusters;

                  // 제품 — Top SKU
                  if (ks2?.sku_sales && ks2.sku_sales.length > 0) {
                    const top = [...ks2.sku_sales]
                      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
                      .slice(0, 2);
                    const top2Names = top.map((s) => s.name?.slice(0, 18) ?? "").filter(Boolean).join(" + ");
                    const total = ks2.sku_sales.reduce((s, x) => s + (x.revenue ?? 0), 0);
                    const top2Sum = top.reduce((s, x) => s + (x.revenue ?? 0), 0);
                    const pct = total > 0 ? Math.round((top2Sum / total) * 100) : 0;
                    axes.push({
                      axis: "제품",
                      value: top2Names || "—",
                      sub: `Top 2 SKU가 매출 ${pct}%`,
                    });
                  }

                  // 인플
                  if (ks3?.tier_distribution) {
                    const t = ks3.tier_distribution;
                    const total = (t.mega ?? 0) + (t.macro ?? 0) + (t.mid ?? 0) + (t.micro ?? 0) + (t.nano ?? 0);
                    const microPct = total > 0 ? Math.round(((t.micro ?? 0) / total) * 100) : 0;
                    const megaCount = t.mega ?? 0;
                    axes.push({
                      axis: "인플",
                      value: `${total.toLocaleString()}명 (메가 ${megaCount})`,
                      sub: `마이크로 ${microPct}% · portfolio 분산`,
                    });
                  }

                  // 콘텐츠 — 메타 클러스터
                  if (ks4bC?.meta_clusters && ks4bC.meta_clusters.length > 0) {
                    const top = ks4bC.meta_clusters
                      .slice(0, 2)
                      .map((c) => c.name)
                      .join(" + ");
                    axes.push({
                      axis: "콘텐츠",
                      value: top || "—",
                      sub: `${ks4bC.meta_clusters.length} 클러스터 · USP 추출됨`,
                    });
                  }

                  // 채널
                  if (dataChannels.length > 0) {
                    const labels = dataChannels.map((d) => d.replace("_", " ")).join(" · ");
                    axes.push({
                      axis: "채널",
                      value: `${dataChannels.length} 채널 활성`,
                      sub: labels,
                    });
                  }

                  // 시즈널리티 — 월별 peak
                  if (ks2?.monthly_video_counts && ks2.monthly_video_counts.length > 0) {
                    const peak = [...ks2.monthly_video_counts].sort(
                      (a, b) => b.total - a.total,
                    )[0];
                    if (peak) {
                      axes.push({
                        axis: "시즈널리티",
                        value: `${peak.month} peak`,
                        sub: `${peak.total.toLocaleString()} 영상 · paid ${peak.total > 0 ? Math.round((peak.paid / peak.total) * 100) : 0}%`,
                      });
                    }
                  }

                  // 핵심 발견 (간단 자동)
                  const keyFindings: string[] = [];
                  if (ks2?.videos_per_creator) {
                    const single = ks2.videos_per_creator["1"] ?? 0;
                    const total = ks2.total_unique_creators ?? 0;
                    const pct = total > 0 ? Math.round((single / total) * 100) : 0;
                    if (pct > 0) {
                      keyFindings.push(`인플 portfolio — 1편만 만든 인플 ${pct}% (long-tail 패턴)`);
                    }
                  }
                  if (ks4a?.partnership_creators && ks4a.partnership_creators > 0) {
                    keyFindings.push(`Meta partnership 인플 ${ks4a.partnership_creators}명 · 광고 ${ks4a.partnership_ads}건`);
                  }
                  if (ks4bC?.meta_clusters && ks4bC.meta_clusters.length > 0) {
                    keyFindings.push(`viral 클러스터 ${ks4bC.meta_clusters.length}개 식별 · 콘텐츠 hook 패턴 추출`);
                  }
                  if (ks2?.sales_summary) {
                    keyFindings.push(`30일 매출 ${Math.round(ks2.sales_summary.total_revenue / 1000).toLocaleString()}K · SKU ${ks2.sales_summary.sku_count}`);
                  }

                  const oneLineSummary = `${brand} — 자동 종합 분석`;
                  const tagline = axes.map((a) => a.value).join(" × ");

                  // cross-platform 인플 — TK + IG + YT 통합 union
                  // 핸들 정규화 (소문자 + 영숫자만) 로 같은 인플 merge.
                  // 정렬: cross 채널 수 desc → 영상 합 desc. cross 인플 우선 노출.
                  const normH = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                  type CrossEntry = { name: string; tk: number; ig: number; yt: number };
                  const merged = new Map<string, CrossEntry>();
                  for (const tc of ks.phase2?.top_creators ?? []) {
                    const k = normH(tc.handle);
                    if (k.length < 3) continue;
                    const cur = merged.get(k) ?? { name: tc.handle, tk: 0, ig: 0, yt: 0 };
                    cur.tk = Math.max(cur.tk, tc.video_count);
                    merged.set(k, cur);
                  }
                  for (const m of crossPlatformMatches) {
                    const k = normH(m.name);
                    if (k.length < 3) continue;
                    const cur = merged.get(k) ?? { name: m.name, tk: 0, ig: 0, yt: 0 };
                    cur.ig = m.ig_posts;
                    cur.yt = m.yt_videos;
                    if (!cur.name || cur.name.length < m.name.length) cur.name = m.name;
                    merged.set(k, cur);
                  }
                  const allEntries = [...merged.values()].map((e) => {
                    const channels = [e.tk > 0 && "TK", e.ig > 0 && "IG", e.yt > 0 && "YT"].filter(Boolean) as string[];
                    return {
                      name: e.name,
                      channels: channels.join("·"),
                      channelCount: channels.length,
                      totalVideos: e.tk + e.ig + e.yt,
                    };
                  });
                  const crossPlatform = allEntries
                    .sort(
                      (a, b) =>
                        b.channelCount - a.channelCount || b.totalVideos - a.totalVideos,
                    )
                    .slice(0, 10);

                  return axes.length > 0 ? (
                    <div className="bp-mockup">
                      <SectionBoundary name="G 종합 인사이트(언어 포함)">
                      <InsightCardMockup
                        title={oneLineSummary}
                        tagline={tagline}
                        metaLine={(() => {
                          // mockup line 588: "주력 언어: 영어 78% · 스페인어 9% · UK 6%"
                          const langs = ks.phase5?.languages ?? [];
                          if (langs.length === 0) return undefined;
                          const top3 = langs.slice(0, 3);
                          return `주력 언어: ${top3.map((l) => `${l.label} ${Math.round(l.pct)}%`).join(" · ")}`;
                        })()}
                        axisCards={axes.map((a) => ({
                          h: a.axis,
                          val: a.value,
                          sub: a.sub,
                        }))}
                        keyFindings={keyFindings}
                        crossPlatform={crossPlatform.map((p) => ({
                          name: p.name,
                          channels: p.channels,
                          videos: p.totalVideos,
                        }))}
                        relatedCases={relatedCases}
                      />
                      </SectionBoundary>
                    </div>
                  ) : null;
                })()}

                {!ks.phase2 && (
                  <div
                    style={{
                      padding: 20,
                      background: "#fef3c7",
                      border: "1px dashed #fbbf24",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#92400e",
                      marginTop: 16,
                      lineHeight: 1.7,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      ⚠ 아직 분석 결과가 없는 케이스
                    </div>
                    <b>STEP 1.</b> 위 <b>📥 데이터 채널</b> 섹션에서 적재할 채널 카드 클릭 → expand panel
                    안 업로드 박스에서 데이터 적재 (TikTok Exolyt CSV / Amazon Helium10 / Kalodata / Meta 광고 등){" "}
                    <br />
                    <b>STEP 2.</b> 카드 닫기 후 같은 expand panel 안 <b>🟢 무료 phase 만 재실행</b>{" "}
                    버튼 클릭 → 적재한 데이터가 분석됨
                    <br />
                    <b>STEP 3.</b> 또는 위 <b>⚙️ Phase 진행 상태</b> 펼치기 → 개별 phase ↻ 누르기
                    <br />
                    <span style={{ fontSize: 11, color: "#b45309" }}>
                      ※ A/B/C/D/E 섹션 + G 인사이트는 Phase 2 (SQL 집계) 끝나야 보입니다.
                    </span>
                  </div>
                )}
                {ks.phase2 && (() => {
                  // SectionBMockup + MiniDashboard 공용 crossChannelMatrix (TK 매칭 포함)
                  const normHandle = (s: string) =>
                    s.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const tkByHandleMap = new Map<string, number>();
                  for (const tc of ks.phase2?.top_creators ?? []) {
                    const k = normHandle(tc.handle);
                    if (k.length >= 4) tkByHandleMap.set(k, tc.video_count);
                  }
                  const sharedMatrix = crossPlatformMatches.map((m) => {
                    const k = normHandle(m.name);
                    let tk = tkByHandleMap.get(k) ?? 0;
                    if (tk === 0 && k.length >= 5) {
                      for (const [tkKey, count] of tkByHandleMap.entries()) {
                        if (tkKey.startsWith(k) || k.startsWith(tkKey)) {
                          if (Math.min(tkKey.length, k.length) >= 5) {
                            tk = count;
                            break;
                          }
                        }
                      }
                    }
                    return { name: m.name, tk, ig: m.ig_posts, yt: m.yt_videos };
                  });
                  return (
                <div>
                  <div style={{ minWidth: 0 }}>
                    {/* ★ mockup 1:1 — A + B 섹션 mockup CSS로 적용 */}
                    <div className="bp-mockup">
                      <SectionBoundary name="A 콘텐츠 활동">
                      <SectionAMockup
                        phase2={ks.phase2}
                        phase3={ks.phase3}
                        phase5={ks.phase5}
                        monthlyTierByChannel={monthlyTierByChannel}
                        hasAmazon={availableSalesChannels.includes("amazon") || c.channel === "amazon"}
                      />
                      </SectionBoundary>
                      <SectionBoundary name="B 인플루언서 풀">
                      <SectionBMockup
                        phase2={ks.phase2}
                        phase3={ks.phase3}
                        phase35={ks.phase35}
                        phase37={ks.phase37}
                        crossChannelMatrix={sharedMatrix}
                        topGmvCreators={topGmvCreators}
                        shopGmvDistribution={shopGmvDistribution}
                        ownedHandles={(() => {
                          const normH = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                          const out = new Set<string>();
                          for (const u of igOwnedUsernames) out.add(normH(u));
                          for (const u of ytOwnedChannels) out.add(normH(u));
                          // brand_meta_pages 의 page_id 매칭은 partner_creators 단에서만 의미 — Top 작성자 (TK) 와 다른 채널
                          return out;
                        })()}
                        tierDistByChannel={tierDistByChannel}
                        monthlyTierByChannel={monthlyTierByChannel}
                        igTopAuthors={igTopAuthors.map((a) => ({
                          username: a.username,
                          total_posts: a.total_posts,
                          brand_matched_posts: a.brand_matched_posts,
                          paid_posts: a.paid_posts,
                          max_likes: a.max_likes ?? null,
                          followers: (a as { followers?: number | null }).followers ?? null,
                          top_videos: igTopAuthorVideos.get(a.username) ?? [],
                        }))}
                        ytTopChannels={ytTopChannels.map((c2) => ({
                          channel_name: c2.channel_name,
                          total_videos: c2.total_videos,
                          paid_videos: c2.paid_videos,
                          max_views: c2.max_views ?? null,
                          subscriber_count: c2.subscriber_count ?? null,
                          top_videos: ytTopChannelVideos.get(c2.channel_name) ?? [],
                        }))}
                      />
                      </SectionBoundary>
                      {/* IG / YT 별도 디테일 섹션 제거 — A/B/C/D/E mockup 안에 통합 (TikTok 과 동일) */}
                      <SectionBoundary name="C 콘텐츠 포맷">
                      <SectionCMockup
                        phase2={ks.phase2}
                        phase4bClusters={phase4bClustersForUi}
                        phase5={ks.phase5}
                        clusterChannelBreakdown={clusterChannelBreakdown}
                        channelData={clusterChannelData}
                        uspByChannel={uspByChannel}
                        uspVideosByChannel={uspVideosByChannel}
                      />
                      </SectionBoundary>
                      {ks.phase2.sales_summary && (
                        <SectionBoundary name="D 매출·SKU">
                        <SectionDMockup
                          phase2={ks.phase2}
                          phase4bSku={ks.phase4b_sku}
                          phase5={ks.phase5}
                          caseChannel={c.channel}
                          availableSalesChannels={availableSalesChannels}
                          skuChannelMap={skuChannelMap}
                          skuVideoMap={skuVideoMap}
                          kalodataVideos={ks.kalodata_videos_xlsx}
                          kalodataLives={ks.kalodata_lives}
                          categoryRanking={
                            (keyStats as unknown as {
                              kalodata_category_ranking?: { points?: Array<{ date: string; rank: number }> };
                            })?.kalodata_category_ranking?.points
                          }
                          skuMetaMap={skuMetaMap}
                          kalodataInOtherCases={kalodataInOtherCases}
                          bsrInflections={ks.phase5?.bsr_inflections}
                          kalodataBrandKpi={
                            (keyStats as unknown as {
                              kalodata_brand?: import("@/lib/parsers/kalodata").KalodataBrandKpi | null;
                            })?.kalodata_brand ?? null
                          }
                          bsrSeries={ks.phase2?.bsr_series}
                          bsrSkus={bsrSkus}
                          weeklyViews={weeklyViews}
                          /* Hydration 안전: server 시점 Date.now() 박아 SkuHealthCards 까지 전달.
                             SkuHealthCards 가 Date.now() 직접 호출하면 SSR/CSR 시점 차이로 React #418. */
                          nowMs={Date.now()}
                        />
                        </SectionBoundary>
                      )}
                    </div>
                    {/* ★ Section E mockup 1:1 */}
                    {ks.phase4a && (
                      <div className="bp-mockup">
                        <SectionBoundary name="E Meta 광고">
                        <SectionEMockup
                          phase4a={ks.phase4a}
                          metaAdsList={metaAdsList}
                          partnerChannelMap={(() => {
                            // partner_creators 의 creator_page_name → cross-channel + follower 매칭
                            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                            const followerByHandle = new Map<string, number | null>();
                            for (const tc of ks.phase2?.top_creators ?? []) {
                              followerByHandle.set(norm(tc.handle), tc.follower_count);
                            }
                            const result: Record<string, { tk: number; ig: number; yt: number; follower?: number | null }> = {};
                            for (const m of sharedMatrix) {
                              result[norm(m.name)] = {
                                tk: m.tk,
                                ig: m.ig,
                                yt: m.yt,
                                follower: followerByHandle.get(norm(m.name)) ?? null,
                              };
                            }
                            return result;
                          })()}
                        />
                        </SectionBoundary>
                      </div>
                    )}
                  </div>
                </div>
                  );
                })()}
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

      {/* ⚙️ DEV 액션 footer — Phase 1.6: 페이지 맨 아래로 이동. 평소엔 접힘 */}
      <div id="sec-dev" style={{ scrollMarginTop: 80 }} />
      <CaseDevFooter
        case_id={c.id}
        status={c.status}
        costEstimate={costEstimate}
        keyStats={keyStats}
        lastError={(keyStats as { last_error?: { message: string } } | null)?.last_error?.message ?? null}
        mergeCandidates={await listMergeCandidates(c.id)}
      />
        </div>{/* /main minWidth */}
      </div>{/* /grid */}
    </div>{/* /outer maxWidth */}
    </>
  );
}
