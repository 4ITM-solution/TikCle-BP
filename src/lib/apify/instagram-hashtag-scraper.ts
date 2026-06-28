/**
 * Apify apify/instagram-hashtag-scraper 호출 래퍼.
 * 단가: $1.90 / 1,000 results
 *
 * Phase 4c (IG brand monitoring) 의 소스 1.
 *   resultsType: "posts" (image+video) 또는 "reels" (영상만, IG 검색 reels 탭에 가까움)
 *
 * 한계 (2026-05-28 검증):
 *   - IG 검색 reels 탭 결과는 100% 재현 못 함 (alg 차이)
 *   - resultsType="reels" 가 더 가깝지만 여전히 일부만
 *   - 셀럽이 brand hashtag 안 달면 못 잡음 → author seeding 필수
 */

import {
  type IgPostRaw,
  type StepLike,
  mapIgRawToPost,
  runApifyActor,
  runApifyActorDurable,
} from "@/lib/apify/instagram-shared";

const ACTOR_ID = "apify~instagram-hashtag-scraper";
const COST_PER_RESULT = 0.0019;

export type IgHashtagScraperInput = {
  hashtags: string[];           // #는 없이 (NinjaCREAMI)
  resultsLimit?: number;        // hashtag당 (default 300)
  resultsType?: "posts" | "reels"; // default "posts"
};

export type IgHashtagScraperResult = {
  items: IgPostRaw[];
  cost_estimate_usd: number;
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

export async function fetchIgPostsByHashtag(
  opts: IgHashtagScraperInput,
  durable?: { step: StepLike; label: string },
): Promise<IgHashtagScraperResult> {
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
  // 해시태그 정제 — Apify hashtag-scraper는 #·공백·특수문자(!?.,:;-+=*&%$#@/~^|<>()[]{}"'` 등)를
  // 거부함. 하나라도 걸리면 400으로 phase4c 전체가 실패하므로, 보내기 전 금지문자 제거 + 빈값 드롭.
  const cleanHashtags = [
    ...new Set(
      opts.hashtags
        .map((h) =>
          (h ?? "")
            .replace(/[\s!?.,:;+=*&%$#@~^|<>(){}"'`\-/\\[\]]/g, ""),
        )
        .filter((h) => h.length > 0),
    ),
  ];
  if (cleanHashtags.length === 0) {
    return {
      items: [],
      cost_estimate_usd: 0,
      apify_run_id: null,
      dataset_id: null,
      status: "SKIPPED",
      skipped_reason: "hashtags 0개 (정제 후)",
    };
  }

  const input = {
    hashtags: cleanHashtags,
    resultsType: opts.resultsType ?? "posts",
    resultsLimit: opts.resultsLimit ?? 300,
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
