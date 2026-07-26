import Anthropic from "@anthropic-ai/sdk";
import { SONNET_MODEL } from "./pricing";
import type { CreatorNode, MatchSignals } from "@/lib/case-detail/creator-match";

/**
 * BE-25 — 크로스채널 크리에이터 쌍 동일인 LLM 확정. 결정론 신호와 이중 판정(BE-29 원칙). 유료 — ORCH.
 */
export type CreatorLlmVerdict = "same" | "maybe" | "diff";
export type CreatorLlmResult = {
  verdict: CreatorLlmVerdict;
  reason: string | null;
  tokens_input: number;
  tokens_output: number;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SYSTEM = `You decide if two social accounts on DIFFERENT platforms belong to the SAME person/creator.
Signals: identical/near handle, one bio linking the other, matching display name, same niche.
Cross-platform follower counts naturally differ — do NOT treat a follower gap as evidence against a match.
Return ONLY JSON: {"verdict":"same"|"maybe"|"diff","reason":"<short>"}.
"same" only with a clear identity link (handle/bio/name). "maybe" if plausible but unconfirmable. "diff" otherwise.`;

export async function judgeCreatorPairLlm(
  a: CreatorNode,
  b: CreatorNode,
  signals: MatchSignals,
): Promise<CreatorLlmResult> {
  const desc = (n: CreatorNode) =>
    `${n.platform} @${n.handle}${n.display_name ? ` ("${n.display_name}")` : ""}${n.followers != null ? ` · ${n.followers} followers` : ""}${n.bio_links && Object.keys(n.bio_links).length ? ` · bio links ${JSON.stringify(n.bio_links)}` : ""}`;
  const user = `A: ${desc(a)}
B: ${desc(b)}
Signals: handle_exact=${signals.handle_exact}, bio_link=${signals.bio_link}, name_score=${signals.name_score}${signals.contradiction_flags.length ? `, flags=[${signals.contradiction_flags.join(",")}]` : ""}
Same person?`;

  const res = await getClient().messages.create({
    model: SONNET_MODEL,
    max_tokens: 200,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  });
  const tokens_input = res.usage.input_tokens ?? 0;
  const tokens_output = res.usage.output_tokens ?? 0;
  const tb = res.content.find((c): c is Anthropic.TextBlock => c.type === "text");
  const fail: CreatorLlmResult = { verdict: "maybe", reason: null, tokens_input, tokens_output };
  if (!tb) return fail;
  try {
    const j = JSON.parse(tb.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()) as {
      verdict?: string;
      reason?: string;
    };
    const v = j.verdict === "same" || j.verdict === "diff" || j.verdict === "maybe" ? j.verdict : "maybe";
    return { verdict: v, reason: typeof j.reason === "string" ? j.reason.slice(0, 200) : null, tokens_input, tokens_output };
  } catch {
    return fail;
  }
}
