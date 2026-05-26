import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import { CompareDashboard } from "@/components/case-detail/CompareDashboard";
import {
  computeCompareFacts,
  type CompareCaseInput,
} from "@/lib/case-detail/compare-facts";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: rawIds } = await searchParams;
  const ids = (rawIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 4); // 최대 4개

  if (ids.length < 2) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
        <h1 className="page-title">케이스 비교</h1>
        <div
          style={{
            marginTop: 18,
            padding: "20px 22px",
            background: "var(--color-warn-soft)",
            border: "1px solid var(--color-warn)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--color-warn)",
          }}
        >
          최소 2개 케이스를 선택해야 비교 가능합니다.{" "}
          <Link
            href="/cases"
            style={{ textDecoration: "underline", marginLeft: 6 }}
          >
            cases 리스트로 가기
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createServer();
  const { data: rows, error } = await supabase
    .from("cases")
    .select(
      "id, country, channel, status, key_stats, brand:brands(name)",
    )
    .in("id", ids);

  if (error) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <h1 className="page-title">케이스 비교</h1>
        <p style={{ color: "var(--color-accent)" }}>
          DB 조회 실패: {error.message}
        </p>
      </div>
    );
  }

  // URL 순서대로 정렬
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const cases: CompareCaseInput[] = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id,
      brand:
        (r.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
      country: r.country,
      channel: r.channel,
      status: r.status,
      key_stats: r.key_stats as CompareCaseInput["key_stats"],
    }));

  const { mode, facts } = computeCompareFacts(cases);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1600 }}>
      <nav
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
        }}
      >
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>
          My Cases
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>Compare</span>
      </nav>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 18,
          gap: 12,
        }}
      >
        <h1 className="page-title">케이스 비교</h1>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {cases.length}개 케이스
          {cases.length !== ids.length && (
            <span style={{ color: "var(--color-warn)", marginLeft: 6 }}>
              (요청 {ids.length}개 중 {cases.length}개 매칭)
            </span>
          )}
        </span>
      </div>

      <CompareDashboard cases={cases} mode={mode} facts={facts} />
    </div>
  );
}
