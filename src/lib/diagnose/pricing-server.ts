import "server-only";

import { createServer } from "@/lib/supabase/server";
import {
  DEFAULT_PRICING,
  DEFAULT_PRODUCT_PRICING,
  normalizePricing,
  normalizeProductPricing,
  type ProductPricing,
  type SeedingPricing,
} from "./pricing";

/**
 * app_settings.diagnose_pricing 에서 시딩 단가 fetch. 없으면 기본값.
 * server-only — client component에서 import 금지.
 */
export async function fetchSeedingPricing(): Promise<SeedingPricing> {
  const supabase = await createServer();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "diagnose_pricing")
    .maybeSingle();

  if (error || !data?.value) return DEFAULT_PRICING;
  return normalizePricing(data.value);
}

/** app_settings.diagnose_product_pricing 에서 상품유형 단가 fetch. 없으면 기본값. */
export async function fetchProductPricing(): Promise<ProductPricing> {
  const supabase = await createServer();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "diagnose_product_pricing")
    .maybeSingle();

  if (error || !data?.value) return DEFAULT_PRODUCT_PRICING;
  return normalizeProductPricing(data.value);
}
