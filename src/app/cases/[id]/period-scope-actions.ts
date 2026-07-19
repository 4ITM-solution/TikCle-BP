"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * cases.options.period_scope 변경 — 분석 기간 필터 (start/end 모두 null이면 해제).
 * RegionScope(updateRegionScope)와 동일 패턴.
 */
export async function updatePeriodScope(
  case_id: string,
  start: string | null,
  end: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (start && !DATE_RE.test(start)) return { ok: false, error: `bad start: ${start}` };
  if (end && !DATE_RE.test(end)) return { ok: false, error: `bad end: ${end}` };
  if (start && end && start > end) return { ok: false, error: "시작일이 종료일보다 늦습니다" };
  const supabase = await createServer();
  const { data: existing } = await supabase
    .from("cases")
    .select("options")
    .eq("id", case_id)
    .single();
  const opts = (existing?.options ?? {}) as Record<string, unknown>;
  if (!start && !end) delete opts.period_scope;
  else opts.period_scope = { start, end };
  const { error } = await supabase
    .from("cases")
    .update({ options: opts as never })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
