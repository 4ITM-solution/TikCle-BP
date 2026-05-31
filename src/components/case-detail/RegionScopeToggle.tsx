"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRegionScope } from "@/app/cases/[id]/region-scope-actions";
import type { RegionScope } from "@/lib/case-detail/region-filter";

/**
 * Region scope 토글 — case 헤더 또는 IG/YT 섹션 위에.
 *
 * "global" (default) — 글로벌 풀 다 표시
 * "us-only" — non-Latin caption / non-US country suffix owner 제외 (휴리스틱)
 */
export function RegionScopeToggle({
  case_id,
  currentScope,
}: {
  case_id: string;
  currentScope: RegionScope;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleChange(scope: RegionScope) {
    if (scope === currentScope) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await updateRegionScope(case_id, scope);
        if (r.ok) {
          setMsg(`${scope === "us-only" ? "US-only" : "글로벌"} 모드로 변경됨`);
          router.refresh();
        } else {
          setMsg(`오류: ${r.error}`);
        }
      } catch (e) {
        setMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // mockup line 523-527 `.region-toggle` — inline compact dark-active button group
  const btnBase: React.CSSProperties = {
    background: "white",
    border: "none",
    padding: "5px 9px",
    fontSize: 10,
    cursor: pending ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    color: "#1f2937",
  };
  const btnActive: React.CSSProperties = { background: "#1f2937", color: "white" };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 10,
      }}
      title="IG/YT 풀 region scope"
    >
      <div
        className="region-toggle"
        style={{
          display: "inline-flex",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => handleChange("global")}
          disabled={pending}
          style={{ ...btnBase, ...(currentScope === "global" ? btnActive : {}) }}
        >
          🌍 글로벌
        </button>
        <button
          type="button"
          onClick={() => handleChange("us-only")}
          disabled={pending}
          style={{ ...btnBase, ...(currentScope === "us-only" ? btnActive : {}) }}
        >
          🇺🇸 US-only
        </button>
      </div>
      {msg && (
        <span style={{ color: "#059669", fontSize: 10 }}>{msg}</span>
      )}
    </div>
  );
}
