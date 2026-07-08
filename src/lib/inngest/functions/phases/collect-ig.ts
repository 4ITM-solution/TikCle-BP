import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase4c } from "@/lib/inngest/aggregators/phase4c-ig-monitor";
import type { StepLike } from "@/lib/apify/instagram-shared";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type { Phase4cStats } from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
  enqueueDownstream,
} from "./shared";

/**
 * S1 collect-ig — 구 Phase 4c (IG Brand Monitoring 스크랩).
 *
 * ⚠️ runPhase4c는 내부에서 Apify 스크랩을 durable step(start memoize + step.sleep 폴링)
 *    으로 돌림 → step.run으로 감싸지 않는다 (step.run 중첩 불가, 기존 run-analysis 패턴).
 */
export const collectIg = inngest.createFunction(
  {
    id: "phase-collect-ig",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("collect-ig", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "collect-ig"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "collect-ig", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // BE-5: key_stats 전체를 step 출력으로 반환하면 대형 케이스(kalodata_*_xlsx 등 적재)에서
    //   Inngest step output 상한(>4MB) 초과. 캐시 판정에 쓰는 phase4c만 반환해 슬림화.
    const existing = await step.run("read-key-stats", async () => {
      const ks = await readKeyStats(supabase, case_id);
      return { phase4c: ks.phase4c ?? null };
    });

    let phase4c: Phase4cStats;
    let cached = false;
    if (existing.phase4c && !force) {
      logger.info("[collect-ig] cached", {
        computed_at: existing.phase4c.computed_at,
        unique: existing.phase4c.total_unique,
      });
      phase4c = sanitizeDeep(existing.phase4c) as Phase4cStats;
      cached = true;
    } else {
      logger.info("[collect-ig] IG brand monitoring (durable)", { case_id });
      // step.run 밖에서 실행 — 내부 durable step 사용 (기존 패턴 유지)
      const stats = await runPhase4c(
        supabase,
        case_id,
        step as unknown as StepLike,
      );
      phase4c = sanitizeDeep(stats) as Phase4cStats;
      logger.info("[collect-ig] done", {
        raw: phase4c.total_raw,
        unique: phase4c.total_unique,
        cost: phase4c.cost_actual_usd,
        skipped: phase4c.skipped_reason,
      });
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase4c }),
      );
    }

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "collect-ig", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: cached ? 0 : (phase4c.cost_actual_usd ?? 0),
        stats: {
          cached,
          unique: phase4c.total_unique,
          brand_matched: phase4c.total_brand_matched,
          authors: phase4c.unique_authors,
          skipped_reason: phase4c.skipped_reason ?? null,
        },
      }),
    );

    await step.run("enqueue-downstream", () =>
      enqueueDownstream("collect-ig", case_id, event.data as PhaseEventData),
    );
    return {
      ok: true,
      phase: "collect-ig",
      cached,
      unique: phase4c.total_unique,
      skipped_reason: phase4c.skipped_reason,
    };
  },
);
