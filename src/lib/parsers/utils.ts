const EN_MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function buildUtcIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  se: number,
): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function applyAmPm(hour: number, ampm: string | undefined): number {
  if (!ampm) return hour;
  const u = ampm.toUpperCase();
  if ((u === "PM" || u === "오후") && hour !== 12) return hour + 12;
  if ((u === "AM" || u === "오전") && hour === 12) return 0;
  return hour;
}

/**
 * Keepa BSR CSV의 Time 컬럼 파서. 로케일별로 export 포맷이 갈리므로 여러 패턴 시도.
 * - 한국어: "2025. 8. 22. 오후 12:00:00"
 * - 영문 (US): "Aug 22, 2025 12:00:00 PM" / "Aug 22, 2025, 12:00:00 PM" / "August 22, 2025, 12:00 PM"
 * - 영문 (UK/대시): "22 Aug 2025 14:30:00"
 * - 슬래시 (US): "8/22/2025 12:00:00 PM" / "8/22/2025, 12:00 PM"
 * - 슬래시 (EU/JP): "22/08/2025 14:30:00" / "2025/08/22 14:30:00"
 * - 독일: "22.08.2025 14:30:00"
 * - ISO-like: "2025-08-22 12:00:00" / "2025-08-22T12:00:00Z"
 */
export function parseKeepaDateTime(s: string): string | null {
  if (!s || typeof s !== "string") return null;
  const str = s.trim();
  if (!str) return null;

  // 1) 한국어: 2025. 8. 22. 오후 12:00:00
  let m = str.match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (m) {
    const [, yy, mo, da, ampm, hh, mi, se] = m;
    const h = applyAmPm(parseInt(hh!, 10), ampm);
    return buildUtcIso(+yy!, +mo!, +da!, h, +mi!, +se!);
  }

  // 2) ISO-like: 2025-08-22(T| )12:00:00(.fff)?(Z|+09:00)?
  m = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (m) {
    const [, yy, mo, da, hh, mi, se, tz] = m;
    if (tz) {
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return buildUtcIso(+yy!, +mo!, +da!, +hh!, +mi!, se ? +se : 0);
  }

  // 3) ISO-like 날짜만: 2025-08-22
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return buildUtcIso(+m[1]!, +m[2]!, +m[3]!, 0, 0, 0);

  // 4) 영문 월명 + 일 + 년: "Aug 22, 2025 12:00:00 PM" / "August 22, 2025, 12:00 PM"
  m = str.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?$/,
  );
  if (m) {
    const [, mon, da, yy, hh, mi, se, ampm] = m;
    const moNum = EN_MONTHS[mon!.toLowerCase()];
    if (!moNum) return null;
    const h = applyAmPm(parseInt(hh!, 10), ampm);
    return buildUtcIso(+yy!, moNum, +da!, h, +mi!, se ? +se : 0);
  }

  // 5) 일 + 영문 월명 + 년: "22 Aug 2025 14:30:00"
  m = str.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?$/,
  );
  if (m) {
    const [, da, mon, yy, hh, mi, se, ampm] = m;
    const moNum = EN_MONTHS[mon!.toLowerCase()];
    if (!moNum) return null;
    const h = applyAmPm(parseInt(hh!, 10), ampm);
    return buildUtcIso(+yy!, moNum, +da!, h, +mi!, se ? +se : 0);
  }

  // 6) 슬래시 (US): M/D/YYYY HH:MM(:SS)? (AM|PM)?
  m = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?$/,
  );
  if (m) {
    const [, mo, da, yy, hh, mi, se, ampm] = m;
    const moN = parseInt(mo!, 10);
    const daN = parseInt(da!, 10);
    // EU 포맷 (D/M/YYYY) 보완: 첫 숫자가 12 초과면 일자.
    const isEu = moN > 12 && daN <= 12;
    const month = isEu ? daN : moN;
    const day = isEu ? moN : daN;
    const h = applyAmPm(parseInt(hh!, 10), ampm);
    return buildUtcIso(+yy!, month, day, h, +mi!, se ? +se : 0);
  }

  // 7) 슬래시 (JP/ISO-like): YYYY/MM/DD HH:MM(:SS)?
  m = str.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const [, yy, mo, da, hh, mi, se] = m;
    return buildUtcIso(+yy!, +mo!, +da!, +hh!, +mi!, se ? +se : 0);
  }

  // 8) 독일/EU 점: DD.MM.YYYY HH:MM(:SS)?
  m = str.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const [, da, mo, yy, hh, mi, se] = m;
    return buildUtcIso(+yy!, +mo!, +da!, +hh!, +mi!, se ? +se : 0);
  }

  // 9) 최후의 폴백 — Date 생성자가 인식하면 사용.
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * @deprecated parseKeepaDateTime 사용. 호환용 alias.
 */
export const parseKoreanDateTime = parseKeepaDateTime;

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
