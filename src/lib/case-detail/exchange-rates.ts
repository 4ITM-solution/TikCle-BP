/**
 * Client-safe 환율 helper. server-only 코드(supabase/server)는 사용하지 않음.
 * fetchExchangeRates()는 server에서만 동작 — server-import 통해 호출.
 */

export type ExchangeRates = Record<string, number>;

/** USD = 1 baseline. 다른 통화는 "1 unit = X USD"의 X. */
export const FALLBACK_RATES: ExchangeRates = {
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
 * amount(local currency) → USD. 환율 없으면 amount 그대로 반환 (즉 1:1로 가정).
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
