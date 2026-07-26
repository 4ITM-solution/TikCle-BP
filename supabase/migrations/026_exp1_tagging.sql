-- 026_exp1_tagging.sql
-- BE-28(EXP-1): 태깅 실험 부산물 저장 컬럼. ⚠️ 적용은 오케스트레이터.
--
-- 딥 태깅 결과·다운로드 영상 경로를 기존 vision_tags를 덮지 않고 별도 컬럼에 저장(멱등 upsert).
-- exp_vision_tags: 실험 조합 결과(jsonb, 조합키→tags). exp_run_tag: 실험 run 식별.
-- video_storage_path: 다운로드 영상 Storage 경로(U-9 주요 영상 보관 정책 시작점, 삭제 금지).

ALTER TABLE case_video_analyses ADD COLUMN IF NOT EXISTS exp_vision_tags jsonb;
ALTER TABLE case_video_analyses ADD COLUMN IF NOT EXISTS exp_run_tag text;
ALTER TABLE case_video_analyses ADD COLUMN IF NOT EXISTS video_storage_path text;

COMMENT ON COLUMN case_video_analyses.exp_vision_tags IS
  'BE-28: EXP-1 실험 조합별 태깅 결과 {combo: tags}. 기존 vision_tags 미변경.';
COMMENT ON COLUMN case_video_analyses.video_storage_path IS
  'BE-28/U-9: 다운로드 영상 Storage 경로. 주요 영상 보관(삭제 금지).';

-- 적용 후 dry-run:
--   SELECT exp_run_tag, count(*) FROM case_video_analyses WHERE exp_run_tag IS NOT NULL GROUP BY 1;
