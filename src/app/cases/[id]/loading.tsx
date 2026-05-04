/**
 * /cases/[id] 진입 시 server fetch 동안 즉시 표시되는 스켈레톤.
 * Next.js App Router의 loading.tsx 컨벤션 — page component가 await 끝낼 때까지 streaming.
 */
export default function Loading() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g400)",
          fontFamily: "var(--font-mono)",
          marginBottom: 14,
        }}
      >
        My Cases / 로딩 중...
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid var(--color-g100)",
          borderRadius: 8,
          padding: "20px 22px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <Skeleton w={180} h={24} />
          <Skeleton w={60} h={20} />
          <Skeleton w={60} h={20} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <Skeleton w={50} h={18} />
          <Skeleton w={70} h={18} />
          <Skeleton w={70} h={18} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 180px",
          gap: 24,
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton h={70} />
          <Skeleton h={120} />
          <Skeleton h={200} />
          <Skeleton h={300} />
        </div>
        <div style={{ paddingLeft: 14, borderLeft: "1px solid var(--color-g100)" }}>
          <Skeleton w={120} h={14} />
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} h={20} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ w, h }: { w?: number | string; h?: number }) {
  return (
    <div
      style={{
        width: w ?? "100%",
        height: h ?? 16,
        borderRadius: 4,
        background:
          "linear-gradient(90deg, var(--color-g50) 0%, var(--color-g100) 50%, var(--color-g50) 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s infinite ease-in-out",
      }}
    />
  );
}
