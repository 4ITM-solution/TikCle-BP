import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  fetchPhase15Setup,
  processPhase15Products,
} from "@/lib/inngest/aggregators/phase1-5-shop";
import {
  fetchActorDataset,
  kickoffTikTokShopScrape,
  pollActorRun,
} from "@/lib/apify/tiktok-shop-scraper";
import type { KeyStats } from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

const POLL_INTERVAL_S = 30;
const MAX_POLLS = 60; // 30s × 60 = 30min cap

/**
 * S1 collect-ttshop — 구 Phase 1.5 (TikTok Shop 제품 자동 수집).
 * Apify actor kickoff → step.sleep 폴링 → dataset fetch → 처리 (durable 패턴 유지).
 */
export const collectTtshop = inngest.createFunction(
  {
    id: "phase-collect-ttshop",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("collect-ttshop", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "collect-ttshop"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "collect-ttshop", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    const existing = await step.run("read-key-stats", async () =>
      readKeyStats(supabase, case_id),
    );

    let phase1_5: NonNullable<KeyStats["phase1_5"]>;
    let cached = false;

    if (existing.phase1_5 && !force) {
      logger.info("[collect-ttshop] cached", {
        computed_at: existing.phase1_5.computed_at,
      });
      phase1_5 = existing.phase1_5 as NonNullable<KeyStats["phase1_5"]>;
      cached = true;
    } else {
      const setup = await step.run("setup", async () =>
        fetchPhase15Setup(supabase, case_id),
      );

      if (setup.skipped_reason) {
        phase1_5 = (await step.run("skipped", async () =>
          processPhase15Products(supabase, case_id, setup, [], null),
        )) as NonNullable<KeyStats["phase1_5"]>;
      } else {
        const kicked = await step.run("kickoff", async () =>
          kickoffTikTokShopScrape({
            storeUrl: setup.storeUrl,
            region: setup.region,
            maxProducts: 1000,
          }),
        );
        logger.info("[collect-ttshop] actor 시작", { runId: kicked.runId });

        let finalStatus = "RUNNING";
        for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
          await step.sleep(`wait-${attempt}`, `${POLL_INTERVAL_S}s`);
          const status = await step.run(`poll-${attempt}`, async () =>
            pollActorRun(kicked.runId),
          );
          if (
            status.status === "SUCCEEDED" ||
            status.status === "FAILED" ||
            status.status === "ABORTED" ||
            status.status === "TIMED-OUT"
          ) {
            finalStatus = status.status;
            break;
          }
        }

        if (finalStatus !== "SUCCEEDED") {
          phase1_5 = {
            total_products: 0,
            total_with_price: 0,
            total_with_sales: 0,
            total_revenue_estimate: 0,
            raw_count: 0,
            cost_actual_usd: 0,
            skipped_reason: `actor 완료 안 됨: ${finalStatus}`,
            debug_store_url: setup.storeUrl,
            debug_request_body: kicked.request_body,
            computed_at: new Date().toISOString(),
          } as NonNullable<KeyStats["phase1_5"]>;
        } else {
          const items = await step.run("fetch-dataset", async () =>
            fetchActorDataset(kicked.datasetId),
          );
          phase1_5 = (await step.run("process", async () =>
            processPhase15Products(
              supabase,
              case_id,
              setup,
              items,
              kicked.request_body,
            ),
          )) as NonNullable<KeyStats["phase1_5"]>;
        }
      }

      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase1_5 }),
      );
    }

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "collect-ttshop", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: phase1_5.cost_actual_usd ?? 0,
        stats: {
          cached,
          products: phase1_5.total_products,
          with_sales: phase1_5.total_with_sales,
          skipped_reason: phase1_5.skipped_reason ?? null,
        },
      }),
    );

    return {
      ok: true,
      phase: "collect-ttshop",
      cached,
      products: phase1_5.total_products,
      skipped_reason: phase1_5.skipped_reason,
    };
  },
);
