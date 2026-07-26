"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { detectAmazonBridgesForCase } from "@/lib/case-detail/bridge-batch";

/**
 * BE-21: 케이스의 DTC 랜딩 광고 브릿지→아마존 판별 실행 (E섹션 트리거용). $0 — 공개 페이지 fetch만.
 *   도메인당 1회 fetch → bridge_status 저장. (마이그레이션 023 적용 후 저장 효력.)
 */
export async function detectBridges(
  case_id: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const supabase = await createServer();
  const { data: c, error } = await supabase
    .from("cases")
    .select("brand_keyword")
    .eq("id", case_id)
    .single();
  if (error) return { ok: false, error: error.message };

  const stats = await detectAmazonBridgesForCase(supabase, case_id, {
    brandKeyword: c?.brand_keyword ?? null,
  });
  revalidatePath(`/cases/${case_id}`);
  if (stats.skipped_reason && stats.dtc_ads === 0) {
    return { ok: true, message: stats.skipped_reason };
  }
  return {
    ok: true,
    message: `DTC 광고 ${stats.dtc_ads}건 · 도메인 ${stats.unique_domains}개 중 브릿지 확정 ${stats.confirmed_domains}개 (${stats.updated_ads}건 저장)`,
  };
}
