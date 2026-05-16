import Papa from "papaparse";
import { stripBom, toNum } from "./utils";

export type AmazonSalesRow = {
  asin: string;
  name: string;
  url: string | null;
  price: number | null;
  category: string | null;
  subcategory: string | null;
  listing_age_months: number | null; // Black Box "Listing Age (Months)"
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

  // Helium10 export 컬럼명이 marketplace/옵션에 따라 다름.
  // 알려진 변형: "ASIN Sales / ASIN Revenue" (default), "Monthly Sales / Monthly Revenue" (일부 marketplace 또는 다른 export 모드).
  // 새 변형 발견 시 여기 추가.
  function pickFirst(r: Record<string, string>, keys: string[]): string | undefined {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== "") return r[k];
    }
    return undefined;
  }

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
      subcategory: r.Subcategory?.trim() || null,
      listing_age_months: toNum(
        pickFirst(r, ["Listing Age (Months)", "Listing Age"]),
      ),
      bsr: toNum(r.BSR),
      units_30d: toNum(pickFirst(r, ["ASIN Sales", "Monthly Sales", "Sales (Last 30 Days)"])),
      revenue_30d: toNum(pickFirst(r, ["ASIN Revenue", "Monthly Revenue", "Revenue (Last 30 Days)"])),
      raw: r,
    });
  }

  return { rows, errors, totalLines: parsed.data.length };
}
