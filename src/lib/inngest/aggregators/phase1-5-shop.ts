import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  mapShopRawItems,
  scrapeTikTokShop,
  type ShopProductItem,
} from "@/lib/apify/tiktok-shop-scraper";
import type { Phase15Stats } from "../types";
import { defaultCurrency } from "@/lib/case-detail/countries";

type SupaClient = SupabaseClient<Database>;

const UPSERT_CHUNK = 200;

/**
 * Phase 1.5 (async pattern):
 *  fetchPhase15Setup → kickoff → poll loop → fetchDataset → processProducts
 *
 * Orchestrator가 step.run으로 각각 호출. step.sleep으로 대기 (Vercel 한도 무관).
 */

export type Phase15Setup = {
  brand_id: string;
  channel: string;
  storeUrl: string;
  region: string;
  skipped_reason?: string;
};

export async function fetchPhase15Setup(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase15Setup> {
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, channel, country, tiktok_shop_store_url")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  if (c.channel !== "tiktok_shop") {
    return {
      brand_id: c.brand_id,
      channel: c.channel,
      storeUrl: "",
      region: "",
      skipped_reason: "tiktok_shop 채널 아님 (skip)",
    };
  }
  if (!c.tiktok_shop_store_url) {
    return {
      brand_id: c.brand_id,
      channel: c.channel,
      storeUrl: "",
      region: "",
      skipped_reason: "tiktok_shop_store_url 비어있음",
    };
  }
  // pro100chok actor는 region:"us"만 지원. SEA/MENA/LATAM 등 다른 국가는 skip.
  // (수동 데이터 입력 또는 다른 데이터 소스로 보완 필요).
  const region = (c.country ?? "us").toLowerCase();
  if (region !== "us") {
    return {
      brand_id: c.brand_id,
      channel: c.channel,
      storeUrl: c.tiktok_shop_store_url,
      region,
      skipped_reason: `Phase 1.5 actor (pro100chok)는 US만 지원 — country=${c.country} 케이스는 자동 수집 skip (Kalodata 등 외부 데이터 수동 입력 필요)`,
    };
  }
  if (!process.env.APIFY_TOKEN) {
    return {
      brand_id: c.brand_id,
      channel: c.channel,
      storeUrl: c.tiktok_shop_store_url,
      region: c.country ?? "us",
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }

  return {
    brand_id: c.brand_id,
    channel: c.channel,
    storeUrl: c.tiktok_shop_store_url,
    region: (c.country ?? "us").toLowerCase(),
  };
}

/**
 * TikTok Shop 제품 + 스크래퍼 매출 영속화.
 *
 * ⚠️ 재스크랩 안정성: 예전엔 products를 case_id로 통째 delete 후 재insert해서 매번
 * 새 UUID가 생겼고, product_id로 묶인 수기 업로드(Helium/Kalodata/어필리에이트)가
 * 고아가 됐다(매출이 scraper "정가×누적" 추정으로 되돌아감). 여기선
 * external_product_id(=TikTok Shop listing id) 기준으로 기존 row를 찾아 UUID를
 * 유지(update)하고 신규만 insert한다.
 *
 * case_product_sales는 source='tiktok_shop_scraper' row만 정리해 수기 매출은 보존.
 * (scraper 매출 = 정가×누적판매수 추정 — phase2 소스우선에서 최후순위로만 사용)
 */
async function persistShopProductsAndSales(
  supabase: SupaClient,
  case_id: string,
  brand_id: string,
  region: string,
  products: ShopProductItem[],
): Promise<{ total_with_sales: number; total_revenue_estimate: number }> {
  // 1) 기존 제품 매핑 (external_product_id → 기존 UUID)
  const { data: existing } = await supabase
    .from("products")
    .select("id, external_product_id")
    .eq("case_id", case_id);
  const extToId = new Map<string, string>();
  for (const e of existing ?? []) {
    if (e.external_product_id) extToId.set(e.external_product_id, e.id);
  }

  // 2) reconcile: 기존이면 UUID 유지하고 필드 갱신, 신규만 insert
  const resolved: Array<{
    id: string;
    external_product_id: string | null;
    price: number | null;
  }> = [];
  const toInsert: Database["public"]["Tables"]["products"]["Insert"][] = [];
  for (const p of products) {
    const existingId = p.external_id ? extToId.get(p.external_id) : undefined;
    if (existingId) {
      const { error } = await supabase
        .from("products")
        .update({
          name: p.name,
          product_url: p.url,
          price: p.price,
          category: p.category,
        })
        .eq("id", existingId);
      if (error) throw new Error(`products update: ${error.message}`);
      resolved.push({
        id: existingId,
        external_product_id: p.external_id,
        price: p.price,
      });
    } else {
      toInsert.push({
        brand_id,
        case_id,
        channel: "tiktok_shop",
        platform: "tiktok",
        name: p.name,
        external_product_id: p.external_id,
        product_url: p.url,
        price: p.price,
        category: p.category,
      });
    }
  }
  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const slice = toInsert.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("products")
      .insert(slice)
      .select("id, external_product_id, price");
    if (error) throw new Error(`products insert: ${error.message}`);
    resolved.push(...(data ?? []));
  }

  // 3) 스크래퍼 매출 row만 정리 (수기 업로드 보존)
  await supabase
    .from("case_product_sales")
    .delete()
    .eq("case_id", case_id)
    .eq("source", "tiktok_shop_scraper");

  // 4) 스크래퍼 누적 매출(정가×판매수) 재적재
  const idToSold = new Map<string, number>();
  for (const p of products) {
    if (p.external_id && p.total_sold != null) {
      idToSold.set(p.external_id, p.total_sold);
    }
  }
  const now = new Date().toISOString().slice(0, 10);
  const currency = defaultCurrency(region.toUpperCase());
  let total_with_sales = 0;
  let total_revenue_estimate = 0;
  const salesRows: Array<{
    case_id: string;
    product_id: string;
    units_30d: number;
    revenue_30d: number;
    currency: string;
    period_start: string | null;
    period_end: string;
    source: string;
  }> = [];
  for (const ip of resolved) {
    if (!ip.external_product_id) continue;
    const sold = idToSold.get(ip.external_product_id);
    if (sold == null) continue;
    total_with_sales += 1;
    const revenue = (ip.price ?? 0) * sold;
    total_revenue_estimate += revenue;
    salesRows.push({
      case_id,
      product_id: ip.id,
      units_30d: sold,
      revenue_30d: revenue,
      currency,
      period_start: null,
      period_end: now,
      source: "tiktok_shop_scraper",
    });
  }
  for (let i = 0; i < salesRows.length; i += UPSERT_CHUNK) {
    const slice = salesRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("case_product_sales").insert(slice);
    if (error) throw new Error(`case_product_sales insert: ${error.message}`);
  }

  return { total_with_sales, total_revenue_estimate };
}

/**
 * Items 처리 — DB insert + stats 계산.
 */
export async function processPhase15Products(
  supabase: SupaClient,
  case_id: string,
  setup: Phase15Setup,
  rawItems: unknown[],
  request_body: string | null,
): Promise<Phase15Stats> {
  const mapped = mapShopRawItems(rawItems);

  if (mapped.products.length === 0) {
    return {
      total_products: 0,
      total_with_price: 0,
      total_with_sales: 0,
      total_revenue_estimate: 0,
      raw_count: mapped.raw_count,
      cost_actual_usd: 0,
      skipped_reason: "actor가 제품 0개 반환",
      debug_store_url: setup.storeUrl,
      debug_first_item_keys: mapped.debug_first_item_keys,
      debug_first_item_sample: mapped.debug_first_item_sample,
      debug_request_body: request_body ?? undefined,
      computed_at: new Date().toISOString(),
    };
  }

  // 제품/매출 영속화 — external_product_id 기준 기존 UUID 보존(수기데이터 고아 방지)
  // + scraper sales만 교체. (재스크랩해도 Helium/Kalodata 수기 매출 살아남음)
  const { total_with_sales, total_revenue_estimate } =
    await persistShopProductsAndSales(
      supabase,
      case_id,
      setup.brand_id,
      setup.region,
      mapped.products,
    );

  const total_with_price = mapped.products.filter(
    (p) => p.price != null,
  ).length;

  return {
    total_products: mapped.products.length,
    total_with_price,
    total_with_sales,
    total_revenue_estimate,
    raw_count: mapped.raw_count,
    cost_actual_usd: 0, // 정액제
    debug_store_url: setup.storeUrl,
    debug_first_item_keys: mapped.debug_first_item_keys,
    debug_first_item_sample: mapped.debug_first_item_sample,
    debug_request_body: request_body ?? undefined,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Phase 1.5 — TikTok Shop 자동 수집
 *
 * tiktok_shop 채널 케이스 한정. 스토어 URL을 pro100chok actor에 보내
 * 제품 리스트 (id, name, price, total_sold) 회수 → DB 저장.
 *
 * 1. cases.tiktok_shop_store_url 가져옴
 * 2. pro100chok 호출
 * 3. products 테이블에 upsert (channel='tiktok_shop')
 * 4. case_product_sales에 누적 매출 저장 (period_start=null → "누적" 표시)
 *
 * 결과: Phase 2가 그대로 픽업해서 sales_summary 채워짐.
 */
export async function runPhase15Shop(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase15Stats> {
  // 1. 케이스 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, channel, country, tiktok_shop_store_url")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  if (c.channel !== "tiktok_shop") {
    return empty15("tiktok_shop 채널 아님 (skip)");
  }
  if (!c.tiktok_shop_store_url) {
    return empty15("tiktok_shop_store_url 비어있음");
  }

  // 2. pro100chok 호출
  const result = await scrapeTikTokShop({
    storeUrl: c.tiktok_shop_store_url,
    maxProducts: 1000,
    region: (c.country ?? "us").toLowerCase(),
  });

  if (result.skipped_reason) {
    return {
      ...empty15(result.skipped_reason),
      debug_store_url: c.tiktok_shop_store_url,
      debug_first_item_keys: result.debug_first_item_keys,
      debug_first_item_sample: result.debug_first_item_sample,
      debug_request_body: result.debug_request_body,
    };
  }
  if (result.products.length === 0) {
    return {
      total_products: 0,
      total_with_price: 0,
      total_with_sales: 0,
      total_revenue_estimate: 0,
      raw_count: result.raw_count,
      cost_actual_usd: result.cost_estimate_usd,
      skipped_reason: "actor가 제품 0개 반환",
      debug_store_url: c.tiktok_shop_store_url,
      debug_first_item_keys: result.debug_first_item_keys,
      debug_first_item_sample: result.debug_first_item_sample,
      debug_request_body: result.debug_request_body,
      computed_at: new Date().toISOString(),
    };
  }

  // 3-5. 제품/매출 영속화 — external_product_id 기준 기존 UUID 보존(수기데이터 고아
  // 방지) + scraper sales만 교체. (재스크랩해도 Helium/Kalodata 수기 매출 살아남음)
  const { total_with_sales, total_revenue_estimate } =
    await persistShopProductsAndSales(
      supabase,
      case_id,
      c.brand_id,
      c.country ?? "us",
      result.products,
    );

  const total_with_price = result.products.filter(
    (p) => p.price != null,
  ).length;

  return {
    total_products: result.products.length,
    total_with_price,
    total_with_sales,
    total_revenue_estimate,
    raw_count: result.raw_count,
    cost_actual_usd: result.cost_estimate_usd,
    debug_store_url: c.tiktok_shop_store_url,
    debug_first_item_keys: result.debug_first_item_keys,
    debug_first_item_sample: result.debug_first_item_sample,
    debug_request_body: result.debug_request_body,
    computed_at: new Date().toISOString(),
  };
}

function empty15(reason: string): Phase15Stats {
  return {
    total_products: 0,
    total_with_price: 0,
    total_with_sales: 0,
    total_revenue_estimate: 0,
    raw_count: 0,
    cost_actual_usd: 0,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
