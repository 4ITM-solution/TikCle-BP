"use client";

import { useMemo, useState } from "react";
import type {
  Phase2Stats,
  Phase4bClusterStats,
  Phase5Stats,
} from "@/lib/inngest/types";

/**
 * SectionCMockup — mockup line 845-1023 1:1.
 *
 * 콘텐츠 포맷 분석:
 *   - sub-tabs 4 (통합 클러스터 / USP 키워드 / 시즈널리티 heatmap / paid·seeded·organic)
 *   - 통합 클러스터 panel: 채널 필터 (.ch-toggle) + 5 cluster row (.unified-cluster + .uc-h + .uc-rank + .uc-name + .uc-channels + .uc-ch-stat .tk/.ig/.yt + .uc-desc + .uc-metrics)
 *   - USP 인터랙티브 panel: .usp-grid (.usp-keyword + .uk-count) + .usp-detail (.ud-h + .ud-vid + .ud-vid-thumb)
 *   - heatmap panel: measure select + .heatmap grid (.cell + .lbl)
 *   - paid/seeded/organic panel: .dist-row 3 (ad/seeded/organic)
 */

type ChannelFilter = "all" | "tk" | "ig" | "yt";

export function SectionCMockup({
  phase2,
  phase4bClusters,
  phase5,
}: {
  phase2: Phase2Stats;
  phase4bClusters?: Phase4bClusterStats;
  phase5?: Phase5Stats;
}) {
  const [tab, setTab] = useState<"clu" | "usp" | "heat" | "paid">("clu");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [selectedKw, setSelectedKw] = useState<string | null>(null);
  const [heatMeasure, setHeatMeasure] = useState<"count" | "view" | "paid_pct">("count");

  // ── 통합 클러스터 panel ──
  const metas = phase4bClusters?.meta_clusters ?? [];

  // ── USP 키워드 panel ──
  const uspKws = (phase5?.usp_keywords ?? []).slice(0, 24);

  // ── heatmap panel — phase5.heatmap = tier × meta cluster ──
  const heatRows = phase5?.heatmap ?? [];
  const metaOrder = phase5?.meta_order ?? [];

  // ── paid/seeded/organic panel ──
  const totalPaid = phase2.monthly_video_counts.reduce((s, m) => s + m.paid, 0);
  const totalOrganic = phase2.monthly_video_counts.reduce((s, m) => s + m.organic, 0);
  const totalAll = totalPaid + totalOrganic || 1;
  const adPct = Math.round((totalPaid / totalAll) * 100);
  const organicPct = Math.round((totalOrganic / totalAll) * 100);
  // 채널별 ad 비중 (TK/IG/YT)
  const ch = phase2.monthly_by_channel;
  const chPct = (rows?: typeof phase2.monthly_video_counts) => {
    if (!rows) return null;
    const p = rows.reduce((s, m) => s + m.paid, 0);
    const t = rows.reduce((s, m) => s + m.total, 0);
    return t > 0 ? Math.round((p / t) * 100) : null;
  };
  const tkAdPct = chPct(ch?.tk ?? phase2.monthly_video_counts);
  const igAdPct = chPct(ch?.ig);
  const ytAdPct = chPct(ch?.yt);

  return (
    <div className="section" id="sec-c">
      <div className="section-h">
        <span className="letter">C</span>
        <span className="title">콘텐츠 포맷 분석</span>
        <span className="sub">★ 통합 클러스터 (TK + IG + YT) · USP 키워드 인터랙티브 · 시즈널리티 measure 선택</span>
      </div>

      <div className="sub-tabs">
        <button className={tab === "clu" ? "active" : ""} onClick={() => setTab("clu")}>
          통합 클러스터 ({metas.length})
        </button>
        <button className={tab === "usp" ? "active" : ""} onClick={() => setTab("usp")}>
          USP 키워드 ({uspKws.length})
        </button>
        <button className={tab === "heat" ? "active" : ""} onClick={() => setTab("heat")}>
          시즈널리티 heatmap
        </button>
        <button className={tab === "paid" ? "active" : ""} onClick={() => setTab("paid")}>
          paid/seeded/organic 분류
        </button>
      </div>

      {/* 통합 클러스터 panel */}
      {tab === "clu" && (
        <div className="panel active">
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>채널 필터:</span>
            <div className="ch-toggle">
              {(["all", "tk", "ig", "yt"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={channelFilter === m ? "active" : ""}
                  onClick={() => setChannelFilter(m)}
                >
                  {m === "all" ? `전 채널 (${(phase2.total_contents ?? 0) + (phase2.ig_total_videos ?? 0) + (phase2.yt_total_videos ?? 0)} 영상)` :
                   m === "tk" ? "TikTok만" : m === "ig" ? "IG만" : "YT만"}
                </button>
              ))}
            </div>
          </div>

          {metas.length === 0 ? (
            <div
              style={{
                padding: 16,
                background: "#f9fafb",
                borderRadius: 6,
                fontSize: 11,
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              —
            </div>
          ) : (
            metas.map((m, i) => (
              <div key={m.id} className="unified-cluster">
                <div className="uc-h">
                  <span className="uc-rank">{i + 1}</span>
                  <span className="uc-name">{m.name}</span>
                  <div className="uc-channels">
                    <span style={{ color: "#9ca3af", fontSize: 10 }}>
                      → {m.member_count} 영상 · 자식 {m.child_clusters.length}개
                    </span>
                  </div>
                </div>
                <div className="uc-desc">{m.description || "—"}</div>
                <div className="uc-metrics">
                  {m.child_clusters.map((c) => `${c.name} (${c.member_count})`).join(" · ")}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* USP 키워드 panel */}
      {tab === "usp" && (
        <div className="panel active">
          {uspKws.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              —
            </div>
          ) : (
            <div className="usp-grid">
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>USP 키워드 (클릭 시 →)</div>
                <div>
                  {uspKws.map((k) => (
                    <span
                      key={k.keyword}
                      className={`usp-keyword ${selectedKw === k.keyword ? "active" : ""}`}
                      onClick={() => setSelectedKw(k.keyword)}
                      style={{ cursor: "pointer" }}
                    >
                      {k.keyword} <span className="uk-count">{k.count}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="usp-detail">
                {selectedKw ? (
                  <div className="ud-h">"{selectedKw}"</div>
                ) : (
                  <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", padding: 20 }}>
                    ← 좌측에서 키워드 클릭
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* heatmap panel */}
      {tab === "heat" && (
        <div className="panel active">
          <div className="heat-toolbar">
            <span style={{ fontSize: 11, color: "#6b7280" }}>measure:</span>
            <select
              value={heatMeasure}
              onChange={(e) => setHeatMeasure(e.target.value as typeof heatMeasure)}
              style={{ padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 }}
            >
              <option value="count">영상 수</option>
              <option value="view">view 합산</option>
              <option value="paid_pct">paid 비중</option>
            </select>
          </div>
          {heatRows.length === 0 || metaOrder.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              —
            </div>
          ) : (
            <div
              className="heatmap"
              style={{
                display: "grid",
                gridTemplateColumns: `120px repeat(${metaOrder.length}, 1fr)`,
                gap: 2,
                fontSize: 10,
              }}
            >
              <div className="lbl" />
              {metaOrder.map((m) => (
                <div key={m.id} className="lbl" title={m.name}>
                  {m.name.length > 8 ? `${m.name.slice(0, 8)}…` : m.name}
                </div>
              ))}
              {heatRows.map((row) => {
                const cellMap = new Map(row.cells.map((c) => [c.meta_id, c]));
                const allVals = row.cells.map((c) =>
                  heatMeasure === "count" ? c.video_count :
                  heatMeasure === "view" ? c.views_sum :
                  c.views_pct,
                );
                const maxV = Math.max(...allVals, 1);
                return (
                  <div style={{ display: "contents" }} key={row.tier}>
                    <div className="lbl">{row.tier}</div>
                    {metaOrder.map((m) => {
                      const c = cellMap.get(m.id);
                      const v = !c ? 0 :
                        heatMeasure === "count" ? c.video_count :
                        heatMeasure === "view" ? c.views_sum :
                        c.views_pct;
                      const intensity = v / maxV;
                      const bg = intensity > 0.8 ? "#7f1d1d" :
                                 intensity > 0.6 ? "#dc2626" :
                                 intensity > 0.4 ? "#ea580c" :
                                 intensity > 0.25 ? "#d97706" :
                                 intensity > 0.1 ? "#f59e0b" :
                                 intensity > 0 ? "#fcd34d" : "#fde68a";
                      return (
                        <div
                          key={m.id}
                          className="cell"
                          style={{ background: bg, color: intensity > 0.5 ? "white" : "#374151" }}
                          title={`${row.tier} · ${m.name}: ${v}`}
                        >
                          {v > 0 ? (heatMeasure === "view" && v >= 1000 ? `${Math.round(v/1000)}K` : v) : ""}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* paid/seeded/organic panel */}
      {tab === "paid" && (
        <div className="panel active">
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
            전 채널 콘텐츠 FTC 자동 분류 (paid_signal · is_ad / promoted 기반)
          </div>
          <div className="dist-row">
            <span style={{ color: "#ec4899" }}>●ad</span>
            <div className="dist-bar">
              <div className="dist-fill ig" style={{ width: `${adPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalPaid.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{adPct}%</span>
          </div>
          <div className="dist-row">
            <span style={{ color: "#10b981" }}>●organic</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ background: "#10b981", width: `${organicPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalOrganic.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{organicPct}%</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "#6b7280" }}>
            채널별 ad 비중:{" "}
            {[
              tkAdPct != null ? `TK ${tkAdPct}%` : null,
              igAdPct != null ? `IG ${igAdPct}%` : null,
              ytAdPct != null ? `YT ${ytAdPct}%` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
