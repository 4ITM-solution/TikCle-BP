-- 022_meta_ads_tag_failed_reason.sql
-- BE-19: 광고 vision 태깅 영구 실패(만료 썸네일 등) 마킹 컬럼.
-- ⚠️ 적용은 오케스트레이터.
--
-- 배경: interpret-tag(runPhase4aVisionBatch)는 ad_intel IS NULL 광고를 반복 태깅한다.
--   5/2 수집 광고의 fbcdn 썸네일이 403 만료되면 vision이 영구 실패하는데, 실패를 ad_intel=null로
--   남겨(정상 — transient 실패 재시도 위함) → 만료 건은 재실행마다 재시도(유료 재과금) + 영원히
--   remaining>0 → interpret-tag 영구 partial → BE-12 cascade 영구 차단.
--   이 컬럼으로 "영구 실패(만료)"만 마킹해 재시도 풀에서 제외한다. rate-limit/일시 실패는 마킹 안 함(계속 null=재시도).
--
-- 안전성: nullable 컬럼 추가라 기존 로우/코드 무영향. 코드(phase4a-intel·interpret-tag)는 이 컬럼이
--   없어도(적용 전) 죽지 않게 fallback 처리됨 — 적용 후 필터가 실제 효력 발생.

ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS tag_failed_reason text;

COMMENT ON COLUMN meta_ads.tag_failed_reason IS
  'BE-19: vision 태깅 영구 실패 사유 (예: thumbnail_expired). NULL=미실패/재시도 대상.';

-- 적용 후 참고 dry-run:
--   SELECT tag_failed_reason, count(*) FROM meta_ads GROUP BY tag_failed_reason;
