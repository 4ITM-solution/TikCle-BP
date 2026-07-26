import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchAdsToContents,
  type MatchDoc,
  type MatchOpts,
} from "./original-match";

/**
 * BE-30 — 케이스의 광고 원본 후보를 텍스트 대조로 산출해 ad_original_candidates에 저장.
 *   - 코퍼스: contents.caption + case_video_analyses.asr_text(있으면) 결합.
 *   - $0(정규화 텍스트 대조만). 후보(확정 아님) — method='text_normalize_v1'.
 *   - 테이블(마이그레이션 024) 미적용이면 upsert가 에러나지만 무시(파이프라인 무영향).
 */
export type OriginalMatchStats = {
  ads: number;
  contents: number;
  candidates: number;
  ads_with_candidate: number;
  saved: number;
  skipped_reason?: string;
};

const CHUNK = 500;

export async function matchOriginalCandidatesForCase(
  supabase: SupaClient,
  case_id: string,
  opts?: MatchOpts & { brand_id?: string | null; country?: string | null; persist?: boolean },
): Promise<OriginalMatchStats> {
  const base: OriginalMatchStats = {
    ads: 0,
    contents: 0,
    candidates: 0,
    ads_with_candidate: 0,
    saved: 0,
  };

  // 1. 광고 (body_text 있는 것)
  const { data: adRows, error: adErr } = await supabase
    .from("meta_ads")
    .select("id, body_text")
    .eq("case_id", case_id)
    .not("body_text", "is", null);
  if (adErr) return { ...base, skipped_reason: `ads: ${adErr.message}` };
  const ads: MatchDoc[] = (adRows ?? [])
    .map((a) => ({ id: a.id as string, text: (a.body_text as string) ?? "" }))
    .filter((a) => a.text.trim().length > 0);
  base.ads = ads.length;
  if (ads.length === 0) return { ...base, skipped_reason: "body_text 광고 0건" };

  // 2. 콘텐츠 캡션 (brand+country 스코프) + ASR(케이스) 결합
  const brand_id = opts?.brand_id ?? (await resolveBrand(supabase, case_id)).brand_id;
  const country = opts?.country ?? (await resolveBrand(supabase, case_id)).country;
  const captionById = new Map<string, string>();
  if (brand_id) {
    for (let off = 0; off < 100000; off += CHUNK) {
      let q = supabase
        .from("contents")
        .select("id, caption")
        .eq("brand_id", brand_id);
      if (country) q = q.eq("country", country);
      const { data } = await q.range(off, off + CHUNK - 1);
      if (!data || data.length === 0) break;
      for (const r of data)
        if (r.caption) captionById.set(r.id as string, r.caption as string);
      if (data.length < CHUNK) break;
    }
  }
  // ASR (case_video_analyses.asr_text, content_id 키)
  for (let off = 0; off < 100000; off += CHUNK) {
    const { data } = await supabase
      .from("case_video_analyses")
      .select("content_id, asr_text")
      .eq("case_id", case_id)
      .not("asr_text", "is", null)
      .range(off, off + CHUNK - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const cid = r.content_id as string;
      const prev = captionById.get(cid) ?? "";
      captionById.set(cid, `${prev} ${(r.asr_text as string) ?? ""}`.trim());
    }
    if (data.length < CHUNK) break;
  }
  const contents: MatchDoc[] = [...captionById.entries()].map(([id, text]) => ({
    id,
    text,
  }));
  base.contents = contents.length;
  if (contents.length === 0) return { ...base, skipped_reason: "대조 콘텐츠 0건" };

  // 3. 매칭
  const cands = matchAdsToContents(ads, contents, opts);
  base.candidates = cands.length;
  base.ads_with_candidate = new Set(cands.map((c) => c.ad_id)).size;

  // 4. 저장 (persist 기본 true). 테이블 미적용이면 error 무시.
  if (opts?.persist !== false && cands.length > 0) {
    const now = new Date().toISOString();
    const rows = cands.map((c) => ({
      case_id,
      ad_id: c.ad_id,
      content_id: c.content_id,
      score: c.score,
      method: "text_normalize_v1",
      shared_terms: c.shared_terms,
      created_at: now,
    }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from("ad_original_candidates")
        .upsert(rows.slice(i, i + CHUNK) as never, {
          onConflict: "ad_id,content_id",
        });
      if (!error) base.saved += Math.min(CHUNK, rows.length - i);
    }
  }
  return base;
}

type SupaClient = SupabaseClient;

async function resolveBrand(
  supabase: SupaClient,
  case_id: string,
): Promise<{ brand_id: string | null; country: string | null }> {
  const { data } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", case_id)
    .single();
  return {
    brand_id: (data?.brand_id as string) ?? null,
    country: (data?.country as string) ?? null,
  };
}
