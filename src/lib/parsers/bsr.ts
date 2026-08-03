import Papa from "papaparse";
import { parseKeepaDateTime, stripBom, toNum } from "./utils";

export type BsrRow = {
  collected_at: string; // YYYY-MM-DD
  bsr: number | null;
  subcategory_bsr?: number | null; // 차트 export의 최하위 카테고리 랭크 (BE-35)
  new_price: number | null;
  list_price: number | null;
};

/**
 * Keepa BSR CSV 파서 — 두 형식 지원.
 *
 * A) 제품 export (기존): Time / Sales Rank / New Price / List Price
 * B) 카테고리 차트 export (BE-35): Time / <최상위 카테고리> / <하위 카테고리…>
 *    예: Time,"Beauty & Personal Care","Face","Face Moisturizers","N/A","N/A","Facial Sunscreens"
 *    - 최상위(첫 카테고리 열) → bsr, 가장 오른쪽의 이름 있는 열(최하위) → subcategory_bsr
 *    - 최상위는 일별 00:00 행에만, 하위는 intraday 행에만 값이 있음 → 날짜 단위로 병합
 *    - "N/A" 열은 무시. subcategory_name으로 최하위 카테고리명 반환(products.category 기록용)
 *
 * 빈 row(랭크/가격 모두 null)는 스킵 — 관측 없는 날짜는 의미 없음.
 */
export function parseBsr(raw: string): {
  rows: BsrRow[];
  errors: string[];
  totalLines: number;
  subcategory_name?: string | null;
} {
  const csv = stripBom(raw);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = parsed.errors.map(
    (e) => `[row ${e.row}] ${e.message}`,
  );

  const fields = (parsed.meta.fields ?? []).map((f) => f.trim());
  const isChartFormat =
    !fields.includes("Sales Rank") &&
    fields.length >= 2 &&
    fields[0] === "Time";

  if (isChartFormat) {
    // ─── B) 카테고리 차트 export ───
    const catCols = fields.slice(1).filter((f) => f && f !== "N/A");
    if (catCols.length === 0) {
      return {
        rows: [],
        errors: [...errors, "카테고리 열을 찾지 못했습니다"],
        totalLines: parsed.data.length,
        subcategory_name: null,
      };
    }
    const topCol = catCols[0]!;
    const subCol =
      catCols.length > 1 ? catCols[catCols.length - 1]! : null;

    // 날짜 단위 병합 — 최상위는 00:00 행, 하위는 intraday 행에 흩어져 있음
    const byDate = new Map<
      string,
      { bsr: number | null; sub: number | null }
    >();
    for (const r of parsed.data) {
      const iso = parseKeepaDateTime(r.Time ?? "");
      if (!iso) continue;
      const date = iso.slice(0, 10);
      const top = toNum(r[topCol]);
      const sub = subCol ? toNum(r[subCol]) : null;
      if (top === null && sub === null) continue;
      const cur = byDate.get(date) ?? { bsr: null, sub: null };
      if (top !== null) cur.bsr = Math.round(top);
      if (sub !== null) cur.sub = Math.round(sub);
      byDate.set(date, cur);
    }

    const rows: BsrRow[] = Array.from(byDate.entries()).map(
      ([date, v]) => ({
        collected_at: date,
        bsr: v.bsr,
        subcategory_bsr: v.sub,
        new_price: null,
        list_price: null,
      }),
    );
    return {
      rows,
      errors,
      totalLines: parsed.data.length,
      subcategory_name: subCol,
    };
  }

  // ─── A) 제품 export (기존 경로 그대로) ───
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
