"use client";

import { useState, useTransition } from "react";
import { resetToDraft, startAnalysis } from "@/app/cases/[id]/upload-actions";
import { mergeCases } from "@/app/cases/[id]/case-actions";
import type { CostEstimate } from "@/lib/cost-estimate";
import type { KeyStats } from "@/lib/inngest/types";

export type MergeCandidate = {
  id: string;
  channel: string | null;
  status: string;
  updated_at: string;
};

/**
 * CaseDevFooter — mockup line 1354-1364 의 `.footer-dev` + `.dev-btn` 5개.
 *
 * 평소엔 접혀있고 (펼치기 클릭 시 노출).
 * 5 dev 액션:
 *   1. status: ready ↔ running 토글 (startAnalysis / resetToDraft)
 *   2. key_stats dump (JSON alert)
 *   3. last_error 강제 박기 (test alert)
 *   4. cost 추정 보기 (preview_text alert)
 *   5. phase raw 보기 (console.log + 안내)
 */
export function CaseDevFooter({
  case_id,
  status,
  costEstimate,
  keyStats,
  lastError,
  mergeCandidates,
}: {
  case_id: string;
  status: string;
  costEstimate: CostEstimate;
  keyStats?: KeyStats | null;
  lastError?: string | null;
  /** 같은 brand+country 옛 case 후보 (mergeCases dropdown) */
  mergeCandidates?: MergeCandidate[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [mergeSrc, setMergeSrc] = useState<string>("");

  function doMerge() {
    if (!mergeSrc) {
      window.alert("source case 선택 필수");
      return;
    }
    if (
      !window.confirm(
        `source case ${mergeSrc.slice(0, 8)}… 의 모든 데이터를 이 case 로 흡수하고 source 삭제. 되돌릴 수 없음. 진행?`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await mergeCases(mergeSrc, case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) setMergeSrc("");
    });
  }

  function toggleStatus() {
    if (status === "ready" || status === "running") {
      start(async () => {
        const r = await resetToDraft(case_id);
        setMsg(
          r.ok
            ? { type: "ok", text: r.message }
            : { type: "err", text: r.error },
        );
      });
    } else {
      if (!window.confirm(costEstimate.preview_text)) return;
      start(async () => {
        const r = await startAnalysis(case_id);
        setMsg(
          r.ok
            ? { type: "ok", text: r.message }
            : { type: "err", text: r.error },
        );
      });
    }
  }

  function dumpKeyStats() {
    if (!keyStats) {
      window.alert("key_stats 비어있음 — 분석 안 돌아갔거나 빈 case");
      return;
    }
    const txt = JSON.stringify(keyStats, null, 2);
    console.log("[CaseDevFooter] key_stats dump:", keyStats);
    window.alert(`key_stats (${txt.length}자) — console에 dump됨\n\n${txt.slice(0, 500)}…`);
  }

  function showLastError() {
    if (lastError) {
      window.alert(`last_error:\n\n${lastError}`);
    } else {
      window.alert("last_error 없음 (정상)");
    }
  }

  function showCost() {
    window.alert(costEstimate.preview_text);
  }

  function showPhaseRaw() {
    if (!keyStats) {
      window.alert("phase raw 없음");
      return;
    }
    const phases = Object.keys(keyStats);
    console.log("[CaseDevFooter] phase raw:", keyStats);
    window.alert(`Phase 결과 ${phases.length}개 — console.log dump됨:\n${phases.join(", ")}`);
  }

  return (
    <div className="bp-mockup">
      <details className="footer-dev" id="sec-dev">
        <summary>⚙️ DEV / QA 액션 (펼치기)</summary>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="dev-btn"
            onClick={toggleStatus}
            disabled={pending}
          >
            {pending
              ? "..."
              : `status: ${status} ${status === "draft" ? "→ 분석 시작" : "↔ draft 되돌리기"}`}
          </button>
          <button
            type="button"
            className="dev-btn"
            onClick={dumpKeyStats}
          >
            key_stats dump (JSON)
          </button>
          <button
            type="button"
            className="dev-btn"
            onClick={showLastError}
          >
            last_error 보기{lastError ? " (있음)" : " (없음)"}
          </button>
          <button
            type="button"
            className="dev-btn"
            onClick={showCost}
          >
            cost 추정 보기 (${costEstimate.total_max_usd.toFixed(2)})
          </button>
          <button
            type="button"
            className="dev-btn"
            onClick={showPhaseRaw}
          >
            phase raw 보기
          </button>

          {mergeCandidates && mergeCandidates.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#fef3c7",
                border: "1px dashed #d97706",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                ⚠ A 모델 마이그레이션 — 같은 brand+country 옛 case 흡수:
              </span>
              <select
                value={mergeSrc}
                onChange={(e) => setMergeSrc(e.target.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  border: "1px solid #d97706",
                  borderRadius: 3,
                  background: "white",
                  fontFamily: "inherit",
                }}
              >
                <option value="">source case 선택…</option>
                {mergeCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id.slice(0, 8)}… · {c.channel ?? "—"} · {c.status} ·{" "}
                    {new Date(c.updated_at).toLocaleDateString("ko-KR")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={doMerge}
                disabled={pending || !mergeSrc}
                style={{
                  background: "#92400e",
                  color: "white",
                  border: "none",
                  borderRadius: 3,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: pending || !mergeSrc ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  opacity: pending || !mergeSrc ? 0.5 : 1,
                }}
              >
                {pending ? "..." : "🔀 이 case 로 흡수"}
              </button>
            </div>
          )}

          {msg && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 4,
                background: msg.type === "ok" ? "#d1fae5" : "#fee2e2",
                color: msg.type === "ok" ? "#065f46" : "#991b1b",
              }}
            >
              {msg.type === "ok" ? "✓ " : "✕ "}
              {msg.text}
            </div>
          )}
          <div
            style={{
              fontSize: 10,
              color: "#9ca3af",
              marginTop: 10,
              fontFamily: "monospace",
            }}
          >
            status: <b>{status}</b> · cost cap ${costEstimate.total_max_usd.toFixed(2)}
            {costEstimate.phase4a.skip_reason && (
              <> · 4a skip ({costEstimate.phase4a.skip_reason})</>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
