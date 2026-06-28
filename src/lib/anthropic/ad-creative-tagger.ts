import Anthropic from "@anthropic-ai/sdk";

/**
 * 메타 광고 크리에이티브 1개(썸네일 + 캡션 + 포맷)를 Sonnet Vision으로 분석.
 * vision-tagger.ts(틱톡용) 패턴을 광고 분석용으로 복제.
 *
 * 산출 AdIntel은 meta_ads.ad_intel(jsonb)에 저장되고, active_days(효율)와
 * 교차 집계되어 winner/loser 패턴을 만든다.
 *
 * 핵심 분류:
 *  - origin_class: 인플 콘텐츠 그대로(as-is) / 인플 콘텐츠 가공 / 브랜드 신규제작
 *  - content_format / hook_type: 콘텐츠 유형·훅
 *  - 5축 신호(hook_strength/product_focus/has_before_after/has_promo_overlay 등)
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 700;

const SYSTEM_PROMPT = `You analyze a single Meta (Facebook/Instagram) AD creative for DTC beauty/skincare brand benchmarking.
Input: the ad's thumbnail image, its caption, and metadata (media format, whether it is a paid-partnership/branded-content ad).
Goal: classify WHO/WHAT the creative is and signals of WHY it works, so it can be crossed with how long the ad ran (efficiency).

Output ONLY valid JSON (no markdown, no commentary) matching this schema:
{
  "is_ugc_person": boolean,
  "origin_class": "ugc_as_is" | "ugc_processed" | "brand_produced",
  "content_format": string,
  "hook_type": string,
  "hook_strength": "strong" | "medium" | "weak",
  "product_focus": "single_hero" | "multi_product",
  "has_promo_overlay": boolean,
  "has_before_after": boolean,
  "creator_read": "young_female" | "male" | "mature" | "group" | "none",
  "market_read": "english" | "spanish" | "korean" | "other",
  "products_visible": [string],
  "rationale": string
}

Definitions:
- is_ugc_person: true if a real human creator (UGC-style) is shown; false if brand graphic / product-only / catalog.
- origin_class:
    "ugc_as_is"     = looks like a creator's own organic post used untouched (no sale/price stickers, no brand-template overlays).
    "ugc_processed" = creator/UGC footage that the brand visibly modified (sale/price stickers, brand promo template, heavy graphic overlays).
    "brand_produced"= brand-made graphic, product-only, catalog/DPA/DCO, or studio template with no organic-creator feel.
- content_format (one, pick best): "retail_discovery" (found-it-in-store) | "skincare_howto" | "before_after_challenge"
    | "talking_head_testimonial" | "studio_beauty" | "react_reaction" | "product_demo" | "catalog_product"
    | "list_curation" | "lifestyle" | "other"
- hook_type (one): "retail_discovery" | "age_transformation" | "korea_futurism" | "shock_ingredient"
    | "problem_solution" | "challenge_countdown" | "social_proof" | "price_deal" | "none"
- hook_strength: how scroll-stopping the first-frame + caption opener is.
- product_focus: single hero product vs scattered multiple products.
- has_promo_overlay: visible sale/price/discount stickers or "X% OFF" graphics (a processing signal).
- has_before_after: before/after or transformation reveal present.
- creator_read: dominant on-screen person read (or "none" for brand graphic).
- market_read: language/setting cue (caption language + on-screen text + setting).
- products_visible: short product nouns.
- rationale: ONE short sentence (<=20 words) justifying origin_class + hook.

If partnership=true the ad is creator-published (paid). If the thumbnail is a brand graphic with no person, set is_ugc_person=false and origin_class="brand_produced".`;

export type AdIntel = {
  is_ugc_person: boolean;
  origin_class: "ugc_as_is" | "ugc_processed" | "brand_produced";
  content_format: string;
  hook_type: string;
  hook_strength: "strong" | "medium" | "weak";
  product_focus: "single_hero" | "multi_product";
  has_promo_overlay: boolean;
  has_before_after: boolean;
  creator_read: "young_female" | "male" | "mature" | "group" | "none";
  market_read: "english" | "spanish" | "korean" | "other";
  products_visible: string[];
  rationale: string | null;
};

export type AdTagResult = {
  intel: AdIntel | null;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
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

export async function tagAdCreative(opts: {
  thumbnail_url: string;
  caption: string | null;
  format: string | null;
  is_partnership: boolean;
}): Promise<AdTagResult> {
  const { sanitizeUtf16 } = await import("./sanitize");
  const userText = sanitizeUtf16(
    `Media format: ${opts.format ?? "(unknown)"}\nPaid partnership: ${
      opts.is_partnership ? "true" : "false"
    }\n\nCaption:\n${opts.caption ?? "(none)"}`,
  );

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: opts.thumbnail_url } },
          { type: "text", text: userText },
        ],
      },
    ],
  });

  const usage = response.usage;
  const tokens_input = usage.input_tokens ?? 0;
  const tokens_output = usage.output_tokens ?? 0;
  const tokens_cache_read = usage.cache_read_input_tokens ?? 0;
  const tokens_cache_write = usage.cache_creation_input_tokens ?? 0;

  const textBlock = response.content.find(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  const fail: AdTagResult = {
    intel: null,
    tokens_input,
    tokens_output,
    tokens_cache_read,
    tokens_cache_write,
  };
  if (!textBlock) return fail;

  let parsed: unknown;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return fail;
  }
  if (!parsed || typeof parsed !== "object") return fail;
  const p = parsed as Record<string, unknown>;

  const oneOf = <T extends string>(v: unknown, allowed: T[], dflt: T): T =>
    typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : dflt;

  const intel: AdIntel = {
    is_ugc_person: p.is_ugc_person === true,
    origin_class: oneOf(
      p.origin_class,
      ["ugc_as_is", "ugc_processed", "brand_produced"],
      "brand_produced",
    ),
    content_format:
      typeof p.content_format === "string" ? p.content_format : "other",
    hook_type: typeof p.hook_type === "string" ? p.hook_type : "none",
    hook_strength: oneOf(p.hook_strength, ["strong", "medium", "weak"], "medium"),
    product_focus: oneOf(
      p.product_focus,
      ["single_hero", "multi_product"],
      "single_hero",
    ),
    has_promo_overlay: p.has_promo_overlay === true,
    has_before_after: p.has_before_after === true,
    creator_read: oneOf(
      p.creator_read,
      ["young_female", "male", "mature", "group", "none"],
      "none",
    ),
    market_read: oneOf(
      p.market_read,
      ["english", "spanish", "korean", "other"],
      "other",
    ),
    products_visible: Array.isArray(p.products_visible)
      ? p.products_visible.filter((x): x is string => typeof x === "string")
      : [],
    rationale:
      typeof p.rationale === "string" && p.rationale.trim()
        ? p.rationale.slice(0, 200)
        : null,
  };
  return {
    intel,
    tokens_input,
    tokens_output,
    tokens_cache_read,
    tokens_cache_write,
  };
}
