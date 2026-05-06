"use client";

import { useState } from "react";
import type {
  DisplayedVideoEntry,
  MetaClusterEntry,
  SkuSalesEntry,
} from "@/lib/inngest/types";

const MEGA_THRESHOLD = 1_000_000;
const FALLBACK_THRESHOLD = 500_000;

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCurrency(n: number, currency: string): string {
  const compact =
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : n.toLocaleString();
  if (currency === "USD") return `$${compact}`;
  if (currency === "KRW") return `₩${compact}`;
  return `${compact} ${currency}`;
}

// =============================================================================
// 메타 클러스터 Top 3 (토글로 영상 확장)
// =============================================================================
export function ClusterTopToggle({
  clusters,
  clusterReps,
}: {
  clusters: MetaClusterEntry[];
  clusterReps: Record<string, DisplayedVideoEntry[]>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const top3 = [...clusters]
    .sort((a, b) => b.member_count - a.member_count)
    .slice(0, 3);

  if (top3.length === 0) return <span>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {top3.map((c, i) => {
        const isOpen = expanded === c.id;
        const reps = (clusterReps[c.id] ?? []).slice(0, 3);
        return (
          <div key={c.id}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : c.id)}
              style={{
                width: "100%",
                textAlign: "left",
                background: isOpen ? "var(--color-info-soft)" : "transparent",
                border: "none",
                padding: "4px 6px",
                borderRadius: 4,
                cursor: reps.length > 0 ? "pointer" : "default",
                fontSize: 11,
                lineHeight: 1.35,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              disabled={reps.length === 0}
              title={c.description || c.name}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-g500)",
                  fontSize: 9,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--color-g800)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--color-g500)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {c.member_count}
              </span>
              {reps.length > 0 && (
                <span
                  style={{ fontSize: 10, color: "var(--color-g400)" }}
                  aria-hidden
                >
                  {isOpen ? "▾" : "▸"}
                </span>
              )}
            </button>
            {isOpen && reps.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  marginLeft: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {reps.map((v) => (
                  <a
                    key={v.content_id}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 10,
                      color: "var(--color-info)",
                      textDecoration: "none",
                      display: "flex",
                      gap: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtViews(v.views)}
                    </span>
                    <span
                      style={{
                        color: "var(--color-g600)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.caption_preview || "(no caption)"}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// 히어로 SKU Top 3 (토글로 메가 영상 확장)
// =============================================================================
export function HeroSkuToggle({
  skus,
  allDisplayed,
  currency,
}: {
  skus: SkuSalesEntry[];
  allDisplayed: DisplayedVideoEntry[];
  currency: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const top3 = skus.slice(0, 3);
  if (top3.length === 0) return <span>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {top3.map((s, i) => {
        const isOpen = expanded === s.asin;
        const matchHigh = (threshold: number) =>
          allDisplayed
            .filter(
              (v) =>
                v &&
                (v.views ?? 0) >= threshold &&
                v.confidence === "high" &&
                Array.isArray(v.matched_skus) &&
                v.matched_skus.includes(s.asin),
            )
            .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
            .slice(0, 3);
        let videos = matchHigh(MEGA_THRESHOLD);
        let isFallback = false;
        if (videos.length === 0) {
          videos = matchHigh(FALLBACK_THRESHOLD);
          if (videos.length > 0) isFallback = true;
        }
        return (
          <div key={s.asin || i}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : s.asin)}
              style={{
                width: "100%",
                textAlign: "left",
                background: isOpen ? "var(--color-info-soft)" : "transparent",
                border: "none",
                padding: "4px 6px",
                borderRadius: 4,
                cursor: videos.length > 0 ? "pointer" : "default",
                fontSize: 11,
                lineHeight: 1.35,
              }}
              disabled={videos.length === 0}
              title={s.name}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-g500)",
                    fontSize: 9,
                  }}
                >
                  {i + 1}.
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: "var(--color-g800)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name || "(no name)"}
                </span>
                {videos.length > 0 && (
                  <span
                    style={{ fontSize: 10, color: "var(--color-g400)" }}
                    aria-hidden
                  >
                    {isOpen ? "▾" : "▸"}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-g500)",
                  fontFamily: "var(--font-mono)",
                  marginLeft: 12,
                }}
              >
                {fmtCurrency(s.revenue, s.currency || currency)}
                {videos.length > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--color-pos)" }}>
                      {videos.length} 메가{isFallback ? "(500K+)" : ""}
                    </span>
                  </>
                )}
              </div>
            </button>
            {isOpen && videos.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  marginLeft: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {videos.map((v) => (
                  <a
                    key={v.content_id}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 10,
                      color: "var(--color-info)",
                      textDecoration: "none",
                      display: "flex",
                      gap: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtViews(v.views)}
                    </span>
                    <span
                      style={{
                        color: "var(--color-g600)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.caption_preview || "(no caption)"}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
