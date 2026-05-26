"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startPhase15Only } from "@/app/cases/[id]/upload-actions";

/**
 * Phase 1.5 (TT Shop 자동 수집)만 트리거하는 버튼.
 * draft 케이스에서 본 분석 시작 전에 products 채우기 용도.
 * Helium10 paste / Affiliate CSV 슬롯이 product 드롭다운 필요한데 빈 상태였던 문제 해결.
 */
export function StartPhase15Button({
  case_id,
  status,
  hasProducts,
}: {
  case_id: string;
  status: string;
  hasProducts: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const isRunning = status === "running";

  function trigger() {
    start(async () => {
      const r = await startPhase15Only(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={trigger}
        disabled={pending || isRunning}
        style={{
          background: hasProducts ? "transparent" : "var(--color-ink)",
          color: hasProducts ? "var(--color-g600)" : "white",
          border: hasProducts
            ? "1px solid var(--color-g200)"
            : "1px solid var(--color-ink)",
          padding: "6px 14px",
          fontSize: 12,
          borderRadius: 5,
          cursor: pending || isRunning ? "not-allowed" : "pointer",
          opacity: pending || isRunning ? 0.6 : 1,
        }}
      >
        {pending
          ? "Inngest 트리거 중…"
          : isRunning
            ? "⏳ 진행 중… (5~30분, 새로고침해서 확인)"
            : hasProducts
              ? "↻ 제품 다시 수집 (Phase 1.5)"
              : "▶ 제품 자동 수집 시작 (Phase 1.5만, ~5-30분)"}
      </button>
      {msg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color:
              msg.type === "ok"
                ? "var(--color-pos)"
                : "var(--color-accent)",
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}
    </div>
  );
}
