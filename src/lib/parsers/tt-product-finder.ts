/**
 * Helium10 TikTok Product Finder → Product Details 페이지 텍스트 paste 파서.
 *
 * 사용자가 페이지 전체 텍스트 선택(Cmd+A) → 복사 → 슬롯에 붙여넣기. 매출/메타
 * 추출 후 DB에 박음. Apify scraper보다 정확 (특히 GMV — Apify는 변형 옵션 단일
 * 가격 가정으로 28배 과대평가, Helium10은 실제 평균가 기반).
 *
 * 입력 텍스트 구조 (개행 분리):
 *   TikTok Product Finder
 *   /
 *   Product Details
 *   {Product Name 한 줄}
 *   United States
 *   ·
 *   {Category > Subcategory}
 *   ·
 *   Rating
 *   {4.3}
 *   Price
 *   ${1.00}
 *   Listed Date
 *   {2025-10-18}
 *   Total Items Sold
 *   {248,896}
 *   Total GMV
 *   {$124.4K}
 *   Total Relevant Influencers
 *   {3,116}
 *   Total Relevant Videos
 *   {6,960}
 *   Shop
 *   {Brand}
 *   Overview
 *   {Items Sold (period)}
 *   {GMV (period)}
 *   {New Videos (period)}
 *   {New Influencers (period)}
 *
 * 사용자가 "Last 7/14/30 days" 토글 중 선택 — 텍스트엔 안 박혀 있어 UI에서
 * 별도 파라미터로 받음.
 */

export type TikTokProductFinderParsed = {
  product_name: string | null;
  country: string | null; // "United States"
  category_path: string | null; // "Beauty & Personal Care > Makeup > Lipstick & Lip Gloss"
  subcategory: string | null; // 마지막 노드만 (예: "Lipstick & Lip Gloss")
  rating: number | null;
  price_usd: number | null;
  listed_date: string | null; // YYYY-MM-DD
  // Lifetime
  lifetime_items_sold: number | null;
  lifetime_gmv_usd: number | null;
  lifetime_relevant_influencers: number | null;
  lifetime_relevant_videos: number | null;
  // Period (Last N days)
  period_items_sold: number | null;
  period_gmv_usd: number | null;
  period_new_videos: number | null;
  period_new_influencers: number | null;
  // Shop
  shop_name: string | null;
  errors: string[];
};

// "$124.4K" / "$1.2M" / "$109,573.89" → 숫자
function parseGmv(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const m = cleaned.match(/^([0-9.]+)([KMB]?)$/i);
  if (!m) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  const mult =
    m[2]?.toUpperCase() === "K"
      ? 1_000
      : m[2]?.toUpperCase() === "M"
        ? 1_000_000
        : m[2]?.toUpperCase() === "B"
          ? 1_000_000_000
          : 1;
  return v * mult;
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseUsd(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 한 토큰이 비어있지 않은 줄인지 (trim 후)
function isValueLine(s: string): boolean {
  return s.length > 0 && s !== "·" && s !== "/";
}

export function parseTiktokProductFinder(text: string): TikTokProductFinderParsed {
  const result: TikTokProductFinderParsed = {
    product_name: null,
    country: null,
    category_path: null,
    subcategory: null,
    rating: null,
    price_usd: null,
    listed_date: null,
    lifetime_items_sold: null,
    lifetime_gmv_usd: null,
    lifetime_relevant_influencers: null,
    lifetime_relevant_videos: null,
    period_items_sold: null,
    period_gmv_usd: null,
    period_new_videos: null,
    period_new_influencers: null,
    shop_name: null,
    errors: [],
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // label → 다음 value line 매핑
  const labelMap: Record<string, (v: string) => void> = {
    Rating: (v) => (result.rating = parseNum(v)),
    Price: (v) => (result.price_usd = parseUsd(v)),
    "Listed Date": (v) => {
      const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      result.listed_date = m?.[1] ?? null;
    },
    "Total Items Sold": (v) => (result.lifetime_items_sold = parseNum(v)),
    "Total GMV": (v) => (result.lifetime_gmv_usd = parseGmv(v)),
    "Total Relevant Influencers": (v) =>
      (result.lifetime_relevant_influencers = parseNum(v)),
    "Total Relevant Videos": (v) =>
      (result.lifetime_relevant_videos = parseNum(v)),
  };

  // 헤더 영역 추출 (Product Details 다음 줄이 product name, 그 다음 country, ·, category, ·)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Product Details") {
      // 다음 비-구분자 라인이 product name
      let j = i + 1;
      while (j < lines.length && !isValueLine(lines[j]!)) j++;
      if (j < lines.length) result.product_name = lines[j]!;
      // 그 다음 줄 = country
      j++;
      while (j < lines.length && !isValueLine(lines[j]!)) j++;
      if (j < lines.length && lines[j] !== "Rating")
        result.country = lines[j]!;
      // 그 다음 줄 = category path
      j++;
      while (j < lines.length && !isValueLine(lines[j]!)) j++;
      if (j < lines.length && lines[j] !== "Rating") {
        result.category_path = lines[j]!;
        const parts = lines[j]!.split(">").map((s) => s.trim());
        result.subcategory = parts[parts.length - 1] ?? null;
      }
      break;
    }
  }

  // label/value 시퀀셜 파싱
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i]!;
    const fn = labelMap[label];
    if (!fn) continue;
    // 다음 valid value line
    let j = i + 1;
    while (j < lines.length && !isValueLine(lines[j]!)) j++;
    if (j < lines.length) fn(lines[j]!);
  }

  // Shop 다음 비어있지 않은 라인 = shop name
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Shop") {
      let j = i + 1;
      while (j < lines.length && !isValueLine(lines[j]!)) j++;
      if (j < lines.length && lines[j] !== "Overview")
        result.shop_name = lines[j]!;
      break;
    }
  }

  // Overview 섹션 — 다음 4개 value 라인 = items sold / gmv / new videos / new influencers
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "Overview") {
      const values: string[] = [];
      let j = i + 1;
      while (j < lines.length && values.length < 4) {
        if (isValueLine(lines[j]!)) values.push(lines[j]!);
        j++;
      }
      if (values.length >= 4) {
        result.period_items_sold = parseNum(values[0]);
        result.period_gmv_usd = parseUsd(values[1]);
        result.period_new_videos = parseNum(values[2]);
        result.period_new_influencers = parseNum(values[3]);
      } else {
        result.errors.push(
          `Overview 섹션에 4개 값 필요 (받은 건 ${values.length}개)`,
        );
      }
      break;
    }
  }

  // 핵심 필드 누락 검증
  if (!result.product_name) {
    result.errors.push("product name 못 찾음 (Product Details 다음 줄)");
  }
  if (result.lifetime_gmv_usd == null && result.period_gmv_usd == null) {
    result.errors.push("Total GMV 또는 Overview GMV 못 찾음");
  }

  return result;
}
