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
  | "phase4a_intel"
  | "phase4c"
  | "phase4d"
  | "phase4b_sample"
  | "phase4b_asr"
  | "phase4b_vision"
  | "phase4b_clusters"
  | "phase4b_sku"
  | "phase5";

/**
 * WS2 (BP 재설계 v2 §3.1) — 스테이지 4단 phase 명명.
 * 각 이름이 독립 Inngest 함수 1개 = phase_runs.phase 값.
 */
export type StagePhase =
  // S1 수집 (병렬)
  | "collect-ttshop" // 구 phase1_5
  | "collect-meta" // 구 phase4a + 4a.5(assets)
  | "collect-ig" // 구 phase4c
  | "collect-yt" // 구 phase4d
  // S2 보강
  | "enrich-creators" // 구 phase3 + 3.5 + 3.7
  | "enrich-ig-profiles" // 구 phase4c.5
  // S3 해석 (순차)
  | "interpret-asr" // 구 phase4b_sample + 4b.2
  | "interpret-tag" // 구 phase4a.6 + 4b.3
  | "interpret-cluster" // 구 phase4b.4 (pass별 step)
  | "interpret-sku" // 구 phase4b.5
  // S4 서빙 (phase2/phase5 집계 — WS4에서 뷰 전환 전까지 유지)
  | "serve-stats";

export const ALL_STAGE_PHASES: StagePhase[] = [
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

/** 구 force_phases(PhaseKey) → 새 스테이지 phase 매핑 (shim/서버액션 호환용). */
export const OLD_PHASE_TO_STAGE: Record<PhaseKey, StagePhase> = {
  phase1_5: "collect-ttshop",
  phase2: "serve-stats",
  phase3: "enrich-creators",
  phase35: "enrich-creators",
  phase37: "enrich-creators",
  phase4a: "collect-meta",
  phase4a_assets: "collect-meta",
  phase4a_intel: "interpret-tag",
  phase4c: "collect-ig",
  phase4d: "collect-yt",
  phase4b_sample: "interpret-asr",
  phase4b_asr: "interpret-asr",
  phase4b_vision: "interpret-tag",
  phase4b_clusters: "interpret-cluster",
  phase4b_sku: "interpret-sku",
  phase5: "serve-stats",
};

export function mapOldForceToStages(force: PhaseKey[] | undefined): StagePhase[] {
  return Array.from(new Set((force ?? []).map((k) => OLD_PHASE_TO_STAGE[k])));
}

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
  // WS2 — 개별 phase 실행/재실행. 각 phase 함수가 if 필터로 자기 phase만 수신.
  // BE-12(CX1-F2): cascade 기본 true — phase 완료 시 downstream 자동 동반(PHASE_DOWNSTREAM).
  //   오케스트레이터 step.invoke는 cascade:false로 자동 동반을 끈다(전체 분석은 자체 순서로 구동).
  //   cascade_chain은 체인 중간 phase가 원본 체인의 남은 단계를 이어받기 위한 내부 필드.
  "case/phase.requested": {
    data: {
      case_id: string;
      phase: StagePhase;
      force?: boolean;
      cascade?: boolean;
      cascade_chain?: { phase: StagePhase; force: boolean }[];
    };
  };
  // WS2 — 오케스트레이터 전용 (shim runAnalysis가 invoke, 직접 send도 가능).
  "case/analysis.orchestrate": {
    data: {
      case_id: string;
      forced?: StagePhase[]; // 캐시 무시하고 강제 재실행할 스테이지
      phase15_only?: boolean;
    };
  };
  // 광고 모니터링 — 수동 "지금 수집" 트리거
  "monitor/scrape.brand": {
    data: { brand_id: string };
  };
};
