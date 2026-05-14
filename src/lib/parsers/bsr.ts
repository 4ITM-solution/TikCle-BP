import Papa from "papaparse";
import { parseKeepaDateTime, stripBom, toNum } from "./utils";

export type BsrRow = {
  collected_at: string; // YYYY-MM-DD
  bsr: number | null;
  new_price: number | null;
  list_price: number | null;
};

/**
 * Keepa BSR CSV 파서.
 * 컬럼: Time / Sales Rank / New Price / List Price
 * Time 포맷: "2025. 8. 22. 오후 12:00:00"
 *
 * 빈 row(랭크/가격 모두 null)는 스킵 — 관측 없는 날짜는 의미 없음.
 */
export function parseBsr(raw: string): {
  rows: BsrRow[];
  errors: string[];
  totalLines: number;
} {
  const csv = stripBom(raw);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = parsed.errors.map(
    (e) => `[row ${e.row}] ${e.message}`,
  );

  const rows: BsrRow[] = [];
  for (const r of parsed.data) {
    const iso = parseKeepaDateTime(r.Time ?? "");
    if (!iso) continue;

    const bsrRaw = toNum(r["Sales Rank"]);
    const newPrice = toNum(r["New Price"]);
    const listPrice = toNum(r["List Price"]);
    if (bsrRaw === null && newPrice === null && listPrice === null) continue;

    // BSR은 integer 컬럼. keepa가 일별 평균을 소수점으로 주는 경우 반올림.
    const bsr = bsrRaw === null ? null : Math.round(bsrRaw);

    rows.push({
      collected_at: iso.slice(0, 10),
      bsr,
      new_price: newPrice,
      list_price: listPrice,
    });
  }

  return { rows, errors, totalLines: parsed.data.length };
}
