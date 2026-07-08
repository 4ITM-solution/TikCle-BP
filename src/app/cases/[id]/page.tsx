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
import { safeViewRows } from "@/lib/case-detail/safe-view";
import { computeCompleteness } from "@/lib/case-detail/completeness";
import { SectionConclusion } from "@/components/case-detail/SectionConclusion";
import { buildSectionConclusions } from "@/lib/case-detail/section-conclusions";
import { IntakeWizard } from "@/components/case-detail/IntakeWizard";
import { buildIntakeChecklist } from "@/lib/case-detail/intake-checklist";
import { PhaseRunsPanel } from "@/components/case-detail/PhaseRunsPanel";
import { CompletenessGauge } from "@/components/case-detail/CompletenessGauge";
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
import { CaseConfigBox } from "@/components/case-detail/CaseConfigBox";
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

export type AdIntelLite = {
  is_ugc_person?: boolean;
  origin_class?: "ugc_as_is" | "ugc_processed" | "brand_produced";
  content_format?: string;
  hook_type?: string;
  hook_strength?: "strong" | "medium" | "weak";
  product_focus?: "single_hero" | "multi_product";
  has_promo_overlay?: boolean;
  has_before_after?: boolean;
  creator_read?: string;
  market_read?: string;
  products_visible?: string[];
  rationale?: string | null;
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
  inferred_creator_handle: string | null;
  ad_intel: AdIntelLite | null;
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
        "id, ad_archive_id, page_name, format, start_date, end_date, is_active, body_text, link_url, thumbnail_url, video_url, is_brand_official, creator_page_name, partner_page_name, partner_page_id, inferred_creator_handle, ad_intel",
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
      inferred_creator_handle:
        (a as { inferred_creator_handle?: string | null })
          .inferred_creator_handle ?? null,
      ad_intel:
        ((a as { ad_intel?: AdIntelLite | null }).ad_intel as AdIntelLite) ??
        null,
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
      .eq("country", c.country)
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
  // owned 채널(IG/YT/Meta) — TikTok 시딩/커머스 없이 브랜드 모니터링만 돌리는 케이스 지원.
  const igDone = (igConfig?.ig_owned_usernames?.length ?? 0) > 0;
  const ytDone = ytOwnedChannels.length > 0;
  const metaDone =
    ((c.brand_meta_pages as string[] | null)?.length ?? 0) > 0 ||
    !!c.brand_keyword;
  const ownedChannelDone = igDone || ytDone || metaDone;
  // 시작 가능: ① TikTok+커머스 풀세트(exolyt+sales) OR ② owned 채널(IG/YT/Meta) 중 하나라도.
  const commerceReady = exolytDone && salesDone;
  const ready =
    (commerceReady || ownedChannelDone) && c.status === "draft";

  // ★ A5/B1/B2(WS4b): 실매출 존재(case_product_sales 행) + 프로모션(시점) 존재.
  //   F2 근거: products 있어도 case_product_sales 0행이면 "매출 미업로드". row 존재로 판정.
  const caseSalesExists = await (async () => {
    const { count } = await supabase
      .from("case_product_sales")
      .select("id", { count: "exact", head: true })
      .eq("case_id", c.id);
    return (count ?? 0) > 0;
  })();
  const hasPromotions = await (async () => {
    const { count } = await supabase
      .from("promotion_events")
      .select("id", { count: "exact", head: true })
      .or(`case_id.eq.${c.id},and(case_id.is.null,country.eq.${c.country})`);
    return (count ?? 0) > 0;
  })();

  // ★ C5(WS4b): phase_runs 직결 — 신 11-phase 상태·비용·partial. 없으면 빈 배열(패널 대기 표시).
  const phaseRuns = await (async () => {
    type Row = { phase: string; status: string; cost_usd: number | null; error: string | null; stats: Record<string, unknown> | null; finished_at: string | null };
    const resp = await supabase
      .from("phase_runs")
      .select("phase, status, cost_usd, error, stats, finished_at")
      .eq("case_id", c.id);
    return (resp.data as unknown as Row[] | null) ?? [];
  })();

  let reason = "";
  if (c.status !== "draft") reason = `현재 상태: ${c.status}`;
  else if (!exolytDone && !ownedChannelDone) {
    // TT Shop US는 Affiliate CSV로 영상 URL 박혀도 contents에 들어가 exolytDone 충족됨 — 안내 명시
    if (c.channel === "tiktok_shop" && c.country === "US")
      reason =
        "영상 데이터 필요 — Exolyt CSV 또는 Affiliate CSV (TT Shop) 둘 중 하나";
    else reason = "데이터 필요 — Exolyt(TikTok) 또는 IG/YT/Meta 중 하나";
  } else if (exolytDone && !commerceReady && !ownedChannelDone) {
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
      // ★ 페이지네이션 — PostgREST 기본 1000행 제한 때문에 그냥 쿼리하면 가장
      //   오래된 1000행(asc)만 와서, 최근 월 BSR이 누락→차트 범위와 안 겹쳐 BSR
      //   라인 토글이 비활성되던 버그. range로 전체 수집.
      const snaps: Array<{ product_id: string; bsr: number | null; collected_at: string }> = [];
      for (let off = 0; off < 200000; off += 1000) {
        const { data: page } = await supabase
          .from("sales_snapshot")
          .select("product_id, bsr, collected_at")
          .in("product_id", pidList)
          .not("bsr", "is", null)
          .order("collected_at", { ascending: true })
          .range(off, off + 999);
        if (!page || page.length === 0) break;
        snaps.push(...page);
        if (page.length < 1000) break;
      }
      const { data: bvids } = brand_id
        ? await supabase
            .from("contents")
            .select("url, views, caption, uploaded_at")
            .eq("brand_id", brand_id)
            .eq("country", c.country)
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

  // ★ A2(WS4b): 티어×앵글×월 교차 — v_case_angle_tier_month(019). 미적용 시 빈 상태.
  const angleTierMonth = await (async () => {
    type Row = {
      angle: string | null;
      tier: string | null;
      month: string | null;
      video_count: number | null;
    };
    const rows = await safeViewRows<Row>(
      supabase,
      "v_case_angle_tier_month",
      (q) => q.eq("case_id", c.id),
    );
    if (rows.length === 0) return null;
    const TIER_ORDER = ["mega", "macro", "mid", "micro", "nano", "sub-nano", "unknown"];
    const angleTotals = new Map<string, number>();
    const monthSet = new Set<string>();
    const tierSet = new Set<string>();
    // cells[tier][angle][month] = count
    const cells: Record<string, Record<string, Record<string, number>>> = {};
    let sampleTagged = 0;
    for (const r of rows) {
      const angle = r.angle ?? "미분류";
      const tier = r.tier ?? "unknown";
      const month = r.month ?? "";
      const cnt = r.video_count ?? 0;
      if (!month) continue;
      sampleTagged += cnt;
      angleTotals.set(angle, (angleTotals.get(angle) ?? 0) + cnt);
      monthSet.add(month);
      tierSet.add(tier);
      ((cells[tier] ??= {})[angle] ??= {})[month] = cnt;
    }
    const angles = [...angleTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a)
      .slice(0, 12);
    const tiers = TIER_ORDER.filter((t) => tierSet.has(t));
    const months = [...monthSet].sort();
    return { angles, tiers, months, cells, sampleTagged };
  })();

  // ★ C6(WS4b): IG 국가 근사 신호 — v_case_ig_country_signal(019). 미적용/무데이터 시 null.
  const igCountrySignal = await (async () => {
    type Row = { total: number | null; non_latin: number | null; latin: number | null; non_latin_pct: number | null };
    const rows = await safeViewRows<Row>(
      supabase,
      "v_case_ig_country_signal",
      (q) => q.eq("case_id", c.id),
    );
    const r = rows[0];
    if (!r || !(r.total ?? 0)) return null;
    return {
      total: r.total ?? 0,
      nonLatin: r.non_latin ?? 0,
      latin: r.latin ?? 0,
      nonLatinPct: r.non_latin_pct ?? 0,
    };
  })();

  // ★ A7(WS4b): 태그×GMV — v_case_content_gmv_tags(019). 미적용/무데이터 시 null.
  const gmvTags = await (async () => {
    type Row = { tag: string | null; video_count: number | null; gmv_sum: number | null };
    const rows = await safeViewRows<Row>(
      supabase,
      "v_case_content_gmv_tags",
      (q) => q.eq("case_id", c.id),
    );
    if (rows.length === 0) return null;
    return rows
      .filter((r) => r.tag)
      .map((r) => ({ tag: r.tag as string, video_count: r.video_count ?? 0, gmv_sum: Number(r.gmv_sum) || 0 }));
  })();

  // ★ A3(WS4b): 시딩∩광고 교집합 — v_case_seeding_ad_overlap(019). 미적용/무매칭 시 [].
  const seedingAdOverlap = await (async () => {
    type Row = {
      creator_handle: string | null;
      seeding_channel: string | null;
      tier: string | null;
      follower_count: number | null;
      ad_count: number | null;
    };
    const rows = await safeViewRows<Row>(
      supabase,
      "v_case_seeding_ad_overlap",
      (q) => q.eq("case_id", c.id),
    );
    return rows
      .map((r) => ({
        creator_handle: r.creator_handle ?? "?",
        seeding_channel: r.seeding_channel ?? "tiktok",
        tier: r.tier,
        follower_count: r.follower_count,
        ad_count: r.ad_count ?? 0,
      }))
      .sort((a, b) => b.ad_count - a.ad_count || (b.follower_count ?? 0) - (a.follower_count ?? 0));
  })();

  // ★ A6(WS4b): 프로모션 이벤트 — case별 + 국가 프리셋(is_preset·country). A섹션 차트 마커용.
  //   월별 버킷(start_date YYYY-MM). 019 시드 적용 후 US 프리셋이 채워짐.
  const promotionEvents = await (async () => {
    type PromoRow = { name: string; start_date: string | null; end_date: string | null; importance: number | null };
    const resp = await supabase
      .from("promotion_events")
      .select("name, start_date, end_date, importance, is_preset, country, case_id")
      .or(`case_id.eq.${c.id},and(case_id.is.null,country.eq.${c.country})`)
      .order("start_date", { ascending: true });
    const data = resp.data as unknown as PromoRow[] | null;
    return (data ?? [])
      .filter((e) => e.start_date)
      .map((e) => ({
        name: e.name,
        month: String(e.start_date).slice(0, 7),
        start_date: String(e.start_date),
        importance: e.importance ?? null,
      }));
  })();

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

  // ★ 전체 TK 인플 (phase2.top_creators 는 ≥10편만 → 티어 표·3축·cross-channel 이
  //   소수 영상 시더를 놓침). contents 전체를 인플별 집계 + influencers 팔로워 join.
  //   언어 분포(contents.language)도 같이 — 오디언스·인종 시그널 (Part2 B fix).
  const { allTkCreators, tkLanguageDist } = await (async () => {
    if (!brand_id)
      return {
        allTkCreators: [] as Array<{
          handle: string;
          video_count: number;
          promoted_count: number;
          max_views: number;
          follower_count: number | null;
          is_shop_creator: boolean | null;
          lifetime_gmv_usd: number | null;
          top_videos: Array<{ url: string; views: number; caption: string | null }>;
        }>,
        tkLanguageDist: [] as Array<{ language: string; count: number }>,
      };
    // PostgREST가 응답을 1000행으로 캡 → .limit(50000) 무효. range로 페이지네이션해
    // 전체 contents 수집(브랜드당 ~만 단위). 안 하면 distinct 인플이 크게 누락됨.
    const tkContents: Array<{ influencer_id: string | null; views: number | null; is_ad: boolean | null; language: string | null }> = [];
    const PAGE = 1000;
    for (let off = 0; off < 100000; off += PAGE) {
      const { data } = await supabase
        .from("contents")
        .select("influencer_id, views, is_ad, language")
        .eq("brand_id", brand_id)
        .eq("country", c.country)
        .not("influencer_id", "is", null)
        .range(off, off + PAGE - 1);
      if (!data || data.length === 0) break;
      tkContents.push(...data);
      if (data.length < PAGE) break;
    }
    const byInf = new Map<string, { vc: number; maxV: number; promoted: number }>();
    const langCount = new Map<string, number>();
    for (const ct of tkContents ?? []) {
      const id = ct.influencer_id as string;
      const e = byInf.get(id) ?? { vc: 0, maxV: 0, promoted: 0 };
      e.vc += 1;
      e.maxV = Math.max(e.maxV, ct.views ?? 0);
      if (ct.is_ad === true) e.promoted += 1;
      byInf.set(id, e);
      const lang = (ct.language ?? "").trim().toLowerCase() || "unknown";
      langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    }
    const ids = [...byInf.keys()];
    const infMap = new Map<string, { handle: string; follower_count: number | null; lifetime_gmv_usd: number | null }>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase
        .from("influencers")
        .select("id, handle, follower_count, lifetime_gmv_usd")
        .in("id", ids.slice(i, i + 500));
      for (const inf of data ?? [])
        infMap.set(inf.id, {
          handle: inf.handle ?? "",
          follower_count: inf.follower_count ?? null,
          // GMV 박힘 — B Top 작성자 GMV 컬럼·정렬·3축 분포가 "—"/"$0"로만 뜨던 버그 fix.
          // (라이브 집계가 GMV를 하드코딩 null로 박아 카로데이터 lifetime_gmv_usd가 버려졌었음.)
          lifetime_gmv_usd: inf.lifetime_gmv_usd ?? null,
        });
    }
    const list = [...byInf.entries()].map(([id, agg]) => {
      const inf = infMap.get(id);
      return {
        handle: inf?.handle || id,
        video_count: agg.vc,
        promoted_count: agg.promoted,
        max_views: agg.maxV,
        follower_count: inf?.follower_count ?? null,
        is_shop_creator: null,
        lifetime_gmv_usd: inf?.lifetime_gmv_usd ?? null,
        top_videos: [] as Array<{ url: string; views: number; caption: string | null }>,
      };
    });
    const tkLanguageDist = [...langCount.entries()]
      .filter(([l]) => l !== "unknown")
      .sort((a, b) => b[1] - a[1])
      .map(([language, count]) => ({ language, count }));
    return { allTkCreators: list, tkLanguageDist };
  })();

  // ★ TK 월별 영상수 라이브 집계 — phase2.monthly_video_counts/total_contents는 분석 시점
  //   스냅샷이라 이후 스크랩분(엑솔릿/카로 추가)을 누락하는 stale undercount.
  //   contents에서 distinct video id 기준으로 다시 세어 Section A/C·KPI를 정확화.
  //   (organic=비광고 / paid=is_ad). live가 캐시보다 클 때만 덮음(절대 악화 X).
  const { liveTkMonthly, liveTkTotal, liveTkShopMonthly } = await (async () => {
    type MB = { month: string; organic: number; paid: number; total: number };
    if (!brand_id)
      return {
        liveTkMonthly: null as null | MB[],
        liveTkTotal: null as number | null,
        liveTkShopMonthly: null as null | MB[],
      };
    const seen = new Set<string>();
    const byMonth = new Map<string, { organic: number; paid: number }>();
    // ★ A1(WS4b): 샵 콘텐츠(is_shop_content) 월별 별도 집계 — Section A '틱톡샵' 토글용.
    const shopByMonth = new Map<string, { organic: number; paid: number }>();
    let total = 0;
    const PAGE = 1000;
    // ★ A1(WS4b): is_shop_content 컬럼은 migration 019 적용 후 존재. 적용 전(현행 DB)엔
    //   해당 컬럼 select가 에러 → base 컬럼으로 폴백(샵 집계 skip). apply 후 자동 활성.
    //   (typed 클라이언트가 동적 select 문자열을 못 파싱해 row 타입은 명시 캐스팅.)
    type TkRow = { url: string | null; uploaded_at: string | null; is_ad: boolean | null; is_shop_content?: boolean | null };
    let shopCol = true;
    for (let off = 0; off < 200000; off += PAGE) {
      const runQuery = (withShop: boolean) =>
        supabase
          .from("contents")
          .select(withShop ? "url, uploaded_at, is_ad, is_shop_content" : "url, uploaded_at, is_ad")
          .eq("brand_id", brand_id)
          .eq("country", c.country)
          .ilike("url", "%tiktok.com%")
          .not("uploaded_at", "is", null)
          .range(off, off + PAGE - 1);
      let resp = await runQuery(shopCol);
      if (resp.error && shopCol) {
        // 컬럼 미존재(019 미적용) — 폴백 후 같은 offset 재시도.
        shopCol = false;
        resp = await runQuery(false);
      }
      const data = resp.data as unknown as TkRow[] | null;
      if (!data || data.length === 0) break;
      for (const r of data) {
        const vid = (r.url as string | null)?.match(/\/(?:video|photo)\/(\d+)/)?.[1];
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        const month = String(r.uploaded_at).slice(0, 7);
        const isPaid = r.is_ad === true;
        const e = byMonth.get(month) ?? { organic: 0, paid: 0 };
        if (isPaid) e.paid += 1;
        else e.organic += 1;
        byMonth.set(month, e);
        if (r.is_shop_content === true) {
          const se = shopByMonth.get(month) ?? { organic: 0, paid: 0 };
          if (isPaid) se.paid += 1;
          else se.organic += 1;
          shopByMonth.set(month, se);
        }
        total += 1;
      }
      if (data.length < PAGE) break;
    }
    if (total === 0)
      return { liveTkMonthly: null, liveTkTotal: null, liveTkShopMonthly: null };
    const toArr = (m: Map<string, { organic: number; paid: number }>): MB[] =>
      [...m.entries()]
        .map(([month, v]) => ({ month, organic: v.organic, paid: v.paid, total: v.organic + v.paid }))
        .sort((a, b) => (a.month < b.month ? -1 : 1));
    const shopArr = toArr(shopByMonth);
    return {
      liveTkMonthly: toArr(byMonth),
      liveTkTotal: total,
      liveTkShopMonthly: shopArr.length > 0 ? shopArr : null,
    };
  })();

  // ★ 전체 IG 작성자 (igTopAuthors 는 25개 preview만 → B IG 요약/3축/티어표가 25명만 봄).
  //   ig_authors 전체를 가져와 TopCreator로 — followers/total_posts/max_views 기반.
  const allIgCreators = await (async () => {
    if (!phase4cStats || phase4cStats.skipped_reason) return [];
    const list: Array<{
      handle: string;
      video_count: number;
      promoted_count: number;
      max_views: number;
      follower_count: number | null;
      is_shop_creator: boolean | null;
      lifetime_gmv_usd: number | null;
      top_videos: Array<{ url: string; views: number; caption: string | null }>;
    }> = [];
    for (let off = 0; off < 50000; off += 1000) {
      const { data } = await supabase
        .from("ig_authors")
        .select("username, total_posts, paid_posts, max_views, max_likes, followers")
        .eq("case_id", c.id)
        .range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const a of data)
        list.push({
          handle: a.username,
          video_count: a.total_posts ?? 0,
          promoted_count: a.paid_posts ?? 0,
          max_views: a.max_views ?? a.max_likes ?? 0,
          follower_count: a.followers ?? null,
          is_shop_creator: null,
          lifetime_gmv_usd: null,
          top_videos: [],
        });
      if (data.length < 1000) break;
    }
    return list;
  })();

  // ★ A4(WS4b): 크로스채널 인플 3채널화 — 기존 crossPlatformMatches 는 IG∩YT 앵커라
  //   TK+IG / TK+YT 조합 인플이 누락됐음(QA-1 §2). v_unified_creators(TK/IG/YT 통합, live)로
  //   채널 소속을 잡고, 영상수는 기존 채널별 full 리스트에서 join. 뷰 신규 없음(017 기존 뷰 사용).
  //   결과 {name, tk, ig, yt} 는 sharedMatrix(Section B) + G 인사이트 union 양쪽에 사용.
  const crossChannelRows = await (async () => {
    const normH = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    // 채널별 영상수 map (norm_handle → count)
    const tkCount = new Map<string, number>();
    for (const tc of allTkCreators) {
      const k = normH(tc.handle);
      if (k.length >= 4) tkCount.set(k, Math.max(tkCount.get(k) ?? 0, tc.video_count));
    }
    const igCount = new Map<string, number>();
    for (const ic of allIgCreators) {
      const k = normH(ic.handle);
      if (k.length >= 4) igCount.set(k, Math.max(igCount.get(k) ?? 0, ic.video_count));
    }
    const ytCount = new Map<string, number>();
    for (const yc of ytTopChannels) {
      const k = normH(yc.channel_name);
      if (k.length >= 4) ytCount.set(k, Math.max(ytCount.get(k) ?? 0, yc.total_videos ?? 0));
    }
    // 보조: 기존 IG∩YT 매칭(crossPlatformMatches)의 IG/YT 카운트도 흡수 — preview 밖 보강.
    for (const m of crossPlatformMatches) {
      const k = normH(m.name);
      if (k.length < 4) continue;
      if (m.ig_posts > 0) igCount.set(k, Math.max(igCount.get(k) ?? 0, m.ig_posts));
      if (m.yt_videos > 0) ytCount.set(k, Math.max(ytCount.get(k) ?? 0, m.yt_videos));
    }
    // v_unified_creators 로 채널 소속(preview 밖 YT 포함) + 대표 핸들 + 팔로워.
    type UC = { channel: string | null; handle: string | null; norm_handle: string | null; follower_count: number | null };
    const uc = await safeViewRows<UC>(supabase, "v_unified_creators", (q) => q.eq("case_id", c.id));
    const byHandle = new Map<string, { name: string; chans: Set<string>; follower: number | null }>();
    for (const r of uc) {
      const k = r.norm_handle ?? (r.handle ? normH(r.handle) : "");
      if (!k || k.length < 4 || !r.channel) continue;
      const cur = byHandle.get(k) ?? { name: r.handle ?? k, chans: new Set<string>(), follower: null };
      cur.chans.add(r.channel);
      if (r.handle && r.handle.length > cur.name.length) cur.name = r.handle;
      cur.follower = Math.max(cur.follower ?? 0, r.follower_count ?? 0) || cur.follower;
      byHandle.set(k, cur);
    }
    // v_unified_creators 가 비어있으면(뷰 접근 실패 등) 기존 count map 합집합으로라도 구성.
    const keys = new Set<string>([...byHandle.keys(), ...tkCount.keys(), ...igCount.keys(), ...ytCount.keys()]);
    const rows: Array<{ name: string; tk: number; ig: number; yt: number; follower: number | null }> = [];
    for (const k of keys) {
      const meta = byHandle.get(k);
      const chans = meta?.chans ?? new Set<string>();
      // 채널 소속: v_unified_creators 소속 OR count>0. YT 소속인데 preview(25) 밖이면 floor 1로 존재 표시.
      const tk = tkCount.get(k) ?? (chans.has("tiktok") ? 1 : 0);
      const ig = igCount.get(k) ?? (chans.has("instagram") ? 1 : 0);
      const yt = ytCount.get(k) ?? (chans.has("youtube") ? 1 : 0);
      const present = [tk, ig, yt].filter((n) => n > 0).length;
      if (present < 2) continue; // 크로스채널만
      rows.push({ name: meta?.name ?? k, tk, ig, yt, follower: meta?.follower ?? null });
    }
    return rows.sort(
      (a, b) => [b.tk, b.ig, b.yt].filter((n) => n > 0).length - [a.tk, a.ig, a.yt].filter((n) => n > 0).length
        || (b.follower ?? 0) - (a.follower ?? 0),
    );
  })();

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
    // 분석 전이라도 Exolyt contents 적재됐으면(=exolytDone) active — products로 즉시
    //   active되는 매출 채널과 대칭. (기존엔 phase2 결과 나와야만 켜져서 적재 후에도 사용안함)
    if ((ksAuto.phase2?.total_contents ?? 0) > 0 || exolytDone) set.add("tiktok_video");
    // 분석 전이라도 카드에서 설정 저장했으면 active (Meta=키워드/페이지, IG/YT=seed).
    if (
      (ksAuto.phase4a?.total_ads ?? 0) > 0 ||
      !!c.brand_keyword ||
      ((c.brand_meta_pages as string[] | null)?.length ?? 0) > 0
    )
      set.add("meta_ads");
    if (
      (ksAuto.phase4c?.total_unique ?? ksAuto.phase4c?.total_posts ?? 0) > 0 ||
      (igConfig?.ig_owned_usernames?.length ?? 0) > 0
    )
      set.add("instagram");
    if (
      (ksAuto.phase4d?.total_unique ?? ksAuto.phase4d?.total_videos ?? 0) > 0 ||
      ytOwnedChannels.length > 0
    )
      set.add("youtube");
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
  if (dataChannels.includes("tiktok_video")) {
    // 분석 전엔 phase2 없음 → 적재된 contentCount로 폴백.
    const n = ksForStrip.phase2?.total_contents || (contentCount ?? 0);
    if (n > 0) {
      channelStats.tiktok_video = n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
    }
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

  // ★ A5(WS4b): Q0 채택 판정(간이) — 헤더 배지 + (B1 게이지 공용)
  const caseCompleteness = computeCompleteness(keyStats, {
    status: c.status,
    salesExists: caseSalesExists,
    hasPromotions,
  });

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
          adoption={{
            verdict: caseCompleteness.verdict,
            filledCount: caseCompleteness.filledCount,
            total: caseCompleteness.total,
            commerceReady: caseCompleteness.commerceReady,
            monitoringReady: caseCompleteness.monitoringReady,
          }}
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
        {/* ★ B1(WS4b): 완결성 게이지 헤더 — 6축 + 커머스/모니터링 ready 구분 */}
        <CompletenessGauge c={caseCompleteness} />
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
          {/* ★ C4(WS4b): 적재 위저드 — channel×country 재료 체크리스트(실적재 신호) + 자동수집 배너 */}
          <IntakeWizard
            items={buildIntakeChecklist({
              channel: c.channel,
              country: c.country,
              contentCount: contentCount ?? 0,
              salesExists: caseSalesExists,
              hasBsr: skuRows.some((r) => r.hasBsr),
              storeUrl: !!c.tiktok_shop_store_url,
              skuExists: skuRows.length > 0,
            })}
          />
          {/* ★ 데이터 채널 그리드 — 카드 클릭 → 그 채널 입력 UI 펼침. 원하는 채널만 골라 적재.
              (구 고정 "Section 02" 제거 — 채널 gating 없이 카드가 유일한 입력구) */}
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
              // ★ 카드 클릭 → 그 채널 입력 UI 펼침. 채널 gating(c.channel) 제거 —
              //   원하는 채널 카드만 눌러서 넣는다. (meta/ig/yt는 케이스 설정/자동수집이라 업로드 없음)
              uploadUI:
                ch === "tiktok_video" ? (
                  <>
                    <ExolytSection
                      case_id={c.id}
                      hasContents={(contentCount ?? 0) > 0 && !reusedAlready && !reusable}
                      reusable={reusable}
                      reusedAlready={reusedAlready}
                      contentCount={contentCount ?? 0}
                    />
                    <BrandViewTrendsSection
                      case_id={c.id}
                      existingWeeks={weeklyViews.length}
                    />
                  </>
                ) : ch === "amazon" ? (
                  <>
                    <AmazonSalesSection
                      case_id={c.id}
                      skuRows={skuRows}
                      caseCountry={c.country}
                      exchangeRates={exchangeRates}
                    />
                    <BsrSection case_id={c.id} skuRows={skuRows} caseCountry={c.country} />
                  </>
                ) : ch === "shopee" ? (
                  <ShopdoraSection case_id={c.id} productCount={skuRows.length} />
                ) : ch === "tt_shop" ? (
                  <>
                    <CaseConfigBox
                      case_id={c.id}
                      title="⚙️ TT Shop 설정"
                      fields={[
                        {
                          name: "tiktok_shop_store_url",
                          label: "TikTok Shop 스토어 URL (US 자동수집용)",
                          placeholder: "https://www.tiktok.com/shop/store/...",
                          defaultValue: c.tiktok_shop_store_url ?? "",
                          help: "US만 pro100chok actor 지원. SEA는 Kalodata 붙여넣기로.",
                        },
                      ]}
                    />
                    {c.country === "US" && (
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
                            marginBottom: 10,
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
                    <KalodataSection
                      case_id={c.id}
                      productCount={skuRows.length}
                      country={c.country}
                    />
                  </>
                ) : ch === "meta_ads" ? (
                  <CaseConfigBox
                    case_id={c.id}
                    title="⚙️ Meta 광고 설정"
                    fields={[
                      {
                        name: "brand_keyword",
                        label: "브랜드 키워드 (Meta 광고 라이브러리 검색어)",
                        placeholder: "ninja kitchen",
                        defaultValue: c.brand_keyword ?? "",
                      },
                      {
                        name: "brand_meta_pages",
                        label: "Meta 페이지 ID (쉼표로 여러 개)",
                        placeholder: "123456, 789012",
                        defaultValue: (c.brand_meta_pages ?? []).join(", "),
                        help: "분석 시 이 페이지/키워드로 Meta 광고 수집.",
                      },
                    ]}
                  />
                ) : ch === "instagram" ? (
                  <CaseConfigBox
                    case_id={c.id}
                    title="⚙️ Instagram 설정"
                    fields={[
                      {
                        name: "ig_owned_username",
                        label: "브랜드 owned IG username (seed)",
                        placeholder: "ninjakitchen",
                        defaultValue: igConfig?.ig_owned_usernames?.[0] ?? "",
                        help: "@ 없이. BP 분석(Phase 4c)의 시드.",
                      },
                      {
                        name: "ig_brand_hashtags",
                        label: "브랜드 해시태그 (쉼표로 여러 개)",
                        placeholder: "aromatica, 아로마티카",
                        defaultValue: (
                          (igConfig as { ig_brand_hashtags?: string[] })
                            ?.ig_brand_hashtags ?? []
                        ).join(", "),
                        help: "# 없이. 자사 계정 외 '태그된/언급한' 콘텐츠를 이 해시태그로 수집.",
                      },
                    ]}
                  />
                ) : ch === "youtube" ? (
                  <CaseConfigBox
                    case_id={c.id}
                    title="⚙️ YouTube 설정"
                    fields={[
                      {
                        name: "yt_owned_channel",
                        label: "브랜드 owned YouTube 채널 URL (seed)",
                        placeholder: "https://www.youtube.com/@ninjakitchen",
                        defaultValue: ytOwnedChannels[0] ?? "",
                        help: "BP 분석(Phase 4d)의 시드.",
                      },
                      {
                        name: "yt_brand_keywords",
                        label: "브랜드 검색어 (쉼표로 여러 개)",
                        placeholder: "aromatica, 아로마티카",
                        defaultValue: (
                          (ytConfig as { yt_brand_keywords?: string[] })
                            ?.yt_brand_keywords ?? []
                        ).join(", "),
                        help: "자사 채널 외 '언급/검색' 영상을 이 키워드로 수집.",
                      },
                    ]}
                  />
                ) : undefined,
            }))}
          />

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
            // ★ phase2 라이브 패치 — total_contents/monthly_video_counts/monthly_by_channel.tk를
            //   contents 실집계로 덮어 stale undercount 제거 (Section A/C·KPI 일관). live가 더 클 때만.
            if (
              ks.phase2 &&
              liveTkMonthly &&
              liveTkTotal != null &&
              liveTkTotal > (ks.phase2.total_contents ?? 0)
            ) {
              ks.phase2 = {
                ...ks.phase2,
                total_contents: liveTkTotal,
                monthly_video_counts: liveTkMonthly,
                monthly_by_channel: {
                  ig: ks.phase2.monthly_by_channel?.ig ?? [],
                  yt: ks.phase2.monthly_by_channel?.yt ?? [],
                  tk: liveTkMonthly,
                  // ★ A1(WS4b): 샵 콘텐츠 월별 — 있을 때만.
                  ...(liveTkShopMonthly ? { tk_shop: liveTkShopMonthly } : {}),
                },
              };
            }
            const lastError = ks.last_error;
            // ★ C1(WS4b): 섹션별 1줄 결론(서버 조립) — G + A~E 모두 커버하는 스코프에서 계산
            const conclusions = buildSectionConclusions(ks, brand);
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
                      {/* ★ C5(WS4b): phase_runs 직결 신 11-phase 패널 (사용자 언어 라벨·비용·재실행) */}
                      <PhaseRunsPanel caseId={c.id} runs={phaseRuns} />
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
                              <KalodataSection case_id={c.id} productCount={skuRows.length} country={c.country} />
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
                  // ★ A4(WS4b): IG/YT 도 3채널 crossChannelRows 로 채움(TK+IG/TK+YT 조합 포함).
                  for (const r of crossChannelRows) {
                    const k = normH(r.name);
                    if (k.length < 3) continue;
                    const cur = merged.get(k) ?? { name: r.name, tk: 0, ig: 0, yt: 0 };
                    cur.tk = Math.max(cur.tk, r.tk);
                    cur.ig = Math.max(cur.ig, r.ig);
                    cur.yt = Math.max(cur.yt, r.yt);
                    if (!cur.name || cur.name.length < r.name.length) cur.name = r.name;
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
                      <SectionConclusion text={conclusions.G} />
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
                  // ★ A4(WS4b): SectionBMockup + MiniDashboard 공용 crossChannelMatrix —
                  //   서버에서 v_unified_creators 기반 3채널로 계산한 crossChannelRows 를 그대로 사용
                  //   (기존 IG∩YT 앵커 방식 폐기, TK+IG / TK+YT 조합 포함).
                  const sharedMatrix = crossChannelRows.map((r) => ({
                    name: r.name,
                    tk: r.tk,
                    ig: r.ig,
                    yt: r.yt,
                  }));
                  return (
                <div>
                  <div style={{ minWidth: 0 }}>
                    {/* ★ mockup 1:1 — A + B 섹션 mockup CSS로 적용 */}
                    <div className="bp-mockup">
                      <SectionBoundary name="A 콘텐츠 활동">
                      <SectionConclusion text={conclusions.A} />
                      <SectionAMockup
                        phase2={
                          // phase2.bsr_series 가 비었지만 sales_snapshot BSR(bsrSkus)은 있는 경우
                          // (TT Shop 케이스 + Amazon 제품) → bsrSkus 로 BSR 라인 채워줌.
                          ks.phase2 && !(ks.phase2.bsr_series?.length) && bsrSkus.length > 0
                            ? {
                                ...ks.phase2,
                                bsr_series: bsrSkus.map((s) => ({
                                  asin: s.asin,
                                  name: s.name,
                                  country: null,
                                  points: s.series.map((p) => ({ date: `${p.m}-01`, bsr: p.bsr })),
                                })),
                              }
                            : ks.phase2
                        }
                        phase3={ks.phase3}
                        phase5={ks.phase5}
                        monthlyTierByChannel={monthlyTierByChannel}
                        hasAmazon={availableSalesChannels.includes("amazon") || c.channel === "amazon"}
                        promotionEvents={promotionEvents}
                      />
                      </SectionBoundary>
                      <SectionBoundary name="B 인플루언서 풀">
                      <SectionConclusion text={conclusions.B} />
                      <SectionBMockup
                        phase2={ks.phase2}
                        phase3={ks.phase3}
                        phase35={ks.phase35}
                        phase37={ks.phase37}
                        allTkCreators={allTkCreators}
                        allIgCreators={allIgCreators}
                        languageDist={tkLanguageDist}
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
                        igCountrySignal={igCountrySignal}
                      />
                      </SectionBoundary>
                      {/* IG / YT 별도 디테일 섹션 제거 — A/B/C/D/E mockup 안에 통합 (TikTok 과 동일) */}
                      <SectionBoundary name="C 콘텐츠 포맷">
                      <SectionConclusion text={conclusions.C} />
                      <SectionCMockup
                        phase2={ks.phase2}
                        phase4bClusters={phase4bClustersForUi}
                        phase5={ks.phase5}
                        clusterChannelBreakdown={clusterChannelBreakdown}
                        channelData={clusterChannelData}
                        uspByChannel={uspByChannel}
                        uspVideosByChannel={uspVideosByChannel}
                        angleTierMonth={angleTierMonth}
                        totalContents={ks.phase2.total_contents ?? 0}
                        gmvTags={gmvTags}
                      />
                      </SectionBoundary>
                      {/* ★ B2(WS4b): 매출 미업로드 배지 — products/SKU 있으나 case_product_sales 0행(F2).
                          salesDone(분석 시작 게이트)는 유지, 신뢰 신호는 실매출 존재로 표기. */}
                      {skuRows.length > 0 && !caseSalesExists && (
                        <div style={{ margin: "8px 0", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
                          ⚠ <b>매출 미업로드</b> — 제품(SKU) {skuRows.length}개는 있으나 실매출 데이터(case_product_sales)가 0행입니다.
                          아래 매출 수치는 비어있거나 부정확할 수 있습니다. 30일 매출 CSV를 업로드하세요.
                        </div>
                      )}
                      {ks.phase2.sales_summary && (
                        <SectionBoundary name="D 매출·SKU">
                        <SectionConclusion text={conclusions.D} />
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
                          kalodataBrandPeriods={
                            (keyStats as unknown as {
                              kalodata_brand_periods?: Record<
                                string,
                                import("@/lib/parsers/kalodata").KalodataBrandKpi
                              >;
                            })?.kalodata_brand_periods ?? null
                          }
                          liveVideoStats={(() => {
                            const ks2 = keyStats as unknown as {
                              kalodata_creators_xlsx?: KalodataCreatorXlsxRow[];
                              kalodata_lives?: Array<{ revenue_usd?: number | null }>;
                              kalodata_videos?: Array<{ revenue_usd?: number | null }>;
                              kalodata_brand?: {
                                live_revenue_usd?: number | null;
                                video_revenue_usd?: number | null;
                                product_card_revenue_usd?: number | null;
                              } | null;
                            };
                            const bk = ks2?.kalodata_brand;
                            const creators = ks2?.kalodata_creators_xlsx ?? [];
                            // 매출 분해 소스 우선순위: brand By-Content(정확) > creators xlsx 합 > lives/videos 복붙 합
                            let liveGmv = 0;
                            let videoGmv = 0;
                            const productCardGmv = bk?.product_card_revenue_usd ?? 0;
                            if (bk && (bk.live_revenue_usd != null || bk.video_revenue_usd != null)) {
                              liveGmv = bk.live_revenue_usd ?? 0;
                              videoGmv = bk.video_revenue_usd ?? 0;
                            } else if (creators.length > 0) {
                              for (const cr of creators) {
                                liveGmv += cr.live_gmv_usd ?? 0;
                                videoGmv += cr.video_gmv_usd ?? 0;
                              }
                            } else {
                              liveGmv = (ks2?.kalodata_lives ?? []).reduce((s, l) => s + (l.revenue_usd ?? 0), 0);
                              videoGmv = (ks2?.kalodata_videos ?? []).reduce((s, v) => s + (v.revenue_usd ?? 0), 0);
                            }
                            // 크리에이터 포맷 분류 (live/video 전문) — creators xlsx 있을 때만
                            let liveCount = 0;
                            let videoCount = 0;
                            let mixedCount = 0;
                            let topLive: Array<{ handle: string; followers: number | null; gmv: number }> = [];
                            let topVideo: Array<{ handle: string; followers: number | null; gmv: number }> = [];
                            if (creators.length > 0) {
                              const cls = creators.map((cr) => {
                                const lg = cr.live_gmv_usd ?? 0;
                                const vg = cr.video_gmv_usd ?? 0;
                                const tot = lg + vg;
                                const share = tot > 0 ? lg / tot : 0;
                                return {
                                  handle: cr.handle,
                                  followers: cr.followers ?? null,
                                  total: tot,
                                  type: tot === 0 ? "none" : share >= 0.7 ? "live" : share <= 0.3 ? "video" : "mixed",
                                };
                              });
                              const topBy = (t: string) =>
                                cls.filter((x) => x.type === t).sort((a, b) => b.total - a.total).slice(0, 5)
                                  .map((x) => ({ handle: x.handle, followers: x.followers, gmv: x.total }));
                              liveCount = cls.filter((x) => x.type === "live").length;
                              videoCount = cls.filter((x) => x.type === "video").length;
                              mixedCount = cls.filter((x) => x.type === "mixed").length;
                              topLive = topBy("live");
                              topVideo = topBy("video");
                            }
                            if (liveGmv === 0 && videoGmv === 0 && productCardGmv === 0) return null;
                            return { liveGmv, videoGmv, productCardGmv, liveCount, videoCount, mixedCount, topLive, topVideo };
                          })()}
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
                        <SectionConclusion text={conclusions.E} />
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
                          seedingAdOverlap={seedingAdOverlap}
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
