import { inngest, type PhaseKey } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase15Shop } from "@/lib/inngest/aggregators/phase1-5-shop";
import { runPhase2 } from "@/lib/inngest/aggregators/phase2";
import { runPhase3 } from "@/lib/inngest/aggregators/phase3";
import { runPhase35Fans } from "@/lib/inngest/aggregators/phase3-5-fans";
import { runPhase37ShopCreator } from "@/lib/inngest/aggregators/phase3-7-shop-creator";
import { runPhase4a } from "@/lib/inngest/aggregators/phase4a";
import { runPhase4bSample } from "@/lib/inngest/aggregators/phase4b-sample";
import { runPhase4bAsr } from "@/lib/inngest/aggregators/phase4b-asr";
import { runPhase4bVision } from "@/lib/inngest/aggregators/phase4b-vision";
import { runPhase4bClusters } from "@/lib/inngest/aggregators/phase4b-clusters";
import { runPhase4bSku } from "@/lib/inngest/aggregators/phase4b-sku";
import { runPhase5 } from "@/lib/inngest/aggregators/phase5-position";
import { downloadAndStore } from "@/lib/storage/asset-downloader";
import type {
  KeyStats,
  Phase35Stats,
  Phase3Stats,
  Phase4aStats,
  TopCreator,
} from "@/lib/inngest/types";

/**
 * 케이스 분석 오케스트레이터.
 *
 * `case/start.analysis` 이벤트 수신 → phase 함수들을 step.run으로 순차 실행.
 * 각 step은 Inngest가 자동 체크포인팅 + 재시도.
 *
 * 현재 (Stage 3 v1):
 *   - Phase 2: Stats Aggregator (SQL 집계)
 *
 * 추가 예정:
 *   - Phase 3: Influencer Lookup (외부 DB + clockworks)
 *   - Phase 4: External APIs + Video Analysis
 *   - Phase 5: Video Download (opt-in)
 *   - Phase 6: Final Build
 */
export const runAnalysis = inngest.createFunction(
  {
    id: "case-run-analysis",
    retries: 1,
  },
  { event: "case/start.analysis" },
  async ({ event, step, logger }) => {
    const { case_id, force_phases = [] } = event.data as {
      case_id: string;
      with_video?: boolean;
      force_phases?: PhaseKey[];
    };

    if (!case_id) throw new Error("case_id missing in event");

    const supabase = inngestSupabase();
    const force = (k: PhaseKey) => force_phases.includes(k);

    // 시작 시점의 기존 key_stats 읽음 — 캐시 hit 판단용
    const existing = await step.run("read-existing-state", async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("key_stats")
        .eq("id", case_id)
        .single();
      if (error) throw new Error(`existing fetch: ${error.message}`);
      return (data?.key_stats ?? {}) as KeyStats;
    });

    // ─── Phase 1.5: TikTok Shop 자동 수집 (tiktok_shop 채널만) ───
    const phase1_5 = await step.run("phase-1-5-tiktok-shop", async () => {
      if (existing.phase1_5 && !force("phase1_5")) {
        logger.info("[Phase 1.5] cached", {
          computed_at: existing.phase1_5.computed_at,
        });
        return existing.phase1_5;
      }
      logger.info("[Phase 1.5] tiktok shop scrape", { case_id });
      const stats = await runPhase15Shop(supabase, case_id);
      logger.info("[Phase 1.5] done", {
        products: stats.total_products,
        with_price: stats.total_with_price,
        with_sales: stats.total_with_sales,
        revenue: stats.total_revenue_estimate,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    // skipped_reason이 있는 stats는 "no real data change"로 간주 → cascade 안 함
    const phase1_5_New = !existing.phase1_5 || force("phase1_5");
    const phase1_5_HasData = phase1_5_New && !phase1_5.skipped_reason;
    if (phase1_5_New) {
      await step.run("phase-1-5-save", async () => {
        const newStats: KeyStats = { ...existing, phase1_5 };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase1_5: ${error.message}`);
      });
    }

    // ─── Phase 2: Stats Aggregator ───
    // Phase 1.5가 새로 돌면 case_product_sales 새로 들어왔으니 Phase 2도 자동 재실행
    const phase2 = await step.run("phase-2-aggregate", async () => {
      if (existing.phase2 && !force("phase2") && !phase1_5_New) {
        logger.info("[Phase 2] cached", {
          computed_at: existing.phase2.computed_at,
        });
        return existing.phase2;
      }
      logger.info("[Phase 2] aggregating stats", { case_id });
      const stats = await runPhase2(supabase, case_id);
      logger.info("[Phase 2] done", {
        contents: stats.total_contents,
        creators: stats.total_unique_creators,
      });
      return stats;
    });

    const phase2New =
      !existing.phase2 || force("phase2") || phase1_5_HasData;
    if (phase2New) {
      await step.run("phase-2-save", async () => {
        const newStats: KeyStats = { ...existing, phase2 };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase2: ${error.message}`);
      });
    }

    // ─── Phase 3: Influencer Lookup & Tier Classification ───
    const phase3Result = await step.run("phase-3-lookup", async () => {
      if (existing.phase3 && !force("phase3")) {
        logger.info("[Phase 3] cached", {
          computed_at: existing.phase3.computed_at,
        });
        return {
          phase3: existing.phase3,
          updatedTopCreators:
            existing.phase2?.top_creators ?? phase2.top_creators,
        };
      }
      logger.info("[Phase 3] influencer lookup", { case_id });
      const result = await runPhase3(supabase, case_id, phase2);
      logger.info("[Phase 3] done", {
        total_creators: result.phase3.total_creators,
        with_fans: result.phase3.total_with_fans,
        unknown: result.phase3.total_unknown,
      });
      return result;
    });
    const phase3 = phase3Result.phase3;
    const updatedTopCreators = phase3Result.updatedTopCreators;
    const phase2WithEnrichment = { ...phase2, top_creators: updatedTopCreators };

    const phase3New = !existing.phase3 || force("phase3");
    if (phase3New) {
      await step.run("phase-3-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2WithEnrichment,
          phase3,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase3: ${error.message}`);
      });
    }

    // ─── Phase 3.5: Clockworks 폴백으로 unknown 인플 fans 채우기 ───
    // Phase 3 이후 follower_count null인 인플에 대해 clockworks 호출 → fans 채움
    // Phase 3가 새로 돌면 자동 재실행 (unknown 풀이 바뀌었을 수 있음)
    const phase35Result = await step.run("phase-3-5-fans", async () => {
      if (
        existing.phase35 &&
        !force("phase35") &&
        !phase3New
      ) {
        logger.info("[Phase 3.5] cached", {
          filled: existing.phase35.total_filled,
        });
        return {
          phase35: existing.phase35,
          phase3Updated: phase3,
          topCreatorsUpdated: updatedTopCreators,
        };
      }
      logger.info("[Phase 3.5] clockworks fans 폴백", { case_id });
      const result = await runPhase35Fans(
        supabase,
        case_id,
        updatedTopCreators,
      );
      logger.info("[Phase 3.5] done", {
        unknown_before: result.phase35.total_unknown_before,
        attempted: result.phase35.total_attempted,
        filled: result.phase35.total_filled,
        cost: result.phase35.cost_actual_usd,
        skipped: result.phase35.skipped_reason,
      });
      return result;
    });
    const phase35 = phase35Result.phase35 as Phase35Stats;
    const phase3Final = phase35Result.phase3Updated as Phase3Stats;
    const topCreatorsFinal = phase35Result.topCreatorsUpdated as TopCreator[];
    const phase2Final = { ...phase2, top_creators: topCreatorsFinal };

    const phase35New =
      !existing.phase35 || force("phase35") || phase3New;
    if (phase35New) {
      await step.run("phase-3-5-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Final,
          phase3: phase3Final,
          phase35,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase35: ${error.message}`);
      });
    }

    // ─── Phase 3.7: Shop Creator 판별 (tiktok_shop 채널만, lemur ~$2) ───
    const phase37 = await step.run("phase-3-7-shop-creator", async () => {
      if (
        existing.phase37 &&
        !force("phase37") &&
        !phase3New &&
        !phase35New
      ) {
        logger.info("[Phase 3.7] cached", {
          shop_creators: existing.phase37.total_shop_creators,
        });
        return existing.phase37;
      }
      logger.info("[Phase 3.7] shop creator 판별", { case_id });
      const stats = await runPhase37ShopCreator(supabase, case_id);
      logger.info("[Phase 3.7] done", {
        candidates: stats.total_candidates,
        shop: stats.total_shop_creators,
        non_shop: stats.total_non_shop,
        unmatched: stats.total_unmatched,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase37New =
      !existing.phase37 ||
      force("phase37") ||
      phase3New ||
      phase35New;
    const phase37HasData = phase37New && !phase37.skipped_reason;
    if (phase37New) {
      await step.run("phase-3-7-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Final,
          phase3: phase3Final,
          phase35,
          phase37,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase37: ${error.message}`);
      });
    }

    // ─── Phase 2 재집계 (tiktok_shop 케이스만, Shop creator 필터 적용) ───
    // Phase 2 처음엔 전체 contents로 집계됨. tiktok_shop은 Phase 3.7 이후
    // is_tiktok_shop_creator=true 인플의 contents만 다시 aggregate.
    const phase2Refiltered = await step.run("phase-2-refilter-shop", async () => {
      // 케이스 채널 확인
      const { data: caseRow } = await supabase
        .from("cases")
        .select("channel")
        .eq("id", case_id)
        .single();
      if (caseRow?.channel !== "tiktok_shop") {
        return phase2Final; // 그대로
      }
      // tiktok_shop이면 shop creator 필터로 재집계
      logger.info("[Phase 2 refilter] tiktok_shop → shop creator only");
      const stats = await runPhase2(supabase, case_id, {
        shopCreatorOnly: true,
      });
      logger.info("[Phase 2 refilter] done", {
        contents: stats.total_contents,
        creators: stats.total_unique_creators,
      });
      // top_creators는 Phase 3 enrichment 결과 보존
      return { ...stats, top_creators: phase2Final.top_creators };
    });

    // tiktok_shop이면 phase2Final 갱신 (이후 save에 반영)
    const phase2Effective = phase2Refiltered;

    if (phase37New) {
      await step.run("phase-2-refilter-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase2 refilter: ${error.message}`);
      });
    }

    // ─── Phase 4a: Meta Ads (Amazon 케이스만, 유료 ~$0.75) ───
    const phase4a = await step.run("phase-4a-meta-ads", async () => {
      if (existing.phase4a && !force("phase4a")) {
        logger.info("[Phase 4a] cached", {
          computed_at: existing.phase4a.computed_at,
          total_ads: existing.phase4a.total_ads,
        });
        return existing.phase4a;
      }
      logger.info("[Phase 4a] Meta ads scraper", { case_id });
      const stats = await runPhase4a(supabase, case_id);
      logger.info("[Phase 4a] done", {
        total_ads: stats.total_ads,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase4aNew = !existing.phase4a || force("phase4a");

    // ─── Phase 4a.5: 대표 광고 자산을 Storage에 영구 보관 (FB CDN 만료 회피) ───
    const phase4aWithStorage = await step.run("phase-4a-download-assets", async () => {
      // 4a 자체가 새로 돌았으면 자산도 새로 받아야 함 (URL 새로 옴)
      // 4a가 캐시였고 4a_assets만 force면 다시 받음
      // 4a 캐시 + 4a_assets 캐시면 그대로 재사용
      if (
        !phase4aNew &&
        existing.phase4a &&
        !force("phase4a_assets") &&
        existing.phase4a.ads_preview.some(
          (a) =>
            (a.thumbnail_url ?? "").includes("supabase") ||
            (a.video_url ?? "").includes("supabase"),
        )
      ) {
        logger.info("[Phase 4a.5] cached (storage URLs already in ads_preview)");
        return existing.phase4a;
      }
      logger.info("[Phase 4a.5] downloading ad assets to storage", {
        case_id,
        count: phase4a.ads_preview.length,
      });
      if (phase4a.ads_preview.length === 0) return phase4a;

      const updated = await Promise.all(
        phase4a.ads_preview.map(async (ad, i) => {
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

          return {
            ...ad,
            video_url: stored_video ?? ad.video_url,
            thumbnail_url: stored_thumb ?? ad.thumbnail_url,
          };
        }),
      );

      const result: Phase4aStats = { ...phase4a, ads_preview: updated };
      const stored_video_count = updated.filter(
        (a) => a.video_url && a.video_url.includes("supabase"),
      ).length;
      const stored_thumb_count = updated.filter(
        (a) => a.thumbnail_url && a.thumbnail_url.includes("supabase"),
      ).length;
      logger.info("[Phase 4a.5] done", {
        stored_videos: stored_video_count,
        stored_thumbs: stored_thumb_count,
        total: updated.length,
      });
      return result;
    });

    if (phase4aNew || force("phase4a_assets")) {
      await step.run("phase-4a-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4a: ${error.message}`);
      });
    }

    // ─── Phase 4b.1: 분석 샘플 선정 ───
    // Phase 3.7 (Shop creator 판별)이 새로 돌면 sample도 다시 (필터 결과 바뀜)
    const phase4bSample = await step.run("phase-4b-sample", async () => {
      if (
        existing.phase4b_sample &&
        !force("phase4b_sample") &&
        !phase37New
      ) {
        logger.info("[Phase 4b.1] cached", {
          total: existing.phase4b_sample.total_picked,
          computed_at: existing.phase4b_sample.computed_at,
        });
        return existing.phase4b_sample;
      }
      logger.info("[Phase 4b.1] selecting analysis sample", { case_id });
      const stats = await runPhase4bSample(supabase, case_id);
      logger.info("[Phase 4b.1] done", {
        total: stats.total_picked,
        cutoff: stats.cutoff_date,
      });
      return stats;
    });

    const phase4bSampleNew =
      !existing.phase4b_sample || force("phase4b_sample") || phase37HasData;
    if (phase4bSampleNew) {
      await step.run("phase-4b-sample-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4b_sample: ${error.message}`);
      });
    }

    // ─── Phase 4b.2: 샘플 영상 ASR 수집 (clockworks, ~$0.51) ───
    const phase4bAsr = await step.run("phase-4b-asr", async () => {
      if (existing.phase4b_asr && !force("phase4b_asr") && !phase4bSampleNew) {
        logger.info("[Phase 4b.2] cached", {
          with_asr: existing.phase4b_asr.total_with_asr,
        });
        return existing.phase4b_asr;
      }
      logger.info("[Phase 4b.2] collecting ASR via clockworks", {
        case_id,
        sample_size: phase4bSample.sample_content_ids.length,
      });
      const stats = await runPhase4bAsr(supabase, case_id, phase4bSample);
      logger.info("[Phase 4b.2] done", {
        attempted: stats.total_attempted,
        with_asr: stats.total_with_asr,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase4bAsrNew =
      !existing.phase4b_asr || force("phase4b_asr") || phase4bSampleNew;
    if (phase4bAsrNew) {
      await step.run("phase-4b-asr-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
          phase4b_asr: phase4bAsr,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4b_asr: ${error.message}`);
      });
    }

    // ─── Phase 4b.3: Vision 태깅 (Sonnet, ~$3.5) ───
    const phase4bVision = await step.run("phase-4b-vision", async () => {
      // 캐시 무효화 조건:
      //   - 명시적 force
      //   - 샘플이 새로 선정됨 (대상 영상이 바뀜)
      //   - ASR이 새로 수집됨 (cover_url이 새로 채워졌을 수 있음 → vision 입력 변경)
      if (
        existing.phase4b_vision &&
        !force("phase4b_vision") &&
        !phase4bSampleNew &&
        !phase4bAsrNew
      ) {
        logger.info("[Phase 4b.3] cached", {
          with_tags: existing.phase4b_vision.total_with_tags,
        });
        return existing.phase4b_vision;
      }
      logger.info("[Phase 4b.3] vision tagging via Sonnet", {
        case_id,
        sample_size: phase4bSample.sample_content_ids.length,
      });
      const stats = await runPhase4bVision(supabase, case_id, phase4bSample);
      logger.info("[Phase 4b.3] done", {
        attempted: stats.total_attempted,
        with_tags: stats.total_with_tags,
        failed: stats.total_failed,
        no_cover: stats.total_no_cover,
        cost: stats.cost_actual_usd,
        cache_hits: stats.tokens_cache_read,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase4bVisionNew =
      !existing.phase4b_vision ||
      force("phase4b_vision") ||
      phase4bSampleNew ||
      phase4bAsrNew;
    if (phase4bVisionNew) {
      await step.run("phase-4b-vision-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
          phase4b_asr: phase4bAsr,
          phase4b_vision: phase4bVision,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4b_vision: ${error.message}`);
      });
    }

    // ─── Phase 4b.4: 3-pass 클러스터링 (Sonnet, ~$0.6) ───
    const phase4bClusters = await step.run("phase-4b-clusters", async () => {
      if (
        existing.phase4b_clusters &&
        !force("phase4b_clusters") &&
        !phase4bSampleNew &&
        !phase4bAsrNew &&
        !phase4bVisionNew
      ) {
        logger.info("[Phase 4b.4] cached", {
          meta: existing.phase4b_clusters.pass3_meta,
        });
        return existing.phase4b_clusters;
      }
      logger.info("[Phase 4b.4] 3-pass clustering", { case_id });
      const stats = await runPhase4bClusters(supabase, case_id, phase4bSample);
      logger.info("[Phase 4b.4] done", {
        input: stats.total_input_videos,
        candidates: stats.pass1_candidates,
        validated: stats.pass2_validated,
        meta: stats.pass3_meta,
        memberships: stats.total_memberships,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase4bClustersNew =
      !existing.phase4b_clusters ||
      force("phase4b_clusters") ||
      phase4bSampleNew ||
      phase4bAsrNew ||
      phase4bVisionNew;
    if (phase4bClustersNew) {
      await step.run("phase-4b-clusters-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
          phase4b_asr: phase4bAsr,
          phase4b_vision: phase4bVision,
          phase4b_clusters: phase4bClusters,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4b_clusters: ${error.message}`);
      });
    }

    // ─── Phase 4b.5: SKU 매칭 (화면 노출 영상에 한정, ~$0.4) ───
    const phase4bSku = await step.run("phase-4b-sku", async () => {
      // SKU 매칭은 클러스터 결과에 의존 (대표 영상 뽑기용) → 클러스터가 새로 돌면 다시
      if (
        existing.phase4b_sku &&
        !force("phase4b_sku") &&
        !phase4bSampleNew &&
        !phase4bAsrNew &&
        !phase4bVisionNew &&
        !phase4bClustersNew
      ) {
        logger.info("[Phase 4b.5] cached", {
          matched: existing.phase4b_sku.total_matched,
        });
        return existing.phase4b_sku;
      }
      logger.info("[Phase 4b.5] SKU matching", { case_id });
      const stats = await runPhase4bSku(supabase, case_id, phase4bSample);
      logger.info("[Phase 4b.5] done", {
        displayed: stats.total_displayed,
        matched: stats.total_matched,
        no_match: stats.total_no_match,
        failed: stats.total_failed,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase4bSkuNew =
      !existing.phase4b_sku ||
      force("phase4b_sku") ||
      phase4bSampleNew ||
      phase4bAsrNew ||
      phase4bVisionNew ||
      phase4bClustersNew;
    if (phase4bSkuNew) {
      await step.run("phase-4b-sku-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
          phase4b_asr: phase4bAsr,
          phase4b_vision: phase4bVision,
          phase4b_clusters: phase4bClusters,
          phase4b_sku: phase4bSku,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4b_sku: ${error.message}`);
      });
    }

    // ─── Phase 5: 포지셔닝 분석 (티어×메타 히트맵 + 언어 분포, 무료) ───
    const phase5 = await step.run("phase-5-position", async () => {
      // phase35(폴백 fans), phase4b_clusters(meta) 둘 다 영향
      // — 새로 돌면 히트맵/언어 다시 계산
      if (
        existing.phase5 &&
        !force("phase5") &&
        !phase35New &&
        !phase4bClustersNew
      ) {
        logger.info("[Phase 5] cached", {
          computed_at: existing.phase5.computed_at,
        });
        return existing.phase5;
      }
      logger.info("[Phase 5] positioning analysis", { case_id });
      const stats = await runPhase5(supabase, case_id, phase4bClusters);
      logger.info("[Phase 5] done", {
        heatmap_rows: stats.heatmap.length,
        meta_cols: stats.meta_order.length,
        videos_in_heatmap: stats.total_videos_in_heatmap,
        languages: stats.languages.length,
        with_lang: stats.total_with_language,
        without_lang: stats.total_without_language,
        skipped: stats.skipped_reason,
      });
      return stats;
    });

    const phase5New =
      !existing.phase5 ||
      force("phase5") ||
      phase35New ||
      phase4bClustersNew;
    if (phase5New) {
      await step.run("phase-5-save", async () => {
        const newStats: KeyStats = {
          ...existing,
          phase1_5,
          phase2: phase2Effective,
          phase3: phase3Final,
          phase35,
          phase37,
          phase4a: phase4aWithStorage,
          phase4b_sample: phase4bSample,
          phase4b_asr: phase4bAsr,
          phase4b_vision: phase4bVision,
          phase4b_clusters: phase4bClusters,
          phase4b_sku: phase4bSku,
          phase5,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase5: ${error.message}`);
      });
    }

    // ─── Final: status = ready ───
    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("cases")
        .update({ status: "ready", analyzed_at: new Date().toISOString() })
        .eq("id", case_id);
      if (error) throw new Error(`mark-ready: ${error.message}`);
    });

    return {
      ok: true,
      case_id,
      summary: {
        // Phase 1.5 (TikTok Shop)
        phase15_products: phase1_5.total_products,
        phase15_with_price: phase1_5.total_with_price,
        phase15_with_sales: phase1_5.total_with_sales,
        phase15_revenue_estimate: phase1_5.total_revenue_estimate,
        phase15_raw_count: phase1_5.raw_count,
        phase15_skipped: phase1_5.skipped_reason,
        // 기본 stats
        contents: phase2.total_contents,
        creators: phase2.total_unique_creators,
        sku_count: phase2.sales_summary?.sku_count ?? 0,
        revenue: phase2.sales_summary?.total_revenue ?? 0,
        with_fans: phase3Final.total_with_fans,
        unknown_fans: phase3Final.total_unknown,
        fans_filled_via_phase35: phase35.total_filled,
        phase35_cost: phase35.cost_actual_usd,
        // Phase 3.7
        phase37_shop_creators: phase37.total_shop_creators,
        phase37_non_shop: phase37.total_non_shop,
        phase37_unmatched: phase37.total_unmatched,
        phase37_cost: phase37.cost_actual_usd,
        phase37_skipped: phase37.skipped_reason,
        meta_ads: phase4a.total_ads,
        meta_ads_cost: phase4a.cost_actual_usd,
        meta_ads_skipped: phase4a.skipped_reason,
        analysis_sample: phase4bSample.total_picked,
        asr_collected: phase4bAsr.total_with_asr,
        asr_cost: phase4bAsr.cost_actual_usd,
        fans_filled_via_clockworks: phase4bAsr.total_with_fans_updated,
        vision_tagged: phase4bVision.total_with_tags,
        vision_cost: phase4bVision.cost_actual_usd,
        meta_clusters: phase4bClusters.pass3_meta,
        cluster_cost: phase4bClusters.cost_actual_usd,
        sku_displayed: phase4bSku.total_displayed,
        sku_matched: phase4bSku.total_matched,
        sku_cost: phase4bSku.cost_actual_usd,
      },
    };
  },
);
