import "server-only";

import { createServer } from "@/lib/supabase/server";
import { FALLBACK_RATES, type ExchangeRates } from "./exchange-rates";

/**
 * app_settings에서 환율 fetch. 못 찾으면 정적 fallback.
 * 운영자가 /settings/exchange-rates 페이지에서 수정 → app_settings.exchange_rates 갱신.
 *
 * server-only — supabase server client 사용. client component에서 import 금지.
 */
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const supabase = await createServer();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "exchange_rates")
    .maybeSingle();

  if (error || !data?.value) return FALLBACK_RATES;
  if (typeof data.value !== "object" || Array.isArray(data.value)) {
    return FALLBACK_RATES;
  }
  return data.value as ExchangeRates;
}
