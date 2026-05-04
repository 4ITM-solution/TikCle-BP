import Link from "next/link";
import { notFound } from "next/navigation";
import { createServer } from "@/lib/supabase/server";
import { fetchExchangeRates } from "@/lib/case-detail/exchange-rates-server";
import {
  formatLocalAndUsd,
  toUsd,
} from "@/lib/case-detail/exchange-rates";
import {
  countryOption,
  regionOf,
  REGION_LABEL,
  type Region,
} from "@/lib/case-detail/countries";
import { tierLabel } from "@/lib/case-detail/revenue-tiers";

export const dynamic = "force-dynamic";

type SalesSummary = {
  total_revenue?: number;
  total_units?: number;
  sku_count?: number;
} | null;

type Phase2 = {
  total_contents?: number;
  total_unique_creators?: number;
  sales_summary?: SalesSummary;
} | null;

type CaseRow = {
  id: string;
  country: string;
  channel: string;
  status: string;
  revenue_tier: string | null;
  analyzed_at: string | null;
  updated_at: string;
  key_stats: { phase2?: Phase2 } | null;
};

export default async function BrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServer();

  const [{ data: brand, error: brandErr }, { data: cases }, exchangeRates] =
    await Promise.all([
      supabase.from("brands").select("id, name").eq("id", id).maybeSingle(),
      supabase
        .from("cases")
        .select(
          "id, country, channel, status, revenue_tier, analyzed_at, updated_at, key_stats",
        )
        .eq("brand_id", id)
        .order("updated_at", { ascending: false }),
      fetchExchangeRates(),
    ]);

  if (brandErr) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <h1 className="page-title">브랜드</h1>
        <p style={{ color: "var(--color-accent)" }}>
          DB 조회 실패: {brandErr.message}
        </p>
      </div>
    );
  }
  if (!brand) notFound();

  const list: CaseRow[] = (cases ?? []).map((c) => ({
    id: c.id,
    country: c.country,
    channel: c.channel,
    status: c.status,
    revenue_tier: c.revenue_tier,
    analyzed_at: c.analyzed_at,
    updated_at: c.updated_at,
    key_stats: c.key_stats as CaseRow["key_stats"],
  }));

  // 권역 group: 같은 region에 속한 케이스가 N개면 권역 합산 카드 후보
  const byRegion = new Map<Region, CaseRow[]>();
  for (const c of list) {
    const r = regionOf(c.country);
    if (!r) continue;
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push(c);
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280 }}>
      <nav
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
        }}
      >
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>
          Browse
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>{brand.name}</span>
      </nav>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <h1 className="page-title">{brand.name}</h1>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {list.length}개 케이스
        </span>
        <Link
          href="/cases/new"
          className="btn btn-accent"
          style={{ marginLeft: "auto" }}
        >
          + 새 케이스 추가
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
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            아직 케이스가 없어요
          </div>
          <p style={{ fontSize: 13, color: "var(--color-g400)", marginBottom: 18 }}>
            이 브랜드의 첫 케이스를 만들어 분석을 시작합니다.
          </p>
          <Link href="/cases/new" className="btn btn-accent">
            + 새 케이스 만들기
          </Link>
        </div>
      ) : (
        <>
          <h2 className="section-title">분석된 케이스</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {list.map((c) => (
              <CaseCard
                key={c.id}
                row={c}
                exchangeRates={exchangeRates}
              />
            ))}
          </div>

          {/* 권역 합산 카드 — 같은 권역에 단일 국가 케이스 2개+ 있을 때만 노출 */}
          {Array.from(byRegion.entries())
            .filter(([, rows]) => rows.length >= 2)
            .map(([region, rows]) => (
              <RegionSummary
                key={region}
                region={region}
                rows={rows}
                exchangeRates={exchangeRates}
              />
            ))}
        </>
      )}
    </div>
  );
}

function CaseCard({
  row,
  exchangeRates,
}: {
  row: CaseRow;
  exchangeRates: Record<string, number>;
}) {
  const phase2 = row.key_stats?.phase2 ?? null;
  const summary = phase2?.sales_summary ?? null;
  const cOpt = countryOption(row.country);
  const region = regionOf(row.country);
  const tier = tierLabel(row.revenue_tier);

  // 권역 case면 currency=USD (자식 row는 SAR/AED 등). 단일은 그 country의 currency.
  const currency = cOpt?.currency ?? "USD";
  const revenue = summary?.total_revenue ?? null;

  return (
    <Link
      href={`/cases/${row.id}`}
      style={{
        display: "block",
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 8,
        padding: "16px 18px",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 80ms",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800 }}>
          {row.country} · {row.channel.toUpperCase()}
        </div>
        <span className={`status-pill ${row.status}`} style={{ fontSize: 9 }}>
          {row.status}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {cOpt && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 9,
              background: "var(--color-g50)",
              color: "var(--color-g600)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {cOpt.flag} {cOpt.label}
          </span>
        )}
        {tier && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 9,
              background: "var(--color-accent-soft)",
              color: "var(--color-accent)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {tier}
          </span>
        )}
        {region && cOpt && !cOpt.label.includes("통합") && (
          <span
            style={{
              fontSize: 9,
              color: "var(--color-g400)",
              padding: "2px 6px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {REGION_LABEL[region]}
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          fontSize: 11,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <Stat
          label="매출"
          value={
            revenue != null
              ? formatLocalAndUsd(revenue, currency, exchangeRates)
              : "—"
          }
        />
        <Stat
          label="콘텐츠"
          value={
            phase2?.total_contents != null
              ? `${phase2.total_contents.toLocaleString()}건`
              : "—"
          }
        />
        <Stat
          label="인플"
          value={
            phase2?.total_unique_creators != null
              ? `${phase2.total_unique_creators.toLocaleString()}명`
              : "—"
          }
        />
        <Stat
          label="SKU"
          value={
            summary?.sku_count != null
              ? `${summary.sku_count.toLocaleString()}개`
              : "—"
          }
        />
      </div>

      <div
        style={{
          fontSize: 10,
          color: "var(--color-g400)",
          fontFamily: "var(--font-mono)",
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--color-g100)",
        }}
      >
        {row.analyzed_at
          ? `분석 ${new Date(row.analyzed_at).toLocaleDateString("ko-KR")}`
          : `최종 ${new Date(row.updated_at).toLocaleDateString("ko-KR")}`}
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          color: "var(--color-g400)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RegionSummary({
  region,
  rows,
  exchangeRates,
}: {
  region: Region;
  rows: CaseRow[];
  exchangeRates: Record<string, number>;
}) {
  // 같은 region 안 케이스의 매출 USD 환산 합산
  let usdSum = 0;
  let contentsSum = 0;
  let creatorsSum = 0;
  for (const r of rows) {
    const phase2 = r.key_stats?.phase2 ?? null;
    const cur = countryOption(r.country)?.currency ?? "USD";
    const rev = phase2?.sales_summary?.total_revenue ?? null;
    if (rev != null) usdSum += toUsd(rev, cur, exchangeRates) ?? 0;
    contentsSum += phase2?.total_contents ?? 0;
    creatorsSum += phase2?.total_unique_creators ?? 0;
  }

  return (
    <div
      style={{
        marginTop: 28,
        padding: "18px 20px",
        background: "var(--color-info-soft)",
        border: "1px solid var(--color-info)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--color-info)",
          letterSpacing: ".06em",
          marginBottom: 8,
        }}
      >
        {REGION_LABEL[region]} 권역 합산
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: "var(--color-g600)",
        }}
      >
        <Stat
          label="총 매출 (USD 환산)"
          value={`$${Math.round(usdSum).toLocaleString()}`}
        />
        <Stat label="케이스" value={`${rows.length}개`} />
        <Stat label="콘텐츠 합" value={`${contentsSum.toLocaleString()}건`} />
        <Stat label="인플 합" value={`${creatorsSum.toLocaleString()}명`} />
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {rows.map((r) => `${r.country}/${r.channel}`).join(" · ")}
      </div>
    </div>
  );
}
