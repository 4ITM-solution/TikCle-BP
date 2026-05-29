/**
 * MissingDataPlaceholder — mockup에 자리 있지만 데이터 source 없거나 별도 PR 대기 중인 모듈의 dim placeholder.
 * 사용자에게 "이 자리에 뭐가 들어올 예정인지" 안내.
 */
export function MissingDataPlaceholder({
  title,
  reason,
  next,
}: {
  title: string;
  reason: string;
  next?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-g25)",
        border: "1px dashed var(--color-g300)",
        borderRadius: 8,
        padding: "18px 22px",
        marginBottom: 14,
        opacity: 0.7,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-g600)",
          marginBottom: 4,
        }}
      >
        ⏭ {title} <span style={{ fontSize: 10, color: "var(--color-g400)", fontWeight: 400 }}>(자리만 잡힘)</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-g500)", lineHeight: 1.5 }}>
        {reason}
      </div>
      {next && (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g400)",
            marginTop: 6,
            fontFamily: "var(--font-mono)",
          }}
        >
          → {next}
        </div>
      )}
    </div>
  );
}
