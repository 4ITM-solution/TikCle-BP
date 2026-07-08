"use client";

import { useState, useTransition } from "react";
import { requestPhaseRerun } from "@/app/cases/[id]/upload-actions";
import type { StagePhase } from "@/lib/inngest/client";

/**
 * ★ C5(WS4b): PhaseProgress phase_runs 직결.
 * 신 11-phase × {상태·비용·partial 잔여·재실행}. 사용자 언어 라벨만(코드/skipped_reason 원문 노출 금지, U3).
 * 라벨 매핑: WS4a REPORT §4-1(PhaseProgressUser) 초안 재사용.
 */

type PhaseRun = {
  phase: string;
  status: string;
  cost_usd: number | null;
  error: string | null;
  stats: Record<string, unknown> | null;
  finished_at: string | null;
};

// 신 11-phase 순서 + 사용자 언어 라벨 (코드명 노출 금지)
const PHASE_META: Array<{ key: StagePhase; label: string }> = [
  { key: "collect-meta", label: "메타 광고 수집" },
  { key: "collect-ig", label: "인스타그램 수집" },
  { key: "collect-yt", label: "유튜브 수집" },
  { key: "collect-ttshop", label: "틱톡샵 수집" },
  { key: "enrich-creators", label: "크리에이터 정보 보강" },
  { key: "enrich-ig-profiles", label: "인스타그램 프로필 보강" },
  { key: "interpret-asr", label: "영상 음성 자막화" },
  { key: "interpret-tag", label: "영상 태깅 (장면 인식)" },
  { key: "interpret-cluster", label: "영상 유형 묶기 (클러스터링)" },
  { key: "interpret-sku", label: "제품 매칭" },
  { key: "serve-stats", label: "통계 집계" },
];

const STATUS_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  completed: { label: "완료", icon: "✓", color: "#065f46", bg: "#d1fae5" },
  partial: { label: "일부 완료", icon: "~", color: "#92400e", bg: "#fef3c7" },
  skipped: { label: "건너뜀", icon: "–", color: "#6b7280", bg: "#f3f4f6" },
  failed: { label: "실패", icon: "✕", color: "#991b1b", bg: "#fee2e2" },
  running: { label: "실행 중", icon: "◍", color: "#1e40af", bg: "#dbeafe" },
  queued: { label: "대기", icon: "⋯", color: "#6b7280", bg: "#f3f4f6" },
};

function partialRemaining(stats: Record<string, unknown> | null): string | null {
  if (!stats) return null;
  // stats 안 잔여 힌트(remaining/pending 등) — 코드명 노출 없이 숫자만.
  const rem = stats["remaining"] ?? stats["pending"] ?? stats["left"];
  if (typeof rem === "number" && rem > 0) return `잔여 ${rem.toLocaleString()}`;
  return null;
}

export function PhaseRunsPanel({ caseId, runs }: { caseId: string; runs: PhaseRun[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyPhase, setBusyPhase] = useState<string | null>(null);

  const byPhase = new Map<string, PhaseRun>();
  for (const r of runs) byPhase.set(r.phase, r);

  const doneCount = PHASE_META.filter((p) => byPhase.get(p.key)?.status === "completed").length;

  function rerun(phase: StagePhase) {
    setBusyPhase(phase);
    startTransition(async () => {
      await requestPhaseRerun(caseId, phase);
      setBusyPhase(null);
    });
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "10px 14px", background: "#f9fafb",
          border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span>⚙️ 분석 단계 진행 상태 (11단계)</span>
        <span style={{ color: "#9ca3af", fontWeight: 500 }}>
          완료 {doneCount}/{PHASE_META.length} · {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {open && (
        <div>
          {PHASE_META.map((p) => {
            const run = byPhase.get(p.key);
            const status = run?.status ?? "queued";
            const sm = STATUS_META[status] ?? STATUS_META.queued!;
            const rem = partialRemaining(run?.stats ?? null);
            const cost = run?.cost_usd ?? 0;
            return (
              <div
                key={p.key}
                style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center",
                  padding: "9px 14px", borderTop: "1px solid #f3f4f6", fontSize: 12,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{p.label}</span>
                  {status === "partial" && rem && (
                    <span style={{ fontSize: 10, color: "#92400e", marginLeft: 6 }}>{rem}</span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: cost > 0 ? "#6b7280" : "#d1d5db" }}>
                  {cost > 0 ? `$${cost.toFixed(2)}` : "무료"}
                </span>
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 9,
                    color: sm.color, background: sm.bg, whiteSpace: "nowrap",
                  }}
                >
                  {sm.icon} {sm.label}
                </span>
                <button
                  type="button"
                  disabled={pending && busyPhase === p.key}
                  onClick={() => rerun(p.key)}
                  title="이 단계 재실행 (하류 cascade 는 BE-12 배포 후 자동)"
                  style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                    border: "1px solid #d1d5db", background: "white", color: "#374151",
                    opacity: pending && busyPhase === p.key ? 0.5 : 1,
                  }}
                >
                  {pending && busyPhase === p.key ? "요청 중…" : "↻ 재실행"}
                </button>
              </div>
            );
          })}
          <div style={{ padding: "7px 14px", fontSize: 10, color: "#9ca3af", background: "#fafafa", borderTop: "1px solid #f3f4f6" }}>
            재실행은 해당 단계만 다시 돌립니다. 하류 단계 자동 재실행(cascade)은 BE-12 배포 후 활성화됩니다.
          </div>
        </div>
      )}
    </div>
  );
}
