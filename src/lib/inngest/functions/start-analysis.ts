import { inngest } from "@/lib/inngest/client";

/**
 * Stage 2.5 placeholder.
 *
 * `case/start.analysis` 이벤트를 수신해 로깅만 함.
 * Stage 3에서 실제 phase 1~6 함수로 대체.
 */
export const startAnalysisPlaceholder = inngest.createFunction(
  { id: "case-start-analysis-placeholder" },
  { event: "case/start.analysis" },
  async ({ event, step }) => {
    await step.run("log", () => {
      console.log("[start.analysis] received", event.data);
      return { received: true, case_id: event.data.case_id };
    });

    // TODO Stage 3: phase 1 (data loader) 호출로 교체.
    return { ok: true, note: "placeholder — phase 함수 미구현" };
  },
);
