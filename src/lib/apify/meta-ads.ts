/**
 * Apify curious_coder/facebook-ads-library-scraper 호출 래퍼.
 * 단가: $0.00075/ad · 1,000 cap → 케이스당 $0.75
 *
 * 우선순위: brand_meta_pages > brand_keyword
 * - brand_meta_pages 있으면 페이지명 검색 URL 생성 (정확한 본사 페이지 광고)
 * - 부족하면 brand_keyword로 보충
 */

const ACTOR_ID = "curious_coder~facebook-ads-library-scraper";
const SYNC_TIMEOUT_SEC = 300; // 5분 cap

export type MetaAdRaw = {
  ad_archive_id: string | null;
  collation_id: string | null; // ★ FB의 자체 광고 그룹핑 키 (dedup 핵심)
  page_name: string | null;
  page_id: string | null;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  body_text: string | null;
  title: string | null;
  cta_type: string | null;
  cta_text: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  snapshot: unknown;
};

export type MetaAdsResult = {
  ads: MetaAdRaw[];
  source_urls: string[];
  total_fetched: number;
  cost_estimate_usd: number;
  skipped_reason?: string;
};

const COST_PER_AD = 0.00075;

/**
 * 페이지명/키워드 → FB Ads Library 검색 URL 생성.
 */
function buildLibraryUrl(query: string, country: string): string {
  const params = new URLSearchParams({
    q: query,
    country,
    active_status: "all",
    ad_type: "all",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/**
 * Apify run-sync-get-dataset-items 호출.
 * 결과 1000개 cap 안에서 ads 반환.
 */
export async function fetchMetaAds(opts: {
  brand_meta_pages: string[];
  brand_keyword: string | null;
  country: string;
  cap?: number;
}): Promise<MetaAdsResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }

  const cap = opts.cap ?? 1000;

  // URL 생성 — brand_meta_pages 우선, 부족하면 keyword
  const urls: string[] = [];
  for (const page of opts.brand_meta_pages ?? []) {
    if (!page.trim()) continue;
    urls.push(buildLibraryUrl(page.trim(), opts.country));
  }
  if (opts.brand_keyword) {
    for (const kw of opts.brand_keyword.split(",").map((s) => s.trim()).filter(Boolean)) {
      urls.push(buildLibraryUrl(kw, opts.country));
    }
  }

  if (urls.length === 0) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason: "brand_meta_pages / brand_keyword 비어있음",
    };
  }

  // Apify 호출
  const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  const body = {
    urls: urls.map((u) => ({ url: u })),
    count: cap,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Apify Meta ads ${response.status}: ${text.slice(0, 300)}`);
  }

  const items = (await response.json()) as unknown[];
  const ads = items.map(mapAdItem).filter((a): a is MetaAdRaw => a !== null);

  return {
    ads,
    source_urls: urls,
    total_fetched: ads.length,
    cost_estimate_usd: ads.length * COST_PER_AD,
  };
}

/**
 * Unix timestamp (초/밀리초) 또는 ISO 문자열을 YYYY-MM-DD로 정규화.
 */
function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    // 이미 ISO string이면 슬라이스만
    const s = v.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // 숫자만 들어있는 string도 처리
    const n = Number(s);
    if (Number.isFinite(n)) return toDateStr(n);
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // 초 vs 밀리초 자동 감지 (10자리 = 초, 13자리 = ms)
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Apify actor 응답 한 행을 meta_ads schema에 맞게 매핑.
 *
 * snapshot 구조가 actor 버전 / 광고 종류에 따라 다양함. 우선순위:
 *   1) snapshot.videos[0] / images[0]  — 단일 비디오/이미지 광고
 *   2) snapshot.cards[0]                — CAROUSEL, DCO (다이나믹) 광고
 *   3) snapshot.root_reshared_post      — 재공유된 포스트 광고
 *
 * cards에는 video_preview_image_url, video_hd_url, original_image_url,
 * resized_image_url, link_url, cta_type, cta_text 등이 들어있음.
 */
function mapAdItem(raw: unknown): MetaAdRaw | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const snap =
    (r.snapshot as Record<string, unknown> | undefined) ??
    (r.ad_snapshot as Record<string, unknown> | undefined) ??
    {};

  const videos = snap.videos as Array<Record<string, unknown>> | undefined;
  const images = snap.images as Array<Record<string, unknown>> | undefined;
  const cards = snap.cards as Array<Record<string, unknown>> | undefined;
  const reshared = snap.root_reshared_post as
    | Record<string, unknown>
    | undefined;
  const rSnap = reshared?.snapshot as Record<string, unknown> | undefined;

  // ── body ──
  let body_text: string | null = null;
  if (typeof snap.body === "string") body_text = snap.body;
  else if (
    snap.body &&
    typeof snap.body === "object" &&
    "text" in snap.body &&
    typeof (snap.body as { text?: unknown }).text === "string"
  ) {
    body_text = (snap.body as { text: string }).text;
  }
  // body 비어있으면 cards[0].body 폴백
  if (!body_text && cards?.[0]) {
    const cb = cards[0].body;
    if (typeof cb === "string") body_text = cb;
  }

  // ── 썸네일 / 영상 URL — videos → images → cards → reshared 순 ──
  let thumbnail_url: string | null = null;
  let video_url: string | null = null;

  if (videos && videos.length > 0 && videos[0]) {
    const v = videos[0];
    thumbnail_url =
      (v.video_preview_image_url as string | undefined) ??
      (v.thumbnail_url as string | undefined) ??
      null;
    video_url =
      (v.video_hd_url as string | undefined) ??
      (v.video_sd_url as string | undefined) ??
      null;
  }
  if (!thumbnail_url && images && images.length > 0 && images[0]) {
    thumbnail_url =
      (images[0].original_image_url as string | undefined) ??
      (images[0].resized_image_url as string | undefined) ??
      null;
  }
  // CAROUSEL / DCO — cards[0]에서 추출
  if (!thumbnail_url && cards && cards.length > 0 && cards[0]) {
    const c0 = cards[0];
    thumbnail_url =
      (c0.video_preview_image_url as string | undefined) ??
      (c0.original_image_url as string | undefined) ??
      (c0.resized_image_url as string | undefined) ??
      null;
    if (!video_url) {
      video_url =
        (c0.video_hd_url as string | undefined) ??
        (c0.video_sd_url as string | undefined) ??
        null;
    }
  }
  // 재공유 광고
  if (!thumbnail_url && rSnap) {
    const rv = rSnap.videos as Array<Record<string, unknown>> | undefined;
    const ri = rSnap.images as Array<Record<string, unknown>> | undefined;
    if (rv?.[0]?.video_preview_image_url) {
      thumbnail_url = rv[0].video_preview_image_url as string;
    } else if (ri?.[0]?.original_image_url) {
      thumbnail_url = ri[0].original_image_url as string;
    }
  }

  // ── format ── display_format 우선, 없으면 추정
  let format: string | null = null;
  const displayFormat = snap.display_format as string | undefined;
  if (typeof displayFormat === "string" && displayFormat) {
    format = displayFormat.toLowerCase(); // VIDEO/IMAGE/CAROUSEL/DCO/...
  } else if (videos && videos.length > 0) format = "video";
  else if (images && images.length > 0) format = "image";
  else if (cards && cards.length > 0) format = "carousel";

  // ── link_url, title, cta — top-level 우선, 없으면 cards[0] ──
  const link_url =
    (snap.link_url as string | undefined) ??
    (cards?.[0]?.link_url as string | undefined) ??
    null;
  const title =
    (snap.title as string | undefined) ??
    (cards?.[0]?.title as string | undefined) ??
    null;
  const cta_type =
    (snap.cta_type as string | undefined) ??
    (cards?.[0]?.cta_type as string | undefined) ??
    null;
  const cta_text =
    (snap.cta_text as string | undefined) ??
    (cards?.[0]?.cta_text as string | undefined) ??
    null;

  return {
    ad_archive_id:
      (r.ad_archive_id as string | undefined) ??
      (r.ad_archive_id_str as string | undefined) ??
      (r.archive_id as string | undefined) ??
      (typeof r.id === "string" ? r.id : undefined) ??
      (typeof r.id === "number" ? String(r.id) : undefined) ??
      null,
    collation_id:
      typeof r.collation_id === "string"
        ? r.collation_id
        : typeof r.collation_id === "number"
          ? String(r.collation_id)
          : null,
    page_name: (r.page_name as string | undefined) ?? null,
    page_id: (r.page_id as string | undefined) ?? null,
    format,
    start_date:
      toDateStr(r.start_date_string) ?? toDateStr(r.start_date) ?? null,
    end_date: toDateStr(r.end_date_string) ?? toDateStr(r.end_date) ?? null,
    is_active:
      typeof r.is_active === "boolean" ? (r.is_active as boolean) : null,
    body_text,
    title,
    cta_type,
    cta_text,
    link_url,
    thumbnail_url,
    video_url,
    snapshot: r,
  };
}
