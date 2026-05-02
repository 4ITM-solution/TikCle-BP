"use client";

import { useMemo, useState } from "react";
import type {
  Phase3Stats,
  Phase35Stats,
  Phase37Stats,
  TierDistribution,
} from "@/lib/inngest/types";

const TIERS = [
  { key: "mega" as const, label: "Mega 1M+" },
  { key: "macro" as const, label: "Macro 500K-1M" },
  { key: "mid" as const, label: "Mid 100K-500K" },
  { key: "micro" as const, label: "Micro 10K-100K" },
  { key: "nano" as const, label: "Nano 1K-10K" },
  { key: "sub-nano" as const, label: "Sub-nano <1K" },
  { key: "unknown" as const, label: "Unknown (DB 매칭 실패)", muted: true },
];

export function TierDistributionModule({
  phase3,
  phase35,
  phase37,
}: {
  phase3: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
}) {
  const byMonth = phase3.tier_dist_by_month ?? {};
  // 월 list 정렬: 내림차순 (최근부터)
  const months = useMemo(
    () => Object.keys(byMonth).sort((a, b) => b.localeCompare(a)),
    [byMonth],
  );
  const [selected, setSelected] = useState<string>("all");

  const dist: TierDistribution =
    selected === "all"
      ? phase3.tier_distribution
      : (byMonth[selected] ?? phase3.tier_distribution);

  const v = (k: keyof TierDistribution) => dist[k] ?? 0;
  const total = TIERS.reduce((acc, t) => acc + v(t.key), 0);
  const max = Math.max(...TIERS.map((t) => v(t.key)), 1);
  const withFans =
    selected === "all" ? phase3.total_with_fans : total - v("unknown");
  const unknown = v("unknown");

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            팔로워 기준 티어 분포
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {selected === "all"
              ? `전체 기간 · ${total.toLocaleString()}명 · fans 있음 ${withFans.toLocaleString()} · unknown ${unknown.toLocaleString()}`
              : `${selected} · ${total.toLocaleString()}명 · fans 있음 ${withFans.toLocaleString()} · unknown ${unknown.toLocaleString()}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {months.length > 0 && (
            <>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-g500)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                기간
              </span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 8px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                  color: "var(--color-ink)",
                  cursor: "pointer",
                }}
              >
                <option value="all">전체 기간</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {selected === "all" && (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
            marginBottom: 10,
          }}
        >
          source: db_tt {phase3.fans_sources.influencer_db_tt} · clockworks{" "}
          {phase3.fans_sources.apify_clockworks} · manual{" "}
          {phase3.fans_sources.manual}
        </div>
      )}

      {selected === "all" && phase35 && !phase35.skipped_reason && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
            background: "var(--color-g25)",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Phase 3.5 폴백: unknown 후보{" "}
          <b style={{ color: "var(--color-ink)" }}>
            {phase35.total_unknown_before.toLocaleString()}
          </b>
          {" → 호출 "}
          <b>{phase35.total_attempted.toLocaleString()}</b>
          {" → 채워짐 "}
          <b style={{ color: "var(--color-pos)" }}>
            {phase35.total_filled.toLocaleString()}
          </b>
          {" · 비용 "}
          <b style={{ color: "var(--color-ink)" }}>
            ${phase35.cost_actual_usd.toFixed(2)}
          </b>
        </div>
      )}
      {selected === "all" && phase35?.skipped_reason && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            background: "var(--color-g25)",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 10,
          }}
        >
          Phase 3.5 폴백 ⏭ {phase35.skipped_reason}
        </div>
      )}

      {selected === "all" && phase37 && !phase37.skipped_reason && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
            background: "var(--color-info-soft)",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          Phase 3.7 Shop Creator 판별 (lemur): 후보{" "}
          <b>{phase37.total_candidates.toLocaleString()}</b>
          {" → Shop "}
          <b style={{ color: "var(--color-pos)" }}>
            {phase37.total_shop_creators.toLocaleString()}
          </b>
          {" / non-Shop "}
          <b>{phase37.total_non_shop.toLocaleString()}</b>
          {" · 비용 "}
          <b style={{ color: "var(--color-ink)" }}>
            ${phase37.cost_actual_usd.toFixed(2)}
          </b>
          <br />
          <span style={{ color: "var(--color-info)" }}>
            ℹ 분석 샘플은 Shop creator로 확인된 인플의 콘텐츠만 사용합니다.
          </span>
        </div>
      )}
      {selected === "all" && phase37?.skipped_reason && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            background: "var(--color-g25)",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 10,
          }}
        >
          Phase 3.7 Shop Creator 판별 ⏭ {phase37.skipped_reason}
        </div>
      )}

      {TIERS.map((t) => {
        const cnt = v(t.key);
        const pct = total > 0 ? (cnt / total) * 100 : 0;
        const w = (cnt / max) * 100;
        return (
          <div
            key={t.key}
            title={`${t.label} · ${cnt.toLocaleString()}명 · ${pct.toFixed(2)}%`}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 130px",
              gap: 10,
              padding: "5px 0",
              alignItems: "center",
              fontSize: 11,
            }}
          >
            <span
              className="font-mono"
              style={{
                color: t.muted ? "var(--color-g400)" : "var(--color-g500)",
              }}
            >
              {t.label}
            </span>
            <div
              style={{
                height: 20,
                background: "var(--color-g50)",
                borderRadius: 3,
              }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: t.muted
                    ? "var(--color-g300)"
                    : "var(--color-ink)",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                  color: "white",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {cnt > 0 && w > 12 ? cnt.toLocaleString() : ""}
              </div>
            </div>
            <span
              className="font-mono"
              style={{
                textAlign: "right",
                color: t.muted ? "var(--color-g400)" : "var(--color-g600)",
                fontWeight: 600,
              }}
            >
              {cnt.toLocaleString()}명 · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
