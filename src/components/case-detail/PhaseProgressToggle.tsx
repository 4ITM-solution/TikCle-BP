"use client";

import { useState } from "react";
import { PhaseProgress } from "./PhaseProgress";
import type { KeyStats } from "@/lib/inngest/types";

/**
 * PhaseProgress를 collapsible로 감싸는 wrapper. 디폴트 닫힘.
 * 화면 차지 줄이려는 의도 — 사용자가 필요할 때만 펼침.
 */
export function PhaseProgressToggle({
  case_id,
  keyStats,
}: {
  case_id: string;
  keyStats: KeyStats;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: "1px solid var(--color-g100)",
        borderRadius: 6,
        background: "white",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-g600)",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms",
            color: "var(--color-g400)",
            fontSize: 11,
          }}
        >
          ▶
        </span>
        분석 단계 (Phase Progress)
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--color-g400)",
            marginLeft: "auto",
          }}
        >
          {open ? "접기" : "각 phase 강제 재실행은 펼치고"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 14px 14px 14px",
            borderTop: "1px solid var(--color-g100)",
          }}
        >
          <PhaseProgress case_id={case_id} keyStats={keyStats} />
        </div>
      )}
    </div>
  );
}
