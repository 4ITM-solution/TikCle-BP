import type { SupabaseClient } from "@supabase/supabase-js";
import { candidatePairs, type SkuProduct } from "./sku-match";
import { judgeSkuPairLlm } from "@/lib/anthropic/sku-match-llm";

/**
 * BE-29 — 케이스 SKU 채널 간 동일제품 매칭 배치.
 *   ①결정론 후보쌍 ②(옵션) LLM 쌍 판정 ③이중 판정 일치율 ④union-find로 product_group_id 부여
 *   ⑤product_match_pairs에 신호·모순플래그·근거 저장.
 * withLlm=false면 결정론만(무료). true면 LLM 판정 병행(유료 — ORCH). 테이블/컬럼 미적용이면 저장 skip.
 */
export type SkuMatchStats = {
  products: number;
  candidate_pairs: number;
  same_pairs: number; // 확정 그룹핑에 쓴 쌍 (LLM 있으면 LLM=same, 없으면 결정론=same)
  groups: number;
  double_judged: number;
  agree: number; // 이중 판정 일치 수
  agreement_rate: number | null;
  contradiction_pairs: number; // 모순 플래그 1+ 쌍
  saved: number;
  cost_hint_tokens?: { input: number; output: number };
  skipped_reason?: string;
};

export async function matchSkusForCase(
  supabase: SupabaseClient,
  caseId: string,
  opts?: { brandTokens?: string[]; withLlm?: boolean; persist?: boolean },
): Promise<SkuMatchStats> {
  const base: SkuMatchStats = {
    products: 0,
    candidate_pairs: 0,
    same_pairs: 0,
    groups: 0,
    double_judged: 0,
    agree: 0,
    agreement_rate: null,
    contradiction_pairs: 0,
    saved: 0,
  };

  const { data: ps, error } = await supabase
    .from("products")
    .select("id, name, channel, price, category")
    .eq("case_id", caseId);
  if (error) return { ...base, skipped_reason: `products: ${error.message}` };
  const products: SkuProduct[] = (ps ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? "",
    channel: (p.channel as string) ?? "",
    price: (p.price as number | null) ?? null,
    category: (p.category as string | null) ?? null,
  }));
  base.products = products.length;
  if (products.length < 2) return { ...base, skipped_reason: "products < 2" };

  const brandTokens = opts?.brandTokens ?? [];
  const pairs = candidatePairs(products, brandTokens);
  base.candidate_pairs = pairs.length;
  base.contradiction_pairs = pairs.filter((p) => p.signals.contradiction_flags.length > 0).length;

  // union-find (product_group_id 부여용)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of products) parent.set(p.id, p.id);

  let tIn = 0;
  let tOut = 0;
  const rows: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  for (const c of pairs) {
    let llmVerdict: string | null = null;
    if (opts?.withLlm && process.env.ANTHROPIC_API_KEY) {
      const r = await judgeSkuPairLlm(c.a, c.b, c.signals);
      llmVerdict = r.verdict;
      tIn += r.tokens_input;
      tOut += r.tokens_output;
      base.double_judged += 1;
      if (r.verdict === c.signals.verdict) base.agree += 1;
    }
    // 그룹핑 판단: LLM 있으면 LLM=same, 없으면 결정론=same
    const groupSame = opts?.withLlm ? llmVerdict === "same" : c.signals.verdict === "same";
    if (groupSame) {
      union(c.a.id, c.b.id);
      base.same_pairs += 1;
    }
    const [pa, pb] = c.a.id < c.b.id ? [c.a.id, c.b.id] : [c.b.id, c.a.id];
    rows.push({
      case_id: caseId,
      product_a: pa,
      product_b: pb,
      verdict: c.signals.verdict,
      llm_verdict: llmVerdict,
      agree: llmVerdict != null ? llmVerdict === c.signals.verdict : null,
      name_score: c.signals.name_score,
      volume_match: c.signals.volume_match,
      category_match: c.signals.category_match,
      price_ratio: c.signals.price_ratio,
      contradiction_flags: c.signals.contradiction_flags,
      method: "token_volume_v1",
      created_at: now,
    });
  }
  base.agreement_rate = base.double_judged > 0 ? Math.round((base.agree / base.double_judged) * 1000) / 10 : null;
  if (tIn > 0) base.cost_hint_tokens = { input: tIn, output: tOut };

  // 그룹 산출: 2개+ 멤버 그룹만 product_group_id로.
  const groupMembers = new Map<string, string[]>();
  for (const p of products) {
    const root = find(p.id);
    const arr = groupMembers.get(root) ?? [];
    arr.push(p.id);
    groupMembers.set(root, arr);
  }
  const realGroups = [...groupMembers.entries()].filter(([, ids]) => ids.length >= 2);
  base.groups = realGroups.length;

  if (opts?.persist === false) return base;

  // 저장: product_match_pairs upsert (테이블 미적용이면 skip) + products.product_group_id.
  if (rows.length > 0) {
    const r = await supabase
      .from("product_match_pairs")
      .upsert(rows as never, { onConflict: "product_a,product_b" });
    if (!r.error) base.saved = rows.length;
  }
  for (const [root, ids] of realGroups) {
    await supabase
      .from("products")
      .update({ product_group_id: root } as never)
      .in("id", ids);
  }

  return base;
}
