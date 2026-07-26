-- 027_creator_matching.sql
-- BE-25: 크로스채널 동일인 매칭 (G6). ⚠️ 적용은 오케스트레이터.
--
-- 채널별 핸들이 달라 norm_handle 완전일치로 놓치던 동일 크리에이터를 신호 계단으로 판정 →
-- influencers.linked_handles(1회 판정 영구 재사용) + 쌍별 근거·모순·이중판정 저장(BE-29 원칙).

ALTER TABLE influencers ADD COLUMN IF NOT EXISTS linked_handles jsonb;
COMMENT ON COLUMN influencers.linked_handles IS
  'BE-25: 확정된 크로스채널 핸들 {platform: handle}. 1회 판정 영구 재사용.';

CREATE TABLE IF NOT EXISTS creator_match_pairs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL,
  platform_a    text NOT NULL,          -- tiktok | instagram | youtube
  handle_a      text NOT NULL,
  platform_b    text NOT NULL,
  handle_b      text NOT NULL,
  verdict       text NOT NULL,          -- same | maybe | diff (결정론)
  llm_verdict   text,                   -- same | maybe | diff (LLM, 있으면)
  agree         boolean,                -- 이중 판정 일치
  confidence    text NOT NULL,          -- confirmed | probable (화면 신뢰도 구분)
  signals       jsonb,                  -- {handle_exact, bio_link, name_score, crosspost}
  contradiction_flags text[],           -- follower_gap 등
  method        text NOT NULL DEFAULT 'signal_cascade_v1',
  unmerged      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, platform_a, handle_a, platform_b, handle_b)
);
CREATE INDEX IF NOT EXISTS idx_cmp_case ON creator_match_pairs (case_id);

ALTER TABLE creator_match_pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_creator_match_pairs ON creator_match_pairs;
CREATE POLICY anon_all_creator_match_pairs ON creator_match_pairs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 적용 후 dry-run:
--   SELECT verdict, confidence, agree, count(*) FROM creator_match_pairs GROUP BY 1,2,3;
