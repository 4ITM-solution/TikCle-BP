import Link from "next/link";
import { createServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const supabase = await createServer();

  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, country, channel, status, created_at, updated_at, brand:brands(name)",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <h1 className="page-title">My Cases</h1>
        <p style={{ color: "var(--color-accent)" }}>
          DB 조회 실패: {error.message}
        </p>
      </div>
    );
  }

  const list = cases ?? [];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 className="page-title">My Cases</h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-g500)",
            }}
          >
            전체 {list.length}개 케이스 · 최근 업데이트순
          </p>
        </div>
        <Link
          href="/cases/new"
          className="btn btn-accent"
          style={{ marginLeft: "auto" }}
        >
          + 새 케이스 만들기
        </Link>
      </div>

      {list.length === 0 ? (
        <div
          style={{
            background: "white",
            border: "1px solid var(--color-g100)",
            borderRadius: 8,
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            아직 케이스가 없어요
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-g400)",
              marginBottom: 18,
            }}
          >
            첫 케이스를 만들어 분석을 시작합니다.
          </p>
          <Link href="/cases/new" className="btn btn-accent">
            + 새 케이스 만들기
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "white",
            border: "1px solid var(--color-g100)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {list.map((c) => {
            const brand = (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)";
            return (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--color-g100)",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{brand}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-g400)",
                      fontFamily: "var(--font-mono)",
                      marginTop: 2,
                    }}
                  >
                    {new Date(c.updated_at).toLocaleString("ko-KR")}
                  </div>
                </div>
                <span className="case-tag country">{c.country}</span>
                <span className="case-tag platform">{c.channel.toUpperCase()}</span>
                <span className={`status-pill ${c.status}`}>{c.status}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
