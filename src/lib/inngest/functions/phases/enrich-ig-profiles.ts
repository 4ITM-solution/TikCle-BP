import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { enrichIgAuthorFollowers } from "@/lib/inngest/aggregators/phase4c-ig-monitor";
import type { StepLike } from "@/lib/apify/instagram-shared";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  type PhaseEventData,
  enqueueDownstream,
} from "./shared";

/**
 * S2 enrich-ig-profiles — 구 Phase 4c.5 (IG author 팔로워/프로필 enrich).
 *
 * followers IS NULL인 author만 대상이라 멱등 — 재실행해도 이미 채워진 author는
 * 재과금 없음. force는 의미 없음(rescrape_all은 별도 액션에서만).
 *
 * ⚠️ enrichIgAuthorFollowers는 내부 durable step(step.sleep 폴링) 사용 →
 *    step.run으로 감싸지 않는다 (기존 run-analysis 패턴).
 */
export const enrichIgProfiles = inngest.createFunction(
  {
    id: "phase-enrich-ig-profiles",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("enrich-ig-profiles", event, error);
    },
  },
  {
    event: "case/phase.requested",
    if: 'event.data.phase == "enrich-ig-profiles"',
  },
  async ({ event, step, logger }) => {
    const { case_id } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "enrich-ig-profiles", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    logger.info("[enrich-ig-profiles] IG author 팔로워 enrich (durable)", {
      case_id,
    });
    const r = await enrichIgAuthorFollowers(supabase, case_id, {
      step: step as unknown as StepLike,
    });
    logger.info("[enrich-ig-profiles] done", {
      updated: r.updated,
      targeted: r.targeted,
      cost: r.cost_estimate_usd,
      skipped: r.skipped_reason,
    });

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "enrich-ig-profiles", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: r.cost_estimate_usd ?? 0,
        stats: {
          updated: r.updated,
          targeted: r.targeted,
          skipped_reason: r.skipped_reason ?? null,
        },
      }),
    );

    await step.run("enqueue-downstream", () =>
      enqueueDownstream("enrich-ig-profiles", case_id, event.data as PhaseEventData),
    );
    return {
      ok: true,
      phase: "enrich-ig-profiles",
      updated: r.updated,
      targeted: r.targeted,
      skipped_reason: r.skipped_reason,
    };
  },
);
