import type { SupabaseClient } from "@supabase/supabase-js";
import { tagAdCreative, type AdIntel } from "@/lib/anthropic/ad-creative-tagger";
import { calcVisionCost } from "@/lib/anthropic/vision-tagger";
import { stableUrlKey, tagInputHash } from "@/lib/anthropic/dedup";
import { parseCreatorFromUtm } from "../meta-utm";

/**
 * Phase 4a.6 — 광고 크리에이티브 인텔리전스
 *
 *  1) UTM 파싱 → inferred_creator_handle (1회, 무료)
 *  2) 썸네일+캡션 → Sonnet Vision → ad_intel (origin/format/hook/5축)
 *
 * ⚠️ 비전은 광고가 많으면(Medicube 300+) 한 step.run에서 다 돌리면 Vercel
 *    maxDuration(800s) 초과 → 중간에 죽음. 그래서 **미태깅(ad_intel IS NULL)만
 *    limit씩 배치**로 처리하고, run-analysis가 batch step을 루프로 호출(멱등·재개 가능).
 */

const VISION_CONCURRENCY = 5;

type SupaClient = SupabaseClient;

export type Phase4aUtmStats = {
  total_ads: number;
  utm_handles: number;
  computed_at: string;
};

export type Phase4aVisionBatchStats = {
  vision_tagged: number;
  vision_failed: number;
  vision_reused: number; // 동일 입력 해시 재사용(LLM 미호출) — WS3 §3
  remaining: number; // 아직 태깅 안 된 thumbnail 광고 수 (이번 배치 후)
  cost_usd: number;
  tokens_input: number;
  tokens_output: number;
  skipped_reason?: string;
  // BE-19: 실패 원인 구분 (ANALYST 진단용). expired=썸네일 만료/불가(영구, 마킹됨),
  //   ratelimit=레이트리밋/쿼터(일시, 재시도), other=기타(일시).
  vision_failed_expired?: number;
  vision_failed_ratelimit?: number;
  vision_failed_other?: number;
};

// BE-19: vision 실패 분류. 만료(영구)로 오분류하면 재시도 가능한 광고를 영구 유실하므로
//   "expired"는 이미지 URL fetch 실패가 확실할 때만 (보수적). 나머지는 재시도로 남긴다.
type VisionFailKind = "expired" | "ratelimit" | "other";
function classifyVisionError(reason: unknown): VisionFailKind {
  const e = reason as { status?: number; message?: string } | undefined;
  const status = typeof e?.status === "number" ? e.status : 0;
  const msg = (e?.message ?? String(reason ?? "")).toLowerCase();
  if (
    status === 429 ||
    status === 529 ||
    /rate.?limit|overloaded|too many requests|quota|credit balance/.test(msg)
  ) {
    return "ratelimit";
  }
  // 썸네일 URL을 못 가져온 경우만 영구(만료). Anthropic이 image URL을 fetch하다 실패한 신호.
  if (
    /image|url|fetch|download|media|could not (load|process|fetch)|failed to (load|fetch)|not (found|accessible)|forbidden|403|404/.test(
      msg,
    )
  ) {
    return "expired";
  }
  return "other";
}

/** thumbnail+body 기반 광고 태깅 입력 해시. */
function adInputHash(thumbnail_url: string, body_text: string | null): string {
  return tagInputHash([stableUrlKey(thumbnail_url), body_text]);
}

/**
 * 동일 태깅 입력 해시로 이미 ad_intel이 있는 meta_ads 행을 케이스 무관 조회 → hash→intel.
 * PostgREST 1000행/in() 한도(R2) 회피 위해 청크 조회.
 */
async function fetchReusableAdIntel(
  supabase: SupaClient,
  hashes: string[],
): Promise<Map<string, AdIntel>> {
  const out = new Map<string, AdIntel>();
  if (hashes.length === 0) return out;
  const CHUNK = 300;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("meta_ads")
      .select("tag_input_hash, ad_intel")
      .in("tag_input_hash", chunk)
      .not("ad_intel", "is", null);
    // BE-13 (BE-11/CX1-F5 후속): 광고 dedup 조회 실패를 무시(빈 맵→전량 재태깅=조용한 과금)하지
    //   않는다. error면 throw → 배치 실패로 Inngest 재시도. vision 쪽(fetchReusableVisionTags)과 동일.
    if (error) {
      const m =
        typeof error === "object" && error && "message" in error
          ? (error as { message: string }).message
          : String(error);
      throw new Error(`ad_intel dedup 재사용 조회 실패(재시도): ${m}`);
    }
    for (const r of (data ?? []) as Array<{
      tag_input_hash: string | null;
      ad_intel: AdIntel | null;
    }>) {
      if (r.tag_input_hash && r.ad_intel && !out.has(r.tag_input_hash)) {
        out.set(r.tag_input_hash, r.ad_intel);
      }
    }
  }
  return out;
}

/** UTM에서 소스 크리에이터 핸들 파싱 (전체 1회). 이미 채워진 건 스킵. */
export async function runPhase4aUtm(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4aUtmStats> {
  const now = new Date().toISOString();
  const { data: rows } = await supabase
    .from("meta_ads")
    .select("id, link_url")
    .eq("case_id", case_id)
    .is("inferred_creator_handle", null)
    .not("link_url", "is", null);
  const ads = rows ?? [];
  let utmHandles = 0;
  for (const ad of ads as Array<{ id: string; link_url: string | null }>) {
    const handle = parseCreatorFromUtm(ad.link_url);
    if (handle) {
      utmHandles += 1;
      await supabase
        .from("meta_ads")
        .update({ inferred_creator_handle: handle })
        .eq("id", ad.id);
    }
  }
  return { total_ads: ads.length, utm_handles: utmHandles, computed_at: now };
}

/**
 * 미태깅 광고(ad_intel IS NULL, thumbnail 있음)를 limit개만 비전 태깅.
 * run-analysis가 remaining===0 또는 진전 없을 때까지 반복 호출.
 */
export async function runPhase4aVisionBatch(
  supabase: SupaClient,
  case_id: string,
  limit: number,
): Promise<Phase4aVisionBatchStats> {
  const base = {
    vision_tagged: 0,
    vision_failed: 0,
    vision_reused: 0,
    remaining: 0,
    cost_usd: 0,
    tokens_input: 0,
    tokens_output: 0,
  };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...base, skipped_reason: "ANTHROPIC_API_KEY 미설정" };
  }

  // BE-19: 영구 실패(tag_failed_reason 마킹)는 재시도 풀에서 제외. 컬럼 미적용(마이그레이션 022 전)
  //   이면 그 필터가 에러나므로 필터 없이 재조회(호환). = 적용 후 필터 효력 발생.
  const selectCols = "id, thumbnail_url, body_text, format, creator_page_name";
  let rows: Array<{
    id: string;
    thumbnail_url: string | null;
    body_text: string | null;
    format: string | null;
    creator_page_name: string | null;
  }> | null = null;
  let error: { message: string } | null = null;
  {
    const r = await supabase
      .from("meta_ads")
      .select(selectCols)
      .eq("case_id", case_id)
      .is("ad_intel", null)
      .not("thumbnail_url", "is", null)
      .is("tag_failed_reason", null)
      .limit(limit);
    rows = r.data as typeof rows;
    error = r.error;
    if (error && /tag_failed_reason/i.test(error.message)) {
      const r2 = await supabase
        .from("meta_ads")
        .select(selectCols)
        .eq("case_id", case_id)
        .is("ad_intel", null)
        .not("thumbnail_url", "is", null)
        .limit(limit);
      rows = r2.data as typeof rows;
      error = r2.error;
    }
  }
  if (error) return { ...base, skipped_reason: `fetch: ${error.message}` };
  const ads = (rows ?? []) as Array<{
    id: string;
    thumbnail_url: string | null;
    body_text: string | null;
    format: string | null;
    creator_page_name: string | null;
  }>;
  if (ads.length === 0) return base;

  let vision_tagged = 0;
  let vision_failed = 0;
  let vision_reused = 0;
  let failExpired = 0; // BE-19: 만료(영구) 실패
  let failRatelimit = 0;
  let failOther = 0;
  let tIn = 0,
    tOut = 0,
    tCacheR = 0,
    tCacheW = 0;

  // BE-19: 영구 실패(만료) 마킹 — best-effort. 컬럼 미적용(마이그레이션 022 전)이면 error 무시
  //   (마킹 안 돼 재시도 풀에 남지만 크래시 없음). 적용 후엔 재시도 풀에서 제외 → 재과금·cascade 차단 해소.
  const markFailedPermanent = async (adId: string): Promise<void> => {
    await supabase
      .from("meta_ads")
      .update({ tag_failed_reason: "thumbnail_expired" } as never)
      .eq("id", adId);
  };

  // ── 0. 태깅 입력 해시 + 재사용 맵 (WS3 §3: 동일 입력 재태깅 방지) ──
  const hashById = new Map<string, string>();
  for (const ad of ads) {
    hashById.set(ad.id, adInputHash(ad.thumbnail_url as string, ad.body_text));
  }
  const reuseMap = await fetchReusableAdIntel(
    supabase,
    Array.from(new Set(hashById.values())),
  );

  // meta_ads.ad_intel + tag_input_hash 저장 (untyped 클라이언트라 캐스트 불필요).
  const saveIntel = async (adId: string, intel: AdIntel): Promise<boolean> => {
    const { error: uErr } = await supabase
      .from("meta_ads")
      .update({ ad_intel: intel as never, tag_input_hash: hashById.get(adId) } as never)
      .eq("id", adId);
    return !uErr;
  };

  // ── 1. 재사용 pass ──
  const toTag: typeof ads = [];
  for (const ad of ads) {
    const cached = reuseMap.get(hashById.get(ad.id)!);
    if (!cached) {
      toTag.push(ad);
      continue;
    }
    if (await saveIntel(ad.id, cached)) {
      vision_tagged += 1;
      vision_reused += 1;
    } else {
      vision_failed += 1;
    }
  }

  // ── 2. batch 내 동일 해시 dedup: 대표 1건만 LLM 호출 ──
  const repByHash = new Map<string, (typeof ads)[number]>();
  const sharersByHash = new Map<string, typeof ads>();
  for (const ad of toTag) {
    const h = hashById.get(ad.id)!;
    if (!repByHash.has(h)) {
      repByHash.set(h, ad);
      sharersByHash.set(h, []);
    } else {
      sharersByHash.get(h)!.push(ad);
    }
  }
  const reps = Array.from(repByHash.values());

  for (let i = 0; i < reps.length; i += VISION_CONCURRENCY) {
    const slice = reps.slice(i, i + VISION_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((ad) =>
        tagAdCreative({
          thumbnail_url: ad.thumbnail_url as string,
          caption: ad.body_text,
          format: ad.format,
          is_partnership: !!ad.creator_page_name,
        }),
      ),
    );
    for (let j = 0; j < results.length; j += 1) {
      const ad = slice[j]!;
      const h = hashById.get(ad.id)!;
      const group = [ad, ...(sharersByHash.get(h) ?? [])];
      const res = results[j];
      if (res?.status !== "fulfilled" || !res.value.intel) {
        // BE-19: 실패 원인 분류. transient(레이트리밋/기타)는 null로 남겨 재시도.
        //   만료(썸네일 URL fetch 불가)만 영구로 판정해 tag_failed_reason 마킹 → 재시도 풀에서
        //   제외(무한 재과금·cascade 영구 차단 해소). fulfilled인데 intel null = parse 실패 → other(재시도).
        vision_failed += group.length;
        if (res?.status === "fulfilled") {
          tIn += res.value.tokens_input;
          tOut += res.value.tokens_output;
          tCacheR += res.value.tokens_cache_read;
          tCacheW += res.value.tokens_cache_write;
          failOther += group.length; // 응답은 왔으나 파싱 실패 — 일시 취급
        } else {
          const kind = classifyVisionError(res?.reason);
          if (kind === "expired") {
            failExpired += group.length;
            for (const gAd of group) await markFailedPermanent(gAd.id);
          } else if (kind === "ratelimit") {
            failRatelimit += group.length;
          } else {
            failOther += group.length;
          }
        }
        continue;
      }
      tIn += res.value.tokens_input;
      tOut += res.value.tokens_output;
      tCacheR += res.value.tokens_cache_read;
      tCacheW += res.value.tokens_cache_write;
      const intel = res.value.intel;
      for (let g = 0; g < group.length; g += 1) {
        if (await saveIntel(group[g]!.id, intel)) {
          vision_tagged += 1;
          if (g > 0) vision_reused += 1;
        } else {
          vision_failed += 1;
        }
      }
    }
  }

  // 남은 미태깅 수 — 영구 실패(마킹)는 제외(재시도 풀 아님). 컬럼 미적용이면 필터 없이(호환).
  let remaining = 0;
  {
    const r = await supabase
      .from("meta_ads")
      .select("id", { count: "exact", head: true })
      .eq("case_id", case_id)
      .is("ad_intel", null)
      .not("thumbnail_url", "is", null)
      .is("tag_failed_reason", null);
    if (r.error && /tag_failed_reason/i.test(r.error.message)) {
      const r2 = await supabase
        .from("meta_ads")
        .select("id", { count: "exact", head: true })
        .eq("case_id", case_id)
        .is("ad_intel", null)
        .not("thumbnail_url", "is", null);
      remaining = r2.count ?? 0;
    } else {
      remaining = r.count ?? 0;
    }
  }

  return {
    vision_tagged,
    vision_failed,
    vision_reused,
    remaining,
    cost_usd: calcVisionCost({
      tokens_input: tIn,
      tokens_output: tOut,
      tokens_cache_read: tCacheR,
      tokens_cache_write: tCacheW,
    }),
    tokens_input: tIn,
    tokens_output: tOut,
    vision_failed_expired: failExpired,
    vision_failed_ratelimit: failRatelimit,
    vision_failed_other: failOther,
  };
}
