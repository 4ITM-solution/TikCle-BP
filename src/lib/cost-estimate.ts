/**
 * 케이스 데이터 기반 분석 비용 추정.
 * Server에서 계산 → client 컴포넌트로 prop 전달 → confirm dialog에서 표시.
 */

const COST_PER_AD = 0.00075;
const ADS_CAP = 1000;
const ADS_PER_URL_AVG = 200;

const COST_PER_TIKTOK_RESULT = 0.0017;
const SAMPLE_SIZE = 300;
// Phase 3.5 — 외부 DB에 없는 unknown 인플 fans 폴백
// 케이스 크기에 따라 변동, 보수적 max cap
const PHASE35_MAX_UNKNOWNS = 5000;
// Phase 1.5 (TikTok Shop scrape) — pro100chok는 구독 정액제 ($20/월).
// 케이스당 marginal cost ≈ $0 (구독 분담 무시). 표시는 "정액제"로.
const PHASE15_MAX_PRODUCTS = 1000;
// Phase 3.7 (Shop Creator 판별) — lemur ~$0.005/check (mockup 기준)
const PHASE37_MAX_HANDLES = 500;
const PHASE37_COST_PER_CHECK = 0.005;
// Sonnet Vision 평균 비용 (캐싱 포함, 1 cover image + 캡션 + ASR 기준)
const VISION_COST_PER_VIDEO = 0.012;
// 3-pass 클러스터링 (Sonnet) — 케이스당 고정 비용
const CLUSTER_COST_PER_CASE = 0.6;
// SKU 매칭 — 화면 노출 영상 한정 (샘플 top 12 + 메타 클러스터별 top 3, ≈ 30 영상)
// 영상당 ~$0.013 (caption + ASR + cover + vision tags + 카탈로그)
const SKU_MATCH_VIDEOS_AVG = 30;
const SKU_MATCH_COST_PER_VIDEO = 0.013;

export type CostEstimate = {
  phase1_5: {
    enabled: boolean;
    skip_reason?: string;
    max_products: number;
    max_cost_usd: number;
  };
  phase35: {
    enabled: boolean;
    skip_reason?: string;
    max_unknowns: number;
    max_cost_usd: number;
  };
  phase37: {
    enabled: boolean;
    skip_reason?: string;
    max_handles: number;
    max_cost_usd: number;
  };
  phase4a: {
    enabled: boolean;
    skip_reason?: string;
    url_count: number;
    estimated_ads: number;
    max_cost_usd: number;
  };
  phase4b_asr: {
    enabled: boolean;
    skip_reason?: string;
    estimated_videos: number;
    max_cost_usd: number;
  };
  phase4b_vision: {
    enabled: boolean;
    skip_reason?: string;
    estimated_videos: number;
    max_cost_usd: number;
  };
  phase4b_clusters: {
    enabled: boolean;
    skip_reason?: string;
    max_cost_usd: number;
  };
  phase4b_sku: {
    enabled: boolean;
    skip_reason?: string;
    estimated_videos: number;
    max_cost_usd: number;
  };
  total_max_usd: number;
  preview_text: string;
};

export function estimateCost(opts: {
  channel: string;
  brand_keyword: string | null;
  brand_meta_pages: string[] | null;
  tiktok_shop_store_url?: string | null;
  hasApifyToken: boolean;
  hasAnthropicKey?: boolean;
}): CostEstimate {
  // Phase 1.5 — tiktok_shop 채널만, APIFY_TOKEN + store URL 필요
  const isTiktokShop = opts.channel === "tiktok_shop";
  let p15_skip: string | undefined;
  if (!isTiktokShop) {
    p15_skip = "tiktok_shop 채널 아님";
  } else if (!opts.hasApifyToken) {
    p15_skip = "APIFY_TOKEN 미설정";
  } else if (!opts.tiktok_shop_store_url) {
    p15_skip = "스토어 URL 비어있음";
  }
  const p15_enabled = !p15_skip;
  // 구독 정액제이므로 case당 marginal cost = 0
  const p15_cost = 0;

  // Phase 3.5 — APIFY_TOKEN 필요
  let p35_skip: string | undefined;
  if (!opts.hasApifyToken) {
    p35_skip = "APIFY_TOKEN 미설정";
  }
  const p35_enabled = !p35_skip;
  const p35_cost = p35_enabled
    ? PHASE35_MAX_UNKNOWNS * COST_PER_TIKTOK_RESULT
    : 0;

  // Phase 3.7 — tiktok_shop 채널만, APIFY_TOKEN 필요
  let p37_skip: string | undefined;
  if (!isTiktokShop) {
    p37_skip = "tiktok_shop 채널 아님";
  } else if (!opts.hasApifyToken) {
    p37_skip = "APIFY_TOKEN 미설정";
  }
  const p37_enabled = !p37_skip;
  const p37_cost = p37_enabled
    ? PHASE37_MAX_HANDLES * PHASE37_COST_PER_CHECK
    : 0;

  // Phase 4a 계산
  const isAmazon = opts.channel === "amazon";
  let p4a_skip: string | undefined;
  let url_count = 0;

  if (!isAmazon) {
    p4a_skip = "Amazon 전용 (현재 케이스는 다른 플랫폼)";
  } else if (!opts.hasApifyToken) {
    p4a_skip = "APIFY_TOKEN 미설정";
  } else {
    const pageCount =
      opts.brand_meta_pages?.filter((p) => p.trim()).length ?? 0;
    const kwCount = opts.brand_keyword
      ? opts.brand_keyword
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean).length
      : 0;
    url_count = pageCount + kwCount;
    if (url_count === 0) {
      p4a_skip = "brand_meta_pages / brand_keyword 비어있음";
    }
  }

  const p4a_enabled = !p4a_skip;
  const estimated_ads = p4a_enabled
    ? Math.min(url_count * ADS_PER_URL_AVG, ADS_CAP)
    : 0;
  const p4a_cost = estimated_ads * COST_PER_AD;

  // Phase 4b.2 (ASR) — 모든 케이스에서 실행. APIFY_TOKEN 필요.
  let p4b_asr_skip: string | undefined;
  if (!opts.hasApifyToken) {
    p4b_asr_skip = "APIFY_TOKEN 미설정";
  }
  const p4b_asr_enabled = !p4b_asr_skip;
  const p4b_asr_cost = p4b_asr_enabled ? SAMPLE_SIZE * COST_PER_TIKTOK_RESULT : 0;

  // Phase 4b.3 (Vision) — ANTHROPIC_API_KEY 필요
  let p4b_vision_skip: string | undefined;
  if (!opts.hasAnthropicKey) {
    p4b_vision_skip = "ANTHROPIC_API_KEY 미설정";
  }
  const p4b_vision_enabled = !p4b_vision_skip;
  const p4b_vision_cost = p4b_vision_enabled
    ? SAMPLE_SIZE * VISION_COST_PER_VIDEO
    : 0;

  // Phase 4b.4 (Clustering) — ANTHROPIC_API_KEY 필요
  let p4b_cluster_skip: string | undefined;
  if (!opts.hasAnthropicKey) {
    p4b_cluster_skip = "ANTHROPIC_API_KEY 미설정";
  }
  const p4b_cluster_enabled = !p4b_cluster_skip;
  const p4b_cluster_cost = p4b_cluster_enabled ? CLUSTER_COST_PER_CASE : 0;

  // Phase 4b.5 (SKU 매칭) — ANTHROPIC_API_KEY 필요
  let p4b_sku_skip: string | undefined;
  if (!opts.hasAnthropicKey) {
    p4b_sku_skip = "ANTHROPIC_API_KEY 미설정";
  }
  const p4b_sku_enabled = !p4b_sku_skip;
  const p4b_sku_cost = p4b_sku_enabled
    ? SKU_MATCH_VIDEOS_AVG * SKU_MATCH_COST_PER_VIDEO
    : 0;

  const total_max =
    p15_cost +
    p35_cost +
    p37_cost +
    p4a_cost +
    p4b_asr_cost +
    p4b_vision_cost +
    p4b_cluster_cost +
    p4b_sku_cost;

  const preview_text = buildPreview({
    p15Enabled: p15_enabled,
    p15SkipReason: p15_skip,
    p15MaxProducts: PHASE15_MAX_PRODUCTS,
    p15Cost: p15_cost,
    p35Enabled: p35_enabled,
    p35SkipReason: p35_skip,
    p35MaxUnknowns: PHASE35_MAX_UNKNOWNS,
    p35Cost: p35_cost,
    p37Enabled: p37_enabled,
    p37SkipReason: p37_skip,
    p37MaxHandles: PHASE37_MAX_HANDLES,
    p37Cost: p37_cost,
    p4aEnabled: p4a_enabled,
    p4aSkipReason: p4a_skip,
    urlCount: url_count,
    estimatedAds: estimated_ads,
    p4aCost: p4a_cost,
    p4bAsrEnabled: p4b_asr_enabled,
    p4bAsrSkipReason: p4b_asr_skip,
    p4bAsrCost: p4b_asr_cost,
    p4bVisionEnabled: p4b_vision_enabled,
    p4bVisionSkipReason: p4b_vision_skip,
    p4bVisionCost: p4b_vision_cost,
    p4bClusterEnabled: p4b_cluster_enabled,
    p4bClusterSkipReason: p4b_cluster_skip,
    p4bClusterCost: p4b_cluster_cost,
    p4bSkuEnabled: p4b_sku_enabled,
    p4bSkuSkipReason: p4b_sku_skip,
    p4bSkuCost: p4b_sku_cost,
    totalCost: total_max,
  });

  return {
    phase1_5: {
      enabled: p15_enabled,
      skip_reason: p15_skip,
      max_products: p15_enabled ? PHASE15_MAX_PRODUCTS : 0,
      max_cost_usd: p15_cost,
    },
    phase35: {
      enabled: p35_enabled,
      skip_reason: p35_skip,
      max_unknowns: p35_enabled ? PHASE35_MAX_UNKNOWNS : 0,
      max_cost_usd: p35_cost,
    },
    phase37: {
      enabled: p37_enabled,
      skip_reason: p37_skip,
      max_handles: p37_enabled ? PHASE37_MAX_HANDLES : 0,
      max_cost_usd: p37_cost,
    },
    phase4a: {
      enabled: p4a_enabled,
      skip_reason: p4a_skip,
      url_count,
      estimated_ads,
      max_cost_usd: p4a_cost,
    },
    phase4b_asr: {
      enabled: p4b_asr_enabled,
      skip_reason: p4b_asr_skip,
      estimated_videos: p4b_asr_enabled ? SAMPLE_SIZE : 0,
      max_cost_usd: p4b_asr_cost,
    },
    phase4b_vision: {
      enabled: p4b_vision_enabled,
      skip_reason: p4b_vision_skip,
      estimated_videos: p4b_vision_enabled ? SAMPLE_SIZE : 0,
      max_cost_usd: p4b_vision_cost,
    },
    phase4b_clusters: {
      enabled: p4b_cluster_enabled,
      skip_reason: p4b_cluster_skip,
      max_cost_usd: p4b_cluster_cost,
    },
    phase4b_sku: {
      enabled: p4b_sku_enabled,
      skip_reason: p4b_sku_skip,
      estimated_videos: p4b_sku_enabled ? SKU_MATCH_VIDEOS_AVG : 0,
      max_cost_usd: p4b_sku_cost,
    },
    total_max_usd: total_max,
    preview_text,
  };
}

function buildPreview(opts: {
  p15Enabled: boolean;
  p15SkipReason?: string;
  p15MaxProducts: number;
  p15Cost: number;
  p35Enabled: boolean;
  p35SkipReason?: string;
  p35MaxUnknowns: number;
  p35Cost: number;
  p37Enabled: boolean;
  p37SkipReason?: string;
  p37MaxHandles: number;
  p37Cost: number;
  p4aEnabled: boolean;
  p4aSkipReason?: string;
  urlCount: number;
  estimatedAds: number;
  p4aCost: number;
  p4bAsrEnabled: boolean;
  p4bAsrSkipReason?: string;
  p4bAsrCost: number;
  p4bVisionEnabled: boolean;
  p4bVisionSkipReason?: string;
  p4bVisionCost: number;
  p4bClusterEnabled: boolean;
  p4bClusterSkipReason?: string;
  p4bClusterCost: number;
  p4bSkuEnabled: boolean;
  p4bSkuSkipReason?: string;
  p4bSkuCost: number;
  totalCost: number;
}): string {
  const lines = [
    "이 분석은 다음 phase를 실행합니다:",
    "",
  ];

  if (opts.p15Enabled) {
    lines.push(
      `  Phase 1.5 (TikTok Shop 수집)   $0 (정액제)`,
      `    └ pro100chok actor · 구독 $20/월 → 케이스당 추가 비용 없음 · 제품 최대 ${opts.p15MaxProducts.toLocaleString()}개`,
    );
  } else if (opts.p15SkipReason && opts.p15SkipReason !== "tiktok_shop 채널 아님") {
    lines.push(
      `  Phase 1.5 (TikTok Shop 수집)   skip · ${opts.p15SkipReason}`,
    );
  }

  lines.push(
    "  Phase 2 (SQL 집계)            무료",
    "  Phase 3 (인플 fans 룩업)       무료 (외부 DB)",
  );

  if (opts.p35Enabled) {
    lines.push(
      `  Phase 3.5 (clockworks 폴백)   최대 $${opts.p35Cost.toFixed(2)}`,
      `    └ unknown 인플 최대 ${opts.p35MaxUnknowns.toLocaleString()}명 × $0.0017 cap`,
    );
  } else {
    lines.push(
      `  Phase 3.5 (clockworks 폴백)   skip · ${opts.p35SkipReason}`,
    );
  }

  if (opts.p37Enabled) {
    lines.push(
      `  Phase 3.7 (Shop Creator 판별)  최대 $${opts.p37Cost.toFixed(2)}`,
      `    └ lemur · 인플 최대 ${opts.p37MaxHandles.toLocaleString()}명 × $0.005 cap`,
    );
  } else if (
    opts.p37SkipReason &&
    opts.p37SkipReason !== "tiktok_shop 채널 아님"
  ) {
    lines.push(
      `  Phase 3.7 (Shop Creator 판별)  skip · ${opts.p37SkipReason}`,
    );
  }

  if (opts.p4aEnabled) {
    lines.push(
      `  Phase 4a (Meta 광고)          최대 $${opts.p4aCost.toFixed(2)}`,
      `    └ 검색 URL ${opts.urlCount}개 → 광고 최대 ${opts.estimatedAds.toLocaleString()}건 cap`,
    );
  } else {
    lines.push(
      `  Phase 4a (Meta 광고)          skip · ${opts.p4aSkipReason}`,
    );
  }

  lines.push("  Phase 4b.1 (분석 샘플 선정)    무료 (SQL)");

  if (opts.p4bAsrEnabled) {
    lines.push(
      `  Phase 4b.2 (ASR · clockworks) 약 $${opts.p4bAsrCost.toFixed(2)}`,
      `    └ 샘플 300영상 × $0.0017`,
    );
  } else {
    lines.push(
      `  Phase 4b.2 (ASR)              skip · ${opts.p4bAsrSkipReason}`,
    );
  }

  if (opts.p4bVisionEnabled) {
    lines.push(
      `  Phase 4b.3 (Vision · Sonnet)  약 $${opts.p4bVisionCost.toFixed(2)}`,
      `    └ 샘플 300영상 × ~$0.012 (cover frame + caption + ASR, 캐싱 적용)`,
    );
  } else {
    lines.push(
      `  Phase 4b.3 (Vision)           skip · ${opts.p4bVisionSkipReason}`,
    );
  }

  if (opts.p4bClusterEnabled) {
    lines.push(
      `  Phase 4b.4 (3-pass Clustering) 약 $${opts.p4bClusterCost.toFixed(2)}`,
      `    └ Pass 1 batch + Pass 2 merge + Pass 3 meta (Sonnet)`,
    );
  } else {
    lines.push(
      `  Phase 4b.4 (Clustering)       skip · ${opts.p4bClusterSkipReason}`,
    );
  }

  if (opts.p4bSkuEnabled) {
    lines.push(
      `  Phase 4b.5 (SKU 매칭)         약 $${opts.p4bSkuCost.toFixed(2)}`,
      `    └ 화면 노출 영상 ~30개 (샘플 top 12 + 메타 클러스터별 top 3)`,
    );
  } else {
    lines.push(
      `  Phase 4b.5 (SKU 매칭)         skip · ${opts.p4bSkuSkipReason}`,
    );
  }

  lines.push("", `총 예상 비용: 최대 $${opts.totalCost.toFixed(2)}`);
  lines.push("", "계속 진행할까요?");

  return lines.join("\n");
}
