import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  scrapeTikTokShop,
  type ShopProductItem,
} from "@/lib/apify/tiktok-shop-scraper";
import type { Phase15Stats } from "../types";

type SupaClient = SupabaseClient<Database>;

const UPSERT_CHUNK = 200;

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

  // 3. 기존 products 정리 (재실행 시 stale row 방지)
  await supabase.from("products").delete().eq("case_id", case_id);
  await supabase.from("case_product_sales").delete().eq("case_id", case_id);

  // 4. products upsert (case_id 연결, channel='tiktok_shop')
  const productRows = result.products.map((p) => ({
    brand_id: c.brand_id,
    case_id,
    channel: "tiktok_shop",
    platform: "tiktok",
    name: p.name,
    external_product_id: p.external_id,
    product_url: p.url,
    price: p.price,
    category: p.category,
  }));

  const insertedProducts: Array<{
    id: string;
    external_product_id: string | null;
    price: number | null;
  }> = [];
  for (let i = 0; i < productRows.length; i += UPSERT_CHUNK) {
    const slice = productRows.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("products")
      .insert(slice)
      .select("id, external_product_id, price");
    if (error) throw new Error(`products insert: ${error.message}`);
    insertedProducts.push(...(data ?? []));
  }

  // 5. case_product_sales 저장 — 누적 (period_start=null, period_end=now)
  // index by external_product_id로 매출 매핑
  const idToSold = new Map<string, number>();
  for (const p of result.products) {
    if (p.external_id && p.total_sold != null) {
      idToSold.set(p.external_id, p.total_sold);
    }
  }

  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let total_with_sales = 0;
  let total_revenue_estimate = 0;
  const salesRows: Array<{
    case_id: string;
    product_id: string;
    units_30d: number;
    revenue_30d: number;
    period_start: string | null;
    period_end: string;
    source: string;
  }> = [];

  for (const ip of insertedProducts) {
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
      period_start: null, // null = 누적 (TikTok Shop)
      period_end: now,
      source: "tiktok_shop_scraper",
    });
  }

  for (let i = 0; i < salesRows.length; i += UPSERT_CHUNK) {
    const slice = salesRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("case_product_sales").insert(slice);
    if (error) throw new Error(`case_product_sales insert: ${error.message}`);
  }

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
