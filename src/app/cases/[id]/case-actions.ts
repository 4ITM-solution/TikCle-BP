"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { isRevenueTier } from "@/lib/case-detail/revenue-tiers";

export async function updateRevenueTier(
  case_id: string,
  tier: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (tier !== null && !isRevenueTier(tier)) {
    return { ok: false, error: `Unknown tier: ${tier}` };
  }
  const supabase = await createServer();
  const { error } = await supabase
    .from("cases")
    .update({ revenue_tier: tier })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cases");
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
