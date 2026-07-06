import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  fetchPhase4bAsrSetup,
  finalizePhase4bAsr,
  processPhase4bAsrBatch,
  type Phase4bAsrBatchResult,
} from "@/lib/inngest/aggregators/phase4b-asr";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type { Phase4bAsrStats, Phase4bSampleStats } from "@/lib/inngest/types";
import {
  ensurePhase4bSample,
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

const ASR_BATCH_SIZE = 50;

/**
 * S3 interpret-asr — 구 Phase 4b.1 (분석 샘플 선정) + 4b.2 (clockworks ASR 수집).
 * 샘플 선정은 무료 SQL이라 이 함수 앞단에 흡수.
 */
export const interpretAsr = inngest.createFunction(
  {
    id: "phase-interpret-asr",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("interpret-asr", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "interpret-asr"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "interpret-asr", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    const existing = await step.run("read-key-stats", async () =>
      readKeyStats(supabase, case_id),
    );

    // ─── 구 4b.1: 샘플 확보 ───
    const sampled = await step.run("sample", async () =>
      ensurePhase4bSample(supabase, case_id, force),
    );
    const sample = sampled.sample as Phase4bSampleStats;
    const sampleFresh = sampled.fresh;

    // ─── 구 4b.2: ASR 수집 (batch) ───
    const cacheHit = existing.phase4b_asr && !force && !sampleFresh;
    let phase4bAsr: Phase4bAsrStats;
    if (cacheHit) {
      logger.info("[interpret-asr] cached", {
        with_asr: existing.phase4b_asr!.total_with_asr,
      });
      phase4bAsr = existing.phase4b_asr!;
    } else {
      const setup = await step.run("asr-setup", async () =>
        fetchPhase4bAsrSetup(supabase, sample),
      );
      if (setup.skipped_reason) {
        phase4bAsr = (await step.run("asr-finalize", async () =>
          sanitizeDeep(finalizePhase4bAsr([], setup.skipped_reason)),
        )) as Phase4bAsrStats;
      } else {
        const totalBatches = Math.ceil(setup.contents.length / ASR_BATCH_SIZE);
        const batchResults: Phase4bAsrBatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.contents.slice(
            i * ASR_BATCH_SIZE,
            (i + 1) * ASR_BATCH_SIZE,
          );
          const r = (await step.run(`asr-batch-${i}`, async () =>
            sanitizeDeep(await processPhase4bAsrBatch(supabase, case_id, slice)),
          )) as Phase4bAsrBatchResult;
          batchResults.push(r);
        }
        phase4bAsr = (await step.run("asr-finalize", async () =>
          sanitizeDeep(finalizePhase4bAsr(batchResults)),
        )) as Phase4bAsrStats;
      }
      logger.info("[interpret-asr] done", {
        attempted: phase4bAsr.total_attempted,
        with_asr: phase4bAsr.total_with_asr,
        cost: phase4bAsr.cost_actual_usd,
        skipped: phase4bAsr.skipped_reason,
      });
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase4b_asr: phase4bAsr }),
      );
    }

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "interpret-asr", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: cacheHit ? 0 : (phase4bAsr.cost_actual_usd ?? 0),
        stats: {
          cached: !!cacheHit,
          sample_picked: sample.total_picked,
          attempted: phase4bAsr.total_attempted,
          with_asr: phase4bAsr.total_with_asr,
          skipped_reason: phase4bAsr.skipped_reason ?? null,
        },
      }),
    );

    return {
      ok: true,
      phase: "interpret-asr",
      cached: !!cacheHit,
      sample_picked: sample.total_picked,
      with_asr: phase4bAsr.total_with_asr,
    };
  },
);
