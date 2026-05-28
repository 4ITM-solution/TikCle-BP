import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { IgConfig } from "./phase4c-ig-monitor";

type SupaClient = SupabaseClient<Database>;

/**
 * Phase 4c-postlearn — 1차 phase4c 결과에서 ig_config 자동 학습.
 *
 * 입력: case_id (이미 phase4c 1차 실행 완료, ig_posts/ig_authors 박힘)
 * 출력: 학습된 IgConfig 추천 (사용자 accept 후 ig_config commit → phase4c 2차 trigger)
 *
 * 자동 발견 로직:
 *   1. ig_author_seeds — ig_authors.max_likes top 30 (owned 제외)
 *   2. ig_celeb_handles — paid 영상의 max_views > 1M 작성자
 *   3. ig_brand_hashtags 보완 — paid % 80%+ hashtag (이미 brand hashtag에 없는 것)
 *   4. ig_paid_keywords 보완 — paid 100% hashtag 자동 추가
 *
 * 결과는 기존 ig_config + 새 자동 발견 항목을 merge.
 */
export type Phase4cPostlearnResult = {
  learned_config: IgConfig;
  diff: {
    new_author_seeds: string[];          // 기존 ig_config에 없던 신규
    new_celeb_handles: string[];
    new_brand_hashtags: string[];
    new_paid_keywords: string[];
  };
  debug: {
    top_authors_count: number;
    high_view_celebs_count: number;
    high_paid_hashtags_count: number;
    posts_analyzed: number;
  };
  skipped_reason?: string;
};

const CELEB_VIEW_THRESHOLD = 1_000_000;  // 1M views 이상
const HIGH_PAID_PCT = 80;                 // hashtag paid % 80%+ = brand-specific paid
const MIN_HASHTAG_POSTS = 10;             // hashtag 빈도 10+ (noise 필터)

export async function runPhase4cPostlearn(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4cPostlearnResult> {
  // 1. 기존 ig_config 읽기
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("ig_config")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const cfg = (c.ig_config ?? {}) as IgConfig;
  const owned = new Set(cfg.ig_owned_usernames ?? []);
  const existingSeeds = new Set(cfg.ig_author_seeds ?? []);
  const existingCelebs = new Set(cfg.ig_celeb_handles ?? []);
  const existingHashtags = new Set(
    (cfg.ig_brand_hashtags ?? []).map((s) => s.toLowerCase()),
  );
  const existingPaidKw = new Set(
    (cfg.ig_paid_keywords ?? []).map((s) => s.toLowerCase()),
  );

  // 2. 학습 1: ig_author_seeds 자동 — max_likes top 30 (owned + 기존 seed 제외)
  const { data: authorsRaw } = await supabase
    .from("ig_authors")
    .select("username, max_likes, max_views, paid_posts, brand_matched_posts")
    .eq("case_id", case_id)
    .order("max_likes", { ascending: false, nullsFirst: false })
    .limit(50);
  const topAuthors = (authorsRaw ?? []).filter(
    (a) => !owned.has(a.username),
  );
  const newAuthorSeeds = topAuthors
    .slice(0, 30)
    .map((a) => a.username)
    .filter((u) => !existingSeeds.has(u));

  // 3. 학습 2: ig_celeb_handles — paid 영상 작성자 중 max_views > 1M
  const { data: celebRaw } = await supabase
    .from("ig_posts")
    .select("owner_username, video_play_count")
    .eq("case_id", case_id)
    .eq("brand_matched", true)
    .not("paid_signal", "is", null)
    .gte("video_play_count", CELEB_VIEW_THRESHOLD)
    .order("video_play_count", { ascending: false })
    .limit(100);
  const celebSet = new Set<string>();
  for (const r of celebRaw ?? []) {
    if (r.owner_username && !owned.has(r.owner_username)) {
      celebSet.add(r.owner_username);
    }
  }
  const newCelebs = Array.from(celebSet).filter(
    (u) => !existingCelebs.has(u),
  );

  // 4. 학습 3: paid % 80%+ hashtag → brand_hashtags + paid_keywords 자동 추가
  // 큰 fetch (5000 cap) — supabase가 array 컬럼 unnest 안 되니까 JS aggregate
  const { data: hashtagPostsRaw } = await supabase
    .from("ig_posts")
    .select("hashtags, paid_signal")
    .eq("case_id", case_id)
    .eq("brand_matched", true)
    .limit(5000);
  const tagMap = new Map<string, { posts: number; paid: number }>();
  for (const r of hashtagPostsRaw ?? []) {
    if (!Array.isArray(r.hashtags)) continue;
    const isPaid = !!r.paid_signal;
    for (const t of r.hashtags) {
      if (typeof t !== "string") continue;
      let agg = tagMap.get(t);
      if (!agg) {
        agg = { posts: 0, paid: 0 };
        tagMap.set(t, agg);
      }
      agg.posts += 1;
      if (isPaid) agg.paid += 1;
    }
  }
  const highPaidHashtags = Array.from(tagMap.entries())
    .filter(
      ([, v]) =>
        v.posts >= MIN_HASHTAG_POSTS && (v.paid * 100) / v.posts >= HIGH_PAID_PCT,
    )
    .map(([tag]) => tag);
  const newBrandHashtags = highPaidHashtags.filter(
    (t) => !existingHashtags.has(t.toLowerCase()),
  );
  const newPaidKeywords = highPaidHashtags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((kw) => !existingPaidKw.has(kw.toLowerCase()));

  // 5. merge → learned_config
  const learned: IgConfig = {
    ...cfg,
    ig_author_seeds: Array.from(
      new Set([...(cfg.ig_author_seeds ?? []), ...newAuthorSeeds]),
    ),
    ig_celeb_handles: Array.from(
      new Set([...(cfg.ig_celeb_handles ?? []), ...newCelebs]),
    ),
    ig_brand_hashtags: Array.from(
      new Set([...(cfg.ig_brand_hashtags ?? []), ...newBrandHashtags]),
    ),
    ig_paid_keywords: Array.from(
      new Set([...(cfg.ig_paid_keywords ?? []), ...newPaidKeywords]),
    ),
  };

  return {
    learned_config: learned,
    diff: {
      new_author_seeds: newAuthorSeeds,
      new_celeb_handles: newCelebs,
      new_brand_hashtags: newBrandHashtags,
      new_paid_keywords: newPaidKeywords,
    },
    debug: {
      top_authors_count: topAuthors.length,
      high_view_celebs_count: celebSet.size,
      high_paid_hashtags_count: highPaidHashtags.length,
      posts_analyzed: hashtagPostsRaw?.length ?? 0,
    },
  };
}
