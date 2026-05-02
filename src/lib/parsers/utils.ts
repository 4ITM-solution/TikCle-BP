/**
 * 한글 로케일 날짜 파서.
 * Keepa BSR CSV의 "2025. 8. 22. 오후 12:00:00" 같은 포맷을 ISO date로 변환.
 */
export function parseKoreanDateTime(s: string): string | null {
  if (!s || typeof s !== "string") return null;

  const m = s.match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!m) return null;

  const [, yy, mo, da, ampm, hh, mm, ss] = m;
  let h = parseInt(hh!, 10);
  if (ampm === "오후" && h !== 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;

  const date = new Date(
    Date.UTC(
      parseInt(yy!, 10),
      parseInt(mo!, 10) - 1,
      parseInt(da!, 10),
      h,
      parseInt(mm!, 10),
      parseInt(ss!, 10),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * "2025-10-16T21:44:40.000Z" 같은 ISO를 YYYY-MM-DD date로.
 */
export function isoToDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * 숫자 변환 - 빈 문자열/N/A는 null.
 * 콤마(`1,234`), 통화기호(`$1,234.56`), 공백을 제거 후 파싱.
 */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === "N/A" || s === "-") return null;
  // 통화 기호, 공백, 콤마 제거 (천 단위 구분)
  const cleaned = s.replace(/[$£€¥₩,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * 파일명에서 Amazon ASIN 추출. 10자 영숫자 (B로 시작 + 9자).
 */
export function extractAsinFromFilename(filename: string): string | null {
  const m = filename.match(/B0[A-Z0-9]{8}/);
  return m?.[0] ?? null;
}

/**
 * UTF-8 BOM 제거.
 */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
