import { inngest, type StagePhase } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { syncCaseBpBrands } from "@/lib/influencer-db/sync-bp-brands";
import {
  collectTtshop,
  collectMeta,
  collectIg,
  collectYt,
  enrichCreators,
  enrichIgProfiles,
  interpretAsr,
  interpretTag,
  interpretCluster,
  interpretSku,
  serveStats,
} from "./phases";
import { markPhaseRun } from "./phases/shared";
import type { DataChannel } from "@/lib/supabase/types";

/**
 * WS2 오케스트레이터 (BP 재설계 v2 §3.1).
 *
 * `case/analysis.orchestrate` 수신 → phase_runs 행 생성(queued/skipped) →
 * step.invoke()로 스테이지 순서대로 호출:
 *
 *   S1 수집   collect-ttshop · collect-meta · collect-ig · collect-yt   (병렬)
 *   S2 보강   enrich-creators · enrich-ig-profiles                       (병렬)
 *   S3 해석   interpret-asr → interpret-tag → interpret-cluster → interpret-sku (순차)
 *   S4 서빙   serve-stats (phase2/phase5 — WS4 뷰 전환 전까지 유지)
 *
 * 케이스 채널 구성(data_channels·config)에 따라 해당 없는 phase는 skip 마킹.
 * 각 phase 함수는 자체 retries 3 + phase_runs 추적 — 한 phase 실패는 그 phase에 격리.
 */
export const orchestrateAnalysis = inngest.createFunction(
  {
    id: "case-orchestrate-analysis",
    retries: 1,
    concurrency: { limit: 1, key: "event.data.case_id" },
    onFailure: async ({ event, error }) => {
      // 모든 retry 소진 — status 'running' stuck 방지 (구 runAnalysis 동작 유지)
      const wrappedData = (event.data as { event?: { data?: unknown } })?.event
        ?.data;
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
      await supabase
        .from("cases")
        .update({
          status: "ready",
          key_stats: {
            ...ks,
            last_error: {
              message: errorMsg.slice(0, 500),
              at: new Date().toISOString(),
            },
          } as never,
        })
        .eq("id", failedCaseId);
    },
  },
  { event: "case/analysis.orchestrate" },
  async ({ event, step, logger }) => {
    const {
      case_id,
      forced = [],
      phase15_only = false,
    } = event.data as {
      case_id: string;
      forced?: StagePhase[];
      phase15_only?: boolean;
    };
    if (!case_id) throw new Error("case_id missing in event");
    const supabase = inngestSupabase();
    const force = (p: StagePhase) => forced.includes(p);

    // ─── 케이스 채널 구성 읽기 → phase skip 계획 ───
    const caseRow = await step.run("read-case", async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "brand_id, channel, country, data_channels, ig_config, yt_config, brand_keyword, brand_meta_pages, tiktok_shop_store_url",
        )
        .eq("id", case_id)
        .single();
      if (error || !data) throw new Error(`case fetch: ${error?.message}`);
      return data;
    });

    const channels = (caseRow.data_channels ?? null) as DataChannel[] | null;
    const channelOn = (ch: DataChannel) =>
      channels == null || channels.includes(ch); // data_channels 미설정 = 전부 허용 (구 동작)

    const brandMetaPages = (caseRow.brand_meta_pages ?? []) as unknown[];
    const skipReasons: Partial<Record<StagePhase, string>> = {};
    if (
      caseRow.channel !== "tiktok_shop" &&
      !caseRow.tiktok_shop_store_url &&
      !channelOn("tt_shop")
    ) {
      skipReasons["collect-ttshop"] = "TT Shop 채널/스토어 URL 없음";
    }
    if (!caseRow.brand_keyword && brandMetaPages.length === 0) {
      skipReasons["collect-meta"] =
        "Meta 광고 설정 없음 (brand_keyword/brand_meta_pages)";
    } else if (!channelOn("meta_ads")) {
      skipReasons["collect-meta"] = "data_channels에 meta_ads 없음";
    }
    if (!caseRow.ig_config) {
      skipReasons["collect-ig"] = "ig_config 없음";
      skipReasons["enrich-ig-profiles"] = "ig_config 없음";
    } else if (!channelOn("instagram")) {
      skipReasons["collect-ig"] = "data_channels에 instagram 없음";
      skipReasons["enrich-ig-profiles"] = "data_channels에 instagram 없음";
    }
    if (!caseRow.yt_config) {
      skipReasons["collect-yt"] = "yt_config 없음";
    } else if (!channelOn("youtube")) {
      skipReasons["collect-yt"] = "data_channels에 youtube 없음";
    }
    const skipped = (p: StagePhase) => skipReasons[p] != null;

    // ─── phase_runs 초기화 — 실행 대상 queued / 해당 없음 skipped ───
    const planned: StagePhase[] = phase15_only
      ? ["collect-ttshop"]
      : [
          "collect-ttshop",
          "collect-meta",
          "collect-ig",
          "collect-yt",
          "enrich-creators",
          "enrich-ig-profiles",
          "interpret-asr",
          "interpret-tag",
          "interpret-cluster",
          "interpret-sku",
          "serve-stats",
        ];
    await step.run("phase-runs-init", async () => {
      const now = new Date().toISOString();
      for (const p of planned) {
        await markPhaseRun(supabase, case_id, p, {
          status: skipped(p) ? "skipped" : "queued",
          started_at: null,
          finished_at: skipped(p) ? now : null,
          error: null,
          cost_usd: 0,
          stats: skipped(p) ? { skip_reason: skipReasons[p] } : {},
        });
      }
      return { planned: planned.length, skipped: Object.keys(skipReasons) };
    });
    logger.info("[orchestrate] plan", {
      case_id,
      forced,
      skip: skipReasons,
      phase15_only,
    });

    const invokeData = (phase: StagePhase) => ({
      case_id,
      phase,
      force: force(phase),
    });

    // ─── phase15_only: TT Shop 수집만 하고 draft로 종료 (구 동작 유지) ───
    if (phase15_only) {
      const r = await step.invoke("collect-ttshop", {
        function: collectTtshop,
        data: { case_id, phase: "collect-ttshop", force: true },
      });
      await step.run("phase15-only-mark-draft", async () => {
        await supabase
          .from("cases")
          .update({ status: "draft" })
          .eq("id", case_id);
      });
      return { ok: true, phase15_only: true, result: r };
    }

    // ─── S1 수집 (병렬) ───
    const s1: Array<Promise<unknown>> = [];
    if (!skipped("collect-ttshop")) {
      s1.push(
        step.invoke("collect-ttshop", {
          function: collectTtshop,
          data: invokeData("collect-ttshop"),
        }),
      );
    }
    if (!skipped("collect-meta")) {
      s1.push(
        step.invoke("collect-meta", {
          function: collectMeta,
          data: invokeData("collect-meta"),
        }),
      );
    }
    if (!skipped("collect-ig")) {
      s1.push(
        step.invoke("collect-ig", {
          function: collectIg,
          data: invokeData("collect-ig"),
        }),
      );
    }
    if (!skipped("collect-yt")) {
      s1.push(
        step.invoke("collect-yt", {
          function: collectYt,
          data: invokeData("collect-yt"),
        }),
      );
    }
    await Promise.all(s1);

    // ─── S2 보강 (병렬) ───
    const s2: Array<Promise<unknown>> = [
      step.invoke("enrich-creators", {
        function: enrichCreators,
        data: invokeData("enrich-creators"),
      }),
    ];
    if (!skipped("enrich-ig-profiles")) {
      s2.push(
        step.invoke("enrich-ig-profiles", {
          function: enrichIgProfiles,
          data: invokeData("enrich-ig-profiles"),
        }),
      );
    }
    await Promise.all(s2);

    // ─── S3 해석 (순차 — asr → tag → cluster → sku) ───
    await step.invoke("interpret-asr", {
      function: interpretAsr,
      data: invokeData("interpret-asr"),
    });
    await step.invoke("interpret-tag", {
      function: interpretTag,
      data: invokeData("interpret-tag"),
    });
    await step.invoke("interpret-cluster", {
      function: interpretCluster,
      data: invokeData("interpret-cluster"),
    });
    await step.invoke("interpret-sku", {
      function: interpretSku,
      data: invokeData("interpret-sku"),
    });

    // ─── S4 서빙 집계 (WS4 뷰 전환 전까지) ───
    await step.invoke("serve-stats", {
      function: serveStats,
      data: invokeData("serve-stats"),
    });

    // ─── BP 브랜드 이력 → TIKCLE 2.0 운영 DB sync (비치명적, 구 동작 유지) ───
    await step.run("sync-bp-brands-to-ops", async () => {
      try {
        const r = await syncCaseBpBrands(supabase, case_id);
        logger.info("[orchestrate] bp-brands sync done", r as Record<string, unknown>);
        return r;
      } catch (e) {
        logger.warn("[orchestrate] bp-brands sync 실패(무시)", {
          error: e instanceof Error ? e.message : String(e),
        });
        return { error: true };
      }
    });

    // ─── Final: 완결성 게이트 후 status 승격 + 직전 last_error 클리어 ───
    // BE-7 (QA-2 F1 근본원인): "파이프라인이 안 죽고 리턴했다"만으로 무조건 ready로 올리던 것을
    //   수정. 전 채널 실데이터 0건이면 status='data_ready'(빈 분석 — 이미 존재하는 enum)로
    //   정직하게 표기하고, 실측 카운트를 key_stats.completeness에 남긴다. R8: 데이터 존재로 판단.
    await step.run("mark-ready", async () => {
      const counts = await countCaseData(
        supabase,
        case_id,
        caseRow.brand_id as string,
        caseRow.country as string | null,
      );
      const hasData =
        counts.contents > 0 ||
        counts.meta_ads > 0 ||
        counts.ig_posts > 0 ||
        counts.yt_videos > 0 ||
        counts.products > 0;

      const { data: row } = await supabase
        .from("cases")
        .select("key_stats")
        .eq("id", case_id)
        .single();
      const ks = (row?.key_stats ?? {}) as Record<string, unknown>;
      if ("last_error" in ks) delete ks.last_error;
      ks.completeness = {
        has_data: hasData,
        counts,
        checked_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("cases")
        .update({
          status: hasData ? "ready" : "data_ready",
          analyzed_at: new Date().toISOString(),
          key_stats: ks as never,
        })
        .eq("id", case_id);
      if (error) throw new Error(`mark-ready: ${error.message}`);
      logger.info("[orchestrate] mark-ready", {
        status: hasData ? "ready" : "data_ready",
        counts,
      });
    });

    return {
      ok: true,
      case_id,
      skipped: skipReasons,
      forced,
    };
  },
);

/**
 * BE-7 완결성 게이트용 실측 카운트. 실테이블 직접 count(head) — key_stats 캐시는 실테이블과
 * 어긋날 수 있어(QA-2 F3: 캐시 789 vs 테이블 0) 신뢰 근거로 쓰지 않는다.
 *   - contents: 브랜드+국가 스코프(케이스 직속 FK 아님, spec/01 §1)
 *   - meta_ads/ig_posts/yt_videos/products: case_id 스코프
 */
async function countCaseData(
  supabase: ReturnType<typeof inngestSupabase>,
  case_id: string,
  brand_id: string,
  country: string | null,
): Promise<{
  contents: number;
  meta_ads: number;
  ig_posts: number;
  yt_videos: number;
  products: number;
}> {
  const countHead = async (
    run: () => PromiseLike<{ count: number | null }>,
  ): Promise<number> => {
    try {
      const { count } = await run();
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  let contentsQ = supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand_id);
  contentsQ = country
    ? contentsQ.eq("country", country)
    : contentsQ.is("country", null);

  const [contents, meta_ads, ig_posts, yt_videos, products] = await Promise.all([
    countHead(() => contentsQ),
    countHead(() =>
      supabase
        .from("meta_ads")
        .select("id", { count: "exact", head: true })
        .eq("case_id", case_id),
    ),
    countHead(() =>
      supabase
        .from("ig_posts")
        .select("id", { count: "exact", head: true })
        .eq("case_id", case_id),
    ),
    countHead(() =>
      supabase
        .from("yt_videos")
        .select("id", { count: "exact", head: true })
        .eq("case_id", case_id),
    ),
    countHead(() =>
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("case_id", case_id),
    ),
  ]);

  return { contents, meta_ads, ig_posts, yt_videos, products };
}
