import Anthropic from "@anthropic-ai/sdk";
import { TAGGING_MODEL } from "./pricing";

/**
 * 메타 광고 크리에이티브 1개(썸네일 + 캡션 + 포맷)를 Vision으로 분석.
 * vision-tagger.ts(틱톡용) 패턴을 광고 분석용으로 복제.
 * WS3 §3.4: 닫힌 라벨 분류이므로 Haiku 4.5로 전환 (BP_TAGGING_MODEL override).
 *
 * 산출 AdIntel은 meta_ads.ad_intel(jsonb)에 저장되고, active_days(효율)와
 * 교차 집계되어 winner/loser 패턴을 만든다.
 *
 * 핵심 분류:
 *  - origin_class: 인플 콘텐츠 그대로(as-is) / 인플 콘텐츠 가공 / 브랜드 신규제작
 *  - source_channel: 소재 원본 채널 (IG/TikTok/브랜드제작/unknown) — WS3 Q6
 *  - banner_style: 2차 가공 배너/오버레이 방식 — WS3 Q6
 *  - content_format / hook_type: 콘텐츠 유형·훅
 *  - 5축 신호(hook_strength/product_focus/has_before_after/has_promo_overlay 등)
 */

const MODEL = TAGGING_MODEL;
const MAX_TOKENS = 700;

const SYSTEM_PROMPT = `You analyze a single Meta (Facebook/Instagram) AD creative for DTC beauty/skincare brand benchmarking.
Input: the ad's thumbnail image, its caption, and metadata (media format, whether it is a paid-partnership/branded-content ad).
Goal: classify WHO/WHAT the creative is and signals of WHY it works, so it can be crossed with how long the ad ran (efficiency).

Output ONLY valid JSON (no markdown, no commentary) matching this schema:
{
  "is_ugc_person": boolean,
  "origin_class": "ugc_as_is" | "ugc_processed" | "brand_produced",
  "source_channel": "instagram" | "tiktok" | "brand_original" | "unknown",
  "banner_style": "none" | "top_banner" | "bottom_banner" | "caption_overlay" | "frame" | "other",
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
- source_channel: where the ORIGINAL footage came from, judged from platform cues:
    "instagram"      = paid-partnership / branded-content look, IG Reels UI, IG-native caption style, or partnership=true with no TikTok markers.
    "tiktok"         = a visible TikTok watermark / @handle overlay, TikTok caption font/sticker style, or CapCut-style captions repurposed into an ad.
    "brand_original" = brand-shot studio/graphic footage with no creator platform markers (usually pairs with origin_class="brand_produced").
    "unknown"        = no reliable platform cue. Portrait 9:16 alone is NOT enough — require an actual watermark, UI, or partnership signal.
- banner_style: how the brand added banners/text overlays when re-editing (a 2차 가공 signal):
    "none"            = no added banner/overlay beyond the original footage.
    "top_banner"      = solid banner strip across the TOP.
    "bottom_banner"   = solid banner strip across the BOTTOM.
    "caption_overlay" = text captions laid over the video body (not a solid strip).
    "frame"           = a border/frame around the whole video, or letterbox bars with text.
    "other"           = an overlay style that doesn't match the above.
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

If partnership=true the ad is creator-published (paid). If the thumbnail is a brand graphic with no person, set is_ugc_person=false and origin_class="brand_produced" and source_channel="brand_original".`;

export type AdSourceChannel =
  | "instagram"
  | "tiktok"
  | "brand_original"
  | "unknown";
export type AdBannerStyle =
  | "none"
  | "top_banner"
  | "bottom_banner"
  | "caption_overlay"
  | "frame"
  | "other";

export type AdIntel = {
  is_ugc_person: boolean;
  origin_class: "ugc_as_is" | "ugc_processed" | "brand_produced";
  // WS3 Q6 — 신규 필드 (기존 태깅 행은 null 허용, 백필은 오케스트레이터가 별도 결정)
  source_channel: AdSourceChannel;
  banner_style: AdBannerStyle;
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
    source_channel: oneOf(
      p.source_channel,
      ["instagram", "tiktok", "brand_original", "unknown"],
      "unknown",
    ),
    banner_style: oneOf(
      p.banner_style,
      ["none", "top_banner", "bottom_banner", "caption_overlay", "frame", "other"],
      "none",
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
