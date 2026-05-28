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

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        background: "var(--color-bg-soft, #f9fafb)",
        border: "1px solid var(--color-border, #e5e7eb)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--color-text-muted, #6b7280)" }}>
        IG/YT 풀 스코프:
      </span>
      <div style={{ display: "inline-flex", gap: 4 }}>
        <button
          type="button"
          onClick={() => handleChange("global")}
          disabled={pending}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border:
              currentScope === "global"
                ? "1px solid var(--color-primary, #3b82f6)"
                : "1px solid var(--color-border, #d1d5db)",
            background:
              currentScope === "global"
                ? "var(--color-primary, #3b82f6)"
                : "transparent",
            color: currentScope === "global" ? "#fff" : "inherit",
            fontSize: 11,
            fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          🌍 글로벌
        </button>
        <button
          type="button"
          onClick={() => handleChange("us-only")}
          disabled={pending}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border:
              currentScope === "us-only"
                ? "1px solid var(--color-primary, #3b82f6)"
                : "1px solid var(--color-border, #d1d5db)",
            background:
              currentScope === "us-only"
                ? "var(--color-primary, #3b82f6)"
                : "transparent",
            color: currentScope === "us-only" ? "#fff" : "inherit",
            fontSize: 11,
            fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          🇺🇸 US-only
        </button>
      </div>
      {msg && (
        <span style={{ fontSize: 11, color: "var(--color-success, #059669)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
