import type { IntakeItem } from "@/lib/case-detail/intake-checklist";

/**
 * ★ C4(WS4b): 적재 위저드 — 케이스 생성 직후(draft) 화면 상단.
 * 자동 수집 배너(메타광고) + 수동 재료 체크리스트(출처·예상 소요·적재 여부).
 * 실제 입력구는 아래 DataChannelGrid(현행). 위저드는 "무엇을 어디서 얼마나" 가이드 + 진행 표시.
 */
export function IntakeWizard({ items }: { items: IntakeItem[] }) {
  if (items.length === 0) return null;
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div style={{ marginBottom: 16 }}>
      {/* 자동 수집 배너 */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", background: "#ecfdf5", border: "1px solid #a7f3d0",
          borderRadius: 8, fontSize: 12, color: "#065f46", marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 14 }}>🟢</span>
        <span>
          <b>메타광고 자동 수집 중</b> — 사람을 기다리지 않습니다. 아래 수동 재료와 무관하게
          진행되며, 완료되면 광고 섹션이 먼저 열립니다.
        </span>
      </div>

      {/* 체크리스트 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: "#f9fafb", fontSize: 12, fontWeight: 700, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
          <span>📋 적재 위저드 — 이 케이스에 필요한 재료</span>
          <span style={{ color: doneCount === items.length ? "#059669" : "#9ca3af" }}>
            진행 {doneCount}/{items.length}
          </span>
        </div>
        {items.map((item) => (
          <div
            key={item.key}
            style={{
              display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "start",
              padding: "10px 14px", borderBottom: "1px solid #f3f4f6", fontSize: 12,
              background: item.done ? "#f0fdf4" : "white",
            }}
          >
            <span style={{ fontSize: 14 }}>{item.done ? "✅" : "⬜"}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 2 }}>{item.howTo}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>출처: {item.source}</div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              {item.done ? (
                <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>
                  ✓ {item.rowNote ?? "적재됨"}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>
                  예상 소요 ~{item.etaMinutes}분
                </span>
              )}
            </div>
          </div>
        ))}
        <div style={{ padding: "7px 14px", fontSize: 10, color: "#9ca3af", background: "#fafafa" }}>
          업로드가 늦어도 자동 수집분으로 섹션이 먼저 열립니다. 아래 채널 카드에서 재료를 올리세요 ↓
        </div>
      </div>
    </div>
  );
}
