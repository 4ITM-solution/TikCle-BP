-- 021_cases_channel_not_null.sql
-- BE-8 (QA-2 F5): cases.channel 은 앱 타입상 필수(NOT NULL)인데 DB 제약이 없어 NULL이 새어들어옴.
--   → 배치 케이스 생성 결함으로 channel=NULL 케이스 3건 발생(빈 케이스). DB에서 NOT NULL 강제.
-- ⚠️ 적용은 오케스트레이터. 적용 전 dry-run 블록으로 NULL 목록 재확인.
--
-- 2026-07-07 실측(프로덕션 dxjodlxkynjirldpumxr, SELECT):
--   channel 분포: amazon=62, tiktok_shop=25, shopee=2, other=1, NULL=3
--   NULL 3건 (전부 US, config 신호 없음 — ig/yt/ttshop 전부 미설정, brand_keyword만 존재):
--     3bd04219-7b97-4b49-bc34-e50185679040  (biodance)
--     ed5623cd-bb8c-4f3c-8eea-4d028fd26f49  (torriden)
--     918b749e-1ea9-46f0-b259-918c9755e382  (equalberry)
--   → 채널 추론 불가(수집 데이터 전무, QA-2 F5 빈 케이스). 'other'(기존 enum 값)로 백필.
--     ORCH가 이 3건을 삭제(R12) 선호 시 백필 대신 삭제 후 SET NOT NULL 가능.

BEGIN;

-- 1) NULL 백필 — 추론 불가한 빈 케이스는 'other'(미분류)로. 명시적 3건만.
UPDATE cases SET channel = 'other'
WHERE channel IS NULL
  AND id IN (
    '3bd04219-7b97-4b49-bc34-e50185679040',
    'ed5623cd-bb8c-4f3c-8eea-4d028fd26f49',
    '918b749e-1ea9-46f0-b259-918c9755e382'
  );

-- 2) 남은 NULL 가드 — 위 목록 밖 NULL이 새로 생겼으면 중단(맹목 백필 금지).
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM cases WHERE channel IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ABORT: channel NULL % 건 잔존 — 목록 갱신 후 재실행', n;
  END IF;
END $$;

-- 3) NOT NULL 제약 (앱 타입 계약과 일치, 향후 유입 차단)
ALTER TABLE cases ALTER COLUMN channel SET NOT NULL;

COMMIT;

-- ============================================================================
-- ORCH 적용 전 dry-run:
--   SELECT id, country, brand_keyword FROM cases WHERE channel IS NULL;
--   SELECT channel, count(*) FROM cases GROUP BY channel ORDER BY 2 DESC;
-- 적용 후: 위 첫 쿼리 0행이어야 정상.
-- ============================================================================
