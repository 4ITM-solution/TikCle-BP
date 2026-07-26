-- 025_sku_matching.sql
-- BE-29: SKU 채널 간 동일제품 매칭. ⚠️ 적용은 오케스트레이터.
--
-- Kalodata(한국어·ml) ↔ Amazon(영어·oz) 등 채널별 리스팅을 같은 제품으로 판정 → product_group_id로
-- 묶음. 쌍별 판정 근거·모순 플래그·해제 기록 저장(검증 자동 내장 + 학습).

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_group_id text;
COMMENT ON COLUMN products.product_group_id IS
  'BE-29: 채널 간 동일제품 묶음 id (같은 값=같은 제품). NULL=미묶음/단독.';

CREATE TABLE IF NOT EXISTS product_match_pairs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL,
  product_a     uuid NOT NULL,
  product_b     uuid NOT NULL,
  verdict       text NOT NULL,            -- same | maybe | diff (결정론 판정)
  llm_verdict   text,                     -- same | maybe | diff (LLM 판정, 있으면)
  agree         boolean,                  -- 이중 판정 일치 여부 (verdict==llm_verdict)
  name_score    numeric,                  -- 이름 토큰 Jaccard
  volume_match  text,                     -- match | mismatch | unknown
  category_match text,                    -- match | mismatch | unknown
  price_ratio   numeric,                  -- max/min 가격비
  contradiction_flags text[],             -- category_mismatch | volume_mismatch | price_3x
  method        text NOT NULL DEFAULT 'token_volume_v1',
  unmerged      boolean NOT NULL DEFAULT false,  -- 사용자가 "추정" 해제(학습 신호)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_a, product_b)
);
CREATE INDEX IF NOT EXISTS idx_pmp_case ON product_match_pairs (case_id);
CREATE INDEX IF NOT EXISTS idx_pmp_a ON product_match_pairs (product_a);
CREATE INDEX IF NOT EXISTS idx_pmp_b ON product_match_pairs (product_b);

ALTER TABLE product_match_pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_product_match_pairs ON product_match_pairs;
CREATE POLICY anon_all_product_match_pairs ON product_match_pairs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 적용 후 dry-run:
--   SELECT verdict, agree, count(*) FROM product_match_pairs GROUP BY 1,2;
--   SELECT product_group_id, count(*) FROM products WHERE product_group_id IS NOT NULL GROUP BY 1;
