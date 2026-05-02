"use client";

import { useMemo, useState } from "react";
import type {
  BsrInflection,
  BsrSeries,
} from "@/lib/inngest/types";

const W = 800;
const H = 240;
const COLORS = [
  "var(--color-accent)",
  "var(--color-ink)",
  "var(--color-info)",
  "var(--color-warn)",
  "var(--color-pos)",
];

function extractTikTokVideoId(url: string): string | null {
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function BsrTrendChart({
  bsrSeries: bsrSeriesAll,
  inflections,
}: {
  bsrSeries: BsrSeries[];
  inflections?: BsrInflection[];
}) {
  const [selectedAsin, setSelectedAsin] = useState<string>("all");
  const [selectedInflection, setSelectedInflection] =
    useState<BsrInflection | null>(null);

  // 드롭다운 선택에 따라 시계열 필터링 (단 색상 인덱스는 전체 기준 유지)
  const bsrSeries = useMemo(
    () =>
      selectedAsin === "all"
        ? bsrSeriesAll
        : bsrSeriesAll.filter((s) => s.asin === selectedAsin),
    [bsrSeriesAll, selectedAsin],
  );

  // 색상 매핑은 전체 시계열 기준 (필터 후에도 SKU 색상 일관)
  const colorByAsinAll = useMemo(() => {
    const m = new Map<string, string>();
    bsrSeriesAll.forEach((s, i) => m.set(s.asin, COLORS[i % COLORS.length]!));
    return m;
  }, [bsrSeriesAll]);

  const allPoints = useMemo(
    () => bsrSeries.flatMap((s) => s.points),
    [bsrSeries],
  );

  if (allPoints.length === 0) return null;

  const minDate = allPoints.reduce(
    (min, p) => (p.date < min ? p.date : min),
    allPoints[0]!.date,
  );
  const maxDate = allPoints.reduce(
    (max, p) => (p.date > max ? p.date : max),
    allPoints[0]!.date,
  );
  const minBsr = Math.max(
    1,
    allPoints.reduce((m, p) => Math.min(m, p.bsr), Infinity),
  );
  const maxBsr = allPoints.reduce((m, p) => Math.max(m, p.bsr), 0);

  const minTs = new Date(minDate).getTime();
  const maxTs = new Date(maxDate).getTime();
  const dateRange = Math.max(1, maxTs - minTs);

  const xOf = (d: string) => ((new Date(d).getTime() - minTs) / dateRange) * W;
  const logMin = Math.log(minBsr);
  const logMax = Math.log(maxBsr);
  const logRange = Math.max(0.001, logMax - logMin);
  const yOf = (b: number) =>
    ((Math.log(b) - logMin) / logRange) * (H - 20) + 10;

  // x축 month tick (3-6개)
  const xTicks = useMemo(() => {
    const startDate = new Date(minDate);
    startDate.setDate(1);
    const endDate = new Date(maxDate);
    const ticks: Array<{ date: string; label: string; x: number }> = [];
    const totalMonths =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth()) +
      1;
    const step = Math.max(1, Math.ceil(totalMonths / 6));
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const label = `${cursor.getFullYear().toString().slice(2)}.${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      ticks.push({ date: dateStr, label, x: xOf(dateStr) });
      cursor.setMonth(cursor.getMonth() + step);
    }
    return ticks;
  }, [minDate, maxDate, minTs, dateRange]);

  const colorByAsin = colorByAsinAll;

  // 그래프 표시 가능한 inflection만 (asin이 현재 표시 중인 시계열에 있고 date가 범위 내)
  const visibleInflections = useMemo(() => {
    if (!inflections) return [];
    const asinsInChart = new Set(bsrSeries.map((s) => s.asin));
    return inflections.filter((inf) => {
      if (!asinsInChart.has(inf.asin)) return false;
      const t = new Date(inf.date).getTime();
      return t >= minTs && t <= maxTs;
    });
  }, [inflections, bsrSeries, minTs, maxTs]);

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>SKU별 BSR 추이</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {selectedAsin === "all"
              ? `매출 Top ${bsrSeriesAll.length} SKU`
              : `${selectedAsin}만 표시`}
            {" · 일별 (낮을수록 좋음, log scale)"}
            {visibleInflections.length > 0 && (
              <>
                {" · "}
                <span
                  style={{ color: "var(--color-accent)", fontWeight: 700 }}
                >
                  ↑ {visibleInflections.length}개 급등
                </span>{" "}
                (rank ≥50% 개선)
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
            }}
          >
            SKU
          </span>
          <select
            value={selectedAsin}
            onChange={(e) => {
              setSelectedAsin(e.target.value);
              setSelectedInflection(null);
            }}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
              color: "var(--color-ink)",
              cursor: "pointer",
              maxWidth: 320,
            }}
          >
            <option value="all">전체 ({bsrSeriesAll.length})</option>
            {bsrSeriesAll.map((s) => (
              <option key={s.asin} value={s.asin}>
                {s.asin} · {s.name.slice(0, 30)}
                {s.name.length > 30 ? "…" : ""}
                {s.points.length < 2
                  ? ` (데이터 ${s.points.length}일)`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          background: "var(--color-g25)",
          borderRadius: 6,
          padding: "16px 16px 30px 16px",
          position: "relative",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H + 20}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 280, display: "block" }}
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
          {/* x축 month tick (verticals + labels) */}
          {xTicks.map((t) => (
            <g key={t.date}>
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
          {/* line series */}
          {bsrSeries.map((s) => {
            const color = colorByAsinAll.get(s.asin) ?? COLORS[0]!;
            // points < 2면 polyline 안 그려져서 단일 circle로 표시
            if (s.points.length < 2) {
              if (s.points.length === 0) return null;
              const p = s.points[0]!;
              return (
                <circle
                  key={s.asin}
                  cx={xOf(p.date)}
                  cy={yOf(p.bsr)}
                  r={4}
                  fill={color}
                />
              );
            }
            const pts = s.points
              .map((p) => `${xOf(p.date)},${yOf(p.bsr)}`)
              .join(" ");
            return (
              <polyline
                key={s.asin}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="1.8"
              />
            );
          })}
          {/* inflection markers */}
          {visibleInflections.map((inf) => {
            const x = xOf(inf.date);
            const y = yOf(inf.rank_after);
            const color = colorByAsin.get(inf.asin) ?? "var(--color-accent)";
            const isSelected =
              selectedInflection?.asin === inf.asin &&
              selectedInflection?.date === inf.date;
            return (
              <g
                key={`${inf.asin}-${inf.date}`}
                onClick={() =>
                  setSelectedInflection(isSelected ? null : inf)
                }
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 9 : 6}
                  fill={inf.is_mega_volume ? color : "white"}
                  stroke={color}
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={y - 14}
                  fontSize="11"
                  fill={color}
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  ↑
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--color-g100)",
        }}
      >
        {bsrSeries.map((s) => (
          <span
            key={s.asin}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 12,
                height: 2,
                background: colorByAsinAll.get(s.asin) ?? COLORS[0],
              }}
            />
            {s.asin} · {s.name.slice(0, 30)}
            {s.name.length > 30 ? "…" : ""}
          </span>
        ))}
        {visibleInflections.length > 0 && (
          <span
            style={{
              marginLeft: "auto",
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ↑ marker 클릭 → 동반 콘텐츠 보기
          </span>
        )}
      </div>

      {/* inflection detail */}
      {selectedInflection && (
        <InflectionDetail
          inf={selectedInflection}
          color={
            colorByAsin.get(selectedInflection.asin) ?? "var(--color-accent)"
          }
          onClose={() => setSelectedInflection(null)}
        />
      )}
    </div>
  );
}

function InflectionDetail({
  inf,
  color,
  onClose,
}: {
  inf: BsrInflection;
  color: string;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        background: "var(--color-g25)",
        border: `1px solid ${color}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-ink)",
            }}
          >
            <span style={{ color }}>{inf.asin}</span> · {inf.date} BSR 급등
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
              marginTop: 4,
            }}
          >
            rank #{inf.rank_before.toLocaleString()} → #
            {inf.rank_after.toLocaleString()} (
            {inf.rank_improvement_pct.toFixed(1)}% 개선)
            {" · "}
            직전 7일 콘텐츠 뷰{" "}
            <b style={{ color: "var(--color-ink)" }}>
              {formatViews(inf.views_window)}
            </b>
            {" / 그 직전 7일 "}
            <b>{formatViews(inf.views_compare)}</b>
            {inf.views_compare > 0 && (
              <>
                {" · "}
                <span
                  style={{
                    color: inf.is_mega_volume
                      ? "var(--color-accent)"
                      : "var(--color-g400)",
                    fontWeight: inf.is_mega_volume ? 700 : 400,
                  }}
                >
                  {inf.views_ratio.toFixed(1)}x
                  {inf.is_mega_volume ? " 메가 볼륨" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
          }}
        >
          ✕ 닫기
        </button>
      </div>

      {inf.top_videos.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--color-g400)" }}>
          그 7일 윈도우에 매칭된 영상 없음 (외부 콘텐츠 영향일 수 있음)
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {inf.top_videos.map((v, idx) => {
            const id = extractTikTokVideoId(v.url);
            return (
              <div
                key={v.url}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-g500)",
                    fontFamily: "var(--font-mono)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>#{idx + 1}</span>
                  <span style={{ fontWeight: 700 }}>
                    {formatViews(v.views)} views
                  </span>
                </div>
                {id ? (
                  <iframe
                    src={`https://www.tiktok.com/embed/v2/${id}`}
                    style={{
                      width: "100%",
                      height: 480,
                      border: "none",
                      borderRadius: 6,
                      background: "var(--color-g50)",
                    }}
                    loading="lazy"
                    allow="encrypted-media"
                    allowFullScreen
                    title={v.url}
                  />
                ) : (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      padding: "20px 12px",
                      textAlign: "center",
                      background: "var(--color-g50)",
                      border: "1px dashed var(--color-g200)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "var(--color-info)",
                      textDecoration: "underline",
                    }}
                  >
                    TikTok에서 열기 ↗
                  </a>
                )}
                {v.caption && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-g500)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={v.caption}
                  >
                    {v.caption}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
