/**
 * 분석 기간 필터 — case.options.period_scope ({start,end} YYYY-MM-DD) 적용.
 *
 * 기간 변경 = 재분석이 아님: 티어·태그·클러스터 소속이 영상/인플 단위 속성으로
 * 저장돼 있어, 라이브 집계 쿼리에 uploaded_at/posted_at/start_date 조건만 건다
 * (유료 phase 재실행 $0). 이퀄베리 "4/1 이후 성과만 보기" 니즈에서 도입 (2026-07-19).
 *
 * v1 적용 범위:
 *   - 기간 재집계: TK 영상 월별/총량(liveTkMonthly), TK 인플 풀(allTkCreators),
 *     Meta 광고 리스트, 클러스터 멤버 재집계, BSR 시계열, 주간 viral views
 *   - 전 기간 유지(라벨로 고지): IG/YT 명단(작성자 단위 — 게시일 조인 필요),
 *     클러스터 정의문·USP 사전(전 기간 코퍼스 산출물), 매출 30d 스냅샷(별도 축)
 */

export type PeriodScope = { start: string | null; end: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getPeriodScope(
  options: Record<string, unknown>,
): PeriodScope | null {
  const raw = options.period_scope as
    | { start?: string | null; end?: string | null }
    | null
    | undefined;
  if (!raw) return null;
  const start = raw.start && DATE_RE.test(raw.start) ? raw.start : null;
  const end = raw.end && DATE_RE.test(raw.end) ? raw.end : null;
  if (!start && !end) return null;
  return { start, end };
}

/** 기간 라벨 ("2026-04-01 ~ 오늘" 형태) */
export function periodLabel(scope: PeriodScope): string {
  return `${scope.start ?? "처음"} ~ ${scope.end ?? "오늘"}`;
}
