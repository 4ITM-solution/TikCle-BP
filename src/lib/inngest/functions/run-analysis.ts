import { inngest, type PhaseKey } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  fetchPhase15Setup,
  processPhase15Products,
  runPhase15Shop,
} from "@/lib/inngest/aggregators/phase1-5-shop";
import {
  fetchActorDataset,
  kickoffTikTokShopScrape,
  pollActorRun,
} from "@/lib/apify/tiktok-shop-scraper";
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
import { runPhase4a } from "@/lib/inngest/aggregators/phase4a";
import {
  runPhase4aUtm,
  runPhase4aVisionBatch,
} from "@/lib/inngest/aggregators/phase4a-intel";
import {
  runPhase4c,
  enrichIgAuthorFollowers,
} from "@/lib/inngest/aggregators/phase4c-ig-monitor";
import type { StepLike } from "@/lib/apify/instagram-shared";
import { syncCaseBpBrands } from "@/lib/influencer-db/sync-bp-brands";
import { runPhase4d } from "@/lib/inngest/aggregators/phase4d-yt-monitor";
import { runPhase4bSample } from "@/lib/inngest/aggregators/phase4b-sample";
import {
  fetchPhase4bAsrSetup,
  finalizePhase4bAsr,
  processPhase4bAsrBatch,
  type Phase4bAsrBatchResult,
} from "@/lib/inngest/aggregators/phase4b-asr";
import {
  fetchPhase4bVisionInputs,
  processPhase4bVisionBatch,
  finalizePhase4bVision,
  type Phase4bVisionBatchResult,
} from "@/lib/inngest/aggregators/phase4b-vision";
import { runPhase4bClusters } from "@/lib/inngest/aggregators/phase4b-clusters";
import { runPhase4bSku } from "@/lib/inngest/aggregators/phase4b-sku";
import { runPhase5 } from "@/lib/inngest/aggregators/phase5-position";
import { downloadAndStore } from "@/lib/storage/asset-downloader";
import { sanitizeDeep } from "@/lib/anthropic/sanitize";
import type {
  KeyStats,
  Phase2Stats,
  Phase35Stats,
  Phase37Stats,
  Phase3Stats,
  Phase4aStats,
  Phase4bClusterStats,
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
    // 같은 케이스에 이벤트가 겹쳐 들어와도 동시 실행 금지 (케이스당 1개씩 직렬화).
    // 없으면 phase4b cleanup→insert 가 동시 런과 race → content_clusters 누적
    // (6769b0bb 91개) + 메타↔멤버 미스정렬. 다른 case_id 끼리는 그대로 병렬.
    concurrency: {
      limit: 1,
      key: "event.data.case_id",
    },
    onFailure: async ({ event, error }) => {
      // 모든 retry 소진 후 호출. case status가 'running'에 stuck되지 않게
      // 'ready'로 reset + key_stats에 last_error 저장 → UI에서 alert + 재실행 가능
      const wrappedData = (event.data as { event?: { data?: unknown } })
        ?.event?.data;
      const failedCaseId = (wrappedData as { case_id?: string } | undefined)
        ?.case_id;
      if (!failedCaseId) return;
      const supabase = inngestSupabase();
      const { data: existing } = await supabase
        .from("cases")
        .select("key_stats")
        .eq("id", failedCaseId)
        .single();
      const ks = (existing?.key_stats ?? {}) as Record<string, unknown>;
      const errorMsg =
        error instanceof Error ? error.message : String(error ?? "unknown");
      // 모든 필수 phase가 완료된 상태에서 마지막 ack/finalize에서만 fail한 경우
      // (e.g., http_unreachable from Inngest) — 분석은 실제로 성공했으니
      // last_error 박지 않고 status만 ready로 reset.
      const hasFinalPhase = !!(ks as { phase5?: { computed_at?: string } })
        .phase5?.computed_at;
      const isPostCompletionAckError =
        hasFinalPhase &&
        (errorMsg.includes("http_unreachable") ||
          errorMsg.includes("Unexpected ending response") ||
          errorMsg.includes("connection reset"));
      const newKs = isPostCompletionAckError
        ? ks
        : {
            ...ks,
            last_error: {
              message: errorMsg.slice(0, 500),
              at: new Date().toISOString(),
            },
          };
      await supabase
        .from("cases")
        .update({
          status: "ready",
          key_stats: newKs as never,
        })
        .eq("id", failedCaseId);
    },
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

    // ─── Phase 1.5: TikTok Shop 자동 수집 (async pattern) ───
    // Actor 자체가 ~20분 걸리므로 kickoff → poll → fetch 3단계로 분리.
    // 각 step.run은 짧음 (<5s), step.sleep으로 대기 (Vercel 한도 무관).
    const PHASE15_POLL_INTERVAL_S = 30;
    const PHASE15_MAX_POLLS = 60; // 30s × 60 = 30min cap
    const phase15CacheHit = existing.phase1_5 && !force("phase1_5");

    let phase1_5;
    if (phase15CacheHit) {
      logger.info("[Phase 1.5] cached", {
        computed_at: existing.phase1_5!.computed_at,
      });
      phase1_5 = existing.phase1_5!;
    } else {
      const setup = await step.run("phase-1-5-setup", async () =>
        fetchPhase15Setup(supabase, case_id),
      );

      if (setup.skipped_reason) {
        // skip 케이스 (amazon, URL 없음 등) — 즉시 finalize
        phase1_5 = await step.run("phase-1-5-skipped", async () =>
          processPhase15Products(supabase, case_id, setup, [], null),
        );
      } else {
        // 1) Actor 시작
        const kicked = await step.run("phase-1-5-kickoff", async () =>
          kickoffTikTokShopScrape({
            storeUrl: setup.storeUrl,
            region: setup.region,
            maxProducts: 1000,
          }),
        );
        logger.info("[Phase 1.5] actor 시작됨", { runId: kicked.runId });

        // 2) Polling — actor 끝날 때까지 대기
        let finalStatus = "RUNNING";
        for (let attempt = 1; attempt <= PHASE15_MAX_POLLS; attempt += 1) {
          await step.sleep(
            `phase-1-5-wait-${attempt}`,
            `${PHASE15_POLL_INTERVAL_S}s`,
          );
          const status = await step.run(
            `phase-1-5-poll-${attempt}`,
            async () => pollActorRun(kicked.runId),
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
          };
        } else {
          // 3) Dataset fetch
          const items = await step.run("phase-1-5-fetch", async () =>
            fetchActorDataset(kicked.datasetId),
          );
          // 4) Items 처리 + DB 저장
          phase1_5 = await step.run("phase-1-5-process", async () =>
            processPhase15Products(
              supabase,
              case_id,
              setup,
              items,
              kicked.request_body,
            ),
          );
        }
      }

      logger.info("[Phase 1.5] done", {
        products: phase1_5.total_products,
        revenue: phase1_5.total_revenue_estimate,
        skipped: phase1_5.skipped_reason,
      });
    }

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

    // ─── phase15_only 모드: Phase 1.5만 돌고 끝 (products 채우기 용도) ───
    // Helium10 paste / Affiliate CSV 받을 product 드롭다운에 채우기 위한 trigger.
    // status를 'draft'로 되돌림 (full 분석 시작 전이라).
    if (event.data.phase15_only) {
      await step.run("phase15-only-mark-draft", async () => {
        await supabase
          .from("cases")
          .update({ status: "draft" })
          .eq("id", case_id);
      });
      logger.info("[phase15_only] Phase 1.5 완료 후 종료", {
        case_id,
        products: phase1_5.total_products,
      });
      return {
        ok: true,
        phase15_only: true,
        products: phase1_5.total_products,
        skipped_reason: phase1_5.skipped_reason,
      };
    }

    // ─── Phase 4c/4d: IG/YT Brand Monitoring 스크랩 (phase2·phase4b 앞으로 당김, Fix ①③) ───
    // IG/YT 영상이 phase2(월별 집계)·phase4b(클러스터링)에 반영되려면 그 전에 ig_posts/
    // yt_videos 가 DB에 있어야 함 → 스크랩(compute)을 여기서 먼저 실행.
    // 저장(save)은 cascade 충돌 회피 위해 맨 끝(기존 위치)에 그대로 둔다.
    // ⚠️ step.run으로 감싸지 않음 — runPhase4c가 내부에서 Apify 스크랩을 durable step
    //   (start memoize + step.sleep 폴링)으로 돌리기 때문. step.run 안에 step.run은 불가.
    //   plain async 래퍼는 Inngest step 추적에 영향 없음(중첩 아님).
    const phase4c = await (async () => {
      if (existing.phase4c && !force("phase4c")) {
        logger.info("[Phase 4c] cached", {
          computed_at: existing.phase4c.computed_at,
          unique: existing.phase4c.total_unique,
        });
        return sanitizeDeep(existing.phase4c);
      }
      logger.info("[Phase 4c] IG brand monitoring (durable)", { case_id });
      // Inngest step → StepLike 캐스팅 (step.run의 Jsonify<T> 반환 타입 차이만 우회 — 런타임 동일)
      const stats = await runPhase4c(
        supabase,
        case_id,
        step as unknown as StepLike,
      );
      logger.info("[Phase 4c] done", {
        raw: stats.total_raw,
        unique: stats.total_unique,
        brand_matched: stats.total_brand_matched,
        paid: stats.total_paid_signal,
        authors: stats.unique_authors,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
    })();
    const phase4cNew = !existing.phase4c || force("phase4c");

    // ─── Phase 4c.5: IG author 팔로워/프로필 자동 박기 ───
    // phase4c가 새로 스크랩됐으면(=새 author 들어왔으면) followers IS NULL 인 author
    // 프로필을 Apify로 자동 enrich. 수동 "팔로워 박기" 버튼 없이 한 번에 완성.
    // ⚠️ step.run으로 감싸지 않음 — enrichIgAuthorFollowers가 내부에서 Apify 스크랩을
    //   durable step(start memoize + step.sleep 폴링)으로 돌리기 때문. step.run 중첩 불가.
    //   비-durable로 감쌌다면 author 많은 케이스에서 20분 폴링 > maxDuration(800s) →
    //   함수 강제종료 → 재시도 → Apify 중복 과금 루프 위험.
    if (phase4cNew) {
      logger.info("[Phase 4c.5] IG author 팔로워 자동 박기 (durable)", { case_id });
      const r = await enrichIgAuthorFollowers(supabase, case_id, {
        step: step as unknown as StepLike,
      });
      logger.info("[Phase 4c.5] done", {
        updated: r.updated,
        targeted: r.targeted,
        cost: r.cost_estimate_usd,
        skipped: r.skipped_reason,
      });
    }

    const phase4d = await step.run("phase-4d-yt-monitor", async () => {
      if (existing.phase4d && !force("phase4d")) {
        logger.info("[Phase 4d] cached", {
          computed_at: existing.phase4d.computed_at,
          unique: existing.phase4d.total_unique,
        });
        return sanitizeDeep(existing.phase4d);
      }
      logger.info("[Phase 4d] YouTube brand monitoring", { case_id });
      const stats = await runPhase4d(supabase, case_id);
      logger.info("[Phase 4d] done", {
        raw: stats.total_raw,
        unique: stats.total_unique,
        brand_matched: stats.total_brand_matched,
        paid: stats.total_paid_signal,
        channels: stats.unique_channels,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
    });
    const phase4dNew = !existing.phase4d || force("phase4d");

    // ─── Phase 2: Stats Aggregator ───
    // Phase 1.5가 새로 돌면 case_product_sales 새로 들어왔으니 Phase 2도 자동 재실행.
    // phase4c/4d(IG/YT)가 새로 스크랩되면 월별 집계에 반영하려 phase2도 재실행 (Fix ①③).
    const phase2 = await step.run("phase-2-aggregate", async () => {
      if (
        existing.phase2 &&
        !force("phase2") &&
        !phase1_5_New &&
        !phase4cNew &&
        !phase4dNew
      ) {
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
      !existing.phase2 ||
      force("phase2") ||
      phase1_5_HasData ||
      phase4cNew ||
      phase4dNew;
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
    const phase3 = phase3Result.phase3 as Phase3Stats;
    const updatedTopCreators = phase3Result.updatedTopCreators as TopCreator[];
    const phase2WithEnrichment: Phase2Stats = {
      ...phase2,
      top_creators: updatedTopCreators,
    };

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
    // Step-level batch 처리. 200 URL씩 batch.
    // 200 → 50: 단일 actor run에 200 URLs 보내면 actor 자체 timeout (TIMED-OUT) 발생.
    // clockworks가 일부 영상 처리에 시간 걸리거나 hang 시 batch 전체 fail. 50으로 안전.
    const PHASE35_BATCH_SIZE = 50;
    const phase35CacheHit =
      existing.phase35 && !force("phase35") && !phase3New;

    let phase35: Phase35Stats;
    let phase3Final: Phase3Stats;
    let topCreatorsFinal: TopCreator[];

    if (phase35CacheHit) {
      logger.info("[Phase 3.5] cached", {
        filled: existing.phase35!.total_filled,
      });
      phase35 = existing.phase35!;
      phase3Final = phase3;
      topCreatorsFinal = updatedTopCreators;
    } else {
      logger.info("[Phase 3.5] clockworks fans 폴백 (batch)", { case_id });
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
          const r = await step.run(`phase-3-5-batch-${i}`, async () =>
            processPhase35Batch(supabase, slice),
          );
          batchResults.push(r);
        }
      }

      const finalized = await step.run("phase-3-5-finalize", async () =>
        finalizePhase35(supabase, setup, batchResults, updatedTopCreators),
      );
      phase35 = finalized.phase35 as Phase35Stats;
      phase3Final = finalized.phase3Updated as Phase3Stats;
      topCreatorsFinal = finalized.topCreatorsUpdated as TopCreator[];
      logger.info("[Phase 3.5] done", {
        attempted: phase35.total_attempted,
        filled: phase35.total_filled,
        cost: phase35.cost_actual_usd,
        skipped: phase35.skipped_reason,
      });
    }
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
    // Batch 처리: setup → 100명씩 batch → finalize. 각 step.run이 짧음.
    const PHASE37_BATCH_SIZE = 100;
    const phase37CacheHit =
      existing.phase37 &&
      !force("phase37") &&
      !phase3New &&
      !phase35New;

    let phase37: Phase37Stats;
    if (phase37CacheHit) {
      logger.info("[Phase 3.7] cached", {
        shop_creators: existing.phase37!.total_shop_creators,
      });
      phase37 = existing.phase37!;
    } else {
      logger.info("[Phase 3.7] shop creator 판별 (batch)", { case_id });
      const setup = await step.run("phase-3-7-setup", async () =>
        fetchPhase37Setup(supabase, case_id),
      );

      if (setup.skipped_reason || setup.candidates.length === 0) {
        phase37 = empty37(
          setup.skipped_reason ?? "이미 모든 인플 판별 완료",
        );
      } else {
        const totalBatches = Math.ceil(
          setup.candidates.length / PHASE37_BATCH_SIZE,
        );
        logger.info("[Phase 3.7] batch start", {
          candidates: setup.candidates.length,
          batches: totalBatches,
        });

        const batchResults: Phase37BatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.candidates.slice(
            i * PHASE37_BATCH_SIZE,
            (i + 1) * PHASE37_BATCH_SIZE,
          );
          const r = await step.run(`phase-3-7-batch-${i}`, async () =>
            processPhase37Batch(supabase, slice),
          );
          batchResults.push(r);
        }

        phase37 = await step.run("phase-3-7-finalize", async () =>
          finalizePhase37(supabase, setup, batchResults),
        );
      }

      logger.info("[Phase 3.7] done", {
        candidates: phase37.total_candidates,
        shop: phase37.total_shop_creators,
        non_shop: phase37.total_non_shop,
        unmatched: phase37.total_unmatched,
        update_errors: phase37.total_update_errors,
        cost: phase37.cost_actual_usd,
        skipped: phase37.skipped_reason,
      });
    }

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
      // 케이스 채널 + country 확인
      const { data: caseRow } = await supabase
        .from("cases")
        .select("channel, country")
        .eq("id", case_id)
        .single();
      if (caseRow?.channel !== "tiktok_shop") {
        return phase2Final; // 그대로
      }
      // 비-US tiktok_shop: lemur가 SEA/MENA TT Shop creator DB를 거의 안 가져
      // (Indonesia 케이스 9%만 매칭). shopCreatorOnly 필터 적용하면 화면에 표시되는
      // 인플 수가 비현실적으로 작아짐. 비-US는 전체 인플 그대로 사용.
      if (caseRow?.country !== "US") {
        logger.info("[Phase 2 refilter] non-US tiktok_shop → 필터 skip (lemur SEA 한계)", {
          country: caseRow?.country,
        });
        return phase2Final;
      }
      // US tiktok_shop만 shop creator 필터로 재집계
      logger.info("[Phase 2 refilter] tiktok_shop US → shop creator only");
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
    const phase2Effective = phase2Refiltered as Phase2Stats;

    // phase2Effective(매출 재집계)는 phase37 변화와 무관하게 항상 저장.
    //   phase2Refiltered 스텝은 US tiktok_shop에서 매번 재집계되는데, 예전엔
    //   phase37New일 때만 저장돼서 — phase37이 캐시되고(새 인플 없음) phase4a/4b/5
    //   save도 안 돌면 — 수기 업로드(Amazon/Helium/Kalodata)로 바뀐 case_product_sales가
    //   phase2에 영속화되지 않았다. 이제 무조건 저장해 재실행 시 항상 반영.
    {
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
        return sanitizeDeep(existing.phase4a);
      }
      logger.info("[Phase 4a] Meta ads scraper", { case_id });
      const stats = await runPhase4a(supabase, case_id);
      logger.info("[Phase 4a] done", {
        total_ads: stats.total_ads,
        cost: stats.cost_actual_usd,
        skipped: stats.skipped_reason,
      });
      return sanitizeDeep(stats);
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
        return sanitizeDeep(existing.phase4a);
      }
      logger.info("[Phase 4a.5] downloading ad assets to storage", {
        case_id,
        count: phase4a.ads_preview.length,
      });
      if (phase4a.ads_preview.length === 0) return phase4a;

      // ⚠️ 순차 처리 — Promise.all로 동시에 받으면 큰 영상 여러 개가 한꺼번에
      //   메모리(arrayBuffer)로 올라가 함수 OOM(500) 남. 1개씩 받아 footprint 최소화.
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
      return sanitizeDeep(result);
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

    // ─── Phase 4a.6: 광고 크리에이티브 인텔리전스 (UTM 파싱 + Vision 태깅) ───
    //   meta_ads 각 광고에 origin/format/hook/5축 신호 + 소스 크리에이터 핸들 적재.
    //   4a가 새로 돌았을 때만(또는 force). 비전 호출은 thumbnail 있는 광고만.
    if (phase4aNew || force("phase4a_intel")) {
      // UTM 파싱 (1회)
      await step.run("phase-4a-6-utm", async () => {
        const u = await runPhase4aUtm(supabase, case_id);
        logger.info("[Phase 4a.6] UTM", u);
        return sanitizeDeep(u);
      });
      // 비전 태깅 — 미태깅분을 100개씩 배치로 (maxDuration 회피). remaining 0까지 루프.
      for (let i = 0; i < 15; i += 1) {
        const r = await step.run(`phase-4a-6-vision-${i}`, async () => {
          const v = await runPhase4aVisionBatch(supabase, case_id, 100);
          logger.info(`[Phase 4a.6] vision batch ${i}`, {
            tagged: v.vision_tagged,
            failed: v.vision_failed,
            remaining: v.remaining,
            cost: v.cost_usd,
            skipped: v.skipped_reason,
          });
          return sanitizeDeep(v);
        });
        if (r.skipped_reason) break;
        if (r.remaining === 0) break;
        // 진전 없음(전부 실패로 sentinel 마킹돼 remaining 안 줄면) 무한루프 방지
        if (r.vision_tagged === 0 && r.vision_failed === 0) break;
      }
    }

    // ─── Phase 4b.1: 분석 샘플 선정 ───
    // Phase 3.7 (Shop creator 판별)이 새로 돌면 sample도 다시 (필터 결과 바뀜)
    const phase4bSample = await step.run("phase-4b-sample", async () => {
      if (
        existing.phase4b_sample &&
        !force("phase4b_sample") &&
        !phase37New &&
        !phase4cNew &&
        !phase4dNew
      ) {
        logger.info("[Phase 4b.1] cached", {
          total: existing.phase4b_sample.total_picked,
          computed_at: existing.phase4b_sample.computed_at,
        });
        return sanitizeDeep(existing.phase4b_sample);
      }
      logger.info("[Phase 4b.1] selecting analysis sample", { case_id });
      const stats = await runPhase4bSample(supabase, case_id);
      logger.info("[Phase 4b.1] done", {
        total: stats.total_picked,
        cutoff: stats.cutoff_date,
      });
      return sanitizeDeep(stats);
    });

    const phase4bSampleNew =
      !existing.phase4b_sample ||
      force("phase4b_sample") ||
      phase37HasData ||
      phase4cNew ||
      phase4dNew;
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
    // Step-level batch — 50 URL씩, 각 step.run ~1-2분.
    const PHASE4B_ASR_BATCH_SIZE = 50;
    const phase4bAsrCacheHit =
      existing.phase4b_asr && !force("phase4b_asr") && !phase4bSampleNew;
    let phase4bAsr;
    if (phase4bAsrCacheHit) {
      logger.info("[Phase 4b.2] cached", {
        with_asr: existing.phase4b_asr!.total_with_asr,
      });
      phase4bAsr = existing.phase4b_asr!;
    } else {
      logger.info("[Phase 4b.2] collecting ASR (batch)", {
        case_id,
        sample_size: phase4bSample.sample_content_ids.length,
      });
      const setup = await step.run("phase-4b-asr-setup", async () =>
        fetchPhase4bAsrSetup(supabase, phase4bSample),
      );
      if (setup.skipped_reason) {
        phase4bAsr = await step.run("phase-4b-asr-finalize", async () =>
          sanitizeDeep(finalizePhase4bAsr([], setup.skipped_reason)),
        );
      } else {
        const total = setup.contents.length;
        const totalBatches = Math.ceil(total / PHASE4B_ASR_BATCH_SIZE);
        const batchResults: Phase4bAsrBatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.contents.slice(
            i * PHASE4B_ASR_BATCH_SIZE,
            (i + 1) * PHASE4B_ASR_BATCH_SIZE,
          );
          const r = await step.run(`phase-4b-asr-batch-${i}`, async () =>
            sanitizeDeep(await processPhase4bAsrBatch(supabase, case_id, slice)),
          );
          batchResults.push(r);
        }
        phase4bAsr = await step.run("phase-4b-asr-finalize", async () =>
          sanitizeDeep(finalizePhase4bAsr(batchResults)),
        );
      }
      logger.info("[Phase 4b.2] done", {
        attempted: phase4bAsr.total_attempted,
        with_asr: phase4bAsr.total_with_asr,
        cost: phase4bAsr.cost_actual_usd,
        skipped: phase4bAsr.skipped_reason,
      });
    }

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
    // Step-level batch — N개씩 step.run. IG 500 + TK 를 한 step에 몰면 함수
    // timeout(Internal Server Error) 나서 ASR 처럼 batch 로 쪼갬. 중간 실패 시
    // 완료된 batch 는 Inngest 캐시로 skip 되어 retry 가 안전.
    // 캐시 무효화 조건: force / 샘플 새로 선정 / ASR 새로 수집(cover_url 변경 가능).
    const PHASE4B_VISION_BATCH_SIZE = 40;
    const phase4bVisionCacheHit =
      existing.phase4b_vision &&
      !force("phase4b_vision") &&
      !phase4bSampleNew &&
      !phase4bAsrNew;
    let phase4bVision;
    if (phase4bVisionCacheHit) {
      logger.info("[Phase 4b.3] cached", {
        with_tags: existing.phase4b_vision!.total_with_tags,
      });
      phase4bVision = existing.phase4b_vision!;
    } else {
      logger.info("[Phase 4b.3] vision tagging via Sonnet (batch)", {
        case_id,
        sample_size: phase4bSample.sample_content_ids.length,
      });
      const setup = await step.run("phase-4b-vision-setup", async () =>
        fetchPhase4bVisionInputs(supabase, case_id, phase4bSample),
      );
      if (setup.skipped_reason && setup.inputs.length === 0) {
        phase4bVision = await step.run("phase-4b-vision-finalize", async () =>
          sanitizeDeep(
            finalizePhase4bVision(
              [],
              setup.total_sample_content_ids,
              setup.skipped_reason,
            ),
          ),
        );
      } else {
        const totalBatches = Math.ceil(
          setup.inputs.length / PHASE4B_VISION_BATCH_SIZE,
        );
        const batchResults: Phase4bVisionBatchResult[] = [];
        for (let i = 0; i < totalBatches; i += 1) {
          const slice = setup.inputs.slice(
            i * PHASE4B_VISION_BATCH_SIZE,
            (i + 1) * PHASE4B_VISION_BATCH_SIZE,
          );
          const r = await step.run(`phase-4b-vision-batch-${i}`, async () =>
            sanitizeDeep(
              await processPhase4bVisionBatch(supabase, case_id, slice),
            ),
          );
          batchResults.push(r);
        }
        phase4bVision = await step.run("phase-4b-vision-finalize", async () =>
          sanitizeDeep(
            finalizePhase4bVision(batchResults, setup.total_sample_content_ids),
          ),
        );
      }
      logger.info("[Phase 4b.3] done", {
        attempted: phase4bVision.total_attempted,
        with_tags: phase4bVision.total_with_tags,
        failed: phase4bVision.total_failed,
        no_cover: phase4bVision.total_no_cover,
        cost: phase4bVision.cost_actual_usd,
        cache_hits: phase4bVision.tokens_cache_read,
        skipped: phase4bVision.skipped_reason,
      });
    }

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
        return sanitizeDeep(existing.phase4b_clusters);
      }
      logger.info("[Phase 4b.4] 3-pass clustering", { case_id });
      try {
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
        return sanitizeDeep(stats);
      } catch (e) {
        // 명확한 에러 메시지 + last_error 박기 (이전: Internal Server Error 만 보임)
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}`.slice(0, 800) : String(e);
        logger.error("[Phase 4b.4] FAILED", { case_id, msg });
        // 빈 결과 + skipped_reason 으로 박음 (분석 흐름은 계속)
        const empty: Phase4bClusterStats = {
          total_input_videos: 0,
          pass1_candidates: 0,
          pass2_validated: 0,
          pass3_meta: 0,
          total_memberships: 0,
          cost_actual_usd: 0,
          tokens_input: 0,
          tokens_output: 0,
          tokens_cache_read: 0,
          meta_clusters: [],
          skipped_reason: `에러: ${msg}`,
          computed_at: new Date().toISOString(),
        };
        return sanitizeDeep(empty) as Phase4bClusterStats;
      }
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
        return sanitizeDeep(existing.phase4b_sku);
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
      return sanitizeDeep(stats);
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
        return sanitizeDeep(existing.phase5);
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
      // Inngest step result는 cloud에 JSON serialize되어 저장됨. raw caption/USP 키워드
      // 등에 surrogate pair 깨진 char가 섞이면 "JCS: Missing surrogate" 에러로 transport
      // 실패. step return 직전 sanitize.
      return sanitizeDeep(stats);
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

    // ─── Phase 4c save (compute/스크랩은 phase2 앞에서 이미 실행 — Fix ①③) ───
    if (phase4cNew) {
      await step.run("phase-4c-save", async () => {
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
          phase4c,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4c: ${error.message}`);
      });
    }

    // ─── Phase 4d save (compute/스크랩은 phase2 앞에서 이미 실행 — Fix ①③) ───
    if (phase4dNew) {
      await step.run("phase-4d-save", async () => {
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
          phase4c,
          phase4d,
        };
        const { error } = await supabase
          .from("cases")
          .update({ key_stats: newStats })
          .eq("id", case_id);
        if (error) throw new Error(`save phase4d: ${error.message}`);
      });
    }

    // ─── BP 브랜드 이력 → TIKCLE 2.0 운영 DB(influencer_db_tt/ig) 실시간 sync ───
    // 이 케이스 인플들의 bp_brands를 2.0에 update/insert. 비치명적(실패해도 분석 성공 처리).
    await step.run("sync-bp-brands-to-ops", async () => {
      try {
        const r = await syncCaseBpBrands(supabase, case_id);
        logger.info("[bp-brands sync] done", r as Record<string, unknown>);
        return r;
      } catch (e) {
        logger.warn("[bp-brands sync] 실패(무시)", {
          error: e instanceof Error ? e.message : String(e),
        });
        return { error: true };
      }
    });

    // ─── Final: status = ready + 직전 last_error 클리어 ───
    await step.run("mark-ready", async () => {
      // 분석 성공 시 옛 last_error key 삭제 — 직전 실패 메시지가 ready 화면에 잔존하지 않게.
      // key_stats가 jsonb라 직접 fetch + delete + update.
      const { data: row } = await supabase
        .from("cases")
        .select("key_stats")
        .eq("id", case_id)
        .single();
      const ks = (row?.key_stats ?? {}) as Record<string, unknown>;
      if ("last_error" in ks) {
        delete ks.last_error;
      }

      const { error } = await supabase
        .from("cases")
        .update({
          status: "ready",
          analyzed_at: new Date().toISOString(),
          key_stats: ks as never,
        })
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
