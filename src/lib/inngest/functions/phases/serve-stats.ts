import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase2 } from "@/lib/inngest/aggregators/phase2";
import { runPhase5 } from "@/lib/inngest/aggregators/phase5-position";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type { Phase2Stats, Phase5Stats } from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

/**
 * S4 serve-stats — 구 Phase 2 (SQL 집계 + US tiktok_shop refilter) + Phase 5 (포지셔닝).
 *
 * ⚠️ WS4에서 SQL 뷰(v_case_monthly 등)로 전환되며 폐지 예정 (§3.1 S4).
 *    그때까지 key_stats.phase2/phase5 소비자(UI)를 위해 유지. 전부 무료 연산이라
 *    캐시 없이 항상 fresh 재계산 (수집/보강/해석 결과를 마지막에 반영).
 */
export const serveStats = inngest.createFunction(
  {
    id: "phase-serve-stats",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("serve-stats", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "serve-stats"' },
  async ({ event, step, logger }) => {
    const { case_id } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "serve-stats", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // ─── 구 Phase 2 (+ US tiktok_shop shop-creator refilter) ───
    const phase2 = (await step.run("phase-2-aggregate", async () => {
      const ks = await readKeyStats(supabase, case_id);
      const { data: caseRow } = await supabase
        .from("cases")
        .select("channel, country")
        .eq("id", case_id)
        .single();
      const shopCreatorOnly =
        caseRow?.channel === "tiktok_shop" && caseRow?.country === "US";
      const fresh = await runPhase2(
        supabase,
        case_id,
        shopCreatorOnly ? { shopCreatorOnly: true } : undefined,
      );
      // top_creators는 enrich-creators(구 phase3/3.5)가 박은 enrichment 보존
      const prior = ks.phase2?.top_creators;
      const merged: Phase2Stats =
        prior && prior.length > 0 ? { ...fresh, top_creators: prior } : fresh;
      logger.info("[serve-stats] phase2", {
        contents: merged.total_contents,
        creators: merged.total_unique_creators,
        shopCreatorOnly,
      });
      return sanitizeDeep(merged);
    })) as Phase2Stats;

    await step.run("save-phase2", async () =>
      mergeKeyStats(supabase, case_id, { phase2 }),
    );

    // ─── 구 Phase 5 (티어×메타 히트맵 + 언어 분포, 무료) ───
    const phase5 = (await step.run("phase-5-position", async () => {
      const ks = await readKeyStats(supabase, case_id);
      const stats = await runPhase5(supabase, case_id, ks.phase4b_clusters);
      logger.info("[serve-stats] phase5", {
        heatmap_rows: stats.heatmap.length,
        languages: stats.languages.length,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
    })) as Phase5Stats;

    await step.run("save-phase5", async () =>
      mergeKeyStats(supabase, case_id, { phase5 }),
    );

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "serve-stats", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: 0,
        stats: {
          contents: phase2.total_contents,
          creators: phase2.total_unique_creators,
          heatmap_rows: phase5.heatmap.length,
        },
      }),
    );

    return {
      ok: true,
      phase: "serve-stats",
      contents: phase2.total_contents,
      creators: phase2.total_unique_creators,
    };
  },
);
