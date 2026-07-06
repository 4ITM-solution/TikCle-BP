import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  runPhase4aUtm,
  runPhase4aVisionBatch,
} from "@/lib/inngest/aggregators/phase4a-intel";
import {
  fetchPhase4bVisionInputs,
  processPhase4bVisionBatch,
  finalizePhase4bVision,
  type Phase4bVisionBatchResult,
} from "@/lib/inngest/aggregators/phase4b-vision";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type {
  Phase4bSampleStats,
  Phase4bVisionStats,
} from "@/lib/inngest/types";
import {
  ensurePhase4bSample,
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
  type SupaClient,
} from "./shared";

const AD_VISION_BATCH_SIZE = 100;
const AD_VISION_MAX_BATCHES = 40; // 폭주 방지 상한 (구 루프 cap 15 → count 기반이라 여유)
const VIDEO_VISION_BATCH_SIZE = 40;

/**
 * S3 interpret-tag — 구 Phase 4a.6 (광고 크리에이티브 인텔) + 4b.3 (영상 Vision 태깅) 통합.
 *
 * ★ Vision 배치 루프 제거 (§3.1 P5):
 *   구: "remaining=0까지 최대 15회 루프" → 레이트리밋 시 루프 중단 → 미태깅 영구 잔존.
 *   신: 시작 시 미태깅 count 조회 → ceil(count/batch)개 step 열거 실행.
 *       종료 후 remaining>0이면 phase_runs.status='partial' + stats에 잔여건수.
 *       (재실행하면 미태깅분만 이어서 태깅 — WS1 멱등성으로 재과금 없음)
 */
export const interpretTag = inngest.createFunction(
  {
    id: "phase-interpret-tag",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("interpret-tag", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "interpret-tag"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "interpret-tag", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // ════════ A. 구 4a.6 — 광고 크리에이티브 (UTM + Vision) ════════
    // 미태깅(ad_intel IS NULL)만 대상이라 항상 실행해도 멱등·재과금 없음.
    await step.run("ad-utm", async () => {
      const u = await runPhase4aUtm(supabase, case_id);
      logger.info("[interpret-tag] UTM", u);
      return sanitizeDeep(u);
    });

    const adUntaggedCount = await step.run("ad-vision-count", async () =>
      countUntaggedAds(supabase, case_id),
    );
    const adBatches = Math.min(
      Math.ceil(adUntaggedCount / AD_VISION_BATCH_SIZE),
      AD_VISION_MAX_BATCHES,
    );
    let adCost = 0;
    let adTagged = 0;
    for (let i = 0; i < adBatches; i += 1) {
      const r = await step.run(`ad-vision-${i}`, async () => {
        const v = await runPhase4aVisionBatch(
          supabase,
          case_id,
          AD_VISION_BATCH_SIZE,
        );
        logger.info(`[interpret-tag] ad vision batch ${i}`, {
          tagged: v.vision_tagged,
          failed: v.vision_failed,
          remaining: v.remaining,
          cost: v.cost_usd,
          skipped: v.skipped_reason,
        });
        return sanitizeDeep(v);
      });
      adCost += r.cost_usd ?? 0;
      adTagged += r.vision_tagged ?? 0;
      if (r.skipped_reason) break;
      if (r.remaining === 0) break;
    }
    const adRemaining = await step.run("ad-vision-remaining", async () =>
      countUntaggedAds(supabase, case_id),
    );

    // ════════ B. 구 4b.3 — 샘플 영상 Vision 태깅 ════════
    const existing = await step.run("read-key-stats", async () =>
      readKeyStats(supabase, case_id),
    );
    const sampled = await step.run("sample", async () =>
      ensurePhase4bSample(supabase, case_id, false),
    );
    const sample = sampled.sample as Phase4bSampleStats;

    const videoCacheHit = existing.phase4b_vision && !force && !sampled.fresh;
    let phase4bVision: Phase4bVisionStats;
    if (videoCacheHit) {
      logger.info("[interpret-tag] video vision cached", {
        with_tags: existing.phase4b_vision!.total_with_tags,
      });
      phase4bVision = existing.phase4b_vision!;
    } else {
      const setup = await step.run("video-vision-setup", async () =>
        fetchPhase4bVisionInputs(supabase, case_id, sample),
      );
      if (setup.skipped_reason && setup.inputs.length === 0) {
        phase4bVision = (await step.run("video-vision-finalize", async () =>
          sanitizeDeep(
            finalizePhase4bVision(
              [],
              setup.total_sample_content_ids,
              setup.skipped_reason,
            ),
          ),
        )) as Phase4bVisionStats;
      } else {
        // 배치 열거 (루프 ❌) — WS1의 "vision_tags 있으면 skip" 멱등성 덕에
        // 재실행 시 미태깅분만 재시도됨.
        const totalBatches = Math.ceil(
          setup.inputs.length / VIDEO_VISION_BATCH_SIZE,
        );
        const batchResults: Phase4bVisionBatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.inputs.slice(
            i * VIDEO_VISION_BATCH_SIZE,
            (i + 1) * VIDEO_VISION_BATCH_SIZE,
          );
          const r = (await step.run(`video-vision-batch-${i}`, async () =>
            sanitizeDeep(
              await processPhase4bVisionBatch(supabase, case_id, slice),
            ),
          )) as Phase4bVisionBatchResult;
          batchResults.push(r);
        }
        phase4bVision = (await step.run("video-vision-finalize", async () =>
          sanitizeDeep(
            finalizePhase4bVision(batchResults, setup.total_sample_content_ids),
          ),
        )) as Phase4bVisionStats;
      }
      logger.info("[interpret-tag] video vision done", {
        attempted: phase4bVision.total_attempted,
        with_tags: phase4bVision.total_with_tags,
        failed: phase4bVision.total_failed,
        cost: phase4bVision.cost_actual_usd,
        skipped: phase4bVision.skipped_reason,
      });
      await step.run("save-key-stats", async () =>
        mergeKeyStats(supabase, case_id, { phase4b_vision: phase4bVision }),
      );
    }

    // ════════ 종료 상태 — 잔여분 있으면 partial ════════
    const videoFailed = videoCacheHit ? 0 : (phase4bVision.total_failed ?? 0);
    const isPartial = adRemaining > 0 || videoFailed > 0;

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "interpret-tag", {
        status: isPartial ? "partial" : "completed",
        finished_at: new Date().toISOString(),
        cost_usd:
          adCost + (videoCacheHit ? 0 : (phase4bVision.cost_actual_usd ?? 0)),
        stats: {
          ad_untagged_initial: adUntaggedCount,
          ad_tagged: adTagged,
          ad_vision_remaining: adRemaining,
          video_with_tags: phase4bVision.total_with_tags,
          video_vision_failed: videoFailed,
          video_cached: !!videoCacheHit,
        },
      }),
    );

    return {
      ok: true,
      phase: "interpret-tag",
      partial: isPartial,
      ad_vision_remaining: adRemaining,
      video_with_tags: phase4bVision.total_with_tags,
      video_vision_failed: videoFailed,
    };
  },
);

/** ad_intel 미태깅 + thumbnail 있는 광고 수. */
async function countUntaggedAds(
  supabase: SupaClient,
  case_id: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("meta_ads")
    .select("id", { count: "exact", head: true })
    .eq("case_id", case_id)
    .is("ad_intel", null)
    .not("thumbnail_url", "is", null);
  if (error) {
    console.warn(`[interpret-tag] count 실패(0 처리): ${error.message}`);
    return 0;
  }
  return count ?? 0;
}
