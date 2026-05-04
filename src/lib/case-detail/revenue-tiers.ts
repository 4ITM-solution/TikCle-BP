/**
 * 매출 티어 — 사용자가 case detail에서 직접 박는 태그.
 * Browse 페이지의 필터 키.
 *
 * 매핑 가이드 (운영 룰):
 * - Tier 1 = 가장 큰 (1b+)
 * - Tier 2 = 중간 (100m–1b)
 * - Tier 3 = 작은 (<100m)
 */
export type RevenueTier = "tier_1" | "tier_2" | "tier_3";

export const REVENUE_TIERS: { value: RevenueTier; label: string; sort: number }[] = [
  { value: "tier_1", label: "Tier 1", sort: 1 },
  { value: "tier_2", label: "Tier 2", sort: 2 },
  { value: "tier_3", label: "Tier 3", sort: 3 },
];

const BY_VALUE = new Map(REVENUE_TIERS.map((t) => [t.value, t]));

export function tierLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return BY_VALUE.get(value as RevenueTier)?.label ?? value;
}

export function isRevenueTier(value: string): value is RevenueTier {
  return BY_VALUE.has(value as RevenueTier);
}
