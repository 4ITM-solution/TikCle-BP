-- 017_ws1_data_layer.sql
-- 2026-07-07 · WS1 데이터 계층 (docs/BP_재설계_v2.md §3.2, §3.3, §4)
--
-- 내용:
--   1. phase_runs 테이블 (P8 — phase 단위 추적)
--   2. cases.uploads jsonb (수동 업로드 원본 분리 — 데이터 이전은 WS5)
--   3. meta_ads (case_id, ad_archive_id) unique — upsert 전환용 (P4)
--   4. content_clusters.run_tag — 클러스터 swap 방식 재실행용
--   5. bp_tier() 함수 + 뷰 4개:
--      v_unified_creators / v_case_monthly / v_case_creator_stats / v_case_tier_dist
--
-- ⚠️ 적용은 사람이 1건씩 (설계 문서 §5). 이 파일은 코드만.

-- ==============================================================
-- 1. phase_runs — phase 단위 상태 추적 (§3.2 스키마 그대로)
-- ==============================================================
CREATE TABLE IF NOT EXISTS phase_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  phase text NOT NULL,              -- 'collect-ig', 'interpret-cluster', ...
  status text NOT NULL,             -- queued | running | completed | partial | failed
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  cost_usd numeric DEFAULT 0,
  stats jsonb DEFAULT '{}',         -- 건수 등 소형 메타만 (집계 결과 저장 금지)
  UNIQUE (case_id, phase)           -- 최신 상태만, 이력은 pipeline_runs 유지
);

CREATE INDEX IF NOT EXISTS phase_runs_case_id_idx ON phase_runs (case_id);

COMMENT ON TABLE phase_runs IS
  'Phase 단위 최신 상태 (UI PhaseProgress 소스). 이력은 pipeline_runs. §3.2';

-- RLS — 기존 테이블 패턴 (013/014: internal tool, anon full access)
ALTER TABLE phase_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read phase_runs" ON phase_runs FOR SELECT TO anon USING (true);
CREATE POLICY "anon write phase_runs" ON phase_runs FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==============================================================
-- 2. cases.uploads — 수동 업로드 원본 스냅샷 분리 (kalodata_*, tt_shop_us_*, phase1_5 등)
--    ⚠️ 컬럼만 추가. key_stats → uploads 데이터 이전은 WS5.
-- ==============================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS uploads jsonb;

COMMENT ON COLUMN cases.uploads IS
  '수동 업로드 원본 스냅샷 (kalodata_*/tt_shop_us_*/phase1_5). key_stats에서 이전 예정(WS5). §3.2';

-- ==============================================================
-- 3. meta_ads upsert 키 — (case_id, ad_archive_id) unique
--    기존 중복 행 정리: ad_intel/inferred_creator_handle 있는 행(유료 Vision 결과) 우선 보존.
--    ad_archive_id NULL 행은 unique 미적용 (PG: NULLS DISTINCT) — 코드에서 별도 처리.
-- ==============================================================
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY case_id, ad_archive_id
           ORDER BY (ad_intel IS NOT NULL) DESC,
                    (inferred_creator_handle IS NOT NULL) DESC,
                    created_at ASC
         ) AS rn
  FROM meta_ads
  WHERE ad_archive_id IS NOT NULL
)
DELETE FROM meta_ads m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_case_ad_archive_id_key'
  ) THEN
    ALTER TABLE meta_ads
      ADD CONSTRAINT meta_ads_case_ad_archive_id_key UNIQUE (case_id, ad_archive_id);
  END IF;
END $$;

-- ==============================================================
-- 4. content_clusters.run_tag — swap 재실행 (신규 insert 성공 후 구버전 delete)
-- ==============================================================
ALTER TABLE content_clusters ADD COLUMN IF NOT EXISTS run_tag text;
CREATE INDEX IF NOT EXISTS content_clusters_case_run_idx ON content_clusters (case_id, run_tag);

COMMENT ON COLUMN content_clusters.run_tag IS
  '클러스터링 실행 태그(uuid). 재실행 시 새 태그로 insert 후 다른 태그 행 delete (swap). §3.3';

-- ==============================================================
-- 5. tier 함수 + 뷰
-- ==============================================================
-- tier 경계값 — phase3.ts classifyTier() 및 page.tsx tierOf()와 정확히 일치:
--   mega ≥ 1M / macro ≥ 500K / mid ≥ 100K / micro ≥ 10K / nano ≥ 1K / sub-nano ≥ 0 / null = unknown
CREATE OR REPLACE FUNCTION bp_tier(fans bigint) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN fans IS NULL THEN 'unknown'
    WHEN fans >= 1000000 THEN 'mega'
    WHEN fans >= 500000 THEN 'macro'
    WHEN fans >= 100000 THEN 'mid'
    WHEN fans >= 10000 THEN 'micro'
    WHEN fans >= 1000 THEN 'nano'
    ELSE 'sub-nano'
  END
$$;

-- handle 정규화 — page.tsx normH와 동일: lowercase 후 [^a-z0-9] 제거
-- SQL: regexp_replace(lower(handle), '[^a-z0-9]', '', 'g')

-- --------------------------------------------------------------
-- v_unified_creators — 크로스플랫폼 크리에이터 통합 (P10)
--   TikTok: influencers는 글로벌 → contents(brand_id+country) 경유로 case 스코프 확정
--   IG/YT: ig_authors / yt_channels (case_id 스코프)
--   tier: TK는 DB tier 우선(phase3 tierOf와 동일), IG/YT는 followers/subscriber 라이브 계산
--         (page.tsx tierDistByChannel과 동일 — ig_authors.tier 저장값 미사용)
-- --------------------------------------------------------------
CREATE OR REPLACE VIEW v_unified_creators AS
WITH tk AS (
  SELECT cs.id AS case_id, ct.influencer_id
  FROM cases cs
  JOIN contents ct
    ON ct.brand_id = cs.brand_id AND ct.country = cs.country
  WHERE ct.influencer_id IS NOT NULL
  GROUP BY cs.id, ct.influencer_id
)
SELECT
  tk.case_id,
  'tiktok'::text AS channel,
  i.handle,
  regexp_replace(lower(i.handle), '[^a-z0-9]', '', 'g') AS norm_handle,
  i.follower_count::bigint AS follower_count,
  COALESCE(i.tier, bp_tier(i.follower_count::bigint)) AS tier
FROM tk
JOIN influencers i ON i.id = tk.influencer_id
UNION ALL
SELECT
  a.case_id,
  'instagram'::text,
  a.username,
  regexp_replace(lower(a.username), '[^a-z0-9]', '', 'g'),
  a.followers,
  bp_tier(a.followers)
FROM ig_authors a
UNION ALL
SELECT
  y.case_id,
  'youtube'::text,
  y.channel_name,
  regexp_replace(lower(y.channel_name), '[^a-z0-9]', '', 'g'),
  y.subscriber_count,
  bp_tier(y.subscriber_count)
FROM yt_channels y;

COMMENT ON VIEW v_unified_creators IS
  '케이스 스코프 크로스플랫폼 크리에이터 (TK=contents 경유, IG/YT=authors/channels). norm_handle로 채널 교집합 매칭. §3.2';

-- --------------------------------------------------------------
-- v_case_monthly — 케이스별·채널별 월별 영상 수 (paid/organic)
--   phase2.ts aggregateMonthlyVideoCounts / aggMonthly 이식:
--     TK paid = is_ad, IG/YT paid = paid_signal IS NOT NULL
--   month = ISO 문자열 slice(0,7)와 동일하게 UTC 기준 YYYY-MM
-- --------------------------------------------------------------
CREATE OR REPLACE VIEW v_case_monthly AS
SELECT
  cs.id AS case_id,
  'tiktok'::text AS channel,
  to_char(ct.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
  count(*) FILTER (WHERE ct.is_ad) AS paid,
  count(*) FILTER (WHERE NOT ct.is_ad) AS organic,
  count(*) AS total
FROM cases cs
JOIN contents ct
  ON ct.brand_id = cs.brand_id AND ct.country = cs.country
WHERE ct.uploaded_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  p.case_id,
  'instagram'::text,
  to_char(p.posted_at AT TIME ZONE 'UTC', 'YYYY-MM'),
  count(*) FILTER (WHERE p.paid_signal IS NOT NULL),
  count(*) FILTER (WHERE p.paid_signal IS NULL),
  count(*)
FROM ig_posts p
WHERE p.posted_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  v.case_id,
  'youtube'::text,
  to_char(v.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM'),
  count(*) FILTER (WHERE v.paid_signal IS NOT NULL),
  count(*) FILTER (WHERE v.paid_signal IS NULL),
  count(*)
FROM yt_videos v
WHERE v.uploaded_at IS NOT NULL
GROUP BY 1, 2, 3;

COMMENT ON VIEW v_case_monthly IS
  '케이스별·채널별 월별 영상 수 (key_stats.phase2.monthly_by_channel 대체). §3.2';

-- --------------------------------------------------------------
-- v_case_creator_stats — 케이스별 크리에이터 영상수/조회수 집계 (라이브)
--   TK: contents 집계 (phase2.ts aggregateCreators의 video_count/promoted_count/max_views)
--   IG: ig_posts 집계 — views = coalesce(video_view_count, video_play_count, likes_count)
--       (phase4b-clusters.ts IG views 폴백 체인과 동일)
--   YT: yt_videos 집계 (view_count)
-- --------------------------------------------------------------
CREATE OR REPLACE VIEW v_case_creator_stats AS
SELECT
  cs.id AS case_id,
  'tiktok'::text AS channel,
  i.handle,
  regexp_replace(lower(i.handle), '[^a-z0-9]', '', 'g') AS norm_handle,
  count(*) AS video_count,
  count(*) FILTER (WHERE ct.is_ad) AS paid_count,
  max(ct.views)::bigint AS max_views,
  sum(ct.views)::bigint AS total_views
FROM cases cs
JOIN contents ct
  ON ct.brand_id = cs.brand_id AND ct.country = cs.country
JOIN influencers i ON i.id = ct.influencer_id
WHERE ct.influencer_id IS NOT NULL
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT
  p.case_id,
  'instagram'::text,
  p.owner_username,
  regexp_replace(lower(p.owner_username), '[^a-z0-9]', '', 'g'),
  count(*),
  count(*) FILTER (WHERE p.paid_signal IS NOT NULL),
  max(COALESCE(p.video_view_count, p.video_play_count, p.likes_count)),
  sum(COALESCE(p.video_view_count, p.video_play_count, p.likes_count))
FROM ig_posts p
GROUP BY 1, 2, 3, 4
UNION ALL
SELECT
  v.case_id,
  'youtube'::text,
  v.channel_name,
  regexp_replace(lower(v.channel_name), '[^a-z0-9]', '', 'g'),
  count(*),
  count(*) FILTER (WHERE v.paid_signal IS NOT NULL),
  max(v.view_count),
  sum(v.view_count)
FROM yt_videos v
WHERE v.channel_name IS NOT NULL
GROUP BY 1, 2, 3, 4;

COMMENT ON VIEW v_case_creator_stats IS
  '케이스별 크리에이터 영상수/paid수/조회수 라이브 집계 (key_stats.phase2.top_creators 카운트 대체). §3.2';

-- --------------------------------------------------------------
-- v_case_tier_dist — 채널별 tier 분포
--   TK: phase3.ts computePhase3Stats(tierOf = DB tier 우선, 없으면 fans 분류)와 일치
--   IG/YT: page.tsx tierDistByChannel(followers/subscriber_count 직접 분류)와 일치
-- --------------------------------------------------------------
CREATE OR REPLACE VIEW v_case_tier_dist AS
SELECT case_id, channel, tier, count(*) AS creators
FROM v_unified_creators
GROUP BY 1, 2, 3;

COMMENT ON VIEW v_case_tier_dist IS
  '케이스별·채널별 tier 분포 (key_stats.phase3.tier_distribution 대체). §3.2';
