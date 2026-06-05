/**
 * 결정적(deterministic) 날짜 포맷 — SSR(서버)/CSR(클라) 항상 동일 결과.
 *
 * `new Date(x).toLocaleDateString("ko-KR")` 류는
 *   1) Vercel serverless 의 ICU 제한으로 locale 문자열 인자 시 throw → 500
 *   2) 서버(UTC) vs 클라(KST) 타임존 차이로 결과 다름 → React #418 (hydration mismatch)
 * 를 반복 유발했음 (bp_bugs #57, #69).
 *
 * → toLocale* / Intl 미사용. KST(UTC+9) 오프셋을 수동 적용 후 getUTC* 로만 포맷해
 *   런타임 타임존/ICU 와 무관하게 동일 문자열 보장.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstParts(iso: string | number | Date | null | undefined) {
  if (iso == null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    d: k.getUTCDate(),
    h: k.getUTCHours(),
    mi: k.getUTCMinutes(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "2026.06.05" (KST 기준) — 유효하지 않으면 빈 문자열. */
export function fmtKstDate(iso: string | number | Date | null | undefined): string {
  const k = toKstParts(iso);
  if (!k) return "";
  return `${k.y}.${p2(k.mo)}.${p2(k.d)}`;
}

/** "2026.06.05 14:30" (KST 기준) — 유효하지 않으면 빈 문자열. */
export function fmtKstDateTime(iso: string | number | Date | null | undefined): string {
  const k = toKstParts(iso);
  if (!k) return "";
  return `${k.y}.${p2(k.mo)}.${p2(k.d)} ${p2(k.h)}:${p2(k.mi)}`;
}
