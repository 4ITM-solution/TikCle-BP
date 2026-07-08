import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  clearCaseClusters,
  emptyClusterStats,
  fetchClusteringInputs,
  saveClusterResults,
} from "@/lib/inngest/aggregators/phase4b-clusters";
import {
  pass1FindCandidates,
  pass2Validate,
  pass3Meta,
  type ClusterCandidate,
  type MetaCluster,
  type Pass1Diagnostics,
  type TokenUsage,
  type ValidatedCluster,
  type VideoForClustering,
} from "@/lib/anthropic/clusterer";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type {
  Phase4bClusterStats,
  Phase4bSampleStats,
} from "@/lib/inngest/types";
import {
  enqueueDownstream,
  ensurePhase4bSample,
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

// pass1 내부 배치 80개 × step당 5배치(=내부 동시성 1 wave) = 400 영상/step.
// 구조상 한 step이 LLM 5콜 이내 (~1-2분) — Vercel 800s 단일 step 위험 제거 (§3.1 P2).
const PASS1_VIDEOS_PER_STEP = 400;

/**
 * S3 interpret-cluster — 구 Phase 4b.4 (3-pass 클러스터링)를 pass별 step으로 분할.
 *   pass1: 영상 400개 단위 step 열거 → pass2(1 step) → pass3(1 step) → save(1 step).
 * 저장은 aggregator saveClusterResults 재사용 (run_tag swap — WS1 멱등성).
 */
export const interpretCluster = inngest.createFunction(
  {
    id: "phase-interpret-cluster",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("interpret-cluster", event, error);
    },
  },
  {
    event: "case/phase.requested",
    if: 'event.data.phase == "interpret-cluster"',
  },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "interpret-cluster", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // BE-5: key_stats 전체를 step 출력으로 반환하면 Inngest step output 상한(>4MB)을 넘는다.
    //   대형 케이스(3be66bbd 6.9MB — kalodata_*_xlsx 원본 스냅샷 등이 key_stats에 적재됨)에서
    //   "step output size is greater than the limit"로 실패. 이 함수는 캐시 판정에 phase4b_clusters
    //   하나만 쓰므로 그 필드만 반환해 출력을 KB 단위로 슬림화한다. (근본 청소는 WS5 §4 / 020)
    const existing = await step.run("read-key-stats", async () => {
      const ks = await readKeyStats(supabase, case_id);
      return { phase4b_clusters: ks.phase4b_clusters ?? null };
    });
    logger.info("[interpret-cluster] read-key-stats slim", {
      clusters_bytes: existing.phase4b_clusters
        ? JSON.stringify(existing.phase4b_clusters).length
        : 0,
    });
    const sampled = await step.run("sample", async () =>
      ensurePhase4bSample(supabase, case_id, false),
    );
    const sample = sampled.sample as Phase4bSampleStats;

    // 캐시: 이미 클러스터 있고 force 아니고 샘플도 안 바뀜 → skip
    if (existing.phase4b_clusters && !force && !sampled.fresh) {
      logger.info("[interpret-cluster] cached", {
        meta: existing.phase4b_clusters.pass3_meta,
      });
      await step.run("phase-run-finish-cached", async () =>
        markPhaseRun(supabase, case_id, "interpret-cluster", {
          status: "completed",
          finished_at: new Date().toISOString(),
          cost_usd: 0,
          stats: {
            cached: true,
            meta: existing.phase4b_clusters!.pass3_meta,
            memberships: existing.phase4b_clusters!.total_memberships,
          },
        }),
      );
      return {
        ok: true,
        phase: "interpret-cluster",
        cached: true,
        meta: existing.phase4b_clusters.pass3_meta,
      };
    }

    const finish = async (stats: Phase4bClusterStats) => {
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, {
          phase4b_clusters: sanitizeDeep(stats) as Phase4bClusterStats,
        }),
      );
      await step.run("phase-run-finish", async () =>
        markPhaseRun(supabase, case_id, "interpret-cluster", {
          status: "completed",
          finished_at: new Date().toISOString(),
          cost_usd: stats.cost_actual_usd ?? 0,
          stats: {
            input_videos: stats.total_input_videos,
            candidates: stats.pass1_candidates,
            validated: stats.pass2_validated,
            meta: stats.pass3_meta,
            memberships: stats.total_memberships,
            skipped_reason: stats.skipped_reason ?? null,
          },
        }),
      );
      return {
        ok: true,
        phase: "interpret-cluster" as const,
        cached: false,
        meta: stats.pass3_meta,
        skipped_reason: stats.skipped_reason,
      };
    };

    // 빈 결과(입력/후보/검증/메타 0) 종료 경로. force 재실행이면 옛 미스정렬 클러스터를
    // 정직하게 비운다 (BE-2, WS5 §2 / U2). saveClusterResults의 run_tag swap이 이 경로에선
    // 일어나지 않아 legacy 클러스터가 잔존하던 버그(실측 4케이스)를 여기서 청소.
    // 자연(비-force) 실행은 기존 결과 보존 — 삭제하지 않는다.
    const finishEmpty = async (stats: Phase4bClusterStats) => {
      if (force) {
        const cleared = await step.run("clear-legacy-clusters", async () =>
          clearCaseClusters(supabase, case_id),
        );
        if (cleared.cleared_cluster_ids.length > 0) {
          stats.legacy_cleared = {
            cluster_count: cleared.cleared_cluster_ids.length,
            member_count: cleared.cleared_members,
            cluster_ids: cleared.cleared_cluster_ids,
          };
          logger.info("[interpret-cluster] legacy cleared (force+empty)", {
            clusters: cleared.cleared_cluster_ids.length,
            members: cleared.cleared_members,
          });
        }
      }
      return finish(stats);
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      // 환경 실패(키 미설정)는 "진짜 클러스터 없음"이 아니므로 기존 결과를 지우지 않는다.
      return finish(emptyClusterStats("ANTHROPIC_API_KEY 미설정"));
    }

    // ─── 입력 수집 (TT vision_tags + IG/YT caption 통합) ───
    const videos = (await step.run("fetch-inputs", async () =>
      sanitizeDeep(
        await fetchClusteringInputs(
          supabase,
          case_id,
          sample.sample_content_ids,
        ),
      ),
    )) as VideoForClustering[];
    if (videos.length === 0) {
      return finishEmpty(
        emptyClusterStats(
          "입력 영상 0개 (TT vision_tags + IG/YT caption 모두 비어있음)",
        ),
      );
    }

    // ─── Pass 1 — 400영상 단위 step 열거 ───
    // WS3 §3.4: pass1=Haiku / pass2·3=Sonnet → 단가 다르므로 usage 분리 누산.
    const usagePass1: TokenUsage = {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    };
    const usagePass23: TokenUsage = {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    };
    const candidates: ClusterCandidate[] = [];
    const pass1Diag: Pass1Diagnostics = {
      batches: 0,
      raw_clusters_total: 0,
      parse_failures: 0,
      dropped_too_small: 0,
      dropped_id_mismatch: 0,
      sample_unmatched_ids: [],
      sample_member_id_format: null,
    };
    const pass1Steps = Math.ceil(videos.length / PASS1_VIDEOS_PER_STEP);
    for (let i = 0; i < pass1Steps; i += 1) {
      const slice = videos.slice(
        i * PASS1_VIDEOS_PER_STEP,
        (i + 1) * PASS1_VIDEOS_PER_STEP,
      );
      const r = await step.run(`pass1-${i}`, async () =>
        sanitizeDeep(await pass1FindCandidates(slice)),
      );
      candidates.push(...(r.candidates as ClusterCandidate[]));
      addUsage(usagePass1, r.usage as TokenUsage);
      mergeDiag(pass1Diag, r.diagnostics as Pass1Diagnostics);
      logger.info(`[interpret-cluster] pass1 step ${i}`, {
        videos: slice.length,
        candidates: r.candidates.length,
      });
    }
    if (candidates.length === 0) {
      return finishEmpty(
        emptyClusterStats("Pass 1 후보 0개", {
          total_input_videos: videos.length,
          usagePass1,
          usagePass23,
          pass1_debug: pass1Diag,
        }),
      );
    }

    // ─── Pass 2 — 통합/검증 (1 step) ───
    const pass2 = await step.run("pass2", async () =>
      sanitizeDeep(await pass2Validate(candidates)),
    );
    const validated = pass2.validated as ValidatedCluster[];
    addUsage(usagePass23, pass2.usage as TokenUsage);
    if (validated.length === 0) {
      return finishEmpty(
        emptyClusterStats("Pass 2 validated 0개", {
          total_input_videos: videos.length,
          pass1_candidates: candidates.length,
          usagePass1,
          usagePass23,
          pass1_debug: pass1Diag,
          pass2_debug: pass2.diagnostics,
        }),
      );
    }

    // ─── Pass 3 — 메타 클러스터 (1 step) ───
    const pass3 = await step.run("pass3", async () =>
      sanitizeDeep(await pass3Meta(validated)),
    );
    const metas = pass3.metas as MetaCluster[];
    addUsage(usagePass23, pass3.usage as TokenUsage);
    if (metas.length === 0) {
      return finishEmpty(
        emptyClusterStats("Pass 3 meta 0개", {
          total_input_videos: videos.length,
          pass1_candidates: candidates.length,
          pass2_validated: validated.length,
          usagePass1,
          usagePass23,
          pass1_debug: pass1Diag,
          pass2_debug: pass2.diagnostics,
        }),
      );
    }

    // ─── Save — run_tag swap insert + 구버전 delete (1 step) ───
    const stats = (await step.run("save-clusters", async () =>
      sanitizeDeep(
        await saveClusterResults(supabase, case_id, {
          videos,
          pass1_candidates: candidates.length,
          validated,
          metas,
          usagePass1,
          usagePass23,
          pass1_debug: pass1Diag,
          pass2_debug: pass2.diagnostics,
        }),
      ),
    )) as Phase4bClusterStats;

    logger.info("[interpret-cluster] done", {
      input: stats.total_input_videos,
      candidates: stats.pass1_candidates,
      validated: stats.pass2_validated,
      meta: stats.pass3_meta,
      memberships: stats.total_memberships,
      cost: stats.cost_actual_usd,
    });

    // BE-12: 실작업 성공 → downstream 자동 동반(cascade). 캐시/빈결과 조기종료는 무효화 불필요.
    await step.run("enqueue-downstream", () =>
      enqueueDownstream("interpret-cluster", case_id, event.data as PhaseEventData),
    );
    return finish(stats);
  },
);

function addUsage(acc: TokenUsage, add: TokenUsage): void {
  acc.input += add.input;
  acc.output += add.output;
  acc.cache_read += add.cache_read;
  acc.cache_write += add.cache_write;
}

function mergeDiag(acc: Pass1Diagnostics, add: Pass1Diagnostics): void {
  acc.batches += add.batches;
  acc.raw_clusters_total += add.raw_clusters_total;
  acc.parse_failures += add.parse_failures;
  acc.dropped_too_small += add.dropped_too_small;
  acc.dropped_id_mismatch += add.dropped_id_mismatch;
  for (const id of add.sample_unmatched_ids) {
    if (acc.sample_unmatched_ids.length < 5) acc.sample_unmatched_ids.push(id);
  }
  if (acc.sample_member_id_format == null) {
    acc.sample_member_id_format = add.sample_member_id_format;
  }
}
