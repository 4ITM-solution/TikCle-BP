/**
 * Kalodata (TikTok Shop SEA 분석 도구) 화면 텍스트 파서.
 *
 * 사용자가 Kalodata 브랜드 페이지(예: SKIN1004 Thailand)를 통째 복사한 텍스트를 받아
 * Brand KPI + Products + Creators 섹션을 추출. v1은 영상/라이브 미포함.
 *
 * 섹션 헤더:
 *   - "Core Metrics" — Brand 단위
 *   - "Creator(N items)" — 크리에이터 표
 *   - "Product(N items)" — 제품 표 (Revenue Source(Content) 다음)
 *   - "Video & Ad(N items)" — v2
 *   - "Live(N items)" — v2
 *
 * 표 한 row가 여러 줄로 나뉘는 구조라 줄 단위 state machine으로 파싱.
 */

/** "$1.10m" / "$36.81k" / "64.26k" / "2k" / "$17.18" → 절대값 (USD or 개수) */
function parseMagnitude(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^\$?\s*([\d,]+\.?\d*)\s*([kmKM])?\s*$/);
  if (!m) return null;
  const num = parseFloat(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const suffix = m[2]?.toLowerCase();
  if (suffix === "k") return num * 1_000;
  if (suffix === "m") return num * 1_000_000;
  return num;
}

/** "$17.18" → 17.18 */
function parsePrice(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "11/23/2024" → "2024-11-23" */
function parseUsDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

export type KalodataBrandKpi = {
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null;
  revenue_usd: number | null;
  self_operated_revenue_usd: number | null;
  affiliate_revenue_usd: number | null;
  shopping_mall_revenue_usd: number | null;
  item_sold: number | null;
  avg_unit_price: number | null;
  active_affiliates: number | null;
  new_videos_by_affiliate: number | null;
};

export type KalodataProductRow = {
  rank: number;
  name: string;
  publish_date: string | null;
  revenue_usd: number | null;
  item_sold: number | null;
  avg_unit_price: number | null;
};

export type KalodataCreatorRow = {
  rank: number;
  handle: string; // "@mommynannnn"
  display_name: string | null;
  account_type: "affiliate" | "seller_operated" | "other";
  revenue_usd: number | null;
  product_count: number | null;
  live_count: number | null;
  video_count: number | null;
};

export type KalodataParsed = {
  brand_kpi: KalodataBrandKpi;
  products: KalodataProductRow[];
  creators: KalodataCreatorRow[];
  errors: string[];
};

/**
 * Kalodata 화면 텍스트를 통째 받아 섹션별로 추출.
 */
export function parseKalodata(raw: string): KalodataParsed {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trim())
    .filter(Boolean);
  const errors: string[] = [];

  // 1) Brand KPI — Core Metrics 섹션 또는 상단 "Revenue $1.10m" 등 라벨-값 쌍
  const brand_kpi: KalodataBrandKpi = {
    period_start: null as string | null,
    period_end: null as string | null,
    revenue_usd: null as number | null,
    self_operated_revenue_usd: null as number | null,
    affiliate_revenue_usd: null as number | null,
    shopping_mall_revenue_usd: null as number | null,
    item_sold: null as number | null,
    avg_unit_price: null as number | null,
    active_affiliates: null as number | null,
    new_videos_by_affiliate: null as number | null,
  };

  // 기간: "Last 30 Days (04/19 ~ 05/18)" 또는 "MM/DD/YYYY" 두 개 인접
  const periodMatch = raw.match(/\((\d{2}\/\d{2})\s*~\s*(\d{2}\/\d{2})\)/);
  if (periodMatch) {
    const yearGuess = new Date().getFullYear();
    const [ms, ds] = periodMatch[1]!.split("/");
    const [me, de] = periodMatch[2]!.split("/");
    brand_kpi.period_start = `${yearGuess}-${ms}-${ds}`;
    brand_kpi.period_end = `${yearGuess}-${me}-${de}`;
  }

  // Brand KPI는 라벨 라인 다음 줄에 값. 라벨 매핑.
  const kpiLabelMap: Record<string, keyof KalodataBrandKpi> = {
    Revenue: "revenue_usd",
    "Self-Operated Account Revenue": "self_operated_revenue_usd",
    "Affiliate Revenue": "affiliate_revenue_usd",
    "Shopping Mall Revenue": "shopping_mall_revenue_usd",
    "Item Sold": "item_sold",
    "Avg. Unit Price": "avg_unit_price",
    "Active Affiliates": "active_affiliates",
    "New Videos By Affiliate": "new_videos_by_affiliate",
  };
  for (let i = 0; i < lines.length; i += 1) {
    const label = lines[i]!;
    const key = kpiLabelMap[label];
    if (!key || brand_kpi[key] != null) continue;
    // 다음 줄이 값이어야 — 단, 같은 라벨이 다른 섹션(예: Creator 표 헤더 Revenue)에 또 나옴.
    // KPI 값은 $XX.XXk/m 또는 숫자k/m 형태로 한 줄에 있어야.
    const valLine = lines[i + 1];
    if (!valLine) continue;
    const num =
      key === "avg_unit_price" ? parsePrice(valLine) : parseMagnitude(valLine);
    if (num != null) (brand_kpi as Record<string, unknown>)[key] = num;
  }

  // 2) Section 추출 — "(N items)" 헤더로 섹션 시작 위치 찾기
  function findSectionStart(re: RegExp): number {
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i]!)) return i;
    }
    return -1;
  }

  const creatorStart = findSectionStart(/^Creator\(\d+\s*items?\)/);
  const productStart = findSectionStart(/^Product\(\d+\s*items?\)/);
  const videoStart = findSectionStart(/^Video\s*&\s*Ad\(\d+\s*items?\)/);

  // 3) Products 파싱 (Product 섹션 ~ Video & Ad 또는 끝까지)
  const products: KalodataProductRow[] = [];
  if (productStart >= 0) {
    const endIdx = videoStart > productStart ? videoStart : lines.length;
    const slice = lines.slice(productStart, endIdx);
    // 표 행 패턴: 번호("1"~"100"), 다음 줄(들)에 제품명, 마지막에 "MM/DD/YYYY\t$X.XXk\tX.XXk\t$X.XX" 또는 줄 단위.
    // 줄별 처리: 숫자만(번호) → 다음에 텍스트(이름) → publish_date → revenue → item_sold → avg_price
    let i = 0;
    while (i < slice.length) {
      const line = slice[i]!;
      if (/^\d{1,3}$/.test(line)) {
        const rank = parseInt(line, 10);
        // 이름 = 다음 줄 (한 줄 가정 — 멀티라인은 흔치 않음)
        const name = slice[i + 1] ?? "";
        // 다음 줄들에서 날짜·매출·판매·가격 추출
        // 패턴: "11/23/2024\t$44.86k\t3.14k\t$14.30" — 한 줄에 탭 구분
        const dataLine = slice[i + 2] ?? "";
        const cells = dataLine.split(/[\t\s]+/).filter(Boolean);
        // cells: ["11/23/2024", "$44.86k", "3.14k", "$14.30"]
        const dateCell = cells.find((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
        const moneyCells = cells.filter((c) => /^\$/.test(c));
        const numCells = cells.filter(
          (c) =>
            !/^\$/.test(c) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c) && /\d/.test(c),
        );
        if (rank >= 1 && rank <= 1000 && name && (dateCell || moneyCells.length)) {
          products.push({
            rank,
            name,
            publish_date: parseUsDate(dateCell),
            revenue_usd: parseMagnitude(moneyCells[0]),
            item_sold: parseMagnitude(numCells[0]),
            avg_unit_price: parsePrice(moneyCells[1]),
          });
          i += 3;
          continue;
        }
      }
      i += 1;
    }
  }

  // 4) Creators 파싱 (Creator 섹션 ~ Product 섹션까지)
  const creators: KalodataCreatorRow[] = [];
  if (creatorStart >= 0) {
    const endIdx = productStart > creatorStart ? productStart : lines.length;
    const slice = lines.slice(creatorStart, endIdx);
    // 행 패턴:
    //   "1"
    //   "@handle"
    //   "display_name" (옵션, 한국어/태국어 가능)
    //   "Affiliate" 또는 "Seller operated"
    //   "$XX.XXk\tN\tN\tN" (revenue \t product \t live \t video)
    let i = 0;
    while (i < slice.length) {
      const line = slice[i]!;
      if (/^\d{1,3}$/.test(line)) {
        const rank = parseInt(line, 10);
        // 다음: @handle
        const handle = slice[i + 1] ?? "";
        if (!handle.startsWith("@")) {
          i += 1;
          continue;
        }
        // 그 다음 줄들 중 account type 라인 찾기 (Affiliate / Seller operated / Self-operated)
        let typeIdx = -1;
        for (let j = i + 2; j < Math.min(i + 6, slice.length); j += 1) {
          const v = slice[j]!;
          if (/^(Affiliate|Seller operated|Self-operated|Self-Operated)$/i.test(v)) {
            typeIdx = j;
            break;
          }
        }
        if (typeIdx < 0) {
          i += 1;
          continue;
        }
        const display_name =
          typeIdx > i + 2 ? slice.slice(i + 2, typeIdx).join(" ") : null;
        const typeRaw = slice[typeIdx]!.toLowerCase();
        const account_type: KalodataCreatorRow["account_type"] =
          typeRaw.startsWith("affiliate")
            ? "affiliate"
            : typeRaw.includes("seller") || typeRaw.includes("self")
              ? "seller_operated"
              : "other";
        // 데이터 라인: "$XX.XXk\tN\tN\tN"
        const dataLine = slice[typeIdx + 1] ?? "";
        const cells = dataLine.split(/[\t\s]+/).filter(Boolean);
        const revenue_usd = parseMagnitude(cells[0]);
        const product_count = cells[1] ? parseMagnitude(cells[1]) : null;
        const live_count = cells[2] ? parseMagnitude(cells[2]) : null;
        const video_count = cells[3] ? parseMagnitude(cells[3]) : null;
        if (rank >= 1 && rank <= 5000 && revenue_usd != null) {
          creators.push({
            rank,
            handle,
            display_name,
            account_type,
            revenue_usd,
            product_count: product_count != null ? Math.round(product_count) : null,
            live_count: live_count != null ? Math.round(live_count) : null,
            video_count: video_count != null ? Math.round(video_count) : null,
          });
          i = typeIdx + 2;
          continue;
        }
      }
      i += 1;
    }
  }

  if (products.length === 0 && creators.length === 0) {
    errors.push(
      "Products·Creators 섹션 둘 다 0개. Kalodata 화면 텍스트 형식이 맞는지 확인",
    );
  }

  return { brand_kpi, products, creators, errors };
}
