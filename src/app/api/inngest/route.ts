import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runAnalysis } from "@/lib/inngest/functions/run-analysis";

/**
 * Inngest 함수 등록 endpoint.
 * 단일 오케스트레이터 함수가 phase 2~6를 step.run으로 순차 실행.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAnalysis],
});
