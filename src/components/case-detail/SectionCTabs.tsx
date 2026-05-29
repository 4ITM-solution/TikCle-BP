"use client";

import { useState, type ReactNode } from "react";

/**
 * SectionCTabs — Section C 콘텐츠 포맷 sub-tabs.
 *
 * mockup 형태:
 *   - 통합 클러스터 (TK + IG + YT)
 *   - USP 키워드 (인터랙티브)
 *   - 시즈널리티 heatmap (measure dropdown)
 *   - paid/seeded/organic 분류
 *
 * 각 패널은 children으로 받음. tab 클릭 시 해당 패널만 노출.
 */
export type SubTab = {
  id: string;
  label: string;
  content: ReactNode | null; // null이면 disabled (데이터 없음)
};

export function SectionCTabs({ tabs }: { tabs: SubTab[] }) {
  const firstActive = tabs.find((t) => t.content !== null)?.id ?? tabs[0]!.id;
  const [active, setActive] = useState<string>(firstActive);
  const cur = tabs.find((t) => t.id === active);

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--color-g100)",
          marginBottom: 14,
        }}
      >
        {tabs.map((t) => {
          const disabled = t.content === null;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => setActive(t.id)}
              style={{
                border: "none",
                background: "transparent",
                padding: "8px 14px",
                fontSize: 12,
                cursor: disabled ? "not-allowed" : "pointer",
                color: isActive
                  ? "var(--color-ink)"
                  : disabled
                    ? "var(--color-g300)"
                    : "var(--color-g500)",
                fontWeight: isActive ? 700 : 400,
                borderBottom: `2px solid ${isActive ? "var(--color-ink)" : "transparent"}`,
                marginBottom: -1,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>{cur?.content ?? null}</div>
    </div>
  );
}
