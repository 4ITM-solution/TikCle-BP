/**
 * 모델별 토큰 단가 + 태깅 모델 티어링 설정 (WS3 §3.4).
 *
 * 원칙: 닫힌 라벨 분류(영상/광고 태깅, 클러스터 pass1) = Haiku 4.5,
 *       개방형 통합·명명(클러스터 pass2/3, SKU 매칭) = Sonnet.
 *
 * 태깅 모델은 `BP_TAGGING_MODEL` env로 override 가능 (fallback: Haiku 4.5).
 * 단가는 모델명에 "haiku"가 있으면 Haiku, 아니면 Sonnet으로 자동 선택하므로
 * override해도 비용 로그가 맞는다.
 */

/** 닫힌 라벨 분류용 태깅 모델.
 * ⚠️ 2026-07-07 게이트 결과 Haiku 전환 보류 — 광고 85%(<90%), 영상은 커버 URL 만료로
 * 비교 오염(n=8). 기본값 Sonnet 유지, Haiku 재도전은 게이트 스크립트 수정
 * (재호스트 이미지 + 표본 30+) 후 BP_TAGGING_MODEL env로. */
export const TAGGING_MODEL =
  process.env.BP_TAGGING_MODEL || "claude-sonnet-4-6";

/** 개방형 통합·명명용 모델 (Sonnet 유지). */
export const SONNET_MODEL = "claude-sonnet-4-6";

const M = 1_000_000;

type Rates = {
  input: number;
  cache_read: number;
  cache_write: number;
  output: number;
};

// USD per 1M tokens.
const SONNET_RATES: Rates = { input: 3, cache_read: 0.3, cache_write: 3.75, output: 15 };
const HAIKU_RATES: Rates = { input: 1, cache_read: 0.1, cache_write: 1.25, output: 5 };

export function ratesForModel(model: string): Rates {
  return /haiku/i.test(model) ? HAIKU_RATES : SONNET_RATES;
}

/** clusterer 스타일 usage({input,output,cache_read,cache_write}) 비용. */
export function calcCost(
  u: { input: number; output: number; cache_read: number; cache_write: number },
  model: string,
): number {
  const r = ratesForModel(model);
  return (
    (u.input * r.input) / M +
    (u.cache_read * r.cache_read) / M +
    (u.cache_write * r.cache_write) / M +
    (u.output * r.output) / M
  );
}

/** vision/ad tagger 스타일 usage(tokens_* 필드) 비용. */
export function calcTaggingCost(
  opts: {
    tokens_input: number;
    tokens_output: number;
    tokens_cache_read: number;
    tokens_cache_write: number;
  },
  model: string,
): number {
  return calcCost(
    {
      input: opts.tokens_input,
      output: opts.tokens_output,
      cache_read: opts.tokens_cache_read,
      cache_write: opts.tokens_cache_write,
    },
    model,
  );
}
