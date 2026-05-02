import Anthropic from "@anthropic-ai/sdk";
import type { VisionTags } from "@/lib/inngest/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600;

const SYSTEM_PROMPT = `You match TikTok content videos to a brand's product SKUs.
Given a video (cover image + caption + ASR + vision tags) and the brand's product catalog,
identify which SKUs are featured/promoted in the video.

Match criteria — in order of strength:
  1. Explicit product mention in caption or ASR (brand name, product name, ASIN code)
  2. Visible product in cover image (matching shape/color/packaging)
  3. Vision tags' products_visible matching catalog item categories

Output ONLY valid JSON (no markdown, no commentary):
{
  "matched": [
    { "id": string, "name": string, "confidence": "high" | "mid" | "low" }
  ],
  "reasoning": string
}

Rules:
- Use the EXACT id from the product catalog (ASIN or external_product_id).
- If no SKU is featured, return { "matched": [], "reasoning": "..." }.
- Multiple SKUs OK if multiple are clearly featured.
- "high" = explicit name/code mention, "mid" = strong visual match,
  "low" = ambiguous (similar category but unclear which exact SKU).
- Be conservative — better to return [] than to false-match.
- reasoning: ≤ 1 sentence explaining the choice (Korean OK).`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type ProductCatalogItem = {
  id: string;
  name: string;
  category: string | null;
};

export type SkuMatchResult = {
  matched: Array<{
    id: string;
    name: string;
    confidence: "high" | "mid" | "low";
  }>;
  reasoning: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
};

function buildCatalogText(catalog: ProductCatalogItem[]): string {
  const lines = catalog.map(
    (p) =>
      `- id="${p.id}" name="${p.name}"${p.category ? ` category="${p.category}"` : ""}`,
  );
  return `Product catalog (${catalog.length} SKUs):\n${lines.join("\n")}`;
}

/**
 * 영상 1개에 대해 SKU 매칭 수행.
 *
 * 시스템 프롬프트 + 제품 카탈로그를 ephemeral cache로 마킹 → 같은 케이스 안에서
 * 영상별로 호출할 때 카탈로그 토큰은 재사용 (cache_read 90% 할인).
 */
export async function matchSkuOne(opts: {
  catalog: ProductCatalogItem[];
  cover_url: string | null;
  caption: string | null;
  asr_text: string | null;
  vision_tags: VisionTags | null;
}): Promise<SkuMatchResult> {
  const catalogText = buildCatalogText(opts.catalog);

  // 사용자 메시지 본문
  const userTextParts: string[] = [];
  userTextParts.push(`Caption:\n${opts.caption ?? "(none)"}`);
  userTextParts.push(`ASR transcript:\n${opts.asr_text ?? "(none)"}`);
  if (opts.vision_tags) {
    userTextParts.push(
      `Vision tags:\n  products_visible: ${JSON.stringify(opts.vision_tags.products_visible)}\n  content_angle: ${opts.vision_tags.content_angle}\n  body_format: ${opts.vision_tags.body_format}`,
    );
  }
  const userText = userTextParts.join("\n\n");

  // 이미지 (선택)
  let imageBlock: Anthropic.ImageBlockParam | null = null;
  if (opts.cover_url) {
    try {
      const imgRes = await fetch(opts.cover_url, {
        referrerPolicy: "no-referrer",
      });
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        const mediaTypeRaw = imgRes.headers.get("content-type") ?? "image/jpeg";
        const mediaType = ((mediaTypeRaw.split(";")[0] ?? mediaTypeRaw)
          .trim()) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        imageBlock = {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64,
          },
        };
      }
    } catch {
      // cover fetch 실패 → 이미지 없이 진행
    }
  }

  const userContent: Anthropic.ContentBlockParam[] = [];
  if (imageBlock) userContent.push(imageBlock);
  userContent.push({ type: "text", text: userText });

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
      },
      {
        type: "text",
        text: catalogText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
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
      matched: [],
      reasoning: "(empty response)",
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  let parsed: unknown = null;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      matched: [],
      reasoning: `(parse error: ${textBlock.text.slice(0, 80)})`,
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      matched: [],
      reasoning: "(non-object response)",
      tokens_input,
      tokens_output,
      tokens_cache_read,
      tokens_cache_write,
    };
  }

  const p = parsed as Record<string, unknown>;
  const matchedRaw = Array.isArray(p.matched) ? p.matched : [];
  const validIds = new Set(opts.catalog.map((c) => c.id));

  const matched = matchedRaw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : "",
      name: typeof m.name === "string" ? m.name : "",
      confidence:
        m.confidence === "high" ||
        m.confidence === "mid" ||
        m.confidence === "low"
          ? (m.confidence as "high" | "mid" | "low")
          : ("low" as const),
    }))
    .filter((m) => m.id && validIds.has(m.id));

  return {
    matched,
    reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
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
export function calcSkuMatchCost(opts: {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
}): number {
  const M = 1_000_000;
  return (
    (opts.tokens_input * 3) / M +
    (opts.tokens_cache_read * 0.3) / M +
    (opts.tokens_cache_write * 3.75) / M +
    (opts.tokens_output * 15) / M
  );
}
