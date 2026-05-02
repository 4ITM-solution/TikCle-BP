import Papa from "papaparse";
import { stripBom, toNum } from "./utils";

export type AmazonSalesRow = {
  asin: string;
  name: string;
  url: string | null;
  price: number | null;
  category: string | null;
  bsr: number | null;
  units_30d: number | null;
  revenue_30d: number | null;
  raw: Record<string, string>;
};

/**
 * Amazon 30일 매출 CSV 파서.
 * 사용자 결정: "ASIN별 매출"만 사용 (Parent Level 무시).
 */
export function parseAmazonSales(raw: string): {
  rows: AmazonSalesRow[];
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

  const rows: AmazonSalesRow[] = [];
  for (const r of parsed.data) {
    const asin = r.ASIN?.trim();
    if (!asin) continue;

    // CSV의 URL 컬럼이 비면 https://www.amazon.com/dp/{ASIN} 으로 폴백
    const urlRaw = r.URL?.trim();
    const url = urlRaw || `https://www.amazon.com/dp/${asin}`;

    rows.push({
      asin,
      name: r.Title?.trim() || asin,
      url,
      price: toNum(r.Price),
      category: r.Category?.trim() || r.Subcategory?.trim() || null,
      bsr: toNum(r.BSR),
      units_30d: toNum(r["ASIN Sales"]),
      revenue_30d: toNum(r["ASIN Revenue"]),
      raw: r,
    });
  }

  return { rows, errors, totalLines: parsed.data.length };
}
