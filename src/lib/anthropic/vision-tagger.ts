import Anthropic from "@anthropic-ai/sdk";
import type { VisionTags } from "@/lib/inngest/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You analyze TikTok content videos for brand performance benchmarking.
Given a video cover image, caption text, and ASR transcript, return structured analysis tags
that will be used for clustering similar content patterns.

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

Vocabulary guidance (pick from these or similar tokens):
- hook_tags (multiple): "shock_value" | "question" | "transformation_promise" | "problem_statement"
                        | "curiosity_gap" | "social_proof" | "list_preview" | "personal_story"
                        | "countdown" | "duet_reaction" | "trending_audio_lipsync"
- content_angle (one): "tutorial" | "review" | "lifestyle" | "comparison" | "before_after"
                       | "unboxing" | "expert_education" | "humor_skit" | "testimonial"
                       | "list_curation" | "ingredient_breakdown"
- body_format (one): "list" | "demonstration" | "narrative" | "comparison" | "talking_head"
                     | "voiceover_pov" | "split_screen" | "transition_montage"
- visual_style (one): "ugc" | "polished_branded" | "vlog" | "asmr" | "voiceover_text"
                      | "duet" | "stitch"
- cta_type: "save" | "shop_link" | "follow" | "comment" | "share" | "tag_friend"
            | "watch_more" | null
- products_visible: short product nouns (e.g., "lip oil bottle", "PDRN cream tube")
- purchase_intent: 강한 구매 유도 = "high", 정보형/일반 = "mid", 순수 엔터테인 = "low"

If the input is empty or unclear (no caption, no ASR, ambiguous image), pick the most reasonable
defaults and use empty arrays where applicable.`;

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
    cta_type:
      typeof p.cta_type === "string" && p.cta_type.trim() ? p.cta_type : null,
    purchase_intent:
      p.purchase_intent === "high" ||
      p.purchase_intent === "mid" ||
      p.purchase_intent === "low"
        ? p.purchase_intent
        : "mid",
    visual_style:
      typeof p.visual_style === "string" ? p.visual_style : "unknown",
    products_visible: Array.isArray(p.products_visible)
      ? p.products_visible.filter((x): x is string => typeof x === "string")
      : [],
  };

  return {
    tags,
    tokens_input,
    tokens_output,
    tokens_cache_read,
    tokens_cache_write,
  };
}

/**
 * Sonnet 4.6 가격 (USD).
 * Input: $3/M, Cached read: $0.30/M, Cache write: $3.75/M, Output: $15/M
 */
export function calcVisionCost(opts: {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
}): number {
  // input_tokens는 Anthropic API에서 cache 처리 분 빼고 카운트되어 옴
  const M = 1_000_000;
  return (
    (opts.tokens_input * 3) / M +
    (opts.tokens_cache_read * 0.3) / M +
    (opts.tokens_cache_write * 3.75) / M +
    (opts.tokens_output * 15) / M
  );
}
