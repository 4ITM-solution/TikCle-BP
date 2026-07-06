import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase2 } from "@/lib/inngest/aggregators/phase2";
import { runPhase3 } from "@/lib/inngest/aggregators/phase3";
import {
  fetchPhase35Setup,
  finalizePhase35,
  processPhase35Batch,
  type Phase35BatchResult,
} from "@/lib/inngest/aggregators/phase3-5-fans";
import {
  empty37,
  fetchPhase37Setup,
  finalizePhase37,
  processPhase37Batch,
  type Phase37BatchResult,
} from "@/lib/inngest/aggregators/phase3-7-shop-creator";
import type {
  Phase2Stats,
  Phase35Stats,
  Phase37Stats,
  Phase3Stats,
  TopCreator,
} from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

const PHASE35_BATCH_SIZE = 50;
const PHASE37_BATCH_SIZE = 100;

/**
 * S2 enrich-creators — 구 Phase 3 (인플 fans 룩업) + 3.5 (clockworks 폴백)
 * + 3.7 (Shop Creator 판별) 통합 + US tiktok_shop phase2 refilter.
 *
 * phase3 입력용 phase2는 여기서 선계산(무료 SQL). 최종 phase2/phase5 집계는
 * S4 serve-stats가 다시 수행 (WS4 뷰 전환 전까지).
 */
export const enrichCreators = inngest.createFunction(
  {
    id: "phase-enrich-creators",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("enrich-creators", event, error);
    },
  },
  {
    event: "case/phase.requested",
    if: 'event.data.phase == "enrich-creators"',
  },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "enrich-creators", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    const existing = await step.run("read-key-stats", async () =>
      readKeyStats(supabase, case_id),
    );

    // ─── phase2 선계산 (phase3 입력, 무료 SQL — 항상 fresh) ───
    const phase2 = (await step.run("phase-2-precompute", async () => {
      const stats = await runPhase2(supabase, case_id);
      logger.info("[enrich-creators] phase2 precompute", {
        contents: stats.total_contents,
        creators: stats.total_unique_creators,
      });
      return stats;
    })) as Phase2Stats;

    // ─── 구 Phase 3: 인플 fans 룩업 & tier ───
    const phase3New = !existing.phase3 || force;
    const phase3Result = await step.run("phase-3-lookup", async () => {
      if (!phase3New) {
        logger.info("[enrich-creators] phase3 cached", {
          computed_at: existing.phase3!.computed_at,
        });
        return {
          phase3: existing.phase3!,
          updatedTopCreators:
            existing.phase2?.top_creators ?? phase2.top_creators,
        };
      }
      const result = await runPhase3(supabase, case_id, phase2);
      logger.info("[enrich-creators] phase3 done", {
        total_creators: result.phase3.total_creators,
        with_fans: result.phase3.total_with_fans,
        unknown: result.phase3.total_unknown,
      });
      return result;
    });
    const phase3 = phase3Result.phase3 as Phase3Stats;
    const updatedTopCreators = phase3Result.updatedTopCreators as TopCreator[];

    // ─── 구 Phase 3.5: clockworks 폴백 (batch) ───
    const phase35CacheHit = existing.phase35 && !force && !phase3New;
    let phase35: Phase35Stats;
    let phase3Final: Phase3Stats;
    let topCreatorsFinal: TopCreator[];

    if (phase35CacheHit) {
      logger.info("[enrich-creators] phase35 cached", {
        filled: existing.phase35!.total_filled,
      });
      phase35 = existing.phase35!;
      phase3Final = phase3;
      topCreatorsFinal = updatedTopCreators;
    } else {
      const setup = await step.run("phase-3-5-setup", async () =>
        fetchPhase35Setup(supabase, case_id),
      );

      const batchResults: Phase35BatchResult[] = [];
      if (!setup.skipped_reason) {
        const totalBatches = Math.ceil(
          setup.unknown_url_pairs.length / PHASE35_BATCH_SIZE,
        );
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.unknown_url_pairs.slice(
            i * PHASE35_BATCH_SIZE,
            (i + 1) * PHASE35_BATCH_SIZE,
          );
          const r = (await step.run(`phase-3-5-batch-${i}`, async () =>
            processPhase35Batch(supabase, slice),
          )) as Phase35BatchResult;
          batchResults.push(r);
        }
      }

      const finalized = await step.run("phase-3-5-finalize", async () =>
        finalizePhase35(supabase, setup, batchResults, updatedTopCreators),
      );
      phase35 = finalized.phase35 as Phase35Stats;
      phase3Final = finalized.phase3Updated as Phase3Stats;
      topCreatorsFinal = finalized.topCreatorsUpdated as TopCreator[];
      logger.info("[enrich-creators] phase35 done", {
        attempted: phase35.total_attempted,
        filled: phase35.total_filled,
        cost: phase35.cost_actual_usd,
        skipped: phase35.skipped_reason,
      });
    }
    const phase35New = !existing.phase35 || force || phase3New;
    const phase2Final: Phase2Stats = {
      ...phase2,
      top_creators: topCreatorsFinal,
    };

    // ─── 구 Phase 3.7: Shop Creator 판별 (tiktok_shop, lemur) ───
    const phase37CacheHit =
      existing.phase37 && !force && !phase3New && !phase35New;
    let phase37: Phase37Stats;
    if (phase37CacheHit) {
      logger.info("[enrich-creators] phase37 cached", {
        shop_creators: existing.phase37!.total_shop_creators,
      });
      phase37 = existing.phase37!;
    } else {
      const setup = await step.run("phase-3-7-setup", async () =>
        fetchPhase37Setup(supabase, case_id),
      );

      if (setup.skipped_reason || setup.candidates.length === 0) {
        phase37 = empty37(setup.skipped_reason ?? "이미 모든 인플 판별 완료");
      } else {
        const totalBatches = Math.ceil(
          setup.candidates.length / PHASE37_BATCH_SIZE,
        );
        const batchResults: Phase37BatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.candidates.slice(
            i * PHASE37_BATCH_SIZE,
            (i + 1) * PHASE37_BATCH_SIZE,
          );
          const r = (await step.run(`phase-3-7-batch-${i}`, async () =>
            processPhase37Batch(supabase, slice),
          )) as Phase37BatchResult;
          batchResults.push(r);
        }
        phase37 = (await step.run("phase-3-7-finalize", async () =>
          finalizePhase37(supabase, setup, batchResults),
        )) as Phase37Stats;
      }
      logger.info("[enrich-creators] phase37 done", {
        candidates: phase37.total_candidates,
        shop: phase37.total_shop_creators,
        cost: phase37.cost_actual_usd,
        skipped: phase37.skipped_reason,
      });
    }

    // ─── 구 phase2 refilter (US tiktok_shop만 shop creator 필터 재집계) ───
    const phase2Effective = (await step.run("phase-2-refilter", async () => {
      const { data: caseRow } = await supabase
        .from("cases")
        .select("channel, country")
        .eq("id", case_id)
        .single();
      if (caseRow?.channel !== "tiktok_shop") return phase2Final;
      if (caseRow?.country !== "US") {
        logger.info(
          "[enrich-creators] non-US tiktok_shop → refilter skip (lemur SEA 한계)",
        );
        return phase2Final;
      }
      const stats = await runPhase2(supabase, case_id, {
        shopCreatorOnly: true,
      });
      return { ...stats, top_creators: phase2Final.top_creators };
    })) as Phase2Stats;

    await step.run("save-key-stats", async () =>
      mergeKeyStats(supabase, case_id, {
        phase2: phase2Effective,
        phase3: phase3Final,
        phase35,
        phase37,
      }),
    );

    const cost =
      (phase35CacheHit ? 0 : (phase35.cost_actual_usd ?? 0)) +
      (phase37CacheHit ? 0 : (phase37.cost_actual_usd ?? 0));

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "enrich-creators", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: cost,
        stats: {
          creators: phase3Final.total_creators,
          with_fans: phase3Final.total_with_fans,
          fans_filled_via_phase35: phase35.total_filled,
          shop_creators: phase37.total_shop_creators,
        },
      }),
    );

    return {
      ok: true,
      phase: "enrich-creators",
      with_fans: phase3Final.total_with_fans,
      fans_filled: phase35.total_filled,
      shop_creators: phase37.total_shop_creators,
    };
  },
);
