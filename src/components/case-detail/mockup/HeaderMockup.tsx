"use client";

import type { DataChannel } from "@/lib/supabase/types";
import { DATA_CHANNEL_LABELS, DATA_CHANNEL_ICONS } from "@/lib/supabase/types";
import type { KeyStats } from "@/lib/inngest/types";

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
  dataChannels,
  channelStats,
  analyzedAt,
}: {
  brand: string;
  country: string;
  channel: string;
  status: string;
  dataChannels: DataChannel[];
  channelStats: Partial<Record<DataChannel, string>>;
  analyzedAt: string | null;
}) {
  const isActive = (c: DataChannel) => dataChannels.includes(c);
  return (
    <div className="status-strip">
      <div className="strip-inner">
        <div className="strip-brand">
          {brand}
          <span className="ch-name">
            {country} · {channel} · {status}
            {analyzedAt ? ` · ${new Date(analyzedAt).toLocaleString("ko-KR")}` : ""}
          </span>
        </div>
        <div className="strip-divider" />
        {ALL_CHANNELS.map((c) => (
          <div key={c} className="strip-channel">
            <span className={`dot ${isActive(c) ? "dot-ok" : "dot-off"}`} />
            {DATA_CHANNEL_ICONS[c]} {DATA_CHANNEL_LABELS[c]}
            {channelStats[c] && (
              <span className="ch-count"> {channelStats[c]}</span>
            )}
          </div>
        ))}
      </div>
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
}: {
  brand: string;
  country: string;
  channel: string;
  status: string;
  revenueTier?: string | null;
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
}: {
  dataChannels: DataChannel[];
  /** 채널별 stats + 부가 정보. ex: { tiktok_video: { stat: "1,234 영상", sub: "Exolyt CSV · 5/27" } } */
  channelDetails: Partial<Record<DataChannel, { stat: string; sub?: string }>>;
}) {
  const isActive = (c: DataChannel) => dataChannels.includes(c);
  const activeCount = ALL_CHANNELS.filter(isActive).length;
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
          return (
            <div key={c} className={`ch-card ${active ? "active" : "off"}`}>
              <div className="ch-card-h">
                <span className="ic">{DATA_CHANNEL_ICONS[c]}</span>
                <span className="nm">{DATA_CHANNEL_LABELS[c]}</span>
                <span className={`ch-badge ${active ? "ok" : "off"}`}>
                  {active ? "적재" : "사용안함"}
                </span>
              </div>
              {active && d && (
                <>
                  <div className="ch-stat">{d.stat}</div>
                  {d.sub && <div className="ch-sub">{d.sub}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 5. Phase Progress (mockup line 561-581)
// ============================================================================
export function PhaseProgressMockup({
  ks,
}: {
  ks: KeyStats;
}) {
  const items: Array<{ label: string; done: boolean; skip?: boolean; detail?: string }> = [
    { label: "Phase 1.5", done: !!ks.phase1_5, detail: ks.phase1_5 ? `${ks.phase1_5.total_products ?? 0} 제품` : "" },
    { label: "Phase 2", done: !!ks.phase2, detail: ks.phase2 ? "SQL 집계" : "" },
    { label: "Phase 3", done: !!ks.phase3, detail: ks.phase3 ? `${ks.phase3.total_creators}명` : "" },
    { label: "Phase 3.5", done: !!ks.phase35, detail: ks.phase35 ? `폴백 ${ks.phase35.total_filled ?? 0}명` : "" },
    { label: "Phase 3.7", done: !!ks.phase37, detail: ks.phase37 ? `Shop ${ks.phase37.total_shop_creators ?? 0}명` : "" },
    { label: "Phase 4a", done: !!ks.phase4a, detail: ks.phase4a ? `${ks.phase4a.total_ads ?? 0} 광고` : "" },
    { label: "Phase 4b.1", done: !!ks.phase4b_sample, detail: ks.phase4b_sample ? `샘플 ${ks.phase4b_sample.sample_content_ids?.length ?? 0}` : "" },
    { label: "Phase 4b.2", done: !!ks.phase4b_asr, detail: ks.phase4b_asr ? `ASR ${ks.phase4b_asr.total_with_asr ?? 0}` : "" },
    { label: "Phase 4b.3", done: !!ks.phase4b_vision, detail: ks.phase4b_vision ? `Vision ${ks.phase4b_vision.total_with_tags ?? 0}` : "" },
    { label: "Phase 4b.4", done: !!ks.phase4b_clusters && (ks.phase4b_clusters.pass3_meta ?? 0) > 0, detail: ks.phase4b_clusters ? `Cluster ${ks.phase4b_clusters.pass3_meta ?? 0}` : "" },
    { label: "Phase 4b.5", done: !!ks.phase4b_sku, detail: ks.phase4b_sku ? `SKU 매칭 ${ks.phase4b_sku.total_matched ?? 0}` : "" },
    { label: "Phase 4c", done: !!ks.phase4c, detail: ks.phase4c ? `IG ${ks.phase4c.total_unique ?? 0}` : "" },
    { label: "Phase 4d", done: !!ks.phase4d, detail: ks.phase4d ? `YT ${ks.phase4d.total_unique ?? 0}` : "" },
    { label: "Phase 5", done: !!ks.phase5, skip: !ks.phase5, detail: ks.phase5 ? "포지셔닝 분석" : "WIP (수동만)" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  return (
    <details className="phase-progress" id="sec-phase">
      <summary>
        🔧 Phase 진행 상태 ({doneCount}/{items.length} · cache cascade · 펼치기)
      </summary>
      <div className="pp-grid">
        {items.map((it) => (
          <div
            key={it.label}
            className={`pp-item ${it.done ? "ok" : it.skip ? "skip" : ""}`}
          >
            {it.label} {it.done ? "✓" : it.skip ? "⏭" : "—"} {it.detail}
          </div>
        ))}
      </div>
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
              <div className="ib-h">⭐ cross-platform 인플 (Top {Math.min(crossPlatform.length, 4)})</div>
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
