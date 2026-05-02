/**
 * cases.key_stats jsonb에 저장되는 집계 결과 타입.
 * Phase 2가 채우는 부분만 정의됨.
 * Phase 3~6 결과는 차후 추가.
 */

export type MonthlyVideoCount = {
  month: string; // "2026-03"
  paid: number;
  organic: number;
  total: number;
};

export type SkuSalesEntry = {
  asin: string;
  name: string;
  url: string | null;
  units: number;
  revenue: number;
  bsr_latest: number | null;
};

export type BsrSeriesPoint = {
  date: string; // YYYY-MM-DD
  bsr: number;
};

export type BsrSeries = {
  asin: string;
  name: string;
  points: BsrSeriesPoint[];
};

export type VideosPerCreatorBucket =
  | "1"
  | "2-4"
  | "5-9"
  | "10-19"
  | "20-49"
  | "50+";

export type VideosPerCreator = Record<VideosPerCreatorBucket, number> & {
  total_creators: number;
};

export type TopCreatorVideo = {
  url: string;
  views: number;
  caption: string | null;
};

export type TopCreator = {
  handle: string;
  video_count: number;
  max_views: number;
  follower_count: number | null;
  is_shop_creator: boolean | null;
  // 그 인플의 영상 중 view 기준 top 3 (UI에서 row 펼치면 임베드)
  top_videos?: TopCreatorVideo[];
};

export type SalesSummary = {
  period_start: string | null;
  period_end: string | null;
  total_revenue: number;
  total_units: number;
  sku_count: number;
  top1_revenue_share: number; // 0~1
  top3_revenue_share: number;
};

export type Phase2Stats = {
  monthly_video_counts: MonthlyVideoCount[];
  sales_summary: SalesSummary | null;
  sku_sales: SkuSalesEntry[]; // 매출 내림차순
  bsr_series: BsrSeries[]; // 매출 Top SKU만
  videos_per_creator: VideosPerCreator;
  top_creators: TopCreator[]; // 20+ 영상 작성자
  total_contents: number;
  total_unique_creators: number;
  computed_at: string;
};

// =============================================================================
// Phase 1.5: TikTok Shop 자동 수집 (tiktok_shop 채널만)
// =============================================================================
export type Phase15Stats = {
  total_products: number;
  total_with_price: number;
  total_with_sales: number;
  total_revenue_estimate: number; // SUM(price × total_sold)
  raw_count: number; // actor 응답 raw item 수
  cost_actual_usd: number;
  computed_at: string;
  skipped_reason?: string;
  // 디버그 — 첫 응답 그대로 (DB SQL로 조회)
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
  debug_store_url?: string;
  debug_request_body?: string;
};

// =============================================================================
// Phase 3: Influencer Lookup & Tier
// =============================================================================
// DB enum (influencer_tier_type): mega/macro/mid/micro/nano (5개)
// 'sub-nano' / 'unknown' 은 UI 전용 분류 — DB엔 tier=NULL로 저장
export type TierBucket =
  | "mega"      // ≥ 1M
  | "macro"     // ≥ 500K
  | "mid"       // ≥ 100K
  | "micro"     // ≥ 10K
  | "nano"      // ≥ 1K
  | "sub-nano"  // 0~999 (fans 데이터 있지만 작음)
  | "unknown";  // 외부 DB 매칭 실패 (fans 미상)

export type TierDistribution = Record<TierBucket, number>;

export type Phase3Stats = {
  tier_distribution: TierDistribution;
  total_creators: number;
  total_with_fans: number;
  total_unknown: number;
  fans_sources: {
    influencer_db_tt: number;
    apify_clockworks: number;
    manual: number;
    other: number;
  };
  // 월별 unique 인플 분포 (그 달에 영상 1개라도 만든 인플의 tier 카운트).
  // key = YYYY-MM. value = TierDistribution. 인플이 같은 달에 여러 영상 만들어도 1번.
  tier_dist_by_month?: Record<string, TierDistribution>;
  computed_at: string;
};

// =============================================================================
// Phase 3.5: Clockworks 폴백 (외부 DB에 없는 unknown 인플 fans 채우기)
// =============================================================================
export type Phase35Stats = {
  total_unknown_before: number; // Phase 3 후 follower_count null 인플 수
  total_attempted: number; // clockworks 호출한 수 (URL 매핑 가능한 unknown만)
  total_filled: number; // fans 실제 채워진 수
  cost_actual_usd: number;
  computed_at: string;
  skipped_reason?: string;
};

// =============================================================================
// Phase 3.7: Shop Creator 판별 (tiktok_shop 채널만, lemur)
// =============================================================================
export type Phase37Stats = {
  total_candidates: number; // 판별 대상 인플 수
  total_attempted: number; // lemur에 호출한 수
  total_shop_creators: number; // is_shop_creator=true 결과
  total_non_shop: number; // is_shop_creator=false 결과
  total_unmatched: number; // lemur가 응답 못한 수
  total_update_errors: number; // DB update 실패 수
  sample_update_errors: string[]; // 첫 5개 에러 메시지
  cost_actual_usd: number;
  computed_at: string;
  skipped_reason?: string;
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
};

// =============================================================================
// Phase 4a: Meta Ads
// =============================================================================
export type MetaAdEntry = {
  ad_archive_id: string | null;
  page_name: string | null;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  body_text: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  link_url: string | null;
  landing: LandingType;
  is_brand_official: boolean;
};

export type LandingType =
  | "instagram"
  | "amazon"
  | "tiktok_shop"
  | "facebook"
  | "dtc"
  | "other"
  | "none";

export type Phase4aStats = {
  total_ads: number;
  active_ads: number;
  brand_official_ads: number;
  formats: { video: number; image: number; other: number };
  landings: Record<LandingType, number>;
  // landing="other" 광고들의 실제 도메인 분포 (count 내림차순, 상위 N개)
  other_top_domains: Array<{ domain: string; count: number }>;
  source_urls_count: number;
  cost_actual_usd: number;
  skipped_reason?: string;
  ads_preview: MetaAdEntry[]; // 화면에 보여줄 샘플 (첫 6개)
  computed_at: string;
};

// =============================================================================
// Phase 4b.1: Analysis Sample Selection
// =============================================================================
export type SamplePickReason = "tier_top_views" | "high_save_rate";

export type SampleEntry = {
  content_id: string;
  url: string;
  tier: TierBucket;
  views: number;
  collect_count: number | null;
  save_rate: number | null; // collect_count / views (있을 때만)
  uploaded_at: string | null;
  picked_by: SamplePickReason;
};

export type Phase4bSampleStats = {
  total_picked: number;
  by_tier: Record<TierBucket, number>;
  by_pick_reason: Record<SamplePickReason, number>;
  window_days: number;
  cutoff_date: string; // YYYY-MM-DD
  sample_content_ids: string[]; // 다음 phase (4b.2 ASR / 4b.3 Vision)에서 사용
  preview: SampleEntry[]; // UI용 (top 12)
  computed_at: string;
};

// =============================================================================
// Phase 4b.3: Vision Tagging
// =============================================================================
export type VisionTags = {
  hook_tags: string[];
  content_angle: string;
  body_format: string;
  overlay_text: string | null;
  cta_type: string | null;
  purchase_intent: "high" | "mid" | "low";
  visual_style: string;
  products_visible: string[];
};

export type Phase4bVisionStats = {
  total_attempted: number;
  total_with_tags: number;
  total_failed: number;
  total_no_cover: number; // cover URL 없어서 skip된 수
  cost_actual_usd: number;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  // 디버그: 처음 5개 실패의 사유 (reason 메시지 + cover_url sample)
  failure_reasons?: Array<{ reason: string; cover_url?: string }>;
  // 디버그: vercel env에 박힌 키의 prefix + suffix (사용자가 console에서 매칭 가능)
  api_key_preview?: string;
  computed_at: string;
  skipped_reason?: string;
};

// =============================================================================
// Phase 4b.4: 3-pass Clustering
// =============================================================================
export type MetaClusterEntry = {
  id: string; // content_clusters.id (DB UUID)
  name: string;
  description: string;
  hook_pattern: string;
  body_pattern: string;
  member_count: number;
  child_clusters: Array<{
    id: string;
    name: string;
    member_count: number;
  }>;
};

export type Phase4bClusterStats = {
  total_input_videos: number;
  pass1_candidates: number;
  pass2_validated: number;
  pass3_meta: number;
  total_memberships: number; // 영상-클러스터 연결 수 (한 영상이 여러 클러스터 OK)
  cost_actual_usd: number;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  meta_clusters: MetaClusterEntry[]; // UI 표시용
  computed_at: string;
  skipped_reason?: string;
  pass1_debug?: {
    batches: number;
    raw_clusters_total: number; // LLM이 만든 cluster 합계 (필터 전)
    parse_failures: number;
    dropped_too_small: number;
    dropped_id_mismatch: number;
    sample_unmatched_ids: string[]; // ID 매칭 실패 샘플 → 형식 진단
    sample_member_id_format: string | null; // 첫 cluster의 첫 member_id 원본
  };
  pass2_debug?: {
    raw_clusters_total: number; // LLM이 만든 cluster 합계
    parse_failed: boolean;
    dropped_no_indexes: number;
    dropped_too_small: number; // union 후 멤버 < 3
    invalid_indexes: number; // out-of-range candidate index 수
    output_tokens: number; // truncation 진단용
  };
};

// =============================================================================
// Phase 4b.5: SKU Matching (화면 노출 영상에 한정)
// =============================================================================
export type DisplayedVideoEntry = {
  content_id: string;
  url: string;
  views: number;
  thumbnail_url: string | null;
  caption_preview: string | null;
  matched_skus: string[]; // ASIN 또는 external_product_id
  matched_sku_names: string[];
  confidence: "high" | "mid" | "low" | null;
};

export type Phase4bSkuStats = {
  total_displayed: number;
  total_matched: number; // 1개 이상 SKU 매칭된 영상
  total_no_match: number;
  total_failed: number;
  cost_actual_usd: number;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  // UI 표시용
  displayed_videos: DisplayedVideoEntry[]; // 모든 노출 영상 (SKU 태그 포함)
  // meta cluster id → 대표 3영상 (cluster expand UI에서 사용)
  cluster_representatives: Record<string, DisplayedVideoEntry[]>;
  computed_at: string;
  skipped_reason?: string;
};

// =============================================================================
// Phase 4b.2: ASR Collection
// =============================================================================
export type Phase4bAsrStats = {
  total_attempted: number; // 샘플 중 clockworks 호출한 수
  total_with_asr: number; // 실제 ASR 텍스트 받아진 수
  total_with_cover: number; // cover_url 받아진 수 (Phase 4b.3 입력)
  total_with_fans_updated: number; // 부수효과: 인플 fans 채워진 수
  total_with_user_id_updated: number; // 부수효과: TikTok user_id 채워진 수 (external_id)
  cost_actual_usd: number;
  debug_first_item_keys?: string[]; // 디버그: 첫 응답의 top-level + videoMeta 키
  skipped_reason?: string;
  computed_at: string;
};

export type KeyStats = {
  phase1_5?: Phase15Stats;
  phase2?: Phase2Stats;
  phase3?: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
  phase4a?: Phase4aStats;
  phase4b_sample?: Phase4bSampleStats;
  phase4b_asr?: Phase4bAsrStats;
  phase4b_vision?: Phase4bVisionStats;
  phase4b_clusters?: Phase4bClusterStats;
  phase4b_sku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
};

// =============================================================================
// Phase 5: 포지셔닝 분석 (티어×메타 히트맵 + 언어 분포)
// =============================================================================
export type HeatmapCell = {
  meta_id: string;
  views_sum: number;
  views_pct: number; // 0-100, tier row 안에서 정규화
  video_count: number;
};

export type HeatmapRow = {
  tier: TierBucket;
  total_videos: number;
  total_views: number;
  cells: HeatmapCell[];
};

export type LanguageEntry = {
  code: string; // "en", "es", "ko", "unknown" 등
  label: string; // 표시용
  count: number;
  pct: number;
};

export type UspKeywordEntry = {
  keyword: string;
  count: number; // 키워드를 포함한 캡션 수
  pct: number; // count / total_captions × 100
};

export type Phase5Stats = {
  // 히트맵 — case_video_analyses의 pass3_meta_id 기반 (sample 영상)
  heatmap: HeatmapRow[];
  meta_order: Array<{ id: string; name: string }>; // 컬럼 순서 (member_count desc)
  total_videos_in_heatmap: number;
  // 언어 분포 — brand+country 전체 contents 기준
  languages: LanguageEntry[];
  total_with_language: number;
  total_without_language: number;
  // USP 키워드 — 캡션 빈도 분석 (1-3 word n-grams)
  usp_keywords: UspKeywordEntry[];
  total_captions: number;
  computed_at: string;
  skipped_reason?: string;
};
