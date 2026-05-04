-- 010_marketplace_country_on_sales.sql
-- 2026-05-04
-- 목적: 옵션 H (하이브리드 country 모델)
--   case.country가 권역 코드(MENA/LATAM_ES)일 때 시딩 데이터는 통합(case.country로 fetch),
--   매출 데이터는 marketplace 단위로 분리 표시.
--   → products / case_product_sales / sales_snapshot에 진짜 국가 코드를 박는 country 컬럼 추가.
--
--   단일 country case (US/KR/JP/TH/SA/AE/...)는 자식 country = case.country로 자동 backfill되어 영향 없음.
--   기존 EQQUALBERRY US case는 모든 자식이 'US'로 박혀 단일 표시 그대로.

-- ==============================================================
-- 1. products.country
-- ==============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN products.country IS
  '진짜 marketplace 국가 코드 (US/KR/JP/SA/AE/MX/...). case.country가 권역(MENA/LATAM_ES)일 때 sub 분리 키. 단일 case는 case.country와 동일.';

-- 기존 row backfill (이미 country IS NULL인 row만)
UPDATE products p SET country = c.country
  FROM cases c
  WHERE p.case_id = c.id AND p.country IS NULL;

-- ==============================================================
-- 2. products unique 제약 변경 (country 포함)
-- ==============================================================
-- 기존 (case_id, asin) UNIQUE는 권역 case에서 SA-ASIN+AE-ASIN(동일 ASIN) 충돌.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_case_asin_unique;
ALTER TABLE products
  ADD CONSTRAINT products_case_country_asin_unique
  UNIQUE (case_id, country, asin);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_case_external_unique;
ALTER TABLE products
  ADD CONSTRAINT products_case_country_external_unique
  UNIQUE (case_id, country, external_product_id);

-- products_brand_channel_name_key는 SA/AE 동일 이름 product 박는 걸 막아 제거.
-- case_id+country+asin이 이미 entity 분리 보장.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_brand_channel_name_key;

-- ==============================================================
-- 3. case_product_sales.country (by-country group용)
-- ==============================================================
ALTER TABLE case_product_sales ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN case_product_sales.country IS
  'product.country와 동일 (denormalized for by-country aggregation).';

UPDATE case_product_sales s SET country = p.country
  FROM products p
  WHERE s.product_id = p.id AND s.country IS NULL;

-- ==============================================================
-- 4. sales_snapshot.country (BSR도 by-country)
-- ==============================================================
ALTER TABLE sales_snapshot ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN sales_snapshot.country IS
  'product.country와 동일.';

UPDATE sales_snapshot s SET country = p.country
  FROM products p
  WHERE s.product_id = p.id AND s.country IS NULL;
