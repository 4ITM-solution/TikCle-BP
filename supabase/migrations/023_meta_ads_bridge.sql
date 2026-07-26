-- 023_meta_ads_bridge.sql
-- BE-21: 광고 랜딩 "브릿지→아마존" 판별 결과 저장. ⚠️ 적용은 오케스트레이터.
--
-- 자사 도메인(DTC) 랜딩 광고가 실제로는 아마존으로 유도(Amazon Attribution maas/aa_maas)하는지
-- HTML 1회 fetch로 판별($0). 랜딩 도메인 단위로 1회 판별해 같은 도메인 광고에 일괄 적용.
--
-- bridge_status: 'confirmed'(아마존 attribution 버튼 발견) | 'unconfirmed'(버튼 미확인/접속 불가).
--   NULL = 미판별(자사 도메인 아님 또는 아직 미실행). E섹션 배지·교집합 근거 소스.
-- nullable 컬럼 추가라 기존 로우/코드 무영향. 코드는 컬럼 없어도 죽지 않게 fallback.

ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS bridge_status text;
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS bridge_amazon_url text;
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS bridge_checked_at timestamptz;

COMMENT ON COLUMN meta_ads.bridge_status IS
  'BE-21: 랜딩 브릿지 판별. confirmed=아마존 attribution 버튼 발견 / unconfirmed=버튼 미확인. NULL=미판별.';

-- 적용 후 dry-run:
--   SELECT bridge_status, count(*) FROM meta_ads GROUP BY bridge_status;
