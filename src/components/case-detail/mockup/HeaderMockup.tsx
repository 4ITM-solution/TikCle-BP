"use client";

import { useState, useTransition } from "react";
import type { DataChannel } from "@/lib/supabase/types";
import { DATA_CHANNEL_LABELS, DATA_CHANNEL_ICONS } from "@/lib/supabase/types";
import type { KeyStats } from "@/lib/inngest/types";
import type { PhaseKey } from "@/lib/inngest/client";
import { PHASES, isPhaseDone } from "../PhaseProgress";
import { startAnalysis } from "@/app/cases/[id]/upload-actions";

/**
 * Header 영역 mockup 1:1 — mockup line 491-624 + footer 1354-1364
 *
 * 6 sub-section:
 *   1. CaseStatusStripMockup (.status-strip) — 페이지 최상단 sticky brand+채널 dot strip
 *   2. CaseHeaderMockup (.case-header) — 큰 brand name + meta-pills + actions
 *   3. KpiStripMockup (.kpi-strip + .ks-item) — 6 KPI
 *   4. DataChannelsMockup (.channels-grid + .ch-card) — 7 채널 카드
 *   5. PhaseProgressMockup (.phase-progress details) — 펼치기 phase 상태
 *   6. InsightCardMockup (.insight-card + .axis-grid + .insight-row) — G 종합 인사이트
 *
 * .bp-mockup wrapper 안에서 렌더해야 CSS 적용.
 */

const ALL_CHANNELS: DataChannel[] = [
  "tiktok_video",
  "meta_ads",
  "instagram",
  "youtube",
  "tt_shop",
  "amazon",
  "shopee",
];

// ============================================================================
// 1. Status Strip — sticky 최상단 (mockup line 24-47 .status-strip)
// ============================================================================
export function CaseStatusStripMockup({
  brand,
  country,
  channel,
  status,
  revenueTier,
  dataChannels,
  channelStats,
  analyzedAt,
  actions,
}: {
  brand: string;
  country: string;
  channel: string;
  status: string;
  revenueTier?: string | null;
  dataChannels: DataChannel[];
  channelStats: Partial<Record<DataChannel, string>>;
  analyzedAt: string | null;
  /** 우측 actions (CSV / tier 수정 / region toggle / phase 재실행 / 분석 시작 / 삭제) */
  actions?: React.ReactNode;
}) {
  const isActive = (c: DataChannel) => dataChannels.includes(c);
  return (
    <div
      className="status-strip"
      style={{
        background: "#1f2937",
        borderBottom: "none",
        color: "white",
        padding: "12px 24px",
        top: 0,
      }}
    >
      <div
        className="strip-inner"
        style={{ maxWidth: "100%", margin: 0, color: "white" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "white" }}>{brand}</span>
          {revenueTier && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>매출 tier: {revenueTier}</span>
          )}
        </div>
        <div className="strip-divider" style={{ background: "#374151" }} />
        {ALL_CHANNELS.map((c) => (
          <div key={c} className="strip-channel" style={{ color: isActive(c) ? "#e5e7eb" : "#6b7280" }}>
            <span className={`dot ${isActive(c) ? "dot-ok" : "dot-off"}`} />
            {DATA_CHANNEL_ICONS[c]} {DATA_CHANNEL_LABELS[c]}
            {channelStats[c] && (
              <span className="ch-count" style={{ color: "white" }}> {channelStats[c]}</span>
            )}
          </div>
        ))}
        {actions && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {actions}
          </div>
        )}
      </div>
      {analyzedAt && (
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4, paddingLeft: 0 }}>
          {country} · {status} · 분석 {new Date(analyzedAt).toLocaleString("ko-KR")}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. Case Header — brand name + meta-pills + actions (mockup line 512-530)
// ============================================================================
export function CaseHeaderMockup({
  brand,
  country,
  channel,
  status,
  revenueTier,
  actions,
}: {
  brand: string;
  country: string;
  channel: string;
  status: string;
  revenueTier?: string | null;
  /** rev-tier 수정 / region toggle / 삭제 등 우측 actions (옛 CaseHeader 기능). */
  actions?: React.ReactNode;
}) {
  const statusLabel = status === "ready" ? "ready" : status;
  const statusClass = status === "ready" ? "meta-pill ready" : "meta-pill";
  return (
    <div className="case-header" id="sec-header">
      <div className="brand-name">{brand}</div>
      <div className="meta-pills">
        <span className={statusClass}>{statusLabel}</span>
        <span className="meta-pill">{flagOf(country)} {country}</span>
        <span className="meta-pill">{channel}</span>
        {revenueTier && (
          <span className="meta-pill">매출 tier: {revenueTier}</span>
        )}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

function flagOf(country: string): string {
  const map: Record<string, string> = {
    US: "🇺🇸", KR: "🇰🇷", JP: "🇯🇵", EU: "🇪🇺", BR: "🇧🇷",
    SG: "🇸🇬", TH: "🇹🇭", MY: "🇲🇾", ID: "🇮🇩", PH: "🇵🇭", VN: "🇻🇳",
    SA: "🇸🇦", AE: "🇦🇪", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", CL: "🇨🇱", PE: "🇵🇪",
    MENA: "🌍", LATAM_ES: "🌎",
  };
  return map[country] ?? "🌐";
}

// ============================================================================
// 3. KPI Strip — 6 KPI (mockup line 532-540)
// ============================================================================
export function KpiStripMockup({
  totalVideos,
  videoBreakdown,
  totalCreators,
  creatorBreakdown,
  totalViews,
  viewBreakdown,
  ttShopGmv30d,
  gmvTrend,
  metaAds,
  metaBreakdown,
  costEstimate,
  costBreakdown,
}: {
  totalVideos: number;
  videoBreakdown?: string;
  totalCreators: number;
  creatorBreakdown?: string;
  totalViews: number;
  viewBreakdown?: string;
  ttShopGmv30d?: number | null;
  gmvTrend?: string;
  metaAds: number;
  metaBreakdown?: string;
  costEstimate?: number;
  costBreakdown?: string;
}) {
  return (
    <div className="kpi-strip" id="sec-kpi">
      <KsItem label="총 영상" val={totalVideos.toLocaleString()} sub={videoBreakdown} />
      <KsItem label="총 인플 풀" val={`${totalCreators.toLocaleString()}명`} sub={creatorBreakdown} />
      <KsItem label="총 view" val={fmtView(totalViews)} sub={viewBreakdown} />
      <KsItem
        label="TT Shop GMV (30d)"
        val={ttShopGmv30d != null ? fmtUsd(ttShopGmv30d) : "—"}
        sub={gmvTrend}
        subClass={gmvTrend?.startsWith("▲") ? "ks-trend up" : gmvTrend?.startsWith("▼") ? "ks-trend dn" : ""}
      />
      <KsItem label="Meta 광고" val={metaAds.toLocaleString()} sub={metaBreakdown} />
      <KsItem label="분석 비용" val={costEstimate != null ? `$${costEstimate.toFixed(2)}` : "—"} sub={costBreakdown} />
    </div>
  );
}

function KsItem({
  label,
  val,
  sub,
  subClass,
}: {
  label: string;
  val: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className="ks-item">
      <div className="ks-label">{label}</div>
      <div className="ks-val">{val}</div>
      {sub && <div className={`ks-sub ${subClass ?? ""}`}>{sub}</div>}
    </div>
  );
}

// ============================================================================
// 4. Data Channels Grid — 7 채널 카드 (mockup line 542-559)
// ============================================================================
export function DataChannelsMockup({
  dataChannels,
  channelDetails,
  channelEntries,
}: {
  dataChannels: DataChannel[];
  /** 채널별 stats + 부가 정보. ex: { tiktok_video: { stat: "1,234 영상", sub: "Exolyt CSV · 5/27" } } */
  channelDetails: Partial<Record<DataChannel, { stat: string; sub?: string }>>;
  /** 채널별 entry component (server-side rendered, page.tsx 에서 prop으로 전달).
   * 카드 클릭 → 그 채널 entry 만 grid 아래 panel 에 inline expand (accordion 1개만). */
  channelEntries?: Partial<Record<DataChannel, React.ReactNode>>;
}) {
  const isActive = (c: DataChannel) => dataChannels.includes(c);
  const activeCount = ALL_CHANNELS.filter(isActive).length;
  const [openCh, setOpenCh] = useState<DataChannel | null>(null);

  return (
    <div className="section" id="sec-channels">
      <div className="section-h">
        <span className="letter">📥</span>
        <span className="title">데이터 채널</span>
        <span className="sub">{ALL_CHANNELS.length}개 중 {activeCount}개 활성</span>
      </div>
      <div className="channels-grid">
        {ALL_CHANNELS.map((c) => {
          const active = isActive(c);
          const d = channelDetails[c];
          const isOpen = openCh === c;
          const hasEntry = !!channelEntries?.[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setOpenCh(isOpen ? null : c)}
              className={`ch-card ${active ? "active" : "off"}`}
              style={{
                textAlign: "left",
                border: "1px solid",
                borderColor: isOpen ? "#1f2937" : active ? "#10b981" : "#e5e7eb",
                background: isOpen ? "#1f2937" : active ? "#ecfdf5" : "white",
                color: isOpen ? "white" : "inherit",
                cursor: hasEntry ? "pointer" : "default",
                opacity: !hasEntry && !active ? 0.6 : 1,
                fontFamily: "inherit",
                font: "inherit",
              }}
            >
              <div className="ch-card-h">
                <span className="ic">{DATA_CHANNEL_ICONS[c]}</span>
                <span className="nm">{DATA_CHANNEL_LABELS[c]}</span>
                <span
                  className={`ch-badge ${active ? "ok" : "off"}`}
                  style={isOpen ? { background: "white", color: "#1f2937" } : undefined}
                >
                  {isOpen ? "✕ 닫기" : active ? "적재" : "추가"}
                </span>
              </div>
              {active && d ? (
                <>
                  <div className="ch-stat" style={isOpen ? { color: "white" } : undefined}>
                    {d.stat}
                  </div>
                  {d.sub && (
                    <div className="ch-sub" style={isOpen ? { color: "#9ca3af" } : undefined}>
                      {d.sub}
                    </div>
                  )}
                </>
              ) : (
                <div className="ch-sub" style={{ color: isOpen ? "#9ca3af" : "#9ca3af" }}>
                  클릭하여 데이터 추가
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* accordion panel — grid 아래 full-width, 1번에 1 채널만 */}
      {openCh && channelEntries?.[openCh] && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            background: "white",
            border: "2px solid #1f2937",
            borderRadius: 8,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {DATA_CHANNEL_ICONS[openCh]} {DATA_CHANNEL_LABELS[openCh]} 데이터 추가
            </div>
            <button
              type="button"
              onClick={() => setOpenCh(null)}
              style={{
                background: "transparent",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              ✕ 닫기
            </button>
          </div>
          {channelEntries[openCh]}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. Phase Progress (mockup line 561-581)
//    각 phase row 에 .pp-rerun 인라인 버튼 (mockup 의도). case_id 필수.
// ============================================================================
function detailForPhase(key: PhaseKey, ks: KeyStats): string {
  switch (key) {
    case "phase1_5":
      return ks.phase1_5 ? `${ks.phase1_5.total_products ?? 0} 제품` : "";
    case "phase2":
      return ks.phase2 ? "SQL 집계" : "";
    case "phase3":
      return ks.phase3 ? `${ks.phase3.total_creators}명` : "";
    case "phase35":
      return ks.phase35 ? `폴백 ${ks.phase35.total_filled ?? 0}명` : "";
    case "phase37":
      return ks.phase37 ? `Shop ${ks.phase37.total_shop_creators ?? 0}명` : "";
    case "phase4a":
      return ks.phase4a ? `${ks.phase4a.total_ads ?? 0} 광고` : "";
    case "phase4a_assets":
      return ks.phase4a?.ads_preview?.length
        ? `Storage ${ks.phase4a.ads_preview.filter((a) => (a.thumbnail_url ?? "").includes("supabase") || (a.video_url ?? "").includes("supabase")).length}건`
        : "";
    case "phase4b_sample":
      return ks.phase4b_sample ? `샘플 ${ks.phase4b_sample.sample_content_ids?.length ?? 0}` : "";
    case "phase4b_asr":
      return ks.phase4b_asr ? `ASR ${ks.phase4b_asr.total_with_asr ?? 0}` : "";
    case "phase4b_vision":
      return ks.phase4b_vision ? `Vision ${ks.phase4b_vision.total_with_tags ?? 0}` : "";
    case "phase4b_clusters":
      return ks.phase4b_clusters ? `Cluster ${ks.phase4b_clusters.pass3_meta ?? 0}` : "";
    case "phase4b_sku":
      return ks.phase4b_sku ? `SKU 매칭 ${ks.phase4b_sku.total_matched ?? 0}` : "";
    case "phase5":
      return ks.phase5 ? "포지셔닝 분석" : "WIP";
    case "phase4c":
      return ks.phase4c ? `IG ${ks.phase4c.total_unique ?? 0}` : "";
    case "phase4d":
      return ks.phase4d ? `YT ${ks.phase4d.total_unique ?? 0}` : "";
  }
}

export function PhaseProgressMockup({
  ks,
  case_id,
}: {
  ks: KeyStats;
  /** case_id 박힘 — .pp-rerun 클릭 시 단독 phase rerun. 옴이텀 button 숨김. */
  case_id?: string;
}) {
  const [pending, start] = useTransition();
  const [pendingPhase, setPendingPhase] = useState<PhaseKey | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function rerun(phase: PhaseKey) {
    if (!case_id) return;
    setPendingPhase(phase);
    setMsg(null);
    start(async () => {
      const r = await startAnalysis(case_id, [phase], { skipAutoForce: true });
      setPendingPhase(null);
      setMsg(r.ok ? { type: "ok", text: r.message } : { type: "err", text: r.error });
    });
  }

  const items = PHASES.map((p) => {
    const status = isPhaseDone(p.key, ks);
    return {
      key: p.key,
      label: p.label.split(" — ")[0] ?? p.label,
      done: status.done,
      detail: detailForPhase(p.key, ks),
    };
  });
  const doneCount = items.filter((i) => i.done).length;

  return (
    <details className="phase-progress" id="sec-phase">
      <summary>
        🔧 Phase 진행 상태 ({doneCount}/{items.length} · cache cascade · 펼치기)
      </summary>
      <div className="pp-grid">
        {items.map((it) => {
          const isPending = pendingPhase === it.key && pending;
          return (
            <div
              key={it.key}
              className={`pp-item ${it.done ? "ok" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "space-between",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                {it.label} {it.done ? "✓" : "—"} {it.detail}
              </span>
              {case_id && (
                <button
                  type="button"
                  className="pp-rerun"
                  onClick={() => rerun(it.key)}
                  disabled={pending}
                  title={it.done ? "재실행 (캐시 무시)" : "실행"}
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    border: "1px solid #d1d5db",
                    borderRadius: 3,
                    background: "white",
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    color: "#6b7280",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isPending ? "…" : it.done ? "↻" : "▶"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {msg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 4,
            background: msg.type === "ok" ? "#d1fae5" : "#fee2e2",
            color: msg.type === "ok" ? "#065f46" : "#991b1b",
          }}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}{msg.text}
        </div>
      )}
    </details>
  );
}

// ============================================================================
// 6. Insight Card — G 종합 인사이트 (mockup line 583-624)
// ============================================================================
export function InsightCardMockup({
  title,
  tagline,
  metaLine,
  axisCards,
  keyFindings,
  crossPlatform,
  relatedCases,
}: {
  title?: string;
  tagline?: string;
  metaLine?: string;
  axisCards?: Array<{ h: string; val: string; sub?: string }>;
  keyFindings?: string[];
  crossPlatform?: Array<{ name: string; channels: string; videos: number }>;
  relatedCases?: Array<{ label: string; href?: string }>;
}) {
  if (!title && !tagline && (!axisCards || axisCards.length === 0)) return null;
  return (
    <div className="insight-card" id="sec-g">
      <div className="ic-label">🎯 SECTION G · 종합 인사이트</div>
      {title && <div className="ic-title">{title}</div>}
      {tagline && <div className="ic-tagline">{tagline}</div>}
      {metaLine && <div className="ic-meta">{metaLine}</div>}

      {axisCards && axisCards.length > 0 && (
        <div className="axis-grid">
          {axisCards.map((c) => (
            <div key={c.h} className="axis-card">
              <div className="ax-h">{c.h}</div>
              <div className="ax-val">{c.val}</div>
              {c.sub && <div className="ax-sub">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {((keyFindings && keyFindings.length > 0) || (crossPlatform && crossPlatform.length > 0)) && (
        <div className="insight-row">
          {keyFindings && keyFindings.length > 0 && (
            <div className="insight-block">
              <div className="ib-h">📊 핵심 발견 ({keyFindings.length})</div>
              {keyFindings.map((f, i) => (
                <div key={i} className="ib-li">{f}</div>
              ))}
            </div>
          )}
          {crossPlatform && crossPlatform.length > 0 && (
            <div className="insight-block">
              <div className="ib-h">⭐ TK+IG+YT 통합 인플 (Top {Math.min(crossPlatform.length, 4)})</div>
              <table>
                <thead>
                  <tr><th>이름</th><th>채널</th><th>영상</th></tr>
                </thead>
                <tbody>
                  {crossPlatform.slice(0, 4).map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>{p.channels}</td>
                      <td>{p.videos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {relatedCases && relatedCases.length > 0 && (
        <div className="related-cases">
          <b>🔗 비교 가능 케이스:</b>{" "}
          {relatedCases.map((rc, i) => (
            <a key={i} href={rc.href}>{rc.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtView(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}
