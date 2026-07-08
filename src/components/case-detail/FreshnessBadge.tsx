/**
 * ★ B4(WS4b): freshness 배지 — source별 최신성(간이: max 날짜 기준 경과일).
 * 헤더 + 광고 섹션 필수("광고 데이터 N일 경과"). 서버에서 경과일 계산해 전달.
 */
export function FreshnessBadge({
  label,
  days,
  maxDate,
}: {
  label: string;
  /** 경과일 (null = 데이터 없음) */
  days: number | null;
  maxDate: string | null;
}) {
  if (days == null || !maxDate) {
    return (
      <span style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 9, background: "#f3f4f6", color: "#9ca3af" }}>
        {label}: 데이터 없음
      </span>
    );
  }
  // 30일 이내 fresh(초록), 90일 이내 주의(노랑), 그 이상 stale(빨강)
  const tone = days <= 30
    ? { bg: "#dcfce7", fg: "#166534" }
    : days <= 90
      ? { bg: "#fef9c3", fg: "#854d0e" }
      : { bg: "#fee2e2", fg: "#991b1b" };
  return (
    <span
      title={`최신 데이터: ${maxDate}`}
      style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 9, background: tone.bg, color: tone.fg }}
    >
      {label}: {days}일 경과
    </span>
  );
}

/** 날짜 문자열 → 오늘까지 경과일 (서버). 잘못된 값이면 null. */
export function daysSince(dateStr: string | null | undefined, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
