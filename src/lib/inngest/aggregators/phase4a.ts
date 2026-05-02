import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchMetaAds, type MetaAdRaw } from "@/lib/apify/meta-ads";
import type { LandingType, MetaAdEntry, Phase4aStats } from "../types";

type SupaClient = SupabaseClient<Database>;

const BATCH = 200;

/**
 * Phase 4a — Meta Ads (Amazon 케이스만)
 *
 * 1. cases.brand_keyword + brand_meta_pages 읽기
 * 2. Apify curious_coder/facebook-ads-library-scraper 호출 (1000 cap)
 * 3. meta_ads 테이블에 저장 (is_brand_official 자동 마킹)
 * 4. summary stats 반환 (key_stats.phase4a)
 *
 * APIFY_TOKEN 없거나 brand_keyword/pages 비어있으면 graceful skip.
 */
export async function runPhase4a(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4aStats> {
  // 1. 케이스 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, country, channel, brand_keyword, brand_meta_pages")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  if (c.channel !== "amazon") {
    return emptyPhase4a("Amazon 케이스가 아님");
  }

  // 2. Apify 호출
  const result = await fetchMetaAds({
    brand_meta_pages: c.brand_meta_pages ?? [],
    brand_keyword: c.brand_keyword,
    country: c.country,
    cap: 1000,
  });

  if (result.skipped_reason) {
    return emptyPhase4a(result.skipped_reason);
  }

  // 3. 같은 검색 URL이 여러 개면 중복 ad가 옴 → ad_archive_id 기준 dedupe
  const dedupedAds = dedupeAds(result.ads);

  // 4. 기존 meta_ads 정리 (이 케이스 한정) — 재실행 시 중복 방지
  await supabase.from("meta_ads").delete().eq("case_id", case_id);

  // 5. 본사 페이지 매칭 정규화
  const officialPagesNormalized = (c.brand_meta_pages ?? []).map((p) =>
    p.toLowerCase().trim(),
  );
  const isBrandOfficial = (page_name: string | null): boolean => {
    if (!page_name) return false;
    const norm = page_name.toLowerCase().trim();
    return officialPagesNormalized.some(
      (op) => op.includes(norm) || norm.includes(op),
    );
  };

  // 6. meta_ads insert
  const inserts = dedupedAds.map((ad) => ({
    case_id,
    ad_archive_id: ad.ad_archive_id,
    page_name: ad.page_name,
    page_id: ad.page_id,
    format: ad.format,
    start_date: ad.start_date,
    end_date: ad.end_date,
    is_active: ad.is_active,
    body_text: ad.body_text,
    title: ad.title,
    cta_type: ad.cta_type,
    cta_text: ad.cta_text,
    link_url: ad.link_url,
    thumbnail_url: ad.thumbnail_url,
    video_url: ad.video_url,
    is_brand_official: isBrandOfficial(ad.page_name),
    snapshot: ad.snapshot as never,
  }));

  // landing 분류 (DB엔 컬럼 없음, 집계용으로만 계산)
  const adsWithLanding = inserts.map((a) => ({
    ...a,
    landing: classifyLanding(a.link_url, c.brand_keyword),
  }));

  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase.from("meta_ads").insert(batch);
    if (error) {
      throw new Error(
        `meta_ads insert (batch ${i}): ${error.message || JSON.stringify(error)}`,
      );
    }
  }

  // 7. summary 산출
  const formatCounts = { video: 0, image: 0, other: 0 };
  const landings: Record<LandingType, number> = {
    instagram: 0,
    amazon: 0,
    tiktok_shop: 0,
    facebook: 0,
    dtc: 0,
    other: 0,
    none: 0,
  };
  let active = 0;
  let official = 0;
  const otherDomainCounts = new Map<string, number>();
  for (const a of adsWithLanding) {
    if (a.format === "video") formatCounts.video += 1;
    else if (a.format === "image") formatCounts.image += 1;
    else formatCounts.other += 1;
    if (a.is_active) active += 1;
    if (a.is_brand_official) official += 1;
    landings[a.landing] += 1;
    // landing이 "other"면 실제 도메인 집계
    if (a.landing === "other" && a.link_url) {
      const domain = extractDomain(a.link_url);
      if (domain) {
        otherDomainCounts.set(domain, (otherDomainCounts.get(domain) ?? 0) + 1);
      }
    }
  }
  const other_top_domains = Array.from(otherDomainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 화면 노출용 미리보기: brand_official 우선 → active 우선 → 최신순
  // 1차 dedupe(collation 포함)는 이미 됐으니 여기선 thumbnail 기준 추가 컷만
  const seen = new Set<string>();
  const sorted = [...adsWithLanding]
    .filter((a) => {
      const idKey = a.ad_archive_id ? `id:${a.ad_archive_id}` : null;
      const thumbKey = a.thumbnail_url
        ? `thumb:${a.thumbnail_url.split("?")[0]}`
        : null;
      const primaryKey =
        idKey ??
        thumbKey ??
        `pb:${a.page_name}|${a.start_date}|${a.body_text}`;
      if (seen.has(primaryKey)) return false;
      seen.add(primaryKey);
      if (thumbKey) seen.add(thumbKey);
      return true;
    })
    .sort((a, b) => {
      if (a.is_brand_official !== b.is_brand_official) {
        return a.is_brand_official ? -1 : 1;
      }
      if ((a.is_active ?? false) !== (b.is_active ?? false)) {
        return a.is_active ? -1 : 1;
      }
      return (b.start_date ?? "").localeCompare(a.start_date ?? "");
    });

  const ads_preview: MetaAdEntry[] = sorted.slice(0, 6).map((a) => ({
    ad_archive_id: a.ad_archive_id,
    page_name: a.page_name,
    format: a.format,
    start_date: a.start_date,
    end_date: a.end_date,
    is_active: a.is_active,
    body_text: a.body_text,
    thumbnail_url: a.thumbnail_url,
    video_url: a.video_url,
    link_url: a.link_url,
    landing: a.landing,
    is_brand_official: a.is_brand_official,
  }));

  return {
    total_ads: inserts.length,
    active_ads: active,
    brand_official_ads: official,
    formats: formatCounts,
    landings,
    other_top_domains,
    source_urls_count: result.source_urls.length,
    cost_actual_usd: result.cost_estimate_usd,
    ads_preview,
    computed_at: new Date().toISOString(),
  };
}

/**
 * 광고 dedupe.
 *
 * 우선순위:
 *   1) collation_id ★ — FB가 자체적으로 같은 creative를 묶어주는 그룹 키.
 *      여러 ad_archive_id가 같은 creative 재발행이면 collation_id 동일.
 *      이게 가장 정확한 dedup 신호.
 *   2) ad_archive_id — collation 정보 없으면 ad 단위
 *   3) thumbnail_url 정규화 — 시각적 fingerprint
 *   4) page+start_date+body_text — 최후 fallback
 */
function dedupeAds(ads: MetaAdRaw[]): MetaAdRaw[] {
  const seen = new Set<string>();
  const result: MetaAdRaw[] = [];
  for (const a of ads) {
    let key: string;
    if (a.collation_id) {
      key = `coll:${a.collation_id}`;
    } else if (a.ad_archive_id) {
      key = `id:${a.ad_archive_id}`;
    } else if (a.thumbnail_url) {
      key = `thumb:${a.thumbnail_url.split("?")[0]}`;
    } else {
      key = `pb:${a.page_name ?? ""}|${a.start_date ?? ""}|${(a.body_text ?? "").slice(0, 80)}`;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(a);
  }
  return result;
}

/**
 * FB 리다이렉트 URL (l.facebook.com / lm.facebook.com) 안에 박힌 실제 destination 추출.
 * 그 외는 입력 그대로 반환.
 */
export function unwrapRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "l.facebook.com" || u.hostname === "lm.facebook.com") {
      const real = u.searchParams.get("u");
      if (real) return decodeURIComponent(real);
    }
  } catch {
    // invalid url
  }
  return url;
}

/**
 * URL에서 hostname (도메인) 추출. FB redirect는 풀어서 destination 도메인 반환.
 */
function extractDomain(url: string): string | null {
  try {
    const real = unwrapRedirect(url);
    const u = new URL(real);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 광고 link_url을 랜딩 카테고리로 분류.
 * FB 리다이렉트가 박혀있으면 풀어서 destination 기준으로 분류.
 * brandKeyword (콤마 구분)가 도메인에 substring 매치되면 DTC.
 */
function classifyLanding(
  url: string | null,
  brandKeyword?: string | null,
): LandingType {
  if (!url) return "none";
  const real = unwrapRedirect(url).toLowerCase();
  if (real.includes("instagram.com") || real.includes("instagr.am"))
    return "instagram";
  if (
    real.includes("amazon.com") ||
    real.includes("amzn.to") ||
    real.includes("a.co/") ||
    real.includes("amzn.com")
  ) {
    return "amazon";
  }
  if (real.includes("tiktok.com/shop")) return "tiktok_shop";
  if (real.includes("facebook.com") || real.includes("fb.com"))
    return "facebook";

  // DTC: brand_keyword 토큰이 도메인에 들어가면 자사몰로 분류.
  // 짧은 토큰(2자 이하)은 false positive 위험으로 제외.
  if (brandKeyword) {
    const tokens = brandKeyword
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3);
    if (tokens.length > 0) {
      const domain = extractDomain(real);
      if (domain && tokens.some((t) => domain.includes(t))) {
        return "dtc";
      }
    }
  }

  return "other";
}

function emptyPhase4a(reason: string): Phase4aStats {
  return {
    total_ads: 0,
    active_ads: 0,
    brand_official_ads: 0,
    formats: { video: 0, image: 0, other: 0 },
    landings: {
      instagram: 0,
      amazon: 0,
      tiktok_shop: 0,
      facebook: 0,
      dtc: 0,
      other: 0,
      none: 0,
    },
    other_top_domains: [],
    source_urls_count: 0,
    cost_actual_usd: 0,
    skipped_reason: reason,
    ads_preview: [],
    computed_at: new Date().toISOString(),
  };
}
