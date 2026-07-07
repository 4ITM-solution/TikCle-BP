import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase4a } from "@/lib/inngest/aggregators/phase4a";
import { downloadAndStore } from "@/lib/storage/asset-downloader";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type { Phase4aStats } from "@/lib/inngest/types";
import {
  markPhaseFailedFromEvent,
  markPhaseRun,
  mergeKeyStats,
  readKeyStats,
  type PhaseEventData,
} from "./shared";

/**
 * S1 collect-meta — 구 Phase 4a (Meta Ads 스크랩, WS1 upsert) + 4a.5 (자산 Storage 보관).
 * Vision 태깅(구 4a.6)은 S3 interpret-tag로 이동.
 */
export const collectMeta = inngest.createFunction(
  {
    id: "phase-collect-meta",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      await markPhaseFailedFromEvent("collect-meta", event, error);
    },
  },
  { event: "case/phase.requested", if: 'event.data.phase == "collect-meta"' },
  async ({ event, step, logger }) => {
    const { case_id, force = false } = event.data as PhaseEventData;
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();

    await step.run("phase-run-start", async () =>
      markPhaseRun(supabase, case_id, "collect-meta", {
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      }),
    );

    // BE-5: key_stats 전체를 step 출력으로 반환하면 대형 케이스(kalodata_*_xlsx 등 적재)에서
    //   Inngest step output 상한(>4MB) 초과. 캐시 판정에 쓰는 phase4a만 반환해 슬림화.
    const existing = await step.run("read-key-stats", async () => {
      const ks = await readKeyStats(supabase, case_id);
      return { phase4a: ks.phase4a ?? null };
    });

    const scrapedNew = !existing.phase4a || force;
    const phase4a = (await step.run("meta-ads-scrape", async () => {
      if (!scrapedNew) {
        logger.info("[collect-meta] cached", {
          computed_at: existing.phase4a!.computed_at,
          total_ads: existing.phase4a!.total_ads,
        });
        return sanitizeDeep(existing.phase4a!);
      }
      const stats = await runPhase4a(supabase, case_id);
      logger.info("[collect-meta] scrape done", {
        total_ads: stats.total_ads,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
    })) as Phase4aStats;

    // ─── 구 4a.5: 대표 광고 자산 Storage 영구 보관 (FB CDN 만료 회피) ───
    const phase4aWithStorage = (await step.run("download-assets", async () => {
      if (
        !scrapedNew &&
        existing.phase4a &&
        existing.phase4a.ads_preview.some(
          (a) =>
            (a.thumbnail_url ?? "").includes("supabase") ||
            (a.video_url ?? "").includes("supabase"),
        )
      ) {
        logger.info("[collect-meta] assets cached (storage URLs 존재)");
        return sanitizeDeep(existing.phase4a);
      }
      if (phase4a.ads_preview.length === 0) return phase4a;

      // ⚠️ 순차 처리 — 동시 다운로드 시 대형 영상 arrayBuffer 여러 개로 OOM (기존 주석 유지)
      const updated: typeof phase4a.ads_preview = [];
      for (let i = 0; i < phase4a.ads_preview.length; i++) {
        const ad = phase4a.ads_preview[i]!;
        const idKey = ad.ad_archive_id ?? `idx${i}`;
        const base = `${case_id}/meta-ads/${idKey}`;

        let stored_video: string | null = null;
        if (ad.video_url) {
          stored_video = await downloadAndStore(
            supabase,
            ad.video_url,
            `${base}/video.mp4`,
            "video/mp4",
          );
        }

        let stored_thumb: string | null = null;
        if (ad.thumbnail_url) {
          stored_thumb = await downloadAndStore(
            supabase,
            ad.thumbnail_url,
            `${base}/thumb.jpg`,
            "image/jpeg",
          );
        }

        updated.push({
          ...ad,
          video_url: stored_video ?? ad.video_url,
          thumbnail_url: stored_thumb ?? ad.thumbnail_url,
        });
      }
      const result: Phase4aStats = { ...phase4a, ads_preview: updated };
      return sanitizeDeep(result);
    })) as Phase4aStats;

    await step.run("save-key-stats", async () =>
      mergeKeyStats(supabase, case_id, { phase4a: phase4aWithStorage }),
    );

    await step.run("phase-run-finish", async () =>
      markPhaseRun(supabase, case_id, "collect-meta", {
        status: "completed",
        finished_at: new Date().toISOString(),
        cost_usd: scrapedNew ? (phase4a.cost_actual_usd ?? 0) : 0,
        stats: {
          cached: !scrapedNew,
          total_ads: phase4a.total_ads,
          skipped_reason: phase4a.skipped_reason ?? null,
        },
      }),
    );

    return {
      ok: true,
      phase: "collect-meta",
      cached: !scrapedNew,
      total_ads: phase4a.total_ads,
      skipped_reason: phase4a.skipped_reason,
    };
  },
);
