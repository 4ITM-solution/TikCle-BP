import Anthropic from "@anthropic-ai/sdk";
import { SONNET_MODEL } from "./pricing";
import type { SkuProduct, PairSignals } from "@/lib/case-detail/sku-match";

/**
 * BE-29 — SKU 쌍 동일제품 LLM 판정 ($0.05 규모, SKU 수십 개뿐이라 전 후보쌍 판정 가능).
 * 결정론 신호(sku-match)와 이중 판정해 일치율 검증. 유료 — 실행은 ORCH.
 */
export type LlmPairVerdict = "same" | "maybe" | "diff";
export type LlmPairResult = {
  verdict: LlmPairVerdict;
  reason: string | null;
  tokens_input: number;
  tokens_output: number;
};

const MODEL = SONNET_MODEL;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SYSTEM = `You decide if two product listings from DIFFERENT sales channels are the SAME physical product.
Channels differ in language (Korean vs English) and unit (ml vs fl oz). Same product = same item a shopper
would receive (same formula/variant/size family), even if the title wording, language, or bundle differs.
Different size/variant of the same line = still "same" ONLY if it's clearly the same SKU size; otherwise "diff".
Return ONLY JSON: {"verdict":"same"|"maybe"|"diff","reason":"<short>"}.
Use "maybe" when the titles plausibly match but a key attribute (size, variant, scent) can't be confirmed.`;

export async function judgeSkuPairLlm(
  a: SkuProduct,
  b: SkuProduct,
  signals: PairSignals,
): Promise<LlmPairResult> {
  const user = `Product A (channel ${a.channel}): "${a.name}" | price ${a.price ?? "?"} | category ${a.category ?? "?"}
Product B (channel ${b.channel}): "${b.name}" | price ${b.price ?? "?"} | category ${b.category ?? "?"}
Signals: name_token_overlap=${signals.name_score}, volume=${signals.volume_match}, shared=[${signals.shared_tokens.join(", ")}]${signals.contradiction_flags.length ? ", flags=[" + signals.contradiction_flags.join(",") + "]" : ""}
Same physical product?`;

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 200,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
  });
  const tokens_input = res.usage.input_tokens ?? 0;
  const tokens_output = res.usage.output_tokens ?? 0;
  const tb = res.content.find((c): c is Anthropic.TextBlock => c.type === "text");
  const fail: LlmPairResult = { verdict: "maybe", reason: null, tokens_input, tokens_output };
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
