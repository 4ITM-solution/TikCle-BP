-- cases.data_channels — 이 케이스에서 어떤 데이터 채널을 분석 대상으로 활성화했는지.
-- 기존 case.channel (단일 enum)은 "주요 판매 채널" 의미로 유지하되, data_channels는
-- multi-select로 채널별 활성/비활성 추적. UI에서 활성 채널만 입력 슬롯/분석 결과 노출.
--
-- 가능한 값: tiktok_video · amazon · tt_shop · shopee · meta_ads · instagram · youtube
--   - tiktok_video: Exolyt CSV로 들어오는 TikTok 영상 콘텐츠 (브랜드 채널 무관)
--   - amazon: Helium10 매출 + BSR (case.channel='amazon' 케이스)
--   - tt_shop: TT Shop 제품/매출 (case.channel='tiktok_shop' 케이스)
--   - shopee: Shopee 제품 (case.channel='shopee' 케이스)
--   - meta_ads: Meta Ad Library 광고 (Phase 4a)
--   - instagram: IG 모니터링 (Phase 4c)
--   - youtube: YT 모니터링 (Phase 4d) 또는 YoutubeSeeding 라이트
--
-- backfill 룰 — 현재 적재된 데이터 보고 자동 활성화:
--   - contents row 있으면 tiktok_video
--   - case.channel='amazon' + products 있으면 amazon
--   - case.channel='tiktok_shop' + products 있으면 tt_shop
--   - case.channel='shopee' + products 있으면 shopee
--   - meta_ads row 있으면 meta_ads
--   - ig_posts row 있으면 instagram
--   - yt_videos row 있으면 youtube

ALTER TABLE cases ADD COLUMN IF NOT EXISTS data_channels jsonb DEFAULT '[]'::jsonb;

-- backfill 기존 케이스
UPDATE cases c SET data_channels = COALESCE(
  (
    SELECT jsonb_agg(DISTINCT ch ORDER BY ch)
    FROM (
      SELECT 'tiktok_video'::text AS ch
      WHERE EXISTS (
        SELECT 1 FROM contents
        WHERE brand_id = c.brand_id AND country = c.country
        LIMIT 1
      )
      UNION ALL
      SELECT 'amazon'::text
      WHERE c.channel = 'amazon'
        AND EXISTS (SELECT 1 FROM products WHERE case_id = c.id LIMIT 1)
      UNION ALL
      SELECT 'tt_shop'::text
      WHERE c.channel = 'tiktok_shop'
        AND EXISTS (SELECT 1 FROM products WHERE case_id = c.id LIMIT 1)
      UNION ALL
      SELECT 'shopee'::text
      WHERE c.channel = 'shopee'
        AND EXISTS (SELECT 1 FROM products WHERE case_id = c.id LIMIT 1)
      UNION ALL
      SELECT 'meta_ads'::text
      WHERE EXISTS (SELECT 1 FROM meta_ads WHERE case_id = c.id LIMIT 1)
      UNION ALL
      SELECT 'instagram'::text
      WHERE EXISTS (SELECT 1 FROM ig_posts WHERE case_id = c.id LIMIT 1)
      UNION ALL
      SELECT 'youtube'::text
      WHERE EXISTS (SELECT 1 FROM yt_videos WHERE case_id = c.id LIMIT 1)
    ) sub
    WHERE ch IS NOT NULL
  ),
  '[]'::jsonb
)
WHERE data_channels = '[]'::jsonb OR data_channels IS NULL;
