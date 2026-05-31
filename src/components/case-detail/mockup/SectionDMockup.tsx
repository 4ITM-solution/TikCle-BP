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

type Tab = "sku" | "rank" | "matrix" | "affiliate" | "vid" | "live";

export function SectionDMockup({
  phase2,
  phase4bSku,
  caseChannel,
  availableSalesChannels,
  skuChannelMap,
  kalodataVideos,
  kalodataLives,
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
  kalodataVideos?: KalodataVideoXlsxRow[];
  kalodataLives?: KalodataLiveRow[];
}) {
  const [tab, setTab] = useState<Tab>("sku");
  const [selectedSku, setSelectedSku] = useState<string>("all");
  const onSelectSku = setSelectedSku;

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

  // 매칭 영상 — phase4bSku.displayed_videos 에서 sku.asin 매칭
  const allDisplayed = phase4bSku?.displayed_videos ?? [];
  const matchedFor = (asin: string): DisplayedVideoEntry[] => {
    if (!asin) return [];
    return allDisplayed
      .filter(
        (v) =>
          (v.views ?? 0) >= 500_000 &&
          v.confidence === "high" &&
          Array.isArray(v.matched_skus) &&
          v.matched_skus.includes(asin),
      )
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 5);
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

      {/* SKU selector — mockup line 1043-1061 */}
      <div
        style={{
          background: "linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)",
          border: "1.5px solid #d97706",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#92400e", fontWeight: 700 }}>🎯 SKU 필터:</span>
          <span style={{ fontSize: 10, color: "#b45309" }}>
            선택한 SKU 기준으로 아래 모든 차트/표가 갱신
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(skus.length + 1, 9)}, 1fr)`,
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => onSelectSku("all")}
            style={{
              padding: "6px 4px",
              fontSize: 10,
              border: "1px solid #d97706",
              background: selectedSku === "all" ? "#1f2937" : "white",
              color: selectedSku === "all" ? "white" : "#92400e",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 700,
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
                padding: "6px 4px",
                fontSize: 10,
                border: "1px solid #fde68a",
                background: selectedSku === s.asin ? "#1f2937" : "white",
                color: selectedSku === s.asin ? "white" : "#92400e",
                borderRadius: 4,
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={s.name}
            >
              {s.name && s.name.length > 14 ? `${s.name.slice(0, 14)}…` : s.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#92400e", marginTop: 6, fontWeight: 600 }}>
          현재 선택:{" "}
          <b>
            {selectedSku === "all"
              ? `전체 ${skus.length} SKU`
              : skus.find((s) => s.asin === selectedSku)?.name ?? selectedSku}
          </b>{" "}
          · 30일 GMV {formatUsdShort(totalRev)}
          {totalUnits > 0 && ` · ${totalUnits.toLocaleString()} 단위 판매`}
        </div>
      </div>

      {/* SKU 헬스 KPI 3 card */}
      <SkuHealthCards phase2={phase2} phase4bSku={phase4bSku} selectedSku={selectedSku} />

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

      {/* 히어로 SKU × 메가 viral 영상 (mockup 1097) */}
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 16 }}>
        ⭐ 히어로 SKU × 메가 viral 영상 (1M+ views 매칭)
      </div>
      <div className="hero-grid">
        {heroSkus.map((sku, i) => {
          const skuAsin = sku.asin ?? "";
          const matched = matchedFor(skuAsin);
          const pct =
            totalRev > 0 && (sku.revenue ?? 0) > 0
              ? Math.round(((sku.revenue ?? 0) / totalRev) * 100)
              : 0;
          return (
            <div key={skuAsin || i} className="hero-card">
              <div className="hc-rank">Top {i + 1} 매출</div>
              <div className="hc-sku" title={sku.name}>
                {sku.name && sku.name.length > 28 ? `${sku.name.slice(0, 28)}…` : sku.name}
              </div>
              <div className="hc-rev">
                {formatUsdShort(sku.revenue ?? 0)} · {pct}%
              </div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                매칭 영상 {matched.length}개{matched.length > 0 ? " (high confidence)" : ""}
              </div>
              {matched.length > 0 && (
                <div className="hero-videos">
                  {matched.map((v) => (
                    <a
                      key={v.content_id}
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hero-vid"
                      style={{
                        textDecoration: "none",
                        display: "block",
                        position: "relative",
                        background: v.thumbnail_url
                          ? `url(${v.thumbnail_url}) center/cover`
                          : "#f3f4f6",
                      }}
                    >
                      <div className="hero-vid-meta">{formatViews(v.views)} · TK</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
        ★ 매출 Top 3 × 1M+ views 영상으로 마케팅 주력 판정 (Phase 4b.5 SKU 매칭, high confidence만)
      </div>

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
                <th style={{ textAlign: "right" }}>동반 영상</th>
              </tr>
            </thead>
            <tbody>
              {skus
                .filter((s) => selectedSku === "all" || s.asin === selectedSku)
                .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
                .map((s) => {
                  const matched = allDisplayed.filter((v) =>
                    Array.isArray(v.matched_skus) && s.asin && v.matched_skus.includes(s.asin),
                  ).length;
                  return (
                    <tr key={s.asin}>
                      <td>
                        <b>
                          {s.name && s.name.length > 40 ? `${s.name.slice(0, 40)}…` : s.name}
                        </b>
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
                        {s.category ?? "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>
                        {s.launch_date ?? "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>
                        {s.price != null ? `$${s.price.toLocaleString()}` : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: "#10b981",
                          fontWeight: 700,
                        }}
                      >
                        {formatUsdShort(s.revenue ?? 0)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {(s.units ?? 0).toLocaleString()}
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
        </div>
      )}

      {/* 카테고리 ranking 시계열 panel */}
      {tab === "rank" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            —
          </div>
        </div>
      )}

      {/* Creator × SKU GMV matrix panel — mockup line 1205-1221 */}
      {tab === "matrix" && (
        <div className="panel active">
          {!kalodataVideos || kalodataVideos.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              —
            </div>
          ) : (
            (() => {
              // creator × product matrix
              type Cell = { gmv: number; videos: number };
              const matrix = new Map<string, Map<string, Cell>>(); // creator → (product → cell)
              const productGmv = new Map<string, number>();
              const creatorGmv = new Map<string, number>();
              for (const v of kalodataVideos) {
                const handle = v.creator_handle ?? "—";
                const product = v.product_title ?? "기타";
                const gmv = v.revenue_usd ?? 0;
                if (gmv <= 0) continue;
                if (!matrix.has(handle)) matrix.set(handle, new Map());
                const cMap = matrix.get(handle)!;
                const cur = cMap.get(product) ?? { gmv: 0, videos: 0 };
                cur.gmv += gmv;
                cur.videos += 1;
                cMap.set(product, cur);
                productGmv.set(product, (productGmv.get(product) ?? 0) + gmv);
                creatorGmv.set(handle, (creatorGmv.get(handle) ?? 0) + gmv);
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
          )}
        </div>
      )}

      {/* Affiliate code conversion panel */}
      {tab === "affiliate" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            —
          </div>
        </div>
      )}

      {/* 영상별 매출 (Kalodata) panel — mockup line 1247-1264 */}
      {tab === "vid" && (
        <div className="panel active">
          {!kalodataVideos || kalodataVideos.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              —
            </div>
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

      {/* Live 매출 panel — mockup line 1266-1282 */}
      {tab === "live" && (
        <div className="panel active">
          {!kalodataLives || kalodataLives.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              —
            </div>
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
