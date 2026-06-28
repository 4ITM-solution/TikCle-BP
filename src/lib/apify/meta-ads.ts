/**
 * Apify curious_coder/facebook-ads-library-scraper 호출 래퍼.
 * 단가: $0.00075/ad · 1,000 cap → 케이스당 $0.75
 *
 * 우선순위: brand_meta_pages > brand_keyword
 * - brand_meta_pages 있으면 페이지명 검색 URL 생성 (정확한 본사 페이지 광고)
 * - 부족하면 brand_keyword로 보충
 */

const ACTOR_ID = "curious_coder~facebook-ads-library-scraper";
const OFFICIAL_ACTOR_ID = "apify~facebook-ads-scraper";
const SYNC_TIMEOUT_SEC = 300; // 5분 cap
const OFFICIAL_COST_PER_AD_GOLD = 0.0034; // GOLD tier 가격 (FREE $0.0058)

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
  // Partnership 정보 — apify 공식 액터(detail endpoint)만 채움. curious_coder는 null.
  // creator_page_name: 실제 콘텐츠 게시자 (인플 페이지). partner_*: partnership 대상 브랜드.
  creator_page_name?: string | null;
  partner_page_name?: string | null;
  partner_page_id?: string | null;
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
 *
 * countries 파라미터: 권역 case면 권역 안 단일 국가들 (e.g., MENA → ["AE","SA"]).
 * 단일 case면 한 국가 (e.g., ["US"]). Facebook Ads Library URL의 country
 * 파라미터에 ISO 2자 코드만 박혀야 actor가 정상 scrape.
 */
export async function fetchMetaAds(opts: {
  brand_meta_pages: string[];
  brand_keyword: string | null;
  countries: string[];
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

  if (!opts.countries || opts.countries.length === 0) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason: "countries 비어있음",
    };
  }

  // URL 생성 — countries × (brand_meta_pages 우선, 부족하면 keyword).
  // 권역 case면 같은 keyword/page를 권역 안 모든 마켓플레이스 country로 N번 검색.
  const urls: string[] = [];
  for (const country of opts.countries) {
    for (const page of opts.brand_meta_pages ?? []) {
      if (!page.trim()) continue;
      urls.push(buildLibraryUrl(page.trim(), country));
    }
    if (opts.brand_keyword) {
      for (const kw of opts.brand_keyword
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
        urls.push(buildLibraryUrl(kw, country));
      }
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
    creator_page_name: null,
    partner_page_name: null,
    partner_page_id: null,
    snapshot: r,
  };
}

// ============================================================================
//   apify/facebook-ads-scraper (공식 액터) — partnership 지원
// ============================================================================
//
// curious_coder가 list endpoint만 긁어서 partnership 정보(snapshot.pageName ↔
// brandedContent.pageName)를 손실하는 한계가 있어 detail endpoint까지 들어가는
// 공식 액터를 case.options.meta_ads_source='official' 또는 detail backfill 시
// 호출.
//
// Input schema (apify 공식):
//   - startUrls: [{url}] — page URL 또는 Ad Library 검색 URL
//   - resultsLimit: number
//   - isDetailsPerAd: bool (true면 partnership/audience detail 노출)
//
// Output schema (camelCase, curious_coder와 다름):
//   - top-level: pageName (광고 run 주체)
//   - snapshot.pageName (실제 게시자 — partnership에서 인플)
//   - snapshot.brandedContent: {pageName, pageId, pageProfileUri} (partnership 대상)
//
// 가격 (GOLD tier): $0.0034/ad → 1000 cap = $3.4 (curious_coder $0.75의 4.5배)

/**
 * 공식 액터로 page URL 검색 + partnership detail까지 fetch.
 *
 * countries × (pages + keyword)로 검색 URL을 만들어 한 번에 호출.
 * curious_coder와 같은 URL 형식 쓰니까 시그니처도 동일.
 */
export async function fetchMetaAdsOfficial(opts: {
  brand_meta_pages: string[];
  brand_keyword: string | null;
  countries: string[];
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
  if (!opts.countries || opts.countries.length === 0) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason: "countries 비어있음",
    };
  }

  // ★ 공식 액터는 q= keyword 검색을 ignore함. page URL만 인식.
  //   - brand_meta_pages 각 항목 → "https://www.facebook.com/{page}" 직접 URL
  //   - 숫자만 들어있으면 page_id로 간주 → view_all_page_id URL
  //   - brand_keyword는 무시 (공식 액터에서 keyword 검색 결과 1건만 반환되는 버그
  //     2026-05-27 확인). official 모드 쓰려면 brand_meta_pages 채워야 함.
  const urls: string[] = [];
  const isNumericId = (s: string) => /^\d+$/.test(s);
  for (const country of opts.countries) {
    for (const rawPage of opts.brand_meta_pages ?? []) {
      const page = rawPage.trim();
      if (!page) continue;
      if (isNumericId(page)) {
        urls.push(
          `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&search_type=page&view_all_page_id=${page}`,
        );
      } else {
        // 페이지 핸들 (e.g. "ninjakitchen") → 직접 페이지 URL
        urls.push(`https://www.facebook.com/${page.replace(/^@/, "")}`);
      }
    }
  }
  if (urls.length === 0) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason:
        "공식 모드: brand_meta_pages 필요 (page handle 또는 page_id). brand_keyword는 공식 액터에서 미동작.",
    };
  }

  const apiUrl = `https://api.apify.com/v2/acts/${OFFICIAL_ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  const body = {
    startUrls: urls.map((u) => ({ url: u })),
    resultsLimit: cap,
    isDetailsPerAd: true,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Apify Meta ads (official) ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  const items = (await response.json()) as unknown[];
  const ads = items
    .map(mapOfficialAdItem)
    .filter((a): a is MetaAdRaw => a !== null);

  return {
    ads,
    source_urls: urls,
    total_fetched: ads.length,
    cost_estimate_usd: ads.length * OFFICIAL_COST_PER_AD_GOLD,
  };
}

/**
 * 공식 액터로 특정 ad_archive_id들의 detail만 추가 fetch (하이브리드 mode 2단계).
 * 1000 cap 안에서. curious_coder 결과 중 partnership 의심 ad만 골라서 호출.
 */
export async function fetchMetaAdsDetailsById(opts: {
  ad_archive_ids: string[];
  country: string; // ISO 2자
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
  if (opts.ad_archive_ids.length === 0) {
    return {
      ads: [],
      source_urls: [],
      total_fetched: 0,
      cost_estimate_usd: 0,
      skipped_reason: "ad_archive_ids 비어있음",
    };
  }

  // 단건 ad URL — id만 박힌 URL이 공식 액터에서 detail까지 가져옴
  const urls = opts.ad_archive_ids.map(
    (id) => `https://www.facebook.com/ads/library/?id=${id}`,
  );

  const apiUrl = `https://api.apify.com/v2/acts/${OFFICIAL_ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  const body = {
    startUrls: urls.map((u) => ({ url: u })),
    resultsLimit: opts.ad_archive_ids.length,
    isDetailsPerAd: true,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Apify Meta ads detail ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  const items = (await response.json()) as unknown[];
  const ads = items
    .map(mapOfficialAdItem)
    .filter((a): a is MetaAdRaw => a !== null);

  return {
    ads,
    source_urls: urls,
    total_fetched: ads.length,
    cost_estimate_usd: ads.length * OFFICIAL_COST_PER_AD_GOLD,
  };
}

/**
 * 공식 액터 응답 한 행 → MetaAdRaw 매핑.
 *
 * curious_coder는 snake_case + snapshot 안 nested, 공식은 camelCase + snapshot
 * 안 nested. 키 이름이 다른 것 외에 구조는 비슷. partnership 추출이 핵심:
 *   - snapshot.pageName       → 실제 게시자 (creator_page_name)
 *   - snapshot.brandedContent → partnership 대상 (partner_page_name)
 *
 * top-level pageName(광고 run 주체) ≠ snapshot.pageName(creator)이면 partnership.
 * brandedContent도 page_name과 다르면 ★ 진짜 partnership.
 */
function mapOfficialAdItem(raw: unknown): MetaAdRaw | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const snap = (r.snapshot as Record<string, unknown> | undefined) ?? {};

  const videos = snap.videos as Array<Record<string, unknown>> | undefined;
  const images = snap.images as Array<Record<string, unknown>> | undefined;
  const cards = snap.cards as Array<Record<string, unknown>> | undefined;

  // body
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
  if (!body_text && cards?.[0]) {
    const cb = cards[0].body;
    if (typeof cb === "string") body_text = cb;
  }

  // 썸네일 / 영상 (camelCase 키)
  let thumbnail_url: string | null = null;
  let video_url: string | null = null;
  if (videos && videos.length > 0 && videos[0]) {
    const v = videos[0];
    thumbnail_url =
      (v.videoPreviewImageUrl as string | undefined) ??
      (v.thumbnailUrl as string | undefined) ??
      null;
    video_url =
      (v.videoHdUrl as string | undefined) ??
      (v.videoSdUrl as string | undefined) ??
      null;
  }
  if (!thumbnail_url && images && images.length > 0 && images[0]) {
    thumbnail_url =
      (images[0].originalImageUrl as string | undefined) ??
      (images[0].resizedImageUrl as string | undefined) ??
      null;
  }
  if (!thumbnail_url && cards && cards.length > 0 && cards[0]) {
    const c0 = cards[0];
    thumbnail_url =
      (c0.videoPreviewImageUrl as string | undefined) ??
      (c0.originalImageUrl as string | undefined) ??
      (c0.resizedImageUrl as string | undefined) ??
      null;
    if (!video_url) {
      video_url =
        (c0.videoHdUrl as string | undefined) ??
        (c0.videoSdUrl as string | undefined) ??
        null;
    }
  }

  // format
  let format: string | null = null;
  const displayFormat = snap.displayFormat as string | undefined;
  if (typeof displayFormat === "string" && displayFormat) {
    format = displayFormat.toLowerCase();
  } else if (videos && videos.length > 0) format = "video";
  else if (images && images.length > 0) format = "image";
  else if (cards && cards.length > 0) format = "carousel";

  const link_url =
    (snap.linkUrl as string | undefined) ??
    (cards?.[0]?.linkUrl as string | undefined) ??
    null;
  const title =
    (snap.title as string | undefined) ??
    (cards?.[0]?.title as string | undefined) ??
    null;
  const cta_type =
    (snap.ctaType as string | undefined) ??
    (cards?.[0]?.ctaType as string | undefined) ??
    null;
  const cta_text =
    (snap.ctaText as string | undefined) ??
    (cards?.[0]?.ctaText as string | undefined) ??
    null;

  // ★ partnership 추출
  // 광고 run 주체 (top-level pageName) — 보통 partnership에선 브랜드
  const runPageName =
    (r.pageName as string | undefined) ??
    (r.pageId as string | undefined) ??
    null;
  // 실제 콘텐츠 게시자 (snapshot.pageName) — partnership에선 인플
  const creatorPageName = (snap.pageName as string | undefined) ?? null;
  // partnership 대상 브랜드 (snapshot.brandedContent.pageName)
  const branded = snap.brandedContent as
    | Record<string, unknown>
    | null
    | undefined;
  const brandedPageName =
    branded && typeof branded === "object"
      ? ((branded.pageName as string | undefined) ?? null)
      : null;
  const brandedPageId =
    branded && typeof branded === "object"
      ? ((branded.pageId as string | undefined) ?? null)
      : null;

  // creator ≠ run 주체일 때만 creator_page_name 채움 (브랜드 자기 광고는 null)
  const creator_page_name =
    creatorPageName && creatorPageName !== runPageName
      ? creatorPageName
      : null;
  // brandedContent.pageName ≠ creator일 때만 partner 채움 (자기 자신 tagging은 무시)
  const partner_page_name =
    brandedPageName && brandedPageName !== creatorPageName
      ? brandedPageName
      : null;
  const partner_page_id =
    brandedPageName && brandedPageName !== creatorPageName
      ? brandedPageId
      : null;

  return {
    ad_archive_id:
      (r.adArchiveId as string | undefined) ??
      (r.adArchiveID as string | undefined) ??
      (typeof r.id === "string" ? r.id : undefined) ??
      null,
    collation_id:
      typeof r.collationId === "string"
        ? r.collationId
        : typeof r.collationId === "number"
          ? String(r.collationId)
          : null,
    page_name: runPageName,
    page_id:
      (r.pageId as string | undefined) ?? (r.pageID as string | undefined) ?? null,
    format,
    start_date:
      toDateStr(r.startDateFormatted) ?? toDateStr(r.startDate) ?? null,
    end_date: toDateStr(r.endDateFormatted) ?? toDateStr(r.endDate) ?? null,
    is_active:
      typeof r.isActive === "boolean" ? (r.isActive as boolean) : null,
    body_text,
    title,
    cta_type,
    cta_text,
    link_url,
    thumbnail_url,
    video_url,
    creator_page_name,
    partner_page_name,
    partner_page_id,
    snapshot: r,
  };
}

/**
 * 키워드 데이터에서 브랜드 공식 page_id 도출.
 *   brand_keyword 토큰(3자+)이 page_name에 들어간 광고들의 page_id 최빈값.
 *   리테일러는 보통 브랜드명을 page_name에 안 넣으므로 공식/카피만 후보가 됨.
 */
function deriveOfficialPageId(
  ads: MetaAdRaw[],
  brandKeyword: string,
): string | null {
  const tokens = brandKeyword
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const counts = new Map<string, number>();
  for (const a of ads) {
    if (!a.page_id || !a.page_name) continue;
    const pn = a.page_name.toLowerCase();
    if (tokens.some((t) => pn.includes(t))) {
      counts.set(a.page_id, (counts.get(a.page_id) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let max = 0;
  for (const [p, n] of counts) if (n > max) ((max = n), (best = p));
  return best;
}

export type MetaAdsCombinedResult = MetaAdsResult & {
  official_page_id: string | null;
  source_breakdown: { keyword: number; official: number; merged: number };
};

/**
 * 결합 스크랩 — 키워드(curious_coder) + 공식액터(page_id) 합쳐서 둘의 강점 다 취함.
 *
 *   1. 키워드 스크랩 → 종료+활성 전부 (2.7년 라이프사이클), 단 리테일러·카피 섞임
 *   2. 공식 page_id 결정 (brand_meta_pages 숫자 > 키워드에서 도출)
 *   3. 공식액터 스크랩 (page_id) → 활성 + 파트너십 attribution(크리에이터 핸들)
 *   4. ad_archive_id로 merge + 필터:
 *        keep = 공식페이지 ∪ 파트너십(공식에서 확인) ∪ 현재 파트너 크리에이터의 광고
 *        버림 = 리테일러·카피·무관 크리에이터
 *      라이프사이클(start/end/is_active)은 키워드(종료 포함)에서, attribution은 공식에서.
 *
 * 결과: 종료+온고잉 다 나오면서, 공식 직접광고 + 공식페이지 파트너십까지 attribution.
 */
export async function fetchMetaAdsCombined(opts: {
  brand_meta_pages: string[];
  brand_keyword: string | null;
  countries: string[];
  cap?: number;
}): Promise<MetaAdsCombinedResult> {
  const cap = opts.cap ?? 1000;
  const empty: MetaAdsResult = {
    ads: [],
    source_urls: [],
    total_fetched: 0,
    cost_estimate_usd: 0,
  };

  // 1) 키워드 스크랩 (전체 라이프사이클)
  const kw: MetaAdsResult = opts.brand_keyword
    ? await fetchMetaAds({
        brand_meta_pages: [],
        brand_keyword: opts.brand_keyword,
        countries: opts.countries,
        cap,
      })
    : empty;

  // 2) 공식 page_id 결정
  let officialPageId =
    (opts.brand_meta_pages ?? []).find((p) => /^\d+$/.test(p)) ?? null;
  if (!officialPageId && opts.brand_keyword) {
    officialPageId = deriveOfficialPageId(kw.ads, opts.brand_keyword);
  }

  // 3) 공식액터 스크랩 (활성 + 파트너십)
  const off: MetaAdsResult = officialPageId
    ? await fetchMetaAdsOfficial({
        brand_meta_pages: [officialPageId],
        brand_keyword: null,
        countries: opts.countries,
        cap,
      })
    : empty;

  // 4) merge + 필터
  const partnershipById = new Map<string, MetaAdRaw>();
  const partnerCreators = new Set<string>();
  for (const a of off.ads) {
    if (a.ad_archive_id) partnershipById.set(a.ad_archive_id, a);
    if (a.creator_page_name)
      partnerCreators.add(a.creator_page_name.toLowerCase());
  }

  const merged = new Map<string, MetaAdRaw>();
  // 4a) 공식액터 ads 먼저 (전부 brand-relevant, attribution 보유)
  for (const a of off.ads) if (a.ad_archive_id) merged.set(a.ad_archive_id, a);
  // 4b) 키워드 ads 중 brand-relevant만 추가/보강
  for (const a of kw.ads) {
    const id = a.ad_archive_id;
    if (!id) continue;
    const onOfficialPage =
      officialPageId != null && a.page_id === officialPageId;
    const isKnownPartner =
      a.page_name != null && partnerCreators.has(a.page_name.toLowerCase());
    const inOfficial = partnershipById.has(id);
    if (!onOfficialPage && !isKnownPartner && !inOfficial) continue; // 리테일러·카피 제외

    const creatorFromOfficial = partnershipById.get(id)?.creator_page_name;
    const creator =
      creatorFromOfficial ??
      (isKnownPartner && !onOfficialPage ? a.page_name : null);
    const existing = merged.get(id);
    if (existing) {
      // 라이프사이클은 키워드가 더 정확(종료 포함) → 덮어씀, attribution은 공식 유지
      merged.set(id, {
        ...existing,
        start_date: a.start_date ?? existing.start_date,
        end_date: a.end_date ?? existing.end_date,
        is_active: a.is_active ?? existing.is_active,
        creator_page_name: existing.creator_page_name ?? creator,
      });
    } else {
      merged.set(id, { ...a, creator_page_name: creator });
    }
  }

  const ads = [...merged.values()];
  return {
    ads,
    official_page_id: officialPageId,
    source_urls: [...kw.source_urls, ...off.source_urls],
    total_fetched: ads.length,
    cost_estimate_usd: kw.cost_estimate_usd + off.cost_estimate_usd,
    skipped_reason:
      ads.length === 0
        ? (kw.skipped_reason ?? off.skipped_reason ?? "결과 0건")
        : undefined,
    source_breakdown: {
      keyword: kw.ads.length,
      official: off.ads.length,
      merged: ads.length,
    },
  };
}
