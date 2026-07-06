import {
  inngest,
  mapOldForceToStages,
  type PhaseKey,
} from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { orchestrateAnalysis } from "./orchestrate-analysis";

/**
 * 구 케이스 분석 진입점 — WS2 shim.
 *
 * 기존 이벤트(`case/start.analysis` + force_phases)를 그대로 받아
 * 새 오케스트레이터(orchestrate-analysis)로 위임한다.
 *   - force_phases(구 PhaseKey) → 스테이지 phase 매핑 (client.OLD_PHASE_TO_STAGE)
 *   - phase15_only 모드 그대로 전달
 *
 * 실제 파이프라인은 src/lib/inngest/functions/phases/* 의 per-phase 함수들
 * (각각 retries 3 + phase_runs 추적). 검증 완료 후 이 shim은 삭제 예정 (§4 WS2).
 */
export const runAnalysis = inngest.createFunction(
  {
    id: "case-run-analysis",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.case_id",
    },
    onFailure: async ({ event, error }) => {
      // 오케스트레이터 invoke 자체가 실패한 경우 status 'running' stuck 방지.
      // (오케스트레이터의 onFailure도 동일 처리 — 중복 실행돼도 멱등)
      const wrappedData = (event.data as { event?: { data?: unknown } })?.event
        ?.data;
      const failedCaseId = (wrappedData as { case_id?: string } | undefined)
        ?.case_id;
      if (!failedCaseId) return;
      const supabase = inngestSupabase();
      const { data: existing } = await supabase
        .from("cases")
        .select("key_stats, status")
        .eq("id", failedCaseId)
        .single();
      if (existing?.status !== "running") return; // 이미 정리됨
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
  { event: "case/start.analysis" },
  async ({ event, step, logger }) => {
    const {
      case_id,
      force_phases = [],
      phase15_only = false,
    } = event.data as {
      case_id: string;
      with_video?: boolean;
      force_phases?: PhaseKey[];
      phase15_only?: boolean;
    };
    if (!case_id) throw new Error("case_id missing in event");

    const forced = mapOldForceToStages(force_phases);
    logger.info("[run-analysis shim] → orchestrate", {
      case_id,
      force_phases,
      forced,
      phase15_only,
    });

    const result = await step.invoke("orchestrate", {
      function: orchestrateAnalysis,
      data: { case_id, forced, phase15_only },
    });

    return { ok: true, case_id, via: "ws2-orchestrator", result };
  },
);
