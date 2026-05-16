"use client";

import { useMemo, useState } from "react";
import type {
  BsrSeries,
  MonthlyVideoCount,
  TierBucket,
  TierDistribution,
} from "@/lib/inngest/types";

const W = 800;
const H = 220;

const TIERS: { key: TierBucket; label: string; color: string }[] = [
  { key: "mega", label: "메가", color: "#c0392b" },
  { key: "macro", label: "매크로", color: "#e67e22" },
  { key: "mid", label: "미드", color: "#f1c40f" },
  { key: "micro", label: "마이크로", color: "#27ae60" },
  { key: "nano", label: "나노", color: "#2980b9" },
  { key: "sub-nano", label: "서브나노", color: "#8e44ad" },
  { key: "unknown", label: "미상", color: "#bdc3c7" },
];

function tierTotal(d: TierDistribution): number {
  return TIERS.reduce((s, t) => s + (d[t.key] ?? 0), 0);
}

/**
 * 월간 거시 트렌드 — 인플 티어 비중(100% 누적)에 광고 비중·BSR을 토글로 얹어
 * "매출이 꺾인 달에 인플 구성/광고 비중이 어떻게 바뀌었나"를 보게 한다.
 */
export function MonthlyTrendChart({
  tierByMonth,
  monthlyVideoCounts,
  bsrSeries,
}: {
  tierByMonth?: Record<string, TierDistribution>;
  monthlyVideoCounts: MonthlyVideoCount[];
  bsrSeries: BsrSeries[];
}) {
  const [show, setShow] = useState({ tier: true, ad: true, bsr: false });

  // 월별 BSR 평균 (전 SKU)
  const bsrByMonth = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const s of bsrSeries) {
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
  }, [bsrSeries]);

  const tierMonths = useMemo(
    () =>
      Object.entries(tierByMonth ?? {})
        .filter(([, d]) => tierTotal(d) > 0)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    [tierByMonth],
  );

  const adByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of monthlyVideoCounts) {
      if (r.total > 0) m.set(r.month, r.paid / r.total);
    }
    return m;
  }, [monthlyVideoCounts]);

  // X축 = 모든 소스의 월 합집합
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const [mo] of tierMonths) set.add(mo);
    for (const mo of adByMonth.keys()) set.add(mo);
    for (const mo of bsrByMonth.keys()) set.add(mo);
    return [...set].sort();
  }, [tierMonths, adByMonth, bsrByMonth]);

  if (months.length === 0) {
    return (
      <div className="section-card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          월간 인플·광고 트렌드
        </div>
        <div style={{ fontSize: 12, color: "var(--color-g500)" }}>
          월별 인플/광고 데이터가 없습니다. Phase 2·3 분석 후 표시됩니다.
        </div>
      </div>
    );
  }

  const idxOf = (mo: string) => months.indexOf(mo);
  // 월 균등 배치 (좌우 여백 약간)
  const xOf = (mo: string) => {
    const i = idxOf(mo);
    if (months.length === 1) return W / 2;
    return (i / (months.length - 1)) * (W - 40) + 20;
  };

  // 100% 누적 (0~1) → y. 0%=하단, 100%=상단
  const yPct = (r: number) => H - r * (H - 16) - 8;

  // BSR 정규화 (반전: 낮을수록 위)
  const bsrVals = [...bsrByMonth.values()];
  const bsrMin = bsrVals.length ? Math.min(...bsrVals) : 0;
  const bsrMax = bsrVals.length ? Math.max(...bsrVals) : 1;
  const bsrRange = bsrMax - bsrMin || 1;
  const bsrY = (v: number) => {
    const inv = 1 - (v - bsrMin) / bsrRange; // 낮은 BSR → 1 → 상단
    return H - inv * (H - 16) - 8;
  };

  // 월별 티어 누적 비율 (아래부터 쌓음)
  const cumByMonth = months.map((mo) => {
    const d = tierByMonth?.[mo];
    const total = d ? tierTotal(d) : 0;
    const cum: Record<TierBucket, { lo: number; hi: number }> = {} as never;
    let acc = 0;
    for (const t of TIERS) {
      const ratio = total > 0 ? (d![t.key] ?? 0) / total : 0;
      cum[t.key] = { lo: acc, hi: acc + ratio };
      acc += ratio;
    }
    return { mo, total, cum };
  });

  // x축 tick (월 라벨, 최대 ~7개)
  const tickStep = Math.max(1, Math.ceil(months.length / 7));

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            월간 인플·광고 트렌드
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            월별 · 티어 비중은 그 달 활동 인플루언서 수 기준 100% 누적
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(
            [
              { k: "tier" as const, label: "인플 티어 비중", color: "var(--color-ink)" },
              { k: "ad" as const, label: "광고 비중", color: "var(--color-warn)" },
              { k: "bsr" as const, label: "BSR (매출 대리)", color: "var(--color-accent)" },
            ]
          ).map(({ k, label, color }) => {
            const on = show[k];
            const disabled = k === "bsr" && bsrVals.length === 0;
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 9px",
                  borderRadius: 5,
                  border: `1px solid ${on ? color : "var(--color-g200)"}`,
                  background: on ? color : "white",
                  color: on ? "white" : "var(--color-g500)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          background: "var(--color-g25)",
          borderRadius: 6,
          padding: "16px 16px 30px 16px",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H + 20}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 260, display: "block" }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1="0"
              y1={p * H}
              x2={W}
              y2={p * H}
              stroke="var(--color-g100)"
              strokeWidth="1"
            />
          ))}
          {months.map((mo, i) =>
            i % tickStep === 0 ? (
              <text
                key={mo}
                x={xOf(mo)}
                y={H + 14}
                fontSize="10"
                fill="var(--color-g500)"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {mo.slice(2)}
              </text>
            ) : null,
          )}

          {/* 티어 누적 영역 */}
          {show.tier &&
            months.length > 1 &&
            TIERS.map((t) => {
              const topPts = cumByMonth.map(
                (c) => `${xOf(c.mo)},${yPct(c.cum[t.key].hi)}`,
              );
              const botPts = [...cumByMonth]
                .reverse()
                .map((c) => `${xOf(c.mo)},${yPct(c.cum[t.key].lo)}`);
              return (
                <polygon
                  key={t.key}
                  points={[...topPts, ...botPts].join(" ")}
                  fill={t.color}
                  opacity="0.78"
                />
              );
            })}

          {/* 광고 비중 라인 */}
          {show.ad && months.filter((m) => adByMonth.has(m)).length > 1 && (
            <polyline
              points={months
                .filter((m) => adByMonth.has(m))
                .map((m) => `${xOf(m)},${yPct(adByMonth.get(m)!)}`)
                .join(" ")}
              fill="none"
              stroke="var(--color-warn)"
              strokeWidth="2.2"
            />
          )}

          {/* BSR 라인 (반전 정규화) */}
          {show.bsr && bsrVals.length > 1 && (
            <polyline
              points={months
                .filter((m) => bsrByMonth.has(m))
                .map((m) => `${xOf(m)},${bsrY(bsrByMonth.get(m)!)}`)
                .join(" ")}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}
        </svg>
      </div>

      {/* 범례 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--color-g100)",
          color: "var(--color-g500)",
        }}
      >
        {show.tier &&
          TIERS.map((t) => (
            <span
              key={t.key}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: t.color,
                }}
              />
              {t.label}
            </span>
          ))}
        {show.ad && (
          <span>
            <b style={{ color: "var(--color-warn)" }}>— 광고 비중</b> 0~100%
          </span>
        )}
        {show.bsr && bsrVals.length > 0 && (
          <span>
            <b style={{ color: "var(--color-accent)" }}>┄ BSR</b> #
            {Math.round(bsrMin).toLocaleString()} ~ #
            {Math.round(bsrMax).toLocaleString()} (위로 갈수록 좋음)
          </span>
        )}
      </div>
    </div>
  );
}
