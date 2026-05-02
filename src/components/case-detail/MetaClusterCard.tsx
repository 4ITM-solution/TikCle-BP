"use client";

import { useState } from "react";
import type {
  DisplayedVideoEntry,
  MetaClusterEntry,
} from "@/lib/inngest/types";

/**
 * 메타 클러스터 카드 — 클릭하면 대표 영상 펼침 (Phase 4b.5 결과 사용).
 */
export function MetaClusterCard({
  meta,
  rank,
  representatives,
}: {
  meta: MetaClusterEntry;
  rank: number;
  representatives: DisplayedVideoEntry[];
}) {
  const [open, setOpen] = useState(false);
  const isHero = rank === 0;
  const hasReps = representatives.length > 0;

  return (
    <div
      style={{
        border: "1px solid",
        borderColor: isHero ? "#F0CFC9" : "var(--color-g100)",
        borderRadius: 8,
        padding: "14px 16px",
        background: isHero
          ? "var(--color-accent-soft)"
          : "var(--color-g25)",
        gridColumn: open ? "span 3" : "auto",
        transition: "grid-column 120ms",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: isHero ? "var(--color-accent)" : "var(--color-g400)",
            fontWeight: 700,
            letterSpacing: ".04em",
          }}
        >
          META {String(rank + 1).padStart(2, "0")}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--color-g400)",
            fontWeight: 700,
          }}
        >
          {meta.member_count} 영상
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          lineHeight: 1.35,
          marginBottom: 6,
        }}
      >
        {meta.name}
      </div>
      {meta.description && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            lineHeight: 1.45,
            padding: "8px 10px",
            background: "white",
            borderRadius: 4,
            borderLeft: "2px solid var(--color-g300)",
            marginBottom: 8,
          }}
        >
          {meta.description}
        </div>
      )}
      {meta.child_clusters.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: hasReps ? 10 : 0,
          }}
        >
          {meta.child_clusters.map((c) => (
            <span
              key={c.id}
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                padding: "2px 6px",
                background: "white",
                border: "1px solid var(--color-g200)",
                borderRadius: 3,
                color: "var(--color-g600)",
              }}
              title={`${c.name} (${c.member_count}개)`}
            >
              {c.name} <b>{c.member_count}</b>
            </span>
          ))}
        </div>
      )}

      {hasReps && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: "var(--color-g600)",
            background: "white",
            border: "1px solid var(--color-g200)",
            borderRadius: 3,
            padding: "4px 10px",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          {open ? "▲ 대표 영상 접기" : `▼ 대표 영상 ${representatives.length}개 보기`}
        </button>
      )}

      {open && hasReps && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: `repeat(${representatives.length}, minmax(0, 1fr))`,
            gap: 8,
          }}
        >
          {representatives.map((v) => (
            <DisplayedVideoCard key={v.content_id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DisplayedVideoCard({
  video,
  compact,
}: {
  video: DisplayedVideoEntry;
  compact?: boolean;
}) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--color-g100)",
        borderRadius: 4,
        background: "white",
        overflow: "hidden",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          aspectRatio: "9/16",
          background: video.thumbnail_url
            ? `center / cover no-repeat url("${video.thumbnail_url}")`
            : "repeating-linear-gradient(45deg, var(--color-g25) 0 8px, var(--color-g50) 8px 16px)",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "1px 5px",
            borderRadius: 2,
            fontWeight: 700,
          }}
        >
          {video.views.toLocaleString()}
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "2px 6px",
            borderRadius: 2,
            fontWeight: 700,
          }}
        >
          ↗
        </span>
      </div>
      <div style={{ padding: compact ? "6px 7px" : "7px 9px" }}>
        {video.matched_skus.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginBottom: video.caption_preview ? 4 : 0,
            }}
          >
            {video.matched_skus.map((sku, idx) => {
              const name = video.matched_sku_names[idx] ?? sku;
              return (
                <span
                  key={sku}
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 2,
                    background:
                      video.confidence === "high"
                        ? "var(--color-pos-soft)"
                        : video.confidence === "mid"
                          ? "var(--color-info-soft)"
                          : "var(--color-g50)",
                    color:
                      video.confidence === "high"
                        ? "var(--color-pos)"
                        : video.confidence === "mid"
                          ? "var(--color-info)"
                          : "var(--color-g500)",
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                  }}
                  title={`${name} (${sku})`}
                >
                  {name}
                </span>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--color-g300)",
              marginBottom: video.caption_preview ? 4 : 0,
            }}
          >
            SKU 미매칭
          </div>
        )}
        {!compact && video.caption_preview && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={video.caption_preview}
          >
            {video.caption_preview}
          </div>
        )}
      </div>
    </a>
  );
}
