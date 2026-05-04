import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import {
  CasesListWithCompare,
  type CaseListItem,
} from "@/components/case-detail/CasesListWithCompare";

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

  const list: CaseListItem[] = (cases ?? []).map((c) => ({
    id: c.id,
    brand:
      (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
    country: c.country,
    channel: c.channel,
    status: c.status,
    updated_at: c.updated_at,
  }));

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
            전체 {list.length}개 케이스 · 최근 업데이트순 · 체크박스로 최대 4개까지 비교 가능
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
        <CasesListWithCompare cases={list} />
      )}
    </div>
  );
}
