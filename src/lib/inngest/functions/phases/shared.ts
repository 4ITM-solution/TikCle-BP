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

// ─────────────────────────────────────────────────────────────
// WS5 §1 운영 가드 — 실패 슬랙 알림 · credit_exhausted 분류 · 비용 상한
// ─────────────────────────────────────────────────────────────

/** 무료 phase — 비용 가드 미적용. */
const FREE_PHASES: ReadonlySet<string> = new Set(["serve-stats"]);

const CASE_COST_CAP_USD = Number(process.env.BP_CASE_COST_CAP_USD || 25);
const MONTHLY_COST_CAP_USD = Number(process.env.BP_MONTHLY_COST_CAP_USD || 300);

/**
 * 파이프라인 슬랙 알림 — SLACK_PIPELINE_WEBHOOK 미설정이면 조용히 skip (로컬 개발).
 * 알림 실패가 파이프라인을 죽이면 안 되므로 절대 throw하지 않는다.
 */
export async function notifyPipelineSlack(text: string): Promise<void> {
  const url = process.env.SLACK_PIPELINE_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.warn("[slack] 알림 실패(무시):", e instanceof Error ? e.message : e);
  }
}

/**
 * 에러 분류 — 잔고 소진은 별도 코드로 (2026-07-07 웨이브 8건 연쇄 실패 재발 방지).
 * 분류된 태그는 error 문자열 앞에 붙어 phase_runs·슬랙 양쪽에서 식별된다.
 */
export function classifyPhaseError(msg: string): "credit_exhausted" | null {
  return /credit balance is too low/i.test(msg) ? "credit_exhausted" : null;
}

class BudgetExceededError extends Error {}

/**
 * 비용 상한 가드 — 유료 phase 시작 전 phase_runs.cost_usd 합산 체크.
 * 케이스당 BP_CASE_COST_CAP_USD(기본 $25) · 월간 BP_MONTHLY_COST_CAP_USD(기본 $300).
 * 초과 시 throw → Inngest onFailure 경로로 status='failed'(budget_exceeded) 기록 + 슬랙.
 * 가드 자체의 조회 실패는 통과시킨다 (가드가 파이프라인을 죽이면 안 됨).
 */
async function assertBudget(
  supabase: SupaClient,
  case_id: string,
  phase: StagePhase,
): Promise<void> {
  if (FREE_PHASES.has(phase)) return;
  let caseSum = 0;
  let monthSum = 0;
  try {
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            range: (a: number, b: number) => PromiseLike<{
              data: Array<{ cost_usd: number | null }> | null;
              error: unknown;
            }>;
          };
          gte: (k: string, v: string) => {
            range: (a: number, b: number) => PromiseLike<{
              data: Array<{ cost_usd: number | null }> | null;
              error: unknown;
            }>;
          };
        };
      };
    };
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    // R2: PostgREST 1000행 한도 — 페이지네이션 (phase_runs는 케이스×phase 단위라 실제로는 소량)
    const sumPaged = async (
      q: (a: number, b: number) => PromiseLike<{ data: Array<{ cost_usd: number | null }> | null; error: unknown }>,
    ) => {
      let total = 0;
      for (let off = 0; off < 10_000; off += 1000) {
        const { data, error } = await q(off, off + 999);
        if (error || !data) break;
        total += data.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
        if (data.length < 1000) break;
      }
      return total;
    };
    caseSum = await sumPaged((a, b) =>
      sb.from("phase_runs").select("cost_usd").eq("case_id", case_id).range(a, b),
    );
    monthSum = await sumPaged((a, b) =>
      sb.from("phase_runs").select("cost_usd").gte("started_at", monthStart.toISOString()).range(a, b),
    );
  } catch (e) {
    console.warn("[budget] 조회 실패 — 가드 통과:", e instanceof Error ? e.message : e);
    return;
  }
  if (caseSum >= CASE_COST_CAP_USD || monthSum >= MONTHLY_COST_CAP_USD) {
    const which =
      caseSum >= CASE_COST_CAP_USD
        ? `케이스 누적 $${caseSum.toFixed(2)} ≥ 상한 $${CASE_COST_CAP_USD}`
        : `월간 누적 $${monthSum.toFixed(2)} ≥ 상한 $${MONTHLY_COST_CAP_USD}`;
    throw new BudgetExceededError(`budget_exceeded: ${which} — ${phase} 중단 (env로 상한 조정 가능)`);
  }
}

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
  // 유료 phase 시작 시점 비용 가드 (WS5 §1) — BudgetExceededError는 의도적으로 전파.
  if (patch.status === "running") {
    await assertBudget(supabase, case_id, phase);
  }
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
    if (e instanceof BudgetExceededError) throw e;
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
  const rawMsg =
    error instanceof Error ? error.message : String(error ?? "unknown");
  // WS5 §1: 에러 분류 태그 (credit_exhausted 등) — phase_runs·슬랙 공통 식별자.
  const tag = classifyPhaseError(rawMsg);
  const msg = tag ? `[${tag}] ${rawMsg}` : rawMsg;
  await markPhaseRun(inngestSupabase(), case_id, phase, {
    status: "failed",
    finished_at: new Date().toISOString(),
    error: msg.slice(0, 500),
  });
  // WS5 §1: 실패 슬랙 알림 — 재실행 커맨드 포함.
  const head =
    tag === "credit_exhausted"
      ? "🔴 *Anthropic 크레딧 소진* — 충전 전까지 유료 phase 전부 실패합니다"
      : `❌ phase 실패: \`${phase}\``;
  await notifyPipelineSlack(
    [
      head,
      `케이스 \`${case_id}\` · phase \`${phase}\``,
      `에러: ${rawMsg.slice(0, 300)}`,
      `재실행: \`curl -s -X POST https://inn.gs/e/$INNGEST_EVENT_KEY -H 'Content-Type: application/json' -d '{"name":"case/phase.requested","data":{"case_id":"${case_id}","phase":"${phase}","force":true}}'\``,
    ].join("\n"),
  );
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
