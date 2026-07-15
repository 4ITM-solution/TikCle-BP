"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TikTokEmbed } from "@/components/case-detail/TikTokEmbed";
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

type ChannelMode = "all" | "tk" | "ig" | "yt" | "shop";
type BarMode = "abs" | "pct";

// 변곡점 동반 viral 정렬 축 설정 (조회수/공유/댓글). 옛 케이스는 shares/comments 미채움→0.
type TlVid = { views?: number; shares?: number; comments?: number };
const TL_METRIC_CFG: Record<
  "views" | "shares" | "comments",
  { label: string; get: (v: TlVid) => number }
> = {
  views: { label: "조회수", get: (v) => v.views ?? 0 },
  shares: { label: "공유", get: (v) => v.shares ?? 0 },
  comments: { label: "댓글", get: (v) => v.comments ?? 0 },
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function SectionAMockup({
  phase2,
  phase3,
  phase5,
  monthlyTierByChannel,
  hasAmazon,
  promotionEvents,
}: {
  phase2: Phase2Stats;
  phase3?: {
    tier_dist_by_month?: Record<string, TierDistribution>;
    tier_distribution?: TierDistribution; // 전체 (월별 없을 때 fallback)
  };
  phase5?: Phase5Stats;
  /** 채널별 월별 티어 분포 — Section A 티어 stack 이 채널 토글에 반응하게 (page.tsx server).
   *  Partial — shop 등 일부 채널은 티어 분포가 없어 fallback(TK phase3)으로 렌더. */
  monthlyTierByChannel?: Partial<Record<ChannelMode, Record<string, TierDistribution>>>;
  /** Amazon 채널 있는 case? BSR line + ★ 변곡점 marker 표시 여부 */
  hasAmazon?: boolean;
  /** ★ A6(WS4b): 프로모션 이벤트(월별) — 차트 상단 마커. 추정 금지, 사실 확인된 날짜만(019 시드). */
  promotionEvents?: Array<{ name: string; month: string; start_date: string; importance?: number | null }>;
}) {
  // Hydration 안전 — SSR HTML 박힌 placeholder, mount 후 chart 렌더.
  // SVG chart 박힌 SSR/CSR 다른 결과 가능성 (어떤 컴포넌트가 #418 일으키는지 진단 어려움).
  // mounted state 박힌 박힌 chart 박힌 client-only 박힌 → hydration mismatch 자체 회피.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [channelMode, setChannelMode] = useState<ChannelMode>("all");
  const [barMode, setBarMode] = useState<BarMode>("abs");
  // line overlay 기본 off — 막대 차트 위 너무 겹쳐서 가독성 X. 사용자가 토글 클릭해서 필요한 것만 봄.
  const [show, setShow] = useState({ tier: true, ad: false, bsr: false, vc: true });
  // 변곡점 타임라인 동반 viral 정렬 축 — 조회수/공유/댓글
  const [tlMetric, setTlMetric] = useState<"views" | "shares" | "comments">(
    "views",
  );
  // BSR 데이터 있으면 자동 ON (오버레이 기본 off라 데이터 있어도 안 보이던 문제).
  //   최초 1회만 켜고 이후 사용자 토글은 존중.
  const [bsrAutoOn, setBsrAutoOn] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const tkVids = phase2.total_contents ?? 0;
  const igVids = phase2.ig_total_videos ?? 0;
  const ytVids = phase2.yt_total_videos ?? 0;
  const allVids = tkVids + igVids + ytVids;
  // ★ A1(WS4b): TT샵 콘텐츠 수 — tk 안의 샵분(is_shop_content). 오버레이 채널.
  const tkShopVids = (phase2.monthly_by_channel?.tk_shop ?? []).reduce(
    (s, r) => s + r.total,
    0,
  );

  // 채널 mode에 맞는 monthly (paid/organic) 추출.
  // "all" = TK + IG + YT 합산 (각 월별 paid/organic/total).
  const monthlyForMode = useMemo<MonthlyVideoCount[]>(() => {
    const ch = phase2.monthly_by_channel;
    if (channelMode === "tk") return ch?.tk ?? phase2.monthly_video_counts;
    if (channelMode === "shop") return ch?.tk_shop ?? [];
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

  // ★ A6(WS4b): 프로모션 이벤트 월별 버킷 (마커용)
  const promoByMonth = useMemo(() => {
    const m = new Map<string, Array<{ name: string; start_date: string }>>();
    for (const e of promotionEvents ?? []) {
      const arr = m.get(e.month) ?? [];
      arr.push({ name: e.name, start_date: e.start_date });
      m.set(e.month, arr);
    }
    return m;
  }, [promotionEvents]);

  const totalPaid = monthlyForMode.reduce((s, m) => s + m.paid, 0);
  const totalOrganic = monthlyForMode.reduce((s, m) => s + m.organic, 0);
  const totalView = (phase2.top_creators ?? []).reduce((s, c) => s + (c.max_views ?? 0), 0);

  const totalForMode =
    channelMode === "all" ? allVids :
    channelMode === "tk" ? tkVids :
    channelMode === "shop" ? tkShopVids :
    channelMode === "ig" ? igVids :
    ytVids;

  // ─────────── stack chart ───────────
  const tierByMonth = phase3?.tier_dist_by_month ?? {};
  // 티어 stack 렌더용 — 선택 채널의 월별 티어. 채널별 데이터 있으면 그걸, 없으면 TK(phase3) fallback.
  // (months union 계산엔 기존 tierByMonth 유지해 grid 안정화)
  const tierStackByMonth: Record<string, TierDistribution> =
    monthlyTierByChannel?.[channelMode] ?? tierByMonth;
  // 월별 tier 없을 때 전체 tier_distribution 비율로 fallback (모든 막대 같은 비율로 stack)
  const totalTierFallback = phase3?.tier_distribution
    ? TIERS.reduce((s, t) => s + (phase3.tier_distribution![t.key] ?? 0), 0)
    : 0;
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

  // 월 union — 데이터 있는 month 합집합. 빈 month 도 12개월 grid 위해 채워 일관성.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const mo of Object.keys(tierByMonth)) set.add(mo);
    for (const r of phase2.monthly_video_counts ?? []) set.add(r.month);
    const ch = phase2.monthly_by_channel;
    for (const arr of [ch?.ig, ch?.yt]) {
      if (arr) for (const r of arr) set.add(r.month);
    }
    const arr = [...set].sort();
    if (arr.length === 0) return arr;
    // 데이터 있는 month 의 마지막 month 기준으로 직전 12개월 grid 만듦 (빈 month 채움)
    const last = arr[arr.length - 1]!;
    const [ly, lm] = last.split("-").map(Number);
    const result: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const totalMonths = ly! * 12 + (lm! - 1) - i;
      const yy = Math.floor(totalMonths / 12);
      const mm = (totalMonths % 12) + 1;
      result.push(`${yy}-${String(mm).padStart(2, "0")}`);
    }
    return result;
  }, [tierByMonth, phase2.monthly_video_counts, phase2.monthly_by_channel]);

  // 월별 영상 수 (해당 mode)
  const totalByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of monthlyForMode) m.set(r.month, r.total);
    return m;
  }, [monthlyForMode]);
  // maxVids = 항상 "전체 합산" 기준 (채널 toggle 변경 시 막대 height 차이 시각화).
  // TK mode 면 TK 막대가 작게, IG mode 면 IG 막대가 크게 — 채널별 영상 수 비교.
  const globalMaxVids = useMemo(() => {
    const ch = phase2.monthly_by_channel;
    const tkArr = ch?.tk ?? phase2.monthly_video_counts;
    const igArr = ch?.ig ?? [];
    const ytArr = ch?.yt ?? [];
    const merged = new Map<string, number>();
    for (const arr of [tkArr, igArr, ytArr]) {
      for (const r of arr) {
        merged.set(r.month, (merged.get(r.month) ?? 0) + r.total);
      }
    }
    return Math.max(1, ...Array.from(merged.values()));
  }, [phase2]);
  // 전체(all)면 합산 max로 채널 크기 차이를 보이고, 특정 채널(tk/ig/yt) 선택 시엔
  // 그 채널 자체 max로 스케일 — 안 그러면 IG/YT(월 수십)가 TK(월 수백~천) max 대비
  // 막대 높이 ~2%로 안 보임("영상 수 안 보임" 버그).
  const maxVids = useMemo(() => {
    if (channelMode === "all") return globalMaxVids;
    return Math.max(1, ...monthlyForMode.map((m) => m.total));
  }, [channelMode, globalMaxVids, monthlyForMode]);

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

  // BSR 데이터가 잡히면 최초 1회 자동으로 라인 ON (이후 사용자가 끄면 존중).
  useEffect(() => {
    if (!bsrAutoOn && bsrVals.length > 0) {
      setShow((s) => ({ ...s, bsr: true }));
      setBsrAutoOn(true);
    }
  }, [bsrVals.length, bsrAutoOn]);

  // 변곡점 callout
  const topInflection = useMemo(() => {
    if (!phase5?.bsr_inflections || phase5.bsr_inflections.length === 0) return null;
    return [...phase5.bsr_inflections].sort(
      (a, b) => b.rank_improvement_pct - a.rank_improvement_pct,
    )[0];
  }, [phase5]);

  // 1인당 영상 분포는 B(인플 풀)의 활동 3축 분포로 이관 (Part2 A) — 여기선 제거.

  const fmtView = (n: number) =>
    n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B` :
    n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` :
    n >= 1_000 ? `${Math.round(n / 1000)}K` :
    n.toLocaleString();

  // SSR / 첫 CSR 렌더 — placeholder 만 (hydration mismatch 방지).
  if (!mounted) {
    return (
      <div className="section" id="sec-a">
        <div className="section-h">
          <span className="letter">A</span>
          <span className="title">콘텐츠 활동</span>
          <span className="sub">★ 월간 인플 티어 · 광고 비중 · BSR 통합 트렌드 (호버 시 디테일)</span>
        </div>
        <div style={{ height: 600, background: "#fafafa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>
          차트 로딩 중…
        </div>
      </div>
    );
  }

  // 진행 중인 이번 달(부분월)은 데이터가 미완성 → 오버레이 라인에서 제외해
  // 막대 꼭대기를 따라 바닥/천장으로 급등락하며 plot 가장자리로 튀는 현상 방지.
  // (막대 + ★ 라벨은 그대로 표시. Date는 mounted 이후라 client-only → hydration 안전.)
  const _now = new Date();
  const nowYM = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
  const lastIsPartial = months.length > 1 && months[months.length - 1] === nowYM;
  const lineEndIdx = lastIsPartial ? months.length - 1 : months.length; // 라인에 그릴 month 개수
  const inLineRange = (mo: string) => months.indexOf(mo) < lineEndIdx;

  // 오버레이 라인(영상수·광고비중·BSR) 표시 밴드 — viewBox 0~222 중 안쪽 [6,190]로 보정.
  // 막대(티어 stack)와 라인이 같은 plot을 '다른 y축'으로 겹쳐 쓰므로, 라인 값이 0일 때
  // 바닥(=날짜축)에 깔리거나 max일 때 천장에 닿는 걸 방지. frac(0~1) → 밴드 안 y.
  // 오버레이 라인 밴드 — plot 위쪽 [28,158]에만 머물게. 데이터 범위 큰 달(128~2180)에서
  //   짧은 막대 달에 라인이 바닥(=라벨 영역)까지 처져 텍스트랑 붙어 보이던 문제 →
  //   모든 라인(영상수·광고·BSR)을 같은 상단 밴드로 가둬 텍스트 영역과 확실히 분리.
  const LINE_TOP = 28;
  const LINE_BOT = 158;
  const bandY = (frac: number) =>
    LINE_TOP + (1 - Math.max(0, Math.min(1, frac))) * (LINE_BOT - LINE_TOP);
  // 영상수 라인도 같은 밴드 사용 (막대 top 정밀 추종보다 "텍스트와 분리"를 우선).
  const barTopY = bandY;

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
            // ★ A1(WS4b): 샵 콘텐츠 있을 때만 노출 — 없으면 토글 자체 숨김(add-only).
            ...(tkShopVids > 0
              ? [{ k: "shop", label: `틱톡샵 (${tkShopVids.toLocaleString()})`, n: tkShopVids }]
              : []),
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
          <div className="kpi-label" title="스파크애즈 등 유료 광고로 집행된 영상 비중 (is_ad)">광고 집행 비중 <span style={{ color: "#9ca3af", fontWeight: 400 }}>(스파크애즈)</span></div>
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
          <div className="kpi-sub">—</div>
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
            disabled={!hasAmazon || bsrVals.length === 0}
            style={{ opacity: !hasAmazon || bsrVals.length === 0 ? 0.4 : 1 }}
            title={!hasAmazon ? "Amazon case 만 BSR 의미" : ""}
          >
            BSR line (Amazon)
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
            const td = tierStackByMonth[mo];
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
                title={
                  promoByMonth.has(mo)
                    ? `${mo} · ${total} 영상 · 📅 ${promoByMonth.get(mo)!.map((e) => e.name).join(", ")}`
                    : `${mo} · ${total} 영상`
                }
              >
                {/* 티어 데이터 있을 때 stack. 월별 없으면 전체 phase3.tier_distribution 비율로 fallback. */}
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
                {/* tier 데이터 없으면 빈 막대 (단색 dim) — mockup엔 fallback 없음 */}
                {show.tier && !hasTierData && total > 0 && (
                  <div
                    style={{
                      height: "100%",
                      background: "#e5e7eb",
                      opacity: 0.5,
                    }}
                    title={`${total} 영상 (tier 데이터 없음)`}
                  />
                )}
                <div className="sb-label" style={isPeak ? { color: "#ec4899", fontWeight: 700 } : {}}>
                  {promoByMonth.has(mo) && (
                    <span title={promoByMonth.get(mo)!.map((e) => `${e.name} (${e.start_date})`).join(" · ")}>📅</span>
                  )}
                  {`'${mo.slice(2)}`}
                  <br />
                  {total}
                  {isPeak ? " ★" : ""}
                </div>
              </div>
            );
          })}

          {/* SVG overlay — stack-bars 박힘 안 박힘 child 박힘 박힘 박힘 박힘 line 박힘 박힘 박힘 박힘 alignment 박힘 박힘 guaranteed.
              padding 박힘 박힘 박힘 박힘 박힘 박힘 box 박힘 박힘 박힘 박힘 박힘 박힘 박힘. */}
          <svg className="overlay-svg" viewBox="0 0 1100 222" preserveAspectRatio="none">
            {show.vc && lineEndIdx > 1 && (
              <polyline
                points={months
                  .slice(0, lineEndIdx)
                  .map((mo, i) => {
                    const x = (i / (months.length - 1)) * 1000 + 50;
                    const total = totalByMonth.get(mo) ?? 0;
                    const y = barTopY(total / maxVids);
                    return `${x},${y}`;
                  })
                  .join(" ")}
                stroke="#1f2937"
                strokeWidth="3"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {show.ad && lineEndIdx > 1 && (() => {
              const adRatios = months.filter((mo) => adByMonth.has(mo) && inLineRange(mo)).map((mo) => adByMonth.get(mo) ?? 0);
              const adMax = Math.max(...adRatios, 0);
              const nonZeroCount = adRatios.filter((r) => r > 0.01).length;
              if (nonZeroCount < 2 || adMax < 0.02) return null;
              const scaleMax = Math.max(adMax, 0.10);
              return (
                <polyline
                  points={months
                    .filter((mo) => adByMonth.has(mo) && inLineRange(mo))
                    .map((mo) => {
                      const idx = months.indexOf(mo);
                      const x = (idx / (months.length - 1)) * 1000 + 50;
                      const ratio = (adByMonth.get(mo) ?? 0) / scaleMax;
                      const y = bandY(ratio);
                      return `${x},${y}`;
                    })
                    .join(" ")}
                  stroke="#f59e0b"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })()}
            {show.bsr && hasAmazon && bsrVals.length > 1 && (
              <polyline
                points={months
                  .filter((mo) => bsrByMonth.has(mo) && inLineRange(mo))
                  .map((mo) => {
                    const idx = months.indexOf(mo);
                    const x = (idx / (months.length - 1)) * 1000 + 50;
                    const v = bsrByMonth.get(mo)!;
                    const inv = Math.max(0, Math.min(1, 1 - (v - bsrMin) / bsrRange));
                    const y = bandY(inv);
                    return `${x},${y}`;
                  })
                  .join(" ")}
                stroke="#ef4444"
                strokeWidth="2"
                fill="none"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hasAmazon && phase5?.bsr_inflections?.map((inf, infI) => {
              const mo = inf.date.slice(0, 7);
              const idx = months.indexOf(mo);
              if (idx === -1) return null;
              const x = months.length > 1 ? (idx / (months.length - 1)) * 1000 + 50 : 550;
              return (
                <g key={`inf-${infI}`}>
                  <text x={x} y={14} fontSize="14" textAnchor="middle" fill="#ec4899" style={{ cursor: "pointer" }}>★</text>
                  {/* 변곡점 점선 — 트렌드 라인 밴드 바닥(158)에 맞춰 160에서 끝냄. 라벨 영역 안 침범. */}
                  <line x1={x} y1={18} x2={x} y2={160} stroke="#ec4899" strokeWidth="1" strokeDasharray="3 2" opacity="0.4" />
                </g>
              );
            })}
            {(() => {
              // 사용자가 hover 한 시점에만 dot + vertical line 표시.
              // 이전에는 hoverIdx ?? months.length-1 로 마지막 month 에 default dot 그렸는데,
              // value 가 작으면 dot 이 chart ground 근처 또는 아래로 박혀 시각적으로 박스 밖처럼 보임.
              const idx = hoverIdx;
              if (idx === null || idx < 0 || months.length === 0) return null;
              const x = months.length > 1 ? (idx / (months.length - 1)) * 1000 + 50 : 550;
              const mo = months[idx]!;
              const total = totalByMonth.get(mo) ?? 0;
              // dot 도 라인과 동일 밴드(bandY)에 맞춰 — 라인 위에 정확히 얹힘.
              const vcY = total > 0 ? barTopY(total / maxVids) : barTopY(0);
              const bsr = bsrByMonth.get(mo);
              const bsrY = bsr !== undefined && bsrVals.length > 0 ? bandY(1 - (bsr - bsrMin) / bsrRange) : null;
              return (
                <>
                  <line x1={x} y1="0" x2={x} y2="222" stroke="#1f2937" strokeWidth="1" strokeDasharray="2" />
                  {show.vc && total > 0 && (
                    <circle cx={x} cy={vcY} r="5" fill="#06b6d4" stroke="white" strokeWidth="2" />
                  )}
                  {show.bsr && bsrY !== null && (
                    <circle cx={x} cy={bsrY} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
                  )}
                </>
              );
            })()}
          </svg>
        </div>

        {/* ★ 호버 시 디테일 tooltip (mockup line 705-722) */}
        {hoverIdx !== null && months[hoverIdx] && (() => {
          const mo = months[hoverIdx]!;
          const total = totalByMonth.get(mo) ?? 0;
          const td = tierStackByMonth[mo];
          const tierTotal = td ? TIERS.reduce((s, t) => s + (td[t.key] ?? 0), 0) : 0;
          const r = monthlyForMode.find((x) => x.month === mo);
          const paid = r?.paid ?? 0;
          const adPct = total > 0 ? Math.round((paid / total) * 100) : 0;
          const bsr = bsrByMonth.get(mo);
          // vs prev — 이전 month 와 변화율
          const prevMo = hoverIdx > 0 ? months[hoverIdx - 1] : null;
          const prevTotal = prevMo ? (totalByMonth.get(prevMo) ?? 0) : 0;
          const vsPrevPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;
          const prevBsr = prevMo ? bsrByMonth.get(prevMo) : undefined;
          const bsrChangePct =
            bsr !== undefined && prevBsr !== undefined && prevBsr > 0
              ? Math.round(((bsr - prevBsr) / prevBsr) * 100)
              : null;
          const isPeak = hoverIdx === months.length - 1 && total > 0;
          const isInflection =
            Math.abs(vsPrevPct) >= 40 || (bsrChangePct !== null && Math.abs(bsrChangePct) >= 50);
          // tooltip 위치 — hover 막대 위치 따라 left/right 자동 전환
          // 마지막 1/3 막대 hover 시 tooltip 을 왼쪽에 박음 (오른쪽 박스 밖 안 나가게)
          // CSS 기본 right:80px 박혀있어서 inline 으로 명시적 unset 박아야.
          const isRightSide = hoverIdx >= Math.floor(months.length * 2 / 3);
          const tooltipPos: React.CSSProperties = isRightSide
            ? { left: 30, right: "auto" }
            : { right: 30, left: "auto" };
          return (
            <div className="trend-tooltip" style={tooltipPos}>
              <div className="tt-h">
                {mo}
                {isPeak ? " ★ 최신" : ""}
                {isInflection ? " ★ 변곡점" : ""}
              </div>
              <table>
                <tbody>
                  <tr>
                    <td><span className="tt-color" style={{ background: "#06b6d4" }} />총 영상</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#06b6d4" }}>
                      <b>{total}개{vsPrevPct > 0 ? " ▲" : vsPrevPct < 0 ? " ▼" : ""}</b>
                    </td>
                  </tr>
                  {prevMo && prevTotal > 0 && (
                    <tr>
                      <td colSpan={2} style={{ fontSize: 9, color: "#9ca3af" }}>
                        vs {prevMo.slice(2)}: {prevTotal} → {vsPrevPct > 0 ? "+" : ""}{vsPrevPct}%
                      </td>
                    </tr>
                  )}
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
                    <tr>
                      <td colSpan={2} style={{ color: "#9ca3af", fontSize: 10, paddingTop: 4 }}>
                        티어 분포 미수집
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="tt-stat">
                <span style={{ color: "#f59e0b" }}>광고 비중 {adPct}%</span>
                {bsr !== undefined && (
                  <>
                    <br />
                    <span style={{ color: "#ef4444" }}>
                      <b>BSR #{Math.round(bsr).toLocaleString()}{bsrChangePct !== null && bsrChangePct < 0 ? " ▼" : bsrChangePct !== null && bsrChangePct > 0 ? " ▲" : ""}</b>
                    </span>
                    {bsrChangePct !== null && (
                      <span style={{ color: "#9ca3af", fontSize: 9 }}>
                        {" "}({bsrChangePct > 0 ? "+" : ""}{bsrChangePct}%)
                      </span>
                    )}
                  </>
                )}
                {isInflection && vsPrevPct > 0 && bsrChangePct !== null && bsrChangePct < 0 && (
                  <>
                    <br />
                    <span style={{ color: "#10b981", fontSize: 10 }}>
                      → 영상 수+{vsPrevPct}% & BSR{bsrChangePct}% 동조
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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

      {hasAmazon && topInflection && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#ecfdf5", borderLeft: "3px solid #10b981", borderRadius: 4, fontSize: 11, color: "#065f46" }}>
          💡 <b>볼륨 ↔ BSR 상관:</b> {topInflection.date} 시점 BSR #{topInflection.rank_before.toLocaleString()} → #{topInflection.rank_after.toLocaleString()} ({Math.round(topInflection.rank_improvement_pct)}% 개선).
          직전 7일 뷰 합계 +{Math.round((topInflection.views_ratio - 1) * 100)}% 동조{topInflection.is_mega_volume ? " (메가 볼륨)" : ""}.
        </div>
      )}

      {/* 1인당 영상 분포 → B(인플 풀)의 활동 3축 분포로 이관 (Part2 A) */}

      {/* ★ C3(WS4b): 서술(topInflection 콜아웃) 먼저, 상세 timeline 은 접어둠(기본 닫힘).
          A·D 중복은 D 섹션이 주(主) — 여기선 요약 서술 + 접힌 상세만. */}
      {hasAmazon &&
        phase5?.bsr_inflections &&
        phase5.bsr_inflections.some((inf) => inf.top_videos.length > 0) && (
        <details style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid #e5e7eb" }}>
          <summary style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, cursor: "pointer" }}>
            ✨ 변곡점 상세 timeline 펼치기 (주요{" "}
            {Math.min(phase5.bsr_inflections.filter((inf) => inf.top_videos.length > 0).length, 15)}개){" "}
            <span style={{ color: "#9ca3af", fontWeight: 400 }}>· 매출 급등 상세는 D(매출·SKU) 섹션과 동일</span>
          </summary>
          {/* 동반 viral 정렬 축 토글 — 조회수/공유/댓글 */}
          {phase5.bsr_inflections.some((inf) =>
            inf.top_videos.some((v) => v.shares != null || v.comments != null),
          ) && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginTop: 10,
                marginBottom: 2,
              }}
            >
              <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                동반 viral 정렬
              </span>
              {(["views", "shares", "comments"] as const).map((m) => {
                const on = tlMetric === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTlMetric(m)}
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      padding: "3px 9px",
                      borderRadius: 5,
                      border: `1px solid ${on ? "#ec4899" : "#e5e7eb"}`,
                      background: on ? "#ec4899" : "#fff",
                      color: on ? "#fff" : "#6b7280",
                      cursor: "pointer",
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    {TL_METRIC_CFG[m].label}순
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[...phase5.bsr_inflections.filter((inf) => inf.top_videos.length > 0)]
              .sort((a, b) => Math.abs(b.rank_improvement_pct) - Math.abs(a.rank_improvement_pct))
              .slice(0, 15) // 줄줄이 방지 — 개선폭 큰 주요 급등 15개만
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((inf, i) => (
                <div
                  key={`tl-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr",
                    gap: 12,
                    padding: 10,
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#ec4899" }}>
                      ★ {inf.date}
                    </div>
                    <div style={{ fontSize: 10, color: "#92400e", fontFamily: "monospace", marginTop: 2 }}>
                      ASIN {inf.asin}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#1f2937", marginBottom: 4 }}>
                      <b style={{ color: "#ec4899" }}>
                        BSR #{inf.rank_before.toLocaleString()} → #{inf.rank_after.toLocaleString()}
                      </b>{" "}
                      ({inf.rank_improvement_pct > 0 ? "▲" : "▼"}{" "}
                      {Math.abs(inf.rank_improvement_pct).toFixed(0)}%) ·{" "}
                      <span style={{ color: inf.is_mega_volume ? "#ec4899" : "#6b7280", fontWeight: inf.is_mega_volume ? 700 : 400 }}>
                        뷰 ×{inf.views_ratio.toFixed(1)}{inf.is_mega_volume ? " 🔥" : ""}
                      </span>{" "}
                      ({inf.views_window.toLocaleString()} vs {inf.views_compare.toLocaleString()})
                    </div>
                    {inf.top_videos.length > 0 && (
                      <div style={{ fontSize: 10, color: "#6b7280", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                        <span style={{ color: "#9ca3af" }}>
                          동반 viral{tlMetric !== "views" ? ` (${TL_METRIC_CFG[tlMetric].label}순)` : ""}:
                        </span>
                        {/* ★ C2(WS4b): 변곡점 전후 대표 영상 인라인 임베드(클릭 로드) — 선택 지표 desc top 3 */}
                        {[...inf.top_videos]
                          .sort((a, b) => TL_METRIC_CFG[tlMetric].get(b) - TL_METRIC_CFG[tlMetric].get(a))
                          .filter((v) => TL_METRIC_CFG[tlMetric].get(v) > 0)
                          .slice(0, 3)
                          .map((v, vi) => (
                          <span key={vi} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontFamily: "monospace", color: "#6b7280" }}>
                              #{vi + 1} {fmtCompact(TL_METRIC_CFG[tlMetric].get(v))}
                              {tlMetric === "shares" ? " 공유" : tlMetric === "comments" ? " 댓글" : ""}
                            </span>
                            <TikTokEmbed url={v.url} title={v.caption ?? undefined} compact />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
