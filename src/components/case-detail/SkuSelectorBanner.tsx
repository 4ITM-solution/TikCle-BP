"use client";

import type { SkuSalesEntry } from "@/lib/inngest/types";

/**
 * SkuSelectorBanner — controlled — Section D 위 SKU 통합 selector.
 * MiniDashboard가 selectedSku state 보유. 모든 D 안 모듈이 같은 state 공유 → 선택 시 highlight.
 */
export function SkuSelectorBanner({
  skus,
  selected,
  onChange,
}: {
  skus: SkuSalesEntry[];
  selected: string;
  onChange: (sku: string) => void;
}) {
  if (skus.length === 0) return null;

  const sorted = [...skus].sort((a, b) => b.revenue - a.revenue);
  const top = sorted.slice(0, 8);
  const totalRev = sorted.reduce((s, x) => s + x.revenue, 0);
  const totalUnits = sorted.reduce((s, x) => s + x.units, 0);

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
        ? `$${Math.round(v / 1000)}K`
        : `$${Math.round(v)}`;

  const info = (() => {
    if (selected === "all") {
      return `현재 선택: <b>전체 ${sorted.length} SKU</b> · 30일 GMV ${fmt(totalRev)} · ${totalUnits.toLocaleString()} 단위 판매`;
    }
    const s = sorted.find((x) => x.asin === selected);
    if (!s) return "";
    return `현재 선택: <b>${s.name?.slice(0, 30) ?? "-"}</b> · 30일 GMV ${fmt(s.revenue)} · ${s.units.toLocaleString()} 단위 · <span style="color:#dc2626;">↓ 아래 모듈 highlight는 Phase 5+에서 통합 예정</span>`;
  })();

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 8px",
    fontSize: 10,
    border: `1px solid ${active ? "var(--color-warn)" : "var(--color-warn-soft)"}`,
    background: active ? "var(--color-ink)" : "white",
    color: active ? "white" : "var(--color-warn)",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
  });

  return (
    <div
      style={{
        background:
          "linear-gradient(90deg, var(--color-warn-soft) 0%, #fde68a 100%)",
        border: "1.5px solid var(--color-warn)",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--color-warn)",
            fontWeight: 700,
          }}
        >
          🎯 SKU 필터:
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--color-warn)",
            opacity: 0.85,
          }}
        >
          선택한 SKU 기준으로 아래 모듈 강조 (Phase 5+에서 통합)
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${top.length + 1}, 1fr)`,
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={() => onChange("all")}
          style={btnStyle(selected === "all")}
        >
          전체 ({sorted.length} SKU)
        </button>
        {top.map((s) => (
          <button
            key={s.asin}
            type="button"
            onClick={() => onChange(s.asin)}
            style={btnStyle(selected === s.asin)}
            title={`${s.name ?? ""} · ${fmt(s.revenue)}`}
          >
            {(s.name ?? "?").slice(0, 14)}
            {s.name && s.name.length > 14 ? "…" : ""}
          </button>
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-warn)",
          marginTop: 6,
          fontWeight: 600,
        }}
        dangerouslySetInnerHTML={{ __html: info }}
      />
    </div>
  );
}
