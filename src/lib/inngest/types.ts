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
  currency: string; // USD/KRW/SAR/...
  country: string | null; // 권역 case의 sub-marketplace 분리 키
  bsr_latest: number | null;
  category?: string | null;
  launch_date?: string | null; // YYYY-MM-DD
  price?: number | null;
};

export type BsrSeriesPoint = {
  date: string; // YYYY-MM-DD
  bsr: number;
};

export type BsrSeries = {
  asin: string;
  name: string;
  country: string | null; // 권역 case의 SA/AE 분리. 단일 case면 case.country.
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
  promoted_count?: number; // is_ad=true 영상 수 (Class A~E 분류 입력)
  max_views: number;
  follower_count: number | null;
  is_shop_creator: boolean | null;
  // GMV / performance (lemur stats — Shop creator만 채워짐, 옛 phase37엔 없음)
  lifetime_gmv_usd?: number | null;
  gpm_usd?: number | null;
  post_rate?: number | null;
  total_brand_collabs?: number | null;
  shop_creator_gmv_range?: string | null;
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
  // 직전 period 합산 (각 product 의 latest 다음 row 합). null = prev 데이터 없음.
  prev_period_revenue?: number | null;
  prev_period_end?: string | null;
  // 권역 case의 by-country sub. country 코드(SA/AE/...)가 키. 단일 case는 키 1개만.
  by_country?: Record<
    string,
    {
      revenue: number;
      units: number;
      sku_count: number;
      currency: string;
    }
  >;
};

export type Phase2Stats = {
  monthly_video_counts: MonthlyVideoCount[];
  sales_summary: SalesSummary | null;
  sku_sales: SkuSalesEntry[]; // 매출 내림차순
  bsr_series: BsrSeries[]; // 매출 Top SKU만
  videos_per_creator: VideosPerCreator;
  top_creators: TopCreator[]; // 20+ 영상 작성자
  // 단일 viral outlier — video_count<20인데 max_views >= 1M인 인플 (mockup의
  // "Organic Top 3" 패턴: jooshica 13.7M views with 1 video). top 10.
  outlier_creators?: TopCreator[];
  total_contents: number; // TikTok 영상 수 (contents 테이블)
  total_unique_creators: number;
  // ★ C3: 시딩 분류 — is_ad=false 이지만 caption regex 로 seeded 식별된 영상 수.
  // 채널별 분리는 안 함 — 합산만.
  total_seeded?: number;
  // ★ Phase 10: 채널별 영상 수 (mockup A 채널 toggle 활성용)
  ig_total_videos?: number;
  yt_total_videos?: number;
  // ★ Phase 11: 월별 영상 수 — 채널별 분리 (mockup A 채널 toggle 시 stack chart 갱신)
  monthly_by_channel?: {
    tk: MonthlyVideoCount[];
    ig: MonthlyVideoCount[];
    yt: MonthlyVideoCount[];
  };
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
  // 월별 × 티어별 광고 영상 비율 (영상 단위 — paid/total).
  // key = YYYY-MM. 광고율 = paid / total.
  ad_by_month_tier?: Record<
    string,
    Record<TierBucket, { paid: number; total: number }>
  >;
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

export type PartnerCreatorEntry = {
  creator_page_name: string;
  partner_page_name: string | null; // 같은 creator가 여러 브랜드 partnership이면 콤마 join
  ad_count: number;
  active_count: number;
  first_seen: string | null; // YYYY-MM-DD
  last_seen: string | null;
  sample_thumbnail: string | null;
};

export type Phase4aStats = {
  total_ads: number;
  active_ads: number;
  brand_official_ads: number;
  partnership_ads: number; // creator_page_name 있는 ad 수
  partnership_creators: number; // unique creator count
  formats: { video: number; image: number; other: number };
  landings: Record<LandingType, number>;
  // landing="other" 광고들의 실제 도메인 분포 (count 내림차순, 상위 N개)
  other_top_domains: Array<{ domain: string; count: number }>;
  source_urls_count: number;
  cost_actual_usd: number;
  skipped_reason?: string;
  ads_preview: MetaAdEntry[]; // 화면에 보여줄 샘플 (첫 6개)
  partner_creators: PartnerCreatorEntry[]; // 파트너 인플 리스트 (ad_count 내림차순)
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
    parse_error_tail?: string; // parse 실패시 LLM 출력 끝부분
    stop_reason?: string; // end_turn / max_tokens 등
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
  phase4c?: Phase4cStats;
  phase4d?: Phase4dStats;
  phase4b_sample?: Phase4bSampleStats;
  phase4b_asr?: Phase4bAsrStats;
  phase4b_vision?: Phase4bVisionStats;
  phase4b_clusters?: Phase4bClusterStats;
  phase4b_sku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
};

// =============================================================================
// Phase 4c: IG Brand Monitoring (카테고리 정의자 BP용)
// =============================================================================
// 4-소스 (hashtag + owned + author_seed + celeb_reel) 통합 후 brand 매칭 + paid 추출.
// 데이터는 ig_posts / ig_authors / ig_runs 정규화 테이블에 박힘.
// key_stats.phase4c는 요약만 (UI KPI strip 용).

export type Phase4cAuthorPreview = {
  username: string;
  total_posts: number;
  brand_matched_posts: number;
  paid_posts: number;
  max_likes: number | null;
};

export type Phase4cRunSummary = {
  source: string;                  // "hashtag" / "owned_and_seeds" / "celeb_reel"
  apify_run_id: string | null;
  status: string;
  items_count: number;
  cost_estimate_usd: number;
};

export type Phase4cStats = {
  total_raw: number;               // 모든 소스 합 (dedup 전)
  total_unique: number;            // dedup 후 unique post 수
  total_brand_matched: number;     // brand regex 매칭 통과
  total_paid_signal: number;       // caption에 paid 시그널
  unique_authors: number;          // ig_authors 행 수
  top_authors_preview: Phase4cAuthorPreview[]; // max_likes desc top 20
  by_source: Record<string, number>; // source별 raw 수
  runs: Phase4cRunSummary[];
  cost_actual_usd: number;
  skipped_reason?: string;
  computed_at: string;
};

// =============================================================================
// Phase 4d: YouTube Brand Monitoring
// =============================================================================
// IG와 유사한 패턴 + YT 특화 (Shorts vs long-form 분리, monetizationStatus).

export type Phase4dChannelPreview = {
  channel_name: string;
  total_videos: number;
  paid_videos: number;
  max_views: number | null;
  subscriber_count: number | null;
};

export type Phase4dRunSummary = {
  source: string;
  apify_run_id: string | null;
  status: string;
  items_count: number;
  cost_estimate_usd: number;
};

export type Phase4dStats = {
  total_raw: number;
  total_unique: number;
  total_brand_matched: number;
  total_paid_signal: number;
  unique_channels: number;
  top_channels_preview: Phase4dChannelPreview[];
  by_source: Record<string, number>;
  by_type: { video: number; short: number; stream: number };
  runs: Phase4dRunSummary[];
  cost_actual_usd: number;
  skipped_reason?: string;
  computed_at: string;
};

// =============================================================================
// Phase 5: 포지셔닝 분석 (티어×메타 히트맵 + 언어 분포)
// =============================================================================
/**
 * Heatmap = cluster (메타) × month — mockup 시즈널리티 측정.
 * 행: 메타 cluster (member_count 내림차순), 열: 최근 12 month.
 * cell: 그 cluster × month 의 영상 수 + view 합 + paid 수.
 */
export type HeatmapCell = {
  month: string; // "YYYY-MM"
  video_count: number;
  views_sum: number;
  paid_count: number; // is_ad=true 수
};

export type HeatmapRow = {
  meta_id: string;
  meta_name: string;
  total_videos: number;
  total_views: number;
  cells: HeatmapCell[]; // 각 월별 셀 (없는 월은 video_count=0 entry 또는 missing)
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

export type BsrInflectionVideo = {
  url: string;
  views: number;
  caption: string | null;
};

export type BsrInflection = {
  asin: string;
  date: string; // YYYY-MM-DD (BSR 급등 시점 t)
  rank_before: number; // t-7일 시점 rank
  rank_after: number; // t 시점 rank
  rank_improvement_pct: number; // (before - after) / before * 100
  views_window: number; // [t-7, t] 콘텐츠 뷰 합계
  views_compare: number; // [t-14, t-7] 콘텐츠 뷰 합계
  views_ratio: number; // views_window / views_compare (1+로 잘라둠)
  is_mega_volume: boolean; // views_ratio >= 2
  top_videos: BsrInflectionVideo[]; // [t-7, t] 영상 중 뷰 desc top 3
};

export type Phase5Stats = {
  // 히트맵 — case_video_analyses의 pass3_meta_id 기반 (sample 영상)
  heatmap: HeatmapRow[];
  meta_order: Array<{ id: string; name: string }>; // 행 순서 (member_count desc) — frontend가 이걸로 행 sorting
  month_order: string[]; // 열 순서 ("YYYY-MM" 최근 12개월 오름차순)
  total_videos_in_heatmap: number;
  // 언어 분포 — brand+country 전체 contents 기준
  languages: LanguageEntry[];
  total_with_language: number;
  total_without_language: number;
  // USP 키워드 — 캡션 빈도 분석 (1-3 word n-grams)
  usp_keywords: UspKeywordEntry[];
  total_captions: number;
  // BSR 급등 시점 + 동반된 콘텐츠 분석 (Amazon 케이스만 채워짐)
  bsr_inflections?: BsrInflection[];
  computed_at: string;
  skipped_reason?: string;
};
