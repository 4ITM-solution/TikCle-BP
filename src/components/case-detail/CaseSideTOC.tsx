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
    <div className="bp-mockup">
      <nav className="toc" style={{ position: "sticky", top: 90, alignSelf: "start" }}>
        {ITEMS.map((item, i) => {
          const prevGroup = i > 0 ? ITEMS[i - 1]!.group : undefined;
          const showGroupHeader = item.group && item.group !== prevGroup;
          return (
            <div key={item.id}>
              {showGroupHeader && <div className="toc-h">{item.group}</div>}
              <a
                href={`#${item.id}`}
                className={active === item.id ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(item.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActive(item.id);
                }}
              >
                {item.label}
              </a>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
