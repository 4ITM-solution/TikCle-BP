/**
 * 진단서 (Diagnosis) 설문 스키마.
 *
 * 출처: 유상희 진단서 v2 (2026-05-21 슬랙).
 * 14문항. 일부 문항은 매칭 엔진 입력(matchKey)으로 쓰이고, 나머지는
 * 미팅/세일즈 인테이크 맥락 수집용(answer만 저장).
 *
 * LLM 호출 없음 — 답변은 match.ts의 deterministic 스코어러로 전달.
 */

export type QuestionType = "single" | "multi" | "rank" | "scale" | "text";

export type QuestionOption = {
  value: string;
  label: string;
};

export type Question = {
  id: string; // "q1" ...
  group: string; // 섹션 헤더
  prompt: string;
  type: QuestionType;
  options?: QuestionOption[];
  /** 매칭 엔진이 읽는 키. 없으면 인테이크 수집용. */
  matchKey?:
    | "category"
    | "country"
    | "channel"
    | "revenue_band"
    | "product_ready"
    | "edu_needed"
    | "benchmarks"
    | "asset_score"
    | "goal_horizon"
    | "budget"
    | "seeding_ratio"
    | "urgent";
  /** rank 타입에서 최대 선택 수 */
  maxRank?: number;
  placeholder?: string;
  hint?: string;
};

export type DiagnoseAnswers = Record<string, string | string[]>;

// =============================================================================
// 카테고리 / 국가 / 채널 옵션 (cases DB 값과 매핑되는 표준 집합)
// =============================================================================

export const CATEGORY_OPTIONS: QuestionOption[] = [
  { value: "skin", label: "스킨케어" },
  { value: "makeup", label: "메이크업" },
  { value: "hair", label: "헤어" },
  { value: "body", label: "바디" },
  { value: "food", label: "식음료" },
  { value: "life", label: "생활용품" },
  { value: "device", label: "디바이스" },
  { value: "etc", label: "기타" },
];

// cases.country 값 집합 (US/TH/ID/LATAM/MY/MENA/KR)과 매핑
export const COUNTRY_OPTIONS: QuestionOption[] = [
  { value: "US", label: "미국 (US)" },
  { value: "TH", label: "태국 (TH)" },
  { value: "ID", label: "인도네시아 (ID)" },
  { value: "MY", label: "말레이시아 (MY)" },
  { value: "LATAM", label: "중남미 (LATAM)" },
  { value: "MENA", label: "중동 (MENA)" },
  { value: "KR", label: "한국 (KR)" },
  { value: "other", label: "기타/미정" },
];

// cases.channel 값 (amazon/tiktok_shop/shopee/other)과 매핑
export const CHANNEL_OPTIONS: QuestionOption[] = [
  { value: "amazon", label: "아마존" },
  { value: "tiktok_shop", label: "틱톡샵" },
  { value: "dtc", label: "자사몰" },
  { value: "offline", label: "오프라인" },
  { value: "b2b", label: "B2B" },
  { value: "etc", label: "기타" },
];

// 매출 규모 밴드 (KRW 월 매출, cases.rev_30d와 대조용) — 촘촘하게
export const REVENUE_BAND_OPTIONS: QuestionOption[] = [
  { value: "lt_30m", label: "월 3천만원 미만" },
  { value: "30m_100m", label: "월 3천만~1억" },
  { value: "100m_300m", label: "월 1억~3억" },
  { value: "300m_700m", label: "월 3억~7억" },
  { value: "700m_2b", label: "월 7억~20억" },
  { value: "gt_2b", label: "월 20억 이상" },
];

// 월 마케팅 예산 밴드 (KRW)
export const BUDGET_OPTIONS: QuestionOption[] = [
  { value: "lt_10m", label: "월 1,000만원 미만" },
  { value: "10m_30m", label: "월 1,000만~3,000만" },
  { value: "30m_50m", label: "월 3,000만~5,000만" },
  { value: "50m_100m", label: "월 5,000만~1억" },
  { value: "gt_100m", label: "월 1억 이상" },
];

// 마케팅 예산 중 시딩 비중
export const SEEDING_RATIO_OPTIONS: QuestionOption[] = [
  { value: "lt_20", label: "20% 미만" },
  { value: "20_40", label: "20~40%" },
  { value: "40_60", label: "40~60%" },
  { value: "60_80", label: "60~80%" },
  { value: "gt_80", label: "80% 이상" },
];

// =============================================================================
// 14문항
// =============================================================================

export const QUESTIONS: Question[] = [
  // ─── 우리 브랜드는 ───
  {
    id: "q1",
    group: "우리 브랜드는",
    prompt: "어떤 카테고리의 제품을 판매하시나요?",
    type: "single",
    matchKey: "category",
    options: CATEGORY_OPTIONS,
  },
  {
    id: "q2",
    group: "우리 브랜드는",
    prompt: "현재 메인 판매 국가는?",
    type: "single",
    matchKey: "country",
    options: COUNTRY_OPTIONS,
  },
  {
    id: "q3",
    group: "우리 브랜드는",
    prompt: "현재 가장 집중하는 판매 채널은?",
    type: "single",
    matchKey: "channel",
    options: CHANNEL_OPTIONS,
  },
  {
    id: "q4",
    group: "우리 브랜드는",
    prompt: "메인 채널 기준 월 매출 규모는?",
    type: "single",
    matchKey: "revenue_band",
    options: REVENUE_BAND_OPTIONS,
  },

  // ─── 지금 상황은 ───
  {
    id: "q5",
    group: "지금 상황은",
    prompt: "마케팅하고 싶은 제품이 정해져 있나요?",
    type: "single",
    matchKey: "product_ready",
    options: [
      { value: "decided", label: "정해짐" },
      { value: "tbd", label: "같이 정해야 함" },
    ],
  },
  {
    id: "q6",
    group: "지금 상황은",
    prompt: "제품의 성격은?",
    type: "single",
    matchKey: "edu_needed",
    options: [
      { value: "intuitive", label: "보자마자 직관적 — 리뷰 안 봐도 바로 살 수 있음" },
      { value: "edu", label: "에듀케이션 필요함" },
    ],
  },
  {
    id: "q7",
    group: "지금 상황은",
    prompt: "경쟁사 또는 벤치마크 브랜드 3개",
    type: "text",
    matchKey: "benchmarks",
    placeholder: "예: Dr. Groot, Vegamour, Nutrafol",
    hint: "쉼표로 구분. 라이브러리에 있으면 비교 케이스로 바로 매칭됩니다.",
  },
  {
    id: "q8",
    group: "지금 상황은",
    prompt: "인플루언서 마케팅 자산 체크 (해당되는 것 모두)",
    type: "multi",
    matchKey: "asset_score",
    hint: "체크 개수(0~4)로 인플 운영 성숙도를 추정합니다.",
    options: [
      { value: "must_list", label: "\"이 사람 아니면 안 돼\" 인플 리스트가 있다" },
      { value: "viral_1m", label: "조회수 1M 이상 영상 만들어본 경험 있다" },
      { value: "regular_5", label: "정기적으로 협업하는 인플 5명 이상 있다" },
      { value: "hero_angle", label: "우리 제품의 핵심 바이럴 포인트(히어로 앵글)가 정해져 있다" },
    ],
  },

  // ─── 잘 안 되는 건 ───
  {
    id: "q9",
    group: "잘 안 되는 건",
    prompt: "현재 판매 채널에서 가장 큰 고민은?",
    type: "single",
    options: [
      { value: "expand_main", label: "주력 판매 채널에서의 매출 확대" },
      { value: "b2b", label: "오프라인 입점 등 B2B 바이어 셀링" },
      { value: "new_channel", label: "신규 채널(틱톡샵) 입점 & 초반 매출 확보" },
      { value: "region", label: "권역 확장 (동남아/중남미/유럽/중동)" },
      { value: "etc", label: "기타" },
    ],
  },

  // ─── 회사 내부 ───
  {
    id: "q10",
    group: "회사 내부",
    prompt: "회사 내부 마케팅 지원 구조는?",
    type: "single",
    options: [
      { value: "inhouse_team", label: "인하우스 마케팅팀 별도 (퍼포·콘텐츠·CRM 분업)" },
      { value: "1_2_person", label: "마케팅 담당자 1~2명, 전반을 혼자 다룸" },
      { value: "leader_double", label: "별도 인력 없이 대표/리더 겸직" },
      { value: "outsourced", label: "외부 에이전시·프리랜서에 대부분 위임" },
    ],
  },

  // ─── 하고 싶은 건 ───
  {
    id: "q11",
    group: "하고 싶은 건",
    prompt: "가장 가까운 성과 목표 시점은?",
    type: "single",
    matchKey: "goal_horizon",
    options: [
      { value: "1m", label: "1개월" },
      { value: "3m", label: "3개월" },
      { value: "6m", label: "6개월+" },
      { value: "always", label: "상시" },
    ],
  },
  {
    id: "q12",
    group: "하고 싶은 건",
    prompt: "2분기 내 진출 고려 국가가 있나요?",
    type: "text",
    placeholder: "예: 동남아 / 없음",
  },
  {
    id: "q13",
    group: "하고 싶은 건",
    prompt: "올해 배정된 월 평균 마케팅 예산은?",
    type: "single",
    matchKey: "budget",
    hint: "예산 × 시딩 비중 = 실 시딩예산으로 환산해 실행 시나리오를 잡습니다.",
    options: BUDGET_OPTIONS,
  },
  {
    id: "q13b",
    group: "하고 싶은 건",
    prompt: "그 예산 중 시딩(인플) 비중은?",
    type: "single",
    matchKey: "seeding_ratio",
    options: SEEDING_RATIO_OPTIONS,
  },

  // ─── 가장 급한 건 ───
  {
    id: "q14",
    group: "가장 급한 건",
    prompt: "지금 가장 먼저 풀고 싶은 문제는? (순서대로 최대 3개)",
    type: "rank",
    matchKey: "urgent",
    maxRank: 3,
    hint: "순위가 높을수록 그 문제를 잘 푼 BP를 더 끌어올립니다.",
    options: [
      { value: "paid_ops", label: "유가 시딩 운영/핸들링" },
      { value: "organic_volume", label: "무가 시딩 볼륨 확대" },
      { value: "new_country", label: "신규 국가 탐색" },
      { value: "hero_sku", label: "히어로 SKU 정하기" },
      { value: "logistics", label: "물류/풀필먼트" },
      { value: "discovery", label: "인플루언서 디스커버리" },
      { value: "usp_guide", label: "USP·콘텐츠 가이드라인" },
      { value: "etc", label: "기타" },
    ],
  },
];

/** matchKey가 있는 문항만 골라 매칭 입력으로 변환 */
export function extractMatchInput(answers: DiagnoseAnswers) {
  const get = (id: string) => answers[id];
  return {
    category: (get("q1") as string) ?? null,
    country: (get("q2") as string) ?? null,
    channel: (get("q3") as string) ?? null,
    revenueBand: (get("q4") as string) ?? null,
    productReady: (get("q5") as string) ?? null,
    eduNeeded: (get("q6") as string) ?? null,
    benchmarks: ((get("q7") as string) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    assetScore: Array.isArray(get("q8")) ? (get("q8") as string[]).length : 0,
    goalHorizon: (get("q11") as string) ?? null,
    budget: (get("q13") as string) ?? null,
    seedingRatio: (get("q13b") as string) ?? null,
    // q14는 rank 타입 — 선택 순서가 곧 우선순위 (index 0 = 1순위)
    urgent: Array.isArray(get("q14")) ? (get("q14") as string[]) : [],
  };
}

export type MatchInput = ReturnType<typeof extractMatchInput>;
