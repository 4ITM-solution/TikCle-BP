/**
 * Apify streamers/youtube-scraper 호출 래퍼.
 * 단가: $2.40 / 1,000 videos
 *
 * Phase 4d 의 2가지 소스:
 *   1. searchQueries — brand keyword 검색 (search)
 *   2. startUrls — channel deep dive (owned + author seeds)
 *
 * 출력 특징 (IG 대비):
 *   - monetizationStatus 라벨이 IG보다 잘 노출 (paid 시그널 정확)
 *   - Shorts vs long-form 자동 분리 (type 필드)
 *   - subscriber_count 직접 잡힘 (IG followers와 다름 — YT는 정확)
 *   - transcript 가능 (downloadSubtitles=true)
 */

import {
  type YtVideoRaw,
  mapYtRawToVideo,
  runYtActor,
} from "@/lib/apify/youtube-shared";

const ACTOR_ID = "streamers~youtube-scraper";
const COST_PER_RESULT = 0.0024;

export type YtSearchInput = {
  searchQueries: string[];
  maxResults?: number;
  maxResultsShorts?: number;
};

export type YtChannelInput = {
  channelUrls: string[];                // 채널 URL (https://www.youtube.com/@ninjakitchen)
  maxResults?: number;
  maxResultsShorts?: number;
};

export type YtScraperResult = {
  items: YtVideoRaw[];
  cost_estimate_usd: number;
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

/**
 * 키워드 search — IG의 hashtag-scraper와 유사 역할.
 * brand 일반 검색 풀 잡음 (UGC 포함).
 */
export async function fetchYtBySearch(
  opts: YtSearchInput,
): Promise<YtScraperResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }
  if (opts.searchQueries.length === 0) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "searchQueries 0개",
    };
  }

  const input = {
    searchQueries: opts.searchQueries,
    maxResults: opts.maxResults ?? 30,
    maxResultsShorts: opts.maxResultsShorts ?? 30,
    sortingOrder: "relevance" as const,
  };

  const run = await runYtActor(ACTOR_ID, input, token);

  return {
    items: run.items.map(mapYtRawToVideo),
    cost_estimate_usd: run.items.length * COST_PER_RESULT,
    apify_run_id: run.apify_run_id,
    dataset_id: run.dataset_id,
    status: run.status,
    skipped_reason: run.skipped_reason,
  };
}

/**
 * 채널 deep dive — IG의 post-scraper와 유사 역할.
 * owned 채널 + author_seed 채널 정조준.
 */
export async function fetchYtByChannel(
  opts: YtChannelInput,
): Promise<YtScraperResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }
  if (opts.channelUrls.length === 0) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "channelUrls 0개",
    };
  }

  const input = {
    startUrls: opts.channelUrls.map((url) => ({ url })),
    maxResults: opts.maxResults ?? 30,
    maxResultsShorts: opts.maxResultsShorts ?? 30,
    sortVideosBy: "NEWEST" as const,
  };

  const run = await runYtActor(ACTOR_ID, input, token);

  return {
    items: run.items.map(mapYtRawToVideo),
    cost_estimate_usd: run.items.length * COST_PER_RESULT,
    apify_run_id: run.apify_run_id,
    dataset_id: run.dataset_id,
    status: run.status,
    skipped_reason: run.skipped_reason,
  };
}
