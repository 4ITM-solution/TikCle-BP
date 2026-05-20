/**
 * Shopdora 데이터 파서 (Shopee SEA 분석 도구).
 *
 * 두 가지 입력 포맷 지원:
 *   1) 제품 스냅샷 — Shopdora 웹 화면을 통째로 복사한 텍스트. "Past 30days" 기준.
 *      각 제품 블록은 "Traffic Word Analysis"로 끝남. ID(9~13자리)를 앵커로 잡고
 *      그 앞 줄을 제품명, 뒤 줄들에서 Rp/S$/RM/฿ 통화값 3개(Rev/Day, Rev/Month, Price)
 *      + Sold/Month + 날짜 + Category 추출.
 *   2) 월별 시계열 — 제품 헤더 줄(ID + 제품명, 탭 구분) 다음에 줄마다 "YYYYMM  Sold/M  Revenue/M  Avg Price"
 *      형식. N/A 월은 skip.
 */

const CURRENCY_PREFIXES = ["Rp", "S$", "RM", "฿"] as const;

function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[Rp,$RM฿S\s]/g, "").replace(/%/g, "").replace(/\+/g, "");
  if (!cleaned || cleaned === "N/A" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(blockLines: string[]): string {
  for (const l of blockLines) {
    if (l.startsWith("Rp")) return "IDR";
    if (l.startsWith("S$")) return "SGD";
    if (l.startsWith("RM")) return "MYR";
    if (l.startsWith("฿")) return "THB";
  }
  return "IDR";
}

export type ShopdoraProductRow = {
  ext_id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  sold_month: number | null;
  revenue_day: number | null;
  revenue_month: number | null;
  price: number | null;
  listing_date: string | null; // YYYY-MM-DD
  currency: string;
};

/**
 * Shopdora 웹 화면 텍스트 → 제품 스냅샷 배열.
 */
export function parseShopdoraSnapshot(raw: string): {
  rows: ShopdoraProductRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ShopdoraProductRow[] = [];
  const seen = new Set<string>();

  // 블록 분리: "Traffic Word Analysis"로 split (각 제품 블록 끝)
  const blocks = raw.split(/Traffic Word Analysis/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // ID 앵커 찾기 (9~13자리 순수숫자)
    const idIdx = lines.findIndex((l) => /^\d{9,13}$/.test(l));
    if (idIdx <= 0) continue; // 제품명이 ID 앞에 있어야 함

    const ext_id = lines[idIdx]!;
    if (seen.has(ext_id)) continue;
    const name = lines[idIdx - 1]!;
    const vals = lines.slice(idIdx + 1);

    // 통화값 3개 (Rev/Day, Rev/Month, Price 순)
    const moneyVals = vals.filter((v) =>
      CURRENCY_PREFIXES.some((p) => v.startsWith(p)),
    );
    if (moneyVals.length < 3) continue;
    const revenue_day = parseMoney(moneyVals[0]);
    const revenue_month = parseMoney(moneyVals[1]);
    const price = parseMoney(moneyVals[2]);

    // Sold/Month = ID 다음 6번째 값 (vals[5])
    // 검증: Revenue/Month ÷ Price ≈ Sold/Month
    const sold_month = vals.length > 5 ? parseMoney(vals[5]) : null;

    // listing date = YYYY-MM-DD
    const listing_date =
      vals.find((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)) ?? null;

    // Category — "Category：" 다음 줄
    let category: string | null = null;
    let subcategory: string | null = null;
    const catIdx = lines.findIndex((l) => l === "Category：");
    if (catIdx >= 0 && catIdx + 1 < lines.length) {
      const fullCat = lines[catIdx + 1]!;
      category = fullCat;
      // Beauty-Skincare-Facial Serum → 마지막 세그먼트
      const parts = fullCat.split("-").map((s) => s.trim());
      subcategory = parts[parts.length - 1] ?? null;
    }

    rows.push({
      ext_id,
      name,
      category,
      subcategory,
      sold_month: sold_month != null ? Math.round(sold_month) : null,
      revenue_day,
      revenue_month,
      price,
      listing_date,
      currency: detectCurrency(lines),
    });
    seen.add(ext_id);
  }

  if (rows.length === 0) {
    errors.push("파싱된 제품 0개 — Shopdora 화면 텍스트 형식이 맞는지 확인");
  }
  return { rows, errors };
}

export type ShopdoraMonthlyRow = {
  ext_id: string;
  name: string;
  year_month: string; // "YYYY-MM"
  sold_month: number | null;
  revenue_month: number | null;
  avg_price: number | null;
};

/**
 * 월별 시계열 텍스트 파서.
 *
 * 입력 형식 (탭 또는 공백 구분):
 *   <ID> <제품명>
 *   202506 9694 Rp3,489,840,000.00 Rp147,950.00
 *   202507 ...
 *   <ID2> <제품명2>
 *   ...
 *
 * 한 헤더 줄(ID + 이름) 다음 N개 월 줄. N/A 월은 skip.
 */
export function parseShopdoraMonthly(raw: string): {
  rows: ShopdoraMonthlyRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ShopdoraMonthlyRow[] = [];

  let cur: { ext_id: string; name: string } | null = null;
  const lines = raw.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, "").trim();
    if (!line) continue;
    // 헤더 줄: ID(9~13자리) 다음 제품명 (탭 또는 공백 구분)
    const headerMatch = line.match(/^(\d{9,13})[\s\t]+(.+)$/);
    if (headerMatch) {
      cur = { ext_id: headerMatch[1]!, name: headerMatch[2]!.trim() };
      continue;
    }
    // 월 데이터 줄: YYYYMM <Sold> <Rev> <Price>
    const cells = line.split(/[\s\t]+/);
    if (cells.length < 2) continue;
    const ym = cells[0]!;
    if (!/^\d{6}$/.test(ym)) continue;
    if (!cur) {
      errors.push(`헤더(ID + 제품명) 없이 월 데이터 발견: ${line.slice(0, 60)}`);
      continue;
    }
    const sold = parseMoney(cells[1]);
    const rev = parseMoney(cells[2]);
    const price = parseMoney(cells[3]);
    if (rev == null && sold == null) continue; // N/A 월
    rows.push({
      ext_id: cur.ext_id,
      name: cur.name,
      year_month: `${ym.slice(0, 4)}-${ym.slice(4)}`,
      sold_month: sold != null ? Math.round(sold) : null,
      revenue_month: rev,
      avg_price: price,
    });
  }

  if (rows.length === 0) {
    errors.push("파싱된 월 row 0개");
  }
  return { rows, errors };
}
