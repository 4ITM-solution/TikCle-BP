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

-- =====================================================================
-- A3. 시딩∩광고 교집합
-- =====================================================================
-- 조인 키: meta_ads.creator_page_name(1순위) + inferred_creator_handle(보조) 를 norm_handle로
--   정규화 → v_unified_creators.norm_handle(TK/IG/YT 통합) 과 case 내에서 매칭.
--   근거 BE-9: inferred_creator_handle 은 SharkNinja류에서 거의 0건, creator_page_name 에
--   실제 크리에이터(PlantYou 등) 43/221 존재 → page_name 우선. 매칭 없으면 빈 결과(정상).
--   컬럼: case_id, norm_handle, creator_handle, seeding_channel, tier, follower_count,
--         ad_count, creator_page_name, inferred_creator_handle
CREATE OR REPLACE VIEW v_case_seeding_ad_overlap AS
WITH ad_handles AS (
  SELECT
    m.case_id,
    COALESCE(
      NULLIF(regexp_replace(lower(m.creator_page_name), '[^a-z0-9]', '', 'g'), ''),
      NULLIF(regexp_replace(lower(m.inferred_creator_handle), '[^a-z0-9]', '', 'g'), '')
    ) AS norm_handle,
    max(m.creator_page_name) AS creator_page_name,
    max(m.inferred_creator_handle) AS inferred_creator_handle,
    count(*) AS ad_count
  FROM meta_ads m
  WHERE COALESCE(m.creator_page_name, m.inferred_creator_handle) IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  ah.case_id,
  ah.norm_handle,
  uc.handle AS creator_handle,
  uc.channel AS seeding_channel,
  uc.tier,
  uc.follower_count,
  ah.ad_count,
  ah.creator_page_name,
  ah.inferred_creator_handle
FROM ad_handles ah
JOIN v_unified_creators uc
  ON uc.case_id = ah.case_id AND uc.norm_handle = ah.norm_handle
WHERE ah.norm_handle IS NOT NULL
  AND length(ah.norm_handle) >= 4;
-- dry-run: SELECT count(*), count(DISTINCT norm_handle) FROM v_case_seeding_ad_overlap WHERE case_id='<ready>';

-- =====================================================================
-- A6. 프로모션 캘린더 시드 (미국 — 사실 확인된 날짜만, 추정 금지)
-- =====================================================================
-- is_preset=true, case_id=NULL(글로벌 프리셋), country='US'. 화면 A섹션 월별 차트 이벤트 마커용.
--   포함: Black Friday/Cyber Monday(추수감사절 기준 달력 확정), Amazon Prime Day(7월)·
--         Prime Big Deal Days(10월, 공식 발표 확정 과거일). 2026 미발표분은 추정 금지 → 제외.
--   idempotent: 동일 (name, country, start_date, is_preset) 있으면 skip.
INSERT INTO promotion_events (name, country, start_date, end_date, is_preset, importance, notes)
SELECT v.name, v.country, v.start_date::date, v.end_date::date, true, v.importance, v.notes
FROM (VALUES
  -- Amazon Prime Day (7월)
  ('Amazon Prime Day 2023', 'US', '2023-07-11', '2023-07-12', 5, 'Amazon 공식 (확정)'),
  ('Amazon Prime Day 2024', 'US', '2024-07-16', '2024-07-17', 5, 'Amazon 공식 (확정)'),
  ('Amazon Prime Day 2025', 'US', '2025-07-08', '2025-07-11', 5, 'Amazon 공식 4일 (확정)'),
  -- Amazon Prime Big Deal Days (10월)
  ('Prime Big Deal Days 2023', 'US', '2023-10-10', '2023-10-11', 4, 'Amazon 공식 (확정)'),
  ('Prime Big Deal Days 2024', 'US', '2024-10-08', '2024-10-09', 4, 'Amazon 공식 (확정)'),
  ('Prime Big Deal Days 2025', 'US', '2025-10-07', '2025-10-08', 4, 'Amazon 공식 (확정)'),
  -- Black Friday (추수감사절 다음날 — 달력 확정)
  ('Black Friday 2023', 'US', '2023-11-24', '2023-11-24', 5, '추수감사절 익일 (달력 확정)'),
  ('Black Friday 2024', 'US', '2024-11-29', '2024-11-29', 5, '추수감사절 익일 (달력 확정)'),
  ('Black Friday 2025', 'US', '2025-11-28', '2025-11-28', 5, '추수감사절 익일 (달력 확정)'),
  -- Cyber Monday (BF 다음 월요일 — 달력 확정)
  ('Cyber Monday 2023', 'US', '2023-11-27', '2023-11-27', 4, 'BF 다음 월요일 (달력 확정)'),
  ('Cyber Monday 2024', 'US', '2024-12-02', '2024-12-02', 4, 'BF 다음 월요일 (달력 확정)'),
  ('Cyber Monday 2025', 'US', '2025-12-01', '2025-12-01', 4, 'BF 다음 월요일 (달력 확정)')
) AS v(name, country, start_date, end_date, importance, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM promotion_events pe
  WHERE pe.name = v.name AND pe.country = v.country
    AND pe.start_date = v.start_date::date AND pe.is_preset IS TRUE
);
-- dry-run: SELECT name, start_date FROM promotion_events WHERE is_preset AND country='US' ORDER BY start_date;

-- =====================================================================
-- A7. GMV × 태그 조인
-- =====================================================================
-- 콘텐츠 단위 GMV = case_video_analyses.matched_sku_ids → case_product_sales.revenue_30d 합.
--   태그 = contents.hook_tags(text[]). 태그별 기여 GMV + 영상 수 집계.
--   ⚠ 커버리지 극히 낮음(파일럿: GMV 연계 영상 10/10,139 = 0.1%) → 화면은 표본 라벨 필수(B9).
--   컬럼: case_id, tag, video_count, gmv_sum
CREATE OR REPLACE VIEW v_case_content_gmv_tags AS
WITH sku_gmv AS (
  SELECT case_id, product_id, MAX(revenue_30d) AS revenue_30d
  FROM case_product_sales
  WHERE revenue_30d IS NOT NULL
  GROUP BY case_id, product_id
),
content_gmv AS (
  SELECT
    cva.case_id,
    cva.content_id,
    ct.hook_tags,
    (SELECT COALESCE(SUM(sg.revenue_30d), 0)
     FROM unnest(cva.matched_sku_ids) AS s(sku_id)
     JOIN sku_gmv sg ON sg.product_id = s.sku_id AND sg.case_id = cva.case_id
    ) AS gmv
  FROM case_video_analyses cva
  JOIN contents ct ON ct.id = cva.content_id
  WHERE cva.content_id IS NOT NULL
    AND cva.matched_sku_ids IS NOT NULL
    AND array_length(cva.matched_sku_ids, 1) > 0
)
SELECT
  cg.case_id,
  t.tag,
  count(DISTINCT cg.content_id) AS video_count,
  SUM(cg.gmv) AS gmv_sum
FROM content_gmv cg
CROSS JOIN LATERAL unnest(COALESCE(cg.hook_tags, ARRAY[]::text[])) AS t(tag)
WHERE cg.gmv > 0
GROUP BY cg.case_id, t.tag;
-- dry-run: SELECT tag, video_count, gmv_sum FROM v_case_content_gmv_tags WHERE case_id='<ready>' ORDER BY gmv_sum DESC;

-- =====================================================================
-- C6. IG 국가 근사 신호 (휴리스틱 — LLM 금지)
-- =====================================================================
-- ig_posts 엔 country 컬럼이 없음. 캡션의 비-라틴 문자(한글/태국어/일본어/아랍어/키릴 등)
--   존재를 "비영어권 = 글로벌 혼입" 근사 신호로 사용. 진짜 국가 판정이 아니라 "언어 기반 근사"임을
--   화면에서 반드시 명시(추정 라벨). 컬럼: case_id, total, non_latin, latin, non_latin_pct
CREATE OR REPLACE VIEW v_case_ig_country_signal AS
SELECT
  p.case_id,
  count(*) AS total,
  count(*) FILTER (
    WHERE p.caption ~ '[가-힣぀-ヿ一-鿿฀-๿؀-ۿЀ-ӿ]'
  ) AS non_latin,
  count(*) FILTER (
    WHERE p.caption IS NULL OR p.caption !~ '[가-힣぀-ヿ一-鿿฀-๿؀-ۿЀ-ӿ]'
  ) AS latin,
  round(
    100.0 * count(*) FILTER (
      WHERE p.caption ~ '[가-힣぀-ヿ一-鿿฀-๿؀-ۿЀ-ӿ]'
    ) / NULLIF(count(*), 0)
  ) AS non_latin_pct
FROM ig_posts p
GROUP BY p.case_id;
-- dry-run: SELECT total, non_latin, non_latin_pct FROM v_case_ig_country_signal WHERE case_id='<ready>';
