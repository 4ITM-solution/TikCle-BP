import type { DataChannel } from "@/lib/supabase/types";
import {
  DATA_CHANNEL_ICONS,
  DATA_CHANNEL_LABELS,
} from "@/lib/supabase/types";

/**
 * CaseStatusStrip — 페이지 최상단 sticky 진행 상태 strip.
 *
 * 표시: 브랜드명 · 국가 · 채널 · status · data_channels별 진행률 점 + 액션 버튼.
 * 활성 채널만 점 표시 (비활성은 회색).
 *
 * 사용처: /cases/[id] 페이지 최상단 (sticky)
 */
export function CaseStatusStrip({
  brand,
  country,
  channel,
  status,
  dataChannels,
  channelStats,
  analyzedAt,
}: {
  brand: string;
  country: string;
  channel: string;
  status: string;
  dataChannels: DataChannel[];
  /**
   * 채널별 적재 행 수 / 비고. UI에 한 줄 요약 표시.
   * 예: { tiktok_video: "1.2K", meta_ads: "179", instagram: "수집중" }
   */
  channelStats: Partial<Record<DataChannel, string>>;
  analyzedAt: string | null;
}) {
  const allChannels: DataChannel[] = [
    "tiktok_video",
    "meta_ads",
    "instagram",
    "youtube",
    "tt_shop",
    "amazon",
    "shopee",
  ];

  return (
    <div
      style={{
        background: "white",
        borderBottom: "1px solid var(--color-g100)",
        padding: "10px 24px",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {brand}
          <span
            style={{
              color: "var(--color-g500)",
              fontWeight: 400,
              marginLeft: 6,
              fontSize: 11,
            }}
          >
            {country} · {channel} · {status}
            {analyzedAt
              ? ` · ${new Date(analyzedAt).toLocaleString("ko", { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </span>
        </div>

        <div
          style={{ width: 1, height: 16, background: "var(--color-g100)" }}
        />

        {allChannels.map((ch) => {
          const active = dataChannels.includes(ch);
          const count = channelStats[ch];
          return (
            <div
              key={ch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: active ? "var(--color-g700)" : "var(--color-g300)",
                opacity: active ? 1 : 0.5,
              }}
              title={
                active
                  ? `${DATA_CHANNEL_LABELS[ch]} 활성`
                  : `${DATA_CHANNEL_LABELS[ch]} 비활성 (이 케이스 사용 안 함)`
              }
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: active
                    ? "var(--color-pos)"
                    : "var(--color-g200)",
                }}
              />
              <span style={{ fontSize: 11 }}>{DATA_CHANNEL_ICONS[ch]}</span>
              <span>{DATA_CHANNEL_LABELS[ch]}</span>
              {count && (
                <span
                  style={{
                    color: "var(--color-ink)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
