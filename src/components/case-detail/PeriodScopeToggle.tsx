"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePeriodScope } from "@/app/cases/[id]/period-scope-actions";
import type { PeriodScope } from "@/lib/case-detail/period-filter";

/**
 * 분석 기간 토글 — 헤더 배지 행. RegionScopeToggle과 동일 패턴.
 * 프리셋(전체/최근 90일) + 커스텀 날짜 2개.
 * 기간 변경 = 라이브 집계 WHERE 재적용 (유료 phase 재실행 없음).
 */
export function PeriodScopeToggle({
  case_id,
  current,
}: {
  case_id: string;
  current: PeriodScope | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState(current?.start ?? "");
  const [customEnd, setCustomEnd] = useState(current?.end ?? "");

  function apply(s: string | null, e: string | null) {
    setMsg(null);
    start(async () => {
      try {
        const r = await updatePeriodScope(case_id, s, e);
        if (r.ok) {
          setMsg(s || e ? "기간 적용됨" : "전체 기간으로 해제됨");
          router.refresh();
        } else setMsg(`오류: ${r.error}`);
      } catch (err) {
        setMsg(`오류: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const last90 = () => {
    const e = new Date();
    const s = new Date(e.getTime() - 90 * 86_400_000);
    apply(iso(s), iso(e));
  };

  const btn: React.CSSProperties = {
    background: "white",
    border: "none",
    padding: "4px 9px",
    fontSize: 10,
    cursor: pending ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    color: "#1f2937",
  };
  const active: React.CSSProperties = { background: "#5b21b6", color: "white" };
  const isAll = !current;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
        <button type="button" disabled={pending} onClick={() => apply(null, null)} style={{ ...btn, ...(isAll ? active : {}) }}>
          전체 기간
        </button>
        <button type="button" disabled={pending} onClick={last90} style={{ ...btn }}>
          최근 90일
        </button>
      </div>
      <input
        type="date"
        value={customStart}
        onChange={(e) => setCustomStart(e.target.value)}
        style={{ fontSize: 10, padding: "3px 5px", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "inherit" }}
      />
      <span style={{ color: "#9ca3af" }}>~</span>
      <input
        type="date"
        value={customEnd}
        onChange={(e) => setCustomEnd(e.target.value)}
        style={{ fontSize: 10, padding: "3px 5px", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "inherit" }}
      />
      <button
        type="button"
        disabled={pending || (!customStart && !customEnd)}
        onClick={() => apply(customStart || null, customEnd || null)}
        style={{
          fontSize: 10,
          padding: "4px 10px",
          border: "1px solid #5b21b6",
          borderRadius: 4,
          background: "#5b21b6",
          color: "white",
          cursor: pending ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          fontWeight: 700,
          opacity: pending || (!customStart && !customEnd) ? 0.5 : 1,
        }}
      >
        {pending ? "…" : "적용"}
      </button>
      {msg && <span style={{ color: "#059669" }}>{msg}</span>}
    </div>
  );
}
