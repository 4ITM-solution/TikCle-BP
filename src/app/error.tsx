"use client";

// 루트 에러 바운더리 — 이 파일이 없으면 Next.js 기본 백지
// "Application error: a client-side exception has occurred"가 그대로 노출됨.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "72px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        ⚠ 화면을 그리다 오류가 났어요
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.7, marginBottom: 14 }}>
        분석이 진행 중인 케이스는 데이터가 쓰이는 중이라 일시적으로 실패할 수 있어요.
        <br />
        다시 시도하면 대부분 해결됩니다. 반복되면 잠시 후 새로고침해 주세요.
      </div>
      {error?.digest && (
        <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 16 }}>
          digest: {error.digest}
        </div>
      )}
      <button
        type="button"
        onClick={() => reset()}
        style={{
          fontSize: 13,
          fontWeight: 700,
          padding: "9px 22px",
          border: "1px solid #1f2937",
          borderRadius: 6,
          background: "#1f2937",
          color: "white",
          cursor: "pointer",
        }}
      >
        ↻ 다시 시도
      </button>
    </div>
  );
}
