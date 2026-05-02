"use client";

import { useState, useTransition } from "react";
import { resetToDraft, startAnalysis } from "@/app/cases/[id]/upload-actions";
import type { CostEstimate } from "@/lib/cost-estimate";

export function DevTestActions({
  case_id,
  status,
  costEstimate,
}: {
  case_id: string;
  status: string;
  costEstimate: CostEstimate;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function reset() {
    start(async () => {
      const r = await resetToDraft(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  function rerun() {
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
        marginTop: 14,
        padding: "14px 18px",
        background: "white",
        border: "1px dashed var(--color-g300)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        DEV — 테스트 액션 (Stage 3 이전)
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={rerun}
          disabled={pending}
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "6px 12px" }}
        >
          {pending ? "..." : "분석 재실행 (Inngest 이벤트 다시 발행)"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="btn"
          style={{
            background: "white",
            color: "var(--color-accent)",
            border: "1px solid var(--color-accent-soft)",
            fontSize: 11,
            padding: "6px 12px",
          }}
        >
          {pending ? "..." : "draft로 되돌리기"}
        </button>
        {msg && (
          <span
            style={{
              fontSize: 11,
              color:
                msg.type === "ok"
                  ? "var(--color-pos)"
                  : "var(--color-accent)",
              fontWeight: 600,
            }}
          >
            {msg.type === "ok" ? "✓ " : "✕ "}
            {msg.text}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g400)",
          marginTop: 8,
          fontFamily: "var(--font-mono)",
          lineHeight: 1.5,
        }}
      >
        현재 status: <b style={{ color: "var(--color-ink)" }}>{status}</b>
        {" · "}예상 비용 최대{" "}
        <b style={{ color: "var(--color-ink)" }}>
          ${costEstimate.total_max_usd.toFixed(2)}
        </b>
        {costEstimate.phase4a.skip_reason && (
          <> · Phase 4a skip ({costEstimate.phase4a.skip_reason})</>
        )}
        <br />
        draft로 되돌리면 업로드 UI 다시 노출, 재실행 누르면 Inngest dev server에 이벤트 재발행
      </div>
    </div>
  );
}
