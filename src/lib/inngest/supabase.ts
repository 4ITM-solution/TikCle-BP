import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Inngest 함수 컨텍스트용 Supabase 클라이언트.
 * 쿠키/세션 없는 서버 사이드 환경에서 안전하게 사용.
 *
 * SUPABASE_SERVICE_ROLE_KEY가 있으면 RLS 우회 (선호),
 * 없으면 anon key (RLS off된 테이블만 접근).
 */
export function inngestSupabase() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Inngest Supabase 클라이언트: SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 필요",
    );
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } },
  );
}
