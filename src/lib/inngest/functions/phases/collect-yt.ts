import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase4d } from "@/lib/inngest/aggregators/phase4d-yt-monitor";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type { Phase4dStats } from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
  enqueueDownstream,
} from "./shared";

/** S1 collect-yt — 구 Phase 4d (YouTube Brand Monitoring). */
export const collectYt = inngest.createFunction(
  {
    id: "phase-collect-yt",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("collect-yt", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "collect-yt"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "collect-yt", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // BE-5: key_stats 전체를 step 출력으로 반환하면 대형 케이스(kalodata_*_xlsx 등 적재)에서
    //   Inngest step output 상한(>4MB) 초과. 캐시 판정에 쓰는 phase4d만 반환해 슬림화.
    const existing = await step.run("read-key-stats", async () => {
      const ks = await readKeyStats(supabase, case_id);
      return { phase4d: ks.phase4d ?? null };
    });

    let cached = false;
    const phase4d = (await step.run("yt-monitor", async () => {
      if (existing.phase4d && !force) {
        logger.info("[collect-yt] cached", {
          computed_at: existing.phase4d.computed_at,
          unique: existing.phase4d.total_unique,
        });
        return sanitizeDeep(existing.phase4d);
      }
      const stats = await runPhase4d(supabase, case_id);
      logger.info("[collect-yt] done", {
        raw: stats.total_raw,
        unique: stats.total_unique,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
    })) as Phase4dStats;
    cached = !!existing.phase4d && !force;

    if (!cached) {
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase4d }),
      );
    }

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "collect-yt", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: cached ? 0 : (phase4d.cost_actual_usd ?? 0),
        stats: {
          cached,
          unique: phase4d.total_unique,
          brand_matched: phase4d.total_brand_matched,
          channels: phase4d.unique_channels,
          skipped_reason: phase4d.skipped_reason ?? null,
        },
      }),
    );

    await step.run("enqueue-downstream", () =>
      enqueueDownstream("collect-yt", case_id, event.data as PhaseEventData),
    );
    return {
      ok: true,
      phase: "collect-yt",
      cached,
      unique: phase4d.total_unique,
      skipped_reason: phase4d.skipped_reason,
    };
  },
);
