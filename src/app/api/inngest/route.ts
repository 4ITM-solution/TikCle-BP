import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAnalysis } from "@/lib/inngest/functions/run-analysis";
import {
  monitorAdsCron,
  monitorScrapeBrand,
} from "@/lib/inngest/functions/monitor-ads";

/**
 * Inngest 함수 등록 endpoint.
 * - runAnalysis: 케이스 분석 오케스트레이터 (phase 2~6).
 * - monitorAdsCron(매일) / monitorScrapeBrand(수동): 광고 모니터링 워치리스트.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAnalysis, monitorAdsCron, monitorScrapeBrand],
});
