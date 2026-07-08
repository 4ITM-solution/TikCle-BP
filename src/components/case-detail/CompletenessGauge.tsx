import type { Completeness } from "@/lib/case-detail/completeness";

/**
 * ★ B1(WS4b): 완결성 게이지 헤더 — 6축 충족 + 커머스 vs 모니터링 ready 구분(QA F7).
 * status='ready' 와 독립(F1). 간이 판정(WS6 정식 SQL 나오면 교체).
 */
export function CompletenessGauge({ c }: { c: Completeness }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "10px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 700, color: "#374151" }}>
        완결성 {c.filledCount}/{c.total}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {c.axes.map((a) => (
          <span
            key={a.key}
            title={`${a.kind === "commerce" ? "커머스" : "모니터링"} 축 · ${a.filled ? "충족" : "미충족"}${a.note ? ` (${a.note})` : ""}`}
            style={{
              fontSize: 10.5, padding: "3px 8px", borderRadius: 9,
              background: a.filled ? (a.kind === "commerce" ? "#dbeafe" : "#dcfce7") : "#f3f4f6",
              color: a.filled ? (a.kind === "commerce" ? "#1e40af" : "#166534") : "#9ca3af",
              border: `1px solid ${a.filled ? (a.kind === "commerce" ? "#93c5fd" : "#86efac") : "#e5e7eb"}`,
            }}
          >
            {a.filled ? "✓" : "○"} {a.label}
          </span>
        ))}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 9,
            background: c.commerceReady ? "#dbeafe" : "#f3f4f6",
            color: c.commerceReady ? "#1e40af" : "#9ca3af",
          }}
          title="SKU·매출 데이터로 커머스 분석이 가능한 상태"
        >
          커머스 {c.commerceReady ? "ready" : "미충족"}
        </span>
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 9,
            background: c.monitoringReady ? "#dcfce7" : "#f3f4f6",
            color: c.monitoringReady ? "#166534" : "#9ca3af",
          }}
          title="콘텐츠·인플·광고 등 브랜드 모니터링이 가능한 상태"
        >
          모니터링 {c.monitoringReady ? "ready" : "미충족"}
        </span>
      </div>
    </div>
  );
}
