import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  calcClusterCost,
  pass1FindCandidates,
  pass2Validate,
  pass3Meta,
  type TokenUsage,
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
    return empty("ANTHROPIC_API_KEY 미설정");
  }
  if (sample.sample_content_ids.length === 0) {
    return empty("샘플 0개");
  }

  // 1. vision_tags가 있는 영상만 가져옴 (입력)
  const videos = await fetchClusteringInputs(
    supabase,
    case_id,
    sample.sample_content_ids,
  );
  if (videos.length === 0) {
    return empty("vision_tags 있는 영상 0개 (Phase 4b.3 먼저 실행)");
  }

  const totalUsage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };

  // 2. Pass 1
  const { candidates, usage: u1, diagnostics: pass1_debug } =
    await pass1FindCandidates(videos);
  addUsage(totalUsage, u1);
  if (candidates.length === 0) {
    return empty("Pass 1 후보 0개", {
      total_input_videos: videos.length,
      usage: totalUsage,
      pass1_debug,
    });
  }

  // 3. Pass 2
  const { validated, usage: u2, diagnostics: pass2_debug } =
    await pass2Validate(candidates);
  addUsage(totalUsage, u2);
  if (validated.length === 0) {
    return empty("Pass 2 validated 0개", {
      total_input_videos: videos.length,
      pass1_candidates: candidates.length,
      usage: totalUsage,
      pass1_debug,
      pass2_debug,
    });
  }

  // 4. Pass 3
  const { metas, usage: u3 } = await pass3Meta(validated);
  addUsage(totalUsage, u3);
  if (metas.length === 0) {
    return empty("Pass 3 meta 0개", {
      total_input_videos: videos.length,
      pass1_candidates: candidates.length,
      pass2_validated: validated.length,
      usage: totalUsage,
      pass1_debug,
      pass2_debug,
    });
  }

  // 5. 기존 클러스터 정리 (재실행 시 중복 방지)
  await cleanupExistingClusters(supabase, case_id);

  // 6. DB 저장 — 메타 클러스터 → 자식 → 멤버
  const meta_clusters: MetaClusterEntry[] = [];
  let totalMemberships = 0;

  // 자식 클러스터 인덱스별 DB id 매핑
  const childIdxToDbId = new Map<number, string>();
  const childIdxToMemberCount = new Map<number, number>();
  const childIdxToName = new Map<number, string>();

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
      })
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
        })
        .select("id")
        .single();
      if (childErr || !childRow) {
        throw new Error(`child cluster insert: ${childErr?.message}`);
      }

      childIdxToDbId.set(childIdx, childRow.id);
      childIdxToMemberCount.set(childIdx, child.member_ids.length);
      childIdxToName.set(childIdx, child.name);
      childInfos.push({
        id: childRow.id,
        name: child.name,
        member_count: child.member_ids.length,
      });

      // 자식의 멤버를 cluster_members에 insert + 메타 union
      const memberRows = child.member_ids.map((content_id, rank) => ({
        cluster_id: childRow.id,
        content_id,
        rank_in_cluster: rank,
      }));
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

      // case_video_analyses.pass3_meta_id 업데이트
      // (한 영상이 여러 자식 → 여러 메타 가능 — 첫 메타 우선)
      for (let i = 0; i < child.member_ids.length; i += FETCH_CHUNK) {
        const slice = child.member_ids.slice(i, i + FETCH_CHUNK);
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

  return {
    total_input_videos: videos.length,
    pass1_candidates: candidates.length,
    pass2_validated: validated.length,
    pass3_meta: metas.length,
    total_memberships: totalMemberships,
    cost_actual_usd: calcClusterCost(totalUsage),
    tokens_input: totalUsage.input,
    tokens_output: totalUsage.output,
    tokens_cache_read: totalUsage.cache_read,
    meta_clusters,
    pass1_debug,
    pass2_debug,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// helpers
// =============================================================================

async function fetchClusteringInputs(
  supabase: SupaClient,
  case_id: string,
  contentIds: string[],
): Promise<VideoForClustering[]> {
  const inputs: VideoForClustering[] = [];

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
        content_id: a.content_id,
        vision_tags: tags,
        views: c?.views ?? null,
        collect_count: c?.collect_count ?? null,
      });
    }
  }
  return inputs;
}

async function cleanupExistingClusters(
  supabase: SupaClient,
  case_id: string,
): Promise<void> {
  const { data: clusters } = await supabase
    .from("content_clusters")
    .select("id")
    .eq("case_id", case_id);
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
  await supabase.from("content_clusters").delete().eq("case_id", case_id);

  // case_video_analyses의 pass labels 리셋
  await supabase
    .from("case_video_analyses")
    .update({ pass1_label: null, pass2_label: null, pass3_meta_id: null })
    .eq("case_id", case_id);
}

function addUsage(acc: TokenUsage, add: TokenUsage): void {
  acc.input += add.input;
  acc.output += add.output;
  acc.cache_read += add.cache_read;
  acc.cache_write += add.cache_write;
}

function empty(
  reason: string,
  partial?: {
    total_input_videos?: number;
    pass1_candidates?: number;
    pass2_validated?: number;
    pass3_meta?: number;
    usage?: TokenUsage;
    pass1_debug?: Phase4bClusterStats["pass1_debug"];
    pass2_debug?: Phase4bClusterStats["pass2_debug"];
  },
): Phase4bClusterStats {
  return {
    total_input_videos: partial?.total_input_videos ?? 0,
    pass1_candidates: partial?.pass1_candidates ?? 0,
    pass2_validated: partial?.pass2_validated ?? 0,
    pass3_meta: partial?.pass3_meta ?? 0,
    total_memberships: 0,
    cost_actual_usd: partial?.usage ? calcClusterCost(partial.usage) : 0,
    tokens_input: partial?.usage?.input ?? 0,
    tokens_output: partial?.usage?.output ?? 0,
    tokens_cache_read: partial?.usage?.cache_read ?? 0,
    meta_clusters: [],
    pass1_debug: partial?.pass1_debug,
    pass2_debug: partial?.pass2_debug,
    skipped_reason: reason,
    computed_at: new Date().toISOString(),
  };
}
