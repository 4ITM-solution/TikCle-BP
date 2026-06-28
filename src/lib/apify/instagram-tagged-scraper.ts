/**
 * Apify apify/instagram-tagged-scraper ("Instagram Mentions Scraper") 호출 래퍼.
 * Actor ID: zTSjdcGqjg6KEIBlt — 멘션/태그 전용 (범용 scraper보다 정확).
 *
 * Phase 4c (IG brand monitoring) 의 소스 3 (mention/tagged).
 *   - 남이 브랜드 계정을 태그/멘션한 글 (IG "태그됨" 피드 전용 수집)
 *   - input: { username: [...], resultsLimit } — username당 태그된 글
 *
 * 한계:
 *   - IG "태그됨" 탭에 노출되는 글만 (비공개/숨김 태그는 제외)
 */

import {
  type IgPostRaw,
  type StepLike,
  mapIgRawToPost,
  runApifyActor,
  runApifyActorDurable,
} from "@/lib/apify/instagram-shared";

const ACTOR_ID = "apify~instagram-tagged-scraper";
const COST_PER_RESULT = 0.0023;

export type IgTaggedScraperInput = {
  usernames: string[]; // @ 없이 — 이 계정들이 "태그된" 글 수집
  resultsLimit?: number; // 계정당 (default 200)
};

export type IgTaggedScraperResult = {
  items: IgPostRaw[];
  cost_estimate_usd: number;
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

export async function fetchIgPostsByTagged(
  opts: IgTaggedScraperInput,
  durable?: { step: StepLike; label: string },
): Promise<IgTaggedScraperResult> {
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
  if (opts.usernames.length === 0) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "usernames 0개",
    };
  }

  const input = {
    username: opts.usernames.map((u) => u.replace(/^@/, "")),
    resultsLimit: opts.resultsLimit ?? 200,
  };

  const run = durable
    ? await runApifyActorDurable(durable.step, durable.label, ACTOR_ID, input, token)
    : await runApifyActor(ACTOR_ID, input, token);

  return {
    items: run.items.map(mapIgRawToPost),
    cost_estimate_usd: run.items.length * COST_PER_RESULT,
    apify_run_id: run.apify_run_id,
    dataset_id: run.dataset_id,
    status: run.status,
    skipped_reason: run.skipped_reason,
  };
}
