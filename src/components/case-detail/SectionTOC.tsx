"use client";

import { useEffect, useState } from "react";

type Item = { id: string; letter: string; label: string };

/**
 * Case detail 우측 sticky TOC.
 * Section ID는 MiniDashboard SectionHeader가 박는 `section-{letter}`.
 * 어떤 섹션 데이터가 비어있으면 그 항목은 생략 (scrollIntoView 깨짐 방지).
 */
export function SectionTOC({
  items,
}: {
  items: Item[];
}) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(e.target.id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <aside style={{ width: "100%" }}>
      <div
        style={{
          position: "sticky",
          top: 16,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          padding: "12px 0",
          borderLeft: "1px solid var(--color-g100)",
          paddingLeft: 14,
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-g400)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 10,
          }}
        >
          섹션 이동
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((it) => {
            const isActive = active === it.id;
            return (
              <a
                key={it.id}
                href={`#${it.id}`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "5px 8px",
                  borderRadius: 4,
                  background: isActive ? "var(--color-g50)" : "transparent",
                  color: isActive
                    ? "var(--color-ink)"
                    : "var(--color-g500)",
                  fontWeight: isActive ? 700 : 500,
                  textDecoration: "none",
                  transition: "background 80ms",
                }}
              >
                <span
                  style={{
                    width: 12,
                    color: isActive
                      ? "var(--color-accent)"
                      : "var(--color-g400)",
                    fontWeight: 700,
                  }}
                >
                  {it.letter}
                </span>
                {it.label}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
