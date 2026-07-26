"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { matchCreatorsForCase } from "@/lib/case-detail/creator-match-batch";

/**
 * BE-25: 케이스 크로스채널 동일인 매칭 실행 (B 매트릭스 트리거). withLlm=true는 유료(ORCH).
 */
export async function matchCreators(
  case_id: string,
  opts?: { withLlm?: boolean },
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const supabase = await createServer();
  const st = await matchCreatorsForCase(supabase, case_id, { withLlm: opts?.withLlm ?? false });
  revalidatePath(`/cases/${case_id}`);
  const agree = st.agreement_rate != null ? ` · 이중판정 일치율 ${st.agreement_rate}%` : "";
  return {
    ok: true,
    message: `노드 TK${st.nodes.tiktok}/IG${st.nodes.instagram}/YT${st.nodes.youtube} · 확정 ${st.confirmed}·추정 ${st.probable}·그룹 ${st.groups}·모순 ${st.contradiction_pairs}${agree}`,
  };
}

/**
 * BE-25: 오판 링크 해제 (학습 신호). 해당 쌍 unmerged=true.
 */
export async function unmergeCreatorPair(
  case_id: string,
  platform_a: string,
  handle_a: string,
  platform_b: string,
  handle_b: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServer();
  const r = await supabase
    .from("creator_match_pairs")
    .update({ unmerged: true } as never)
    .eq("case_id", case_id)
    .eq("platform_a", platform_a)
    .eq("handle_a", handle_a)
    .eq("platform_b", platform_b)
    .eq("handle_b", handle_b);
  if (r.error) return { ok: false, error: r.error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
