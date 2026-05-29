"use client";

import { useState } from "react";

/**
 * SectionAChannelToolbar — Section A 콘텐츠 활동 위 채널 toggle + 5 KPI.
 *
 * mockup 형태:
 *   - 채널 toggle: "전체 합산 / TikTok / Instagram / YouTube"
 *   - 5 KPI: 총 영상 / paid 비중 / organic / gifted (시딩) / 총 view
 *
 * 현재는 visual prototype — toggle 클릭 시 KPI 값만 변경 (아래 MonthlyTrendChart에
 * prop 전파는 추후 작업). 채널별 데이터는 props로 받음.
 */
export type ChannelKpi = {
  totalVideos: number;
  paidPct: number; // 0~100
  organicPct: number;
  giftedPct: number;
  totalViewsLabel: string; // "486M"
};

export function SectionAChannelToolbar({
  all,
  tk,
  ig,
  yt,
  onChange,
}: {
  all: ChannelKpi;
  tk?: ChannelKpi;
  ig?: ChannelKpi;
  yt?: ChannelKpi;
  onChange?: (mode: "all" | "tk" | "ig" | "yt") => void;
}) {
  const [mode, setMode] = useState<"all" | "tk" | "ig" | "yt">("all");
  const handle = (m: typeof mode) => {
    setMode(m);
    onChange?.(m);
  };
  const cur =
    mode === "tk" && tk
      ? tk
      : mode === "ig" && ig
        ? ig
        : mode === "yt" && yt
          ? yt
          : all;

  const buttons: Array<{ k: typeof mode; label: string; disabled?: boolean }> = [
    { k: "all", label: `전체 (${all.totalVideos.toLocaleString()})` },
    { k: "tk", label: `TikTok${tk ? ` (${tk.totalVideos.toLocaleString()})` : ""}`, disabled: !tk },
    { k: "ig", label: `IG${ig ? ` (${ig.totalVideos.toLocaleString()})` : ""}`, disabled: !ig },
    { k: "yt", label: `YT${yt ? ` (${yt.totalVideos.toLocaleString()})` : ""}`, disabled: !yt },
  ];

  return (
    <div className="section-card">
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--color-g200)",
            borderRadius: 6,
            overflow: "hidden",
            fontSize: 11,
          }}
        >
          {buttons.map((b) => (
            <button
              key={b.k}
              type="button"
              disabled={b.disabled}
              onClick={() => handle(b.k)}
              style={{
                padding: "5px 12px",
                background:
                  mode === b.k ? "var(--color-ink)" : "white",
                color:
                  mode === b.k
                    ? "white"
                    : b.disabled
                      ? "var(--color-g300)"
                      : "var(--color-g600)",
                border: "none",
                cursor: b.disabled ? "not-allowed" : "pointer",
                opacity: b.disabled ? 0.4 : 1,
                borderRight: "1px solid var(--color-g200)",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
        }}
      >
        <Kpi
          label="총 영상"
          value={cur.totalVideos.toLocaleString()}
          sub={
            mode === "all"
              ? `TK ${tk?.totalVideos.toLocaleString() ?? 0} · IG ${ig?.totalVideos.toLocaleString() ?? 0} · YT ${yt?.totalVideos.toLocaleString() ?? 0}`
              : ""
          }
        />
        <Kpi label="paid 비중" value={`${cur.paidPct}%`} />
        <Kpi label="organic" value={`${cur.organicPct}%`} />
        <Kpi label="gifted (시딩)" value={`${cur.giftedPct}%`} />
        <Kpi label="총 view" value={cur.totalViewsLabel} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-g25)",
        borderRadius: 6,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--color-g500)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g500)",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
