"use client";

import { useState, type ReactNode } from "react";
import type { DataChannel } from "@/lib/supabase/types";
import {
  DATA_CHANNEL_ICONS,
  DATA_CHANNEL_LABELS,
} from "@/lib/supabase/types";

/**
 * DataChannelGrid — 데이터 채널 카드 그리드.
 *
 * 7개 채널 카드 + "채널 추가" 1개. 활성 채널은 적재 행 수 표시, 비활성은 dim.
 * 카드 클릭 시 입력 UI 펼침 (children으로 받음).
 *
 * 입력 UI들 (ExolytSection · AmazonSalesSection · BsrSection · ShopdoraSection 등)을
 * 채널별로 매핑해서 children prop으로 박음.
 */
export type ChannelCardData = {
  channel: DataChannel;
  active: boolean;
  stat?: string; // "1,234 영상 · 22.1M views"
  sub?: string; // "Exolyt CSV · 5/27 업로드"
  uploadUI?: ReactNode; // 카드 클릭 시 펼쳐지는 입력 UI
};

export function DataChannelGrid({
  cards,
}: {
  cards: ChannelCardData[];
}) {
  const [openChannel, setOpenChannel] = useState<DataChannel | null>(null);
  const activeCount = cards.filter((c) => c.active).length;

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>📥 데이터 채널</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {cards.length}개 중 {activeCount}개 활성 · 카드 클릭 → 입력 UI 펼침
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {cards.map((c) => {
          const isOpen = openChannel === c.channel;
          const Icon = DATA_CHANNEL_ICONS[c.channel];
          const label = DATA_CHANNEL_LABELS[c.channel];
          return (
            <button
              key={c.channel}
              type="button"
              onClick={() =>
                c.uploadUI
                  ? setOpenChannel(isOpen ? null : c.channel)
                  : undefined
              }
              disabled={!c.uploadUI && !c.active}
              style={{
                border: `1px solid ${
                  isOpen
                    ? "var(--color-ink)"
                    : c.active
                      ? "var(--color-pos)"
                      : "var(--color-g100)"
                }`,
                borderRadius: 8,
                padding: 12,
                cursor: c.uploadUI ? "pointer" : "default",
                background: isOpen
                  ? "var(--color-g25)"
                  : c.active
                    ? "var(--color-pos-soft)"
                    : "var(--color-g25)",
                opacity: c.active ? 1 : 0.55,
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span>
                  <span style={{ fontSize: 18 }}>{Icon}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      marginLeft: 6,
                    }}
                  >
                    {label}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: c.active
                      ? "var(--color-pos)"
                      : "var(--color-g200)",
                    color: c.active ? "white" : "var(--color-g600)",
                  }}
                >
                  {c.active ? "적재" : "사용안함"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-ink)",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  marginTop: 4,
                }}
              >
                {c.stat ?? "—"}
              </div>
              {c.sub && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-g500)",
                    marginTop: 2,
                  }}
                >
                  {c.sub}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 펼쳐진 입력 UI */}
      {openChannel &&
        (() => {
          const card = cards.find((c) => c.channel === openChannel);
          if (!card?.uploadUI) return null;
          return (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                border: "1px solid var(--color-g100)",
                borderRadius: 8,
                background: "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {DATA_CHANNEL_ICONS[openChannel]}{" "}
                  {DATA_CHANNEL_LABELS[openChannel]} — 입력
                </div>
                <button
                  type="button"
                  onClick={() => setOpenChannel(null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--color-g500)",
                    fontSize: 12,
                  }}
                >
                  접기 ✕
                </button>
              </div>
              {card.uploadUI}
            </div>
          );
        })()}
    </div>
  );
}
