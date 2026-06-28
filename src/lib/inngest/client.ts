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
  | "phase4c"
  | "phase4d"
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
      // true면 Phase 1.5 (TT Shop 자동 수집) 후 즉시 종료. products만 채우고
      // Helium10 paste/Affiliate CSV 받을 수 있게 하기 위함. status='draft' 유지.
      phase15_only?: boolean;
    };
  };
  "case/phase.completed": {
    data: { case_id: string; phase: number };
  };
  // 광고 모니터링 — 수동 "지금 수집" 트리거
  "monitor/scrape.brand": {
    data: { brand_id: string };
  };
};
