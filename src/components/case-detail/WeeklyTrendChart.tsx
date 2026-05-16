"use client";

import { useMemo, useState } from "react";
import type { BsrSeries } from "@/lib/inngest/types";
import type { WeeklyViewPoint } from "./BsrTrendChart";

const W = 800;
const H = 200;

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

type SeriesKey = "views" | "videos" | "bsr";

const SERIES_META: Record<
  SeriesKey,
  { label: string; color: string; kind: "bar" | "line" }
> = {
  views: { label: "영상 조회수", color: "var(--color-info)", kind: "bar" },
  videos: { label: "영상 개수", color: "var(--color-ink)", kind: "line" },
  bsr: { label: "BSR (매출 대리)", color: "var(--color-accent)", kind: "line" },
};

/**
 * 주간 거시 트렌드 — 전체 영상 주간 조회수·개수에 BSR(매출 대리)을 토글로 얹어
 * "매출 등락 시점에 영상 활동이 어땠나"를 보게 한다.
 * 각 시리즈는 자체 min~max로 정규화 — 절대값이 아니라 모양(추세) 비교가 목적.
 */
export function WeeklyTrendChart({
  weeklyViews,
  bsrSeries,
}: {
  weeklyViews?: WeeklyViewPoint[];
  bsrSeries: BsrSeries[];
}) {
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({
    views: true,
    videos: true,
    bsr: false,
  });

  const weekly = useMemo(
    () =>
      [...(weeklyViews ?? [])].sort((a, b) =>
        a.week_start < b.week_start ? -1 : 1,
      ),
    [weeklyViews],
  );

  // BSR 일별 → 날짜별 전 SKU 평균 (거시 그래프라 SKU별 분리 안 함)
  const bsrAvg = useMemo(() => {
    const byDate = new Map<string, { sum: number; n: number }>();
    for (const s of bsrSeries) {
      for (const p of s.points) {
        const e = byDate.get(p.date) ?? { sum: 0, n: 0 };
        e.sum += p.bsr;
        e.n += 1;
        byDate.set(p.date, e);
      }
    }
    return [...byDate.entries()]
      .map(([date, e]) => ({ date, bsr: e.sum / e.n }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [bsrSeries]);

  if (weekly.length === 0) {
    return (
      <div className="section-card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          주간 영상 트렌드
        </div>
        <div style={{ fontSize: 12, color: "var(--color-g500)" }}>
          주간 영상 데이터가 없습니다. Exolyt 주간 조회수 export를
          업로드하면 표시됩니다.
        </div>
      </div>
    );
  }

  // 시간축 = weekly + bsr 합산 범위
  const allDates = [
    ...weekly.map((w) => w.week_start),
    ...bsrAvg.map((b) => b.date),
  ];
  const minDate = allDates.reduce((m, d) => (d < m ? d : m), allDates[0]!);
  const maxDate = allDates.reduce((m, d) => (d > m ? d : m), allDates[0]!);
  const minTs = new Date(minDate).getTime();
  const maxTs = new Date(maxDate).getTime();
  const dateRange = Math.max(1, maxTs - minTs);
  const xOf = (d: string) =>
    ((new Date(d).getTime() - minTs) / dateRange) * W;

  // 시리즈별 정규화 (자체 min~max → 0~1)
  const viewVals = weekly.map((w) => w.total_views);
  const videoVals = weekly.map((w) => w.total_videos);
  const bsrVals = bsrAvg.map((b) => b.bsr);
  const norm = (vals: number[]) => {
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    const r = max - min || 1;
    return { min, max, fn: (v: number) => (v - min) / r };
  };
  const viewN = norm(viewVals);
  const videoN = norm(videoVals);
  const bsrN = norm(bsrVals);

  // 막대 폭 = 인접 주 간격의 80%
  const weekWidth =
    weekly.length > 1
      ? ((xOf(weekly[1]!.week_start) - xOf(weekly[0]!.week_start)) * 0.8)
      : 12;

  // x축 month tick
  const xTicks: Array<{ x: number; label: string }> = [];
  {
    const start = new Date(minDate);
    start.setDate(1);
    const end = new Date(maxDate);
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1;
    const step = Math.max(1, Math.ceil(months / 6));
    const cur = new Date(start);
    while (cur <= end) {
      const ds = cur.toISOString().slice(0, 10);
      xTicks.push({
        x: xOf(ds),
        label: `${cur.getFullYear().toString().slice(2)}.${String(
          cur.getMonth() + 1,
        ).padStart(2, "0")}`,
      });
      cur.setMonth(cur.getMonth() + step);
    }
  }

  const yOf = (n01: number) => H - n01 * (H - 16) - 8;

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
            주간 영상 트렌드
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            주간 · 각 시리즈 자체 스케일 정규화 (모양 비교용)
          </div>
        </div>
        {/* 토글 칩 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => {
            const m = SERIES_META[k];
            const on = show[k];
            const disabled = k === "bsr" && bsrAvg.length === 0;
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
                  border: `1px solid ${on ? m.color : "var(--color-g200)"}`,
                  background: on ? m.color : "white",
                  color: on ? "white" : "var(--color-g500)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: m.kind === "bar" ? 1 : 4,
                    background: on ? "white" : m.color,
                  }}
                />
                {m.label}
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
          style={{ width: "100%", height: 250, display: "block" }}
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
          {xTicks.map((t) => (
            <g key={t.label}>
              <line
                x1={t.x}
                y1={0}
                x2={t.x}
                y2={H}
                stroke="var(--color-g100)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text
                x={t.x}
                y={H + 14}
                fontSize="10"
                fill="var(--color-g500)"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* 영상 조회수 — 막대 */}
          {show.views &&
            weekly.map((w) => {
              const x = xOf(w.week_start);
              const y = yOf(viewN.fn(w.total_views));
              return (
                <rect
                  key={w.week_start}
                  x={x - weekWidth / 2}
                  y={y}
                  width={weekWidth}
                  height={H - 8 - y}
                  fill={SERIES_META.views.color}
                  opacity="0.28"
                />
              );
            })}

          {/* 영상 개수 — 라인 */}
          {show.videos && weekly.length > 1 && (
            <polyline
              points={weekly
                .map((w) => `${xOf(w.week_start)},${yOf(videoN.fn(w.total_videos))}`)
                .join(" ")}
              fill="none"
              stroke={SERIES_META.videos.color}
              strokeWidth="1.8"
            />
          )}

          {/* BSR — 반전 정규화 라인 (낮을수록 위 = 좋음) */}
          {show.bsr && bsrAvg.length > 1 && (
            <polyline
              points={bsrAvg
                .map((b) => `${xOf(b.date)},${yOf(1 - bsrN.fn(b.bsr))}`)
                .join(" ")}
              fill="none"
              stroke={SERIES_META.bsr.color}
              strokeWidth="1.8"
              strokeDasharray="4 3"
            />
          )}
        </svg>
      </div>

      {/* 범례 + 시리즈별 현재 스케일 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--color-g100)",
          color: "var(--color-g500)",
        }}
      >
        {show.views && (
          <span>
            <b style={{ color: SERIES_META.views.color }}>■ 조회수</b>{" "}
            {formatNum(viewN.min)} ~ {formatNum(viewN.max)}/주
          </span>
        )}
        {show.videos && (
          <span>
            <b style={{ color: SERIES_META.videos.color }}>— 영상수</b>{" "}
            {formatNum(videoN.min)} ~ {formatNum(videoN.max)}/주
          </span>
        )}
        {show.bsr && bsrAvg.length > 0 && (
          <span>
            <b style={{ color: SERIES_META.bsr.color }}>┄ BSR</b> #
            {formatNum(bsrN.min)} ~ #{formatNum(bsrN.max)} (위로 갈수록 좋음)
          </span>
        )}
      </div>
    </div>
  );
}
