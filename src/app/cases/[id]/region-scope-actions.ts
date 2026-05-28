"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import type { RegionScope } from "@/lib/case-detail/region-filter";

/**
 * cases.options.region_scope 변경 — IG/YT 풀 필터링 적용.
 */
export async function updateRegionScope(
  case_id: string,
  scope: RegionScope,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (scope !== "global" && scope !== "us-only") {
    return { ok: false, error: `unknown scope: ${scope}` };
  }
  const supabase = await createServer();
  const { data: existing } = await supabase
    .from("cases")
    .select("options")
    .eq("id", case_id)
    .single();
  const opts = (existing?.options ?? {}) as Record<string, unknown>;
  opts.region_scope = scope;
  const { error } = await supabase
    .from("cases")
    .update({ options: opts as never })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
