import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchYtByChannel,
  type YtScraperResult,
} from "@/lib/apify/youtube-scraper";
import type { YtConfig } from "./phase4d-yt-monitor";

type SupaClient = SupabaseClient<Database>;

const DEFAULT_PAID_KEYWORDS = [
  "#ad",
  "#sponsored",
  "#anzeige",
  "paid partnership",
  "in partnership with",
  "gifted by",
  "sponsored by",
  "광고",
  "(ad)",
  "this video is sponsored",
];

/**
 * Phase 4d-prep — seed channel URL 1개로 yt_config 자동 발굴.
 *
 * 입력: case_id + seed_channel_url (예: "https://www.youtube.com/@ninjakitchen")
 * 출력: 추천된 YtConfig (사용자 accept 후 cases.yt_config commit)
 *
 * 자동 발굴:
 *   1. seed 채널 fetchYtByChannel × 50 video
 *   2. hashtag 빈도 → brand 매칭 hashtag → yt_brand_keywords 추천 (또한 검색 키워드)
 *   3. 댓글 / 콜라보 채널 빈도 → author_seeds (못 자동 X — owned post mention 빈도가 IG처럼 안 잡힘)
 *   4. brand name 기반 regex 자동 생성
 *   5. paid keyword default + brand-specific 후보
 */
export type Phase4dPrepResult = {
  suggested_config: YtConfig;
  cost_estimate_usd: number;
  debug: {
    seed_channel: string;
    seed_video_count: number;
    hashtag_freq_top: Array<{ tag: string; count: number; matches_brand: boolean }>;
    brand_slug_used: string;
    brand_name: string | null;
  };
  skipped_reason?: string;
};

export async function runPhase4dPrep(
  supabase: SupaClient,
  case_id: string,
  seed_channel_url: string,
): Promise<Phase4dPrepResult> {
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, brand_id, brand:brands(name)")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const brand_name =
    (c.brand as unknown as { name: string } | null)?.name ?? null;

  const brandSlug = (brand_name ?? seed_channel_url)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // seed URL에서 handle 추출 (@xxx 또는 /c/xxx)
  const handleMatch = seed_channel_url.match(/(?:@|\/c\/|\/channel\/UC)([\w.-]+)/);
  const seedHandle = handleMatch?.[1]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? brandSlug;

  const scrapeResult: YtScraperResult = await fetchYtByChannel({
    channelUrls: [seed_channel_url],
    maxResults: 30,
    maxResultsShorts: 20,
  });

  if (
    scrapeResult.skipped_reason ||
    scrapeResult.items.length === 0
  ) {
    return {
      suggested_config: emptyConfig(brand_name, seed_channel_url),
      cost_estimate_usd: scrapeResult.cost_estimate_usd,
      debug: {
        seed_channel: seed_channel_url,
        seed_video_count: 0,
        hashtag_freq_top: [],
        brand_slug_used: brandSlug,
        brand_name,
      },
      skipped_reason:
        scrapeResult.skipped_reason ?? "seed 채널 수집 0개",
    };
  }

  // hashtag 빈도
  const hashtagFreq = new Map<string, number>();
  for (const it of scrapeResult.items) {
    for (const t of it.hashtags ?? []) {
      if (typeof t !== "string" || t.length < 2) continue;
      hashtagFreq.set(t, (hashtagFreq.get(t) ?? 0) + 1);
    }
  }
  const hashtagSorted = Array.from(hashtagFreq.entries())
    .map(([tag, count]) => {
      const slug = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesBrand =
        slug.includes(brandSlug) || slug.includes(seedHandle);
      return { tag, count, matches_brand: matchesBrand };
    })
    .sort((a, b) => b.count - a.count);

  // brand hashtag → YT는 검색 keyword로 활용
  const brandHashtags = hashtagSorted
    .filter((h) => h.matches_brand && h.count >= 2)
    .map((h) => h.tag)
    .slice(0, 10);

  // brand regex 자동
  const brandRegexes: string[] = [];
  if (brand_name) {
    const escaped = brand_name
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s?");
    brandRegexes.push(escaped);
  }
  if (seedHandle.length >= 4) {
    brandRegexes.push(`@${seedHandle}\\w*`);
    brandRegexes.push(`#${seedHandle}\\w*`);
  }

  // brand keyword (search용) — brand_name 또는 핵심 hashtag
  const brandKeywords: string[] = [];
  if (brand_name) brandKeywords.push(brand_name);
  // 상위 brand-매칭 hashtag도 keyword로
  for (const h of hashtagSorted.filter((x) => x.matches_brand).slice(0, 3)) {
    brandKeywords.push(h.tag);
  }

  // paid keywords
  const paidKeywords = [
    ...DEFAULT_PAID_KEYWORDS,
    `#${seedHandle}partner`,
    `#sponsoredby${seedHandle}`,
  ];

  const suggested: YtConfig = {
    yt_owned_channels: [seed_channel_url],
    yt_brand_keywords: brandKeywords,
    yt_brand_regex: brandRegexes,
    yt_author_seeds: [],
    yt_celeb_handles: [],
    yt_paid_keywords: paidKeywords,
    yt_max_videos: 30,
    yt_max_shorts: 20,
  };

  return {
    suggested_config: suggested,
    cost_estimate_usd: scrapeResult.cost_estimate_usd,
    debug: {
      seed_channel: seed_channel_url,
      seed_video_count: scrapeResult.items.length,
      hashtag_freq_top: hashtagSorted.slice(0, 30),
      brand_slug_used: brandSlug,
      brand_name,
    },
  };
}

function emptyConfig(brand_name: string | null, seed_channel: string): YtConfig {
  return {
    yt_owned_channels: [seed_channel],
    yt_brand_keywords: brand_name ? [brand_name] : [],
    yt_brand_regex: brand_name
      ? [brand_name.toLowerCase().replace(/\s+/g, "\\s?")]
      : [],
    yt_author_seeds: [],
    yt_celeb_handles: [],
    yt_paid_keywords: DEFAULT_PAID_KEYWORDS,
    yt_max_videos: 30,
    yt_max_shorts: 20,
  };
}
