"use client";

import { useMemo, useState } from "react";
import type {
  BsrSeries,
  MonthlyVideoCount,
  Phase2Stats,
  Phase5Stats,
  TierBucket,
  TierDistribution,
} from "@/lib/inngest/types";

/**
 * SectionAMockup — mockup line 626-752 HTML 1:1 React 변환.
 *
 * mockup class 그대로 사용 (mockup.css에서 .bp-mockup scope으로 박힘).
 * <div className="bp-mockup"> 안에서 렌더해야 CSS 적용됨.
 *
 * 데이터:
 *   - phase2.total_contents / monthly_video_counts / ig_total_videos / yt_total_videos
 *   - phase3.tier_dist_by_month (월별 티어 stack)
 *   - phase2.bsr_series (BSR line)
 *   - phase5.bsr_inflections (변곡점 callout)
 */

const TIERS: { key: TierBucket; label: string; color: string }[] = [
  { key: "mega", label: "메가", color: "#7f1d1d" },
  { key: "macro", label: "매크로", color: "#ea580c" },
  { key: "mid", label: "미드", color: "#fcd34d" },
  { key: "micro", label: "마이크로", color: "#84cc16" },
  { key: "nano", label: "나노", color: "#06b6d4" },
  { key: "sub-nano", label: "서브나노", color: "#8b5cf6" },
  { key: "unknown", label: "미상", color: "#d1d5db" },
];

type ChannelMode = "all" | "tk" | "ig" | "yt";
type BarMode = "abs" | "pct";

export function SectionAMockup({
  phase2,
  phase3,
  phase5,
}: {
  phase2: Phase2Stats;
  phase3?: { tier_dist_by_month?: Record<string, TierDistribution> };
  phase5?: Phase5Stats;
}) {
  const [channelMode, setChannelMode] = useState<ChannelMode>("all");
  const [barMode, setBarMode] = useState<BarMode>("abs");
  const [show, setShow] = useState({ tier: true, ad: true, bsr: true, vc: true });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const tkVids = phase2.total_contents ?? 0;
  const igVids = phase2.ig_total_videos ?? 0;
  const ytVids = phase2.yt_total_videos ?? 0;
  const allVids = tkVids + igVids + ytVids;

  // 채널 mode에 맞는 monthly (paid/organic) 추출.
  // "all" = TK + IG + YT 합산 (각 월별 paid/organic/total).
  const monthlyForMode = useMemo<MonthlyVideoCount[]>(() => {
    const ch = phase2.monthly_by_channel;
    if (channelMode === "tk") return ch?.tk ?? phase2.monthly_video_counts;
    if (channelMode === "ig") return ch?.ig ?? [];
    if (channelMode === "yt") return ch?.yt ?? [];
    // all = 합산
    const tkArr = ch?.tk ?? phase2.monthly_video_counts;
    const igArr = ch?.ig ?? [];
    const ytArr = ch?.yt ?? [];
    const merged = new Map<string, MonthlyVideoCount>();
    for (const arr of [tkArr, igArr, ytArr]) {
      for (const r of arr) {
        const cur = merged.get(r.month) ?? { month: r.month, paid: 0, organic: 0, total: 0 };
        cur.paid += r.paid;
        cur.organic += r.organic;
        cur.total += r.total;
        merged.set(r.month, cur);
      }
    }
    return [...merged.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [channelMode, phase2]);

  const totalPaid = monthlyForMode.reduce((s, m) => s + m.paid, 0);
  const totalOrganic = monthlyForMode.reduce((s, m) => s + m.organic, 0);
  const totalView = (phase2.top_creators ?? []).reduce((s, c) => s + (c.max_views ?? 0), 0);

  const totalForMode =
    channelMode === "all" ? allVids :
    channelMode === "tk" ? tkVids :
    channelMode === "ig" ? igVids :
    ytVids;

  // ─────────── stack chart ───────────
  const tierByMonth = phase3?.tier_dist_by_month ?? {};
  // BSR by month
  const bsrByMonth = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const s of phase2.bsr_series ?? []) {
      for (const p of s.points) {
        const mo = p.date.slice(0, 7);
        const e = m.get(mo) ?? { sum: 0, n: 0 };
        e.sum += p.bsr;
        e.n += 1;
        m.set(mo, e);
      }
    }
    const out = new Map<string, number>();
    for (const [mo, e] of m) out.set(mo, e.sum / e.n);
    return out;
  }, [phase2.bsr_series]);

  // 월 union (티어 + monthly + bsr 안 12개월)
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const mo of Object.keys(tierByMonth)) set.add(mo);
    for (const r of phase2.monthly_video_counts ?? []) set.add(r.month);
    return [...set].sort().slice(-12);
  }, [tierByMonth, phase2.monthly_video_counts]);

  // 월별 영상 수 (해당 mode)
  const totalByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of monthlyForMode) m.set(r.month, r.total);
    return m;
  }, [monthlyForMode]);
  const maxVids = Math.max(1, ...Array.from(totalByMonth.values()));

  // 월별 광고 비중 (0~1)
  const adByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of monthlyForMode) {
      if (r.total > 0) m.set(r.month, r.paid / r.total);
    }
    return m;
  }, [monthlyForMode]);

  // BSR 정규화 (낮을수록 위)
  const bsrVals = months.filter((mo) => bsrByMonth.has(mo)).map((mo) => bsrByMonth.get(mo)!);
  const bsrMin = bsrVals.length ? Math.min(...bsrVals) : 0;
  const bsrMax = bsrVals.length ? Math.max(...bsrVals) : 1;
  const bsrRange = bsrMax - bsrMin || 1;

  // 변곡점 callout
  const topInflection = useMemo(() => {
    if (!phase5?.bsr_inflections || phase5.bsr_inflections.length === 0) return null;
    return [...phase5.bsr_inflections].sort(
      (a, b) => b.rank_improvement_pct - a.rank_improvement_pct,
    )[0];
  }, [phase5]);

  // ─────────── 1인당 영상 분포 ───────────
  const dist = phase2.videos_per_creator;
  const distBuckets: Array<{ key: keyof typeof dist; label: string }> = [
    { key: "1", label: "1편" },
    { key: "2-4", label: "2-4편" },
    { key: "5-9", label: "5-9편" },
    { key: "10-19", label: "10-19편" },
    { key: "20-49", label: "20+편" },
  ];
  const totalCreators = dist.total_creators || 1;

  const fmtView = (n: number) =>
    n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B` :
    n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` :
    n >= 1_000 ? `${Math.round(n / 1000)}K` :
    n.toLocaleString();

  return (
    <div className="section" id="sec-a">
      <div className="section-h">
        <span className="letter">A</span>
        <span className="title">콘텐츠 활동</span>
        <span className="sub">★ 월간 인플 티어 · 광고 비중 · BSR 통합 트렌드 (호버 시 디테일)</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="ch-toggle">
          {([
            { k: "all", label: `전체 합산 (${allVids.toLocaleString()})`, n: allVids },
            { k: "tk", label: `TikTok (${tkVids.toLocaleString()})`, n: tkVids },
            { k: "ig", label: `Instagram (${igVids.toLocaleString()})`, n: igVids },
            { k: "yt", label: `YouTube (${ytVids.toLocaleString()})`, n: ytVids },
          ] as const).map((b) => (
            <button
              key={b.k}
              type="button"
              disabled={b.n === 0 && b.k !== "all"}
              className={channelMode === b.k ? "active" : ""}
              onClick={() => setChannelMode(b.k as ChannelMode)}
              style={{ opacity: b.n === 0 && b.k !== "all" ? 0.4 : 1, cursor: b.n === 0 && b.k !== "all" ? "not-allowed" : "pointer" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">총 영상</div>
          <div className="kpi-val">{totalForMode.toLocaleString()}</div>
          <div className="kpi-sub">
            TK {fmtView(tkVids)} · IG {fmtView(igVids)} · YT {ytVids > 0 ? fmtView(ytVids) : 0}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">paid 비중</div>
          <div className="kpi-val">{totalForMode > 0 ? Math.round((totalPaid / (totalPaid + totalOrganic || 1)) * 100) : 0}%</div>
          <div className="kpi-sub">{totalPaid.toLocaleString()}건</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">organic</div>
          <div className="kpi-val">{totalForMode > 0 ? Math.round((totalOrganic / (totalPaid + totalOrganic || 1)) * 100) : 0}%</div>
          <div className="kpi-sub">{totalOrganic.toLocaleString()}건</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">gifted (시딩)</div>
          <div className="kpi-val">-</div>
          <div className="kpi-sub">FTC 분류 미수집</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">총 view</div>
          <div className="kpi-val">{fmtView(totalView)}</div>
          <div className="kpi-sub">top {(phase2.top_creators ?? []).length}명 합계</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>월간 인플 · 광고 · BSR 통합 트렌드 ({months.length}개월)</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#6b7280" }}>
          <span>막대 단위:</span>
          <div className="ch-toggle" style={{ fontSize: 10 }}>
            <button className={barMode === "abs" ? "active" : ""} onClick={() => setBarMode("abs")}>절대 영상 수</button>
            <button className={barMode === "pct" ? "active" : ""} onClick={() => setBarMode("pct")}>비중 (%)</button>
          </div>
        </div>
      </div>

      <div className="trend-chart">
        <div className="trend-toggles">
          <button
            className={show.tier ? "active" : ""}
            onClick={() => setShow((s) => ({ ...s, tier: !s.tier }))}
          >
            인플 티어 stack
          </button>
          <button
            className={show.ad ? "active-line ad" : ""}
            onClick={() => setShow((s) => ({ ...s, ad: !s.ad }))}
          >
            광고 비중 line
          </button>
          <button
            className={show.bsr ? "active-line bsr" : ""}
            onClick={() => setShow((s) => ({ ...s, bsr: !s.bsr }))}
            disabled={bsrVals.length === 0}
            style={{ opacity: bsrVals.length === 0 ? 0.4 : 1 }}
          >
            BSR line
          </button>
          <button
            className={show.vc ? "active-line" : ""}
            onClick={() => setShow((s) => ({ ...s, vc: !s.vc }))}
            style={{
              background: show.vc ? "#06b6d4" : undefined,
              borderColor: show.vc ? "#06b6d4" : undefined,
              color: show.vc ? "white" : undefined,
            }}
          >
            ★ 영상 수 line
          </button>
        </div>

        <div className="stack-bars">
          {months.map((mo, i) => {
            const total = totalByMonth.get(mo) ?? 0;
            const heightPct = barMode === "abs" ? (total / maxVids) * 100 : 100;
            const td = tierByMonth[mo];
            const tierTotal = td ? TIERS.reduce((s, t) => s + (td[t.key] ?? 0), 0) : 0;
            const hasTierData = tierTotal > 0;
            const isPeak = i === months.length - 1; // ★ 마지막 달 강조
            const r = monthlyForMode.find((x) => x.month === mo);
            const paid = r?.paid ?? 0;
            const organic = r?.organic ?? 0;
            return (
              <div
                key={mo}
                className="stack-bar"
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  ...(isPeak ? { boxShadow: "0 0 0 2px #1f2937", zIndex: 4 } : {}),
                }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                title={`${mo} · ${total} 영상`}
              >
                {/* 티어 데이터 있을 때만 stack. 없으면 paid/organic 두 색으로 fallback. */}
                {show.tier && hasTierData && TIERS.map((t) => {
                  const ratio = (td![t.key] ?? 0) / tierTotal;
                  return (
                    <div
                      key={t.key}
                      className={`sb-${t.key.replace("sub-nano", "subnano")}`}
                      style={{ height: `${ratio * 100}%`, background: t.color }}
                    />
                  );
                })}
                {show.tier && !hasTierData && total > 0 && (
                  <>
                    <div
                      style={{
                        height: `${(paid / Math.max(total, 1)) * 100}%`,
                        background: "#ec4899",
                      }}
                      title={`paid ${paid}`}
                    />
                    <div
                      style={{
                        height: `${(organic / Math.max(total, 1)) * 100}%`,
                        background: "#1f2937",
                      }}
                      title={`organic ${organic}`}
                    />
                  </>
                )}
                <div className="sb-label" style={isPeak ? { color: "#ec4899", fontWeight: 700 } : {}}>
                  {`'${mo.slice(2)}`}
                  <br />
                  {total}
                  {isPeak ? " ★" : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* ★ 호버 시 디테일 tooltip (mockup line 705-722) */}
        {hoverIdx !== null && months[hoverIdx] && (() => {
          const mo = months[hoverIdx]!;
          const total = totalByMonth.get(mo) ?? 0;
          const td = tierByMonth[mo];
          const tierTotal = td ? TIERS.reduce((s, t) => s + (td[t.key] ?? 0), 0) : 0;
          const r = monthlyForMode.find((x) => x.month === mo);
          const paid = r?.paid ?? 0;
          const adPct = total > 0 ? Math.round((paid / total) * 100) : 0;
          const bsr = bsrByMonth.get(mo);
          const isPeak = hoverIdx === months.length - 1;
          return (
            <div className="trend-tooltip" style={{ right: 30 }}>
              <div className="tt-h">{mo}{isPeak ? " ★ 변곡점" : ""}</div>
              <table>
                <tbody>
                  <tr>
                    <td><span className="tt-color" style={{ background: "#06b6d4" }} />총 영상</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#06b6d4" }}>
                      <b>{total}개</b>
                    </td>
                  </tr>
                  {tierTotal > 0 && TIERS.filter((t) => (td![t.key] ?? 0) > 0).map((t) => {
                    const v = td![t.key] ?? 0;
                    const pct = Math.round((v / tierTotal) * 100);
                    return (
                      <tr key={t.key}>
                        <td><span className="tt-color" style={{ background: t.color }} />{t.label}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {v}명 ({pct}%)
                        </td>
                      </tr>
                    );
                  })}
                  {tierTotal === 0 && total > 0 && (
                    <>
                      <tr>
                        <td><span className="tt-color" style={{ background: "#ec4899" }} />paid</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {paid}건
                        </td>
                      </tr>
                      <tr>
                        <td><span className="tt-color" style={{ background: "#1f2937" }} />organic</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {(r?.organic ?? 0)}건
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <div className="tt-stat">
                <span style={{ color: "#f59e0b" }}>광고 비중 {adPct}%</span>
                {bsr !== undefined && (
                  <>
                    <br />
                    <span style={{ color: "#ef4444" }}>
                      <b>BSR #{Math.round(bsr).toLocaleString()}</b>
                    </span>
                  </>
                )}
                {tierTotal === 0 && (
                  <>
                    <br />
                    <span style={{ color: "#9ca3af", fontSize: 10 }}>
                      ★ 티어 분포 데이터 없음 — Phase 3 재실행 필요
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* SVG overlay — 3 line */}
        <svg className="overlay-svg" viewBox="0 0 1100 222" preserveAspectRatio="none">
          {show.vc && months.length > 1 && (
            <polyline
              points={months
                .map((mo, i) => {
                  const x = (i / (months.length - 1)) * 1000 + 50;
                  const total = totalByMonth.get(mo) ?? 0;
                  const y = 222 - (total / maxVids) * 222;
                  return `${x},${y}`;
                })
                .join(" ")}
              stroke="#06b6d4"
              strokeWidth="3"
              fill="none"
            />
          )}
          {show.ad && months.length > 1 && (
            <polyline
              points={months
                .filter((mo) => adByMonth.has(mo))
                .map((mo, _i) => {
                  const idx = months.indexOf(mo);
                  const x = (idx / (months.length - 1)) * 1000 + 50;
                  const y = 222 - (adByMonth.get(mo) ?? 0) * 222;
                  return `${x},${y}`;
                })
                .join(" ")}
              stroke="#f59e0b"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4 3"
            />
          )}
          {show.bsr && bsrVals.length > 1 && (
            <polyline
              points={months
                .filter((mo) => bsrByMonth.has(mo))
                .map((mo) => {
                  const idx = months.indexOf(mo);
                  const x = (idx / (months.length - 1)) * 1000 + 50;
                  const v = bsrByMonth.get(mo)!;
                  const inv = 1 - (v - bsrMin) / bsrRange;
                  const y = 222 - inv * 222;
                  return `${x},${y}`;
                })
                .join(" ")}
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="2 2"
            />
          )}
        </svg>
      </div>

      <div className="trend-legend">
        {TIERS.map((t) => (
          <div key={t.key} className="lg-item">
            <div className="lg-sw" style={{ background: t.color }} />
            {t.label}
          </div>
        ))}
        <div className="lg-item" style={{ marginLeft: "auto" }}>
          <span style={{ color: "#06b6d4", fontWeight: 700 }}>━</span> ★ 총 영상 수
        </div>
        <div className="lg-item">
          <span style={{ color: "#f59e0b" }}>─ ─</span> 광고 비중 0~100%
        </div>
        {bsrVals.length > 0 && (
          <div className="lg-item">
            <span style={{ color: "#ef4444" }}>─ ─</span> BSR (낮을수록 좋음)
          </div>
        )}
      </div>

      {topInflection && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#ecfdf5", borderLeft: "3px solid #10b981", borderRadius: 4, fontSize: 11, color: "#065f46" }}>
          💡 <b>볼륨 ↔ BSR 상관:</b> {topInflection.date} 시점 BSR #{topInflection.rank_before.toLocaleString()} → #{topInflection.rank_after.toLocaleString()} ({Math.round(topInflection.rank_improvement_pct)}% 개선).
          직전 7일 뷰 합계 +{Math.round((topInflection.views_ratio - 1) * 100)}% 동조{topInflection.is_mega_volume ? " (메가 볼륨)" : ""}.
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>1인당 영상 분포 (인플 기준)</div>
      {distBuckets.map((b) => {
        const count = dist[b.key] as number;
        const pct = Math.round((count / totalCreators) * 100);
        return (
          <div key={b.key} className="dist-row">
            <span>{b.label}</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ width: `${pct}%` }} />
            </div>
            <span style={{ textAlign: "right" }}>{count.toLocaleString()}명</span>
            <span style={{ color: "#9ca3af", textAlign: "right" }}>{pct}%</span>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>
        ★ long-tail {Math.round(((dist["1"] as number) / totalCreators) * 100)}% — portfolio 전략 시그널
      </div>
    </div>
  );
}
