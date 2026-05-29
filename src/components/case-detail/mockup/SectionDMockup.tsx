"use client";

import { useState } from "react";
import type {
  DisplayedVideoEntry,
  Phase2Stats,
  Phase4bSkuStats,
  Phase5Stats,
} from "@/lib/inngest/types";
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
}: {
  phase2: Phase2Stats;
  phase4bSku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
}) {
  const [tab, setTab] = useState<Tab>("sku");
  const [selectedSku, setSelectedSku] = useState<string>("all");
  const onSelectSku = setSelectedSku;

  if (!phase2.sales_summary) return null;

  const summary = phase2.sales_summary;
  const skus = phase2.sku_sales;
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

      {/* 채널 + 기간 toggle (prototype) */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>채널:</span>
          <div className="ch-toggle">
            <button className="active">
              TT Shop {totalRev > 0 ? `(${formatUsdShort(totalRev)})` : ""}
            </button>
            <button style={{ opacity: 0.4, cursor: "not-allowed" }} disabled>
              Amazon
            </button>
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

      {/* SKU 매출 표 panel */}
      {tab === "sku" && (
        <div className="panel active">
          <table>
            <thead>
              <tr>
                <th>제품</th>
                <th>ASIN</th>
                <th style={{ textAlign: "right" }}>30d GMV</th>
                <th style={{ textAlign: "right" }}>판매</th>
                <th style={{ textAlign: "right" }}>BSR</th>
              </tr>
            </thead>
            <tbody>
              {skus
                .filter((s) => selectedSku === "all" || s.asin === selectedSku)
                .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
                .map((s) => (
                  <tr key={s.asin}>
                    <td>
                      <b>
                        {s.name && s.name.length > 50 ? `${s.name.slice(0, 50)}…` : s.name}
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
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#9ca3af" }}>
                      —
                    </td>
                  </tr>
                ))}
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

      {/* Creator × SKU GMV matrix panel */}
      {tab === "matrix" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            —
          </div>
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

      {/* 영상별 매출 (Kalodata) panel */}
      {tab === "vid" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            —
          </div>
        </div>
      )}

      {/* Live 매출 panel */}
      {tab === "live" && (
        <div className="panel active">
          <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
            —
          </div>
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
