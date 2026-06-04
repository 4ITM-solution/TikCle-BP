/**
 * 진단서 시딩 단가(상품) — client-safe 타입 + 기본값.
 * 운영자가 /settings/seeding-pricing 에서 수정 → app_settings.diagnose_pricing 갱신.
 * server fetch는 pricing-server.ts (server-only).
 */

import type { TierBucket } from "@/lib/inngest/types";

/** 티어별 콘텐츠 1건당 단가 (KRW) */
export type SeedingPricing = {
  tierCost: Record<TierBucket, number>;
};

/** 편집 UI에 노출할 티어 순서 + 라벨 + 팔로워 가이드 */
export const PRICING_TIERS: {
  tier: TierBucket;
  label: string;
  hint: string;
}[] = [
  { tier: "mega", label: "메가", hint: "팔로워 1M+" },
  { tier: "macro", label: "매크로", hint: "팔로워 500K+" },
  { tier: "mid", label: "미드", hint: "팔로워 100K+" },
  { tier: "micro", label: "마이크로", hint: "팔로워 10K+" },
  { tier: "nano", label: "나노", hint: "팔로워 1K+" },
  { tier: "sub-nano", label: "서브나노", hint: "팔로워 1K 미만" },
  { tier: "unknown", label: "미상", hint: "팔로워 미상" },
];

/** 기본 단가 (KRW / 콘텐츠 1건). 운영자가 설정 페이지에서 덮어씀. */
export const DEFAULT_PRICING: SeedingPricing = {
  tierCost: {
    mega: 15_000_000,
    macro: 5_000_000,
    mid: 2_000_000,
    micro: 700_000,
    nano: 200_000,
    "sub-nano": 100_000,
    unknown: 500_000,
  },
};

/** app_settings에서 받은 raw value를 안전하게 SeedingPricing으로 정규화 */
export function normalizePricing(raw: unknown): SeedingPricing {
  if (!raw || typeof raw !== "object") return DEFAULT_PRICING;
  const obj = raw as { tierCost?: Record<string, unknown> };
  const tc = obj.tierCost;
  if (!tc || typeof tc !== "object") return DEFAULT_PRICING;
  const tierCost = { ...DEFAULT_PRICING.tierCost };
  for (const { tier } of PRICING_TIERS) {
    const v = tc[tier];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      tierCost[tier] = v;
    }
  }
  return { tierCost };
}
