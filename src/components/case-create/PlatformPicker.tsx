"use client";

import { useState } from "react";

const platforms = [
  {
    value: "amazon",
    name: "Amazon",
    icon: "A",
    desc: "판매 + BSR + exolyt 콘텐츠",
  },
  {
    value: "tiktok_shop",
    name: "TikTok Shop",
    icon: "T",
    desc: "Shop 스토어 URL + exolyt 콘텐츠",
  },
  {
    value: "shopee",
    name: "Shopee",
    icon: "S",
    desc: "Shopdora 매출 (SEA) + exolyt 콘텐츠",
  },
] as const;

export type PlatformValue = (typeof platforms)[number]["value"];

export function PlatformPicker({
  name,
  defaultValue,
  onChange,
}: {
  name: string;
  defaultValue?: PlatformValue;
  onChange?: (v: PlatformValue) => void;
}) {
  const [selected, setSelected] = useState<PlatformValue>(
    defaultValue ?? "amazon",
  );

  function pick(v: PlatformValue) {
    setSelected(v);
    onChange?.(v);
  }

  return (
    <>
      <input type="hidden" name={name} value={selected} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {platforms.map((p) => {
          const on = selected === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => pick(p.value)}
              style={{
                border: `1.5px solid ${on ? "var(--color-ink)" : "var(--color-g200)"}`,
                background: on ? "var(--color-g25)" : "white",
                borderRadius: 8,
                padding: "16px 18px",
                cursor: "pointer",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: on ? "var(--color-ink)" : "var(--color-g100)",
                  color: on ? "white" : "var(--color-g500)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {p.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-g500)",
                    marginTop: 2,
                  }}
                >
                  {p.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
