"use client";

import { useActionState } from "react";
import { PRODUCT_TYPES, type ProductPricing } from "@/lib/diagnose/pricing";
import { saveProductPricing, type SaveResult } from "./actions";

export function ProductPricingForm({ initial }: { initial: ProductPricing }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(
    saveProductPricing,
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
            gridTemplateColumns: "140px 1fr 220px",
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
          <div>상품 유형</div>
          <div>설명</div>
          <div>단위당 단가 (원)</div>
        </div>

        {PRODUCT_TYPES.map(({ key, label, unit, hint }) => (
          <div
            key={key}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 220px",
              gap: 12,
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-g50)",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {label} <span style={{ color: "var(--color-g400)", fontWeight: 500, fontSize: 11 }}>/{unit}</span>
            </div>
            <div style={{ color: "var(--color-g400)", fontSize: 12 }}>{hint}</div>
            <input
              name={key}
              defaultValue={initial[key]?.toLocaleString() ?? ""}
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
            {pending ? "저장 중…" : "상품 단가 저장"}
          </button>
          {state?.ok === true && (
            <span style={{ fontSize: 12.5, color: "var(--color-pos)" }}>✓ {state.message}</span>
          )}
          {state?.ok === false && (
            <span style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{state.error}</span>
          )}
        </div>
      </div>
    </form>
  );
}
