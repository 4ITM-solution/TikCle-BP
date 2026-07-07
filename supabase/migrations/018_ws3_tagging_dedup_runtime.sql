-- 018_ws3_tagging_dedup_runtime.sql
-- 2026-07-07 · WS3 모델 티어링 + dedup + 광고 태깅 확장 (docs/ws/WS3_지시서.md, BP_재설계_v2 §3.4, §1.2 Q6)
--
-- 내용:
--   1. 태깅 입력 해시 컬럼 (dedup, §3): case_video_analyses.tag_input_hash · meta_ads.tag_input_hash
--      → "다른 행이지만 같은 입력" 재태깅(중복 과금) 방지. 코드가 upsert 시 채우고,
--        재태깅 前 동일 해시 조회로 기존 결과 복사.
--   2. v_case_ad_runtime 뷰 (Q6, §5): 최장 운영 광고 랭킹 + ad_intel 필드(신규 source_channel·banner_style 포함).
--
-- ⚠️ 적용은 사람(오케스트레이터)이 1건씩 (설계 문서 §5). 이 파일은 코드만.
-- ⚠️ 광고 태깅 신규 필드(source_channel·banner_style)는 ad_intel(jsonb) 안이라 컬럼 추가 없음.
--    기존 태깅된 행은 두 필드 null — 백필은 오케스트레이터 별도 결정 (지시서 §4).

-- ==============================================================
-- 1. 태깅 입력 해시 (dedup) — §3
-- ==============================================================
ALTER TABLE case_video_analyses ADD COLUMN IF NOT EXISTS tag_input_hash text;
ALTER TABLE meta_ads            ADD COLUMN IF NOT EXISTS tag_input_hash text;

COMMENT ON COLUMN case_video_analyses.tag_input_hash IS
  'sha256(stable(cover_url)+caption+asr). 동일 입력 재태깅 방지 — 케이스 무관 재사용 키. WS3 §3';
COMMENT ON COLUMN meta_ads.tag_input_hash IS
  'sha256(stable(thumbnail_url)+body_text). 동일 소재 재태깅 방지 재사용 키. WS3 §3';

-- 재사용 조회는 vision_tags/ad_intel non-null 행만 대상 → partial index로 슬림하게.
CREATE INDEX IF NOT EXISTS case_video_analyses_tag_input_hash_idx
  ON case_video_analyses (tag_input_hash)
  WHERE tag_input_hash IS NOT NULL AND vision_tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_tag_input_hash_idx
  ON meta_ads (tag_input_hash)
  WHERE tag_input_hash IS NOT NULL AND ad_intel IS NOT NULL;

-- ==============================================================
-- 2. v_case_ad_runtime — 최장 운영 광고 랭킹 (Q6, §5)
--    운영일수 = COALESCE(end_date, 오늘) - start_date (일).
--    ⚠️ G3(§2.1) 생존 편향: 메타 라이브러리는 종료된 옛 광고를 안 보여줌 →
--       runtime_days는 "관측 시점 기준" 하한. UI에서 "관측 시작일 이후 기준" 라벨 필요.
--    start_date/end_date는 YYYY-MM-DD 문자열로 적재됨(apify/meta-ads.ts toDateStr) →
--       ::text::date 캐스트로 date/text 컬럼 모두 안전.
-- ==============================================================
CREATE OR REPLACE VIEW v_case_ad_runtime AS
WITH base AS (
  SELECT
    m.case_id,
    m.id                       AS ad_id,
    m.ad_archive_id,
    m.page_name,
    m.start_date,
    m.end_date,
    m.is_active,
    m.inferred_creator_handle,
    m.thumbnail_url,
    m.ad_intel,
    CASE
      WHEN NULLIF(m.start_date::text, '') IS NULL THEN NULL
      ELSE GREATEST(
        0,
        COALESCE(NULLIF(m.end_date::text, '')::date, CURRENT_DATE)
          - NULLIF(m.start_date::text, '')::date
      )
    END AS runtime_days
  FROM meta_ads m
)
SELECT
  b.case_id,
  b.ad_id,
  b.ad_archive_id,
  b.page_name,
  b.start_date,
  b.end_date,
  b.is_active,
  b.runtime_days,
  b.inferred_creator_handle,
  b.thumbnail_url,
  -- ad_intel 태깅 필드 노출 (신규 source_channel·banner_style 포함)
  b.ad_intel->>'origin_class'                 AS origin_class,
  b.ad_intel->>'source_channel'               AS source_channel,
  b.ad_intel->>'banner_style'                 AS banner_style,
  b.ad_intel->>'hook_type'                    AS hook_type,
  b.ad_intel->>'content_format'               AS content_format,
  b.ad_intel->>'creator_read'                 AS creator_read,
  b.ad_intel->>'market_read'                  AS market_read,
  (b.ad_intel->>'is_ugc_person')::boolean     AS is_ugc_person,
  (b.ad_intel->>'has_before_after')::boolean  AS has_before_after,
  (b.ad_intel->>'has_promo_overlay')::boolean AS has_promo_overlay,
  RANK() OVER (
    PARTITION BY b.case_id
    ORDER BY b.runtime_days DESC NULLS LAST
  ) AS runtime_rank
FROM base b;

COMMENT ON VIEW v_case_ad_runtime IS
  '케이스별 광고 운영일수 랭킹 + ad_intel 필드(Q6). runtime_days는 생존 편향(G3) 하한. WS3 §5';
