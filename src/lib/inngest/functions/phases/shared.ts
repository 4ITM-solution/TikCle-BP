import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { inngestSupabase } from "@/lib/inngest/supabase";
import { runPhase4bSample } from "@/lib/inngest/aggregators/phase4b-sample";
import type { StagePhase } from "@/lib/inngest/client";
import type { KeyStats, Phase4bSampleStats } from "@/lib/inngest/types";

/**
 * WS2 공용 헬퍼 — per-phase Inngest 함수들이 공유.
 *
 *   - phase_runs upsert (WS1 migration 017)
 *   - key_stats merge 저장 (read-modify-write, phase 키 단위)
 *   - phase4b_sample ensure (interpret-* 함수들의 공통 입력)
 *
 * ⚠️ phase_runs 테이블은 hand-written Database 타입에 아직 없음 (migration 017,
 *    generated types 미반영) → 구조적 캐스트로 접근. 테이블 미적용 환경에서도
 *    파이프라인이 죽지 않게 upsert 실패는 warn 후 무시.
 */

export type SupaClient = SupabaseClient<Database>;

export type PhaseRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "skipped";

export type PhaseEventData = {
  case_id: string;
  phase?: string;
  force?: boolean;
};

type PhaseRunsTable = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      opts: { onConflict: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export async function markPhaseRun(
  supabase: SupaClient,
  case_id: string,
  phase: StagePhase,
  patch: {
    status: PhaseRunStatus;
    started_at?: string | null;
    finished_at?: string | null;
    error?: string | null;
    cost_usd?: number;
    stats?: Record<string, unknown>;
  },
): Promise<{ ok: boolean }> {
  const sb = supabase as unknown as PhaseRunsTable;
  try {
    const { error } = await sb.from("phase_runs").upsert(
      { case_id, phase, ...patch },
      { onConflict: "case_id,phase" },
    );
    if (error) {
      console.warn(`[phase_runs] upsert 실패(무시): ${phase} — ${error.message}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    // 테이블 미존재(migration 017 미적용) 등 — 파이프라인은 계속.
    console.warn(
      `[phase_runs] upsert 예외(무시): ${phase} —`,
      e instanceof Error ? e.message : e,
    );
    return { ok: false };
  }
}

/**
 * onFailure 공용 — retries 소진 후 phase_runs.status='failed' 마킹.
 * onFailure 이벤트는 원본 이벤트를 event.data.event로 감쌈 (run-analysis 기존 패턴).
 */
export async function markPhaseFailedFromEvent(
  phase: StagePhase,
  event: { data: unknown },
  error: unknown,
): Promise<void> {
  const wrapped = (event.data as { event?: { data?: unknown } })?.event?.data;
  const case_id = (wrapped as { case_id?: string } | undefined)?.case_id;
  if (!case_id) return;
  const msg =
    error instanceof Error ? error.message : String(error ?? "unknown");
  await markPhaseRun(inngestSupabase(), case_id, phase, {
    status: "failed",
    finished_at: new Date().toISOString(),
    error: msg.slice(0, 500),
  });
}

/** 현재 key_stats 읽기 (fresh). */
export async function readKeyStats(
  supabase: SupaClient,
  case_id: string,
): Promise<KeyStats> {
  const { data, error } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  if (error) throw new Error(`key_stats fetch: ${error.message}`);
  return (data?.key_stats ?? {}) as KeyStats;
}

/**
 * key_stats phase 키 단위 merge 저장.
 * 구 runAnalysis는 시작 시점 스냅샷(existing) 위에 덮어써 stale 덮어쓰기가 가능했음 —
 * 여기선 항상 저장 직전 fresh 읽기 후 patch만 merge (phase 함수가 자기 키만 소유).
 */
export async function mergeKeyStats(
  supabase: SupaClient,
  case_id: string,
  patch: Partial<KeyStats>,
): Promise<void> {
  const current = await readKeyStats(supabase, case_id);
  const next = { ...current, ...patch } as KeyStats;
  const { error } = await supabase
    .from("cases")
    .update({ key_stats: next })
    .eq("id", case_id);
  if (error) throw new Error(`key_stats merge save: ${error.message}`);
}

/**
 * phase4b_sample 확보 — interpret-asr/tag/cluster/sku 공통 입력.
 * force가 아니고 key_stats에 이미 있으면 재사용, 없으면 계산 후 저장.
 * fresh=true면 하위 phase도 캐시 무시하고 재계산해야 함.
 */
export async function ensurePhase4bSample(
  supabase: SupaClient,
  case_id: string,
  force: boolean,
): Promise<{ sample: Phase4bSampleStats; fresh: boolean }> {
  if (!force) {
    const ks = await readKeyStats(supabase, case_id);
    if (ks.phase4b_sample) return { sample: ks.phase4b_sample, fresh: false };
  }
  const sample = await runPhase4bSample(supabase, case_id);
  await mergeKeyStats(supabase, case_id, { phase4b_sample: sample });
  return { sample, fresh: true };
}
