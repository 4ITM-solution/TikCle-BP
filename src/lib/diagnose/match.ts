/**
 * 진단서 → BP 매칭 → 상품(처방) 변환 엔진 (deterministic, LLM 호출 0).
 *
 * 흐름 (3단계):
 *   1) 프로필 fit + Q14 순위로 베스트 BP 매칭. topMatches[0] = 가장 가까운 BP.
 *   2) 그 BP가 "실제로 한 패턴"을 처방(상품)으로 변환.
 *      ex) 메가를 반복적으로 썼다 → "메가 반복 활용형". 단가/유가비율도 그대로.
 *   3) 예산(시딩예산)은 그 처방을 얼마나 크게 실행하느냐 — 믹스 단가로 나눠 규모 산출.
 *
 * ⚙️ 단가/규모 상수는 모두 이 파일 상단에 모아둠 — 실비즈 수치는 여기서만 조정.
 */

import type { MatchInput } from "./questionnaire";
import type { TierBucket, TierDistribution } from "@/lib/inngest/types";

// =============================================================================
// ⚙️ 튜너블 상수 — 비즈 수치는 전부 여기
// =============================================================================

/** 예산 시나리오 — "월 시딩예산" 3티어. 실행 규모는 처방 단가로 동적 산출. */
export const BUDGET_TIERS = [
  { id: "10m" as const, label: "시딩예산 월 1,000만원", seedingKrw: 10_000_000 },
  { id: "30m" as const, label: "시딩예산 월 3,000만원", seedingKrw: 30_000_000 },
  { id: "50m" as const, label: "시딩예산 월 5,000만원", seedingKrw: 50_000_000 },
];

export type BudgetTierId = (typeof BUDGET_TIERS)[number]["id"];

/** 시딩 콘텐츠 1건당 추정 단가 (KRW) — 티어별. 처방 믹스 단가/실행규모 산출용. */
const SEEDING_COST_PER_CONTENT: Record<TierBucket, number> = {
  mega: 8_000_000,
  macro: 2_500_000,
  mid: 800_000,
  micro: 250_000,
  nano: 60_000,
  "sub-nano": 40_000,
  unknown: 120_000,
};

/** fit 스코어 가중치 (예산은 fit에 들어가지 않음) */
const WEIGHTS = {
  channel: 30,
  country: 22,
  category: 20,
  revenueProximity: 18, // 매출 밴드 근접도 (0~1) × 이 값
  hasGoodData: 10, // 시딩 규모 충분(데이터 풍부) 보너스
};

/** Q14 급한 문제 순위별 부스트 (1순위/2순위/3순위) */
const URGENT_RANK_WEIGHT = [18, 11, 6];

/** "메가 반복 활용형" 판정 임계 (mega 작성자 수) */
const MEGA_REPEAT_THRESHOLD = 10;

/** 매출 규모 밴드 → 대표 KRW 월매출 (proximity 계산용) */
const REVENUE_BAND_KRW: Record<string, number> = {
  lt_30m: 15_000_000,
  "30m_100m": 60_000_000,
  "100m_300m": 180_000_000,
  "300m_700m": 480_000_000,
  "700m_2b": 1_200_000_000,
  gt_2b: 3_000_000_000,
};

/** 마케팅 예산 밴드 → 대표 KRW */
const BUDGET_BAND_KRW: Record<string, number> = {
  lt_10m: 7_000_000,
  "10m_30m": 20_000_000,
  "30m_50m": 40_000_000,
  "50m_100m": 75_000_000,
  gt_100m: 150_000_000,
};

/** 시딩 비중 밴드 → 대표 비율 */
const SEEDING_RATIO_PCT: Record<string, number> = {
  lt_20: 0.12,
  "20_40": 0.3,
  "40_60": 0.5,
  "60_80": 0.7,
  gt_80: 0.9,
};

/** USD→KRW (케이스 rev_30d는 USD, 매출 proximity 비교 시 환산) */
const USD_KRW = 1380;

// =============================================================================
// 브랜드 → 카테고리 맵 (cases에 카테고리 컬럼이 없어 경량 매핑)
// =============================================================================

const BRAND_CATEGORY: Record<string, string> = {
  "Dr. Groot": "hair",
  "Dr. for hair": "hair",
  TOSOWOONG: "skin",
  Elroel: "hair",
  Dyson: "device",
  "Shark Ninja": "device",
  medicube: "device",
  Poppi: "food",
  Buldak: "food",
  SimplyVital: "food",
  Tirtir: "makeup",
  Kahi: "makeup",
  Lepique: "skin",
  Lefilleo: "skin",
};

function brandCategory(brand: string): string {
  return BRAND_CATEGORY[brand] ?? "skin";
}

// =============================================================================
// 타입
// =============================================================================

export type DiagnoseCaseInput = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  rev30dUsd: number | null;
  totalContents: number | null;
  totalCreators: number | null;
  monthlyVideoCounts: { month: string; paid: number; total: number }[];
  tierDistribution: TierDistribution | null;
  top1Share: number | null; // Top1 SKU 매출 집중도 0~1
  summaryLine: string | null;
};

export type ScoredCase = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  rev30dUsd: number | null;
  monthlyContents: number;
  creators: number | null;
  tierMixLabel: string | null;
  score: number;
  reasons: string[];
};

/** 전략 티어(상위 노출용) */
export type TierSlice = { tier: TierBucket; count: number; share: number };

/** BP → 변환된 상품(처방) */
export type Prescription = {
  basedOn: string; // "Dr. Groot (US · 아마존) 패턴 기반"
  headline: string; // "메가 반복 활용형"
  summary: string; // 한 줄
  tiers: TierSlice[]; // 내림차순 (unknown 제외)
  paidShare: number; // 0~1 (mega+macro+mid)
  organicShare: number; // 0~1 (nano+sub-nano)
  blendedCostPerContent: number; // 이 믹스 단가 (KRW)
  monthlyContents: number; // 이 케이스 월 시딩 규모
  megaCount: number;
  bullets: string[];
};

export type BudgetScenario = {
  id: BudgetTierId;
  label: string;
  seedingKrw: number;
  selected: boolean;
  affordableMonthly: number; // 이 예산으로 처방 믹스를 몇 개 실행 가능
  tierBreakdown: { tier: TierBucket; count: number }[]; // 그 믹스로 분해
};

export type DiagnoseMatchResult = {
  topMatches: ScoredCase[];
  benchmarkHits: ScoredCase[];
  prescription: Prescription | null;
  budgetScenarios: BudgetScenario[];
  topBpMonthly: number | null;
  seedingBudgetKrw: number | null;
  profileLine: string;
};

// =============================================================================
// Helper
// =============================================================================

function monthlyContents(c: DiagnoseCaseInput): number {
  const m = c.monthlyVideoCounts ?? [];
  if (m.length > 0) {
    const recent = m.slice(-6);
    const sum = recent.reduce((s, x) => s + (x.total ?? 0), 0);
    return Math.round(sum / recent.length);
  }
  if (c.totalContents) return Math.round(c.totalContents / 12);
  return 0;
}

const STRATEGY_TIERS: TierBucket[] = [
  "mega",
  "macro",
  "mid",
  "micro",
  "nano",
  "sub-nano",
];

export function tierKo(t: TierBucket): string {
  const m: Record<TierBucket, string> = {
    mega: "메가",
    macro: "매크로",
    mid: "미드",
    micro: "마이크로",
    nano: "나노",
    "sub-nano": "서브나노",
    unknown: "미상",
  };
  return m[t];
}

function tierMixLabel(d: TierDistribution | null): string | null {
  if (!d) return null;
  const parts = STRATEGY_TIERS.filter((t) => d[t] > 0).map(
    (t) => `${tierKo(t)} ${d[t]}`,
  );
  return parts.length ? parts.join(" · ") : null;
}

function paidTierShare(d: TierDistribution | null): number {
  if (!d) return 0;
  const total = STRATEGY_TIERS.reduce((s, t) => s + d[t], 0);
  if (total <= 0) return 0;
  return (d.mega + d.macro + d.mid) / total;
}

function organicTierShare(d: TierDistribution | null): number {
  if (!d) return 0;
  const total = STRATEGY_TIERS.reduce((s, t) => s + d[t], 0);
  if (total <= 0) return 0;
  return (d.nano + d["sub-nano"]) / total;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// =============================================================================
// BP → 처방(상품) 변환
// =============================================================================

function derivePrescription(c: DiagnoseCaseInput): Prescription | null {
  const d = c.tierDistribution;
  if (!d) return null;
  const total = STRATEGY_TIERS.reduce((s, t) => s + d[t], 0);
  if (total <= 0) return null;

  const tiers: TierSlice[] = STRATEGY_TIERS.map((t) => ({
    tier: t,
    count: d[t],
    share: d[t] / total,
  }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const paidShare = paidTierShare(d);
  const organicShare = organicTierShare(d);
  const megaCount = d.mega;
  const blended =
    tiers.reduce((s, x) => s + x.share * SEEDING_COST_PER_CONTENT[x.tier], 0) ||
    SEEDING_COST_PER_CONTENT.nano;

  // headline — BP가 실제로 한 패턴
  let headline: string;
  let summary: string;
  if (megaCount >= MEGA_REPEAT_THRESHOLD) {
    headline = "메가 반복 활용형";
    summary = `이 케이스는 메가 인플을 ${megaCount}명 반복 투입했어요. 상위 티어로 노출을 끌어올리는 전략.`;
  } else if (paidShare >= 0.25) {
    headline = "유가(매크로·미드) 드리븐형";
    summary = `매크로·미드 유가 인플 비중이 ${Math.round(paidShare * 100)}%. 유가 인플로 퀄리티·전환을 끄는 전략.`;
  } else if (organicShare >= 0.6) {
    headline = "나노 대량 무가 시딩형";
    summary = `나노·서브나노 비중이 ${Math.round(organicShare * 100)}%. 무가 대량으로 볼륨·바이럴을 노리는 전략.`;
  } else {
    headline = "마이크로 중심 하이브리드형";
    summary = "마이크로를 축으로 유가·무가를 섞은 균형 전략.";
  }

  const bullets: string[] = [];
  const top2 = tiers.slice(0, 2);
  bullets.push(
    `핵심 티어: ${top2
      .map((t) => `${tierKo(t.tier)} ${Math.round(t.share * 100)}%`)
      .join(" · ")}`,
  );
  if (megaCount >= MEGA_REPEAT_THRESHOLD) {
    bullets.push(`메가 ${megaCount}명 활용 — 메가 반복 투입 가능한 풀 확보 필요`);
  }
  bullets.push(
    `유가:무가 ≈ ${Math.round(paidShare * 100)} : ${Math.round(organicShare * 100)}`,
  );
  if ((c.top1Share ?? 0) >= 0.35) {
    bullets.push(
      `히어로 SKU 집중 (Top1 매출 ${Math.round((c.top1Share ?? 0) * 100)}%) — SKU 1개에 화력 집중`,
    );
  }
  bullets.push(`지속 페이스: 월 약 ${monthlyContents(c)}개 시딩`);

  return {
    basedOn: `${c.brand} (${c.country} · ${channelLabel(c.channel)}) 패턴 기반`,
    headline,
    summary,
    tiers,
    paidShare,
    organicShare,
    blendedCostPerContent: Math.round(blended),
    monthlyContents: monthlyContents(c),
    megaCount,
    bullets,
  };
}

/** 처방 믹스를 예산에 맞춰 실행 규모로 스케일 */
function scaleToBudget(
  seedingKrw: number,
  rx: Prescription | null,
): { affordableMonthly: number; tierBreakdown: { tier: TierBucket; count: number }[] } {
  const blended = rx?.blendedCostPerContent ?? SEEDING_COST_PER_CONTENT.nano;
  const affordableMonthly = Math.max(0, Math.round(seedingKrw / blended));
  if (!rx) return { affordableMonthly, tierBreakdown: [] };
  const tierBreakdown = rx.tiers
    .map((t) => ({
      tier: t.tier,
      count: Math.round(affordableMonthly * t.share),
    }))
    .filter((t) => t.count >= 1);
  return { affordableMonthly, tierBreakdown };
}

// =============================================================================
// Q14 부스트
// =============================================================================

function urgentBoost(
  urgent: string[],
  c: DiagnoseCaseInput,
): { boost: number; reasons: string[] } {
  let boost = 0;
  const reasons: string[] = [];
  urgent.slice(0, URGENT_RANK_WEIGHT.length).forEach((u, rank) => {
    const w = URGENT_RANK_WEIGHT[rank]!;
    let signal = 0;
    let reason = "";
    switch (u) {
      case "paid_ops":
        signal = paidTierShare(c.tierDistribution);
        reason = "유가(매크로·미드) 운영 사례";
        break;
      case "organic_volume":
        signal =
          clamp01(monthlyContents(c) / 300) * 0.5 +
          organicTierShare(c.tierDistribution) * 0.5;
        reason = "무가·대량 시딩 사례";
        break;
      case "discovery":
        signal = clamp01((c.totalCreators ?? 0) / 3000);
        reason = "대규모 인플 발굴 사례";
        break;
      case "hero_sku":
        signal = c.top1Share ?? 0;
        reason = "히어로 SKU 집중 사례";
        break;
      default:
        signal = 0;
    }
    if (signal > 0.15) {
      boost += w * signal;
      if (rank === 0 && reason) reasons.push(reason);
    }
  });
  return { boost: Math.round(boost * 10) / 10, reasons };
}

// =============================================================================
// fit 스코어
// =============================================================================

function scoreCase(input: MatchInput, c: DiagnoseCaseInput): ScoredCase {
  const reasons: string[] = [];
  let score = 0;

  if (input.channel && c.channel === input.channel) {
    score += WEIGHTS.channel;
    reasons.push("같은 판매 채널");
  } else if (input.channel === "tiktok_shop" && c.channel === "amazon") {
    score += WEIGHTS.channel * 0.3;
  }

  if (input.country && c.country === input.country) {
    score += WEIGHTS.country;
    reasons.push("같은 메인 국가");
  }

  if (input.category && brandCategory(c.brand) === input.category) {
    score += WEIGHTS.category;
    reasons.push("같은 제품 카테고리");
  }

  const bandKrw = input.revenueBand ? REVENUE_BAND_KRW[input.revenueBand] : null;
  if (bandKrw && c.rev30dUsd) {
    const caseKrw = c.rev30dUsd * USD_KRW;
    const ratio = caseKrw / bandKrw;
    const logDist = Math.abs(Math.log10(ratio));
    const proximity = Math.max(0, 1 - logDist);
    score += WEIGHTS.revenueProximity * proximity;
    if (proximity > 0.6) reasons.push("비슷한 매출 규모");
  }

  if ((c.totalContents ?? 0) >= 300) {
    score += WEIGHTS.hasGoodData;
  }

  const urg = urgentBoost(input.urgent, c);
  score += urg.boost;
  reasons.push(...urg.reasons);

  return {
    id: c.id,
    brand: c.brand,
    country: c.country,
    channel: c.channel,
    rev30dUsd: c.rev30dUsd,
    monthlyContents: monthlyContents(c),
    creators: c.totalCreators,
    tierMixLabel: tierMixLabel(c.tierDistribution),
    score: Math.round(score * 10) / 10,
    reasons,
  };
}

// =============================================================================
// 메인
// =============================================================================

export function computeDiagnoseMatch(
  input: MatchInput,
  cases: DiagnoseCaseInput[],
): DiagnoseMatchResult {
  const byId = new Map(cases.map((c) => [c.id, c]));

  // 1) fit 매칭
  const scored = cases
    .map((c) => scoreCase(input, c))
    .sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 6);
  const topBpMonthly = topMatches[0]?.monthlyContents ?? null;

  // 2) BP → 처방(상품) 변환
  const topInput = topMatches[0] ? byId.get(topMatches[0].id) ?? null : null;
  const prescription = topInput ? derivePrescription(topInput) : null;

  // 3) 예산 → 처방을 얼마나 크게 실행하느냐
  const budgetKrw = input.budget ? BUDGET_BAND_KRW[input.budget] : null;
  const ratio =
    (input.seedingRatio ? SEEDING_RATIO_PCT[input.seedingRatio] : undefined) ??
    0.5;
  const seedingBudgetKrw = budgetKrw != null ? budgetKrw * ratio : null;
  const selectedTierId =
    seedingBudgetKrw != null
      ? BUDGET_TIERS.reduce((best, t) =>
          Math.abs(t.seedingKrw - seedingBudgetKrw) <
          Math.abs(best.seedingKrw - seedingBudgetKrw)
            ? t
            : best,
        ).id
      : undefined;

  const budgetScenarios: BudgetScenario[] = BUDGET_TIERS.map((tier) => {
    const { affordableMonthly, tierBreakdown } = scaleToBudget(
      tier.seedingKrw,
      prescription,
    );
    return {
      id: tier.id,
      label: tier.label,
      seedingKrw: tier.seedingKrw,
      selected: tier.id === selectedTierId,
      affordableMonthly,
      tierBreakdown,
    };
  });

  // 벤치마크 직접 히트 (Q7)
  const benchLower = input.benchmarks.map((b) => b.toLowerCase());
  const benchmarkHits = scored.filter((s) =>
    benchLower.some(
      (b) =>
        s.brand.toLowerCase().includes(b) || b.includes(s.brand.toLowerCase()),
    ),
  );

  const profileBits: string[] = [];
  if (input.category) profileBits.push(catLabel(input.category));
  if (input.country) profileBits.push(input.country);
  if (input.channel) profileBits.push(channelLabel(input.channel));
  const profileLine = profileBits.join(" · ") || "프로필 미입력";

  return {
    topMatches,
    benchmarkHits,
    prescription,
    budgetScenarios,
    topBpMonthly,
    seedingBudgetKrw,
    profileLine,
  };
}

function catLabel(v: string): string {
  const m: Record<string, string> = {
    skin: "스킨케어",
    makeup: "메이크업",
    hair: "헤어",
    body: "바디",
    food: "식음료",
    life: "생활용품",
    device: "디바이스",
    etc: "기타",
  };
  return m[v] ?? v;
}

function channelLabel(v: string): string {
  const m: Record<string, string> = {
    amazon: "아마존",
    tiktok_shop: "틱톡샵",
    shopee: "쇼피",
    dtc: "자사몰",
    offline: "오프라인",
    b2b: "B2B",
    other: "기타",
    etc: "기타",
  };
  return m[v] ?? v;
}
