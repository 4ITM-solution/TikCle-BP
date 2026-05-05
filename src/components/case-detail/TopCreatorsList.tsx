"use client";

import { useState } from "react";
import type { TopCreator, TopCreatorVideo } from "@/lib/inngest/types";
import {
  classifyCreator,
  CLASS_COLOR,
  CLASS_LABEL,
} from "@/lib/case-detail/creator-class";

function formatFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * TikTok 영상 URL에서 video_id 추출.
 * 일반 long form: https://www.tiktok.com/@user/video/7433...
 * photo (image post): https://www.tiktok.com/@user/photo/7433...
 */
function extractTikTokVideoId(url: string): string | null {
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

export function TopCreatorsList({
  creators,
  emptyMessage = "10개 이상 영상 작성자 없음",
}: {
  creators: TopCreator[];
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (creators.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 11,
          color: "var(--color-g400)",
          background: "var(--color-g25)",
          borderRadius: 6,
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  function toggle(handle: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  const visible = showAll ? creators : creators.slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {visible.map((c) => {
        const isOpen = expanded.has(c.handle);
        const hasVideos = (c.top_videos?.length ?? 0) > 0;
        return (
          <div
            key={c.handle}
            style={{
              background: "var(--color-g25)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => hasVideos && toggle(c.handle)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                cursor: hasVideos ? "pointer" : "default",
              }}
              title={hasVideos ? "클릭해서 top 3 영상 보기" : ""}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  @{c.handle}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-g500)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                  }}
                >
                  {c.follower_count != null
                    ? `${formatFans(c.follower_count)} fans · `
                    : "fans 미조회 · "}
                  max {formatFans(c.max_views)} views
                  {c.lifetime_gmv_usd != null && c.lifetime_gmv_usd > 0 && (
                    <>
                      {" · "}
                      <b style={{ color: "var(--color-pos)" }}>
                        GMV ${formatFans(c.lifetime_gmv_usd)}
                      </b>
                    </>
                  )}
                  {c.shop_creator_gmv_range && (
                    <>
                      {" · "}
                      <span style={{ color: "var(--color-info)" }}>
                        {c.shop_creator_gmv_range}
                      </span>
                    </>
                  )}
                  {c.total_brand_collabs != null && c.total_brand_collabs > 0 && (
                    <>
                      {" · "}collabs {c.total_brand_collabs}
                    </>
                  )}
                </div>
              </div>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {(() => {
                  const cls = classifyCreator(
                    c.is_shop_creator ?? null,
                    c.promoted_count ?? 0,
                  );
                  const color = CLASS_COLOR[cls];
                  return (
                    <span
                      title={CLASS_LABEL[cls]}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 9,
                        background: color.bg,
                        color: color.fg,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {cls}
                    </span>
                  );
                })()}
                <span
                  className="font-mono"
                  style={{ fontSize: 11, fontWeight: 700 }}
                  title={`promoted ${c.promoted_count ?? 0} / 전체 ${c.video_count}`}
                >
                  {c.promoted_count ?? 0}/{c.video_count}
                </span>
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: hasVideos
                    ? "var(--color-g400)"
                    : "var(--color-g200)",
                  width: 20,
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                {hasVideos ? (isOpen ? "▾" : "▸") : ""}
              </span>
            </div>
            {isOpen && hasVideos && (
              <CreatorVideos videos={c.top_videos!} />
            )}
          </div>
        );
      })}
      {creators.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            textAlign: "center",
            padding: "8px 0",
            fontSize: 11,
            color: "var(--color-g500)",
            background: "transparent",
            border: "1px dashed var(--color-g200)",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {showAll
            ? "접기"
            : `+ ${creators.length - 6}명 더보기`}
        </button>
      )}
    </div>
  );
}

function CreatorVideos({ videos }: { videos: TopCreatorVideo[] }) {
  return (
    <div
      style={{
        padding: "12px",
        borderTop: "1px solid var(--color-g100)",
        background: "white",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {videos.map((v, idx) => {
        const id = extractTikTokVideoId(v.url);
        return (
          <div
            key={v.url}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
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
                {formatFans(v.views)} views
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
                title={`@${v.url}`}
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
  );
}
