"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { REVENUE_TIERS } from "@/lib/case-detail/revenue-tiers";
import { updateRevenueTier } from "@/app/cases/[id]/case-actions";

export function RevenueTierPicker({
  case_id,
  current,
}: {
  case_id: string;
  current: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(value: string | null) {
    setError(null);
    start(async () => {
      const r = await updateRevenueTier(case_id, value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  const currentLabel = current
    ? REVENUE_TIERS.find((t) => t.value === current)?.label ?? current
    : null;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="매출 티어 태그 — Browse 페이지 필터 키"
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 9px",
          borderRadius: 9,
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          background: current
            ? "var(--color-info-soft)"
            : "var(--color-g50)",
          color: current ? "var(--color-info)" : "var(--color-g500)",
          border: "1px dashed transparent",
        }}
      >
        {currentLabel ?? "+ 매출 티어"}
      </button>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 4px",
        background: "var(--color-g25)",
        border: "1px solid var(--color-g200)",
        borderRadius: 6,
      }}
    >
      {REVENUE_TIERS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => pick(t.value)}
          disabled={pending}
          style={{
            fontSize: 11,
            padding: "3px 7px",
            borderRadius: 9,
            fontFamily: "var(--font-mono)",
            cursor: pending ? "wait" : "pointer",
            background:
              current === t.value
                ? "var(--color-info)"
                : "transparent",
            color:
              current === t.value ? "white" : "var(--color-g600)",
            border: "none",
            fontWeight: current === t.value ? 700 : 500,
          }}
        >
          {t.label}
        </button>
      ))}
      {current && (
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={pending}
          title="태그 제거"
          style={{
            fontSize: 11,
            padding: "3px 7px",
            color: "var(--color-accent)",
            background: "transparent",
            border: "none",
            cursor: pending ? "wait" : "pointer",
          }}
        >
          ×
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={pending}
        style={{
          fontSize: 10,
          padding: "3px 6px",
          color: "var(--color-g400)",
          background: "transparent",
          border: "none",
          cursor: pending ? "wait" : "pointer",
        }}
      >
        취소
      </button>
      {error && (
        <span style={{ fontSize: 10, color: "var(--color-accent)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
