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
  clusterChannelBreakdown,
  clusterMetrics,
  uspSampleVideos,
  clusterGmvByMonth,
  tierClusterHeatmap,
  clusterTopVideos,
}: {
  phase2: Phase2Stats;
  phase4bClusters?: Phase4bClusterStats;
  phase5?: Phase5Stats;
  /** meta_cluster_id → { tk, ig, yt } 멤버 채널 분포 (page.tsx 에서 server-side SQL) */
  clusterChannelBreakdown?: Record<string, { tk: number; ig: number; yt: number }>;
  /** meta_cluster_id → { avg_views, paid_count, save_rate_pct, member_count } — uc-metrics 용 */
  clusterMetrics?: Record<string, { avg_views: number; paid_count: number; save_rate_pct: number; member_count: number }>;
  /** USP 키워드 → top 3 매칭 영상 (caption ilike) — page.tsx SQL */
  uspSampleVideos?: Record<string, Array<{ url: string; caption: string; views: number }>>;
  /** meta_cluster_id → { "YYYY-MM": gmv_usd } — heatmap GMV measure 용 (Kalodata 매칭) */
  clusterGmvByMonth?: Record<string, Record<string, number>>;
  /** 옛 MiniDashboard 의 tier × meta 앵글 히트맵 (page.tsx server SQL) */
  tierClusterHeatmap?: {
    tiers: string[];
    metas: Array<{ id: string; name: string }>;
    cells: Record<string, Record<string, number>>;
  };
  /** 각 cluster 별 top view 영상 3개 (page.tsx server SQL) — cluster row 안 임베드/링크 */
  clusterTopVideos?: Record<string, Array<{ url: string; views: number; caption: string | null }>>;
}) {
  const [tab, setTab] = useState<"clu" | "usp" | "heat" | "tier" | "paid">("clu");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [selectedKw, setSelectedKw] = useState<string | null>(null);
  const [heatMeasure, setHeatMeasure] = useState<"count" | "view" | "paid_pct" | "gmv">("count");
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  // ── 통합 클러스터 panel ── (채널 filter 적용)
  const metasAll = phase4bClusters?.meta_clusters ?? [];
  const metas = channelFilter === "all"
    ? metasAll
    : metasAll.filter((m) => {
        const ch = clusterChannelBreakdown?.[m.id];
        if (!ch) return false;
        if (channelFilter === "tk") return ch.tk > 0;
        if (channelFilter === "ig") return ch.ig > 0;
        if (channelFilter === "yt") return ch.yt > 0;
        return true;
      });

  // ── USP 키워드 panel ──
  const uspKws = (phase5?.usp_keywords ?? []).slice(0, 24);

  // ── heatmap panel — phase5.heatmap = cluster × month (mockup 1:1) ──
  const heatRows = phase5?.heatmap ?? [];
  const monthOrder = phase5?.month_order ?? [];

  // ── paid/seeded/organic panel ──
  const totalPaid = phase2.monthly_video_counts.reduce((s, m) => s + m.paid, 0);
  const totalSeeded = phase2.total_seeded ?? 0;
  // organic 에서 seeded 빼면 실 organic
  const totalOrganicRaw = phase2.monthly_video_counts.reduce((s, m) => s + m.organic, 0);
  const totalOrganic = Math.max(0, totalOrganicRaw - totalSeeded);
  const totalAll = totalPaid + totalSeeded + totalOrganic || 1;
  const adPct = Math.round((totalPaid / totalAll) * 100);
  const seededPct = Math.round((totalSeeded / totalAll) * 100);
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
        <button className={tab === "tier" ? "active" : ""} onClick={() => setTab("tier")}>
          ★ 티어 × 앵글 (옛 MD)
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
              {(["all", "tk", "ig", "yt"] as const).map((m) => {
                const countFor = (k: typeof m) => {
                  if (k === "all") return metasAll.length;
                  return metasAll.filter((mc) => {
                    const ch = clusterChannelBreakdown?.[mc.id];
                    if (!ch) return false;
                    return ch[k] > 0;
                  }).length;
                };
                const cnt = countFor(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={channelFilter === m ? "active" : ""}
                    onClick={() => setChannelFilter(m)}
                    disabled={m !== "all" && cnt === 0}
                    style={m !== "all" && cnt === 0 ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    title={cnt === 0 ? "이 채널 cluster 없음" : `${cnt}개 cluster`}
                  >
                    {m === "all" ? `전 채널 (${cnt} cluster)` :
                     m === "tk" ? `TikTok (${cnt})` : m === "ig" ? `IG (${cnt})` : `YT (${cnt})`}
                  </button>
                );
              })}
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
            metas.map((m, i) => {
              const ch = clusterChannelBreakdown?.[m.id];
              const cm = clusterMetrics?.[m.id];
              const paidPct =
                cm && cm.member_count > 0 ? Math.round((cm.paid_count / cm.member_count) * 100) : 0;
              const fmtV = (n: number) =>
                n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
              const isExpanded = expandedCluster === m.id;
              const top3 = clusterTopVideos?.[m.id] ?? [];
              return (
                <div
                  key={m.id}
                  className="unified-cluster"
                  onClick={() => top3.length > 0 && setExpandedCluster(isExpanded ? null : m.id)}
                  style={{
                    cursor: top3.length > 0 ? "pointer" : "default",
                    background: isExpanded ? "#fef3c7" : undefined,
                  }}
                  title={top3.length > 0 ? "클릭하여 Top 3 영상 임베드 보기" : "영상 데이터 없음"}
                >
                  <div className="uc-h">
                    <span className="uc-rank">{i + 1}</span>
                    <span className="uc-name">
                      {m.name}
                      {top3.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: "#92400e" }}>
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      )}
                    </span>
                    <div className="uc-channels">
                      {ch && (
                        <>
                          <span className={`uc-ch-stat tk ${ch.tk > 0 ? "" : "off"}`}>TK {ch.tk}</span>
                          <span className={`uc-ch-stat ig ${ch.ig > 0 ? "" : "off"}`}>IG {ch.ig}</span>
                          <span className={`uc-ch-stat yt ${ch.yt > 0 ? "" : "off"}`}>YT {ch.yt}</span>
                        </>
                      )}
                      <span style={{ color: "#9ca3af", fontSize: 10 }}>
                        → 전체 {m.member_count} 영상
                      </span>
                    </div>
                  </div>
                  <div className="uc-desc">{m.description || "—"}</div>
                  <div className="uc-metrics">
                    {cm && cm.member_count > 0 ? (
                      <>
                        avg views {fmtV(cm.avg_views)}
                        {cm.save_rate_pct > 0 && ` · save ${cm.save_rate_pct.toFixed(1)}%`}
                        {paidPct > 0 && ` · paid ${paidPct}%`}
                        {" · "}
                        {m.child_clusters.length} 자식 cluster
                      </>
                    ) : (
                      m.child_clusters.map((c) => `${c.name} (${c.member_count})`).join(" · ")
                    )}
                  </div>
                  {/* 클러스터 카드 클릭 → Top 3 영상 iframe 임베드 */}
                  {isExpanded && top3.length > 0 && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.min(top3.length, 3)}, 1fr)`,
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px dashed #f3f4f6",
                      }}
                    >
                      {top3.map((v, vi) => {
                        const tkMatch = (v.url ?? "").match(/\/(?:video|photo)\/(\d+)/);
                        const tkId = tkMatch?.[1] ?? null;
                        return (
                          <div key={vi} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontSize: 9, color: "#92400e", display: "flex", justifyContent: "space-between" }}>
                              <span>#{vi + 1} · {fmtV(v.views)} views</span>
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#1d4ed8", textDecoration: "none" }}
                              >
                                ↗
                              </a>
                            </div>
                            {tkId ? (
                              <iframe
                                src={`https://www.tiktok.com/embed/v2/${tkId}`}
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
                                  textAlign: "center",
                                  fontSize: 10,
                                  background: "#f3f4f6",
                                  borderRadius: 4,
                                  color: "#1f2937",
                                }}
                              >
                                ↗ 외부 열기
                              </a>
                            )}
                            {v.caption && (
                              <div
                                style={{
                                  fontSize: 9,
                                  color: "#6b7280",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={v.caption}
                              >
                                {v.caption.length > 32 ? `${v.caption.slice(0, 32)}…` : v.caption}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
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
                  {uspKws.map((k) => {
                    // mockup line 957-958: CTA 키워드 (link in bio / code XXX) 노란 highlight
                    const isCta =
                      /^(link\s*in\s*bio|code\s|promo|use\s+code|coupon|discount|sale)/i.test(k.keyword) ||
                      /^\d{2,}off$/i.test(k.keyword);
                    return (
                      <span
                        key={k.keyword}
                        className={`usp-keyword ${selectedKw === k.keyword ? "active" : ""}`}
                        onClick={() => setSelectedKw(k.keyword)}
                        style={{
                          cursor: "pointer",
                          ...(isCta && selectedKw !== k.keyword
                            ? { background: "#fef3c7", borderColor: "#d97706" }
                            : {}),
                        }}
                      >
                        {k.keyword} <span className="uk-count">{k.count}{isCta ? " CTA" : ""}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="usp-detail">
                {selectedKw ? (
                  (() => {
                    const vids = uspSampleVideos?.[selectedKw] ?? [];
                    const kw = uspKws.find((k) => k.keyword === selectedKw);
                    return (
                      <>
                        <div className="ud-h">★ "{selectedKw}" 등장 영상 {kw?.count ?? 0}건</div>
                        {vids.length === 0 ? (
                          <div style={{ fontSize: 10, color: "#9ca3af", padding: 8 }}>
                            매칭 영상 미수집
                          </div>
                        ) : (
                          vids.map((v, i) => (
                            <a
                              key={i}
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ud-vid"
                              style={{
                                textDecoration: "none",
                                color: "inherit",
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                padding: 6,
                                borderTop: "1px solid #f3f4f6",
                              }}
                            >
                              <div className="ud-vid-thumb" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={v.caption}
                                >
                                  {v.caption.length > 36 ? `${v.caption.slice(0, 36)}…` : v.caption}
                                </div>
                                <div style={{ fontSize: 10, color: "#6b7280" }}>
                                  {v.views >= 1_000_000
                                    ? `${(v.views / 1_000_000).toFixed(1)}M`
                                    : v.views >= 1_000
                                      ? `${Math.round(v.views / 1_000)}K`
                                      : v.views.toLocaleString()}{" "}
                                  views
                                </div>
                              </div>
                            </a>
                          ))
                        )}
                      </>
                    );
                  })()
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
              <option value="gmv">★ GMV 기여 (Kalodata)</option>
            </select>
            {heatMeasure === "gmv" && (
              <span style={{ fontSize: 10, color: "#9ca3af" }}>
                ★ Kalodata 영상매출 매칭 — D 섹션과 연결
              </span>
            )}
          </div>
          {heatRows.length === 0 || monthOrder.length === 0 ? (
            // mockup 빈 case placeholder — cluster 이름 + 12개월 grid 형태만 잡고
            // 회색 그라데이션으로 "데이터 적재되면 이렇게 보일 것" 시각화
            (() => {
              const sampleClusters = metas.slice(0, 5).map((m) => m.name);
              const fallbackClusters = sampleClusters.length > 0
                ? sampleClusters
                : ["클러스터 1", "클러스터 2", "클러스터 3"];
              // 최근 12개월 (현재월 기준)
              const today = new Date();
              const months: string[] = [];
              for (let i = 11; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                months.push(String(d.getMonth() + 1).padStart(2, "0"));
              }
              return (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginBottom: 10,
                      padding: "8px 12px",
                      background: "#fef3c7",
                      borderRadius: 4,
                      border: "1px dashed #fbbf24",
                    }}
                  >
                    ⚠ heatmap 데이터 미수집 — Phase 5 (포지셔닝 분석) 돌아간 후 채워집니다. 아래는 형태 미리보기.
                  </div>
                  <div
                    className="heatmap"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `140px repeat(12, 1fr)`,
                      gap: 2,
                      fontSize: 10,
                      opacity: 0.55,
                    }}
                  >
                    <div className="lbl" />
                    {months.map((m, i) => (
                      <div key={i} className="lbl">{m}</div>
                    ))}
                    {fallbackClusters.map((nm) => (
                      <div style={{ display: "contents" }} key={nm}>
                        <div
                          className="lbl"
                          style={{ color: "#9ca3af" }}
                          title={nm}
                        >
                          {nm.length > 14 ? `${nm.slice(0, 14)}…` : nm}
                        </div>
                        {months.map((_, i) => (
                          <div
                            key={i}
                            className="cell"
                            style={{
                              background: "#f3f4f6",
                              color: "#d1d5db",
                            }}
                          >
                            —
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            // mockup line 999-1011: cluster × month grid
            <div
              className="heatmap"
              style={{
                display: "grid",
                gridTemplateColumns: `140px repeat(${monthOrder.length}, 1fr)`,
                gap: 2,
                fontSize: 10,
              }}
            >
              <div className="lbl" />
              {monthOrder.map((mo) => (
                <div key={mo} className="lbl">
                  {mo.slice(5)}
                </div>
              ))}
              {heatRows.map((row) => {
                const gmvMap = clusterGmvByMonth?.[row.meta_id] ?? {};
                const valueOf = (c: typeof row.cells[number]) => {
                  if (heatMeasure === "count") return c.video_count;
                  if (heatMeasure === "view") return c.views_sum;
                  if (heatMeasure === "paid_pct") {
                    return c.video_count > 0 ? Math.round((c.paid_count / c.video_count) * 100) : 0;
                  }
                  // gmv
                  return Math.round(gmvMap[c.month] ?? 0);
                };
                const allVals = row.cells.map(valueOf);
                const maxV = Math.max(...allVals, 1);
                return (
                  <div style={{ display: "contents" }} key={row.meta_id}>
                    <div className="lbl" title={row.meta_name}>
                      {row.meta_name.length > 14
                        ? `${row.meta_name.slice(0, 14)}…`
                        : row.meta_name}
                    </div>
                    {row.cells.map((c) => {
                      const v = valueOf(c);
                      const intensity = v / maxV;
                      const bg = intensity > 0.8 ? "#7f1d1d" :
                                 intensity > 0.6 ? "#dc2626" :
                                 intensity > 0.4 ? "#ea580c" :
                                 intensity > 0.25 ? "#d97706" :
                                 intensity > 0.1 ? "#f59e0b" :
                                 intensity > 0 ? "#fcd34d" : "#fde68a";
                      const fmt =
                        heatMeasure === "gmv"
                          ? (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` :
                             v >= 1000 ? `$${Math.round(v / 1000)}K` :
                             v > 0 ? `$${v}` : "")
                          : heatMeasure === "view" && v >= 1000
                            ? `${Math.round(v / 1000)}K`
                            : (v > 0 ? `${v}${heatMeasure === "paid_pct" ? "%" : ""}` : "");
                      return (
                        <div
                          key={c.month}
                          className="cell"
                          style={{ background: bg, color: intensity > 0.5 ? "white" : "#374151" }}
                          title={`${row.meta_name} · ${c.month}: ${fmt || v}`}
                        >
                          {fmt}
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

      {/* ★ 티어 × 앵글 (옛 MiniDashboard 기능 복원) panel */}
      {tab === "tier" && (
        <div className="panel active">
          {!tierClusterHeatmap || tierClusterHeatmap.metas.length === 0 ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              cluster 데이터 미수집 — Phase 4b.4 돌면 채워짐
            </div>
          ) : (
            (() => {
              const { tiers, metas, cells } = tierClusterHeatmap;
              // 표시할 tier 만 (cell 0 아닌 행)
              const tiersToShow = tiers.filter((t) =>
                metas.some((m) => (cells[t]?.[m.id] ?? 0) > 0),
              );
              if (tiersToShow.length === 0) {
                return (
                  <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                    cluster member 와 인플 매칭 없음
                  </div>
                );
              }
              const TIER_LABEL: Record<string, string> = {
                mega: "Mega (1M+)", macro: "Macro (500K+)", mid: "Mid (100K+)",
                micro: "Micro (10K+)", nano: "Nano (1K+)", "sub-nano": "Sub-nano", unknown: "Unknown",
              };
              const maxV = Math.max(
                ...tiersToShow.flatMap((t) => metas.map((m) => cells[t]?.[m.id] ?? 0)),
                1,
              );
              return (
                <>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                    어떤 인플 티어가 어떤 콘텐츠 앵글(meta cluster)에 집중하는지 — 영상 수 cross-tab
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `140px repeat(${metas.length}, minmax(110px, 1fr))`,
                      gap: 2,
                      fontSize: 10,
                      overflowX: "auto",
                    }}
                  >
                    <div className="lbl" />
                    {metas.map((m) => (
                      <div
                        key={m.id}
                        className="lbl"
                        title={m.name}
                        style={{
                          padding: "4px 6px",
                          whiteSpace: "normal",
                          wordBreak: "keep-all",
                          textAlign: "center",
                          fontWeight: 600,
                          lineHeight: 1.3,
                        }}
                      >
                        {m.name}
                      </div>
                    ))}
                    {tiersToShow.map((t) => (
                      <div style={{ display: "contents" }} key={t}>
                        <div className="lbl" style={{ fontWeight: 700, textAlign: "right", paddingRight: 6 }}>
                          {TIER_LABEL[t] ?? t}
                        </div>
                        {metas.map((m) => {
                          const v = cells[t]?.[m.id] ?? 0;
                          const intensity = v / maxV;
                          const bg = intensity > 0.8 ? "#7f1d1d" :
                                     intensity > 0.6 ? "#dc2626" :
                                     intensity > 0.4 ? "#ea580c" :
                                     intensity > 0.25 ? "#d97706" :
                                     intensity > 0.1 ? "#f59e0b" :
                                     intensity > 0 ? "#fcd34d" : "#f3f4f6";
                          return (
                            <div
                              key={m.id}
                              className="cell"
                              style={{ background: bg, color: intensity > 0.5 ? "white" : "#374151" }}
                              title={`${TIER_LABEL[t]} × ${m.name}: ${v} 영상`}
                            >
                              {v > 0 ? v : ""}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()
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
            <span style={{ color: "#f59e0b" }}>●seeded</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ background: "#f59e0b", width: `${seededPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalSeeded.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{seededPct}%</span>
          </div>
          <div className="dist-row">
            <span style={{ color: "#10b981" }}>●organic</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ background: "#10b981", width: `${organicPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalOrganic.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{organicPct}%</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>
            seeded = is_ad=false 이지만 caption 안 #gifted/#pr/#partner 매칭 (regex)
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
