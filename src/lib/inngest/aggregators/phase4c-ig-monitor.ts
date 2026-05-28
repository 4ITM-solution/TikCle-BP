import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchIgPostsByHashtag,
  type IgHashtagScraperResult,
} from "@/lib/apify/instagram-hashtag-scraper";
import {
  fetchIgPostsByUsername,
  type IgPostScraperResult,
} from "@/lib/apify/instagram-post-scraper";
import type { IgPostRaw } from "@/lib/apify/instagram-shared";
import type { Phase4cStats } from "../types";

type SupaClient = SupabaseClient<Database>;

/**
 * cases.ig_config jsonb 스키마.
 */
export type IgConfig = {
  ig_owned_usernames?: string[];     // brand owned (ninjakitchen, ninjakitchenuk)
  ig_brand_hashtags?: string[];      // (NinjaCREAMI, NinjaSwirl, NinjaPartner)
  ig_brand_regex?: string[];         // caption 매칭 regex (단독 "ninja" 금지)
  ig_author_seeds?: string[];        // 외부 데스크리서치 발견 작성자
  ig_celeb_handles?: string[];       // 셀럽 핸들 (후속 reel-scraper용)
  ig_paid_keywords?: string[];       // paid 시그널 캡션 키워드
  ig_use_reels_type?: boolean;       // hashtag-scraper resultsType="reels"
  // 옵션 — resultsLimit override
  ig_hashtag_results_limit?: number; // default 300
  ig_post_results_limit?: number;    // default 50
};

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

const DEFAULT_HASHTAG_LIMIT = 300;
const DEFAULT_POST_LIMIT = 50;

/**
 * Phase 4c — IG Brand Monitoring
 *
 * 소스:
 *   1. hashtag-scraper × ig_brand_hashtags
 *   2. post-scraper × (ig_owned_usernames + ig_author_seeds) (한 호출)
 *
 * 후처리:
 *   - dedup by ig_id
 *   - brand regex 매칭 → brand_matched
 *   - paid 시그널 추출 → paid_signal
 *   - ig_posts upsert
 *   - ig_authors 재집계 (raw, fans 룩업은 별도 phase)
 *   - ig_runs 적재
 *
 * Graceful skip:
 *   - cases.ig_config 없음 → skip
 *   - hashtags + owned + author_seeds 다 비어있음 → skip
 *   - APIFY_TOKEN 없음 → 각 wrapper에서 skip
 */
export async function runPhase4c(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4cStats> {
  // 1. case ig_config 읽기
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, ig_config")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const cfg = (c.ig_config ?? {}) as IgConfig;
  const owned = cfg.ig_owned_usernames ?? [];
  const hashtags = cfg.ig_brand_hashtags ?? [];
  const seeds = cfg.ig_author_seeds ?? [];
  const brandRegexStrs = cfg.ig_brand_regex ?? [];
  const paidKeywords = cfg.ig_paid_keywords ?? DEFAULT_PAID_KEYWORDS;

  if (hashtags.length === 0 && owned.length === 0 && seeds.length === 0) {
    return emptyStats("ig_config가 비어있음 (hashtags/owned/seeds 모두 0개)");
  }

  // 2. brand regex 컴파일 (invalid면 skip + 디버그)
  const brandRegexes: RegExp[] = [];
  for (const s of brandRegexStrs) {
    try {
      brandRegexes.push(new RegExp(s, "i"));
    } catch {
      // invalid regex 무시 (디버그 위해 stat에 박는 게 좋지만 일단 silent)
    }
  }
  const paidRegex = new RegExp(
    paidKeywords.map(escapeRegex).join("|"),
    "i",
  );

  // 3. 소스 1: hashtag-scraper (있을 때만)
  const runs: IgRunSummary[] = [];
  let hashtagResult: IgHashtagScraperResult | null = null;
  if (hashtags.length > 0) {
    hashtagResult = await fetchIgPostsByHashtag({
      hashtags,
      resultsType: cfg.ig_use_reels_type ? "reels" : "posts",
      resultsLimit: cfg.ig_hashtag_results_limit ?? DEFAULT_HASHTAG_LIMIT,
    });
    runs.push({
      source: "hashtag",
      actor_id: "apify~instagram-hashtag-scraper",
      apify_run_id: hashtagResult.apify_run_id,
      dataset_id: hashtagResult.dataset_id,
      input: {
        hashtags,
        resultsType: cfg.ig_use_reels_type ? "reels" : "posts",
        resultsLimit: cfg.ig_hashtag_results_limit ?? DEFAULT_HASHTAG_LIMIT,
      },
      status: hashtagResult.status,
      items_count: hashtagResult.items.length,
      cost_estimate_usd: hashtagResult.cost_estimate_usd,
    });
  }

  // 4. 소스 2: post-scraper (owned + seeds 통합)
  // 함정 (2026-05-28 SharkNinja): postlearn으로 author_seeds 37명 박힌 후 39명 한 호출
  // 시도하면 Apify timeout 또는 Inngest step fail. 20명씩 batch 처리.
  const usernamesToFetch = Array.from(new Set([...owned, ...seeds]));
  const postResults: IgPostScraperResult[] = [];
  const POST_BATCH_SIZE = 20;
  if (usernamesToFetch.length > 0) {
    for (let i = 0; i < usernamesToFetch.length; i += POST_BATCH_SIZE) {
      const batchUsernames = usernamesToFetch.slice(i, i + POST_BATCH_SIZE);
      const batchResult = await fetchIgPostsByUsername({
        usernames: batchUsernames,
        resultsLimit: cfg.ig_post_results_limit ?? DEFAULT_POST_LIMIT,
      });
      postResults.push(batchResult);
      runs.push({
        source: batchUsernames.every((u) => owned.includes(u))
          ? "owned"
          : "owned_and_seeds",
        actor_id: "apify~instagram-post-scraper",
        apify_run_id: batchResult.apify_run_id,
        dataset_id: batchResult.dataset_id,
        input: {
          usernames: batchUsernames,
          resultsLimit: cfg.ig_post_results_limit ?? DEFAULT_POST_LIMIT,
          batch_index: Math.floor(i / POST_BATCH_SIZE),
        },
        status: batchResult.status,
        items_count: batchResult.items.length,
        cost_estimate_usd: batchResult.cost_estimate_usd,
      });
    }
  }
  // 후속 통합 처리용 — 모든 batch items 합침
  const postResult: IgPostScraperResult | null = postResults.length === 0
    ? null
    : {
        items: postResults.flatMap((r) => r.items),
        cost_estimate_usd: postResults.reduce(
          (s, r) => s + r.cost_estimate_usd,
          0,
        ),
        apify_run_id: postResults[0]?.apify_run_id ?? null,
        dataset_id: postResults[0]?.dataset_id ?? null,
        status: postResults.every((r) => r.status === "SUCCEEDED")
          ? "SUCCEEDED"
          : postResults.find((r) => r.status !== "SUCCEEDED")?.status ?? "MIXED",
        skipped_reason: postResults.find((r) => r.skipped_reason)
          ?.skipped_reason,
      };

  // 5. 통합 + dedup
  type Tagged = { item: IgPostRaw; source: string; run_id: string | null };
  const tagged: Tagged[] = [];
  if (hashtagResult) {
    for (const it of hashtagResult.items) {
      tagged.push({
        item: it,
        source: "hashtag",
        run_id: hashtagResult.apify_run_id,
      });
    }
  }
  if (postResult) {
    for (const it of postResult.items) {
      // source 분류 — owned_usernames에 포함 = owned, 아니면 author_seed
      const src =
        it.owner_username && owned.includes(it.owner_username)
          ? "owned"
          : "author_seed";
      tagged.push({
        item: it,
        source: src,
        run_id: postResult.apify_run_id,
      });
    }
  }

  const seen = new Map<string, Tagged>();
  for (const t of tagged) {
    const key = t.item.ig_id ?? t.item.short_code ?? t.item.url;
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, t);
    }
  }

  // 6. brand 매칭 + paid 추출
  const upserts: PostInsert[] = [];
  let brandMatchedCount = 0;
  let paidCount = 0;
  for (const t of seen.values()) {
    const it = t.item;
    if (!it.ig_id) continue;
    const blob = buildMatchBlob(it);
    const brandMatched =
      matchesBrand(blob, brandRegexes, owned, it.owner_username) ||
      // owned 풀에서 잡힌 건 자동으로 brand_matched
      t.source === "owned" ||
      // author_seed로 직접 추적한 건 author seeding 자체가 brand 관련 시그널이라 자동 매칭
      // (실제 caption 매칭은 별도 분석에서)
      t.source === "author_seed";
    if (brandMatched) brandMatchedCount += 1;

    let paidSignal: string | null = null;
    if (brandMatched && t.source !== "owned") {
      const m = paidRegex.exec(it.caption ?? "");
      if (m) {
        paidSignal = m[0];
        paidCount += 1;
      }
    }

    upserts.push({
      case_id,
      ig_id: it.ig_id,
      short_code: it.short_code ?? it.ig_id,
      url: it.url ?? "",
      owner_username: it.owner_username ?? "(unknown)",
      owner_full_name: it.owner_full_name,
      owner_id: it.owner_id,
      type: it.type,
      caption: it.caption,
      hashtags: it.hashtags,
      mentions: it.mentions,
      likes_count: it.likes_count,
      comments_count: it.comments_count,
      video_play_count: it.video_play_count,
      video_view_count: it.video_view_count,
      video_duration: it.video_duration,
      posted_at: it.posted_at,
      display_url: it.display_url,
      video_url: it.video_url,
      source: t.source,
      brand_matched: brandMatched,
      paid_signal: paidSignal,
      sponsorship_status: it.sponsorship_status,
      apify_run_id: t.run_id,
      raw: it.raw,
    });
  }

  // 7. ig_posts upsert
  if (upserts.length > 0) {
    // batch insert (Supabase 1k cap)
    for (let i = 0; i < upserts.length; i += 500) {
      const batch = upserts.slice(i, i + 500);
      const { error } = await supabase
        .from("ig_posts")
        .upsert(batch as never, { onConflict: "case_id,ig_id" });
      if (error) {
        throw new Error(`ig_posts upsert: ${error.message}`);
      }
    }
  }

  // 8. ig_runs 적재
  if (runs.length > 0) {
    const runInserts = runs
      .filter((r) => r.apify_run_id)
      .map((r) => ({
        case_id,
        source: r.source,
        actor_id: r.actor_id,
        apify_run_id: r.apify_run_id!,
        dataset_id: r.dataset_id,
        input: r.input,
        status: r.status,
        items_count: r.items_count,
        cost_estimate_usd: r.cost_estimate_usd,
        finished_at: new Date().toISOString(),
      }));
    if (runInserts.length > 0) {
      const { error } = await supabase
        .from("ig_runs")
        .upsert(runInserts as never, { onConflict: "case_id,apify_run_id" });
      if (error) {
        throw new Error(`ig_runs upsert: ${error.message}`);
      }
    }
  }

  // 9. ig_authors 재집계 (raw, fans 룩업은 별도 phase)
  await recomputeIgAuthors(supabase, case_id);

  // 10. 작성자 / paid / 메가 분포 (간단 stats)
  const authorStats = await fetchAuthorStats(supabase, case_id);

  const total_cost = runs.reduce(
    (acc, r) => acc + (r.cost_estimate_usd ?? 0),
    0,
  );

  return {
    total_raw: tagged.length,
    total_unique: seen.size,
    total_brand_matched: brandMatchedCount,
    total_paid_signal: paidCount,
    unique_authors: authorStats.unique,
    top_authors_preview: authorStats.top,
    by_source: {
      hashtag: hashtagResult?.items.length ?? 0,
      owned_and_seeds: postResult?.items.length ?? 0,
    },
    runs: runs.map((r) => ({
      source: r.source,
      apify_run_id: r.apify_run_id,
      status: r.status,
      items_count: r.items_count,
      cost_estimate_usd: r.cost_estimate_usd,
    })),
    cost_actual_usd: total_cost,
    computed_at: new Date().toISOString(),
  };
}

// ─── helpers ───────────────────────────────────────────────

type IgRunSummary = {
  source: string;
  actor_id: string;
  apify_run_id: string | null;
  dataset_id: string | null;
  input: unknown;
  status: string;
  items_count: number;
  cost_estimate_usd: number;
};

type PostInsert = {
  case_id: string;
  ig_id: string;
  short_code: string;
  url: string;
  owner_username: string;
  owner_full_name: string | null;
  owner_id: string | null;
  type: string | null;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  likes_count: number | null;
  comments_count: number | null;
  video_play_count: number | null;
  video_view_count: number | null;
  video_duration: number | null;
  posted_at: string | null;
  display_url: string | null;
  video_url: string | null;
  source: string;
  brand_matched: boolean;
  paid_signal: string | null;
  sponsorship_status: string | null;
  apify_run_id: string | null;
  raw: unknown;
};

function emptyStats(skipped_reason: string): Phase4cStats {
  return {
    total_raw: 0,
    total_unique: 0,
    total_brand_matched: 0,
    total_paid_signal: 0,
    unique_authors: 0,
    top_authors_preview: [],
    by_source: {},
    runs: [],
    cost_actual_usd: 0,
    skipped_reason,
    computed_at: new Date().toISOString(),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatchBlob(it: IgPostRaw): string {
  return [
    it.caption ?? "",
    (it.hashtags ?? []).join(" "),
    (it.mentions ?? []).join(" "),
    `@${it.owner_username ?? ""}`,
  ].join(" ");
}

function matchesBrand(
  blob: string,
  regexes: RegExp[],
  owned: string[],
  owner: string | null,
): boolean {
  if (owner && owned.includes(owner)) return true;
  for (const r of regexes) {
    if (r.test(blob)) return true;
  }
  return false;
}

async function recomputeIgAuthors(
  supabase: SupaClient,
  case_id: string,
): Promise<void> {
  // ig_posts에서 작성자별 집계 후 ig_authors upsert.
  // Postgres에서 한 번에 처리하려면 SQL function 또는 jsonb aggregate. 일단 raw fetch + JS aggregate.
  const { data, error } = await supabase
    .from("ig_posts")
    .select(
      "owner_username, owner_full_name, owner_id, brand_matched, paid_signal, likes_count, video_play_count, posted_at",
    )
    .eq("case_id", case_id);
  if (error) {
    throw new Error(`ig_authors recompute fetch: ${error.message}`);
  }

  type Agg = {
    full_name: string | null;
    owner_id: string | null;
    total: number;
    brand: number;
    paid: number;
    max_likes: number | null;
    max_views: number | null;
    total_likes: number;
    first: string | null;
    last: string | null;
  };
  const byAuthor = new Map<string, Agg>();
  for (const row of data ?? []) {
    if (!row.owner_username) continue;
    let a = byAuthor.get(row.owner_username);
    if (!a) {
      a = {
        full_name: row.owner_full_name,
        owner_id: row.owner_id,
        total: 0,
        brand: 0,
        paid: 0,
        max_likes: null,
        max_views: null,
        total_likes: 0,
        first: null,
        last: null,
      };
      byAuthor.set(row.owner_username, a);
    }
    a.total += 1;
    if (row.brand_matched) a.brand += 1;
    if (row.paid_signal) a.paid += 1;
    if (row.likes_count != null) {
      a.total_likes += row.likes_count;
      if (a.max_likes == null || row.likes_count > a.max_likes) {
        a.max_likes = row.likes_count;
      }
    }
    if (row.video_play_count != null) {
      if (a.max_views == null || row.video_play_count > a.max_views) {
        a.max_views = row.video_play_count;
      }
    }
    if (row.posted_at) {
      if (!a.first || row.posted_at < a.first) a.first = row.posted_at;
      if (!a.last || row.posted_at > a.last) a.last = row.posted_at;
    }
  }

  const upserts = Array.from(byAuthor.entries()).map(([username, a]) => ({
    case_id,
    username,
    full_name: a.full_name,
    owner_id: a.owner_id,
    total_posts: a.total,
    brand_matched_posts: a.brand,
    paid_posts: a.paid,
    max_likes: a.max_likes,
    max_views: a.max_views,
    total_likes: a.total_likes,
    first_seen_at: a.first,
    last_seen_at: a.last,
    computed_at: new Date().toISOString(),
  }));

  if (upserts.length === 0) return;
  for (let i = 0; i < upserts.length; i += 500) {
    const batch = upserts.slice(i, i + 500);
    const { error: upErr } = await supabase
      .from("ig_authors")
      .upsert(batch as never, { onConflict: "case_id,username" });
    if (upErr) {
      throw new Error(`ig_authors upsert: ${upErr.message}`);
    }
  }
}

async function fetchAuthorStats(
  supabase: SupaClient,
  case_id: string,
): Promise<{
  unique: number;
  top: Array<{
    username: string;
    total_posts: number;
    brand_matched_posts: number;
    paid_posts: number;
    max_likes: number | null;
  }>;
}> {
  const { count } = await supabase
    .from("ig_authors")
    .select("username", { count: "exact", head: true })
    .eq("case_id", case_id);

  const { data: top } = await supabase
    .from("ig_authors")
    .select("username, total_posts, brand_matched_posts, paid_posts, max_likes")
    .eq("case_id", case_id)
    .order("max_likes", { ascending: false, nullsFirst: false })
    .limit(20);

  return {
    unique: count ?? 0,
    top: (top ?? []).map((t) => ({
      username: t.username,
      total_posts: t.total_posts ?? 0,
      brand_matched_posts: t.brand_matched_posts ?? 0,
      paid_posts: t.paid_posts ?? 0,
      max_likes: t.max_likes,
    })),
  };
}
