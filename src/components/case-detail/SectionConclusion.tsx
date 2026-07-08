/**
 * ★ C1(WS4b): 섹션 상단 1줄 결론.
 * 서버에서 데이터로 조립한 한 문장(템플릿+수치, LLM 아님). 결론 못 만들면 회색 "데이터 없음".
 * add-only — 각 섹션 최상단에 얇게 삽입.
 */
export function SectionConclusion({ text }: { text: string | null }) {
  if (!text) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "#9ca3af",
          padding: "7px 12px",
          margin: "0 0 8px",
          background: "#f9fafb",
          borderRadius: 6,
          border: "1px solid #f3f4f6",
        }}
      >
        데이터 없음 — 이 섹션의 결론을 만들 근거가 아직 부족합니다.
      </div>
    );
  }
  return (
    <div
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: "#1f2937",
        padding: "8px 12px",
        margin: "0 0 8px",
        background: "#eff6ff",
        borderRadius: 6,
        borderLeft: "3px solid #3b82f6",
      }}
    >
      💡 {text}
    </div>
  );
}
