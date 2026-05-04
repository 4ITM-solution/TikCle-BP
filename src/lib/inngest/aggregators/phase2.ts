import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  BsrSeries,
  MonthlyVideoCount,
  Phase2Stats,
  SalesSummary,
  SkuSalesEntry,
  TopCreator,
  VideosPerCreator,
  VideosPerCreatorBucket,
} from "../types";

const FETCH_PAGE = 1000;

type SupaClient = SupabaseClient<Database>;

/**
 * Phase 2 — Stats Aggregator
 *
 * 적재된 contents / case_product_sales / sales_snapshot 에서 SQL 기본 집계.
 * 외부 API 호출 없음, 비용 0.
 */
export async function runPhase2(
  supabase: SupaClient,
  case_id: string,
  opts?: { shopCreatorOnly?: boolean },
): Promise<Phase2Stats> {
  // 1. 케이스 + brand+country 스코프 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, brand_id, country, channel")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  // 2. contents 전체 페이지네이션 페치 (brand+country 스코프)
  let contents = await fetchAllContents(supabase, c.brand_id, c.country);

  // 2b. tiktok_shop 케이스에서 shop creator 필터 적용 시
  //     is_tiktok_shop_creator=true 인플의 콘텐츠만 남김
  if (opts?.shopCreatorOnly) {
    const shopCreatorIds = await fetchShopCreatorIds(
      supabase,
      c.brand_id,
      c.country,
    );
    contents = contents.filter(
      (row) => row.influencer_id && shopCreatorIds.has(row.influencer_id),
    );
  }

  // 3. 월별 영상 수 (paid/organic)
  const monthly = aggregateMonthlyVideoCounts(contents);

  // 4. 1인당 영상 분포 + Top 작성자 + 단일 viral outlier
  const distribution = aggregateVideosPerCreator(contents);
  const { top_creators: top_creators_raw, outliers: outlier_raw } =
    aggregateCreators(contents);

  // 5. influencers 테이블에서 follower / shop creator 정보 조인 (있는 만큼)
  const top_creators = await enrichTopCreators(supabase, top_creators_raw);
  const outlier_creators = await enrichTopCreators(supabase, outlier_raw);

  // 6. SKU 매출 + BSR (amazon: 30일 매출 + BSR / tiktok_shop: 누적 매출, BSR 없음)
  const { sales_summary, sku_sales, bsr_series } =
    c.channel === "amazon" || c.channel === "tiktok_shop"
      ? await aggregateAmazonSalesAndBsr(supabase, c.id, c.channel)
      : { sales_summary: null, sku_sales: [], bsr_series: [] };

  return {
    monthly_video_counts: monthly,
    sales_summary,
    sku_sales,
    bsr_series,
    videos_per_creator: distribution,
    top_creators,
    outlier_creators,
    total_contents: contents.length,
    total_unique_creators: distribution.total_creators,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

type ContentRow = {
  id: string;
  uploaded_at: string | null;
  is_ad: boolean;
  views: number | null;
  influencer_id: string | null;
  url: string;
  caption: string | null;
};

async function fetchShopCreatorIds(
  supabase: SupaClient,
  brand_id: string,
  country: string,
): Promise<Set<string>> {
  // brand+country 인플 중 is_tiktok_shop_creator=true인 ID
  // contents.influencer_id로 조인 (brand_id 직접 매칭은 안 됨 — influencers는 글로벌)
  const ids = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("influencers")
      .select("id")
      .eq("is_tiktok_shop_creator", true)
      .range(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(`shop creator ids: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) ids.add(r.id);
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  // 사용 시 contents의 influencer_id로 필터하므로 brand+country 스코프는 자동 적용됨
  // (brand+country 외 인플도 set에 포함되지만 contents에 없으니 무관)
  return ids;
}

async function fetchAllContents(
  supabase: SupaClient,
  brand_id: string,
  country: string,
): Promise<ContentRow[]> {
  const all: ContentRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("id, uploaded_at, is_ad, views, influencer_id, url, caption")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .range(from, from + FETCH_PAGE - 1);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return all;
}

function aggregateMonthlyVideoCounts(
  contents: ContentRow[],
): MonthlyVideoCount[] {
  const map = new Map<string, { paid: number; organic: number }>();
  for (const c of contents) {
    if (!c.uploaded_at) continue;
    const month = c.uploaded_at.slice(0, 7); // YYYY-MM
    const cur = map.get(month) ?? { paid: 0, organic: 0 };
    if (c.is_ad) cur.paid += 1;
    else cur.organic += 1;
    map.set(month, cur);
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({
      month,
      paid: v.paid,
      organic: v.organic,
      total: v.paid + v.organic,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateVideosPerCreator(contents: ContentRow[]): VideosPerCreator {
  const counts = new Map<string, number>();
  for (const c of contents) {
    if (!c.influencer_id) continue;
    counts.set(c.influencer_id, (counts.get(c.influencer_id) ?? 0) + 1);
  }
  const buckets: Record<VideosPerCreatorBucket, number> = {
    "1": 0,
    "2-4": 0,
    "5-9": 0,
    "10-19": 0,
    "20-49": 0,
    "50+": 0,
  };
  for (const n of counts.values()) {
    if (n === 1) buckets["1"]++;
    else if (n <= 4) buckets["2-4"]++;
    else if (n <= 9) buckets["5-9"]++;
    else if (n <= 19) buckets["10-19"]++;
    else if (n <= 49) buckets["20-49"]++;
    else buckets["50+"]++;
  }
  return { ...buckets, total_creators: counts.size };
}

type CreatorAgg = {
  influencer_id: string;
  video_count: number;
  max_views: number;
  top_videos: Array<{ url: string; views: number; caption: string | null }>;
};

// 단일 viral outlier 임계: max_views >= 1M (Mega tier)
const OUTLIER_VIEWS_THRESHOLD = 1_000_000;
const OUTLIER_VIDEO_COUNT_MAX = 20; // 반복 작성자(>=20)는 top_creators에서 다룸

function aggregateCreators(contents: ContentRow[]): {
  top_creators: CreatorAgg[];
  outliers: CreatorAgg[];
} {
  // 인플별로 contents 수집
  const byInfluencer = new Map<string, ContentRow[]>();
  for (const c of contents) {
    if (!c.influencer_id) continue;
    if (!byInfluencer.has(c.influencer_id))
      byInfluencer.set(c.influencer_id, []);
    byInfluencer.get(c.influencer_id)!.push(c);
  }

  const topCreators: CreatorAgg[] = [];
  const outliers: CreatorAgg[] = [];

  for (const [id, items] of byInfluencer.entries()) {
    const sorted = [...items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const maxViews = sorted[0]?.views ?? 0;
    const top3 = sorted.slice(0, 3).map((c) => ({
      url: c.url,
      views: c.views ?? 0,
      caption: c.caption ?? null,
    }));
    const agg: CreatorAgg = {
      influencer_id: id,
      video_count: items.length,
      max_views: maxViews,
      top_videos: top3,
    };

    if (items.length >= 20) {
      // 반복 작성자
      topCreators.push(agg);
    } else if (maxViews >= OUTLIER_VIEWS_THRESHOLD) {
      // 단일 viral outlier (적은 영상 수인데 mega views)
      outliers.push(agg);
    }
  }

  return {
    top_creators: topCreators
      .sort((a, b) => b.video_count - a.video_count)
      .slice(0, 30),
    outliers: outliers
      .filter((o) => o.video_count < OUTLIER_VIDEO_COUNT_MAX)
      .sort((a, b) => b.max_views - a.max_views)
      .slice(0, 10),
  };
}

async function enrichTopCreators(
  supabase: SupaClient,
  raw: CreatorAgg[],
): Promise<TopCreator[]> {
  if (raw.length === 0) return [];
  const ids = raw.map((c) => c.influencer_id);
  const { data: infls } = await supabase
    .from("influencers")
    .select("id, handle, follower_count, is_tiktok_shop_creator")
    .in("id", ids);
  const byId = new Map((infls ?? []).map((i) => [i.id, i]));
  return raw.map((c) => {
    const i = byId.get(c.influencer_id);
    return {
      handle: i?.handle ?? "(unknown)",
      video_count: c.video_count,
      max_views: c.max_views,
      follower_count: i?.follower_count ?? null,
      is_shop_creator: i?.is_tiktok_shop_creator ?? null,
      top_videos: c.top_videos,
    };
  });
}

async function aggregateAmazonSalesAndBsr(
  supabase: SupaClient,
  case_id: string,
  channel: string,
): Promise<{
  sales_summary: SalesSummary | null;
  sku_sales: SkuSalesEntry[];
  bsr_series: BsrSeries[];
}> {
  // products (case scope) — country 포함 (권역 case의 SA/AE 분리용)
  const { data: prods } = await supabase
    .from("products")
    .select("id, asin, external_product_id, name, product_url, country")
    .eq("case_id", case_id);

  if (!prods || prods.length === 0) {
    return { sales_summary: null, sku_sales: [], bsr_series: [] };
  }

  const productIds = prods.map((p) => p.id);
  const isAmazon = channel === "amazon";

  // 가장 최근 period의 case_product_sales만 사용
  const { data: salesAll } = await supabase
    .from("case_product_sales")
    .select("product_id, units_30d, revenue_30d, currency, country, period_start, period_end")
    .eq("case_id", case_id)
    .order("period_end", { ascending: false });

  // product_id별 가장 최근 row 1개씩
  const latestByProduct = new Map<
    string,
    {
      units_30d: number | null;
      revenue_30d: number | null;
      currency: string;
      country: string | null;
      period_start: string | null;
      period_end: string | null;
    }
  >();
  for (const s of salesAll ?? []) {
    if (!latestByProduct.has(s.product_id)) {
      latestByProduct.set(s.product_id, s);
    }
  }

  // 최신 BSR 한 점 (Amazon만 — tiktok_shop은 BSR 개념 없음)
  const latestBsrByProduct = new Map<string, number | null>();
  if (isAmazon) {
    const { data: bsrLatest } = await supabase
      .from("sales_snapshot")
      .select("product_id, bsr, collected_at")
      .in("product_id", productIds)
      .order("collected_at", { ascending: false });
    for (const b of bsrLatest ?? []) {
      if (!latestBsrByProduct.has(b.product_id)) {
        latestBsrByProduct.set(b.product_id, b.bsr);
      }
    }
  }

  // SKU 매출 entries (asin 또는 external_product_id를 식별자로). country/currency 포함.
  const sku_sales: SkuSalesEntry[] = prods
    .map((p) => {
      const s = latestByProduct.get(p.id);
      const identifier = p.asin ?? p.external_product_id ?? "";
      return {
        asin: identifier,
        name: p.name,
        url:
          p.product_url ??
          (isAmazon && p.asin
            ? `https://www.amazon.com/dp/${p.asin}`
            : null),
        units: s?.units_30d ?? 0,
        revenue: s?.revenue_30d ?? 0,
        currency: s?.currency ?? "USD",
        country: p.country ?? null,
        bsr_latest: latestBsrByProduct.get(p.id) ?? null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // sales_summary — currency 단위로 합산 (혼합 통화면 USD 환산은 UI 단계에서)
  // 권역 case는 by_country sub로 보조 분포 계산.
  const total_revenue = sku_sales.reduce((acc, s) => acc + s.revenue, 0);
  const total_units = sku_sales.reduce((acc, s) => acc + s.units, 0);
  const top1 = sku_sales[0]?.revenue ?? 0;
  const top3 = sku_sales
    .slice(0, 3)
    .reduce((acc, s) => acc + s.revenue, 0);

  const by_country: SalesSummary["by_country"] = {};
  for (const s of sku_sales) {
    const k = s.country ?? "_unknown";
    const cur = by_country![k] ?? {
      revenue: 0,
      units: 0,
      sku_count: 0,
      currency: s.currency,
    };
    cur.revenue += s.revenue;
    cur.units += s.units;
    cur.sku_count += 1;
    by_country![k] = cur;
  }

  // 가장 최근 period 기준
  const latestPeriod = Array.from(latestByProduct.values())[0];
  const sales_summary: SalesSummary = {
    period_start: latestPeriod?.period_start ?? null,
    period_end: latestPeriod?.period_end ?? null,
    total_revenue,
    total_units,
    sku_count: sku_sales.length,
    top1_revenue_share: total_revenue > 0 ? top1 / total_revenue : 0,
    top3_revenue_share: total_revenue > 0 ? top3 / total_revenue : 0,
    by_country,
  };

  // BSR series (Amazon만 — 매출 Top 5 SKU)
  const bsr_series: BsrSeries[] = [];
  const topSkus = sku_sales.slice(0, 5);
  const topProductIds = isAmazon
    ? topSkus
        .map((s) => prods.find((p) => p.asin === s.asin)?.id)
        .filter((x): x is string => !!x)
    : [];
  if (isAmazon && topProductIds.length > 0) {
    const { data: bsrRows } = await supabase
      .from("sales_snapshot")
      .select("product_id, collected_at, bsr")
      .in("product_id", topProductIds)
      .order("collected_at", { ascending: true });

    const seriesByProduct = new Map<
      string,
      { date: string; bsr: number }[]
    >();
    for (const r of bsrRows ?? []) {
      if (r.bsr === null) continue;
      const arr = seriesByProduct.get(r.product_id) ?? [];
      arr.push({ date: r.collected_at, bsr: r.bsr });
      seriesByProduct.set(r.product_id, arr);
    }

    for (const sku of topSkus) {
      const prod = prods.find((p) => p.asin === sku.asin);
      if (!prod) continue;
      const points = seriesByProduct.get(prod.id) ?? [];
      bsr_series.push({
        asin: sku.asin,
        name: sku.name,
        points,
      });
    }
  }

  return { sales_summary, sku_sales, bsr_series };
}
