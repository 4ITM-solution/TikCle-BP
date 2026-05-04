/**
 * 매출 티어 — 사용자가 case detail에서 직접 박는 태그.
 * Browse 페이지의 필터 chip 키.
 */
export type RevenueTier = "lt_100m" | "100m_500m" | "500m_1b" | "1b_plus";

export const REVENUE_TIERS: { value: RevenueTier; label: string; sort: number }[] = [
  { value: "lt_100m", label: "<100m", sort: 1 },
  { value: "100m_500m", label: "100m–500m", sort: 2 },
  { value: "500m_1b", label: "500m–1b", sort: 3 },
  { value: "1b_plus", label: "1b+", sort: 4 },
];

const BY_VALUE = new Map(REVENUE_TIERS.map((t) => [t.value, t]));

export function tierLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return BY_VALUE.get(value as RevenueTier)?.label ?? value;
}

export function isRevenueTier(value: string): value is RevenueTier {
  return BY_VALUE.has(value as RevenueTier);
}
