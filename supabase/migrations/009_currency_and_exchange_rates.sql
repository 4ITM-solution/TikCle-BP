-- 009_currency_and_exchange_rates.sql
-- 2026-05-04
-- 목적:
--  1) 매출/단가가 권역별 다른 통화로 들어옴 (SA→SAR, AE→AED, KR→KRW 등)
--     → case_product_sales / sales_snapshot에 currency 컬럼 추가
--  2) 환율은 사용자가 settings page에서 수정 가능해야 함
--     → app_settings 테이블 (key/value JSONB) — exchange_rates row 1개로 모든 환율 저장
--
-- 모두 IF NOT EXISTS / DEFAULT 박혀있어 멱등(re-run 안전).

-- ==============================================================
-- 1. case_product_sales.currency
-- ==============================================================
ALTER TABLE case_product_sales
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN case_product_sales.currency IS
  'ISO 4217 코드 (USD/KRW/SAR/AED/MXN/BRL/JPY/EUR/SGD/THB/MYR/IDR/PHP/VND ...). 케이스 country 기반 default가 임포트 시 박힘.';

-- ==============================================================
-- 2. sales_snapshot.currency
-- ==============================================================
ALTER TABLE sales_snapshot
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN sales_snapshot.currency IS
  'price 컬럼들의 통화. case_product_sales.currency와 동일 정의.';

-- ==============================================================
-- 3. app_settings 테이블 (key/value)
-- ==============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text        NULL
);

COMMENT ON TABLE app_settings IS
  '환율, 운영 토글 등 admin이 UI에서 변경 가능한 설정. 키별로 row 1개.';

-- 인증 미사용이라 RLS off (다른 테이블과 동일 패턴, 005 마이그레이션 참고)
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- ==============================================================
-- 4. exchange_rates 기본값 INSERT
-- ==============================================================
-- 값 = "1 unit of {currency} = X USD" (즉 USD 환산 multiplier).
-- 운영자가 settings page에서 수정. 환율 변동 시 수동 갱신.
INSERT INTO app_settings (key, value)
VALUES (
  'exchange_rates',
  '{
    "USD": 1,
    "KRW": 0.000667,
    "JPY": 0.00641,
    "EUR": 1.087,
    "SAR": 0.267,
    "AED": 0.272,
    "MXN": 0.0588,
    "BRL": 0.20,
    "SGD": 0.746,
    "THB": 0.027,
    "MYR": 0.213,
    "IDR": 0.0000606,
    "PHP": 0.01724,
    "VND": 0.0000392
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
