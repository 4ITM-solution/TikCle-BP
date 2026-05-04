import { createServer } from "@/lib/supabase/server";

export type ExchangeRates = Record<string, number>;

/** USD = 1 baseline. 다른 통화는 "1 unit = X USD"의 X. */
const FALLBACK_RATES: ExchangeRates = {
  USD: 1,
  KRW: 0.000667, // 1 USD = 1500 KRW (사용자 기본값)
  JPY: 0.00641,
  EUR: 1.087,
  SAR: 0.267,
  AED: 0.272,
  MXN: 0.0588,
  BRL: 0.2,
  SGD: 0.746,
  THB: 0.027,
  MYR: 0.213,
  IDR: 0.0000606,
  PHP: 0.01724,
  VND: 0.0000392,
};

/**
 * app_settings에서 환율 fetch. 못 찾으면 정적 fallback.
 * 운영자가 /settings/exchange-rates 페이지에서 수정 → app_settings.exchange_rates 갱신.
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

/**
 * amount(local currency) → USD. 환율 없으면 amount 그대로 반환 (즉 1:1로 가정).
 * Caller가 환율 미상 케이스 따로 다루고 싶으면 fetchExchangeRates에서 currency 키 존재 확인.
 */
export function toUsd(
  amount: number | null,
  currency: string,
  rates: ExchangeRates,
): number | null {
  if (amount == null) return null;
  const r = rates[currency];
  if (r == null) return amount; // 알려진 환율 없음 → raw 그대로
  return amount * r;
}

/**
 * 표시용 — "AED 5,500 ($1,500)" 형식.
 * USD인 경우 환산 부분 생략 ("$1,500" 만).
 */
export function formatLocalAndUsd(
  amount: number | null,
  currency: string,
  rates: ExchangeRates,
): string {
  if (amount == null) return "—";
  if (currency === "USD") {
    return `$${Math.round(amount).toLocaleString()}`;
  }
  const usd = toUsd(amount, currency, rates);
  const local = `${currency} ${Math.round(amount).toLocaleString()}`;
  if (usd == null || usd === amount) return local;
  return `${local} ($${Math.round(usd).toLocaleString()})`;
}
