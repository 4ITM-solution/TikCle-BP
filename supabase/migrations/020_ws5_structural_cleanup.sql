-- 020_ws5_structural_cleanup.sql
-- WS5 §4 구조 청소 — 죽은 테이블 drop · status 통일 · RLS 통일. (R12 준수)
-- ⚠️ 적용은 오케스트레이터. 적용 전 아래 "dry-run 쿼리 블록"으로 카운트 재확인 필수.
-- 019는 미사용(WS5 지시서가 이 청소를 "020"으로 명명) — 번호 갭은 의도적.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- R12 체크리스트
--   [x] dry-run 리포트 첨부 (아래 카운트, 2026-07-07 실측 · docs/ws/WS5_REPORT.md BE-3)
--   [x] 명시적 대상 목록만 drop (아래 6개), 휴리스틱(언어감지 등) 삭제 판단 없음
--   [x] 0행 아닌 테이블은 drop에서 제외 (spec/01 §3의 "전부 0행" 가정이 실측서 다수 반증됨)
--   [x] DROP 직전 0행 가드(assert) — 적용 시점 재확인, 0행 아니면 RAISE로 중단
--   [ ] 백업: drop 대상 전부 0행이라 백업 무의미(데이터 없음). 비-0 테이블은 애초에 제외.
--
-- 2026-07-07 실측 카운트 (프로덕션 dxjodlxkynjirldpumxr, SELECT):
--   ── DROP 대상 (0행) ──
--     internal_notes         = 0
--     campaign_executions    = 0
--     pipeline_runs          = 0   (phase_runs로 대체됨, 코드 참조 delist: 020 동반 커밋)
--     viral_clusters         = 0   (content_clusters로 대체)
--     case_rejections        = 0
--     case_video_assets      = 0
--   ── 제외 (0행 아님 / 살아있는 코드 참조) ──
--     sales_monthly          = 650  ⚠️ spec은 0행이라 했으나 실측 650 → 제외 (원인 조사 필요)
--     viral_bsr_impacts      = 742  ⚠️ 실측 742 → 제외 (BSR 변곡점 이관은 별건)
--     app_settings           = 1    settings/diagnose pricing·exchange_rates 라이브 코드 참조 → 제외
--     seeding_packages       = 13   settings/packages 페이지 라이브 CRUD → 제외
--     promotion_events       = 54   WS4 완결성 ⑥축 시드 예정 (설계상 유지)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) 죽은 테이블 DROP -----------------------------------------------------------
--    적용 시점 0행 재확인(가드). 하나라도 0행 아니면 전체 트랜잭션 중단.
DO $$
DECLARE t text; c bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'internal_notes','campaign_executions','pipeline_runs',
    'viral_clusters','case_rejections','case_video_assets'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO c;
      IF c <> 0 THEN
        RAISE EXCEPTION 'ABORT drop %: % rows — 0행 아님(R12 위반). 재조사 후 진행', t, c;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS internal_notes CASCADE;
DROP TABLE IF EXISTS campaign_executions CASCADE;
DROP TABLE IF EXISTS pipeline_runs CASCADE;
DROP TABLE IF EXISTS viral_clusters CASCADE;
DROP TABLE IF EXISTS case_rejections CASCADE;
DROP TABLE IF EXISTS case_video_assets CASCADE;

-- 2) status enum 통일: completed(2026-07-07 실측 4케이스) → ready ------------------
--    게이트는 R8대로 "데이터 존재"로 판단하므로 enum 축소는 안전.
UPDATE cases SET status = 'ready' WHERE status = 'completed';

-- 3) RLS 통일 (Supabase advisor "RLS disabled" 경고 소거) -----------------------
--    내부 도구 전제(013/014/017 패턴): anon full access. service_role은 RLS 우회.
--    전 public 테이블에 RLS enable + 멱등 anon-all 정책(anon_all_<table>) 보장.
DO $$
DECLARE r record; pol text;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    pol := 'anon_all_' || r.tablename;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
      pol, r.tablename
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- ORCH 적용 전 dry-run 쿼리 블록 (먼저 실행해 카운트/상태 재확인)
-- ----------------------------------------------------------------------------
-- SELECT 'internal_notes' t, count(*) n FROM internal_notes
-- UNION ALL SELECT 'campaign_executions', count(*) FROM campaign_executions
-- UNION ALL SELECT 'pipeline_runs', count(*) FROM pipeline_runs
-- UNION ALL SELECT 'viral_clusters', count(*) FROM viral_clusters
-- UNION ALL SELECT 'case_rejections', count(*) FROM case_rejections
-- UNION ALL SELECT 'case_video_assets', count(*) FROM case_video_assets
-- -- 제외 확인(비어있으면 drop 재검토):
-- UNION ALL SELECT 'sales_monthly', count(*) FROM sales_monthly
-- UNION ALL SELECT 'viral_bsr_impacts', count(*) FROM viral_bsr_impacts
-- UNION ALL SELECT 'app_settings', count(*) FROM app_settings
-- UNION ALL SELECT 'seeding_packages', count(*) FROM seeding_packages;
--
-- SELECT status, count(*) FROM cases GROUP BY status;   -- completed → 0 이어야 apply 후
-- ============================================================================
--
-- 적용 순서 (중요): (1) drop 대상 테이블을 참조 목록에서 제거한 코드 배포
--   (case-actions.ts 병합 목록·upload-actions.ts 리셋 목록 — 020 동반 커밋) →
--   (2) 본 마이그레이션 apply → (3) `npm run db:types` 재생성.
