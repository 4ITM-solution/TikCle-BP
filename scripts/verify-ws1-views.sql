-- verify-ws1-views.sql
-- WS1 뷰 검증: v_case_monthly / v_case_creator_stats / v_case_tier_dist 가
-- 기존 key_stats.phase2 / phase3 캐시 수치와 일치하는지 비교.
--
-- 사용법: Supabase SQL Editor에서 케이스 1개 id를 :case_id 위치에 박아 실행하거나
-- 아래처럼 전 케이스 대상으로 돌려 diff 행만 확인.
-- 주의: key_stats 는 stale 할 수 있음 (그게 WS1의 존재 이유) — diff가 나오면
-- "뷰가 틀렸다"가 아니라 "캐시가 낡았다"일 수 있으니 원본 테이블 직접 카운트로 3자 대조.

-- ============================================================
-- 1. v_case_monthly (tiktok) vs key_stats.phase2.monthly_video_counts
--    diff 있는 행만 출력 (없으면 0 rows = 통과)
-- ============================================================
WITH ks AS (
  SELECT
    c.id AS case_id,
    m.value ->> 'month' AS month,
    (m.value ->> 'paid')::bigint AS paid,
    (m.value ->> 'organic')::bigint AS organic,
    (m.value ->> 'total')::bigint AS total
  FROM cases c,
       jsonb_array_elements(c.key_stats -> 'phase2' -> 'monthly_video_counts') m
  WHERE c.key_stats -> 'phase2' -> 'monthly_video_counts' IS NOT NULL
),
v AS (
  SELECT case_id, month, paid, organic, total
  FROM v_case_monthly
  WHERE channel = 'tiktok'
)
SELECT
  COALESCE(ks.case_id, v.case_id) AS case_id,
  COALESCE(ks.month, v.month) AS month,
  ks.paid AS ks_paid,   v.paid AS view_paid,
  ks.organic AS ks_organic, v.organic AS view_organic,
  ks.total AS ks_total, v.total AS view_total
FROM ks
FULL OUTER JOIN v ON v.case_id = ks.case_id AND v.month = ks.month
WHERE ks.total IS DISTINCT FROM v.total
   OR ks.paid IS DISTINCT FROM v.paid
   OR ks.organic IS DISTINCT FROM v.organic
ORDER BY 1, 2;

-- ============================================================
-- 2. v_case_monthly (instagram/youtube) vs key_stats.phase2.monthly_by_channel
-- ============================================================
WITH ks AS (
  SELECT c.id AS case_id, ch.key AS channel_key,
         m.value ->> 'month' AS month,
         (m.value ->> 'paid')::bigint AS paid,
         (m.value ->> 'organic')::bigint AS organic,
         (m.value ->> 'total')::bigint AS total
  FROM cases c,
       jsonb_each(c.key_stats -> 'phase2' -> 'monthly_by_channel') ch,
       jsonb_array_elements(ch.value) m
  WHERE ch.key IN ('ig', 'yt')
),
v AS (
  SELECT case_id,
         CASE channel WHEN 'instagram' THEN 'ig' WHEN 'youtube' THEN 'yt' END AS channel_key,
         month, paid, organic, total
  FROM v_case_monthly
  WHERE channel IN ('instagram', 'youtube')
)
SELECT
  COALESCE(ks.case_id, v.case_id) AS case_id,
  COALESCE(ks.channel_key, v.channel_key) AS channel,
  COALESCE(ks.month, v.month) AS month,
  ks.paid AS ks_paid,   v.paid AS view_paid,
  ks.total AS ks_total, v.total AS view_total
FROM ks
FULL OUTER JOIN v
  ON v.case_id = ks.case_id AND v.channel_key = ks.channel_key AND v.month = ks.month
WHERE ks.total IS DISTINCT FROM v.total
   OR ks.paid IS DISTINCT FROM v.paid
ORDER BY 1, 2, 3;

-- ============================================================
-- 3. total_contents / total_unique_creators (phase2) vs 뷰 합계
-- ============================================================
WITH ks AS (
  SELECT id AS case_id,
         (key_stats -> 'phase2' ->> 'total_contents')::bigint AS total_contents,
         (key_stats -> 'phase2' ->> 'total_unique_creators')::bigint AS total_unique_creators
  FROM cases
  WHERE key_stats -> 'phase2' IS NOT NULL
),
v_contents AS (
  -- 주의: phase2.total_contents 는 uploaded_at null 포함 전체 contents 수 —
  --       v_case_monthly 는 uploaded_at 있는 행만이라 여기선 원본 재계산으로 대조.
  SELECT cs.id AS case_id, count(*) AS total_contents
  FROM cases cs
  JOIN contents ct ON ct.brand_id = cs.brand_id AND ct.country = cs.country
  GROUP BY cs.id
),
v_creators AS (
  SELECT case_id, count(*) AS total_unique_creators
  FROM v_case_creator_stats
  WHERE channel = 'tiktok'
  GROUP BY case_id
)
SELECT ks.case_id,
       ks.total_contents AS ks_total_contents,
       vc.total_contents AS live_total_contents,
       ks.total_unique_creators AS ks_unique_creators,
       vr.total_unique_creators AS view_unique_creators
FROM ks
LEFT JOIN v_contents vc ON vc.case_id = ks.case_id
LEFT JOIN v_creators vr ON vr.case_id = ks.case_id
WHERE ks.total_contents IS DISTINCT FROM vc.total_contents
   OR ks.total_unique_creators IS DISTINCT FROM vr.total_unique_creators
ORDER BY 1;

-- ============================================================
-- 4. v_case_tier_dist (tiktok) vs key_stats.phase3.tier_distribution
--    tier 경계값: classifyTier와 동일 (1M/500K/100K/10K/1K, sub-nano, unknown)
-- ============================================================
WITH ks AS (
  SELECT c.id AS case_id, t.key AS tier, (t.value)::text::bigint AS creators
  FROM cases c,
       jsonb_each(c.key_stats -> 'phase3' -> 'tier_distribution') t
  WHERE c.key_stats -> 'phase3' -> 'tier_distribution' IS NOT NULL
),
v AS (
  SELECT case_id, tier, creators
  FROM v_case_tier_dist
  WHERE channel = 'tiktok'
)
SELECT
  COALESCE(ks.case_id, v.case_id) AS case_id,
  COALESCE(ks.tier, v.tier) AS tier,
  COALESCE(ks.creators, 0) AS ks_creators,
  COALESCE(v.creators, 0) AS view_creators
FROM ks
FULL OUTER JOIN v ON v.case_id = ks.case_id AND v.tier = ks.tier
WHERE COALESCE(ks.creators, 0) IS DISTINCT FROM COALESCE(v.creators, 0)
ORDER BY 1, 2;

-- ============================================================
-- 5. v_unified_creators sanity — 케이스별 채널별 크리에이터 수 요약 (눈 대조용)
--    IG = ig_authors 행수, YT = yt_channels 행수, TK = phase3.total_creators 와 비교
-- ============================================================
SELECT
  u.case_id,
  u.channel,
  count(*) AS creators_in_view,
  CASE u.channel
    WHEN 'tiktok' THEN (
      SELECT (c.key_stats -> 'phase3' ->> 'total_creators')::bigint
      FROM cases c WHERE c.id = u.case_id
    )
    WHEN 'instagram' THEN (SELECT count(*) FROM ig_authors a WHERE a.case_id = u.case_id)
    WHEN 'youtube' THEN (SELECT count(*) FROM yt_channels y WHERE y.case_id = u.case_id)
  END AS expected
FROM v_unified_creators u
GROUP BY u.case_id, u.channel
HAVING count(*) IS DISTINCT FROM
  CASE u.channel
    WHEN 'tiktok' THEN (
      SELECT (c.key_stats -> 'phase3' ->> 'total_creators')::bigint
      FROM cases c WHERE c.id = u.case_id
    )
    WHEN 'instagram' THEN (SELECT count(*) FROM ig_authors a WHERE a.case_id = u.case_id)
    WHEN 'youtube' THEN (SELECT count(*) FROM yt_channels y WHERE y.case_id = u.case_id)
  END
ORDER BY 1, 2;

-- ============================================================
-- 6. meta_ads upsert 사전 점검 — unique 제약 위반될 중복 (migration 017이 정리하지만 확인용)
-- ============================================================
SELECT case_id, ad_archive_id, count(*) AS dup,
       count(*) FILTER (WHERE ad_intel IS NOT NULL) AS with_intel
FROM meta_ads
WHERE ad_archive_id IS NOT NULL
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY dup DESC;
