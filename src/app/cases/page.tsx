import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import {
  CasesListWithCompare,
  type CaseListItem,
} from "@/components/case-detail/CasesListWithCompare";
import { BrowseFilters } from "@/components/case-detail/BrowseFilters";
import { computeCompleteness } from "@/lib/case-detail/completeness";

export const dynamic = "force-dynamic";

type Search = Promise<{
  region?: string;
  tier?: string;
  q?: string;
  channel?: string;
}>;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const selectedRegion = (sp.region ?? "").trim();
  const selectedTier = (sp.tier ?? "").trim();
  const selectedChannel = (sp.channel ?? "").trim();
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

  // ★ 각 case 의 products.channel distinct list — 다채널 라벨 + 플랫폼 필터용
  const channelsByCaseId: Record<string, string[]> = {};
  if (allCases.length > 0) {
    const caseIds = allCases.map((c) => c.id);
    const set = new Map<string, Set<string>>();
    // PostgREST 1000행 캡 → 케이스 많으면 일부 제품만 잡혀 채널 뱃지가 cases.channel 로
    // fallback(다 "Amazon")됨. range 로 전체 페이지네이션해 모든 제품 채널 수집.
    const PAGE = 1000;
    for (let off = 0; off < 200000; off += PAGE) {
      const { data: prods } = await supabase
        .from("products")
        .select("case_id, channel")
        .in("case_id", caseIds)
        .range(off, off + PAGE - 1);
      if (!prods || prods.length === 0) break;
      for (const p of prods) {
        if (!p.case_id || !p.channel) continue;
        if (!set.has(p.case_id)) set.set(p.case_id, new Set());
        set.get(p.case_id)!.add(String(p.channel));
      }
      if (prods.length < PAGE) break;
    }
    for (const [cid, ch] of set) channelsByCaseId[cid] = [...ch].sort();
  }

  // ★ A5(WS4b): 완결성 요약(간이) — key_stats 전체 대신 JSON 경로 스칼라만 뽑아 payload 최소화
  //   (key_stats 는 xlsx 잔재로 케이스당 수 MB 가능 — 전체 select 금지). 타입 클라이언트가
  //   JSON 경로 select 를 못 파싱해 any 캐스팅.
  const completenessById: Record<string, ReturnType<typeof computeCompleteness>> = {};
  if (allCases.length > 0) {
    type KsScalar = {
      id: string;
      tk: string | null; cr: string | null; ig: string | null; yt: string | null;
      ads: string | null; sales: string | null;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ksRows } = (await (supabase as any)
      .from("cases")
      .select(
        "id, status, tk:key_stats->phase2->>total_contents, cr:key_stats->phase2->>total_unique_creators, ig:key_stats->phase2->>ig_total_videos, yt:key_stats->phase2->>yt_total_videos, ads:key_stats->phase4a->>total_ads, sales:key_stats->phase2->sales_summary->>total_revenue",
      )) as { data: Array<KsScalar & { status: string | null }> | null };
    const num = (s: string | null) => (s == null ? 0 : Number(s) || 0);
    for (const r of ksRows ?? []) {
      completenessById[r.id] = computeCompleteness(
        {
          phase2: {
            total_contents: num(r.tk),
            total_unique_creators: num(r.cr),
            ig_total_videos: num(r.ig),
            yt_total_videos: num(r.yt),
            sales_summary: r.sales != null ? { total_revenue: num(r.sales) } : null,
          },
          phase4a: { total_ads: num(r.ads) },
        },
        { status: r.status, salesExists: r.sales != null },
      );
    }
  }

  // 필터 — country/tier 정확 매칭 + brand 명 부분 일치 + 플랫폼 (products.channel 또는 cases.channel)
  const filtered = allCases.filter((c) => {
    if (selectedRegion && c.country !== selectedRegion) return false;
    if (selectedTier && c.revenue_tier !== selectedTier) return false;
    if (selectedQ) {
      const brandName = (c.brand as unknown as { name: string } | null)?.name ?? "";
      if (!brandName.toLowerCase().includes(selectedQ)) return false;
    }
    if (selectedChannel) {
      // 새 case (channel=NULL, 다채널): products.channel list 안 매칭
      // 옛 case (channel='amazon'): cases.channel 매칭
      const productChannels = channelsByCaseId[c.id] ?? [];
      const legacy = c.channel ?? null;
      const matches = productChannels.includes(selectedChannel) || legacy === selectedChannel;
      if (!matches) return false;
    }
    return true;
  });

  const list: CaseListItem[] = filtered.map((c) => {
    const productChannels = channelsByCaseId[c.id] ?? [];
    const comp = completenessById[c.id];
    // 다채널 라벨: products 박혔으면 그 list, 아니면 cases.channel (옛 case)
    const channels = productChannels.length > 0
      ? productChannels
      : (c.channel ? [c.channel] : []);
    return {
      id: c.id,
      brand:
        (c.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
      brand_id: c.brand_id ?? null,
      country: c.country,
      channel: c.channel,
      channels, // ★ A 모델 다채널 라벨
      status: c.status,
      revenue_tier: c.revenue_tier,
      updated_at: c.updated_at,
      completeness: comp
        ? { verdict: comp.verdict, filledCount: comp.filledCount, total: comp.total }
        : undefined,
    };
  });

  const hasAnyFilter = !!(selectedRegion || selectedTier || selectedQ || selectedChannel);

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
            brand 명 검색 · 국가 · 플랫폼 · 티어 필터. 체크박스 최대 4개 비교.
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
        selectedChannel={selectedChannel}
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
