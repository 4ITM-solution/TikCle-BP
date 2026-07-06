import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase4bSku } from "@/lib/inngest/aggregators/phase4b-sku";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type {
  Phase4bSampleStats,
  Phase4bSkuStats,
} from "@/lib/inngest/types";
import {
  ensurePhase4bSample,
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

/** S3 interpret-sku — 구 Phase 4b.5 (화면 노출 영상 SKU 매칭). */
export const interpretSku = inngest.createFunction(
  {
    id: "phase-interpret-sku",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("interpret-sku", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "interpret-sku"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "interpret-sku", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    const existing = await step.run("read-key-stats", async () =>
      readKeyStats(supabase, case_id),
    );
    const sampled = await step.run("sample", async () =>
      ensurePhase4bSample(supabase, case_id, false),
    );
    const sample = sampled.sample as Phase4bSampleStats;

    const cacheHit = existing.phase4b_sku && !force && !sampled.fresh;
    let phase4bSku: Phase4bSkuStats;
    if (cacheHit) {
      logger.info("[interpret-sku] cached", {
        matched: existing.phase4b_sku!.total_matched,
      });
      phase4bSku = existing.phase4b_sku!;
    } else {
      phase4bSku = (await step.run("sku-match", async () => {
        const stats = await runPhase4bSku(supabase, case_id, sample);
        logger.info("[interpret-sku] done", {
          displayed: stats.total_displayed,
          matched: stats.total_matched,
          cost: stats.cost_actual_usd,
          skipped: stats.skipped_reason,
        });
        return sanitizeDeep(stats);
      })) as Phase4bSkuStats;
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase4b_sku: phase4bSku }),
      );
    }

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "interpret-sku", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: cacheHit ? 0 : (phase4bSku.cost_actual_usd ?? 0),
        stats: {
          cached: !!cacheHit,
          displayed: phase4bSku.total_displayed,
          matched: phase4bSku.total_matched,
          skipped_reason: phase4bSku.skipped_reason ?? null,
        },
      }),
    );

    return {
      ok: true,
      phase: "interpret-sku",
      cached: !!cacheHit,
      matched: phase4bSku.total_matched,
    };
  },
);
