/**
 * WS4b: 케이스 완결성 6축 + Q0 채택 판정 (간이 버전).
 *
 * 근거:
 *  - QA_케이스위생 F1: status='ready' 는 "파이프라인이 안 죽고 리턴" 만 보증 → 완결성 신호 아님.
 *    화면은 status 와 독립된 완결성 게이지가 필요.
 *  - QA_케이스위생 F7: "커머스(SKU/매출) ready" 와 "브랜드 모니터링 ready" 를 구분해야 함.
 *  - WS6 §1/§2 정식 판정 SQL 나오면 교체(인터페이스만 맞춤). 지금은 key_stats 존재 카운트.
 *
 * A5(배지·목록 요약) / B1(헤더 게이지) 공용.
 */

export type CompletenessKind = "commerce" | "monitoring";

export type CompletenessAxis = {
  key: string;
  label: string;
  filled: boolean;
  kind: CompletenessKind;
  /** 채워졌을 때 짧은 근거(예: "콘텐츠 1,240건") — 없으면 label 만 */
  note?: string;
};

export type AdoptionVerdict = "채택" | "보류" | "폐기";

export type Completeness = {
  axes: CompletenessAxis[];
  filledCount: number;
  total: number;
  /** 커머스 축(매출/SKU) 충족 */
  commerceReady: boolean;
  /** 모니터링 축(콘텐츠/인플/광고/크로스채널 중 하나 이상) 충족 */
  monitoringReady: boolean;
  verdict: AdoptionVerdict;
};

/** key_stats 에서 필요한 최소 형태만. (list/detail 양쪽에서 loose 하게 넘김) */
export type KeyStatsLike = {
  phase2?: {
    total_contents?: number | null;
    total_unique_creators?: number | null;
    ig_total_videos?: number | null;
    yt_total_videos?: number | null;
    sales_summary?: unknown;
  } | null;
  phase4a?: { total_ads?: number | null } | null;
} | null | undefined;

export type CompletenessInput = {
  status?: string | null;
  /** 실매출 존재 여부(case_product_sales). detail 에서만 정확 — list 는 sales_summary 근사. */
  salesExists?: boolean;
  /** 프로모션 이벤트(시점 축) 존재 — detail 에서 promotion_events 조회로 전달. */
  hasPromotions?: boolean;
};

export function computeCompleteness(
  ks: KeyStatsLike,
  input: CompletenessInput = {},
): Completeness {
  const p2 = ks?.phase2 ?? undefined;
  const contents = p2?.total_contents ?? 0;
  const creators = p2?.total_unique_creators ?? 0;
  const igyt = (p2?.ig_total_videos ?? 0) + (p2?.yt_total_videos ?? 0);
  const ads = ks?.phase4a?.total_ads ?? 0;
  const commerce = input.salesExists ?? !!p2?.sales_summary;

  const axes: CompletenessAxis[] = [
    { key: "content", label: "콘텐츠", kind: "monitoring", filled: contents > 0, note: contents > 0 ? `${contents.toLocaleString()}건` : undefined },
    { key: "creator", label: "인플·티어", kind: "monitoring", filled: creators > 0, note: creators > 0 ? `${creators.toLocaleString()}명` : undefined },
    { key: "commerce", label: "매출·SKU", kind: "commerce", filled: commerce },
    { key: "ad", label: "광고(Meta)", kind: "monitoring", filled: ads > 0, note: ads > 0 ? `${ads.toLocaleString()}건` : undefined },
    { key: "crosschannel", label: "IG·YT", kind: "monitoring", filled: igyt > 0, note: igyt > 0 ? `${igyt.toLocaleString()}건` : undefined },
    { key: "timing", label: "시점(프로모션)", kind: "monitoring", filled: !!input.hasPromotions },
  ];

  const filledCount = axes.filter((a) => a.filled).length;
  const commerceReady = axes.some((a) => a.kind === "commerce" && a.filled);
  const monitoringReady = axes.some((a) => a.kind === "monitoring" && a.filled);

  // 판정(간이): data_ready(BE-7: 전 채널 0건) 또는 0축 → 폐기. 4축+ → 채택. 그 사이 → 보류.
  let verdict: AdoptionVerdict;
  if (input.status === "data_ready" || filledCount === 0) verdict = "폐기";
  else if (filledCount >= 4) verdict = "채택";
  else verdict = "보류";

  return { axes, filledCount, total: axes.length, commerceReady, monitoringReady, verdict };
}

/** 배지 색상(라이트) — 채택 초록 / 보류 노랑 / 폐기 회색 */
export function adoptionColors(v: AdoptionVerdict): { bg: string; fg: string; border: string } {
  if (v === "채택") return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
  if (v === "보류") return { bg: "#fef9c3", fg: "#854d0e", border: "#fde047" };
  return { bg: "#f3f4f6", fg: "#6b7280", border: "#d1d5db" };
}
