/**
 * 진단서 → BP 매칭 엔진 (deterministic, LLM 호출 0).
 *
 * 흐름 (중요 — 2단계):
 *   1) 프로필 fit으로 베스트 BP 매칭 (카테고리/국가/채널/매출규모/상황).
 *      예산 무관. topMatches[0] = "가장 가까운 BP".
 *   2) 예산(월 1천/3천/5천)은 케이스를 고르는 축이 아니라,
 *      "그 방향을 얼마짜리로 실행하느냐"의 규모 시나리오.
 *      매칭된 BP가 예산 사다리 어디에 위치하는지도 함께 표시.
 *
 * ⚙️ 단가/규모 상수는 모두 이 파일 상단에 모아둠 — 실비즈 수치는 여기서만 조정.
 */

import type { MatchInput } from "./questionnaire";
import type { TierDistribution } from "@/lib/inngest/types";

// =============================================================================
// ⚙️ 튜너블 상수 — 비즈 수치는 전부 여기
// =============================================================================

/**
 * 예산 시나리오. 플레이북(M1 USP테스트 1천 / M2 나노패키지 1.5천 /
 * M3 나노+소액유가 2.5천, 총 5천/5개월)을 "월 예산" 관점으로 재구성.
 *
 * targetMonthly: 그 예산으로 현실적인 월 시딩 영상 수 범위.
 * estInfluencers: 권장 인플 구성 한 줄.
 */
export const BUDGET_TIERS = [
  {
    id: "10m" as const,
    label: "시딩예산 월 1,000만원",
    seedingKrw: 10_000_000, // 이 티어가 대표하는 월 시딩예산
    packageName: "USP 테스트 — 위닝 앵글 찾기",
    targetMonthly: [15, 35] as [number, number],
    estInfluencers: "무가·나노 중심 + 유가 0~3명으로 USP 재현성 검증",
  },
  {
    id: "30m" as const,
    label: "시딩예산 월 3,000만원",
    seedingKrw: 30_000_000,
    packageName: "나노 패키지 확장 + 소액유가",
    targetMonthly: [40, 90] as [number, number],
    estInfluencers: "나노 볼륨 확대 + 소액유가 마이크로 5~10명",
  },
  {
    id: "50m" as const,
    label: "시딩예산 월 5,000만원",
    seedingKrw: 50_000_000,
    packageName: "풀 시딩 — 나노+유가+미드 병행",
    targetMonthly: [90, 180] as [number, number],
    estInfluencers: "나노 풀가동 + 마이크로/미드 유가 + 광고소재 확보",
  },
];

export type BudgetTierId = (typeof BUDGET_TIERS)[number]["id"];

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
// 미등록 브랜드는 'skin' 기본값. 카테고리는 soft 가중치라 과적합 위험 적음.
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
// 입력 케이스 타입
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
  /** Top 1 SKU 매출 집중도 0~1 (Q14 히어로SKU 시그널) */
  top1Share: number | null;
  summaryLine: string | null;
};

export type ScoredCase = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  rev30dUsd: number | null;
  monthlyContents: number; // 월 평균 시딩 영상 수
  creators: number | null;
  tierMixLabel: string | null;
  score: number;
  reasons: string[];
};

export type BudgetScenario = {
  id: BudgetTierId;
  label: string;
  packageName: string;
  targetMonthly: [number, number];
  estInfluencers: string;
  selected: boolean; // 사용자가 고른 예산
  /** 매칭된 #1 BP의 월 시딩 규모가 이 티어 범위에 들어오는지 */
  matchesTopBp: boolean;
};

export type DiagnoseMatchResult = {
  topMatches: ScoredCase[]; // fit 순 — [0]이 가장 가까운 BP
  benchmarkHits: ScoredCase[];
  budgetScenarios: BudgetScenario[];
  /** 매칭된 #1 BP의 월 시딩 규모 (예산 사다리 대조용) */
  topBpMonthly: number | null;
  /** 환산된 월 실 시딩예산 (KRW) — 예산 × 시딩비중 */
  seedingBudgetKrw: number | null;
  profileLine: string;
};

// =============================================================================
// Helper
// =============================================================================

/** 최근 6개월 평균 월 시딩 영상 수. 데이터 없으면 total/12 폴백. */
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

function tierMixLabel(d: TierDistribution | null): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.mega) parts.push(`Mega ${d.mega}`);
  if (d.macro) parts.push(`Macro ${d.macro}`);
  if (d.mid) parts.push(`Mid ${d.mid}`);
  if (d.micro) parts.push(`Micro ${d.micro}`);
  if (d.nano) parts.push(`Nano ${d.nano}`);
  if (d["sub-nano"]) parts.push(`Sub-nano ${d["sub-nano"]}`);
  return parts.length ? parts.join(" · ") : null;
}

/** 유가 추정 티어(mega+macro+mid) 비중 0~1 */
function paidTierShare(d: TierDistribution | null): number {
  if (!d) return 0;
  const total =
    d.mega + d.macro + d.mid + d.micro + d.nano + d["sub-nano"] + d.unknown;
  if (total <= 0) return 0;
  return (d.mega + d.macro + d.mid) / total;
}

/** 무가 추정 티어(nano+sub-nano) 비중 0~1 */
function organicTierShare(d: TierDistribution | null): number {
  if (!d) return 0;
  const total =
    d.mega + d.macro + d.mid + d.micro + d.nano + d["sub-nano"] + d.unknown;
  if (total <= 0) return 0;
  return (d.nano + d["sub-nano"]) / total;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Q14 급한 문제(순위) → 그 문제를 잘 푼 케이스 부스트.
 * urgent[0]=1순위. 시그널 매핑 가능한 항목만 점수 반영(나머지는 수집만).
 */
function urgentBoost(
  urgent: string[],
  c: DiagnoseCaseInput,
): { boost: number; reasons: string[] } {
  let boost = 0;
  const reasons: string[] = [];
  urgent.slice(0, URGENT_RANK_WEIGHT.length).forEach((u, rank) => {
    const w = URGENT_RANK_WEIGHT[rank]!;
    let signal = 0; // 0~1
    let reason = "";
    switch (u) {
      case "paid_ops": // 유가 시딩 운영
        signal = paidTierShare(c.tierDistribution);
        reason = "유가(매크로·미드) 운영 사례";
        break;
      case "organic_volume": // 무가 볼륨 확대
        signal = clamp01(monthlyContents(c) / 300) * 0.5 +
          organicTierShare(c.tierDistribution) * 0.5;
        reason = "무가·대량 시딩 사례";
        break;
      case "discovery": // 인플 디스커버리
        signal = clamp01((c.totalCreators ?? 0) / 3000);
        reason = "대규모 인플 발굴 사례";
        break;
      case "hero_sku": // 히어로 SKU
        signal = c.top1Share ?? 0;
        reason = "히어로 SKU 집중 사례";
        break;
      default:
        // new_country / logistics / usp_guide / etc → 케이스 데이터 시그널 없음
        signal = 0;
    }
    if (signal > 0.15) {
      boost += w * signal;
      if (rank === 0 && reason) reasons.push(reason); // 1순위만 라벨 표시
    }
  });
  return { boost: Math.round(boost * 10) / 10, reasons };
}

// =============================================================================
// fit 스코어 (예산 무관)
// =============================================================================

function scoreCase(input: MatchInput, c: DiagnoseCaseInput): ScoredCase {
  const reasons: string[] = [];
  let score = 0;

  // 채널
  if (input.channel && c.channel === input.channel) {
    score += WEIGHTS.channel;
    reasons.push("같은 판매 채널");
  } else if (input.channel === "tiktok_shop" && c.channel === "amazon") {
    score += WEIGHTS.channel * 0.3; // 교차채널 약간 인정
  }

  // 국가
  if (input.country && c.country === input.country) {
    score += WEIGHTS.country;
    reasons.push("같은 메인 국가");
  }

  // 카테고리
  if (input.category && brandCategory(c.brand) === input.category) {
    score += WEIGHTS.category;
    reasons.push("같은 제품 카테고리");
  }

  // 매출 규모 근접도
  const bandKrw = input.revenueBand
    ? REVENUE_BAND_KRW[input.revenueBand]
    : null;
  if (bandKrw && c.rev30dUsd) {
    const caseKrw = c.rev30dUsd * USD_KRW;
    const ratio = caseKrw / bandKrw;
    const logDist = Math.abs(Math.log10(ratio));
    const proximity = Math.max(0, 1 - logDist); // 동일=1, 10배차=0
    score += WEIGHTS.revenueProximity * proximity;
    if (proximity > 0.6) reasons.push("비슷한 매출 규모");
  }

  // 데이터 풍부도 (시딩 규모가 의미있게 잡힌 케이스)
  if ((c.totalContents ?? 0) >= 300) {
    score += WEIGHTS.hasGoodData;
  }

  // Q14 급한 문제(순위) 부스트
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
  // 1) fit 매칭 (예산 무관)
  const scored = cases
    .map((c) => scoreCase(input, c))
    .sort((a, b) => b.score - a.score);

  const topMatches = scored.slice(0, 6);
  const topBpMonthly = topMatches[0]?.monthlyContents ?? null;

  // 2) 예산 시나리오 — 케이스 고르는 게 아니라 실행 규모
  //    실 시딩예산 = 월 마케팅 예산 × 시딩 비중 → 가장 가까운 시나리오 선택
  const budgetKrw = input.budget ? BUDGET_BAND_KRW[input.budget] : null;
  const ratio =
    (input.seedingRatio ? SEEDING_RATIO_PCT[input.seedingRatio] : undefined) ??
    0.5; // 비중 미입력 시 50% 가정
  const seedingBudgetKrw =
    budgetKrw != null ? budgetKrw * ratio : null;
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
    const inRange =
      topBpMonthly != null &&
      topBpMonthly >= tier.targetMonthly[0] &&
      topBpMonthly <= tier.targetMonthly[1];
    return {
      id: tier.id,
      label: tier.label,
      packageName: tier.packageName,
      targetMonthly: tier.targetMonthly,
      estInfluencers: tier.estInfluencers,
      selected: tier.id === selectedTierId,
      matchesTopBp: inRange,
    };
  });

  // 벤치마크 브랜드 직접 히트 (Q7)
  const benchLower = input.benchmarks.map((b) => b.toLowerCase());
  const benchmarkHits = scored.filter((s) =>
    benchLower.some(
      (b) =>
        s.brand.toLowerCase().includes(b) ||
        b.includes(s.brand.toLowerCase()),
    ),
  );

  // 프로필 한 줄
  const profileBits: string[] = [];
  if (input.category) profileBits.push(catLabel(input.category));
  if (input.country) profileBits.push(input.country);
  if (input.channel) profileBits.push(channelLabel(input.channel));
  const profileLine = profileBits.join(" · ") || "프로필 미입력";

  return {
    topMatches,
    benchmarkHits,
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
    dtc: "자사몰",
    offline: "오프라인",
    b2b: "B2B",
    etc: "기타",
  };
  return m[v] ?? v;
}
