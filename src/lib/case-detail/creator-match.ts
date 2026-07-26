/**
 * BE-25 — 크로스채널 동일인 매칭 (G6, 결정론 엔진 $0).
 *
 * 채널별 핸들이 달라 norm_handle 완전일치로 놓치던 동일 크리에이터를 신호 계단으로 판정:
 *   ① handle 정규화 완전일치 ② bio 상호 링크(ig_authors.linked_handles=bio에서 추출) ③ 표시이름 대조
 *   ④ (후속) 프로필 pHash·콘텐츠 크로스포스팅 지문 → 후보쌍만 LLM 확정.
 * 모순 신호: 팔로워 규모 괴리(soft flag — 크로스채널 팔로워는 원래 다르므로 확정만 막지 않음).
 */

export type Platform = "tiktok" | "instagram" | "youtube";

export type CreatorNode = {
  platform: Platform;
  handle: string; // username / channel_name / handle
  display_name: string | null; // full_name / channel display
  followers: number | null;
  bio_links: Record<string, string> | null; // linked_handles {platform: handle} (bio 추출)
};

/** 핸들/이름 정규화 — 소문자·영숫자만. */
export function normHandle(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// 표시이름 토큰(2+, 일반어 제외) — 이름 대조용.
const NAME_STOP = new Set(["the", "official", "real", "tv", "yt", "ig", "tiktok", "youtube", "channel", "beauty", "hair", "kbeauty"]);
function nameTokens(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of (s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (w.length >= 2 && !NAME_STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export type MatchSignals = {
  handle_exact: boolean;
  bio_link: boolean; // 한쪽 bio가 상대 핸들을 명시
  name_score: number; // 표시이름 토큰 Jaccard
  contradiction_flags: string[];
  verdict: "same" | "maybe" | "diff";
  confidence: "confirmed" | "probable";
  needs_llm: boolean; // name-only 등 LLM 확정 없이 병합 금지
};

// 팔로워 규모 괴리 임계 — 100배 이상이면 soft flag (확정은 강신호로만).
const FOLLOWER_GAP = 100;

export function scoreCreatorPair(a: CreatorNode, b: CreatorNode): MatchSignals {
  const ha = normHandle(a.handle);
  const hb = normHandle(b.handle);
  const handle_exact = ha.length >= 3 && ha === hb;

  // bio 링크: a의 bio_links[b.platform]가 b 핸들 == , 또는 반대
  const bioLink = (x: CreatorNode, y: CreatorNode): boolean => {
    const linked = x.bio_links?.[y.platform];
    return !!linked && normHandle(linked) === normHandle(y.handle);
  };
  const bio_link = bioLink(a, b) || bioLink(b, a);

  const name_score = Math.round(jaccard(nameTokens(a.display_name), nameTokens(b.display_name)) * 100) / 100;

  const flags: string[] = [];
  if (a.followers != null && b.followers != null && a.followers > 0 && b.followers > 0) {
    const ratio = Math.max(a.followers, b.followers) / Math.min(a.followers, b.followers);
    if (ratio >= FOLLOWER_GAP) flags.push("follower_gap");
  }

  // verdict (게이트 반려 대응 2026-07-26):
  //   - same/confirmed는 **강신호(handle 완전일치 or bio 상호링크)만**. 이걸로만 자동 병합·linked_handles.
  //   - 이름 단독(name-only)은 동명이인 오병합 위험 → verdict='maybe'(LLM 확정 대상)로 강등, confidence='probable'.
  //   - 이름 약함 → diff. follower_gap은 확정을 막지 않지만(soft) name-only와 겹치면 LLM 필수(needs_llm).
  let verdict: MatchSignals["verdict"];
  let confidence: MatchSignals["confidence"] = "probable";
  if (handle_exact || bio_link) {
    verdict = "same";
    confidence = "confirmed";
  } else if (name_score >= 0.3) {
    verdict = "maybe"; // name-only는 확정 아님 — LLM으로만 same 승격
  } else {
    verdict = "diff";
  }
  const needs_llm = verdict === "maybe"; // name-only(±follower_gap)는 LLM 확정 필요
  return { handle_exact, bio_link, name_score, contradiction_flags: flags, verdict, confidence, needs_llm };
}

export type CreatorCandidate = { a: CreatorNode; b: CreatorNode; signals: MatchSignals };

/**
 * 크로스채널(다른 플랫폼) 후보쌍 — handle 정규화·이름 토큰·bio 링크 중 하나라도 겹치는 쌍만 스코어링.
 * verdict='diff'(신호 약함)는 제외.
 */
export function creatorCandidatePairs(nodes: CreatorNode[]): CreatorCandidate[] {
  // 색인: normHandle, name token, bio-linked handle
  const byKey = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    if (!k) return;
    const arr = byKey.get(k) ?? [];
    arr.push(i);
    byKey.set(k, arr);
  };
  nodes.forEach((n, i) => {
    const nh = normHandle(n.handle);
    if (nh.length >= 3) add(`h:${nh}`, i);
    for (const t of nameTokens(n.display_name)) add(`n:${t}`, i);
    if (n.bio_links) for (const v of Object.values(n.bio_links)) add(`h:${normHandle(v)}`, i);
  });

  const seen = new Set<string>();
  const out: CreatorCandidate[] = [];
  nodes.forEach((n, i) => {
    const cand = new Set<number>();
    const nh = normHandle(n.handle);
    if (nh.length >= 3) for (const j of byKey.get(`h:${nh}`) ?? []) cand.add(j);
    for (const t of nameTokens(n.display_name)) for (const j of byKey.get(`n:${t}`) ?? []) cand.add(j);
    if (n.bio_links) for (const v of Object.values(n.bio_links)) for (const j of byKey.get(`h:${normHandle(v)}`) ?? []) cand.add(j);
    for (const j of cand) {
      if (j === i) continue;
      const o = nodes[j]!;
      if (o.platform === n.platform) continue; // 크로스채널만
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const signals = scoreCreatorPair(n, o);
      if (signals.verdict === "diff") continue;
      out.push({ a: n, b: o, signals });
    }
  });
  // 강신호 우선 정렬
  return out.sort((x, y) => {
    const sx = (x.signals.handle_exact ? 2 : 0) + (x.signals.bio_link ? 2 : 0) + x.signals.name_score;
    const sy = (y.signals.handle_exact ? 2 : 0) + (y.signals.bio_link ? 2 : 0) + y.signals.name_score;
    return sy - sx;
  });
}
