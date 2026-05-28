/**
 * Apify apify/instagram-post-scraper 호출 래퍼.
 * 단가: $1.00 / 1,000 posts (paid plan)
 *
 * Phase 4c (IG brand monitoring) 의 소스 3 (owned) + 소스 4 (author seed/celeb).
 *   - owned: username = brand owned 계정 (ninjakitchen 등)
 *   - author seed: 외부 데스크리서치 발견 작성자 (haleyybaylee 등)
 *
 * 출력 한계 (2026-05-28 검증):
 *   - paid partnership 라벨 안 줌 → caption regex 매칭 우회
 *   - 최근 3-6개월만 잡힘 (resultsLimit 깊이 제한)
 */

import {
  type IgPostRaw,
  mapIgRawToPost,
  runApifyActor,
} from "@/lib/apify/instagram-shared";

const ACTOR_ID = "apify~instagram-post-scraper";
const COST_PER_RESULT = 0.001;

export type IgPostScraperInput = {
  usernames: string[];          // 호출 대상 계정
  resultsLimit?: number;        // 계정당 post 수 (default 100)
};

export type IgPostScraperResult = {
  items: IgPostRaw[];
  cost_estimate_usd: number;
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

export async function fetchIgPostsByUsername(
  opts: IgPostScraperInput,
): Promise<IgPostScraperResult> {
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
    username: opts.usernames,
    resultsLimit: opts.resultsLimit ?? 100,
  };

  const run = await runApifyActor(ACTOR_ID, input, token);

  return {
    items: run.items.map(mapIgRawToPost),
    cost_estimate_usd: run.items.length * COST_PER_RESULT,
    apify_run_id: run.apify_run_id,
    dataset_id: run.dataset_id,
    status: run.status,
    skipped_reason: run.skipped_reason,
  };
}
