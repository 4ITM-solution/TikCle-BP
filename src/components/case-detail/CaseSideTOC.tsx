"use client";

import { useEffect, useState } from "react";

/**
 * CaseSideTOC — 좌측 sticky 목차.
 *
 * 긴 case detail 페이지에서 빠른 섹션 점프용.
 * scroll 시 현재 보이는 섹션 자동 highlight.
 */
type TocItem = {
  id: string;
  label: string;
  group?: string;
};

const ITEMS: readonly TocItem[] = [
  { id: "sec-header", label: "📋 케이스 메타", group: "TOP" },
  { id: "sec-kpi", label: "📊 KPI 요약" },
  { id: "sec-channels", label: "📥 데이터 채널" },
  { id: "sec-g", label: "🎯 종합 인사이트" },
  { id: "section-a", label: "A. 콘텐츠 활동", group: "분석" },
  { id: "section-b", label: "B. 인플루언서 풀" },
  { id: "section-c", label: "C. 콘텐츠 포맷" },
  { id: "section-d", label: "D. 매출 & BSR" },
  { id: "section-e", label: "E. Meta 광고" },
  { id: "sec-dev", label: "⚙️ DEV 액션", group: "DEV" },
] as const;

const FIRST_ID = ITEMS[0]!.id;

export function CaseSideTOC() {
  const [active, setActive] = useState<string>(FIRST_ID);

  useEffect(() => {
    function onScroll() {
      const headerOffset = 120;
      let current = FIRST_ID;
      for (const item of ITEMS) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= headerOffset) {
          current = item.id;
        }
      }
      setActive(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="case-side-toc"
      style={{
        position: "fixed",
        top: 100,
        left: "max(12px, calc((100vw - 1280px) / 2 - 180px))",
        width: 160,
        fontSize: 11,
        padding: 0,
        zIndex: 30,
      }}
    >
      {ITEMS.map((item, i) => {
        const prevGroup = i > 0 ? ITEMS[i - 1]!.group : undefined;
        const showGroupHeader = item.group && item.group !== prevGroup;
        return (
          <div key={item.id}>
            {showGroupHeader && (
              <div
                style={{
                  fontSize: 9,
                  color: "var(--color-g400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "10px 8px 4px",
                }}
              >
                {item.group}
              </div>
            )}
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(item.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                setActive(item.id);
              }}
              style={{
                display: "block",
                padding: "5px 8px",
                color:
                  active === item.id
                    ? "var(--color-ink)"
                    : "var(--color-g500)",
                fontWeight: active === item.id ? 700 : 400,
                borderLeft: `2px solid ${active === item.id ? "var(--color-ink)" : "transparent"}`,
                background:
                  active === item.id ? "var(--color-g25)" : "transparent",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              {item.label}
            </a>
          </div>
        );
      })}
    </nav>
  );
}
