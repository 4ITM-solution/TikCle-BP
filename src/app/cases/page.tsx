import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import {
  CasesListWithCompare,
  type CaseListItem,
} from "@/components/case-detail/CasesListWithCompare";
import { BrowseFilters } from "@/components/case-detail/BrowseFilters";
import {
  REGION_LABEL,
  countryOption,
  regionOf,
  type Region,
} from "@/lib/case-detail/countries";
import {
  REVENUE_TIERS,
  type RevenueTier,
} from "@/lib/case-detail/revenue-tiers";

export const dynamic = "force-dynamic";

type Search = Promise<{
  region?: string;
  channel?: string;
  tier?: string;
  q?: string;
}>;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const selectedRegions = (sp.region ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selectedChannels = (sp.channel ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selectedTiers = (sp.tier ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const supabase = await createServer();

  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, country, channel, status, revenue_tier, created_at, updated_at, brand:brands(name)",
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

  // 권역 / 채널 / 티어별 count (chip에 숫자 표시용)
  const regionCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  const tierCounts = new Map<string, number>();
  for (const c of allCases) {
    const region = regionOf(c.country) ?? null;
    if (region) {
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }
    channelCounts.set(c.channel, (channelCounts.get(c.channel) ?? 0) + 1);
    if (c.revenue_tier) {
      tierCounts.set(c.revenue_tier, (tierCounts.get(c.revenue_tier) ?? 0) + 1);
    }
  }

  // 필터링
  const filtered = allCases.filter((c) => {
    if (selectedRegions.length > 0) {
      const region = regionOf(c.country);
      if (!region || !selectedRegions.includes(region)) return false;
    }
    if (
      selectedChannels.length > 0 &&
      !selectedChannels.includes(c.channel)
    ) {
      return false;
    }
    if (selectedTiers.length > 0) {
      if (!c.revenue_tier || !selectedTiers.includes(c.revenue_tier)) {
        return false;
      }
    }
    return true;
  });

  const list: CaseListItem[] = filtered.map((c) => ({
    id: c.id,
    brand:
      (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
    country: c.country,
    channel: c.channel,
    status: c.status,
    revenue_tier: c.revenue_tier,
    updated_at: c.updated_at,
  }));

  const allRegions = Array.from(regionCounts.entries())
    .filter(([r]) => r !== "AMERICAS" && r !== "APAC_KR" && r !== "APAC_JP" && r !== "EU"
      ? true
      : true) // 모든 region 노출
    .sort((a, b) => b[1] - a[1])
    .map(([r, count]) => ({
      value: r,
      label: REGION_LABEL[r as Region] ?? r,
      count,
    }));

  const allChannels = Array.from(channelCounts.entries()).map(
    ([ch, count]) => ({
      value: ch,
      label: ch === "amazon" ? "Amazon" : ch === "tiktok_shop" ? "TikTok Shop" : ch,
      count,
    }),
  );

  const allTiers = REVENUE_TIERS.map((t) => ({
    value: t.value,
    label: t.label,
    count: tierCounts.get(t.value) ?? 0,
  }));

  const hasAnyFilter =
    selectedRegions.length > 0 ||
    selectedChannels.length > 0 ||
    selectedTiers.length > 0;

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
          <h1 className="page-title">Browse · BP 레퍼런스 케이스</h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-g500)",
            }}
          >
            권역 · 판매 플랫폼 · 매출 티어로 필터링. 체크박스로 최대 4개까지 비교 가능.
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
        regions={allRegions}
        channels={allChannels}
        tiers={allTiers}
        selectedRegions={selectedRegions}
        selectedChannels={selectedChannels}
        selectedTiers={selectedTiers}
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

// 사용 안 하지만 import 유지 — 향후 country별 표시 helper에서 활용 여지
void countryOption;
