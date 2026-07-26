"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { matchSkusForCase } from "@/lib/case-detail/sku-match-batch";

/**
 * BE-29: 케이스 SKU 채널 간 동일제품 매칭 실행 (D 통합 SKU 표 트리거). withLlm=true는 유료(ORCH).
 */
export async function matchSkus(
  case_id: string,
  opts?: { withLlm?: boolean },
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const supabase = await createServer();
  const { data: c, error } = await supabase
    .from("cases")
    .select("brand_id")
    .eq("id", case_id)
    .single();
  if (error) return { ok: false, error: error.message };
  let brandTokens: string[] = [];
  if (c?.brand_id) {
    const { data: b } = await supabase.from("brands").select("name").eq("id", c.brand_id).single();
    const nm = (b?.name as string) ?? "";
    brandTokens = nm.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  }
  const st = await matchSkusForCase(supabase, case_id, {
    brandTokens,
    withLlm: opts?.withLlm ?? false,
  });
  revalidatePath(`/cases/${case_id}`);
  const agree = st.agreement_rate != null ? ` · 이중판정 일치율 ${st.agreement_rate}%` : "";
  return {
    ok: true,
    message: `제품 ${st.products} · 후보쌍 ${st.candidate_pairs} · 묶음 ${st.groups}개 · 모순 ${st.contradiction_pairs}쌍${agree}`,
  };
}

/**
 * BE-29: "추정" 묶음 해제 (학습 신호). 해당 쌍 unmerged=true + 두 제품의 product_group_id 해제.
 */
export async function unmergeSkuPair(
  case_id: string,
  product_a: string,
  product_b: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServer();
  const r = await supabase
    .from("product_match_pairs")
    .update({ unmerged: true } as never)
    .eq("product_a", product_a)
    .eq("product_b", product_b);
  if (r.error) return { ok: false, error: r.error.message };
  // 해제된 제품은 그룹에서 분리 (단순화: 두 제품 모두 group_id null — 재실행 시 재판정)
  await supabase
    .from("products")
    .update({ product_group_id: null } as never)
    .in("id", [product_a, product_b]);
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
