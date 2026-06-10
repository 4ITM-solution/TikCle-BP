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
  // "By Content" 매출 분해 (브랜드 페이지) — Live/Video/Product Card 정확 매출.
  live_revenue_usd: number | null;
  video_revenue_usd: number | null;
  product_card_revenue_usd: number | null;
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

export type KalodataVideoRow = {
  rank: number;
  caption: string;
  duration_s: number | null;
  revenue_usd: number | null;
  views: number | null;
  item_sold: number | null;
  publish_date: string | null;
};

export type KalodataLiveRow = {
  rank: number;
  title: string;
  start_at: string | null; // "MM/DD HH:MM" 그대로 (연도 정보 없음)
  end_at: string | null;
  duration_s: number | null;
  revenue_usd: number | null;
  product_count: number | null;
  views: number | null;
  item_sold: number | null;
};

export type KalodataParsed = {
  brand_kpi: KalodataBrandKpi;
  products: KalodataProductRow[];
  creators: KalodataCreatorRow[];
  videos: KalodataVideoRow[];
  lives: KalodataLiveRow[];
  errors: string[];
};

/** "Duration: 61h 43m 6s" / "14h 4m 25s" / "1h 29m 14s" / "29m 30s" → 초 */
function parseLiveDurationSeconds(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/^Duration:\s*/i, "").trim();
  const m = cleaned.match(
    /^(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?$/,
  );
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const mn = m[2] ? parseInt(m[2], 10) : 0;
  const sc = m[3] ? parseInt(m[3], 10) : 0;
  return h * 3600 + mn * 60 + sc;
}

/**
 * Kalodata Creator xlsx export (LIST_CREATOR 시트, 25개 컬럼).
 * 화면 텍스트 스크랩의 KalodataCreatorRow보다 훨씬 풍부 — Live/Video GMV 분리,
 * 컨택(Email/IG/FB...), Views, debut, KalodataUrl 등.
 */
export type KalodataCreatorXlsxRow = {
  handle: string;
  nickname: string | null;
  followers: number | null;
  revenue_usd: number | null;
  item_sold: number | null;
  avg_unit_price: number | null;
  engagement_rate: number | null;
  new_followers: number | null;
  product_count: number | null;
  live_num: number | null;
  live_gmv_usd: number | null;
  video_num: number | null;
  video_gmv_usd: number | null;
  views: number | null;
  debut_date: string | null;
  kalodata_url: string | null;
  tiktok_url: string | null;
  contacts: {
    email: string | null;
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
    twitter: string | null;
    whatsapp: string | null;
    line: string | null;
  };
  date_range: string | null;
};

export type KalodataCreatorXlsxParsed = {
  rows: KalodataCreatorXlsxRow[];
  meta: {
    shop: string | null;
    export_time: string | null;
    sort_by: string | null;
    account_type_filter: string | null;
    period_start: string | null;
    period_end: string | null;
  };
  errors: string[];
};

function s(v: unknown): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  return str.length > 0 && str !== "NaN" ? str : null;
}
function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

/**
 * Kalodata Video xlsx export (LIST_VIDEO 시트, 17개 컬럼).
 * 영상별 매출 + 광고 데이터 + TikTokUrl(→ contents 적재용) + 영상-제품 매핑.
 */
export type KalodataVideoXlsxRow = {
  video_url: string; // TikTokUrl → contents.url 직접 사용
  description: string;
  duration_s: number | null;
  creator_handle: string | null;
  publish_date: string | null; // "YYYY-MM-DD" (YYYY/MM/DD HH:mm:ss → 변환)
  revenue_usd: number | null;
  item_sold: number | null;
  product_title: string | null;
  product_category: string | null;
  views: number | null;
  gpm_usd: number | null; // GMV per Mille (1000 views당 매출)
  ad_cpa_usd: number | null;
  ad_view_ratio: number | null; // 0~1
  ad_spend_usd: number | null;
  ad_roas: number | null;
  kalodata_url: string | null;
  date_range: string | null;
};

export type KalodataVideoXlsxParsed = {
  rows: KalodataVideoXlsxRow[];
  meta: {
    shop: string | null;
    export_time: string | null;
    sort_by: string | null;
    period_start: string | null;
    period_end: string | null;
  };
  errors: string[];
};

function pct(v: unknown): number | null {
  if (v == null || v === "") return null;
  const str = String(v).trim().replace("%", "");
  const num = parseFloat(str);
  if (!Number.isFinite(num)) return null;
  return num > 1 ? num / 100 : num; // "63.03" → 0.6303
}

function isoDate(v: unknown): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  // "2025/10/01 20:29:32" / "2025-10-01" 등
  const m = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

function durationFromStr(v: unknown): number | null {
  if (v == null) return null;
  const str = String(v).trim();
  // "1m 20s" / "41s" / "6s"
  const m = str.match(/^(?:(\d+)m\s*)?(\d+)s$/);
  if (!m) return null;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  const secs = parseInt(m[2]!, 10);
  return mins * 60 + secs;
}

export function parseKalodataVideoXlsx(input: {
  list: Record<string, unknown>[];
  intro: Record<string, unknown>[];
}): KalodataVideoXlsxParsed {
  const errors: string[] = [];
  const rows: KalodataVideoXlsxRow[] = [];

  for (const r of input.list ?? []) {
    const url = s(r["TikTokUrl"]);
    if (!url) continue;
    rows.push({
      video_url: url,
      description: s(r["Video Description"]) ?? "",
      duration_s: durationFromStr(r["Duration"]),
      creator_handle: (s(r["Creator Handle"]) ?? "").replace(/^@/, "") || null,
      publish_date: isoDate(r["Publish Date"]),
      revenue_usd: n(r["Revenue($)"]),
      item_sold: n(r["Item Sold"]),
      // 컬럼명에 typo 가능 — "Product Tittle" 또는 "Product Title" 둘 다 시도
      product_title: s(r["Product Tittle"]) ?? s(r["Product Title"]),
      product_category: s(r["Product Category"]),
      views: n(r["Views"]),
      gpm_usd: n(r["GPM($)"]),
      ad_cpa_usd: n(r["Ad CPA($)"]),
      ad_view_ratio: pct(r["Ad View Ratio"]),
      ad_spend_usd: n(r["Ad Spend($)"]),
      ad_roas: n(r["Ad ROAS"]),
      kalodata_url: s(r["KalodataUrl"]),
      date_range: s(r["Date Range"]),
    });
  }

  const introRow = input.intro?.[0] ?? {};
  const exportFilter = s(introRow["Export Filter"]) ?? "";
  const timeMatch = exportFilter.match(
    /Time\s*:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,
  );
  const meta = {
    shop: s(introRow["Shop"]),
    export_time: s(introRow["Export Time"]),
    sort_by: s(introRow["Sort By"]),
    period_start: timeMatch?.[1] ?? null,
    period_end: timeMatch?.[2] ?? null,
  };

  if (rows.length === 0) {
    errors.push("Video xlsx에서 유효한 row 0개 (TikTokUrl 컬럼 확인)");
  }
  return { rows, meta, errors };
}

/**
 * LIST_CREATOR 시트의 row[]와 Intro 시트의 메타를 합쳐 표준화.
 * SheetJS에서 sheet_to_json한 결과를 입력으로 받음.
 */
export function parseKalodataCreatorXlsx(input: {
  list: Record<string, unknown>[];
  intro: Record<string, unknown>[];
}): KalodataCreatorXlsxParsed {
  const errors: string[] = [];
  const rows: KalodataCreatorXlsxRow[] = [];

  for (const r of input.list ?? []) {
    const handle = s(r["Handle"]);
    if (!handle) continue;
    rows.push({
      handle: handle.replace(/^@/, ""),
      nickname: s(r["Nickname"]),
      followers: n(r["Followers"]),
      revenue_usd: n(r["Revenue($)"]),
      item_sold: n(r["Item Sold"]),
      avg_unit_price: n(r["Avg. Unit Price"]),
      engagement_rate: n(r["Engagement Rate"]),
      new_followers: n(r["New Followers"]),
      product_count: n(r["ProductCount"]),
      live_num: n(r["LiveNum"]),
      live_gmv_usd: n(r["LiveGmv($)"]),
      video_num: n(r["VideoNum"]),
      video_gmv_usd: n(r["VideoGmv($)"]),
      views: n(r["Views"]),
      debut_date: s(r["CreatorDebutTime"]),
      kalodata_url: s(r["KalodataUrl"]),
      tiktok_url: s(r["TikTokUrl"]),
      contacts: {
        email: s(r["Email"]),
        facebook: s(r["Facebook"]),
        instagram: s(r["Instagram"]),
        youtube: s(r["YouTube"]),
        twitter: s(r["X(Twitter)"]),
        whatsapp: s(r["whatsapp"]),
        line: s(r["Line"]),
      },
      date_range: s(r["Date Range"]),
    });
  }

  // Intro 시트에서 메타 추출
  const introRow = input.intro?.[0] ?? {};
  const exportFilter = s(introRow["Export Filter"]) ?? "";
  // "1. Time : 2025-11-20 - 2026-05-18\n2. Account Type : Affiliate" 파싱
  const timeMatch = exportFilter.match(
    /Time\s*:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,
  );
  const accountMatch = exportFilter.match(/Account Type\s*:\s*([^\n]+)/);
  const meta = {
    shop: s(introRow["Shop"]),
    export_time: s(introRow["Export Time"]),
    sort_by: s(introRow["Sort By"]),
    account_type_filter: accountMatch ? accountMatch[1]!.trim() : null,
    period_start: timeMatch?.[1] ?? null,
    period_end: timeMatch?.[2] ?? null,
  };

  if (rows.length === 0) {
    errors.push("Creator xlsx에서 유효한 row 0개");
  }
  return { rows, meta, errors };
}

/** "41s" / "1m 20s" / "1m 8s" → 초 */
function parseDurationSeconds(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(?:(\d+)m\s*)?(\d+)s$/);
  if (!m) return null;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  const secs = parseInt(m[2]!, 10);
  return mins * 60 + secs;
}

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
    live_revenue_usd: null as number | null,
    video_revenue_usd: null as number | null,
    product_card_revenue_usd: null as number | null,
  };

  // "By Content" 매출 분해: "Live $11.91k (3.35%) + Video $325.68k (91.51%) + Product Card $18.30k (5.14%)"
  //   (%) 가 붙은 형태라 다른 "Live/Video" 텍스트와 구분됨. parseMagnitude 로 $값 파싱.
  const byContent = (label: string): number | null => {
    const m = raw.match(
      new RegExp(`${label}\\s*\\$([\\d.,]+\\s*[kmKM]?)\\s*\\(\\d`, "i"),
    );
    return m ? parseMagnitude(m[1]!) : null;
  };
  brand_kpi.live_revenue_usd = byContent("Live");
  brand_kpi.video_revenue_usd = byContent("Video");
  brand_kpi.product_card_revenue_usd = byContent("Product\\s*Card");

  // 기간: 데이터에서 직접 파싱. 두 형식 모두 지원:
  //   "Last 365 Days (06/10/2025 ~ 06/10/2026)"  ← 연도 있음(365일은 해 걸침)
  //   "Last 30 Days (04/19 ~ 05/18)"             ← 연도 없음
  // "Last N Days (...)" 앵커로 Core Metrics 기간을 정확히 집음(다른 날짜 오매칭 방지).
  // 형식이 다양함: US "06/10/2025 ~ 06/09/2026"(연도O, 괄호X) / SEA "(04/19 ~ 05/18)"(연도X, 괄호O).
  // 괄호 유무·연도 유무 모두 허용하고, 첫 "MM/DD[/YYYY] ~ MM/DD[/YYYY]" 쌍(=Core Metrics 기간)을 집음.
  const periodMatch = raw.match(
    /(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\s*~\s*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/,
  );
  if (periodMatch) {
    const thisYear = new Date().getFullYear();
    const parts = (s: string) => {
      const p = s.split("/").map((x) => parseInt(x, 10));
      return { m: p[0]!, d: p[1]!, y: p[2] as number | undefined };
    };
    const a = parts(periodMatch[1]!);
    const b = parts(periodMatch[2]!);
    const endY = b.y ?? thisYear;
    // 연도 없는데 start 월/일이 end보다 크면 연말→연초 걸침 → start는 한 해 전.
    const startY =
      a.y ?? (a.m > b.m || (a.m === b.m && a.d > b.d) ? endY - 1 : endY);
    const iso = (m: number, d: number, y: number) =>
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    brand_kpi.period_start = iso(a.m, a.d, startY);
    brand_kpi.period_end = iso(b.m, b.d, endY);
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
  const liveStart = findSectionStart(/^Live\(\d+\s*items?\)/);

  // 3) Products 파싱 (Product 섹션 ~ 다음 섹션 또는 끝까지)
  const products: KalodataProductRow[] = [];
  if (productStart >= 0) {
    // ★ "Product(13 items)" 선언 개수만큼만 파싱 — 경계(Video & Ad 헤더)를 못 찾으면
    //   뒤 섹션(크리에이터가 판 타브랜드 제품 등)까지 긁어 cross-brand 혼입하던 버그 방지.
    const declaredCount =
      parseInt(lines[productStart]!.match(/\((\d+)\s*items?\)/)?.[1] ?? "0", 10) || Infinity;
    // 경계: productStart 뒤 섹션 헤더(Video/Live/Creator) 중 가장 빠른 것, 없으면 끝.
    const nextStarts = [videoStart, liveStart, creatorStart].filter((s) => s > productStart);
    const endIdx = nextStarts.length > 0 ? Math.min(...nextStarts) : lines.length;
    const slice = lines.slice(productStart, endIdx);
    // 표 행 패턴: 번호("1"~"100"), 다음 줄(들)에 제품명, 마지막에 "MM/DD/YYYY\t$X.XXk\tX.XXk\t$X.XX" 또는 줄 단위.
    // 줄별 처리: 숫자만(번호) → 다음에 텍스트(이름) → publish_date → revenue → item_sold → avg_price
    let i = 0;
    while (i < slice.length) {
      if (products.length >= declaredCount) break; // 선언 개수 도달 → 뒤 섹션 침범 방지
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

  // 5) Videos 파싱 (Video & Ad 섹션 ~ Live 또는 끝)
  const videos: KalodataVideoRow[] = [];
  if (videoStart >= 0) {
    const endIdx = liveStart > videoStart ? liveStart : lines.length;
    const slice = lines.slice(videoStart, endIdx);
    // 행 패턴:
    //   "1"
    //   <캡션 1줄 — #해시태그 + 텍스트>
    //   "41s" (duration)
    //   "$15.02k\t304.1k\t987\t04/21/2026" (revenue \t views \t item_sold \t publish_date)
    let i = 0;
    while (i < slice.length) {
      const line = slice[i]!;
      if (/^\d{1,3}$/.test(line)) {
        const rank = parseInt(line, 10);
        const caption = slice[i + 1] ?? "";
        const durLine = slice[i + 2] ?? "";
        const dataLine = slice[i + 3] ?? "";
        const dur = parseDurationSeconds(durLine);
        // dataLine: 4개 cell — $rev \t views \t item_sold \t MM/DD/YYYY
        const cells = dataLine.split(/[\t\s]+/).filter(Boolean);
        const dateCell = cells.find((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
        const moneyCell = cells.find((c) => /^\$/.test(c));
        const numCells = cells.filter(
          (c) =>
            !/^\$/.test(c) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c) && /\d/.test(c),
        );
        if (
          rank >= 1 &&
          rank <= 5000 &&
          caption &&
          (moneyCell || dateCell) &&
          dur != null
        ) {
          videos.push({
            rank,
            caption,
            duration_s: dur,
            revenue_usd: parseMagnitude(moneyCell),
            views: parseMagnitude(numCells[0]),
            item_sold: parseMagnitude(numCells[1]),
            publish_date: parseUsDate(dateCell),
          });
          i += 4;
          continue;
        }
      }
      i += 1;
    }
  }

  // 6) Lives 파싱 (Live 섹션 ~ 끝)
  const lives: KalodataLiveRow[] = [];
  if (liveStart >= 0) {
    const slice = lines.slice(liveStart);
    // 행 패턴:
    //   "1"
    //   <Livestream 제목 1줄>
    //   "05/03 17:00 ~ 05/06 06:43" (Live Time)
    //   "Duration: 61h 43m 6s"
    //   "$31.35k" (Revenue)
    //   "101" (Product Number)
    //   "72.56k\t2026" (Views \t Item Sold)
    let i = 0;
    while (i < slice.length) {
      const line = slice[i]!;
      if (/^\d{1,3}$/.test(line)) {
        const rank = parseInt(line, 10);
        const title = slice[i + 1] ?? "";
        const timeLine = slice[i + 2] ?? "";
        const durLine = slice[i + 3] ?? "";
        const tm = timeLine.match(
          /^(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})\s*~\s*(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2})$/,
        );
        const dur = parseLiveDurationSeconds(durLine);
        if (!tm || dur == null) {
          i += 1;
          continue;
        }
        const revCell = slice[i + 4] ?? "";
        const productCell = slice[i + 5] ?? "";
        const lastDataLine = slice[i + 6] ?? "";
        const lastCells = lastDataLine.split(/[\t\s]+/).filter(Boolean);
        const revenue_usd = parseMagnitude(revCell);
        const product_count = parseMagnitude(productCell);
        const views = parseMagnitude(lastCells[0]);
        const item_sold = parseMagnitude(lastCells[1]);
        if (rank >= 1 && rank <= 5000 && title && revenue_usd != null) {
          lives.push({
            rank,
            title,
            start_at: tm[1] ?? null,
            end_at: tm[2] ?? null,
            duration_s: dur,
            revenue_usd,
            product_count:
              product_count != null ? Math.round(product_count) : null,
            views,
            item_sold: item_sold != null ? Math.round(item_sold) : null,
          });
          i += 7;
          continue;
        }
      }
      i += 1;
    }
  }

  if (
    products.length === 0 &&
    creators.length === 0 &&
    videos.length === 0 &&
    lives.length === 0
  ) {
    errors.push(
      "Products·Creators·Videos·Lives 섹션 모두 0개. Kalodata 화면 텍스트 형식이 맞는지 확인",
    );
  }

  return { brand_kpi, products, creators, videos, lives, errors };
}
