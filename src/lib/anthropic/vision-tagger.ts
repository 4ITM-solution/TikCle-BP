import Anthropic from "@anthropic-ai/sdk";
import type { VisionTags } from "@/lib/inngest/types";
import { TAGGING_MODEL, calcTaggingCost } from "./pricing";

const MODEL = TAGGING_MODEL;
const MAX_TOKENS = 800;

// 결정성(자기일치) 최우선: 모든 라벨은 CLOSED enum, 다중 후보 시 명시적 tie-break 규칙으로
// 항상 같은 값이 나오게 한다. "or similar" 자유토큰을 제거하고 열거 밖 토큰을 금지.
// (BE-6: Sonnet 자기일치 56%→목표 ≥85%. cta_type·purchase_intent·products_visible 집중.)
const SYSTEM_PROMPT = `You analyze TikTok content videos for brand performance benchmarking.
Given a video cover image, caption text, and ASR transcript, return structured analysis tags
used for clustering similar content patterns.

Output ONLY valid JSON matching this schema (no markdown, no commentary):
{
  "hook_tags": [string],
  "content_angle": string,
  "body_format": string,
  "overlay_text": string | null,
  "cta_type": string | null,
  "purchase_intent": "high" | "mid" | "low",
  "visual_style": string,
  "products_visible": [string]
}

CRITICAL — determinism: Use ONLY the exact tokens listed below (never invent or pluralize them).
When more than one token could fit, apply the stated tie-break so the SAME video always yields
the SAME value. Judge from evidence actually present (spoken/on-screen/caption), never from vibe.

- hook_tags (0-3, choose ALL that clearly apply, strongest first; [] if none clearly apply).
  Allowed ONLY: "shock_value" | "question" | "transformation_promise" | "problem_statement"
   | "curiosity_gap" | "social_proof" | "list_preview" | "personal_story" | "countdown"
   | "duet_reaction" | "trending_audio_lipsync"

- content_angle (EXACTLY ONE). If several apply, pick the one dominating most of the video;
  tie-break: EARLIEST in this list. Allowed ONLY:
   "tutorial" | "review" | "lifestyle" | "comparison" | "before_after" | "unboxing"
   | "expert_education" | "humor_skit" | "testimonial" | "list_curation" | "ingredient_breakdown"

- body_format (EXACTLY ONE, dominant; tie-break EARLIEST). Allowed ONLY:
   "list" | "demonstration" | "narrative" | "comparison" | "talking_head" | "voiceover_pov"
   | "split_screen" | "transition_montage"

- visual_style (EXACTLY ONE, dominant; tie-break EARLIEST). Allowed ONLY:
   "ugc" | "polished_branded" | "vlog" | "asmr" | "voiceover_text" | "duet" | "stitch"

- cta_type (EXACTLY ONE token or null). Only count an EXPLICIT call to action that directs the
  viewer (imperative in speech, on-screen text, or caption — e.g. "link in bio", "save this",
  "follow for more"). If none is explicit, use null (do NOT infer from vibe). When several CTAs
  are present, pick the one HIGHEST in this priority order:
   "shop_link" > "save" > "follow" > "tag_friend" > "share" > "comment" > "watch_more"

- purchase_intent (EXACTLY ONE). Choose the HIGHEST tier whose condition is met:
   "high" = explicit shopping push: shop link/"link in bio to buy", price/discount/coupon,
            urgency/limited-time, or "buy/get yours" imperative.
   "mid"  = product is demonstrated, reviewed, or recommended but with NO explicit purchase push.
   "low"  = product is incidental or absent; pure entertainment/lifestyle.

- products_visible (0-3 generic product-TYPE nouns, prominence order; [] if none clearly shown).
  Rules for reproducibility: lowercase, singular, GENERIC category noun ONLY — no brand names,
  no colors/adjectives, no packaging words ("bottle"/"tube"/"jar"). Dedupe.
  e.g. ["serum", "cleanser"] — NOT ["blue Vitamin C serum bottle", "cleanser tube"].

- overlay_text: the single most prominent on-screen text, verbatim; null if none.

If input is empty or ambiguous (no caption, no ASR, unclear image), still pick the single best-fit
token per the rules above and use [] where nothing clearly applies.`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type VisionTagResult = {
  tags: VisionTags | null;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
};

/**
 * 영상 1개의 cover 이미지 + 캡션 + ASR을 Sonnet Vision에 보내 구조화된 태그 받기.
 * 시스템 프롬프트는 ephemeral cache로 마킹 → 연속 호출 시 90% 할인.
 */
export async function visionTagOne(opts: {
  cover_url: string;
  caption: string | null;
  asr_text: string | null;
}): Promise<VisionTagResult> {
  // Anthropic API에 URL을 직접 넘김 (Anthropic 서버 IP에서 fetch).
  // 이전엔 vercel에서 base64로 변환해서 보냈는데, TikTok CDN이 AWS IP를 차단해서
  // vercel serverless의 fetch가 모두 fail. URL source로 바꾸면 Anthropic 서버가
  // 자체 fetch하므로 차단 우회.
  const { sanitizeUtf16 } = await import("./sanitize");
  const userText = sanitizeUtf16(
    `Caption:\n${opts.caption ?? "(none)"}\n\nASR transcript:\n${
      opts.asr_text ?? "(none)"
    }`,
  );

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: opts.cover_url,
            },
          },
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
  if (!textBlock) {
    return {
      tags: null,
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  // JSON parse with markdown fence stripping
  let parsed: unknown = null;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      tags: null,
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      tags: null,
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  // 최소 필드 정규화
  const p = parsed as Record<string, unknown>;
  const tags: VisionTags = {
    hook_tags: Array.isArray(p.hook_tags)
      ? p.hook_tags.filter((x): x is string => typeof x === "string")
      : [],
    content_angle:
      typeof p.content_angle === "string" ? p.content_angle : "unknown",
    body_format:
      typeof p.body_format === "string" ? p.body_format : "unknown",
    overlay_text:
      typeof p.overlay_text === "string" && p.overlay_text.trim()
        ? p.overlay_text
        : null,
    // cta_type: 소문자·트림 정규화(대소문자 흔들림 제거). 빈 문자열/"null"/"none"은 null.
    cta_type: normalizeCta(p.cta_type),
    purchase_intent:
      p.purchase_intent === "high" ||
      p.purchase_intent === "mid" ||
      p.purchase_intent === "low"
        ? p.purchase_intent
        : "mid",
    visual_style:
      typeof p.visual_style === "string" ? p.visual_style : "unknown",
    // products_visible: 소문자·트림·중복제거·최대 3개. 표현 흔들림(대소문자/공백/중복)을
    //   코드에서 못박아 자기일치(Jaccard)를 프롬프트만으로 얻는 것 이상으로 안정화(BE-6).
    products_visible: normalizeProducts(p.products_visible),
  };

  return {
    tags,
    tokens_input,
    tokens_output,
    tokens_cache_read,
    tokens_cache_write,
  };
}

// BE-6 정규화: 모델 출력의 표면 흔들림(대소문자·공백·중복·null 표기)을 제거해 자기일치 안정화.
const CTA_NULL_TOKENS = new Set(["", "null", "none", "n/a", "na"]);

function normalizeCta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().replace(/\s+/g, "_");
  return CTA_NULL_TOKENS.has(t) ? null : t;
}

function normalizeProducts(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 3) break; // 프롬프트 상한과 일치 — 초과 시 앞 3개(프롬프트: 두드러진 순)
  }
  return out;
}

/**
 * 태깅 모델(WS3 §3.4: 기본 Haiku 4.5, BP_TAGGING_MODEL로 override) 가격.
 * 모델명 기반으로 단가 자동 선택 (haiku → $1/$5, 그 외 Sonnet → $3/$15).
 * input_tokens는 Anthropic API에서 cache 처리 분 빼고 카운트되어 옴.
 */
export function calcVisionCost(opts: {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
}): number {
  return calcTaggingCost(opts, MODEL);
}
