"use client";

import { useActionState } from "react";
import { PRICING_TIERS, type SeedingPricing } from "@/lib/diagnose/pricing";
import { saveSeedingPricing, type SaveResult } from "./actions";

export function SeedingPricingForm({ initial }: { initial: SeedingPricing }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(
    saveSeedingPricing,
    null,
  );

  return (
    <form action={action}>
      <div
        style={{
          background: "white",
          border: "1px solid var(--color-g100)",
          borderRadius: 8,
          padding: "18px 20px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 220px",
            gap: 12,
            alignItems: "center",
            paddingBottom: 8,
            borderBottom: "1px solid var(--color-g100)",
            marginBottom: 6,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-g400)",
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          <div>티어</div>
          <div>팔로워 가이드</div>
          <div>콘텐츠 1건당 단가 (원)</div>
        </div>

        {PRICING_TIERS.map(({ tier, label, hint }) => (
          <div
            key={tier}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 220px",
              gap: 12,
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-g50)",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700 }}>{label}</div>
            <div style={{ color: "var(--color-g400)", fontSize: 12 }}>{hint}</div>
            <input
              name={tier}
              defaultValue={initial.tierCost[tier]?.toLocaleString() ?? ""}
              inputMode="numeric"
              style={{
                padding: "8px 11px",
                border: "1px solid var(--color-g200)",
                borderRadius: 7,
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                textAlign: "right",
              }}
            />
          </div>
        ))}

        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: "#ec4899",
              color: "white",
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            {pending ? "저장 중…" : "단가 저장"}
          </button>
          {state?.ok === true && (
            <span style={{ fontSize: 12.5, color: "var(--color-pos)" }}>
              ✓ {state.message}
            </span>
          )}
          {state?.ok === false && (
            <span style={{ fontSize: 12.5, color: "var(--color-accent)" }}>
              {state.error}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
