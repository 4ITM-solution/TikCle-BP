/**
 * Apify pro100chok/tiktok-shop-scraper 호출 래퍼.
 *
 * 입력: TikTok Shop 스토어 URL (예: https://www.tiktok.com/@store_name)
 * 출력: 제품 리스트 (id, name, price, total_sold, image, url)
 *
 * Phase 1.5에서 사용 — tiktok_shop 케이스의 제품/매출 자동 수집.
 */

const ACTOR_ID = "pro100chok~tiktok-shop-scraper";
const SYNC_TIMEOUT_SEC = 1200; // 20분

export type ShopProductItem = {
  external_id: string | null; // TikTok product id
  name: string;
  price: number | null; // USD (또는 store currency)
  total_sold: number | null; // 누적 판매량 (가능하면)
  url: string | null;
  image_url: string | null;
  category: string | null;
};

export type ShopScrapeResult = {
  products: ShopProductItem[];
  cost_estimate_usd: number;
  raw_count: number;
  skipped_reason?: string;
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
  debug_request_body?: string; // 실제 actor에 보낸 body — 코드 버전 검증용
};

/**
 * Async pattern: kickoff actor (POST /runs), 폴링 후 dataset fetch.
 * 각 호출은 짧음 (<5s). Vercel 함수 한도 무관.
 */
export type KickoffResult = {
  runId: string;
  datasetId: string;
  request_body: string;
};

export async function kickoffTikTokShopScrape(opts: {
  storeUrl: string;
  maxProducts?: number;
  region?: string;
}): Promise<KickoffResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 미설정");
  if (!opts.storeUrl) throw new Error("스토어 URL 없음");

  const region = (opts.region ?? "us").toLowerCase();
  const max = opts.maxProducts ?? 1000;
  const body = {
    scrapeType: "store",
    storeUrls: [opts.storeUrl],
    sortBy: "relevance",
    maxItems: max,
    region,
    includeReviews: false,
    maxReviews: 30,
    reviewsSortBy: "recommended",
    reviewsFilterType: "all",
    reviewsStarRating: 0,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: region.toUpperCase(),
    },
  };
  const bodyJson = JSON.stringify(body);

  const response = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyJson,
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`pro100chok kickoff ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    data: { id: string; defaultDatasetId: string };
  };
  return {
    runId: data.data.id,
    datasetId: data.data.defaultDatasetId,
    request_body: bodyJson.slice(0, 800),
  };
}

export async function pollActorRun(
  runId: string,
): Promise<{ status: string; finishedAt: string | null }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 미설정");
  const response = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
  );
  if (!response.ok) {
    throw new Error(`poll ${response.status}`);
  }
  const data = (await response.json()) as {
    data: { status: string; finishedAt: string | null };
  };
  return data.data;
}

export async function fetchActorDataset(
  datasetId: string,
): Promise<unknown[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 미설정");
  const response = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`,
  );
  if (!response.ok) {
    throw new Error(`dataset ${response.status}`);
  }
  return (await response.json()) as unknown[];
}

/**
 * Raw items → mapped products. processProducts에서 사용.
 */
export function mapShopRawItems(
  raw: unknown[],
): {
  products: ShopProductItem[];
  raw_count: number;
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
} {
  let debug_first_item_keys: string[] | undefined;
  let debug_first_item_sample: string | undefined;
  if (raw[0] && typeof raw[0] === "object") {
    const first = raw[0] as Record<string, unknown>;
    debug_first_item_keys = Object.keys(first).slice(0, 30);
    debug_first_item_sample = JSON.stringify(first).slice(0, 800);
  }
  const products = raw
    .map(mapItem)
    .filter((x): x is ShopProductItem => x !== null);
  return {
    products,
    raw_count: raw.length,
    debug_first_item_keys,
    debug_first_item_sample,
  };
}

/**
 * 스토어 URL을 actor에 보내 제품 리스트 회수.
 * 다양한 응답 필드 변형을 허용 (sold_count vs soldCount vs totalSold 등).
 */
export async function scrapeTikTokShop(opts: {
  storeUrl: string;
  maxProducts?: number;
  region?: string; // "us", "uk" 등 (case.country 소문자)
}): Promise<ShopScrapeResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      products: [],
      cost_estimate_usd: 0,
      raw_count: 0,
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }
  if (!opts.storeUrl) {
    return {
      products: [],
      cost_estimate_usd: 0,
      raw_count: 0,
      skipped_reason: "스토어 URL 없음",
    };
  }

  const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  const region = (opts.region ?? "us").toLowerCase();
  const max = opts.maxProducts ?? 1000;
  // pro100chok actor 정확한 입력 스키마 (사용자 검증)
  const body = {
    scrapeType: "store",
    storeUrls: [opts.storeUrl],
    sortBy: "relevance",
    maxItems: max,
    region,
    includeReviews: false,
    maxReviews: 30,
    reviewsSortBy: "recommended",
    reviewsFilterType: "all",
    reviewsStarRating: 0,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: region.toUpperCase(),
    },
  };

  const bodyJson = JSON.stringify(body);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyJson,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      products: [],
      cost_estimate_usd: 0,
      raw_count: 0,
      skipped_reason: `actor HTTP ${response.status}: ${text.slice(0, 200)}`,
      debug_request_body: bodyJson.slice(0, 800),
    };
  }

  const raw = (await response.json()) as unknown[];

  // 디버그: 첫 항목 캡처
  let debug_first_item_keys: string[] | undefined;
  let debug_first_item_sample: string | undefined;
  if (raw[0] && typeof raw[0] === "object") {
    const first = raw[0] as Record<string, unknown>;
    debug_first_item_keys = Object.keys(first).slice(0, 30);
    debug_first_item_sample = JSON.stringify(first).slice(0, 800);
  }

  const products = raw
    .map(mapItem)
    .filter((x): x is ShopProductItem => x !== null);

  // pro100chok는 구독 정액제 ($20/월) — 케이스당 marginal cost = 0
  const COST_PER_RESULT = 0;

  return {
    products,
    cost_estimate_usd: products.length * COST_PER_RESULT,
    raw_count: raw.length,
    debug_first_item_keys,
    debug_first_item_sample,
    debug_request_body: bodyJson.slice(0, 800),
  };
}

function mapItem(raw: unknown): ShopProductItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // pro100chok 응답: type="store"는 매장 메타, type="store_product"만 실제 제품
  if (r.type === "store") return null;

  const name =
    (r.title as string | undefined) ??
    (r.name as string | undefined) ??
    (r.productName as string | undefined) ??
    (r.product_name as string | undefined);
  if (!name || typeof name !== "string") return null;

  const id =
    (r.product_id as string | number | undefined) ??
    (r.productId as string | number | undefined) ??
    (r.id as string | number | undefined) ??
    null;

  // pro100chok은 currentPrice 문자열 ("15", "25.99")
  const price = pickNumber(
    r.currentPrice,
    r.current_price,
    r.price,
    r.sale_price,
    r.salePrice,
  );

  // pro100chok은 salesVolume (number)
  const total_sold = pickNumber(
    r.salesVolume,
    r.sales_volume,
    r.sold_count,
    r.soldCount,
    r.total_sold,
    r.totalSold,
    r.sales,
    r.sold,
    r.sale_count,
    r.saleCount,
  );

  const url =
    (r.productUrl as string | undefined) ??
    (r.product_url as string | undefined) ??
    (r.url as string | undefined) ??
    null;

  // pro100chok은 imageUrls 배열 → 첫 번째
  let image: string | null = null;
  const imgs = r.imageUrls ?? r.image_urls;
  if (Array.isArray(imgs) && typeof imgs[0] === "string") {
    image = imgs[0];
  } else {
    image =
      (r.image as string | undefined) ??
      (r.image_url as string | undefined) ??
      (r.imageUrl as string | undefined) ??
      (r.thumbnail as string | undefined) ??
      null;
  }

  const category =
    (r.category as string | undefined) ??
    (r.category_name as string | undefined) ??
    null;

  return {
    external_id: id != null ? String(id) : null,
    name: name.trim(),
    price,
    total_sold,
    url,
    image_url: image,
    category,
  };
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      // "$19.99", "5,000", "5K sold" 같은 형식 허용
      const cleaned = v.replace(/[$,\s]/g, "");
      const m = cleaned.match(/[\d.]+/);
      if (m) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) {
          // "5K" 같은 suffix 처리
          if (/k$/i.test(cleaned)) return n * 1000;
          if (/m$/i.test(cleaned)) return n * 1_000_000;
          return n;
        }
      }
    }
  }
  return null;
}
