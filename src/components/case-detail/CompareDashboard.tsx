"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type CompareCaseInput,
  type CompareFact,
  type CompareModeInfo,
  type FactValue,
} from "@/lib/case-detail/compare-facts";
import { CompareGrid, type CompareCase } from "./CompareGrid";

const CASE_COLORS = [
  "var(--color-info)",
  "var(--color-warn)",
  "var(--color-pos)",
  "var(--color-accent)",
] as const;

/**
 * 케이스 비교 대시보드 — rule-based 시각화.
 *
 * 1) 헤더 카드 — 각 케이스 브랜드/국가/채널 + 색상 박힘
 * 2) Mode 박스 — 자동 감지 (시장/브랜드/채널/혼합)
 * 3) Fact 카드 grid — 10개 시그널, 각 카드에 headline + 케이스별 값 + 막대
 * 4) 디테일 표 — 기존 CompareGrid (접힘)
 */
export function CompareDashboard({
  cases,
  mode,
  facts,
}: {
  cases: CompareCaseInput[];
  mode: CompareModeInfo;
  facts: CompareFact[];
}) {
  const [showDetail, setShowDetail] = useState(false);

  // 케이스 ID → 색상 / 인덱스 매핑
  const caseIdx = new Map(cases.map((c, i) => [c.id, i]));
  const caseColor = (caseId: string): string =>
    CASE_COLORS[(caseIdx.get(caseId) ?? 0) % CASE_COLORS.length] ??
    "var(--color-info)";
  const caseLabel = (caseId: string) => {
    const c = cases.find((x) => x.id === caseId);
    return c ? `${c.brand} ${c.country}` : caseId.slice(0, 8);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 헤더 카드 — 각 케이스 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cases.length}, 1fr)`,
          gap: 10,
        }}
      >
        {cases.map((c, i) => (
          <Link
            key={c.id}
            href={`/cases/${c.id}`}
            style={{
              display: "block",
              padding: "12px 14px",
              background: "white",
              borderLeft: `4px solid ${CASE_COLORS[i % CASE_COLORS.length]}`,
              borderRadius: 6,
              border: "1px solid var(--color-g100)",
              borderLeftWidth: 4,
              borderLeftColor: CASE_COLORS[i % CASE_COLORS.length],
              textDecoration: "none",
              color: "var(--color-ink)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {c.brand} ↗
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-g500)",
                fontFamily: "var(--font-mono)",
                marginTop: 4,
              }}
            >
              {c.country} · {c.channel.toUpperCase()} ·{" "}
              <span
                style={{
                  color:
                    c.status === "ready"
                      ? "var(--color-pos)"
                      : c.status === "running"
                        ? "var(--color-warn)"
                        : "var(--color-g500)",
                }}
              >
                {c.status}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Mode 박스 */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--color-info-soft, rgba(0,100,255,0.05))",
          border: "1px solid var(--color-info)",
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: "var(--color-info)",
            marginRight: 8,
          }}
        >
          🔍 {mode.label}
        </span>
        <span
          style={{
            color: "var(--color-g600)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {mode.description}
        </span>
      </div>

      {/* Fact 카드 grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 12,
        }}
      >
        {facts.map((f) => (
          <FactCard
            key={f.id}
            fact={f}
            cases={cases}
            caseColor={caseColor}
            caseLabel={caseLabel}
          />
        ))}
      </div>

      {/* 디테일 표 (접힘) */}
      <div
        style={{
          marginTop: 6,
          background: "white",
          borderRadius: 6,
          border: "1px solid var(--color-g100)",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "var(--color-g25)",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 12,
            color: "var(--color-g600)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>📋 전체 디테일 표 (17개 메트릭)</span>
          <span style={{ fontSize: 14 }}>{showDetail ? "▲" : "▼"}</span>
        </button>
        {showDetail && (
          <div style={{ padding: 12 }}>
            <CompareGrid
              cases={cases.map<CompareCase>((c) => ({
                id: c.id,
                brand: c.brand,
                country: c.country,
                channel: c.channel,
                status: c.status,
                key_stats: c.key_stats as Record<string, unknown> | null,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Fact 카드
function FactCard({
  fact,
  cases,
  caseColor,
  caseLabel,
}: {
  fact: CompareFact;
  cases: CompareCaseInput[];
  caseColor: (id: string) => string;
  caseLabel: (id: string) => string;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 6,
        border: "1px solid var(--color-g100)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* 카테고리 라벨 */}
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g400)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {fact.category}
      </div>
      {/* 타이틀 */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-ink)",
        }}
      >
        {fact.title}
      </div>
      {/* Headline */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g600)",
          background: "var(--color-g25)",
          padding: "6px 9px",
          borderRadius: 4,
          lineHeight: 1.5,
        }}
      >
        {fact.headline}
      </div>

      {/* 케이스별 값 + 막대 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {fact.values.map((v) => (
          <FactValueRow
            key={v.caseId}
            value={v}
            color={caseColor(v.caseId)}
            label={caseLabel(v.caseId)}
            visual={fact.visual}
          />
        ))}
      </div>
    </div>
  );
}

function FactValueRow({
  value,
  color,
  label,
  visual,
}: {
  value: FactValue;
  color: string;
  label: string;
  visual?: CompareFact["visual"];
}) {
  const showBar = visual === "bar" && (value.barRatio ?? 0) > 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "var(--color-g600)",
            minWidth: 90,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: color,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          {label}
        </span>
        <span
          style={{
            color:
              value.tone === "pos"
                ? "var(--color-pos)"
                : value.tone === "warn"
                  ? "var(--color-warn)"
                  : value.tone === "accent"
                    ? "var(--color-accent)"
                    : value.tone === "info"
                      ? "var(--color-info)"
                      : "var(--color-ink)",
            fontWeight: value.tone ? 700 : 600,
            textAlign: "right",
            flex: 1,
          }}
        >
          {value.display}
        </span>
      </div>
      {showBar && (
        <div
          style={{
            marginTop: 3,
            marginLeft: 14,
            height: 4,
            background: "var(--color-g100)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(value.barRatio ?? 0) * 100}%`,
              height: "100%",
              background: color,
              opacity: 0.7,
            }}
          />
        </div>
      )}
    </div>
  );
}
