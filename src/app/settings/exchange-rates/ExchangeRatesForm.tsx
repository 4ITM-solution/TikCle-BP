"use client";

import { useActionState } from "react";
import {
  saveExchangeRates,
  type SaveResult,
} from "./actions";
import type { ExchangeRates } from "@/lib/case-detail/exchange-rates";

export function ExchangeRatesForm({
  currencies,
  initial,
}: {
  currencies: { code: string; label: string }[];
  initial: ExchangeRates;
}) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(
    saveExchangeRates,
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
            gridTemplateColumns: "100px 1fr 180px 160px",
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
          <div>코드</div>
          <div>통화</div>
          <div>1 unit = X USD</div>
          <div>= 1 USD 당</div>
        </div>

        {currencies.map((c) => {
          const v = initial[c.code];
          const reverse = v && v > 0 ? Math.round(1 / v) : null;
          return (
            <div
              key={c.code}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 180px 160px",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid var(--color-g50)",
                fontSize: 13,
              }}
            >
              <div
                className="font-mono"
                style={{ fontWeight: 700 }}
              >
                {c.code}
              </div>
              <div style={{ color: "var(--color-g500)" }}>{c.label}</div>
              <input
                name={c.code}
                type="number"
                step="any"
                defaultValue={v ?? ""}
                placeholder="0.000"
                style={{
                  padding: "6px 10px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  width: "100%",
                }}
                required
              />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-g500)",
                  fontSize: 12,
                }}
              >
                {reverse != null
                  ? `${reverse.toLocaleString()} ${c.code}`
                  : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-accent"
        >
          {pending ? "저장 중..." : "환율 저장"}
        </button>
        {state?.ok === true && (
          <span
            style={{
              marginLeft: 14,
              fontSize: 12,
              color: "var(--color-pos)",
            }}
          >
            ✓ {state.message}
          </span>
        )}
        {state?.ok === false && (
          <span
            style={{
              marginLeft: 14,
              fontSize: 12,
              color: "var(--color-accent)",
            }}
          >
            ✗ {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
