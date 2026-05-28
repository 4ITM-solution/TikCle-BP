-- 013_ig_rls_policies.sql
-- 2026-05-28
-- 목적: ig_posts/ig_authors/ig_runs RLS 정책 박기.
--
-- 함정: migration 012에서 테이블만 만들고 RLS 정책 안 박음. Supabase는
-- 기본 RLS enabled + 정책 없으면 모든 access 차단 → page에서 fetch empty.
-- BP repo의 cases/meta_ads/contents 패턴 따라 "anon read all + anon write all".
-- (BP는 internal tool이라 인증 없음, 모든 anon이 full access).

CREATE POLICY "anon read ig_posts" ON ig_posts FOR SELECT TO anon USING (true);
CREATE POLICY "anon write ig_posts" ON ig_posts FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon read ig_authors" ON ig_authors FOR SELECT TO anon USING (true);
CREATE POLICY "anon write ig_authors" ON ig_authors FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon read ig_runs" ON ig_runs FOR SELECT TO anon USING (true);
CREATE POLICY "anon write ig_runs" ON ig_runs FOR ALL TO anon USING (true) WITH CHECK (true);
