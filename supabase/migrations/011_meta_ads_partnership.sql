-- meta_ads에 partnership 광고 식별용 컬럼 3개 추가.
--
-- Meta Ad Library의 "X 페이지는 Y와 함께합니다" partnership 광고는
-- 광고 run 주체(브랜드) ≠ 콘텐츠 게시자(인플) 구조.
--   - page_name             = run 주체 (브랜드 페이지명, 기존 컬럼 그대로)
--   - creator_page_name     = 실제 콘텐츠 게시자 (인플 페이지명, 신규)
--   - partner_page_name     = partnership 대상 브랜드 (신규)
--   - partner_page_id       = partnership 대상 브랜드 page_id (신규)
--
-- 우리가 쓰던 curious_coder/facebook-ads-library-scraper는 list endpoint만
-- 긁어서 partnership 정보 못 잡음. apify/facebook-ads-scraper (공식)가 detail
-- endpoint까지 들어가서 snapshot.pageName(creator) + snapshot.brandedContent(partner)
-- 둘 다 노출. case.options.meta_ads_source='official' flag로 공식 액터 사용.

ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS creator_page_name text,
  ADD COLUMN IF NOT EXISTS partner_page_name text,
  ADD COLUMN IF NOT EXISTS partner_page_id text;

-- partnership 광고 빠른 필터링 — partner_page_id 있는 row가 진짜 paid partnership
CREATE INDEX IF NOT EXISTS meta_ads_partner_page_id_idx
  ON meta_ads (case_id, partner_page_id)
  WHERE partner_page_id IS NOT NULL;
