import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchIgPostsByUsername,
  type IgPostScraperResult,
} from "@/lib/apify/instagram-post-scraper";
import type { IgConfig } from "./phase4c-ig-monitor";

type SupaClient = SupabaseClient<Database>;

const DEFAULT_PAID_KEYWORDS = [
  "#ad",
  "#sponsored",
  "#anzeige",
  "#werbung",
  "paid partnership",
  "in partnership with",
  "gifted by",
  "광고",
  "sponsored by",
];

/**
 * Phase 4c-prep — seed username 1개로 ig_config 자동 발굴.
 *
 * 입력: case_id + seed_username (예: "ninjakitchen")
 * 출력: 추천된 IgConfig (사용자가 accept/수정 후 cases.ig_config에 박음)
 *
 * 자동 발굴 로직:
 *   1. seed username post-scraper × 100 post fetch
 *   2. hashtag 빈도 → brand 키워드 포함 또는 빈도 top N → ig_brand_hashtags
 *   3. mention 빈도 → brand slug 매칭 → ig_owned_usernames (자매 owned 계정)
 *   4. brand name 기반 regex 자동 생성 → ig_brand_regex
 *   5. paid keyword default + brand-specific 후보
 *
 * 한계:
 *   - seed username의 100 post 안에서만 발굴 → 큰 brand는 충분, 작은 brand는 manual 보완 필요
 *   - author_seeds / celeb_handles는 이 단계에서 X (1차 phase4c 결과 후 postlearn에서)
 */
export type Phase4cPrepResult = {
  suggested_config: IgConfig;
  cost_estimate_usd: number;
  debug: {
    seed_username: string;
    seed_post_count: number;
    hashtag_freq_top: Array<{ tag: string; count: number; matches_brand: boolean }>;
    mention_freq_top: Array<{ handle: string; count: number; matches_brand: boolean }>;
    brand_slug_used: string;
    brand_name: string | null;
  };
  skipped_reason?: string;
};

export async function runPhase4cPrep(
  supabase: SupaClient,
  case_id: string,
  seed_username: string,
): Promise<Phase4cPrepResult> {
  // 1. case + brand 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, brand_id, brand:brands(name)")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const brand_name =
    (c.brand as unknown as { name: string } | null)?.name ?? null;

  // brand slug — 검색 매칭용 (소문자, 공백/특수문자 제거)
  // "Shark Ninja" → "sharkninja", "ninja kitchen" → "ninjakitchen"
  const brandSlug = (brand_name ?? seed_username)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  // 또 seed 자체에서도 slug 추출 (brand name이 모호할 때 fallback)
  const seedSlug = seed_username.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 2. seed username post-scraper × 100
  const scrapeResult: IgPostScraperResult = await fetchIgPostsByUsername({
    usernames: [seed_username],
    resultsLimit: 100,
  });

  if (
    scrapeResult.skipped_reason ||
    scrapeResult.items.length === 0
  ) {
    return {
      suggested_config: emptyConfig(brand_name, seed_username),
      cost_estimate_usd: scrapeResult.cost_estimate_usd,
      debug: {
        seed_username,
        seed_post_count: 0,
        hashtag_freq_top: [],
        mention_freq_top: [],
        brand_slug_used: brandSlug,
        brand_name,
      },
      skipped_reason:
        scrapeResult.skipped_reason ?? "seed post 수집 결과 0개",
    };
  }

  // 3. hashtag 빈도 분석
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
        slug.includes(brandSlug) || slug.includes(seedSlug);
      return { tag, count, matches_brand: matchesBrand };
    })
    .sort((a, b) => b.count - a.count);

  // brand hashtag 추천:
  // 1순위 = brand 키워드 포함 + 빈도 2+ (확실한 brand hashtag)
  // 2순위 = 그 외 빈도 top 5 (제품/캠페인 hashtag 가능성)
  const brandHashtags = [
    ...hashtagSorted
      .filter((h) => h.matches_brand && h.count >= 2)
      .map((h) => h.tag),
    ...hashtagSorted
      .filter((h) => !h.matches_brand && h.count >= 3)
      .slice(0, 5)
      .map((h) => h.tag),
  ];

  // 4. mention 빈도 분석
  const mentionFreq = new Map<string, number>();
  for (const it of scrapeResult.items) {
    for (const m of it.mentions ?? []) {
      if (typeof m !== "string" || m.length < 2) continue;
      mentionFreq.set(m, (mentionFreq.get(m) ?? 0) + 1);
    }
  }
  // seed username과 brand slug 포함하는 mention = 자매 owned 계정 후보
  const ownedCandidates = Array.from(mentionFreq.entries())
    .map(([handle, count]) => {
      const slug = handle.toLowerCase().replace(/[^a-z0-9]/g, "");
      const matchesBrand =
        slug.includes(brandSlug) ||
        slug.includes(seedSlug) ||
        // seed_username 자체와 prefix 공유 (예: ninjakitchen + ninja_france)
        (seedSlug.length >= 4 && slug.startsWith(seedSlug.slice(0, 4)));
      return { handle, count, matches_brand: matchesBrand };
    })
    .sort((a, b) => b.count - a.count);

  // owned usernames 추천: seed + brand slug 포함 mention 빈도 2+
  const ownedUsernames = [
    seed_username,
    ...ownedCandidates
      .filter((m) => m.matches_brand && m.count >= 2 && m.handle !== seed_username)
      .map((m) => m.handle),
  ];

  // 5. brand regex 자동 생성
  // 패턴: brand 키워드 + @owned + #brand-prefix-hashtag
  const brandRegexes: string[] = [];
  if (brand_name) {
    // "Ninja Kitchen" → "ninja\s?kitchen" (공백 옵션)
    const escaped = brand_name
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s?");
    brandRegexes.push(escaped);
  }
  if (seedSlug.length >= 4) {
    brandRegexes.push(`@${seedSlug}\\w*`);
    // #brandslug로 시작하는 hashtag 매칭 (NinjaCREAMI / NinjaSwirl 같은 일가)
    brandRegexes.push(`#${seedSlug}\\w*`);
  }
  if (brandSlug !== seedSlug && brandSlug.length >= 4) {
    brandRegexes.push(`#${brandSlug}\\w*`);
  }

  // 6. paid keywords — default + brand-specific 후보
  const paidKeywords = [
    ...DEFAULT_PAID_KEYWORDS,
    // brand-specific 후보 (1차 phase4c 후 hashtag 빈도 분석에서 자동 추가될 수 있음)
    `#${seedSlug}partner`,
    `#sponsoredby${seedSlug}`,
  ];

  const suggested: IgConfig = {
    ig_owned_usernames: ownedUsernames,
    ig_brand_hashtags: brandHashtags,
    ig_brand_regex: brandRegexes,
    ig_author_seeds: [], // postlearn에서 자동
    ig_celeb_handles: [], // postlearn에서 자동
    ig_paid_keywords: paidKeywords,
    ig_use_reels_type: true,
    ig_hashtag_results_limit: 300,
    ig_post_results_limit: 50,
  };

  return {
    suggested_config: suggested,
    cost_estimate_usd: scrapeResult.cost_estimate_usd,
    debug: {
      seed_username,
      seed_post_count: scrapeResult.items.length,
      hashtag_freq_top: hashtagSorted.slice(0, 30),
      mention_freq_top: ownedCandidates.slice(0, 20),
      brand_slug_used: brandSlug,
      brand_name,
    },
  };
}

function emptyConfig(brand_name: string | null, seed_username: string): IgConfig {
  return {
    ig_owned_usernames: [seed_username],
    ig_brand_hashtags: [],
    ig_brand_regex: brand_name
      ? [brand_name.toLowerCase().replace(/\s+/g, "\\s?")]
      : [],
    ig_author_seeds: [],
    ig_celeb_handles: [],
    ig_paid_keywords: DEFAULT_PAID_KEYWORDS,
    ig_use_reels_type: true,
  };
}
