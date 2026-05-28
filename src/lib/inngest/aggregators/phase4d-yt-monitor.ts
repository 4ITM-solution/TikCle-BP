import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchYtByChannel,
  fetchYtBySearch,
  type YtScraperResult,
} from "@/lib/apify/youtube-scraper";
import type { YtVideoRaw } from "@/lib/apify/youtube-shared";
import type { Phase4dStats } from "../types";

type SupaClient = SupabaseClient<Database>;

/**
 * cases.yt_config jsonb 스키마 (ig_config와 패턴 유사).
 */
export type YtConfig = {
  yt_owned_channels?: string[];         // 채널 URL (https://www.youtube.com/@ninjakitchen)
  yt_brand_keywords?: string[];         // 검색 keyword (예: ["ninja kitchen", "ninja blender"])
  yt_brand_regex?: string[];            // title/description 매칭 regex
  yt_author_seeds?: string[];           // 외부 데스크리서치 발견 채널 URL
  yt_celeb_handles?: string[];          // 셀럽 채널 URL
  yt_paid_keywords?: string[];          // paid 시그널 caption 키워드
  yt_max_videos?: number;               // long-form 호출당 limit
  yt_max_shorts?: number;               // Shorts 호출당 limit
};

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

const DEFAULT_MAX_VIDEOS = 30;
const DEFAULT_MAX_SHORTS = 30;
const CHANNEL_BATCH_SIZE = 5; // YT는 IG보다 batch size 작게 (channel deep dive 비싸)

/**
 * Phase 4d — YouTube Brand Monitoring
 *
 * 소스:
 *   1. searchQueries × yt_brand_keywords (UGC + 일반 검색)
 *   2. channel × (yt_owned_channels + yt_author_seeds) (deep dive)
 *
 * 후처리:
 *   - dedup by yt_id
 *   - brand regex 매칭 → brand_matched
 *   - paid 시그널 추출 (caption + monetizationStatus)
 *   - yt_videos / yt_channels 정규화 적재
 */
export async function runPhase4d(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4dStats> {
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id, yt_config")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const cfg = (c.yt_config ?? {}) as YtConfig;
  const owned = cfg.yt_owned_channels ?? [];
  const keywords = cfg.yt_brand_keywords ?? [];
  const seeds = cfg.yt_author_seeds ?? [];
  const brandRegexStrs = cfg.yt_brand_regex ?? [];
  const paidKeywords = cfg.yt_paid_keywords ?? DEFAULT_PAID_KEYWORDS;

  if (
    owned.length === 0 &&
    keywords.length === 0 &&
    seeds.length === 0
  ) {
    return emptyStats("yt_config 비어있음 (owned/keywords/seeds 모두 0)");
  }

  const brandRegexes: RegExp[] = [];
  for (const s of brandRegexStrs) {
    try {
      brandRegexes.push(new RegExp(s, "i"));
    } catch {
      /* invalid regex 무시 */
    }
  }
  const paidRegex = new RegExp(
    paidKeywords.map(escapeRegex).join("|"),
    "i",
  );

  const runs: YtRunSummary[] = [];

  // 소스 1: searchQueries
  let searchResult: YtScraperResult | null = null;
  if (keywords.length > 0) {
    searchResult = await fetchYtBySearch({
      searchQueries: keywords,
      maxResults: cfg.yt_max_videos ?? DEFAULT_MAX_VIDEOS,
      maxResultsShorts: cfg.yt_max_shorts ?? DEFAULT_MAX_SHORTS,
    });
    runs.push({
      source: "search",
      actor_id: "streamers~youtube-scraper",
      apify_run_id: searchResult.apify_run_id,
      dataset_id: searchResult.dataset_id,
      input: {
        searchQueries: keywords,
        maxResults: cfg.yt_max_videos ?? DEFAULT_MAX_VIDEOS,
        maxResultsShorts: cfg.yt_max_shorts ?? DEFAULT_MAX_SHORTS,
      },
      status: searchResult.status,
      items_count: searchResult.items.length,
      cost_estimate_usd: searchResult.cost_estimate_usd,
    });
  }

  // 소스 2: channel deep dive (owned + author_seeds) — batch 5씩
  const channelsToFetch = Array.from(new Set([...owned, ...seeds]));
  const channelResults: YtScraperResult[] = [];
  if (channelsToFetch.length > 0) {
    for (let i = 0; i < channelsToFetch.length; i += CHANNEL_BATCH_SIZE) {
      const batchUrls = channelsToFetch.slice(i, i + CHANNEL_BATCH_SIZE);
      const batchResult = await fetchYtByChannel({
        channelUrls: batchUrls,
        maxResults: cfg.yt_max_videos ?? DEFAULT_MAX_VIDEOS,
        maxResultsShorts: cfg.yt_max_shorts ?? DEFAULT_MAX_SHORTS,
      });
      channelResults.push(batchResult);
      runs.push({
        source: batchUrls.every((u) => owned.includes(u))
          ? "owned"
          : "owned_and_seeds",
        actor_id: "streamers~youtube-scraper",
        apify_run_id: batchResult.apify_run_id,
        dataset_id: batchResult.dataset_id,
        input: {
          channelUrls: batchUrls,
          maxResults: cfg.yt_max_videos ?? DEFAULT_MAX_VIDEOS,
          maxResultsShorts: cfg.yt_max_shorts ?? DEFAULT_MAX_SHORTS,
          batch_index: Math.floor(i / CHANNEL_BATCH_SIZE),
        },
        status: batchResult.status,
        items_count: batchResult.items.length,
        cost_estimate_usd: batchResult.cost_estimate_usd,
      });
    }
  }

  // 통합 + dedup
  type Tagged = { item: YtVideoRaw; source: string; run_id: string | null };
  const tagged: Tagged[] = [];
  if (searchResult) {
    for (const it of searchResult.items) {
      tagged.push({
        item: it,
        source: "search",
        run_id: searchResult.apify_run_id,
      });
    }
  }
  for (const cr of channelResults) {
    for (const it of cr.items) {
      const src =
        it.channel_url && owned.includes(it.channel_url) ? "owned" : "author_seed";
      tagged.push({
        item: it,
        source: src,
        run_id: cr.apify_run_id,
      });
    }
  }

  const seen = new Map<string, Tagged>();
  for (const t of tagged) {
    const key = t.item.yt_id;
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, t);
  }

  // brand 매칭 + paid 추출
  const upserts: VideoInsert[] = [];
  let brandMatched = 0;
  let paidCount = 0;
  for (const t of seen.values()) {
    const it = t.item;
    if (!it.yt_id) continue;

    const blob = [
      it.title ?? "",
      it.description ?? "",
      (it.hashtags ?? []).join(" "),
      it.channel_name ?? "",
    ].join(" ");

    const isBrand =
      matchesBrand(blob, brandRegexes, owned, it.channel_url) ||
      t.source === "owned" ||
      t.source === "author_seed";
    if (isBrand) brandMatched += 1;

    // paid 시그널: caption 매칭 또는 monetizationStatus (YouTube 자체 라벨)
    let paidSignal: string | null = null;
    if (isBrand && t.source !== "owned") {
      const captionMatch = paidRegex.exec(
        `${it.title ?? ""} ${it.description ?? ""}`,
      );
      if (captionMatch) {
        paidSignal = captionMatch[0];
      } else if (
        it.monetization_status &&
        ["paid_promotion", "sponsored", "paid"].some((s) =>
          it.monetization_status!.toLowerCase().includes(s),
        )
      ) {
        paidSignal = it.monetization_status;
      }
      if (paidSignal) paidCount += 1;
    }

    upserts.push({
      case_id,
      yt_id: it.yt_id,
      url: it.url ?? "",
      type: it.type,
      channel_name: it.channel_name ?? "(unknown)",
      channel_id: it.channel_id,
      channel_url: it.channel_url,
      subscriber_count: it.subscriber_count,
      title: it.title,
      description: it.description,
      hashtags: it.hashtags,
      view_count: it.view_count,
      like_count: it.like_count,
      comment_count: it.comment_count,
      duration_seconds: it.duration_seconds,
      uploaded_at: it.uploaded_at,
      thumbnail_url: it.thumbnail_url,
      source: t.source,
      brand_matched: isBrand,
      paid_signal: paidSignal,
      monetization_status: it.monetization_status,
      is_short: it.is_short,
      apify_run_id: t.run_id,
      raw: it.raw,
    });
  }

  if (upserts.length > 0) {
    for (let i = 0; i < upserts.length; i += 500) {
      const batch = upserts.slice(i, i + 500);
      const { error } = await supabase
        .from("yt_videos")
        .upsert(batch as never, { onConflict: "case_id,yt_id" });
      if (error) throw new Error(`yt_videos upsert: ${error.message}`);
    }
  }

  // runs 적재
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
        .from("yt_runs")
        .upsert(runInserts as never, { onConflict: "case_id,apify_run_id" });
      if (error) throw new Error(`yt_runs upsert: ${error.message}`);
    }
  }

  // yt_channels 재집계
  await recomputeYtChannels(supabase, case_id);
  const channelStats = await fetchChannelStats(supabase, case_id);

  const total_cost = runs.reduce(
    (acc, r) => acc + (r.cost_estimate_usd ?? 0),
    0,
  );

  return {
    total_raw: tagged.length,
    total_unique: seen.size,
    total_brand_matched: brandMatched,
    total_paid_signal: paidCount,
    unique_channels: channelStats.unique,
    top_channels_preview: channelStats.top,
    by_source: {
      search: searchResult?.items.length ?? 0,
      owned_and_seeds: channelResults.reduce((s, r) => s + r.items.length, 0),
    },
    by_type: {
      video: upserts.filter((u) => u.type === "video").length,
      short: upserts.filter((u) => u.type === "short").length,
      stream: upserts.filter((u) => u.type === "stream").length,
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

// helpers

type YtRunSummary = {
  source: string;
  actor_id: string;
  apify_run_id: string | null;
  dataset_id: string | null;
  input: unknown;
  status: string;
  items_count: number;
  cost_estimate_usd: number;
};

type VideoInsert = {
  case_id: string;
  yt_id: string;
  url: string;
  type: string | null;
  channel_name: string;
  channel_id: string | null;
  channel_url: string | null;
  subscriber_count: number | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  uploaded_at: string | null;
  thumbnail_url: string | null;
  source: string;
  brand_matched: boolean;
  paid_signal: string | null;
  monetization_status: string | null;
  is_short: boolean | null;
  apify_run_id: string | null;
  raw: unknown;
};

function emptyStats(skipped_reason: string): Phase4dStats {
  return {
    total_raw: 0,
    total_unique: 0,
    total_brand_matched: 0,
    total_paid_signal: 0,
    unique_channels: 0,
    top_channels_preview: [],
    by_source: {},
    by_type: { video: 0, short: 0, stream: 0 },
    runs: [],
    cost_actual_usd: 0,
    skipped_reason,
    computed_at: new Date().toISOString(),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesBrand(
  blob: string,
  regexes: RegExp[],
  owned: string[],
  channelUrl: string | null,
): boolean {
  if (channelUrl && owned.includes(channelUrl)) return true;
  for (const r of regexes) {
    if (r.test(blob)) return true;
  }
  return false;
}

async function recomputeYtChannels(
  supabase: SupaClient,
  case_id: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("yt_videos")
    .select(
      "channel_name, channel_id, channel_url, subscriber_count, brand_matched, paid_signal, view_count, type, uploaded_at",
    )
    .eq("case_id", case_id);
  if (error) throw new Error(`yt_channels recompute fetch: ${error.message}`);

  type Agg = {
    channel_id: string | null;
    channel_url: string | null;
    subscriber_count: number | null;
    total: number;
    brand: number;
    paid: number;
    shorts: number;
    longform: number;
    max_views: number | null;
    total_views: number;
    first: string | null;
    last: string | null;
  };
  const byChannel = new Map<string, Agg>();
  for (const row of data ?? []) {
    if (!row.channel_name) continue;
    let a = byChannel.get(row.channel_name);
    if (!a) {
      a = {
        channel_id: row.channel_id,
        channel_url: row.channel_url,
        subscriber_count: row.subscriber_count,
        total: 0,
        brand: 0,
        paid: 0,
        shorts: 0,
        longform: 0,
        max_views: null,
        total_views: 0,
        first: null,
        last: null,
      };
      byChannel.set(row.channel_name, a);
    }
    a.total += 1;
    if (row.brand_matched) a.brand += 1;
    if (row.paid_signal) a.paid += 1;
    if (row.type === "short") a.shorts += 1;
    else a.longform += 1;
    if (row.view_count != null) {
      a.total_views += row.view_count;
      if (a.max_views == null || row.view_count > a.max_views) {
        a.max_views = row.view_count;
      }
    }
    if (row.subscriber_count != null && a.subscriber_count == null) {
      a.subscriber_count = row.subscriber_count;
    }
    if (row.uploaded_at) {
      if (!a.first || row.uploaded_at < a.first) a.first = row.uploaded_at;
      if (!a.last || row.uploaded_at > a.last) a.last = row.uploaded_at;
    }
  }

  const upserts = Array.from(byChannel.entries()).map(([channel_name, a]) => ({
    case_id,
    channel_name,
    channel_id: a.channel_id,
    channel_url: a.channel_url,
    subscriber_count: a.subscriber_count,
    total_videos: a.total,
    brand_matched_videos: a.brand,
    paid_videos: a.paid,
    shorts_count: a.shorts,
    longform_count: a.longform,
    max_views: a.max_views,
    total_views: a.total_views,
    first_seen_at: a.first,
    last_seen_at: a.last,
    computed_at: new Date().toISOString(),
  }));

  if (upserts.length === 0) return;
  for (let i = 0; i < upserts.length; i += 500) {
    const batch = upserts.slice(i, i + 500);
    const { error: upErr } = await supabase
      .from("yt_channels")
      .upsert(batch as never, { onConflict: "case_id,channel_name" });
    if (upErr) throw new Error(`yt_channels upsert: ${upErr.message}`);
  }
}

async function fetchChannelStats(
  supabase: SupaClient,
  case_id: string,
): Promise<{
  unique: number;
  top: Array<{
    channel_name: string;
    total_videos: number;
    paid_videos: number;
    max_views: number | null;
    subscriber_count: number | null;
  }>;
}> {
  const { count } = await supabase
    .from("yt_channels")
    .select("channel_name", { count: "exact", head: true })
    .eq("case_id", case_id);

  const { data: top } = await supabase
    .from("yt_channels")
    .select("channel_name, total_videos, paid_videos, max_views, subscriber_count")
    .eq("case_id", case_id)
    .order("max_views", { ascending: false, nullsFirst: false })
    .limit(20);

  return {
    unique: count ?? 0,
    top: (top ?? []).map((t) => ({
      channel_name: t.channel_name,
      total_videos: t.total_videos ?? 0,
      paid_videos: t.paid_videos ?? 0,
      max_views: t.max_views,
      subscriber_count: t.subscriber_count,
    })),
  };
}
