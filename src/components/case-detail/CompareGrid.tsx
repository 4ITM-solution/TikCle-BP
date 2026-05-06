import Link from "next/link";
import type {
  Phase2Stats,
  Phase3Stats,
  Phase37Stats,
  Phase4aStats,
  Phase4bClusterStats,
  Phase4bSkuStats,
  Phase5Stats,
} from "@/lib/inngest/types";
import {
  ClusterTopToggle,
  HeroSkuToggle,
} from "./CompareCellInteractive";

export type CompareCase = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  status: string;
  key_stats: Record<string, unknown> | null;
};

type KS = {
  phase2?: Phase2Stats;
  phase3?: Phase3Stats;
  phase37?: Phase37Stats;
  phase4a?: Phase4aStats;
  phase4b_clusters?: Phase4bClusterStats;
  phase4b_sku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
};

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function CompareGrid({ cases }: { cases: CompareCase[] }) {
  // case 별 KS 추출
  const kss: KS[] = cases.map((c) => (c.key_stats ?? {}) as KS);

  // 모든 row 정의 — 각 row는 case마다 셀 값 lazy 계산
  const rows: Array<{
    label: string;
    section?: string;
    cells: (ks: KS, c: CompareCase) => React.ReactNode;
  }> = [
    {
      label: "기본 정보",
      section: "기본",
      cells: (_, c) => (
        <div>
          <div style={{ fontWeight: 700 }}>
            {c.country} · {c.channel.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              marginTop: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            status: {c.status}
          </div>
        </div>
      ),
    },
    {
      label: "총 영상 / 인플",
      section: "A 콘텐츠 활동",
      cells: (ks) => (
        <div>
          <div>
            <b>{fmtNum(ks.phase2?.total_contents)}</b> 영상
          </div>
          <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
            인플 {fmtNum(ks.phase2?.total_unique_creators)}명
          </div>
        </div>
      ),
    },
    {
      label: "월별 영상 추세",
      cells: (ks) => {
        const m = ks.phase2?.monthly_video_counts ?? [];
        if (m.length === 0) return "—";
        const peak = [...m].sort((a, b) => b.total - a.total)[0];
        const recent = m[m.length - 1];
        return (
          <div>
            <div>
              피크 <b>{peak?.month}</b>: {fmtNum(peak?.total)}
            </div>
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              최근 {recent?.month}: {fmtNum(recent?.total)}
            </div>
          </div>
        );
      },
    },
    {
      label: "Paid / Organic",
      cells: (ks) => {
        const m = ks.phase2?.monthly_video_counts ?? [];
        if (m.length === 0) return "—";
        const totalPaid = m.reduce((s, x) => s + x.paid, 0);
        const totalOrg = m.reduce((s, x) => s + x.organic, 0);
        const total = totalPaid + totalOrg;
        const paidPct = total > 0 ? (totalPaid / total) * 100 : 0;
        return (
          <div>
            <div>Paid {fmtPct(paidPct)}</div>
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              {fmtNum(totalPaid)} / {fmtNum(totalOrg)}
            </div>
          </div>
        );
      },
    },
    {
      label: "티어 분포",
      section: "B 인플루언서",
      cells: (ks) => {
        const d = ks.phase3?.tier_distribution;
        if (!d) return "—";
        return (
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            <div>
              Mega <b>{d.mega}</b> · Macro <b>{d.macro}</b>
            </div>
            <div style={{ color: "var(--color-g500)" }}>
              Mid {d.mid} · Micro {d.micro} · Nano {d.nano}
            </div>
          </div>
        );
      },
    },
    {
      label: "20+ 반복 작성자",
      cells: (ks) => {
        const tc = ks.phase2?.top_creators ?? [];
        const out = ks.phase2?.outlier_creators ?? [];
        return (
          <div>
            <div>
              <b>{tc.length}</b>명 반복
            </div>
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              outlier (1M+ 단일 viral): {out.length}명
            </div>
          </div>
        );
      },
    },
    {
      label: "Shop Creator (TTS)",
      cells: (ks) => {
        const p37 = ks.phase37;
        if (!p37 || p37.skipped_reason) return "—";
        return (
          <div>
            <b>{fmtNum(p37.total_shop_creators)}</b> /{" "}
            {fmtNum(p37.total_candidates)}
          </div>
        );
      },
    },
    {
      label: "30일 매출",
      section: "C 매출 & 랭킹",
      cells: (ks) => {
        const s = ks.phase2?.sales_summary;
        if (!s) return "—";
        return (
          <div>
            <b>{fmtUsd(s.total_revenue)}</b>
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              {fmtNum(s.total_units)} units · {s.sku_count} SKU
            </div>
          </div>
        );
      },
    },
    {
      label: "히어로 SKU 집중도",
      cells: (ks) => {
        const s = ks.phase2?.sales_summary;
        if (!s) return "—";
        return (
          <div>
            <div>
              top1 <b>{fmtPct(s.top1_revenue_share * 100)}</b>
            </div>
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              top3 {fmtPct(s.top3_revenue_share * 100)}
            </div>
          </div>
        );
      },
    },
    {
      label: "히어로 SKU Top 3",
      cells: (ks) => {
        const skus = ks.phase2?.sku_sales ?? [];
        if (skus.length === 0) return "—";
        const allDisplayed = ks.phase4b_sku?.displayed_videos ?? [];
        const channelCurrency = skus[0]?.currency ?? "USD";
        return (
          <HeroSkuToggle
            skus={skus}
            allDisplayed={allDisplayed}
            currency={channelCurrency}
          />
        );
      },
    },
    {
      label: "메타 클러스터 Top 3",
      section: "D 콘텐츠 포맷",
      cells: (ks) => {
        const cl = ks.phase4b_clusters;
        if (!cl || cl.skipped_reason) return "—";
        return (
          <ClusterTopToggle
            clusters={cl.meta_clusters}
            clusterReps={ks.phase4b_sku?.cluster_representatives ?? {}}
          />
        );
      },
    },
    {
      label: "USP 키워드 Top 3",
      cells: (ks) => {
        const ks5 = ks.phase5;
        if (!ks5 || (ks5.usp_keywords?.length ?? 0) === 0) return "—";
        const top = ks5.usp_keywords.slice(0, 3);
        return (
          <div style={{ fontSize: 11, lineHeight: 1.6 }}>
            {top.map((k) => (
              <div key={k.keyword}>
                <b>{k.keyword}</b>{" "}
                <span style={{ color: "var(--color-g500)" }}>
                  ({k.count})
                </span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      label: "주력 언어",
      cells: (ks) => {
        const langs = ks.phase5?.languages ?? [];
        if (langs.length === 0) return "—";
        const top = langs.slice(0, 2);
        return (
          <div style={{ fontSize: 11 }}>
            {top.map((l) => (
              <div key={l.code}>
                {l.label} <b>{fmtPct(l.pct)}</b>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      label: "Meta 광고 총량",
      section: "E Meta 광고",
      cells: (ks) => {
        const a = ks.phase4a;
        if (!a || a.skipped_reason) return "—";
        return (
          <div>
            <b>{fmtNum(a.total_ads)}</b>건
            <div style={{ color: "var(--color-g500)", fontSize: 11 }}>
              본사 {a.brand_official_ads} · active {a.active_ads}
            </div>
          </div>
        );
      },
    },
    {
      label: "랜딩 분포",
      cells: (ks) => {
        const l = ks.phase4a?.landings;
        if (!l) return "—";
        const total = ks.phase4a?.total_ads ?? 0;
        const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
        return (
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            <div>
              DTC <b>{fmtPct(pct(l.dtc ?? 0))}</b> · Amazon{" "}
              <b>{fmtPct(pct(l.amazon))}</b>
            </div>
            <div style={{ color: "var(--color-g500)" }}>
              IG {fmtPct(pct(l.instagram))} · TTS{" "}
              {fmtPct(pct(l.tiktok_shop))}
            </div>
          </div>
        );
      },
    },
  ];

  // CSS grid: case 수에 따라 컬럼
  const gridCols = `180px repeat(${cases.length}, minmax(180px, 1fr))`;

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 1,
          background: "var(--color-g100)",
          border: "1px solid var(--color-g100)",
          borderRadius: 8,
          overflow: "hidden",
          minWidth: 600,
        }}
      >
        {/* 헤더 row */}
        <div style={cellHeader}>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g400)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 700,
            }}
          >
            케이스
          </div>
        </div>
        {cases.map((c) => (
          <div key={c.id} style={cellHeader}>
            <Link
              href={`/cases/${c.id}`}
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--color-ink)",
                textDecoration: "none",
              }}
            >
              {c.brand} ↗
            </Link>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-g500)",
                fontFamily: "var(--font-mono)",
                marginTop: 2,
              }}
            >
              {c.country} · {c.channel.toUpperCase()}
            </div>
          </div>
        ))}

        {/* row들 */}
        {rows.map((row, ri) => (
          <ComparableRow
            key={ri}
            row={row}
            cases={cases}
            kss={kss}
            isFirst={ri === 0 || !!row.section}
          />
        ))}
      </div>
    </div>
  );
}

function ComparableRow({
  row,
  cases,
  kss,
  isFirst,
}: {
  row: {
    label: string;
    section?: string;
    cells: (ks: KS, c: CompareCase) => React.ReactNode;
  };
  cases: CompareCase[];
  kss: KS[];
  isFirst: boolean;
}) {
  return (
    <>
      {row.section && (
        <div
          style={{
            gridColumn: `1 / span ${cases.length + 1}`,
            background: "var(--color-g50)",
            padding: "8px 14px",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-g500)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginTop: isFirst ? 0 : 0,
          }}
        >
          {row.section}
        </div>
      )}
      <div style={cellLabel}>{row.label}</div>
      {cases.map((c, i) => (
        <div key={c.id} style={cellBody}>
          {row.cells(kss[i] ?? {}, c)}
        </div>
      ))}
    </>
  );
}

const cellHeader: React.CSSProperties = {
  background: "var(--color-g25)",
  padding: "12px 14px",
};

const cellLabel: React.CSSProperties = {
  background: "white",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-g600)",
  display: "flex",
  alignItems: "center",
};

const cellBody: React.CSSProperties = {
  background: "white",
  padding: "10px 14px",
  fontSize: 12,
  lineHeight: 1.5,
};
