import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * 서버 컴포넌트 / Route Handler / Server Action에서 사용.
 * 인증이 없어도 SSR helper의 cookie 처리는 안전하게 동작.
 */
export async function createServer() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 컨텍스트에선 set 호출 시 에러 — 무시
          }
        },
      },
    },
  );
}

/**
 * Inngest worker 등 cookie 컨텍스트가 없는 곳용 service role 클라이언트.
 * RLS 우회 가능하므로 server-only 코드에서만 사용.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service client");
  }
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } },
  );
}

/**
 * 외부 인플 DB (dynqedcbmanvyfdlruni) — fans 룩업 전용
 */
export function createInfluencerDbClient() {
  return createPlainClient(
    process.env.INFLUENCER_DB_URL!,
    process.env.INFLUENCER_DB_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
