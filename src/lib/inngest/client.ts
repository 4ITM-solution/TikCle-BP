import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "bp-v2",
  // dev 모드 명시 — NODE_ENV=production일 때만 cloud 사용
  isDev: process.env.NODE_ENV !== "production",
  // 로컬 dev: dev server 자동 등록
  // 프로덕션: INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY 환경변수 사용
});

/**
 * Inngest로 보낼 수 있는 이벤트 타입.
 * 각 phase 함수는 이 이벤트들 중 하나를 listen.
 */
export type PhaseKey =
  | "phase1_5"
  | "phase2"
  | "phase3"
  | "phase35"
  | "phase37"
  | "phase4a"
  | "phase4a_assets"
  | "phase4b_sample"
  | "phase4b_asr"
  | "phase4b_vision"
  | "phase4b_clusters"
  | "phase4b_sku"
  | "phase5";

export type Events = {
  "case/data.uploaded": {
    data: { case_id: string };
  };
  "case/start.analysis": {
    data: {
      case_id: string;
      with_video?: boolean;
      // 명시된 phase는 캐시 무시하고 강제 재실행. 나머지는 cache hit이면 skip.
      force_phases?: PhaseKey[];
    };
  };
  "case/phase.completed": {
    data: { case_id: string; phase: number };
  };
};
