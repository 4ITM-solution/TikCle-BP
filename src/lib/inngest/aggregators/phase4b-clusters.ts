import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcClusterCost,
  parseClusterKey,
  pass1FindCandidates,
  pass2Validate,
  pass3Meta,
  platformPrefix,
  type ClusterPlatform,
  type MetaCluster,
  type TokenUsage,
  type ValidatedCluster,
  type VideoForClustering,
} from "@/lib/anthropic/clusterer";
import type {
  MetaClusterEntry,
  Phase4bClusterStats,
  Phase4bSampleStats,
  VisionTags,
} from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_CHUNK = 200;

/**
 * Phase 4b.4 — 3-pass Clustering
 *
 * vision_tags가 있는 샘플 영상을 LLM에 보내 패턴 클러스터링.
 *   Pass 1: batch별 후보 클러스터 발견 (80개씩 묶어 LLM)
 *   Pass 2: 후보들 통합/병합 → validated cluster
 *   Pass 3: validated → 메타 클러스터 (4-8개)
 *
 * 결과:
 *   - content_clusters 테이블 (메타 + 자식)
 *   - content_cluster_members (영상-클러스터 연결, 한 영상이 여러 클러스터 가능)
 *   - case_video_analyses.pass1_label / pass2_label / pass3_meta_id
 *   - key_stats.phase4b_clusters (UI 요약)
 */
export async function runPhase4bClusters(
  supabase: SupaClient,
  case_id: string,
  sample: Phase4bSampleStats,
): Promise<Phase4bClusterStats> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return emptyClusterStats("ANTHROPIC_API_KEY 미설정");
  }
  // sample.sample_content_ids는 TikTok 한정. 비어있어도 IG/YT가 있으면 진행 (다채널
  // 통합 클러스터 — TT/IG/YT 중 하나만 있어도 cluster 가능).

  // 1. 입력 수집 — TikTok(vision_tags) + IG(caption) + YT(title+desc) 통합
  const videos = await fetchClusteringInputs(
    supabase,
    case_id,
    sample.sample_content_ids,
  );
  if (videos.length === 0) {
    return emptyClusterStats("입력 영상 0개 (TT vision_tags + IG/YT caption 모두 비어있음)");
  }

  // WS3 §3.4: pass1은 Haiku, pass2/3은 Sonnet이라 단가가 달라 usage를 분리 누산.
  const usagePass1: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const usagePass23: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };

  // 2. Pass 1
  const { candidates, usage: u1, diagnostics: pass1_debug } =
    await pass1FindCandidates(videos);
  addUsage(usagePass1, u1);
  if (candidates.length === 0) {
    return emptyClusterStats("Pass 1 후보 0개", {
      total_input_videos: videos.length,
      usagePass1,
      usagePass23,
      pass1_debug,
    });
  }

  // 3. Pass 2
  const { validated, usage: u2, diagnostics: pass2_debug } =
    await pass2Validate(candidates);
  addUsage(usagePass23, u2);
  if (validated.length === 0) {
    return emptyClusterStats("Pass 2 validated 0개", {
      total_input_videos: videos.length,
      pass1_candidates: candidates.length,
      usagePass1,
      usagePass23,
      pass1_debug,
      pass2_debug,
    });
  }

  // 4. Pass 3
  const { metas, usage: u3 } = await pass3Meta(validated);
  addUsage(usagePass23, u3);
  if (metas.length === 0) {
    return emptyClusterStats("Pass 3 meta 0개", {
      total_input_videos: videos.length,
      pass1_candidates: candidates.length,
      pass2_validated: validated.length,
      usagePass1,
      usagePass23,
      pass1_debug,
      pass2_debug,
    });
  }

  // 5~7. DB 저장 (swap) + stats — WS2에서 saveClusterResults로 분리
  //      (interpret-cluster 함수가 pass별 step 실행 후 동일 저장 경로 재사용)
  return saveClusterResults(supabase, case_id, {
    videos,
    pass1_candidates: candidates.length,
    validated,
    metas,
    usagePass1,
    usagePass23,
    pass1_debug,
    pass2_debug,
  });
}

/** interpret-cluster(WS2) / runPhase4bClusters 공용 저장 입력. */
export type ClusterSaveInput = {
  videos: VideoForClustering[];
  pass1_candidates: number;
  validated: ValidatedCluster[];
  metas: MetaCluster[];
  // WS3 §3.4: pass1(Haiku) / pass2·3(Sonnet) 단가 분리 위해 usage를 나눠 받는다.
  usagePass1: TokenUsage;
  usagePass23: TokenUsage;
  pass1_debug?: Phase4bClusterStats["pass1_debug"];
  pass2_debug?: Phase4bClusterStats["pass2_debug"];
};

/**
 * Pass 3까지 끝난 결과를 DB에 저장 (swap 방식, WS1 §3.3) + Phase4bClusterStats 생성.
 * 구버전 삭제를 먼저 하지 않는다: 새 run_tag로 insert → 전부 성공한 뒤에만
 * 다른 run_tag(구버전·이전 부분실패 잔재) delete. 중간 실패 시 구버전이 살아있어
 * C 섹션이 빈 화면이 되지 않음.
 */
export async function saveClusterResults(
  supabase: SupaClient,
  case_id: string,
  input: ClusterSaveInput,
): Promise<Phase4bClusterStats> {
  const {
    videos,
    pass1_candidates,
    validated,
    metas,
    usagePass1,
    usagePass23,
    pass1_debug,
    pass2_debug,
  } = input;
  // 토큰 통계(합계)는 두 pass 누산기 합. 비용은 pass별 단가로 분리 계산.
  const totalUsage: TokenUsage = {
    input: usagePass1.input + usagePass23.input,
    output: usagePass1.output + usagePass23.output,
    cache_read: usagePass1.cache_read + usagePass23.cache_read,
    cache_write: usagePass1.cache_write + usagePass23.cache_write,
  };
  const runTag = randomUUID();

  // pass 라벨은 새 매핑을 쓰기 전에 리셋 (pass3_meta_id null 필터가 신규 업데이트 조건이므로)
  await resetPassLabels(supabase, case_id);

  // cluster_key → VideoForClustering 룩업 (insert 시 platform/refs 채우기 위함)
  const videoByKey = new Map<string, VideoForClustering>();
  for (const v of videos) videoByKey.set(v.cluster_key, v);

  // 6. DB 저장 — 메타 클러스터 → 자식 → 멤버
  const meta_clusters: MetaClusterEntry[] = [];
  let totalMemberships = 0;

  for (let metaOrder = 0; metaOrder < metas.length; metaOrder += 1) {
    const meta = metas[metaOrder]!;

    // 메타 클러스터 row 생성
    const { data: metaRow, error: metaErr } = await supabase
      .from("content_clusters")
      .insert({
        case_id,
        name: meta.name,
        description: meta.description,
        is_meta: true,
        display_order: metaOrder,
        run_tag: runTag,
      } as Database["public"]["Tables"]["content_clusters"]["Insert"])
      .select("id")
      .single();
    if (metaErr || !metaRow) {
      throw new Error(`meta cluster insert: ${metaErr?.message}`);
    }
    const metaDbId = metaRow.id;

    // 메타에 속하는 자식 클러스터들의 멤버 union
    const metaMemberSet = new Set<string>();
    const childInfos: MetaClusterEntry["child_clusters"] = [];

    for (const childIdx of meta.child_indexes) {
      const child = validated[childIdx];
      if (!child) continue;

      // 자식 클러스터 row 생성
      const { data: childRow, error: childErr } = await supabase
        .from("content_clusters")
        .insert({
          case_id,
          name: child.name,
          description: child.description,
          hook_pattern: child.hook_pattern,
          body_pattern: child.body_pattern,
          parent_cluster_id: metaDbId,
          is_meta: false,
          member_count: child.member_ids.length,
          run_tag: runTag,
        } as Database["public"]["Tables"]["content_clusters"]["Insert"])
        .select("id")
        .single();
      if (childErr || !childRow) {
        throw new Error(`child cluster insert: ${childErr?.message}`);
      }

      childInfos.push({
        id: childRow.id,
        name: child.name,
        member_count: child.member_ids.length,
      });

      // 자식의 멤버를 cluster_members에 insert (platform별 컬럼 분기)
      // child.member_ids = cluster_key 배열 (예: "tk_a1b2c3d4")
      type MemberInsert = Database["public"]["Tables"]["content_cluster_members"]["Insert"];
      const memberRows: MemberInsert[] = [];
      const tkContentIds: string[] = []; // pass3_meta_id 업데이트 대상
      for (let rank = 0; rank < child.member_ids.length; rank += 1) {
        const key = child.member_ids[rank]!;
        const v = videoByKey.get(key);
        if (!v) continue; // resolved 후에는 항상 있어야 하지만 안전망
        memberRows.push({
          cluster_id: childRow.id,
          rank_in_cluster: rank,
          platform: v.platform,
          content_id: v.platform === "tiktok" ? v.content_id : null,
          external_ref: v.platform === "tiktok" ? null : v.external_ref,
        });
        if (v.platform === "tiktok" && v.content_id) {
          tkContentIds.push(v.content_id);
        }
      }
      for (let i = 0; i < memberRows.length; i += FETCH_CHUNK) {
        const slice = memberRows.slice(i, i + FETCH_CHUNK);
        const { error } = await supabase
          .from("content_cluster_members")
          .insert(slice);
        if (error) {
          throw new Error(`cluster_members insert: ${error.message}`);
        }
        totalMemberships += slice.length;
      }

      for (const id of child.member_ids) metaMemberSet.add(id);

      // case_video_analyses.pass3_meta_id 업데이트 — TikTok 멤버만 (IG/YT 영상은
      // case_video_analyses row가 없음)
      for (let i = 0; i < tkContentIds.length; i += FETCH_CHUNK) {
        const slice = tkContentIds.slice(i, i + FETCH_CHUNK);
        const { data: existing } = await supabase
          .from("case_video_analyses")
          .select("content_id, pass3_meta_id")
          .eq("case_id", case_id)
          .in("content_id", slice);
        const toUpdate = (existing ?? [])
          .filter((r) => r.pass3_meta_id == null)
          .map((r) => r.content_id);
        if (toUpdate.length === 0) continue;
        await supabase
          .from("case_video_analyses")
          .update({ pass3_meta_id: metaDbId, pass2_label: child.name })
          .eq("case_id", case_id)
          .in("content_id", toUpdate);
      }
    }

    // 메타 클러스터의 member_count = 자식 union 크기
    await supabase
      .from("content_clusters")
      .update({ member_count: metaMemberSet.size })
      .eq("id", metaDbId);

    meta_clusters.push({
      id: metaDbId,
      name: meta.name,
      description: meta.description,
      hook_pattern: childInfos.map((c) => c.name).slice(0, 2).join(" / "),
      body_pattern: "",
      member_count: metaMemberSet.size,
      child_clusters: childInfos,
    });
  }

  // 7. 신규 insert 전부 성공 → 이제 구버전(다른 run_tag + 과거 null run_tag) 삭제.
  //    이전 부분 실패 런의 잔재도 여기서 함께 청소됨.
  await deleteClustersExcept(supabase, case_id, runTag);

  const stats = {
    total_input_videos: videos.length,
    pass1_candidates,
    pass2_validated: validated.length,
    pass3_meta: metas.length,
    total_memberships: totalMemberships,
    cost_actual_usd: calcClusterCost(usagePass1, usagePass23),
    tokens_input: totalUsage.input,
    tokens_output: totalUsage.output,
    tokens_cache_read: totalUsage.cache_read,
    meta_clusters,
    pass1_debug,
    pass2_debug,
    computed_at: new Date().toISOString(),
  };

  // ★ 방어망: 큰 케이스는 clusters step 이 거의 maxDuration(800s)에 끝나고 step return /
  //   phase-4b-clusters-save 에서 끊겨(http_unreachable) key_stats.phase4b_clusters 가
  //   저장 안 되는 일이 있음 → DB엔 새 클러스터가 있는데 화면 meta 가 옛것이라 미스정렬(C 토글 0).
  //   여기서 insert 직후 key_stats 를 즉시 merge-저장해 두면, return 이 끊겨도 매핑이 보존됨.
  try {
    const { data: row } = await supabase
      .from("cases")
      .select("key_stats")
      .eq("id", case_id)
      .single();
    const ks = (row?.key_stats ?? {}) as Record<string, unknown>;
    ks.phase4b_clusters = JSON.parse(JSON.stringify(stats));
    await supabase.from("cases").update({ key_stats: ks as never }).eq("id", case_id);
  } catch (e) {
    console.warn("[phase4b-clusters] 방어 저장 실패(무시):", e);
  }

  return stats;
}

// =============================================================================
// helpers
// =============================================================================

// IG/YT는 한 케이스 안에서도 영상 수가 수천 ~ 만 단위까지 갈 수 있어, 클러스터
// 입력 토큰 폭증 방지용 상한. 상한 초과 시 view 내림차순으로 잘림 (인기 영상 우선).
const IG_MAX = 600;
const YT_MAX = 400;

export async function fetchClusteringInputs(
  supabase: SupaClient,
  case_id: string,
  contentIds: string[],
): Promise<VideoForClustering[]> {
  const inputs: VideoForClustering[] = [];

  // ------------------- TikTok (vision_tags 기반) -------------------
  for (let i = 0; i < contentIds.length; i += FETCH_CHUNK) {
    const chunk = contentIds.slice(i, i + FETCH_CHUNK);

    const { data: analyses, error: aErr } = await supabase
      .from("case_video_analyses")
      .select("content_id, vision_tags")
      .eq("case_id", case_id)
      .in("content_id", chunk)
      .not("vision_tags", "is", null);
    if (aErr) throw new Error(`analyses fetch: ${aErr.message}`);

    const { data: contents, error: cErr } = await supabase
      .from("contents")
      .select("id, views, collect_count")
      .in("id", chunk);
    if (cErr) throw new Error(`contents fetch: ${cErr.message}`);
    const contentsById = new Map(
      (contents ?? []).map((c) => [c.id, c]),
    );

    for (const a of analyses ?? []) {
      const c = contentsById.get(a.content_id);
      const tags = a.vision_tags as VisionTags | null;
      if (!tags) continue;
      inputs.push({
        cluster_key: `${platformPrefix("tiktok")}_${a.content_id.slice(0, 8)}`,
        platform: "tiktok",
        content_id: a.content_id,
        external_ref: null,
        vision_tags: tags,
        caption: null,
        views: c?.views ?? null,
        collect_count: c?.collect_count ?? null,
      });
    }
  }

  // ------------------- Instagram (Stage 2: vision_tags 박혔으면 사용, fallback caption) -------------------
  // IG vision 박힌 row 가져옴 (case_video_analyses.platform='instagram')
  const sbAny = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => Promise<{ data: Array<{ external_ref: string; vision_tags: VisionTags | null; cover_url: string | null }> | null }>;
        };
      };
    };
  };
  const { data: igVisionRows } = await sbAny
    .from("case_video_analyses")
    .select("external_ref, vision_tags, cover_url")
    .eq("case_id", case_id)
    .eq("platform", "instagram");
  const igVisionByRef = new Map(
    (igVisionRows ?? []).map((r) => [r.external_ref, r.vision_tags]),
  );

  const { data: igRows, error: igErr } = await supabase
    .from("ig_posts")
    .select("ig_id, caption, hashtags, video_view_count, video_play_count, likes_count")
    .eq("case_id", case_id)
    .not("caption", "is", null)
    .order("video_view_count", { ascending: false, nullsFirst: false })
    .limit(IG_MAX);
  if (igErr) throw new Error(`ig_posts fetch: ${igErr.message}`);
  for (const r of igRows ?? []) {
    const cap = (r.caption ?? "").trim();
    const tags = igVisionByRef.get(r.ig_id) ?? null;
    if (!tags && cap.length < 10) continue; // vision 없고 caption 도 짧으면 skip
    const hashStr =
      r.hashtags && r.hashtags.length > 0
        ? ` #${r.hashtags.slice(0, 10).join(" #")}`
        : "";
    inputs.push({
      cluster_key: `${platformPrefix("instagram")}_${r.ig_id.slice(0, 8)}`,
      platform: "instagram",
      content_id: null,
      external_ref: r.ig_id,
      vision_tags: tags,
      caption: tags ? null : cap + hashStr, // vision 박혔으면 caption 안 쓰임 (LLM 입력 토큰 절약)
      views: r.video_view_count ?? r.video_play_count ?? r.likes_count ?? null,
      collect_count: null,
    });
  }

  // ------------------- YouTube (Stage 2: vision_tags 박혔으면 사용, fallback title+desc) -------------------
  const { data: ytVisionRows } = await sbAny
    .from("case_video_analyses")
    .select("external_ref, vision_tags, cover_url")
    .eq("case_id", case_id)
    .eq("platform", "youtube");
  const ytVisionByRef = new Map(
    (ytVisionRows ?? []).map((r) => [r.external_ref, r.vision_tags]),
  );

  const { data: ytRows, error: ytErr } = await supabase
    .from("yt_videos")
    .select("yt_id, title, description, hashtags, view_count, like_count")
    .eq("case_id", case_id)
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(YT_MAX);
  if (ytErr) throw new Error(`yt_videos fetch: ${ytErr.message}`);
  for (const r of ytRows ?? []) {
    const title = (r.title ?? "").trim();
    const desc = (r.description ?? "").trim();
    const tags = ytVisionByRef.get(r.yt_id) ?? null;
    if (!tags && title.length < 5 && desc.length < 10) continue;
    const hashStr =
      r.hashtags && r.hashtags.length > 0
        ? ` #${r.hashtags.slice(0, 10).join(" #")}`
        : "";
    const combined = title
      ? `${title} — ${desc.slice(0, 180)}`
      : desc.slice(0, 220);
    inputs.push({
      cluster_key: `${platformPrefix("youtube")}_${r.yt_id.slice(0, 8)}`,
      platform: "youtube",
      content_id: null,
      external_ref: r.yt_id,
      vision_tags: tags,
      caption: tags ? null : combined + hashStr, // vision 박혔으면 caption 안 씀
      views: r.view_count ?? r.like_count ?? null,
      collect_count: null,
    });
  }

  return inputs;
}

/** case_video_analyses의 pass labels 리셋 — 새 run의 매핑 업데이트 전 1회. */
async function resetPassLabels(
  supabase: SupaClient,
  case_id: string,
): Promise<void> {
  await supabase
    .from("case_video_analyses")
    .update({ pass1_label: null, pass2_label: null, pass3_meta_id: null })
    .eq("case_id", case_id);
}

/**
 * swap 후반부 (WS1, §3.3): 현재 run_tag가 아닌 클러스터(구버전 + null run_tag 레거시 +
 * 과거 부분 실패 잔재)를 삭제. 신규 insert가 전부 성공한 뒤에만 호출할 것.
 */
async function deleteClustersExcept(
  supabase: SupaClient,
  case_id: string,
  runTag: string,
): Promise<void> {
  // run_tag는 generated types 미반영 (migration 017) → 문자열 or 필터 사용
  const { data: clusters } = await supabase
    .from("content_clusters")
    .select("id")
    .eq("case_id", case_id)
    .or(`run_tag.is.null,run_tag.neq.${runTag}`);
  const ids = (clusters ?? []).map((c) => c.id);
  if (ids.length === 0) return;

  // members 먼저 (FK)
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const slice = ids.slice(i, i + FETCH_CHUNK);
    await supabase
      .from("content_cluster_members")
      .delete()
      .in("cluster_id", slice);
  }
  // 클러스터는 단일 statement로 삭제 (parent_cluster_id FK — 자식/부모 동시 삭제)
  await supabase
    .from("content_clusters")
    .delete()
    .eq("case_id", case_id)
    .or(`run_tag.is.null,run_tag.neq.${runTag}`);
}

function addUsage(acc: TokenUsage, add: TokenUsage): void {
  acc.input += add.input;
  acc.output += add.output;
  acc.cache_read += add.cache_read;
  acc.cache_write += add.cache_write;
}

export function emptyClusterStats(
  reason: string,
  partial?: {
    total_input_videos?: number;
    pass1_candidates?: number;
    pass2_validated?: number;
    pass3_meta?: number;
    usagePass1?: TokenUsage;
    usagePass23?: TokenUsage;
    pass1_debug?: Phase4bClusterStats["pass1_debug"];
    pass2_debug?: Phase4bClusterStats["pass2_debug"];
  },
): Phase4bClusterStats {
  const u1 = partial?.usagePass1;
  const u23 = partial?.usagePass23;
  const cost = u1 || u23
    ? calcClusterCost(
        u1 ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        u23 ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      )
    : 0;
  return {
    total_input_videos: partial?.total_input_videos ?? 0,
    pass1_candidates: partial?.pass1_candidates ?? 0,
    pass2_validated: partial?.pass2_validated ?? 0,
    pass3_meta: partial?.pass3_meta ?? 0,
    total_memberships: 0,
    cost_actual_usd: cost,
    tokens_input: (u1?.input ?? 0) + (u23?.input ?? 0),
    tokens_output: (u1?.output ?? 0) + (u23?.output ?? 0),
    tokens_cache_read: (u1?.cache_read ?? 0) + (u23?.cache_read ?? 0),
    meta_clusters: [],
    pass1_debug: partial?.pass1_debug,
    pass2_debug: partial?.pass2_debug,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
