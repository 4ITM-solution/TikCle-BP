import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcSkuMatchCost,
  matchSkuOne,
  type ProductCatalogItem,
} from "@/lib/anthropic/sku-matcher";
import type {
  DisplayedVideoEntry,
  Phase4bSampleStats,
  Phase4bSkuStats,
  VisionTags,
} from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_CHUNK = 200;
const MATCH_CONCURRENCY = 5;
const REPS_PER_META = 3;

/**
 * Phase 4b.5 — SKU Matching (화면 노출 영상에 한정)
 *
 * 분석 화면에 실제로 보여줄 영상 = (샘플 preview top 12) ∪ (메타 클러스터별 top 3 대표).
 * 이 영상들에 대해서만 caption + ASR + cover + vision_tags를 LLM에 보내
 * 어떤 SKU를 다루는 영상인지 매칭.
 *
 * 결과:
 *   - case_video_analyses.matched_sku_ids: ASIN/external_product_id 배열
 *   - key_stats.phase4b_sku.displayed_videos: UI 표시용
 *   - key_stats.phase4b_sku.cluster_representatives: 메타→대표영상 맵
 */
export async function runPhase4bSku(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bSkuStats> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return empty("ANTHROPIC_API_KEY 미설정");
  }

  // 1. 케이스 정보 + 제품 카탈로그
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const catalog = await fetchProductCatalog(supabase, case_id, c.brand_id);
  if (catalog.length === 0) {
    return empty("제품 카탈로그 비어있음");
  }

  // 2. 노출할 영상 ID 수집
  const sampleTopIds = sample.preview.map((p) => p.content_id);
  const { metaToReps, allClusterContentIds } = await fetchClusterRepresentatives(
    supabase,
    case_id,
  );

  const allIds = uniqueOrdered([...sampleTopIds, ...allClusterContentIds]);
  if (allIds.length === 0) {
    return empty("노출 영상 0개");
  }

  // 3. 각 영상에 대한 입력 데이터
  const videoInputs = await fetchVideoInputs(supabase, case_id, allIds);
  if (videoInputs.length === 0) {
    return empty("영상 입력 0개 (vision_tags 없음 가능)");
  }

  // 4. SKU 매칭 (병렬)
  const idToInput = new Map(videoInputs.map((v) => [v.content_id, v]));
  const idToMatched = new Map<
    string,
    { ids: string[]; names: string[]; conf: "high" | "mid" | "low" | null }
  >();

  let total_matched = 0;
  let total_no_match = 0;
  let total_failed = 0;
  let tokens_in = 0;
  let tokens_out = 0;
  let tokens_cache_r = 0;
  let tokens_cache_w = 0;

  for (let i = 0; i < videoInputs.length; i += MATCH_CONCURRENCY) {
    const slice = videoInputs.slice(i, i + MATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((v) =>
        matchSkuOne({
          catalog,
          cover_url: v.cover_url,
          caption: v.caption,
          asr_text: v.asr_text,
          vision_tags: v.vision_tags,
        }),
      ),
    );

    for (let j = 0; j < results.length; j += 1) {
      const v = slice[j]!;
      const r = results[j];
      if (r?.status !== "fulfilled") {
        total_failed += 1;
        idToMatched.set(v.content_id, { ids: [], names: [], conf: null });
        continue;
      }
      tokens_in += r.value.tokens_input;
      tokens_out += r.value.tokens_output;
      tokens_cache_r += r.value.tokens_cache_read;
      tokens_cache_w += r.value.tokens_cache_write;

      const matched = r.value.matched;
      if (matched.length === 0) {
        total_no_match += 1;
        idToMatched.set(v.content_id, { ids: [], names: [], conf: null });
        continue;
      }
      total_matched += 1;
      // confidence: 매칭 중 가장 높은 것을 영상의 대표 confidence로
      const conf = pickHighestConfidence(matched.map((m) => m.confidence));
      idToMatched.set(v.content_id, {
        ids: matched.map((m) => m.id),
        names: matched.map((m) => m.name),
        conf,
      });
    }
  }

  // 5. DB 저장 (case_video_analyses.matched_sku_ids)
  for (const [content_id, m] of idToMatched.entries()) {
    if (m.ids.length === 0) continue;
    await supabase
      .from("case_video_analyses")
      .upsert(
        {
          case_id,
          content_id,
          matched_sku_ids: m.ids,
        },
        { onConflict: "case_id,content_id" },
      );
  }

  // 6. UI용 DisplayedVideoEntry 빌드 (썸네일은 raw cover_url, 카드 클릭 시 TikTok 이동)
  const buildEntry = (content_id: string): DisplayedVideoEntry | null => {
    const v = idToInput.get(content_id);
    if (!v) return null;
    const m = idToMatched.get(content_id);
    return {
      content_id,
      url: v.url,
      views: v.views ?? 0,
      thumbnail_url: v.cover_url,
      caption_preview: v.caption ? v.caption.slice(0, 140) : null,
      matched_skus: m?.ids ?? [],
      matched_sku_names: m?.names ?? [],
      confidence: m?.conf ?? null,
    };
  };

  const displayed_videos = allIds
    .map(buildEntry)
    .filter((e): e is DisplayedVideoEntry => !!e);

  const cluster_representatives: Record<string, DisplayedVideoEntry[]> = {};
  for (const [metaId, repIds] of metaToReps.entries()) {
    cluster_representatives[metaId] = repIds
      .map(buildEntry)
      .filter((e): e is DisplayedVideoEntry => !!e);
  }

  return {
    total_displayed: allIds.length,
    total_matched,
    total_no_match,
    total_failed,
    cost_actual_usd: calcSkuMatchCost({
      tokens_input: tokens_in,
      tokens_output: tokens_out,
      tokens_cache_read: tokens_cache_r,
      tokens_cache_write: tokens_cache_w,
    }),
    tokens_input: tokens_in,
    tokens_output: tokens_out,
    tokens_cache_read: tokens_cache_r,
    displayed_videos,
    cluster_representatives,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

async function fetchProductCatalog(
  supabase: SupaClient,
  case_id: string,
  brand_id: string,
): Promise<ProductCatalogItem[]> {
  // 케이스 직접 연결된 products 우선, 없으면 같은 brand의 products
  const { data: caseProducts } = await supabase
    .from("products")
    .select("id, name, asin, external_product_id, category")
    .eq("case_id", case_id);

  let rows = caseProducts ?? [];
  if (rows.length === 0) {
    const { data: brandProducts } = await supabase
      .from("products")
      .select("id, name, asin, external_product_id, category")
      .eq("brand_id", brand_id);
    rows = brandProducts ?? [];
  }

  return rows
    .map((p) => {
      // id 우선순위: ASIN > external_product_id > products.id
      const id = p.asin ?? p.external_product_id ?? p.id;
      return id
        ? {
            id,
            name: p.name,
            category: p.category,
          }
        : null;
    })
    .filter((p): p is ProductCatalogItem => !!p);
}

type ClusterRepResult = {
  metaToReps: Map<string, string[]>; // meta_cluster_id → top N content_ids
  allClusterContentIds: string[];
};

async function fetchClusterRepresentatives(
  supabase: SupaClient,
  case_id: string,
): Promise<ClusterRepResult> {
  const out: ClusterRepResult = {
    metaToReps: new Map(),
    allClusterContentIds: [],
  };

  // 1. 메타 클러스터 + 자식 가져옴
  const { data: clusters } = await supabase
    .from("content_clusters")
    .select("id, parent_cluster_id, is_meta")
    .eq("case_id", case_id);
  if (!clusters || clusters.length === 0) return out;

  const metaIds = clusters.filter((c) => c.is_meta).map((c) => c.id);
  const childIdToMeta = new Map<string, string>();
  for (const c of clusters) {
    if (!c.is_meta && c.parent_cluster_id) {
      childIdToMeta.set(c.id, c.parent_cluster_id);
    }
  }

  if (metaIds.length === 0) return out;
  const childIds = Array.from(childIdToMeta.keys());
  if (childIds.length === 0) return out;

  // 2. 자식 클러스터의 멤버 (rank_in_cluster 오름차순 = 영상 매출/뷰 상위)
  const allMembers: Array<{
    cluster_id: string;
    content_id: string;
    rank_in_cluster: number | null;
  }> = [];
  for (let i = 0; i < childIds.length; i += FETCH_CHUNK) {
    const slice = childIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("content_cluster_members")
      .select("cluster_id, content_id, rank_in_cluster")
      .in("cluster_id", slice);
    if (error) throw new Error(`cluster_members fetch: ${error.message}`);
    if (data) allMembers.push(...data);
  }

  // 3. 컨텐츠 뷰 정보로 정렬 (rank_in_cluster이 빈 경우 fallback)
  const memberContentIds = Array.from(
    new Set(allMembers.map((m) => m.content_id)),
  );
  const viewsById = new Map<string, number>();
  for (let i = 0; i < memberContentIds.length; i += FETCH_CHUNK) {
    const slice = memberContentIds.slice(i, i + FETCH_CHUNK);
    const { data } = await supabase
      .from("contents")
      .select("id, views")
      .in("id", slice);
    for (const r of data ?? []) {
      viewsById.set(r.id, r.views ?? 0);
    }
  }

  // 4. 메타별로 (자식들의 멤버 union) → views 내림차순 top N
  const metaToMemberSet = new Map<string, Set<string>>();
  for (const m of allMembers) {
    const metaId = childIdToMeta.get(m.cluster_id);
    if (!metaId) continue;
    let set = metaToMemberSet.get(metaId);
    if (!set) {
      set = new Set<string>();
      metaToMemberSet.set(metaId, set);
    }
    set.add(m.content_id);
  }

  const allReps = new Set<string>();
  for (const metaId of metaIds) {
    const memberSet = metaToMemberSet.get(metaId);
    if (!memberSet) continue;
    const sorted = Array.from(memberSet).sort(
      (a, b) => (viewsById.get(b) ?? 0) - (viewsById.get(a) ?? 0),
    );
    const reps = sorted.slice(0, REPS_PER_META);
    out.metaToReps.set(metaId, reps);
    for (const id of reps) allReps.add(id);
  }
  out.allClusterContentIds = Array.from(allReps);
  return out;
}

type VideoInput = {
  content_id: string;
  url: string;
  views: number | null;
  caption: string | null;
  asr_text: string | null;
  cover_url: string | null;
  vision_tags: VisionTags | null;
};

async function fetchVideoInputs(
  supabase: SupaClient,
  case_id: string,
  contentIds: string[],
): Promise<VideoInput[]> {
  const out: VideoInput[] = [];
  for (let i = 0; i < contentIds.length; i += FETCH_CHUNK) {
    const slice = contentIds.slice(i, i + FETCH_CHUNK);

    const { data: contents, error: cErr } = await supabase
      .from("contents")
      .select("id, url, views, caption")
      .in("id", slice);
    if (cErr) throw new Error(`contents fetch: ${cErr.message}`);

    const { data: analyses, error: aErr } = await supabase
      .from("case_video_analyses")
      .select("content_id, asr_text, cover_url, vision_tags")
      .eq("case_id", case_id)
      .in("content_id", slice);
    if (aErr) throw new Error(`analyses fetch: ${aErr.message}`);

    const byId = new Map((analyses ?? []).map((a) => [a.content_id, a]));
    for (const c of contents ?? []) {
      const a = byId.get(c.id);
      out.push({
        content_id: c.id,
        url: c.url,
        views: c.views,
        caption: c.caption,
        asr_text: a?.asr_text ?? null,
        cover_url: a?.cover_url ?? null,
        vision_tags: (a?.vision_tags as VisionTags | null) ?? null,
      });
    }
  }
  return out;
}

function uniqueOrdered(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function pickHighestConfidence(
  cs: Array<"high" | "mid" | "low">,
): "high" | "mid" | "low" | null {
  if (cs.length === 0) return null;
  if (cs.includes("high")) return "high";
  if (cs.includes("mid")) return "mid";
  return "low";
}

function empty(reason: string): Phase4bSkuStats {
  return {
    total_displayed: 0,
    total_matched: 0,
    total_no_match: 0,
    total_failed: 0,
    cost_actual_usd: 0,
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    displayed_videos: [],
    cluster_representatives: {},
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
