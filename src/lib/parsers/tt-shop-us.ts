import Papa from "papaparse";

/**
 * TikTok Shop US — 제품 단위 affiliate creator 리스트 파서.
 *
 * Source: TikTok Shop Seller Center → Product Detail → Affiliate Creators 페이지
 * Export CSV (한 row = 한 크리에이터, Videos 컬럼이 multiline URL).
 *
 * 컬럼:
 * - Username, Nickname
 * - Follower Count (e.g. "104,380")
 * - Follower Demographics (e.g. "Female 87% · 25-34,35-44")
 * - Category (콤마 구분 카테고리 리스트)
 * - Engagement Rate ("0.02%")
 * - Items Sold (Last 30 days) — 숫자
 * - GMV (Last 30 days) — "$4" / "$1,234.50"
 * - Videos — URL 여러 개 (개행 분리)
 * - Number of Videos — 숫자
 */

export type TikTokShopUsAffiliateRow = {
  handle: string;
  nickname: string | null;
  follower_count: number | null;
  demographics_raw: string | null;
  category_raw: string | null;
  engagement_rate: number | null; // 0.0002 (0.02%)
  items_sold_30d: number | null;
  gmv_30d_usd: number | null;
  videos: string[];
  video_count: number;
};

export type TikTokShopUsAffiliateParsed = {
  rows: TikTokShopUsAffiliateRow[];
  errors: string[];
};

function parseNumeric(s: unknown): number | null {
  if (s == null) return null;
  const str = String(s).trim().replace(/[,\s]/g, "");
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function parseUsd(s: unknown): number | null {
  if (s == null) return null;
  const cleaned = String(s)
    .trim()
    .replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePct(s: unknown): number | null {
  if (s == null) return null;
  const str = String(s).trim().replace(/[%\s]/g, "");
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n / 100 : null;
}

function parseVideos(s: unknown): string[] {
  if (s == null) return [];
  return String(s)
    .split(/\r?\n+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));
}

function nullable(s: unknown): string | null {
  if (s == null) return null;
  const v = String(s).trim();
  return v.length > 0 ? v : null;
}

export function parseTiktokShopUsAffiliate(
  csv: string,
): TikTokShopUsAffiliateParsed {
  const errors: string[] = [];
  const rows: TikTokShopUsAffiliateRow[] = [];

  // papaparse: multiline 셀(인용된 줄바꿈) 안전하게 처리
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    for (const e of parsed.errors.slice(0, 5)) {
      errors.push(`csv parse: ${e.message} (row ${e.row})`);
    }
  }

  for (const r of parsed.data) {
    const handle = nullable(r["Username"]);
    if (!handle) continue;
    rows.push({
      handle: handle.replace(/^@/, ""),
      nickname: nullable(r["Nickname"]),
      follower_count: parseNumeric(r["Follower Count"]),
      demographics_raw: nullable(r["Follower Demographics"]),
      category_raw: nullable(r["Category"]),
      engagement_rate: parsePct(r["Engagement Rate"]),
      items_sold_30d: parseNumeric(r["Items Sold (Last 30 days)"]),
      gmv_30d_usd: parseUsd(r["GMV (Last 30 days)"]),
      videos: parseVideos(r["Videos"]),
      video_count: parseNumeric(r["Number of Videos"]) ?? 0,
    });
  }

  return { rows, errors };
}
