"use client";

import { useState, useTransition } from "react";
import { startAnalysis } from "@/app/cases/[id]/upload-actions";
import type { CostEstimate } from "@/lib/cost-estimate";

export function StartAnalysisButton({
  case_id,
  ready,
  reason,
  costEstimate,
}: {
  case_id: string;
  ready: boolean;
  reason: string;
  costEstimate: CostEstimate;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function go() {
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

  return (
    <div
      style={{
        marginTop: 24,
        padding: "16px 20px",
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 10,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
          분석 시작
        </div>
        <div style={{ fontSize: 11, color: "var(--color-g500)" }}>
          {ready ? "필수 데이터가 모두 적재되었습니다." : reason}
          {ready && (
            <>
              {" · "}
              <span className="font-mono">
                예상 비용 최대 ${costEstimate.total_max_usd.toFixed(2)}
              </span>
              {costEstimate.phase4a.skip_reason && (
                <span
                  style={{
                    color: "var(--color-g400)",
                    marginLeft: 4,
                  }}
                >
                  (Phase 4a skip — {costEstimate.phase4a.skip_reason})
                </span>
              )}
            </>
          )}
          {msg && (
            <span
              style={{
                marginLeft: 8,
                color:
                  msg.type === "ok"
                    ? "var(--color-pos)"
                    : "var(--color-accent)",
                fontWeight: 700,
              }}
            >
              {msg.type === "ok" ? "✓ " : "✕ "}
              {msg.text}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={go}
        disabled={!ready || pending}
        className="btn btn-accent"
      >
        {pending ? "시작 중…" : "분석 시작 →"}
      </button>
    </div>
  );
}
