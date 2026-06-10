import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchMetaAds,
  fetchMetaAdsDetailsById,
  fetchMetaAdsOfficial,
  type MetaAdRaw,
} from "@/lib/apify/meta-ads";
import {
  countriesInRegion,
  isRegionCode,
  type Region,
} from "@/lib/case-detail/countries";
import type {
  LandingType,
  MetaAdEntry,
  PartnerCreatorEntry,
  Phase4aStats,
} from "../types";

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
    .select("id, country, channel, brand_keyword, brand_meta_pages, options")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  // Meta Ads는 채널 무관 — 같은 브랜드의 FB/IG 광고는 amazon/tiktok_shop/shopee
  // 케이스 모두 유효. brand_keyword 또는 brand_meta_pages 있으면 fetchMetaAds가
  // 처리하고, 없으면 0건 반환. (옛 코드는 amazon만 분석했지만 SharkNinja TT Shop
  // 케이스에서 Meta 광고 분석 필요해서 가드 풀음 — 2026-05-27)

  // 2. Apify 호출 — 권역 case면 권역 안 단일 국가들로 풀어서 N번 fetch (Facebook
  //    Ads Library는 ISO 2자 country 코드만 인식). 단일 case는 그대로 한 국가.
  //
  // meta_ads_source 분기 (2026-05-27 추가):
  //   - 'official': apify 공식 액터로 전체 fetch (partnership 정확, $3.4/1000)
  //   - 'hybrid'   : curious_coder로 1차 ($0.75) + partnership 의심 ad만 공식 재호출
  //   - undefined  : curious_coder만 (기존 동작, partnership 정보 없음)
  const targetCountries = isRegionCode(c.country)
    ? countriesInRegion(c.country as Region)
    : [c.country];
  const metaAdsSource =
    ((c.options as { meta_ads_source?: string } | null)?.meta_ads_source as
      | "official"
      | "hybrid"
      | undefined) ?? "hybrid";

  let result: Awaited<ReturnType<typeof fetchMetaAds>>;
  if (metaAdsSource === "official") {
    result = await fetchMetaAdsOfficial({
      brand_meta_pages: c.brand_meta_pages ?? [],
      brand_keyword: c.brand_keyword,
      countries: targetCountries,
      cap: 1000,
    });
  } else {
    // 'hybrid' 또는 undefined — curious_coder 1차 fetch
    result = await fetchMetaAds({
      brand_meta_pages: c.brand_meta_pages ?? [],
      brand_keyword: c.brand_keyword,
      countries: targetCountries,
      cap: 1000,
    });

    // hybrid 모드: partnership 의심 ad만 골라서 공식 액터로 detail 재호출
    // (curious_coder는 partnership 정보 손실하니 detail로 보강).
    // ★ Fix ④: ad-heavy(>400) 케이스는 detail 재호출 스킵 = 자동 curious.
    //   대량 스크랩 + 200건 detail 이 함수 maxDuration(800s) 초과 → http_unreachable
    //   로 분석 전체가 실패함(685광고 케이스 6769b0bb). partnership 정보만 일부 손실.
    const AD_HEAVY_SKIP_HYBRID = 400;
    if (metaAdsSource === "hybrid" && result.ads.length > AD_HEAVY_SKIP_HYBRID) {
      console.log(
        `[phase4a] ad-heavy (${result.ads.length} > ${AD_HEAVY_SKIP_HYBRID}) → hybrid detail 스킵 (curious-only, 타임아웃 회피)`,
      );
    }
    if (
      metaAdsSource === "hybrid" &&
      result.ads.length > 0 &&
      result.ads.length <= AD_HEAVY_SKIP_HYBRID
    ) {
      const partnershipCandidates = result.ads
        .filter((a) => isPartnershipCandidate(a))
        .map((a) => a.ad_archive_id)
        .filter((id): id is string => !!id)
        .slice(0, 200); // detail fetch cap — 케이스당 +$0.68 (200건 × $0.0034)

      if (partnershipCandidates.length > 0) {
        const detailResult = await fetchMetaAdsDetailsById({
          ad_archive_ids: partnershipCandidates,
          country: targetCountries[0] ?? "US",
        });
        // detail 결과를 기존 ad에 merge — ad_archive_id로 매칭해서 partnership 필드만 덮어쓰기
        const detailMap = new Map(
          detailResult.ads
            .filter((d) => d.ad_archive_id)
            .map((d) => [d.ad_archive_id!, d]),
        );
        result.ads = result.ads.map((a) => {
          if (!a.ad_archive_id) return a;
          const d = detailMap.get(a.ad_archive_id);
          if (!d) return a;
          return {
            ...a,
            creator_page_name: d.creator_page_name ?? null,
            partner_page_name: d.partner_page_name ?? null,
            partner_page_id: d.partner_page_id ?? null,
          };
        });
        result.cost_estimate_usd += detailResult.cost_estimate_usd;
      }
    }
  }

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
    creator_page_name: ad.creator_page_name ?? null,
    partner_page_name: ad.partner_page_name ?? null,
    partner_page_id: ad.partner_page_id ?? null,
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
  let partnership_ads = 0;
  const otherDomainCounts = new Map<string, number>();
  // partner_creators 집계용 — creator_page_name 별 그룹
  const creatorAgg = new Map<
    string,
    {
      creator_page_name: string;
      partner_brands: Set<string>;
      ad_count: number;
      active_count: number;
      first_seen: string | null;
      last_seen: string | null;
      sample_thumbnail: string | null;
    }
  >();
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
    // partnership 집계 — creator_page_name 채워진 ad만
    const creator = a.creator_page_name;
    if (creator) {
      partnership_ads += 1;
      let bucket = creatorAgg.get(creator);
      if (!bucket) {
        bucket = {
          creator_page_name: creator,
          partner_brands: new Set<string>(),
          ad_count: 0,
          active_count: 0,
          first_seen: null,
          last_seen: null,
          sample_thumbnail: null,
        };
        creatorAgg.set(creator, bucket);
      }
      bucket.ad_count += 1;
      if (a.is_active) bucket.active_count += 1;
      if (a.partner_page_name) bucket.partner_brands.add(a.partner_page_name);
      if (
        a.start_date &&
        (!bucket.first_seen || a.start_date < bucket.first_seen)
      )
        bucket.first_seen = a.start_date;
      if (
        a.start_date &&
        (!bucket.last_seen || a.start_date > bucket.last_seen)
      )
        bucket.last_seen = a.start_date;
      if (!bucket.sample_thumbnail && a.thumbnail_url)
        bucket.sample_thumbnail = a.thumbnail_url;
    }
  }
  const other_top_domains = Array.from(otherDomainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const partner_creators: PartnerCreatorEntry[] = Array.from(creatorAgg.values())
    .map((c) => ({
      creator_page_name: c.creator_page_name,
      partner_page_name:
        c.partner_brands.size > 0
          ? Array.from(c.partner_brands).join(", ")
          : null,
      ad_count: c.ad_count,
      active_count: c.active_count,
      first_seen: c.first_seen,
      last_seen: c.last_seen,
      sample_thumbnail: c.sample_thumbnail,
    }))
    .sort((a, b) => {
      if (b.ad_count !== a.ad_count) return b.ad_count - a.ad_count;
      if (b.active_count !== a.active_count)
        return b.active_count - a.active_count;
      return (b.last_seen ?? "").localeCompare(a.last_seen ?? "");
    });

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
    partnership_ads,
    partnership_creators: partner_creators.length,
    formats: formatCounts,
    landings,
    other_top_domains,
    source_urls_count: result.source_urls.length,
    cost_actual_usd: result.cost_estimate_usd,
    ads_preview,
    partner_creators,
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

/**
 * curious_coder 1차 fetch 결과에서 partnership 광고일 가능성이 높은 ad만 추림.
 * 이 후보들만 공식 액터로 detail 재호출해서 creator_page_name / partner_page_name
 * 채워넣음 (hybrid 모드).
 *
 * 시그널:
 *   - body_text에 #ad / #sponsored / #partner / paid partnership 같은 disclosure
 *   - body_text에 1인칭 ("I ", "my ", "we ") + brand 핸들 mention
 *   - is_brand_official=false (브랜드 본사가 아닌 페이지가 돌리는 ad)
 */
function isPartnershipCandidate(ad: MetaAdRaw): boolean {
  const body = (ad.body_text ?? "").toLowerCase();
  if (!body) return false;
  const disclosurePatterns = [
    /#ad\b/,
    /#sponsored\b/,
    /#partner/,
    /paid partnership/,
    /sponsored by/,
    /in partnership with/,
    /#gifted/,
    /#prsample/,
  ];
  if (disclosurePatterns.some((p) => p.test(body))) return true;
  // 1인칭 + @brand mention — 인플이 쓴 캡션이 브랜드 광고로 돌아간 패턴
  const firstPerson = /\b(i|my|we|our)\b/.test(body);
  const hasMention = /@\w+/.test(body);
  return firstPerson && hasMention;
}

function emptyPhase4a(reason: string): Phase4aStats {
  return {
    total_ads: 0,
    active_ads: 0,
    brand_official_ads: 0,
    partnership_ads: 0,
    partnership_creators: 0,
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
    partner_creators: [],
    computed_at: new Date().toISOString(),
  };
}
