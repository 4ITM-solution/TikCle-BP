import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WS4b: migration 019에서 신설하는 뷰들을 화면에서 읽되, **019 미적용 상태(현행 프로덕션)**
 * 에서도 페이지가 죽지 않게 하는 안전 리더.
 *
 * - 신규 뷰(v_case_angle_tier_month 등)는 types.gen.ts에 없어 typed 클라이언트가 모름 → any 캐스팅.
 * - 뷰가 아직 없으면(관계 미존재) supabase가 error 반환 → [] 로 폴백(빈 상태로 렌더).
 * - 019 apply 후엔 자동으로 실데이터가 채워진다(코드 변경 불필요).
 *
 * 정렬/추가 필터는 build 콜백에서 체이닝. 페이지네이션 없이 최대 `limit` 행.
 */
export async function safeViewRows<T>(
  supabase: SupabaseClient,
  view: string,
  build: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => unknown,
  limit = 5000,
): Promise<T[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = (supabase as any).from(view).select("*").limit(limit);
    const q = build(base) as { then: unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = (await (q as any)) as { data: T[] | null; error: unknown };
    if (resp.error || !resp.data) return [];
    return resp.data;
  } catch {
    return [];
  }
}
