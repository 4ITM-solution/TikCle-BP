/**
 * BE-23 — 인게이지먼트 NULL/0/숨김 3상태 규칙 (단일 소스).
 *
 * 실측(Kundal): 3,158건 중 306건이 likes·comments·shares 동시 NULL(=Kalodata 유입, 댓글·좋아요·공유
 * 미제공). 이를 0으로 다루면 반응률(댓글/조회)이 가짜 0이 되어 클러스터 평균·랭킹 왜곡. IG likes=-1
 * (좋아요 숨김)도 동일 — 0 취급 금지.
 *
 * 규칙: ①-1(숨김)·null은 "지표 없음"으로 정규화 ②세 값 모두 없으면 미측정(분모/분자 제외) ③실제 0은 유지.
 * 소비 측(집계·랭킹·반응률)은 반드시 isMeasurable로 걸러 NULL을 0으로 대체하지 않는다.
 */

/** -1(IG 숨김 sentinel)·null → null("지표 없음"). 실제 0은 그대로 유지. */
export function normEngagement(v: number | null | undefined): number | null {
  return v == null || v === -1 ? null : v;
}

/** 반응률 대상 여부 — likes·comments·shares 중 하나라도 실측치(≠null·≠-1)면 측정 가능. */
export function isMeasurableEngagement(
  likes: number | null | undefined,
  comments: number | null | undefined,
  shares: number | null | undefined,
): boolean {
  return [normEngagement(likes), normEngagement(comments), normEngagement(shares)].some((v) => v != null);
}

export type EngagementState = "value" | "zero" | "none";
/** 3상태 구분 — UI "지표 없음" 표기용. value=실측, zero=실제 0, none=NULL/숨김. */
export function engagementState(v: number | null | undefined): EngagementState {
  const n = normEngagement(v);
  if (n == null) return "none";
  return n === 0 ? "zero" : "value";
}
