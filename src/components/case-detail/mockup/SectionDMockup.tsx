"use client";

import { useState } from "react";
import type {
  DisplayedVideoEntry,
  Phase2Stats,
  Phase4bSkuStats,
  Phase5Stats,
} from "@/lib/inngest/types";
import type {
  KalodataVideoXlsxRow,
  KalodataLiveRow,
} from "@/lib/parsers/kalodata";
import { SkuHealthCards } from "./SkuHealthCards";
import type { BsrInflection, BsrSeries } from "@/lib/inngest/types";
import type { KalodataBrandKpi } from "@/lib/parsers/kalodata";
import { BsrTrendChart, type WeeklyViewPoint } from "../BsrTrendChart";

/**
 * SectionDMockup — mockup line 1025-1283 1:1.
 *
 * 매출 & BSR:
 *   - 채널 toggle (TT Shop / Amazon prototype) + 기간 toggle (7/14/30)
 *   - SKU selector banner (.sku-pick) — selected state lift
 *   - SKU 헬스 KPI 3 card (.sku-health-grid) — SkuHealthCards 재사용
 *   - 히어로 SKU × 메가 viral 영상 (.hero-grid + .hero-card)
 *   - sub-tabs 6 (.sub-tabs)
 *   - 6 panel (.panel):
 *     SKU 매출 표 / 카테고리 ranking / Creator × SKU GMV matrix /
 *     Affiliate code conversion / 영상별 매출 / Live 매출
 */

type Tab = "sku" | "rank" | "matrix" | "affiliate" | "vid" | "live" | "bsr";

export function SectionDMockup({
  phase2,
  phase4bSku,
  caseChannel,
  availableSalesChannels,
  skuChannelMap,
  skuVideoMap,
  kalodataVideos,
  kalodataLives,
  categoryRanking,
  skuMetaMap,
  kalodataInOtherCases,
  bsrInflections,
  kalodataBrandKpi,
  bsrSeries,
  bsrSkus,
  weeklyViews,
  nowMs,
}: {
  phase2: Phase2Stats;
  phase4bSku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
  /** case.channel — fallback */
  caseChannel?: string;
  /** 이 case 의 products 에 실제 존재하는 sales channel list (tt_shop / amazon / shopee) */
  availableSalesChannels?: string[];
  /** asin → channel — SKU 매출 filter 용 */
  skuChannelMap?: Record<string, string>;
  /** asin → 명시적 링크 영상 (contents.product_id 기반) + 조회수 + 어필리에이트 GMV.
   *  사용자가 제품 선택해 올린 영상 — Vision 매칭(phase4b) 없이 직접 SKU별 표시. */
  skuVideoMap?: Record<
    string,
    Array<{
      url: string;
      views: number;
      gmv: number | null;
      items: number | null;
      handle: string | null;
      is_ad: boolean;
    }>
  >;
  kalodataVideos?: KalodataVideoXlsxRow[];
  kalodataLives?: KalodataLiveRow[];
  /** C1: cases.key_stats.kalodata_category_ranking.points */
  categoryRanking?: Array<{ date: string; rank: number }>;
  /** 옛 phase2 cache 안 sku_sales 에 category/launch_date/price field 없을 때 DB 직접 fetch 한 enrichment */
  skuMetaMap?: Record<string, { category: string | null; launch_date: string | null; price: number | null }>;
  /** 이 brand 의 다른 case 중 kalodata 적재된 케이스 hint (case 헷갈림 방지) */
  kalodataInOtherCases?: Array<{
    id: string;
    country: string;
    channel: string | null;
    n_videos: number;
    n_xlsx: number;
    n_lives: number;
  }>;
  /** 옛 BsrTrendChart 기능 복원 — phase5.bsr_inflections (Amazon 케이스만 의미) */
  bsrInflections?: BsrInflection[];
  /** Kalodata Brand KPI — Self/Affiliate/Mall % 분해 (SEA TT Shop case 의 BP 분석 핵심) */
  kalodataBrandKpi?: KalodataBrandKpi | null;
  /** BSR series (Amazon top 5 SKU) + weekly views — BSR sub-tab line chart (옛 BsrTrendChart) */
  bsrSeries?: BsrSeries[];
  /** Amazon BSR — SKU별 월별 시계열 + 상승시점 + 당시 영상 (sales_snapshot 직접). */
  bsrSkus?: Array<{
    asin: string;
    name: string;
    series: Array<{ m: string; bsr: number }>;
    inflections: Array<{
      month: string;
      from: number;
      to: number;
      videos: Array<{ url: string; views: number; caption: string | null }>;
    }>;
  }>;
  weeklyViews?: WeeklyViewPoint[];
  /** Hydration 안전 — page.tsx 가 server 시점 Date.now() 박아 SkuHealthCards 까지 전달. */
  nowMs?: number;
}) {
  const renderKalodataFallbackHint = () => {
    if (!kalodataInOtherCases || kalodataInOtherCases.length === 0) return null;
    return (
      <div
        style={{
          marginTop: 8,
          padding: "6px 10px",
          fontSize: 10,
          color: "#1f2937",
          background: "#dbeafe",
          border: "1px dashed #3b82f6",
          borderRadius: 4,
        }}
      >
        💡 같은 brand 의 다른 case 에 kalodata 데이터 적재됨 — 다른 case 헷갈렸을 가능성:
        {kalodataInOtherCases.slice(0, 3).map((r) => (
          <a
            key={r.id}
            href={`/cases/${r.id}`}
            style={{ marginLeft: 6, color: "#1d4ed8", textDecoration: "underline", fontWeight: 600 }}
          >
            {r.country}/{r.channel ?? "—"} (videos {r.n_videos + r.n_xlsx})
          </a>
        ))}
      </div>
    );
  };
  const [tab, setTab] = useState<Tab>("sku");
  const [selectedSku, setSelectedSku] = useState<string>("all");
  const onSelectSku = setSelectedSku;
  const [skuShowAll, setSkuShowAll] = useState(false);
  const [vidShowAll, setVidShowAll] = useState(false);

  // 채널 toggle state — 기본 case.channel 또는 첫 available
  const defaultCh =
    (availableSalesChannels?.includes(caseChannel ?? "") ? caseChannel : null) ??
    availableSalesChannels?.[0] ??
    caseChannel ??
    "tiktok_shop";
  const [selectedChannel, setSelectedChannel] = useState<string>(defaultCh);

  // sku_sales 채널 filter
  const filteredSkus =
    skuChannelMap && availableSalesChannels && availableSalesChannels.length > 1
      ? phase2.sku_sales.filter((s) => !s.asin || skuChannelMap[s.asin] === selectedChannel)
      : phase2.sku_sales;

  if (!phase2.sales_summary) return null;

  const summary = phase2.sales_summary;
  const skus = filteredSkus;
  const totalRev = skus.reduce((s, x) => s + (x.revenue ?? 0), 0);
  const totalUnits = summary.total_units ?? 0;

  // 히어로 SKU Top 3 (selectedSku !== "all" 면 그 1개만)
  const heroSkus =
    selectedSku !== "all"
      ? skus.filter((s) => s.asin === selectedSku).slice(0, 3)
      : [...skus]
          .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
          .slice(0, 3);

  // SKU 매출 표 — 같은 제품의 여러 리스팅(캠페인: mothersdaygift/Summervibes 등)을
  //   제품명 정규화로 묶어 합산 표시. 데이터(sku_sales)는 그대로, 표시만 그룹.
  //   대표(rep) = 그룹 내 최고매출 리스팅. count>1이면 "🔗 N 리스팅" 배지.
  const groupedSkus = (() => {
    const normName = (n: string | null | undefined) =>
      (n ?? "")
        .toLowerCase()
        .replace(/\[new\]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 45);
    const base = skus.filter((s) => selectedSku === "all" || s.asin === selectedSku);
    const gmap = new Map<
      string,
      { rep: (typeof base)[number]; revenue: number; units: number; count: number }
    >();
    for (const s of base) {
      const key = normName(s.name) || (s.asin ?? "");
      const ex = gmap.get(key);
      if (!ex)
        gmap.set(key, { rep: s, revenue: s.revenue ?? 0, units: s.units ?? 0, count: 1 });
      else {
        ex.revenue += s.revenue ?? 0;
        ex.units += s.units ?? 0;
        ex.count += 1;
        if ((s.revenue ?? 0) > (ex.rep.revenue ?? 0)) ex.rep = s;
      }
    }
    return [...gmap.values()].sort((a, b) => b.revenue - a.revenue);
  })();
  const skuLimit =
    selectedSku !== "all" ? groupedSkus.length : skuShowAll ? groupedSkus.length : 5;

  // 매칭 영상 — phase4bSku.displayed_videos 에서 sku.asin 매칭 + Kalodata fallback
  const allDisplayed = phase4bSku?.displayed_videos ?? [];
  const matchedFor = (asin: string, skuName?: string): DisplayedVideoEntry[] => {
    if (!asin) return [];
    // 0차: 명시적 링크 (contents.product_id) — 사용자가 제품 선택해 올린 영상.
    //   Vision 매칭/임계 없이 조회수순. caption에 @handle + 어필리에이트 GMV 노출.
    const explicit = skuVideoMap?.[asin];
    if (explicit && explicit.length > 0) {
      return explicit.slice(0, 6).map((v) => ({
        content_id: v.url,
        url: v.url,
        views: v.views,
        thumbnail_url: null,
        caption_preview: v.handle
          ? `@${v.handle}${v.gmv != null ? ` · GMV $${Math.round(v.gmv).toLocaleString()}` : ""}`
          : null,
        matched_skus: [asin],
        matched_sku_names: skuName ? [skuName] : [],
        confidence: "explicit-link" as unknown as DisplayedVideoEntry["confidence"],
        gmv: v.gmv,
      }));
    }
    // 1차: Phase 4b.5 SKU 매칭 (high confidence)
    const primary = allDisplayed
      .filter(
        (v) =>
          (v.views ?? 0) >= 500_000 &&
          v.confidence === "high" &&
          Array.isArray(v.matched_skus) &&
          v.matched_skus.includes(asin),
      )
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 5);
    if (primary.length > 0) return primary;

    // 2차: Kalodata video xlsx 의 product_title fuzzy 매칭 (이름 일치)
    if (!skuName || !kalodataVideos || kalodataVideos.length === 0) return [];
    const skuKey = skuName.toLowerCase().slice(0, 16);
    const fallback = kalodataVideos
      .filter((v) => v.product_title && v.product_title.toLowerCase().includes(skuKey))
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 5);
    // DisplayedVideoEntry 키 정확히 맞춤 — caption_preview / matched_sku_names / confidence.
    return fallback.map((v) => ({
      content_id: v.video_url ?? "",
      url: v.video_url ?? "#",
      views: v.views ?? 0,
      thumbnail_url: null,
      caption_preview: v.description ? v.description.slice(0, 140) : null,
      matched_skus: [asin],
      matched_sku_names: skuName ? [skuName] : [],
      confidence: "kalodata-fallback" as unknown as DisplayedVideoEntry["confidence"],
    }));
  };

  // 긴 SKU명 직관화 — 모든 SKU가 공유하는 브랜드 접두어를 떼고 구분되는 부분만 노출.
  // 예: "Oganacell PDRN Gua Sha Peptide..." → "PDRN Gua Sha Peptide..." (브랜드 중복 제거).
  const skuCommonPrefix = (() => {
    const names = skus.map((s) => s.name ?? "").filter((n) => n.length > 0);
    if (names.length < 2) return "";
    let p = names[0]!;
    for (const n of names) {
      while (p && !n.startsWith(p)) p = p.slice(0, -1);
      if (!p) break;
    }
    return p.replace(/\S*$/, "").trimEnd(); // 단어 경계에서 자르기
  })();
  const shortSku = (name?: string | null, max = 26): string => {
    if (!name) return "(이름 없음)";
    const stripped =
      skuCommonPrefix && name.startsWith(skuCommonPrefix)
        ? name.slice(skuCommonPrefix.length).trim()
        : name;
    const s = stripped || name;
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };

  return (
    <div className="section" id="sec-d">
      <div className="section-h">
        <span className="letter">D</span>
        <span className="title">매출 & BSR</span>
        <span className="sub">★ SKU 통일 selector · SKU 헬스 · Hero × Mega · TT Shop 깊은 데이터</span>
      </div>

      {/* 채널 + 기간 toggle — availableSalesChannels (products.channel 분포) 기반 active.
          여러 채널 있는 케이스면 toggle 클릭 시 sku_sales filter. 1 채널만 있으면 그 채널 active 만. */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>채널:</span>
          <div className="ch-toggle">
            {(["tiktok_shop", "amazon", "shopee"] as const).map((ch) => {
              const exists = availableSalesChannels?.includes(ch);
              const active = selectedChannel === ch && exists;
              return (
                <button
                  key={ch}
                  className={active ? "active" : ""}
                  disabled={!exists}
                  onClick={() => exists && setSelectedChannel(ch)}
                  style={!exists ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  {ch === "tiktok_shop" ? "TT Shop" : ch === "amazon" ? "Amazon" : "Shopee"}
                  {active && totalRev > 0 ? ` (${formatUsdShort(totalRev)})` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>기간:</span>
          <div className="ch-toggle">
            <button disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>7일</button>
            <button disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>14일</button>
            <button className="active">30일</button>
          </div>
        </div>
      </div>

      {/* SKU 필터 — 중립 필터 UI (알럿처럼 안 보이게). 선택 시 아래 표/차트 종속 갱신. */}
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#374151", fontWeight: 700 }}>SKU 필터</span>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>
            선택하면 아래 모든 표·차트가 그 SKU 기준으로 바뀝니다
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            onClick={() => onSelectSku("all")}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              border: "1px solid",
              borderColor: selectedSku === "all" ? "#1f2937" : "#d1d5db",
              background: selectedSku === "all" ? "#1f2937" : "white",
              color: selectedSku === "all" ? "white" : "#374151",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            전체 ({skus.length} SKU)
          </button>
          {skus.slice(0, 8).map((s) => (
            <button
              key={s.asin}
              type="button"
              onClick={() => onSelectSku(s.asin ?? "")}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                border: "1px solid",
                borderColor: selectedSku === s.asin ? "#1f2937" : "#d1d5db",
                background: selectedSku === s.asin ? "#1f2937" : "white",
                color: selectedSku === s.asin ? "white" : "#374151",
                borderRadius: 6,
                cursor: "pointer",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={s.name ?? ""}
            >
              {shortSku(s.name)}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>
          현재 선택:{" "}
          <b style={{ color: "#374151" }}>
            {selectedSku === "all"
              ? `전체 ${skus.length} SKU`
              : shortSku(skus.find((s) => s.asin === selectedSku)?.name, 60)}
          </b>{" "}
          · 30일 GMV {formatUsdShort(totalRev)}
          {totalUnits > 0 && ` · ${totalUnits.toLocaleString()} 단위 판매`}
        </div>
      </div>

      {/* SKU 헬스 KPI 3 card — matchedFor(Kalodata fuzzy fallback 포함) 박힘 박힘
          Hero 패널 박힘 박힘 매칭 카운트 일치 시킴. 정확 매칭 0개여도 fuzzy 5개 박힘 박힘 표시. */}
      <SkuHealthCards
        phase2={phase2}
        phase4bSku={phase4bSku}
        selectedSku={selectedSku}
        matchedVideosOverride={
          selectedSku !== "all"
            ? matchedFor(selectedSku, skus.find((s) => s.asin === selectedSku)?.name ?? undefined)
            : undefined
        }
        nowMs={nowMs}
      />

      {/* ★ Kalodata Brand 매출 분해 — Self/Affiliate/Mall % (SEA TT Shop case BP 핵심) */}
      {kalodataBrandKpi && (kalodataBrandKpi.self_operated_revenue_usd != null || kalodataBrandKpi.affiliate_revenue_usd != null || kalodataBrandKpi.shopping_mall_revenue_usd != null) && (
        (() => {
          const self = kalodataBrandKpi.self_operated_revenue_usd ?? 0;
          const aff = kalodataBrandKpi.affiliate_revenue_usd ?? 0;
          const mall = kalodataBrandKpi.shopping_mall_revenue_usd ?? 0;
          const tot = self + aff + mall;
          if (tot === 0) return null;
          const pct = (n: number) => Math.round((n / tot) * 100);
          // 핵심 narrative: affiliate 비중 ≥ 50% → 시딩 driven, self ≥ 50% → 자체운영
          const driverNote =
            pct(aff) >= 50 ? "🔥 affiliate (시딩) driven brand" :
            pct(self) >= 50 ? "🏢 self-operated 비중 큼" :
            pct(mall) >= 30 ? "🛍 Shopping Mall 비중 큼" :
            "혼합형";
          return (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                border: "1.5px solid #ec4899",
                borderRadius: 8,
                background: "#fdf2f8",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#831843" }}>
                💰 Kalodata Brand 매출 분해 — {driverNote}
                <span style={{ fontSize: 10, color: "#9d174d", fontWeight: 400, marginLeft: 6 }}>
                  ({kalodataBrandKpi.period_start ?? "?"} ~ {kalodataBrandKpi.period_end ?? "?"})
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "Self-Operated", val: self, color: "#a855f7" },
                  { label: "Affiliate (시딩)", val: aff, color: "#ec4899" },
                  { label: "Shopping Mall", val: mall, color: "#06b6d4" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>{s.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>
                      {formatUsdShort(s.val)} <span style={{ fontSize: 11, color: "#9ca3af" }}>· {pct(s.val)}%</span>
                    </div>
                    <div style={{ height: 6, background: "#fce7f3", borderRadius: 3, marginTop: 4 }}>
                      <div style={{ height: "100%", width: `${pct(s.val)}%`, background: s.color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
              {kalodataBrandKpi.active_affiliates != null && (
                <div style={{ marginTop: 10, fontSize: 10, color: "#831843" }}>
                  ★ Active Affiliates {kalodataBrandKpi.active_affiliates.toLocaleString()}명{" "}
                  {kalodataBrandKpi.new_videos_by_affiliate != null && `· 신규 영상 ${kalodataBrandKpi.new_videos_by_affiliate.toLocaleString()}개`}
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* SKU 선택 시 GMV 시계열 (Kalodata 영상매출 publish_date 그룹) — mockup line 1163-1173 */}
      {selectedSku !== "all" && kalodataVideos && kalodataVideos.length > 0 && (() => {
        const selectedSkuName = skus.find((s) => s.asin === selectedSku)?.name;
        const matched = kalodataVideos.filter((v) =>
          selectedSkuName && v.product_title && v.product_title.toLowerCase().includes(selectedSkuName.toLowerCase().slice(0, 12)),
        );
        if (matched.length === 0) return null;
        // publish_date YYYY-MM 그룹 합산
        const byMonth = new Map<string, number>();
        for (const v of matched) {
          if (!v.publish_date) continue;
          const m = v.publish_date.slice(0, 7);
          byMonth.set(m, (byMonth.get(m) ?? 0) + (v.revenue_usd ?? 0));
        }
        const sortedMonths = [...byMonth.keys()].sort();
        if (sortedMonths.length < 2) return null;
        const values = sortedMonths.map((m) => byMonth.get(m)!);
        const maxV = Math.max(...values);
        const w = 600, h = 80, padX = 30, padY = 10;
        const sx = (i: number) => padX + (sortedMonths.length > 1 ? (i / (sortedMonths.length - 1)) * (w - padX * 2) : 0);
        const sy = (v: number) => h - padY - (v / maxV) * (h - padY * 2);
        const path = values.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(v)}`).join(" ");
        return (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              📈 선택 SKU의 GMV 시계열 (Kalodata 영상매출 매칭, 월별)
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 80 }}>
              <path d={path} fill="none" stroke="#10b981" strokeWidth={2} />
              {values.map((v, i) => (
                <circle key={i} cx={sx(i)} cy={sy(v)} r={3} fill="#10b981" />
              ))}
              {sortedMonths.map((m, i) => (
                <text
                  key={m}
                  x={sx(i)}
                  y={h - 1}
                  fontSize="8"
                  textAnchor="middle"
                  fill="#6b7280"
                >
                  {m.slice(5)}
                </text>
              ))}
            </svg>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
              매칭 영상 {matched.length}개 · 최대 월 GMV {formatUsdShort(maxV)}
            </div>
          </div>
        );
      })()}

      {/* 히어로 SKU × 메가 viral 영상 — 전체 SKU 선택 시만 (개별 SKU는 아래 뷰Top/매출기여 박스로 대체) */}
      {selectedSku === "all" && (
        <>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 16 }}>
        ⭐ 히어로 SKU × 메가 viral 영상 (1M+ views 매칭)
      </div>
      <div className="hero-grid">
        {heroSkus.map((sku, i) => {
          const skuAsin = sku.asin ?? "";
          const matched = matchedFor(skuAsin, sku.name);
          const pct =
            totalRev > 0 && (sku.revenue ?? 0) > 0
              ? Math.round(((sku.revenue ?? 0) / totalRev) * 100)
              : 0;
          return (
            <div key={skuAsin || i} className="hero-card">
              <div className="hc-rank">Top {i + 1} 매출</div>
              <div className="hc-sku" title={sku.name}>
                {shortSku(sku.name, 32)}
              </div>
              <div className="hc-rev">
                {formatUsdShort(sku.revenue ?? 0)} · {pct}%
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                매칭 영상 {matched.length}개{matched.length > 0 ? " (high confidence)" : ""}
              </div>
              {matched.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(matched.length, 3)}, 1fr)`,
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {matched.slice(0, 3).map((v) => {
                    const id = extractTikTokVideoId(v.url);
                    return (
                      <div key={v.content_id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 9, color: "#92400e", display: "flex", justifyContent: "space-between" }}>
                          <span>{formatViews(v.views)} · TK</span>
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#1d4ed8", textDecoration: "none" }}
                            title="새 탭에서 열기"
                          >
                            ↗
                          </a>
                        </div>
                        {id ? (
                          <iframe
                            src={`https://www.tiktok.com/embed/v2/${id}`}
                            loading="lazy"
                            allowFullScreen
                            allow="encrypted-media"
                            title={v.url}
                            style={{
                              width: "100%",
                              height: 320,
                              border: "1px solid #fde68a",
                              borderRadius: 4,
                              background: "#f3f4f6",
                            }}
                          />
                        ) : (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "block",
                              padding: 10,
                              fontSize: 10,
                              color: "#1f2937",
                              background: "#f3f4f6",
                              textAlign: "center",
                              borderRadius: 4,
                            }}
                          >
                            TikTok 에서 열기 ↗
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
        ★ 매출 Top 3 × 1M+ views 영상으로 마케팅 주력 판정 (Phase 4b.5 SKU 매칭, high confidence만)
      </div>
        </>
      )}

      {/* sub-tabs */}
      <div className="sub-tabs" style={{ marginTop: 20 }}>
        <button className={tab === "sku" ? "active" : ""} onClick={() => setTab("sku")}>
          SKU 매출 표 ({skus.length})
        </button>
        <button className={tab === "rank" ? "active" : ""} onClick={() => setTab("rank")}>
          ★ 카테고리 ranking 시계열
        </button>
        <button className={tab === "matrix" ? "active" : ""} onClick={() => setTab("matrix")}>
          ★ Creator × SKU GMV matrix
        </button>
        <button
          className={tab === "affiliate" ? "active" : ""}
          onClick={() => setTab("affiliate")}
        >
          ★ Affiliate code conversion
        </button>
        <button className={tab === "vid" ? "active" : ""} onClick={() => setTab("vid")}>
          영상별 매출 (Kalodata)
        </button>
        <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>
          Live 매출 (Kalodata)
        </button>
        <button className={tab === "bsr" ? "active" : ""} onClick={() => setTab("bsr")}>
          ★ BSR 상승 시점 (옛 MD)
        </button>
      </div>

      {/* SKU 매출 표 panel — mockup 컬럼 확장: 카테고리/출시/가격/동반 영상 */}
      {tab === "sku" && (
        <div className="panel active">
          <table>
            <thead>
              <tr>
                <th>제품</th>
                <th>ASIN</th>
                <th>카테고리</th>
                <th style={{ textAlign: "right" }}>출시</th>
                <th style={{ textAlign: "right" }}>가격</th>
                <th style={{ textAlign: "right" }}>30d GMV</th>
                <th style={{ textAlign: "right" }}>판매</th>
                <th style={{ textAlign: "right" }}>BSR</th>
                <th style={{ textAlign: "right" }} title="이 SKU 가 Phase 4b.5 SKU 매칭 또는 Kalodata 영상에서 등장한 영상 수">
                  동반 영상 ?
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedSkus.slice(0, skuLimit).map((g) => {
                  const s = g.rep;
                  const matched = allDisplayed.filter((v) =>
                    Array.isArray(v.matched_skus) && s.asin && v.matched_skus.includes(s.asin),
                  ).length;
                  // server enrichment 우선 (옛 phase2 cache 에 새 field 없을 때)
                  const meta = (s.asin && skuMetaMap?.[s.asin]) || null;
                  const category = s.category ?? meta?.category ?? null;
                  const launch = s.launch_date ?? meta?.launch_date ?? null;
                  const price = s.price ?? meta?.price ?? null;
                  return (
                    <tr key={s.asin}>
                      <td>
                        <b>
                          {shortSku(s.name, 40)}
                        </b>
                        {g.count > 1 && (
                          <span
                            style={{ marginLeft: 6, fontSize: 9, color: "#7c3aed", background: "#ede9fe", padding: "1px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}
                            title="같은 제품의 여러 리스팅(캠페인) 합산"
                          >
                            🔗 {g.count} 리스팅 합산
                          </span>
                        )}
                      </td>
                      <td>
                        <a
                          href={s.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}
                        >
                          {s.asin}
                        </a>
                      </td>
                      <td style={{ fontSize: 10, color: "#6b7280" }}>
                        {category ?? "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>
                        {launch ?? "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>
                        {price != null ? `$${price.toLocaleString()}` : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: "#10b981",
                          fontWeight: 700,
                        }}
                      >
                        {formatUsdShort(g.revenue)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {g.units.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", color: s.bsr_latest != null ? "#1f2937" : "#9ca3af" }}>
                        {s.bsr_latest != null ? `#${s.bsr_latest.toLocaleString()}` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", color: matched > 0 ? "#ec4899" : "#9ca3af" }}>
                        {matched > 0 ? `${matched}개` : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {selectedSku === "all" && groupedSkus.length > 5 && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setSkuShowAll(!skuShowAll)}
                style={{
                  fontSize: 11,
                  padding: "5px 14px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "#6b7280",
                }}
              >
                {skuShowAll ? `▲ 5개만 보기` : `▼ 전체 ${groupedSkus.length}개 제품 보기 (현재 5개)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 카테고리 ranking 시계열 panel — C1 */}
      {tab === "rank" && (
        <div className="panel active">
          {!categoryRanking || categoryRanking.length < 2 ? (
            <div
              style={{
                padding: 16,
                background: "#fef3c7",
                border: "1px dashed #fbbf24",
                borderRadius: 6,
                fontSize: 11,
                color: "#92400e",
                textAlign: "center",
              }}
            >
              ⚠ Category Ranking 시계열 미적재 — 위 KalodataSection 에서 paste 후 채워짐
            </div>
          ) : (
            (() => {
              const pts = [...categoryRanking].sort((a, b) =>
                a.date.localeCompare(b.date),
              );
              const ranks = pts.map((p) => p.rank);
              const minR = Math.min(...ranks);
              const maxR = Math.max(...ranks);
              const curR = ranks[ranks.length - 1]!;
              const avg7 = ranks.slice(-7).reduce((s, v) => s + v, 0) / Math.min(7, ranks.length);
              const change = ranks.length >= 2 ? curR - ranks[0]! : 0;
              const inTop10 = ranks.filter((r) => r <= 10).length;
              // svg
              const w = 700, h = 100, padX = 30, padY = 12;
              const sx = (i: number) =>
                padX + (i / (pts.length - 1)) * (w - padX * 2);
              // 낮은 rank 가 위 (역방향)
              const sy = (r: number) =>
                padY + ((r - minR) / Math.max(1, maxR - minR)) * (h - padY * 2);
              const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(p.rank)}`).join(" ");
              return (
                <>
                  <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}>
                    <div className="kpi">
                      <div className="kpi-label">현재 순위</div>
                      <div className="kpi-val">#{curR}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">최근 7일 평균</div>
                      <div className="kpi-val">#{avg7.toFixed(1)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">시작 대비</div>
                      <div className="kpi-val" style={{ color: change < 0 ? "#10b981" : "#ec4899" }}>
                        {change < 0 ? "▲" : change > 0 ? "▼" : "—"} {Math.abs(change)}계단
                      </div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Top 10 진입</div>
                      <div className="kpi-val">{inTop10}일</div>
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 100 }}>
                    <path d={path} fill="none" stroke="#1f2937" strokeWidth={2} />
                    {pts.map((p, i) => (
                      <circle key={i} cx={sx(i)} cy={sy(p.rank)} r={2.5} fill="#1f2937" />
                    ))}
                    {pts.map((p, i) =>
                      i % Math.ceil(pts.length / 8) === 0 ? (
                        <text key={`t-${i}`} x={sx(i)} y={h - 1} fontSize="8" textAnchor="middle" fill="#6b7280">
                          {p.date.slice(5)}
                        </text>
                      ) : null,
                    )}
                  </svg>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                    {pts.length}개 point · 낮을수록 좋음 ({pts[0]!.date} → {pts[pts.length - 1]!.date})
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* Creator × SKU GMV matrix panel — mockup line 1205-1221 */}
      {tab === "matrix" && (
        <div className="panel active">
          {(() => {
              // creator × product matrix — Kalodata 우선, 없으면 Helium 어필리에이트(skuVideoMap)
              type Cell = { gmv: number; videos: number };
              const matrix = new Map<string, Map<string, Cell>>(); // creator → (product → cell)
              const productGmv = new Map<string, number>();
              const creatorGmv = new Map<string, number>();
              const add = (handle: string, product: string, gmv: number) => {
                if (gmv <= 0) return;
                if (!matrix.has(handle)) matrix.set(handle, new Map());
                const cMap = matrix.get(handle)!;
                const cur = cMap.get(product) ?? { gmv: 0, videos: 0 };
                cur.gmv += gmv;
                cur.videos += 1;
                cMap.set(product, cur);
                productGmv.set(product, (productGmv.get(product) ?? 0) + gmv);
                creatorGmv.set(handle, (creatorGmv.get(handle) ?? 0) + gmv);
              };
              const useKalo = kalodataVideos && kalodataVideos.length > 0;
              if (useKalo) {
                for (const v of kalodataVideos!) {
                  add(v.creator_handle ?? "—", v.product_title ?? "기타", v.revenue_usd ?? 0);
                }
              } else {
                // Helium 어필리에이트 — skuVideoMap(asin → 영상[handle, gmv]) → asin을 제품명으로
                const asinName = new Map(
                  skus.map((s) => [s.asin ?? "", s.name ?? s.asin ?? "기타"] as const),
                );
                for (const [asin, vids] of Object.entries(skuVideoMap ?? {})) {
                  const product = (asinName.get(asin) ?? asin).slice(0, 40);
                  for (const v of vids) add(v.handle ?? "—", product, v.gmv ?? 0);
                }
              }
              if (creatorGmv.size === 0) {
                return (
                  <>
                    <div style={{ padding: 16, background: "#fef3c7", border: "1px dashed #fbbf24", borderRadius: 6, fontSize: 11, color: "#92400e", textAlign: "center" }}>
                      ⚠ Creator×SKU 매출 데이터 없음 — Kalodata LIST_VIDEO 또는 Helium 어필리에이트 CSV(제품 선택) 업로드 시 채워짐
                    </div>
                    {renderKalodataFallbackHint()}
                  </>
                );
              }
              // Top 5 creator, Top 4 product (각자 GMV 내림차순) + 기타
              const topCreators = [...creatorGmv.entries()]
                .sort(([, a], [, b]) => b - a).slice(0, 5).map(([h]) => h);
              const topProducts = [...productGmv.entries()]
                .sort(([, a], [, b]) => b - a).slice(0, 4).map(([p]) => p);
              return (
                <>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                    Creator × SKU별 GMV 기여 — 누가 어떤 SKU 잘 팔았나
                  </div>
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 130 }}>Creator</th>
                        {topProducts.map((p) => (
                          <th key={p} style={{ textAlign: "right" }} title={p}>
                            {p.length > 10 ? `${p.slice(0, 10)}…` : p}
                          </th>
                        ))}
                        <th style={{ textAlign: "right" }}>기타</th>
                        <th style={{ textAlign: "right" }}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCreators.map((handle) => {
                        const cMap = matrix.get(handle)!;
                        let restGmv = 0;
                        const cells = topProducts.map((p) => cMap.get(p)?.gmv ?? 0);
                        for (const [prod, cell] of cMap.entries()) {
                          if (!topProducts.includes(prod)) restGmv += cell.gmv;
                        }
                        const total = creatorGmv.get(handle) ?? 0;
                        const maxIdx = cells.indexOf(Math.max(...cells, restGmv));
                        return (
                          <tr key={handle}>
                            <td><b>@{handle.replace(/^@/, "")}</b></td>
                            {cells.map((g, i) => (
                              <td
                                key={i}
                                style={{
                                  textAlign: "right",
                                  fontFamily: "monospace",
                                  background: i === maxIdx ? "#fef3c7" : undefined,
                                  fontWeight: i === maxIdx ? 700 : 400,
                                }}
                              >
                                {formatUsdShort(g)}
                              </td>
                            ))}
                            <td
                              style={{
                                textAlign: "right",
                                fontFamily: "monospace",
                                background:
                                  restGmv > Math.max(...cells) ? "#fef3c7" : undefined,
                                fontWeight: restGmv > Math.max(...cells) ? 700 : 400,
                              }}
                            >
                              {formatUsdShort(restGmv)}
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                              {formatUsdShort(total)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#f9fafb", fontWeight: 700 }}>
                        <td>SKU 합계</td>
                        {topProducts.map((p) => (
                          <td key={p} style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {formatUsdShort(productGmv.get(p) ?? 0)}
                          </td>
                        ))}
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {formatUsdShort(
                            [...productGmv.entries()]
                              .filter(([p]) => !topProducts.includes(p))
                              .reduce((s, [, g]) => s + g, 0),
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {formatUsdShort([...productGmv.values()].reduce((s, g) => s + g, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {creatorGmv.size > 5 && (
                    <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 8 }}>
                      + {creatorGmv.size - 5}명 더보기
                    </div>
                  )}
                </>
              );
            })()
          }
        </div>
      )}

      {/* Affiliate code conversion panel */}
      {tab === "affiliate" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f3f4f6", border: "1px dashed #d1d5db", borderRadius: 6, fontSize: 11, color: "#6b7280", textAlign: "center" }}>
            데이터 source 없음 — 광고 promo code conversion 은 결제 attribution 필요.<br />
            지금은 E 섹션 광고 카드에서 promo code 추출만 (regex)
          </div>
        </div>
      )}

      {/* 영상별 매출 (Kalodata) panel — mockup line 1247-1264 */}
      {tab === "vid" && (
        <div className="panel active">
          {!kalodataVideos || kalodataVideos.length === 0 ? (
            (() => {
              // Kalodata 없으면 Helium 어필리에이트 GMV로 대체.
              //   page.tsx에서 작성자 GMV/판매량을 조회수 비중으로 영상별 분배(합계 보존) →
              //   여기선 영상 단위로 그대로 표시. (영상 1개 작성자 = 그 영상 매출 그대로)
              // selectedSku 선택 시 그 SKU 영상만 (전체면 모든 SKU)
              // selectedSku 선택 시 그 SKU 영상만. asin/제품명 함께 보존(전체일 때 SKU 표시용).
              const asinName = new Map(
                skus.map((s) => [s.asin ?? "", s.name ?? s.asin ?? ""] as const),
              );
              const allEntries = Object.entries(skuVideoMap ?? {});
              const entries =
                selectedSku !== "all"
                  ? allEntries.filter(([a]) => a === selectedSku)
                  : allEntries;
              const flat = entries
                .flatMap(([asin, list]) =>
                  list.map((v) => ({ ...v, asin, skuName: asinName.get(asin) ?? asin })),
                )
                .filter((v) => v.gmv != null && v.gmv > 0);
              const seen = new Set<string>();
              const vids = flat
                .filter((v) => {
                  if (seen.has(v.url)) return false;
                  seen.add(v.url);
                  return true;
                })
                .sort((a, b) => (b.gmv ?? 0) - (a.gmv ?? 0));
              if (vids.length === 0) {
                return (
                  <>
                    <div style={{ padding: 16, background: "#fef3c7", border: "1px dashed #fbbf24", borderRadius: 6, fontSize: 11, color: "#92400e", textAlign: "center" }}>
                      ⚠ Kalodata Video xlsx 미적재 — Kalodata LIST_VIDEO 업로드 또는 Helium 어필리에이트 CSV(제품 선택) 업로드 시 채워짐
                    </div>
                    {renderKalodataFallbackHint()}
                  </>
                );
              }
              const total = vids.reduce((s, v) => s + (v.gmv ?? 0), 0);
              const top10 = vids.slice(0, 10).reduce((s, v) => s + (v.gmv ?? 0), 0);
              return (
                <>
                  <div style={{ marginBottom: 10, padding: "6px 10px", fontSize: 10, color: "#1e3a8a", background: "#dbeafe", border: "1px dashed #3b82f6", borderRadius: 4 }}>
                    💡 Kalodata 미적재 → <b>Helium 어필리에이트 GMV(30일)</b> 기준. 작성자 GMV·판매량을 <b>조회수 비중</b>으로 영상별 분배 (합계 보존).
                  </div>
                  <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
                    <div className="kpi"><div className="kpi-label">매출 발생 영상</div><div className="kpi-val">{vids.length.toLocaleString()}</div></div>
                    <div className="kpi"><div className="kpi-label">총 GMV (영상 귀속)</div><div className="kpi-val">{formatUsdShort(total)}</div></div>
                    <div className="kpi"><div className="kpi-label">Top 10 영상 GMV 비중</div><div className="kpi-val">{total > 0 ? Math.round((top10 / total) * 100) : 0}%</div></div>
                  </div>
                  {/* 행 = 클릭 시 TikTok 임베드 펼침(details). 전체 SKU면 어떤 SKU인지 배지 표시. */}
                  <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
                    영상 클릭 → 임베드 재생 · {selectedSku === "all" ? "전체 SKU (SKU 배지 표시)" : "선택 SKU"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {vids.slice(0, vidShowAll ? vids.length : 30).map((v, i) => {
                      const id = extractTikTokVideoId(v.url);
                      return (
                        <details key={`${v.url}-${i}`} style={{ border: "1px solid #f3f4f6", borderRadius: 4, background: "white" }}>
                          <summary
                            style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", cursor: "pointer", listStyle: "none", fontSize: 11 }}
                          >
                            <span style={{ width: 12, color: "#6b7280" }}>{id ? "▶" : "↗"}</span>
                            {selectedSku === "all" && (
                              <span
                                title={v.skuName}
                                style={{ background: "#ede9fe", color: "#7c3aed", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}
                              >
                                {v.skuName.replace(/^\[New\]\s*/i, "").slice(0, 16)}
                              </span>
                            )}
                            <span style={{ fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.handle ? `@${v.handle}` : "—"}
                            </span>
                            <span style={{ fontFamily: "monospace", color: "#6b7280", fontSize: 10 }}>{v.views > 0 ? `${v.views.toLocaleString()}뷰` : ""}</span>
                            <span style={{ fontFamily: "monospace", color: "#6b7280", fontSize: 10 }}>{v.items != null ? `${Math.round(v.items)}판매` : ""}</span>
                            <span style={{ fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>${Math.round(v.gmv ?? 0).toLocaleString()}</span>
                          </summary>
                          {id ? (
                            <iframe
                              src={`https://www.tiktok.com/embed/v2/${id}`}
                              style={{ width: "100%", height: 500, border: "none", borderRadius: 6, background: "#f3f4f6" }}
                              loading="lazy"
                              allow="encrypted-media"
                              allowFullScreen
                              title={v.url}
                            />
                          ) : (
                            <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: 8, fontSize: 10, color: "#1d4ed8" }}>
                              외부 링크로 열기 ↗
                            </a>
                          )}
                        </details>
                      );
                    })}
                  </div>
                  {vids.length > 30 && (
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setVidShowAll(!vidShowAll)}
                        style={{ fontSize: 11, padding: "5px 14px", border: "1px solid #d1d5db", borderRadius: 4, background: "white", cursor: "pointer", fontFamily: "inherit", color: "#6b7280" }}
                      >
                        {vidShowAll ? `▲ 30개만 보기` : `▼ 전체 ${vids.length.toLocaleString()}개 영상 보기 (현재 30개)`}
                      </button>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            (() => {
              const videos = kalodataVideos;
              const withGmv = videos.filter((v) => (v.revenue_usd ?? 0) > 0);
              const totalGmv = withGmv.reduce((s, v) => s + (v.revenue_usd ?? 0), 0);
              const avgGmv = withGmv.length > 0 ? totalGmv / withGmv.length : 0;
              const sorted = [...withGmv].sort(
                (a, b) => (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0),
              );
              const top10Gmv = sorted.slice(0, 10).reduce((s, v) => s + (v.revenue_usd ?? 0), 0);
              const top10Pct = totalGmv > 0 ? Math.round((top10Gmv / totalGmv) * 100) : 0;
              return (
                <>
                  <div
                    className="kpi-grid"
                    style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}
                  >
                    <div className="kpi">
                      <div className="kpi-label">매출 발생 영상</div>
                      <div className="kpi-val">{withGmv.length.toLocaleString()}</div>
                      <div className="kpi-sub">총 {videos.length.toLocaleString()} 영상 중 {videos.length > 0 ? Math.round((withGmv.length / videos.length) * 100) : 0}%</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">영상당 평균 GMV</div>
                      <div className="kpi-val">{formatUsdShort(avgGmv)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Top 영상 1건 GMV</div>
                      <div className="kpi-val">{formatUsdShort(sorted[0]?.revenue_usd ?? 0)}</div>
                      <div className="kpi-sub">{sorted[0]?.creator_handle ?? "—"}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Top 10 영상 GMV 비중</div>
                      <div className="kpi-val">{top10Pct}%</div>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>영상</th>
                        <th>작성자</th>
                        <th>제품</th>
                        <th style={{ textAlign: "right" }}>조회</th>
                        <th style={{ textAlign: "right" }}>GMV 기여</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, 10).map((v, i) => (
                        <tr key={`${v.video_url}-${i}`}>
                          <td>
                            <a
                              href={v.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#1f2937" }}
                            >
                              {v.description && v.description.length > 30
                                ? `${v.description.slice(0, 30)}…`
                                : v.description ?? "—"}
                            </a>
                          </td>
                          <td>{v.creator_handle ?? "—"}</td>
                          <td title={v.product_title ?? ""}>
                            {v.product_title && v.product_title.length > 22
                              ? `${v.product_title.slice(0, 22)}…`
                              : v.product_title ?? "—"}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {formatViews(v.views)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#10b981",
                              fontWeight: 700,
                            }}
                          >
                            {formatUsdShort(v.revenue_usd ?? 0)}
                          </td>
                        </tr>
                      ))}
                      {sorted.length > 10 && (
                        <tr style={{ color: "#9ca3af" }}>
                          <td colSpan={5} style={{ textAlign: "center", padding: 8 }}>
                            + {sorted.length - 10} 영상 더보기
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* ★ BSR 상승 시점 panel (옛 MiniDashboard 기능 복원) */}
      {tab === "bsr" && (
        <div className="panel active">
          {/* 옛 BsrTrendChart — sales_snapshot BSR 시계열 line + ★ marker + 동반 영상 (Amazon Top 5 SKU) */}
          {bsrSeries && bsrSeries.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <BsrTrendChart
                bsrSeries={bsrSeries}
                inflections={bsrInflections}
                weeklyViews={weeklyViews}
              />
            </div>
          )}
          {(() => {
            const skusBsr = bsrSkus ?? [];
            if (skusBsr.length === 0) {
              return (
                <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                  Amazon BSR 데이터 없음 — Helium BSR export(ASIN별 BSR 시계열) 업로드 시 채워짐
                </div>
              );
            }
            const short = (n: string) => n.replace(/^\[New\]\s*/i, "").slice(0, 24);
            const selectedBsr = selectedSku !== "all" ? skusBsr.find((s) => s.asin === selectedSku) ?? null : null;
            const isIndividualTT = selectedSku !== "all" && !selectedBsr;
            const shown = selectedBsr ? [selectedBsr] : skusBsr;
            const allBsr = shown.flatMap((s) => s.series.map((p) => p.bsr));
            const allMonths = [...new Set(shown.flatMap((s) => s.series.map((p) => p.m)))].sort();
            const minB = Math.max(1, Math.min(...allBsr));
            const maxB = Math.max(...allBsr);
            const W = 620, H = 170, PX = 40, PY = 16;
            const lmin = Math.log(minB), lmax = Math.log(maxB) || lmin + 1;
            const xx = (m: string) => PX + (allMonths.length > 1 ? (allMonths.indexOf(m) / (allMonths.length - 1)) * (W - PX * 2) : 0);
            const yy = (bsr: number) => PY + ((Math.log(bsr) - lmin) / (lmax - lmin || 1)) * (H - PY * 2);
            const colors = ["#2563eb", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
            return (
              <>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                  {selectedBsr
                    ? `📉 ${short(selectedBsr.name)} BSR 추이 — 상승시점(▼) + 당시 브랜드 영상`
                    : isIndividualTT
                      ? "이 SKU는 TT샵 SKU라 Amazon BSR 없음 — Amazon SKU 선택 시 상승시점+영상 표시"
                      : "📉 전체 Amazon SKU BSR 추이 (낮을수록 좋은 랭크=위쪽). 개별 SKU 선택 시 상승시점+영상."}
                </div>
                {!isIndividualTT && (
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 180, background: "#fafafa", borderRadius: 6 }}>
                    <text x={4} y={yy(minB) + 3} fontSize="8" fill="#9ca3af">#{minB.toLocaleString()}</text>
                    <text x={4} y={yy(maxB) + 3} fontSize="8" fill="#9ca3af">#{Math.round(maxB / 1000)}K</text>
                    {shown.map((s, si) => {
                      const path = s.series.map((p, i) => `${i === 0 ? "M" : "L"} ${xx(p.m).toFixed(1)} ${yy(p.bsr).toFixed(1)}`).join(" ");
                      return (
                        <g key={s.asin}>
                          <path d={path} fill="none" stroke={colors[si % colors.length]} strokeWidth={1.6} />
                          {selectedBsr && s.inflections.map((inf, k) => (
                            <g key={k}>
                              <circle cx={xx(inf.month)} cy={yy(inf.to)} r={4} fill="#dc2626" />
                              <text x={xx(inf.month)} y={yy(inf.to) - 7} fontSize="8" textAnchor="middle" fill="#dc2626">▼{inf.month.slice(2)}</text>
                            </g>
                          ))}
                        </g>
                      );
                    })}
                    {allMonths.filter((_, i) => i % Math.max(1, Math.ceil(allMonths.length / 8)) === 0).map((m) => (
                      <text key={m} x={xx(m)} y={H - 2} fontSize="7" textAnchor="middle" fill="#9ca3af">{m.slice(2)}</text>
                    ))}
                  </svg>
                )}
                {!selectedBsr && !isIndividualTT && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 9 }}>
                    {shown.map((s, si) => (
                      <span key={s.asin} style={{ color: "#374151" }}>
                        <span style={{ display: "inline-block", width: 9, height: 9, background: colors[si % colors.length], borderRadius: 2, marginRight: 3, verticalAlign: "middle" }} />
                        {short(s.name)} (best #{Math.min(...s.series.map((p) => p.bsr)).toLocaleString()})
                      </span>
                    ))}
                  </div>
                )}
                {selectedBsr && (
                  selectedBsr.inflections.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#9ca3af", padding: 10 }}>뚜렷한 BSR 상승시점 없음 (전월比 40%+ 개선 기준)</div>
                  ) : (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {selectedBsr.inflections.map((inf, i) => (
                        <div key={i} style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 6, padding: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b" }}>
                            ▼ {inf.month} — BSR #{inf.from.toLocaleString()} → #{inf.to.toLocaleString()} ({Math.round((1 - inf.to / inf.from) * 100)}% 개선)
                          </div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>당시 브랜드 영상 (조회 Top {inf.videos.length}):</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                            {inf.videos.length === 0 ? (
                              <span style={{ fontSize: 10, color: "#9ca3af" }}>— 해당 월 영상 없음</span>
                            ) : inf.videos.map((v, j) => (
                              <a key={j} href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#1d4ed8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.caption ?? ""}>
                                {formatViews(v.views)}뷰 · {v.caption ? v.caption.slice(0, 50) : "(캡션 없음)"} ↗
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Live 매출 panel — mockup line 1266-1282 */}
      {tab === "live" && (
        <div className="panel active">
          {!kalodataLives || kalodataLives.length === 0 ? (
            <>
              <div style={{ padding: 16, background: "#fef3c7", border: "1px dashed #fbbf24", borderRadius: 6, fontSize: 11, color: "#92400e", textAlign: "center" }}>
                ⚠ Kalodata Live 데이터 미적재 — 위 KalodataSection 에서 텍스트 paste 시 Live 섹션도 함께 적재됨
              </div>
              {renderKalodataFallbackHint()}
            </>
          ) : (
            (() => {
              const lives = kalodataLives;
              const totalGmv = lives.reduce((s, l) => s + (l.revenue_usd ?? 0), 0);
              const avgViewer = lives.length > 0
                ? lives.reduce((s, l) => s + (l.views ?? 0), 0) / lives.length
                : 0;
              const avgGmv = lives.length > 0 ? totalGmv / lives.length : 0;
              return (
                <>
                  <div
                    className="kpi-grid"
                    style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}
                  >
                    <div className="kpi">
                      <div className="kpi-label">총 Live</div>
                      <div className="kpi-val">{lives.length.toLocaleString()}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Live GMV</div>
                      <div className="kpi-val">{formatUsdShort(totalGmv)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">평균 viewer</div>
                      <div className="kpi-val">{formatViews(avgViewer)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Live당 GMV</div>
                      <div className="kpi-val">{formatUsdShort(avgGmv)}</div>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>호스트</th>
                        <th style={{ textAlign: "right" }}>duration</th>
                        <th style={{ textAlign: "right" }}>viewer</th>
                        <th style={{ textAlign: "right" }}>GMV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lives.slice(0, 10).map((l, i) => (
                        <tr key={`${l.title}-${i}`}>
                          <td>{l.start_at ?? "—"}</td>
                          <td title={l.title}>
                            {l.title && l.title.length > 28 ? `${l.title.slice(0, 28)}…` : l.title}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {formatDuration(l.duration_s)}
                          </td>
                          <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                            {formatViews(l.views)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "#10b981",
                            }}
                          >
                            {formatUsdShort(l.revenue_usd ?? 0)}
                          </td>
                        </tr>
                      ))}
                      {lives.length > 10 && (
                        <tr style={{ color: "#9ca3af" }}>
                          <td colSpan={5} style={{ textAlign: "center", padding: 8 }}>
                            + {lives.length - 10} 라이브 더보기
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

function extractTikTokVideoId(url: string): string | null {
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

function formatUsdShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function formatViews(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}
