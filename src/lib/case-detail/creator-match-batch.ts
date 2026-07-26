import type { SupabaseClient } from "@supabase/supabase-js";
import { creatorCandidatePairs, type CreatorNode } from "./creator-match";
import { judgeCreatorPairLlm } from "@/lib/anthropic/creator-match-llm";

/**
 * BE-25 — 케이스 크로스채널 동일인 매칭 배치.
 *   ①TK(influencers via contents)·IG(ig_authors)·YT(yt_channels) 노드 수집 ②결정론 후보쌍
 *   ③(옵션)LLM 이중판정 ④union-find로 확정 그룹 → influencers.linked_handles 저장 ⑤쌍 근거·모순 저장.
 * withLlm=false면 결정론만($0). 테이블/컬럼 미적용이면 저장 skip.
 */
export type CreatorMatchStats = {
  nodes: { tiktok: number; instagram: number; youtube: number };
  candidate_pairs: number;
  confirmed: number; // 확정 쌍 (handle/bio 강신호 또는 LLM=same)
  probable: number;
  groups: number;
  double_judged: number;
  agree: number;
  agreement_rate: number | null;
  contradiction_pairs: number;
  saved: number;
  cost_hint_tokens?: { input: number; output: number };
  skipped_reason?: string;
};

const CHUNK = 500;

export async function matchCreatorsForCase(
  supabase: SupabaseClient,
  caseId: string,
  opts?: { brandId?: string | null; country?: string | null; withLlm?: boolean; persist?: boolean },
): Promise<CreatorMatchStats> {
  const base: CreatorMatchStats = {
    nodes: { tiktok: 0, instagram: 0, youtube: 0 },
    candidate_pairs: 0,
    confirmed: 0,
    probable: 0,
    groups: 0,
    double_judged: 0,
    agree: 0,
    agreement_rate: null,
    contradiction_pairs: 0,
    saved: 0,
  };

  const { data: c } = await supabase.from("cases").select("brand_id, country").eq("id", caseId).single();
  const brandId = opts?.brandId ?? (c?.brand_id as string) ?? null;
  const country = opts?.country ?? (c?.country as string) ?? null;

  const nodes: CreatorNode[] = [];
  const inflByHandle = new Map<string, string>(); // norm handle → influencer id (linked_handles 저장용)

  // TK: 브랜드+국가 contents의 influencer_id → influencers
  if (brandId) {
    const inflIds = new Set<string>();
    for (let off = 0; off < 300000; off += CHUNK) {
      let q = supabase.from("contents").select("influencer_id").eq("brand_id", brandId).not("influencer_id", "is", null);
      if (country) q = q.eq("country", country);
      const { data } = await q.range(off, off + CHUNK - 1);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.influencer_id) inflIds.add(r.influencer_id as string);
      if (data.length < CHUNK) break;
    }
    const ids = [...inflIds];
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase
        .from("influencers")
        .select("id, handle, follower_count, bio")
        .in("id", ids.slice(i, i + 300));
      for (const r of data ?? []) {
        const handle = (r.handle as string) ?? "";
        if (!handle) continue;
        nodes.push({ platform: "tiktok", handle, display_name: handle, followers: (r.follower_count as number) ?? null, bio_links: null });
        inflByHandle.set(handle.toLowerCase().replace(/[^a-z0-9]/g, ""), r.id as string);
        base.nodes.tiktok += 1;
      }
    }
  }

  // IG: ig_authors (username, full_name, followers, linked_handles)
  for (let off = 0; off < 100000; off += CHUNK) {
    const { data } = await supabase
      .from("ig_authors")
      .select("username, full_name, followers, linked_handles")
      .eq("case_id", caseId)
      .range(off, off + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.username) continue;
      nodes.push({
        platform: "instagram",
        handle: r.username as string,
        display_name: (r.full_name as string | null) ?? null,
        followers: (r.followers as number | null) ?? null,
        bio_links: (r.linked_handles as Record<string, string> | null) ?? null,
      });
      base.nodes.instagram += 1;
    }
    if (data.length < CHUNK) break;
  }

  // YT: yt_channels (channel_name, subscriber_count)
  for (let off = 0; off < 100000; off += CHUNK) {
    const { data } = await supabase
      .from("yt_channels")
      .select("channel_name, subscriber_count")
      .eq("case_id", caseId)
      .range(off, off + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.channel_name) continue;
      nodes.push({
        platform: "youtube",
        handle: r.channel_name as string,
        display_name: r.channel_name as string,
        followers: (r.subscriber_count as number | null) ?? null,
        bio_links: null,
      });
      base.nodes.youtube += 1;
    }
    if (data.length < CHUNK) break;
  }

  if (nodes.length < 2) return { ...base, skipped_reason: "노드 < 2" };

  const pairs = creatorCandidatePairs(nodes);
  base.candidate_pairs = pairs.length;
  base.contradiction_pairs = pairs.filter((p) => p.signals.contradiction_flags.length > 0).length;

  // union-find (norm handle 기준 그룹)
  const parent = new Map<string, string>();
  const nkey = (n: CreatorNode) => `${n.platform}:${n.handle.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
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
  for (const n of nodes) parent.set(nkey(n), nkey(n));

  let tIn = 0;
  let tOut = 0;
  const rows: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  for (const p of pairs) {
    let llmVerdict: string | null = null;
    if (opts?.withLlm && process.env.ANTHROPIC_API_KEY && p.signals.verdict !== "same") {
      // 강신호(handle/bio)로 이미 same이면 LLM 생략(비용 절감). 애매(maybe)만 LLM 확정.
      const r = await judgeCreatorPairLlm(p.a, p.b, p.signals);
      llmVerdict = r.verdict;
      tIn += r.tokens_input;
      tOut += r.tokens_output;
      base.double_judged += 1;
      if (r.verdict === p.signals.verdict) base.agree += 1;
    }
    const isSame = p.signals.verdict === "same" || llmVerdict === "same";
    if (isSame) {
      union(nkey(p.a), nkey(p.b));
      if (p.signals.confidence === "confirmed") base.confirmed += 1;
      else base.probable += 1;
    }
    rows.push({
      case_id: caseId,
      platform_a: p.a.platform,
      handle_a: p.a.handle,
      platform_b: p.b.platform,
      handle_b: p.b.handle,
      verdict: p.signals.verdict,
      llm_verdict: llmVerdict,
      agree: llmVerdict != null ? llmVerdict === p.signals.verdict : null,
      confidence: p.signals.confidence,
      signals: {
        handle_exact: p.signals.handle_exact,
        bio_link: p.signals.bio_link,
        name_score: p.signals.name_score,
      },
      contradiction_flags: p.signals.contradiction_flags,
      method: "signal_cascade_v1",
      created_at: now,
    });
  }
  base.agreement_rate = base.double_judged > 0 ? Math.round((base.agree / base.double_judged) * 1000) / 10 : null;
  if (tIn > 0) base.cost_hint_tokens = { input: tIn, output: tOut };

  // 그룹 (2+ 노드)
  const grp = new Map<string, CreatorNode[]>();
  for (const n of nodes) {
    const root = find(nkey(n));
    const arr = grp.get(root) ?? [];
    arr.push(n);
    grp.set(root, arr);
  }
  const realGroups = [...grp.values()].filter((g) => new Set(g.map((x) => x.platform)).size >= 2);
  base.groups = realGroups.length;

  if (opts?.persist === false) return base;

  // 저장: creator_match_pairs + influencers.linked_handles (TK 노드 있는 그룹만).
  if (rows.length > 0) {
    const r = await supabase
      .from("creator_match_pairs")
      .upsert(rows as never, { onConflict: "case_id,platform_a,handle_a,platform_b,handle_b" });
    if (!r.error) base.saved = rows.length;
  }
  for (const g of realGroups) {
    const linked: Record<string, string> = {};
    for (const n of g) linked[n.platform] = n.handle;
    const tk = g.find((n) => n.platform === "tiktok");
    if (!tk) continue;
    const inflId = inflByHandle.get(tk.handle.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (inflId) {
      await supabase.from("influencers").update({ linked_handles: linked } as never).eq("id", inflId);
    }
  }

  return base;
}
