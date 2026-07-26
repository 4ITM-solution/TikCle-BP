import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankDistinctiveTerms,
  extractKeyMessages,
  type KeyMessageDoc,
} from "@/lib/anthropic/key-messages";
import type { KeyMessage, VisionTags } from "@/lib/inngest/types";

/**
 * BE-22 — 케이스의 브랜드 키 메시지 산출 → key_stats.phase5.key_messages 저장.
 *   코퍼스 = 캡션(brand+country) + case_video_analyses(overlay_text·asr·products_visible).
 *   ①상투어 제거 랭킹(rankDistinctiveTerms) → ②LLM 1회(extractKeyMessages, ~$0.1-0.3).
 *   ⚠️ LLM 유료 — 실행은 ORCH. ANTHROPIC_API_KEY 없으면 skip.
 */
export type KeyMessagesStats = {
  captions: number;
  docs: number;
  key_messages: KeyMessage[];
  cost_hint_tokens?: { input: number; output: number };
  skipped_reason?: string;
};

const CHUNK = 500;

export async function computeKeyMessagesForCase(
  supabase: SupabaseClient,
  case_id: string,
): Promise<KeyMessagesStats> {
  const base: KeyMessagesStats = { captions: 0, docs: 0, key_messages: [] };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...base, skipped_reason: "ANTHROPIC_API_KEY 미설정" };
  }

  const { data: c } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", case_id)
    .single();
  const brand_id = (c?.brand_id as string) ?? null;
  const country = (c?.country as string) ?? null;
  if (!brand_id) return { ...base, skipped_reason: "brand_id 없음" };

  let brandName = "";
  {
    const { data: b } = await supabase
      .from("brands")
      .select("name")
      .eq("id", brand_id)
      .single();
    brandName = (b?.name as string) ?? "";
  }

  // 캡션 + url (brand+country 스코프)
  const captions: string[] = [];
  const urlById = new Map<string, string>();
  const capById = new Map<string, string>();
  for (let off = 0; off < 200000; off += CHUNK) {
    let q = supabase
      .from("contents")
      .select("id, url, caption")
      .eq("brand_id", brand_id);
    if (country) q = q.eq("country", country);
    const { data } = await q.range(off, off + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.caption) {
        captions.push(r.caption as string);
        capById.set(r.id as string, r.caption as string);
      }
      if (r.url) urlById.set(r.id as string, r.url as string);
    }
    if (data.length < CHUNK) break;
  }
  base.captions = captions.length;
  if (captions.length === 0) return { ...base, skipped_reason: "캡션 0건" };

  // vision_tags.overlay_text + asr + products_visible (case_video_analyses)
  const docs: KeyMessageDoc[] = [];
  for (let off = 0; off < 200000; off += CHUNK) {
    const { data } = await supabase
      .from("case_video_analyses")
      .select("content_id, vision_tags, asr_text")
      .eq("case_id", case_id)
      .range(off, off + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = r.content_id as string;
      const vt = (r.vision_tags as VisionTags | null) ?? null;
      const overlay =
        vt && typeof (vt as { overlay_text?: unknown }).overlay_text === "string"
          ? ((vt as { overlay_text?: string }).overlay_text ?? null)
          : null;
      const products =
        vt && Array.isArray((vt as { products_visible?: unknown }).products_visible)
          ? ((vt as { products_visible?: string[] }).products_visible ?? null)
          : null;
      const url = urlById.get(cid);
      if (!url) continue;
      docs.push({
        url,
        caption: capById.get(cid) ?? null,
        overlay_text: overlay,
        asr_text: (r.asr_text as string) ?? null,
        products_visible: products,
      });
    }
    if (data.length < CHUNK) break;
  }
  // 태깅 doc이 없으면 캡션만으로 대표 doc 구성(overlay/asr 없이).
  if (docs.length === 0) {
    for (const [cid, cap] of capById) {
      const url = urlById.get(cid);
      if (!url) continue;
      docs.push({ url, caption: cap, overlay_text: null, asr_text: null, products_visible: null });
      if (docs.length >= 60) break;
    }
  }
  base.docs = docs.length;

  const ranked = rankDistinctiveTerms(captions, { brandTokens: brandName ? [brandName] : [] });
  const result = await extractKeyMessages(brandName, ranked, docs);
  base.key_messages = result.key_messages;
  base.cost_hint_tokens = { input: result.tokens_input, output: result.tokens_output };

  // 저장 — key_stats.phase5.key_messages merge (phase5 없으면 생성 안 함, 있으면 필드만 추가).
  if (result.key_messages.length > 0) {
    const { data: row } = await supabase
      .from("cases")
      .select("key_stats")
      .eq("id", case_id)
      .single();
    const ks = (row?.key_stats ?? {}) as Record<string, unknown>;
    const phase5 = (ks.phase5 ?? {}) as Record<string, unknown>;
    phase5.key_messages = result.key_messages;
    ks.phase5 = phase5;
    await supabase.from("cases").update({ key_stats: ks as never }).eq("id", case_id);
  }

  return base;
}
