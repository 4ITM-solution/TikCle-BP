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

  // 6. SKU 매출 + BSR (amazon: 30일 매출 + BSR / tiktok_shop·shopee: 매출, BSR 없음)
  const { sales_summary, sku_sales, bsr_series } =
    c.channel === "amazon" ||
    c.channel === "tiktok_shop" ||
    c.channel === "shopee"
      ? await aggregateAmazonSalesAndBsr(supabase, c.id, c.channel)
      : { sales_summary: null, sku_sales: [], bsr_series: [] };

  // ★ Phase 10/11: IG/YT 통합 — 영상 수 + 월별 분리 (A 채널 toggle stack chart 활성)
  const [{ count: igCount }, { count: ytCount }, igRows, ytRows] = await Promise.all([
    supabase
      .from("ig_posts")
      .select("id", { count: "exact", head: true })
      .eq("case_id", case_id),
    supabase
      .from("yt_videos")
      .select("id", { count: "exact", head: true })
      .eq("case_id", case_id),
    supabase
      .from("ig_posts")
      .select("posted_at, paid_signal")
      .eq("case_id", case_id)
      .limit(20000),
    supabase
      .from("yt_videos")
      .select("uploaded_at, paid_signal")
      .eq("case_id", case_id)
      .limit(20000),
  ]);

  // 월별 채널별 집계
  const aggMonthly = (
    rows: Array<{ date: string | null; paid: boolean }>,
  ): MonthlyVideoCount[] => {
    const m = new Map<string, { paid: number; organic: number; total: number }>();
    for (const r of rows) {
      if (!r.date) continue;
      const month = r.date.slice(0, 7);
      const e = m.get(month) ?? { paid: 0, organic: 0, total: 0 };
      if (r.paid) e.paid += 1;
      else e.organic += 1;
      e.total += 1;
      m.set(month, e);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({ month, ...c }));
  };

  const igMonthly = aggMonthly(
    (igRows.data ?? []).map((r) => ({
      date: r.posted_at,
      paid: !!r.paid_signal,
    })),
  );
  const ytMonthly = aggMonthly(
    (ytRows.data ?? []).map((r) => ({
      date: r.uploaded_at,
      paid: !!r.paid_signal,
    })),
  );

  // ★ C3: seeded 카운트 — is_ad=false 인데 caption 안 시딩 disclosure regex 매칭.
  // TK + IG + YT 합산. 보수적 매칭 (#gifted, #gift, #pr, #prsample, #partner, #partnership, "gifted by", "sent by")
  const SEEDED_RE = /(#\s*(gifted|gift|pr|prsample|partner|partnership)|gifted\s+by|sent\s+by\s+(@|brand))/i;
  let total_seeded = 0;
  for (const c of contents) {
    if (c.is_ad) continue;
    if (c.caption && SEEDED_RE.test(c.caption)) total_seeded += 1;
  }
  // IG/YT caption 도 추가 — fetch 안 했지만 sample 만큼만 (별도 fetch 안 함)

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
    total_seeded,
    // ★ 채널별 영상 수 (mockup A 채널 toggle 활성용)
    ig_total_videos: igCount ?? 0,
    yt_total_videos: ytCount ?? 0,
    monthly_by_channel: {
      tk: monthly,
      ig: igMonthly,
      yt: ytMonthly,
    },
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
  promoted_count: number; // is_ad=true 영상 수 (Class A~E 분류 입력)
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
    const promoted = items.filter((c) => c.is_ad === true).length;
    const agg: CreatorAgg = {
      influencer_id: id,
      video_count: items.length,
      promoted_count: promoted,
      max_views: maxViews,
      top_videos: top3,
    };

    if (items.length >= 10) {
      // 반복 작성자 (Class A: 50+, B: 30-49, C: 10-29)
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
    .select(
      "id, handle, follower_count, is_tiktok_shop_creator, lifetime_gmv_usd, gpm_usd, post_rate, total_brand_collabs, shop_creator_gmv_range",
    )
    .in("id", ids);
  const byId = new Map((infls ?? []).map((i) => [i.id, i]));
  return raw.map((c) => {
    const i = byId.get(c.influencer_id) as
      | {
          handle: string | null;
          follower_count: number | null;
          is_tiktok_shop_creator: boolean | null;
          lifetime_gmv_usd: number | null;
          gpm_usd: number | null;
          post_rate: number | null;
          total_brand_collabs: number | null;
          shop_creator_gmv_range: string | null;
        }
      | undefined;
    return {
      handle: i?.handle ?? "(unknown)",
      video_count: c.video_count,
      promoted_count: c.promoted_count,
      max_views: c.max_views,
      follower_count: i?.follower_count ?? null,
      is_shop_creator: i?.is_tiktok_shop_creator ?? null,
      lifetime_gmv_usd: i?.lifetime_gmv_usd ?? null,
      gpm_usd: i?.gpm_usd ?? null,
      post_rate: i?.post_rate ?? null,
      total_brand_collabs: i?.total_brand_collabs ?? null,
      shop_creator_gmv_range: i?.shop_creator_gmv_range ?? null,
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
  // category/launch_date/price 추가 (D SKU 매출 표 컬럼 확장 B2).
  const { data: prods } = await supabase
    .from("products")
    .select("id, asin, external_product_id, name, product_url, country, category, launch_date, price, channel")
    .eq("case_id", case_id);

  if (!prods || prods.length === 0) {
    return { sales_summary: null, sku_sales: [], bsr_series: [] };
  }

  const productIds = prods.map((p) => p.id);
  const isAmazon = channel === "amazon";

  // case_product_sales — 제품별로 "소스 신뢰도" 우선 선택.
  //   ⚠️ period_end 최신만 쓰면 tiktok_shop_scraper(스토어프론트 "누적판매×정가" 추정)가
  //   사용자가 올린 정확한 Helium10/Kalodata 실 GMV를 덮어버림 (GMV 4배 부풀).
  //   → 신뢰도 순으로 고르고, 같은 소스 내에서만 period_end 최신/직전 비교.
  type SaleRow = {
    product_id: string;
    units_30d: number | null;
    revenue_30d: number | null;
    currency: string;
    country: string | null;
    period_start: string | null;
    period_end: string | null;
    source: string | null;
  };
  const { data: salesAll } = await supabase
    .from("case_product_sales")
    .select("product_id, units_30d, revenue_30d, currency, country, period_start, period_end, source")
    .eq("case_id", case_id);

  // 낮을수록 우선: Kalodata 실GMV > Helium10/Amazon 실GMV > 기타 > scraper(정가×누적 추정)
  const sourceRank = (src: string | null): number => {
    switch (src) {
      case "kalodata": return 0;
      case "helium10_tt_finder": return 1;
      case "amazon_sales": return 1;
      case "shopdora": return 2;
      case "tiktok_shop_scraper": return 9; // 정가×누적수량 추정 — 최후순위
      default: return 3;
    }
  };

  const rowsByProduct = new Map<string, SaleRow[]>();
  for (const s of (salesAll ?? []) as SaleRow[]) {
    const arr = rowsByProduct.get(s.product_id) ?? [];
    arr.push(s);
    rowsByProduct.set(s.product_id, arr);
  }

  const latestByProduct = new Map<string, SaleRow>();
  // 직전 period revenue (동일 소스의 이전 period — trend 비교용)
  const prevByProduct = new Map<string, number>();
  let latestPeriodEnd: string | null = null;
  let prevPeriodEnd: string | null = null;
  for (const [pid, rows] of rowsByProduct) {
    const sorted = [...rows].sort(
      (a, b) =>
        sourceRank(a.source) - sourceRank(b.source) ||
        (b.period_end ?? "").localeCompare(a.period_end ?? ""),
    );
    const chosen = sorted[0]!;
    latestByProduct.set(pid, chosen);
    if (chosen.period_end && (!latestPeriodEnd || chosen.period_end > latestPeriodEnd)) {
      latestPeriodEnd = chosen.period_end;
    }
    // 직전 = 같은 소스의 더 이른 period_end
    const prev = sorted.find(
      (r) => r.source === chosen.source && (r.period_end ?? "") < (chosen.period_end ?? ""),
    );
    if (prev) {
      prevByProduct.set(pid, prev.revenue_30d ?? 0);
      if (prev.period_end && prev.period_end !== latestPeriodEnd && (!prevPeriodEnd || prev.period_end > prevPeriodEnd)) {
        prevPeriodEnd = prev.period_end;
      }
    }
  }

  // 최신 BSR 한 점 (Amazon만 — tiktok_shop은 BSR 개념 없음).
  // .in() + default limit 1000 회피: product별 분리 호출 (각 1 row만).
  const latestBsrByProduct = new Map<string, number | null>();
  if (isAmazon) {
    const checks = await Promise.all(
      productIds.map(async (pid) => {
        const { data } = await supabase
          .from("sales_snapshot")
          .select("bsr")
          .eq("product_id", pid)
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return [pid, data?.bsr ?? null] as const;
      }),
    );
    for (const [pid, bsr] of checks) latestBsrByProduct.set(pid, bsr);
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
        category: p.category ?? null,
        launch_date: p.launch_date ?? null,
        price: p.price != null ? Number(p.price) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // sales_summary — total_revenue/top/by_country는 케이스 "주 채널"(channel) 제품만 합산.
  //   멀티채널 케이스(예: tiktok_shop + amazon 동시 업로드)에서 KPI "TT Shop GMV"가
  //   다른 채널 매출까지 더해져 오염되는 것 방지. 타 채널 SKU는 sku_sales엔 그대로 남아
  //   D섹션 채널 토글로 표시됨. 단일채널 케이스는 primarySkus === sku_sales라 변화 없음.
  const asinToChannel = new Map<string, string | null>(
    prods.map((p) => [
      p.asin ?? p.external_product_id ?? "",
      (p as { channel?: string | null }).channel ?? null,
    ]),
  );
  const primarySkus = sku_sales.filter(
    (s) => (asinToChannel.get(s.asin ?? "") ?? channel) === channel,
  );
  // 채널별 매출 분포 (KPI 채널 분리용)
  const by_channel: Record<
    string,
    { revenue: number; units: number; sku_count: number }
  > = {};
  for (const s of sku_sales) {
    const ch = asinToChannel.get(s.asin ?? "") ?? channel;
    const cur = by_channel[ch] ?? { revenue: 0, units: 0, sku_count: 0 };
    cur.revenue += s.revenue;
    cur.units += s.units;
    cur.sku_count += 1;
    by_channel[ch] = cur;
  }

  const total_revenue = primarySkus.reduce((acc, s) => acc + s.revenue, 0);
  const total_units = primarySkus.reduce((acc, s) => acc + s.units, 0);
  const top1 = primarySkus[0]?.revenue ?? 0;
  const top3 = primarySkus
    .slice(0, 3)
    .reduce((acc, s) => acc + s.revenue, 0);

  const by_country: SalesSummary["by_country"] = {};
  for (const s of primarySkus) {
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
  const prev_period_revenue = prevByProduct.size > 0
    ? Array.from(prevByProduct.values()).reduce((s, v) => s + v, 0)
    : null;
  const sales_summary: SalesSummary = {
    period_start: latestPeriod?.period_start ?? null,
    period_end: latestPeriod?.period_end ?? null,
    total_revenue,
    total_units,
    sku_count: primarySkus.length,
    top1_revenue_share: total_revenue > 0 ? top1 / total_revenue : 0,
    top3_revenue_share: total_revenue > 0 ? top3 / total_revenue : 0,
    prev_period_revenue,
    prev_period_end: prevPeriodEnd,
    by_country,
    by_channel,
  };

  // BSR series (Amazon만 — 매출 Top 5 SKU).
  // 권역 case는 같은 ASIN이 SA/AE 두 product로 박혀있어 (asin, country) 조합으로 매칭.
  const bsr_series: BsrSeries[] = [];
  const topSkus = sku_sales.slice(0, 5);
  const findProd = (asin: string, country: string | null) =>
    prods.find(
      (p) => p.asin === asin && (p.country ?? null) === country,
    );
  const topProductIds = isAmazon
    ? topSkus
        .map((s) => findProd(s.asin, s.country)?.id)
        .filter((x): x is string => !!x)
    : [];
  if (isAmazon && topProductIds.length > 0) {
    // 주의: .in("product_id", N개) + default limit 1000 → 5개 SKU 합쳐 ascending 1000 row만
    // 잡혀 옛 시점만 차트에 들어가는 bug 발생. product별 분리 호출로 각 SKU 전체 시계열 fetch.
    const seriesByProduct = new Map<
      string,
      { date: string; bsr: number }[]
    >();
    await Promise.all(
      topProductIds.map(async (pid) => {
        // SKU별 최근 1000 row만 (≈ 2.7년치). inflection은 최근 시점에서 잡혀 다 포함.
        const { data } = await supabase
          .from("sales_snapshot")
          .select("collected_at, bsr")
          .eq("product_id", pid)
          .order("collected_at", { ascending: false })
          .limit(1000);
        const points = (data ?? [])
          .filter((r): r is { collected_at: string; bsr: number } => r.bsr !== null)
          .map((r) => ({ date: r.collected_at, bsr: r.bsr }))
          .reverse(); // 차트는 ascending 시계열 필요
        seriesByProduct.set(pid, points);
      }),
    );

    for (const sku of topSkus) {
      const prod = findProd(sku.asin, sku.country);
      if (!prod) continue;
      const points = seriesByProduct.get(prod.id) ?? [];
      bsr_series.push({
        asin: sku.asin,
        name: sku.name,
        country: sku.country,
        points,
      });
    }
  }

  return { sales_summary, sku_sales, bsr_series };
}
