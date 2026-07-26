import Anthropic from "@anthropic-ai/sdk";
import { SONNET_MODEL } from "./pricing";
import type { KeyMessage } from "@/lib/inngest/types";

/**
 * BE-22 — 브랜드 "키 메시지" 추출 ($0.1~0.3/케이스, LLM 1회).
 *
 * usp_keywords(캡션 n-gram 빈도)는 플랫폼/유통/PR 상투어(fyp·gifted·official·global 등)가 상위를
 * 점령해 진짜 포지셔닝 문구(예: Kundal의 protein·bonding)가 묻힘. 여기서는:
 *   ① 상투어 사전 제거로 distinctive term 랭킹 정제
 *   ② 코퍼스 = 캡션 + vision_tags.overlay_text(화면 자막) + ASR + products_visible
 *   ③ LLM 1회 요약(영상별 아님 → 저비용)으로 "반복 주장 키 메시지 3~5개 + 근거 영상 URL"
 */

// 영어 문법 함수어 — 항상 제거(키 메시지가 될 수 없음). phase5 STOPWORDS와 동일 취지.
const GRAMMAR_STOPWORDS = new Set<string>([
  "the","and","for","you","your","this","that","with","are","was","were","have",
  "has","had","not","but","all","can","get","got","out","now","its","from","they",
  "them","our","who","what","when","where","why","how","some","any","just","too",
  "very","more","most","then","than","there","here","been","being","will","would",
  "could","should","also","into","over","only","own","same","such","because","about",
  "your","yours","mine","ours","one","two","use","using","used","make","made","dont",
  "cant","its","itsa","were","weve","youve","youre","theyre","thats","whats",
]);

// 플랫폼/유통/PR/시딩/리테일러 상투어 — 카테고리 무관 노이즈.
export const MARKETING_STOPWORDS = new Set<string>([
  "fyp","foryou","foryoupage","fypage","viral","trending","tiktok","tiktokmademebuyit",
  "tiktokshop","tiktokfinds","reels","reel","insta","instagram","explore","explorepage",
  "gifted","gift","pr","prpackage","sponsored","ad","ads","partner","partnership",
  "collab","official","global","brand","branded","seeding","seeded",
  "giveaway","giving","win","winner","free","freebie","link","bio","linkinbio",
  "shop","shopnow","buy","order","sale","discount","code","promo","coupon","deal",
  "follow","followers","following","like","comment","share","subscribe","tag",
  "review","unboxing","haul","restock","trend","trendy","musthave","obsessed",
  "korean","kbeauty","koreanbeauty","koreanhaircare","haircare","hairtok","skincaretok",
  "skincare","beauty","beautytok","product","products","routine","ootd",
  // 리테일러/유통 (브랜드 메시지 아님)
  "amazon","target","walmart","sephora","ulta","costco","kundalus","kundaltarget",
  // 한국어 상투어
  "협찬","광고","체험단","공구","이벤트","할인","링크","프로필","구매","선물",
]);

const TOKEN_RE = /[0-9a-z가-힣]+/g;

/**
 * 캡션 목록에서 상투어 제거 후 distinctive term(1~2gram) 랭킹. 순수 함수.
 * brandTokens(브랜드명/키워드 토큰)와 extraStop(문법 불용어)도 제거.
 */
export function rankDistinctiveTerms(
  captions: string[],
  opts?: { brandTokens?: string[]; extraStop?: Set<string>; minCount?: number; topN?: number },
): Array<{ term: string; count: number; pct: number }> {
  const brandStop = new Set((opts?.brandTokens ?? []).map((s) => s.toLowerCase()));
  const grammar = opts?.extraStop ?? new Set<string>();
  const minCount = opts?.minCount ?? 3;
  const topN = opts?.topN ?? 25;
  const isStop = (w: string) =>
    MARKETING_STOPWORDS.has(w) || GRAMMAR_STOPWORDS.has(w) || brandStop.has(w) ||
    grammar.has(w) || /^\d+$/.test(w) || w.length < 3;

  const counts = new Map<string, number>();
  let total = 0;
  for (const capRaw of captions) {
    const cap = (capRaw ?? "").toLowerCase();
    if (!cap.trim()) continue;
    total += 1;
    const words = (cap.match(TOKEN_RE) ?? []).filter((w) => !isStop(w));
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i += 1) {
      if (!seen.has(words[i]!)) {
        seen.add(words[i]!);
        counts.set(words[i]!, (counts.get(words[i]!) ?? 0) + 1);
      }
      if (i + 1 < words.length) {
        const bg = `${words[i]} ${words[i + 1]}`;
        if (!seen.has(bg)) {
          seen.add(bg);
          counts.set(bg, (counts.get(bg) ?? 0) + 1);
        }
      }
    }
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({
      term,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

export type KeyMessageDoc = {
  url: string;
  caption: string | null;
  overlay_text: string | null; // vision_tags.overlay_text
  asr_text: string | null;
  products_visible: string[] | null;
};

const MODEL = SONNET_MODEL;
const MAX_TOKENS = 900;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type KeyMessageResult = {
  key_messages: KeyMessage[];
  tokens_input: number;
  tokens_output: number;
};

/**
 * LLM 1회로 브랜드 키 메시지 추출. ranked terms(상투어 제거된 상위 distinctive 신호)와 대표 영상
 * 코퍼스(캡션+overlay+ASR+products)를 주고, "브랜드가 반복 주장하는 포지셔닝 문구 3~5개 + 근거
 * 영상 URL"을 JSON으로 받는다. 영상별 호출이 아니라 코퍼스 1회 → 저비용.
 */
export async function extractKeyMessages(
  brandName: string,
  rankedTerms: Array<{ term: string; count: number }>,
  docs: KeyMessageDoc[],
): Promise<KeyMessageResult> {
  const empty: KeyMessageResult = { key_messages: [], tokens_input: 0, tokens_output: 0 };
  if (docs.length === 0) return empty;

  const termLine = rankedTerms
    .slice(0, 25)
    .map((t) => `${t.term}(${t.count})`)
    .join(", ");
  const corpus = docs
    .slice(0, 60)
    .map((d, i) => {
      const parts = [
        d.caption?.trim(),
        d.overlay_text?.trim() ? `[자막]${d.overlay_text.trim()}` : "",
        d.asr_text?.trim() ? `[음성]${d.asr_text.trim().slice(0, 200)}` : "",
        d.products_visible?.length ? `[제품]${d.products_visible.join(",")}` : "",
      ].filter(Boolean);
      return `#${i} ${d.url}\n${parts.join(" ")}`.slice(0, 500);
    })
    .join("\n\n");

  const system = `You extract a brand's repeated KEY MESSAGES (positioning claims) from its creator content corpus.
A key message is a SPECIFIC positioning claim the brand repeats — an ingredient, mechanism, credential, or benefit
(e.g. "Salmon PDRN", "Derma Clinic tested", "protein bonding repair"). NOT generic marketing/platform words.

Return ONLY valid JSON (no markdown):
{"key_messages":[{"message":"<short claim>","rationale":"<why, 1 line>","evidence_indices":[<doc # ints, max 3>]}]}
Rules: 3-5 messages, ordered by how consistently the brand repeats them. Prefer specific/technical over generic.
Ignore platform/seeding/PR words (fyp, gifted, official, global, viral, giveaway). Base claims on the corpus text.`;

  const user = `Brand: ${brandName}
Distinctive terms (stopwords removed, freq): ${termLine}

Corpus (creator videos, # = index):
${corpus}`;

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  });

  const tokens_input = res.usage.input_tokens ?? 0;
  const tokens_output = res.usage.output_tokens ?? 0;
  const textBlock = res.content.find(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  if (!textBlock) return { ...empty, tokens_input, tokens_output };

  let parsed: unknown;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { ...empty, tokens_input, tokens_output };
  }
  const arr = (parsed as { key_messages?: unknown }).key_messages;
  if (!Array.isArray(arr)) return { ...empty, tokens_input, tokens_output };

  const key_messages: KeyMessage[] = [];
  for (const m of arr) {
    const mm = m as { message?: unknown; rationale?: unknown; evidence_indices?: unknown };
    if (typeof mm.message !== "string" || !mm.message.trim()) continue;
    const idxs = Array.isArray(mm.evidence_indices)
      ? mm.evidence_indices.filter((x): x is number => typeof x === "number")
      : [];
    const evidence_urls = idxs
      .map((i) => docs[i]?.url)
      .filter((u): u is string => !!u)
      .slice(0, 3);
    key_messages.push({
      message: mm.message.trim().slice(0, 120),
      rationale: typeof mm.rationale === "string" ? mm.rationale.slice(0, 200) : null,
      evidence_urls,
    });
    if (key_messages.length >= 5) break;
  }
  return { key_messages, tokens_input, tokens_output };
}
