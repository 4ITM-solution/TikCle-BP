-- 019_ws4b_screen_views.sql
-- WS4b (FE-1) 화면 갭 17항목용 데이터 레이어. **적용 금지 — ORCH 게이트.**
-- 대원칙: 현행 스키마에 add-only. 기존 뷰는 CREATE OR REPLACE(컬럼 계약 유지 + 확장만).
-- 근거: docs/ws/WS4_지시서.md 확정판. 컬럼명은 017/016/011 + types.gen.ts 기준.
-- RLS 규칙: 신규 테이블은 020 패턴(anon_all_<table> FOR ALL TO anon) 따름.
--
-- 항목 매핑:
--   A1 → contents.is_shop_content + v_case_monthly 확장(tiktok_shop 채널 분리)
--   A2 → v_case_angle_tier_month
--   A3 → v_case_seeding_ad_overlap
--   A7 → v_case_content_gmv_tags
--   C6 → v_case_ig_country_signal
--
-- =====================================================================
-- A1. TT샵 영상 분리
-- =====================================================================
-- contents엔 channel/gmv 컬럼이 없음(TikTok scope = brand_id+country → cases).
-- "샵 콘텐츠" 신호를 content 행 단위로 박제하기 위한 플래그.
ALTER TABLE contents
  ADD COLUMN IF NOT EXISTS is_shop_content boolean NOT NULL DEFAULT false;

-- 부분 인덱스 — 월별 tiktok_shop 집계(v_case_monthly)용. shop=true는 소수라 partial.
CREATE INDEX IF NOT EXISTS contents_is_shop_content_idx
  ON contents (brand_id, country)
  WHERE is_shop_content;

-- 백필: content→influencer→is_tiktok_shop_creator=true 를 샵 신호로 사용(프록시).
--   근거: TT샵 어필리에이트 크리에이터가 올린 영상이 샵 판매 연계 콘텐츠. Kalodata 영상
--   xlsx의 url 직접 매칭이 더 정확하나 그 데이터는 cases.key_stats(JSON)에만 있어 순수 SQL
--   백필 불가 → 업로드 시점 코드 매칭(parseKalodataVideos)에서 flag하도록 후속(FE 별도).
--   이 프록시 백필은 idempotent(= 재적용 안전).
UPDATE contents c
SET is_shop_content = true
FROM influencers i
WHERE c.influencer_id = i.id
  AND i.is_tiktok_shop_creator IS TRUE
  AND c.is_shop_content IS DISTINCT FROM true;

-- v_case_monthly 확장 — 기존 3채널(tiktok/instagram/youtube)은 계약 그대로 두고,
--   'tiktok_shop' 채널 행을 UNION으로 "추가"만 한다(비파괴). tiktok 채널 total은
--   여전히 전체 TT(샵 포함)이며, tiktok_shop은 그중 샵분만 별도로 셈 = 오버레이 용도.
--   (컬럼 계약 동일: case_id, channel, month, paid, organic, total)
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
-- ★ A1 신규 채널: tiktok_shop (is_shop_content=true 인 TT 콘텐츠만)
SELECT
  cs.id AS case_id,
  'tiktok_shop'::text AS channel,
  to_char(ct.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
  count(*) FILTER (WHERE ct.is_ad) AS paid,
  count(*) FILTER (WHERE NOT ct.is_ad) AS organic,
  count(*) AS total
FROM cases cs
JOIN contents ct
  ON ct.brand_id = cs.brand_id AND ct.country = cs.country
WHERE ct.uploaded_at IS NOT NULL
  AND ct.is_shop_content IS TRUE
GROUP BY 1, 2, 3
UNION ALL
SELECT
  p.case_id, 'instagram'::text,
  to_char(p.posted_at AT TIME ZONE 'UTC', 'YYYY-MM'),
  count(*) FILTER (WHERE p.paid_signal IS NOT NULL),
  count(*) FILTER (WHERE p.paid_signal IS NULL),
  count(*)
FROM ig_posts p
WHERE p.posted_at IS NOT NULL
GROUP BY 1, 2, 3
UNION ALL
SELECT
  v.case_id, 'youtube'::text,
  to_char(v.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM'),
  count(*) FILTER (WHERE v.paid_signal IS NOT NULL),
  count(*) FILTER (WHERE v.paid_signal IS NULL),
  count(*)
FROM yt_videos v
WHERE v.uploaded_at IS NOT NULL
GROUP BY 1, 2, 3;

-- dry-run 검증 쿼리(적용 후 ORCH):
--   SELECT channel, count(*) FROM v_case_monthly WHERE case_id='<ready>' GROUP BY 1;
--   → tiktok_shop 행이 tiktok 이하로 나오면 정상(오버레이).

-- =====================================================================
-- A2. 티어×앵글×월 교차
-- =====================================================================
-- 앵글 = 메타 클러스터명(상위 묶음). 멤버는 리프 클러스터에 붙으므로 parent로 올려 집계.
--   TikTok 경로만(content_id → contents → influencer 티어). IG/YT는 external_ref라
--   콘텐츠 단위 티어 조인이 불명확 → 1차는 TK 한정(표본 라벨로 명시). 비전 태깅 커버리지가
--   낮아(파일럿 5%) 화면은 표본 수 라벨 필수(B3와 연동).
--   컬럼: case_id, angle, tier, month, video_count, views_sum, paid_count
CREATE OR REPLACE VIEW v_case_angle_tier_month AS
SELECT
  lc.case_id,
  COALESCE(mc.name, lc.name) AS angle,
  COALESCE(i.tier::text, bp_tier(i.follower_count::bigint), 'unknown') AS tier,
  to_char(ct.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
  count(*) AS video_count,
  COALESCE(sum(ct.views), 0) AS views_sum,
  count(*) FILTER (WHERE ct.is_ad) AS paid_count
FROM content_cluster_members cm
JOIN content_clusters lc ON lc.id = cm.cluster_id
LEFT JOIN content_clusters mc ON mc.id = lc.parent_cluster_id AND mc.is_meta IS TRUE
JOIN contents ct ON ct.id = cm.content_id
LEFT JOIN influencers i ON i.id = ct.influencer_id
WHERE cm.platform = 'tiktok'
  AND cm.content_id IS NOT NULL
  AND ct.uploaded_at IS NOT NULL
GROUP BY 1, 2, 3, 4;
-- dry-run: SELECT tier, count(DISTINCT angle), count(DISTINCT month), sum(video_count)
--          FROM v_case_angle_tier_month WHERE case_id='<ready>' GROUP BY 1;
