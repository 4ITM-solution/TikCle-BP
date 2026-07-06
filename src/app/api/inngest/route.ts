import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAnalysis } from "@/lib/inngest/functions/run-analysis";
import { orchestrateAnalysis } from "@/lib/inngest/functions/orchestrate-analysis";
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
} from "@/lib/inngest/functions/phases";
import {
  monitorAdsCron,
  monitorScrapeBrand,
} from "@/lib/inngest/functions/monitor-ads";

/**
 * Inngest 함수 등록 endpoint.
 * - runAnalysis: 구 진입점 shim (case/start.analysis → orchestrator 위임).
 * - orchestrateAnalysis: WS2 오케스트레이터 (S1 병렬 → S2 → S3 순차 → S4).
 * - phases/*: per-phase 함수 11개 (case/phase.requested + if 필터, 개별 재실행 가능).
 * - monitorAdsCron(매일) / monitorScrapeBrand(수동): 광고 모니터링 워치리스트.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runAnalysis,
    orchestrateAnalysis,
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
    monitorAdsCron,
    monitorScrapeBrand,
  ],
});
