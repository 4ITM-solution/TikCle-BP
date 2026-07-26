-- 024_ad_original_candidates.sql
-- BE-30: 광고 "원본 후보" 텍스트 대조 결과 저장. ⚠️ 적용은 오케스트레이터.
--
-- meta_ads.body_text × (contents.caption + case_video_analyses.asr_text) 정규화 대조 → 후보.
-- **확정 아님(후보)** — E 원본 후보 배지·교집합 "2차 가공" 근거의 데이터 소스. pHash 2차는 후속.
--
-- 멱등 재계산: (ad_id, content_id) unique → 재실행 시 upsert. method='text_normalize_v1'.

CREATE TABLE IF NOT EXISTS ad_original_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL,
  ad_id         uuid NOT NULL,
  content_id    text NOT NULL,
  score         numeric NOT NULL,
  method        text NOT NULL DEFAULT 'text_normalize_v1',
  shared_terms  text[],
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_orig_cand_case ON ad_original_candidates (case_id);
CREATE INDEX IF NOT EXISTS idx_ad_orig_cand_ad ON ad_original_candidates (ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_orig_cand_content ON ad_original_candidates (content_id);

-- RLS 통일(내부 도구 전제, 020 패턴): anon full access.
ALTER TABLE ad_original_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_ad_original_candidates ON ad_original_candidates;
CREATE POLICY anon_all_ad_original_candidates ON ad_original_candidates
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 적용 후 dry-run:
--   SELECT case_id, count(*) FROM ad_original_candidates GROUP BY case_id;
