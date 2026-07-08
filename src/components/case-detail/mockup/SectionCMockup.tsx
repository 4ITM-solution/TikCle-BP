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

type ClusterChannelSlice = {
  clusterMetrics: Record<string, { avg_views: number; paid_count: number; save_rate_pct: number; member_count: number }>;
  clusterTopVideos: Record<string, Array<{ url: string; views: number; caption: string | null }>>;
  tierClusterHeatmap: { tiers: string[]; metas: Array<{ id: string; name: string }>; cells: Record<string, Record<string, number>> };
  clusterGmvByMonth: Record<string, Record<string, number>>;
  heatmap: Array<{ meta_id: string; meta_name: string; total_videos: number; total_views: number; cells: Array<{ month: string; video_count: number; views_sum: number; paid_count: number }> }>;
  month_order: string[];
};

export function SectionCMockup({
  phase2,
  phase4bClusters,
  phase5,
  clusterChannelBreakdown,
  channelData,
  uspByChannel,
  uspVideosByChannel,
  angleTierMonth,
  totalContents,
}: {
  phase2: Phase2Stats;
  phase4bClusters?: Phase4bClusterStats;
  phase5?: Phase5Stats;
  /** ★ A2(WS4b): 티어×앵글×월 교차 — v_case_angle_tier_month(019). 미적용/무데이터 시 null. */
  angleTierMonth?: {
    angles: string[];
    tiers: string[];
    months: string[];
    cells: Record<string, Record<string, Record<string, number>>>;
    sampleTagged: number;
  } | null;
  /** 표본 라벨(B3)용 — 케이스 전체 콘텐츠 수 */
  totalContents?: number;
  /** meta_cluster_id → { tk, ig, yt } 멤버 채널 분포 (채널 토글 카운트용) */
  clusterChannelBreakdown?: Record<string, { tk: number; ig: number; yt: number }>;
  /** 채널별(all/tk/ig/yt) 재집계 데이터 — page.tsx server-side */
  channelData?: Record<ChannelFilter, ClusterChannelSlice>;
  /** 채널별 USP 키워드 — page.tsx server-side (TK=phase5, IG/YT=코퍼스 재계산, all=병합) */
  uspByChannel?: Record<ChannelFilter, Array<{ keyword: string; count: number; pct: number }>>;
  /** 채널별 USP 키워드 → 매칭 영상 top3 */
  uspVideosByChannel?: Record<ChannelFilter, Record<string, Array<{ url: string; caption: string; views: number }>>>;
}) {
  const [tab, setTab] = useState<"clu" | "usp" | "heat" | "tier" | "atm" | "paid">("clu");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [selectedKw, setSelectedKw] = useState<string | null>(null);
  const [heatMeasure, setHeatMeasure] = useState<"count" | "view" | "paid_pct" | "gmv">("count");
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  // ★ A2(WS4b): 티어×앵글×월 히트맵 — 선택 티어(초기 = 데이터 있는 첫 티어)
  const [atmTier, setAtmTier] = useState<string | null>(null);
  const atmSelTier = atmTier ?? angleTierMonth?.tiers[0] ?? null;

  // ── 선택 채널 slice — 모든 탭 공통 적용 ──
  const cd = channelData?.[channelFilter] ?? channelData?.all;
  const clusterMetrics = cd?.clusterMetrics;
  const clusterTopVideos = cd?.clusterTopVideos;
  const tierClusterHeatmap = cd?.tierClusterHeatmap;
  const clusterGmvByMonth = cd?.clusterGmvByMonth;
  const heatRows = cd?.heatmap ?? [];
  const monthOrder = cd?.month_order ?? [];

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

  // ── USP 키워드 panel ── (채널별)
  const uspKws = (uspByChannel?.[channelFilter] ?? phase5?.usp_keywords ?? []).slice(0, 24);
  const uspSampleVideos = uspVideosByChannel?.[channelFilter];

  // ── paid/seeded/organic panel ── (채널 토글 적용)
  // seeded 는 전 채널 합산(phase2.total_seeded)만 있어 'all' 에서만 분리 표시 →
  // 채널뷰(tk/ig/yt)는 organic 에 흡수.
  const ch = phase2.monthly_by_channel;
  const paidRows =
    channelFilter === "tk" ? (ch?.tk ?? phase2.monthly_video_counts)
    : channelFilter === "ig" ? (ch?.ig ?? [])
    : channelFilter === "yt" ? (ch?.yt ?? [])
    : phase2.monthly_video_counts;
  const totalPaid = paidRows.reduce((s, m) => s + m.paid, 0);
  const totalSeeded = channelFilter === "all" ? (phase2.total_seeded ?? 0) : 0;
  const totalOrganicRaw =
    channelFilter === "all"
      ? phase2.monthly_video_counts.reduce((s, m) => s + m.organic, 0)
      : paidRows.reduce((s, m) => s + Math.max(0, m.total - m.paid), 0);
  const totalOrganic = Math.max(0, totalOrganicRaw - totalSeeded);
  const totalAll = totalPaid + totalSeeded + totalOrganic || 1;
  const adPct = Math.round((totalPaid / totalAll) * 100);
  const seededPct = Math.round((totalSeeded / totalAll) * 100);
  const organicPct = Math.round((totalOrganic / totalAll) * 100);
  // 채널별 ad 비중 (TK/IG/YT) — 하단 요약줄용 (항상 전체)
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
        <button className={tab === "atm" ? "active" : ""} onClick={() => setTab("atm")}>
          ★ 티어 × 앵글 × 월
        </button>
        <button className={tab === "paid" ? "active" : ""} onClick={() => setTab("paid")}>
          paid/seeded/organic 분류
        </button>
      </div>

      {/* ★ 채널 필터 — 전 탭 공통 적용 (전 채널 / TK / IG / YT) */}
      <div style={{ margin: "10px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>채널:</span>
        <div className="ch-toggle">
          {(["all", "tk", "ig", "yt"] as const).map((m) => {
            const countFor = (k: typeof m) => {
              if (k === "all") return metasAll.length;
              return metasAll.filter((mc) => {
                const ch = clusterChannelBreakdown?.[mc.id];
                return ch ? ch[k] > 0 : false;
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
                {m === "all" ? "전 채널" : m === "tk" ? "TikTok" : m === "ig" ? "IG" : "YT"}
                {m !== "all" && ` (${cnt})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* 통합 클러스터 panel */}
      {tab === "clu" && (
        <div className="panel active">
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
              // 12개월 grid placeholder — 빈 case 미리보기용이라 정확한 월 매칭 불필요.
              // new Date() 박으면 SSR vs CSR hydration mismatch (React #418) 라 fixed 박음.
              const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
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
                          // 가독성: 노란빛 (#fcd34d) 만 dark text, 나머지 진한 색 다 white
                          const isDarkBg = intensity > 0.1;
                          const top3 = clusterTopVideos?.[m.id] ?? [];
                          const canExpand = v > 0 && top3.length > 0;
                          return (
                            <div
                              key={m.id}
                              className="cell"
                              style={{
                                background: bg,
                                color: isDarkBg ? "white" : "#374151",
                                fontWeight: v > 0 ? 700 : 400,
                                cursor: canExpand ? "pointer" : "default",
                              }}
                              title={
                                canExpand
                                  ? `${TIER_LABEL[t]} × ${m.name}: ${v} 영상 — 클릭하여 영상 보기`
                                  : `${TIER_LABEL[t]} × ${m.name}: ${v} 영상`
                              }
                              onClick={() => {
                                if (!canExpand) return;
                                setTab("clu");
                                setExpandedCluster(m.id);
                              }}
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

      {/* ★ A2(WS4b): 티어 × 앵글 × 월 panel — 티어 선택 후 앵글×월 heatmap (기존 .heatmap 패턴 재사용) */}
      {tab === "atm" && (
        <div className="panel active">
          {!angleTierMonth || angleTierMonth.tiers.length === 0 || !atmSelTier ? (
            <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
              데이터 없음 — 영상 태깅·클러스터링(interpret-tag/cluster) + 인플 티어가 채워지면 표시됩니다.
            </div>
          ) : (
            (() => {
              const { angles, tiers, months, cells, sampleTagged } = angleTierMonth;
              const TIER_LABEL: Record<string, string> = {
                mega: "Mega (1M+)", macro: "Macro (500K+)", mid: "Mid (100K+)",
                micro: "Micro (10K+)", nano: "Nano (1K+)", "sub-nano": "Sub-nano", unknown: "Unknown",
              };
              const tierCells = cells[atmSelTier] ?? {};
              const anglesToShow = angles.filter((a) =>
                months.some((m) => (tierCells[a]?.[m] ?? 0) > 0),
              );
              const maxV = Math.max(
                ...anglesToShow.flatMap((a) => months.map((m) => tierCells[a]?.[m] ?? 0)),
                1,
              );
              return (
                <>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                    선택 티어의 콘텐츠 앵글이 월별로 언제 집중됐는지 — 영상 수 (TikTok 기준)
                  </div>
                  {/* 표본 라벨 (B3) */}
                  <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8 }}>
                    표본 {sampleTagged.toLocaleString()}건(태깅·클러스터링 완료) / 전체{" "}
                    {(totalContents ?? 0).toLocaleString()}건
                    {totalContents && totalContents > 0
                      ? ` (${Math.round((sampleTagged / totalContents) * 100)}%)`
                      : ""}
                  </div>
                  {/* 티어 선택 */}
                  <div className="ch-toggle" style={{ marginBottom: 10 }}>
                    {tiers.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={atmSelTier === t ? "active" : ""}
                        onClick={() => setAtmTier(t)}
                      >
                        {TIER_LABEL[t] ?? t}
                      </button>
                    ))}
                  </div>
                  {anglesToShow.length === 0 ? (
                    <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                      이 티어의 월별 앵글 데이터 없음
                    </div>
                  ) : (
                    <div
                      className="heatmap"
                      style={{
                        display: "grid",
                        gridTemplateColumns: `140px repeat(${months.length}, minmax(52px, 1fr))`,
                        gap: 2,
                        fontSize: 10,
                        overflowX: "auto",
                      }}
                    >
                      <div className="lbl" />
                      {months.map((m) => (
                        <div key={m} className="lbl">{m.slice(5)}</div>
                      ))}
                      {anglesToShow.map((a) => (
                        <div style={{ display: "contents" }} key={a}>
                          <div className="lbl" title={a}>
                            {a.length > 14 ? `${a.slice(0, 14)}…` : a}
                          </div>
                          {months.map((m) => {
                            const v = tierCells[a]?.[m] ?? 0;
                            const intensity = v / maxV;
                            const bg = intensity > 0.8 ? "#7f1d1d" :
                                       intensity > 0.6 ? "#dc2626" :
                                       intensity > 0.4 ? "#ea580c" :
                                       intensity > 0.25 ? "#d97706" :
                                       intensity > 0.1 ? "#f59e0b" :
                                       intensity > 0 ? "#fcd34d" : "#f3f4f6";
                            return (
                              <div
                                key={m}
                                className="cell"
                                style={{ background: bg, color: intensity > 0.1 ? "white" : "#374151" }}
                                title={`${a} · ${m}: ${v} 영상`}
                              >
                                {v > 0 ? v : ""}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
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
            {channelFilter === "all" ? "전 채널" : channelFilter === "tk" ? "TikTok" : channelFilter === "ig" ? "Instagram" : "YouTube"}{" "}
            콘텐츠 FTC 자동 분류 (paid_signal · is_ad / promoted 기반)
            {channelFilter !== "all" && " · seeded 는 전 채널 합산만 집계되어 organic 에 포함"}
          </div>
          <div className="dist-row">
            <span style={{ color: "#ec4899" }}>●ad</span>
            <div className="dist-bar">
              <div className="dist-fill ig" style={{ width: `${adPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalPaid.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{adPct}%</span>
          </div>
          {channelFilter === "all" && (
            <div className="dist-row">
              <span style={{ color: "#f59e0b" }}>●seeded</span>
              <div className="dist-bar">
                <div className="dist-fill" style={{ background: "#f59e0b", width: `${seededPct}%` }} />
              </div>
              <span style={{ textAlign: "right" }}>{totalSeeded.toLocaleString()}</span>
              <span style={{ color: "#9ca3af", textAlign: "right" }}>{seededPct}%</span>
            </div>
          )}
          <div className="dist-row">
            <span style={{ color: "#10b981" }}>●organic</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ background: "#10b981", width: `${organicPct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{totalOrganic.toLocaleString()}</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{organicPct}%</span>
          </div>
          {channelFilter === "all" && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>
              seeded = is_ad=false 이지만 caption 안 #gifted/#pr/#partner 매칭 (regex)
            </div>
          )}
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
