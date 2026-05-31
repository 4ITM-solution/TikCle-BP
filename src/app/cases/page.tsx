import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import {
  CasesListWithCompare,
  type CaseListItem,
} from "@/components/case-detail/CasesListWithCompare";
import { BrowseFilters } from "@/components/case-detail/BrowseFilters";

export const dynamic = "force-dynamic";

type Search = Promise<{
  region?: string;
  tier?: string;
  q?: string;
}>;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const selectedRegion = (sp.region ?? "").trim();
  const selectedTier = (sp.tier ?? "").trim();
  const selectedQ = (sp.q ?? "").trim().toLowerCase();

  const supabase = await createServer();

  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, brand_id, country, channel, status, revenue_tier, created_at, updated_at, brand:brands(name)",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <h1 className="page-title">Browse</h1>
        <p style={{ color: "var(--color-accent)" }}>
          DB 조회 실패: {error.message}
        </p>
      </div>
    );
  }

  const allCases = cases ?? [];

  // 필터 — country/tier 정확 매칭 + brand 명 부분 일치 (A 모델: channel 의미 없음)
  const filtered = allCases.filter((c) => {
    if (selectedRegion && c.country !== selectedRegion) return false;
    if (selectedTier && c.revenue_tier !== selectedTier) return false;
    if (selectedQ) {
      const brandName = (c.brand as unknown as { name: string } | null)?.name ?? "";
      if (!brandName.toLowerCase().includes(selectedQ)) return false;
    }
    return true;
  });

  const list: CaseListItem[] = filtered.map((c) => ({
    id: c.id,
    brand:
      (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
    brand_id: c.brand_id ?? null,
    country: c.country,
    channel: c.channel,
    status: c.status,
    revenue_tier: c.revenue_tier,
    updated_at: c.updated_at,
  }));

  const hasAnyFilter = !!(selectedRegion || selectedTier || selectedQ);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 className="page-title">Browse</h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-g500)",
            }}
          >
            brand 명 검색 · 국가 · 티어 필터. 체크박스 최대 4개 비교.
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

      <BrowseFilters
        selectedRegion={selectedRegion}
        selectedTier={selectedTier}
        selectedQ={selectedQ}
      />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 16,
          marginBottom: 10,
          fontSize: 12,
          color: "var(--color-g500)",
        }}
      >
        <span>
          <b style={{ color: "var(--color-ink)" }}>{filtered.length}</b>개 케이스
          {hasAnyFilter && (
            <span style={{ color: "var(--color-g400)" }}>
              {" "}/ 전체 {allCases.length}
            </span>
          )}
        </span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          최근 업데이트순
        </span>
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
            {hasAnyFilter
              ? "필터 조건에 맞는 케이스 없음"
              : "아직 케이스가 없어요"}
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-g400)",
              marginBottom: 18,
            }}
          >
            {hasAnyFilter
              ? "필터를 풀거나 새 케이스를 만들어 보세요."
              : "첫 케이스를 만들어 분석을 시작합니다."}
          </p>
          {!hasAnyFilter && (
            <Link href="/cases/new" className="btn btn-accent">
              + 새 케이스 만들기
            </Link>
          )}
        </div>
      ) : (
        <CasesListWithCompare cases={list} />
      )}
    </div>
  );
}
