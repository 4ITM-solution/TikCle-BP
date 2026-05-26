import Link from "next/link";
import { notFound } from "next/navigation";
import { createServer } from "@/lib/supabase/server";
import { ExolytSection } from "@/components/case-detail/ExolytSection";
import { BrandViewTrendsSection } from "@/components/case-detail/BrandViewTrendsSection";
import {
  AmazonSalesSection,
  type SkuRow,
} from "@/components/case-detail/AmazonSalesSection";
import { BsrSection } from "@/components/case-detail/BsrSection";
import { ShopdoraSection } from "@/components/case-detail/ShopdoraSection";
import { KalodataSection } from "@/components/case-detail/KalodataSection";
import { TiktokShopUsAffiliateSection } from "@/components/case-detail/TiktokShopUsAffiliateSection";
import { TiktokProductFinderSection } from "@/components/case-detail/TiktokProductFinderSection";
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
      "id, country, channel, status, revenue_tier, brand_keyword, brand_meta_pages, tiktok_shop_store_url, options, key_stats, created_at, updated_at, brand:brands(name)",
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

  // 4b. Meta 광고 전체 list (UI에서 월별 필터/더보기에 사용). Amazon 케이스만.
  let metaAdsList: MetaAdListItem[] = [];
  if (c.channel === "amazon" && c.status === "ready") {
    const { data: ads } = await supabase
      .from("meta_ads")
      .select(
        "id, ad_archive_id, page_name, format, start_date, end_date, is_active, body_text, link_url, thumbnail_url, video_url, is_brand_official",
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
    }));
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
  else if (!exolytDone) reason = "exolyt 데이터 업로드/재사용 필요";
  else if (!salesDone) {
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
                </div>

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
      ) : c.status === "ready" && c.key_stats ? (
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
              return (
                <>
                  <div
                    style={{
                      padding: 18,
                      marginBottom: 14,
                      background: "var(--color-warn-soft)",
                      border: "1px solid var(--color-warn)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-warn)",
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      ⚠ key_stats에 phase2 결과가 없어요
                    </div>
                    다른 phase 결과(3 / 4a / 4b.* / 5)는 살아 있는데 phase2만 누락. 아래 PhaseProgress 펼쳐서{" "}
                    <b>Phase 2만 재실행</b>하면 다른 결과는 보존된 채 phase2가 채워져요.
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
