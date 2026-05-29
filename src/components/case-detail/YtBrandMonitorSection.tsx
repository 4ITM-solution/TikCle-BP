import type { Phase4dStats } from "@/lib/inngest/types";

export type YtChannelRow = {
  channel_name: string;
  channel_url: string | null;
  subscriber_count: number | null;
  total_videos: number;
  brand_matched_videos: number;
  paid_videos: number;
  shorts_count: number;
  longform_count: number;
  max_views: number | null;
  total_views: number | null;
  tier: string | null;
};

export type YtPaidVideoRow = {
  id: string;
  yt_id: string;
  channel_name: string | null;
  title: string | null;
  description: string | null;
  view_count: number | null;
  like_count: number | null;
  paid_signal: string | null;
  monetization_status: string | null;
  url: string;
  thumbnail_url: string | null;
  type: string | null;
  duration_seconds: number | null;
};

export type YtSourceDist = {
  source: string;
  videos: number;
  channels: number;
};

export type YtTypeDist = {
  type: string;          // "video" / "short" / "stream"
  count: number;
  paid: number;
};

export function YtBrandMonitorSection({
  phase4d,
  ownedChannels,
  topChannels,
  topPaidVideos,
  sourceDist,
  typeDist,
}: {
  phase4d: Phase4dStats;
  ownedChannels: string[];
  topChannels: YtChannelRow[];
  topPaidVideos: YtPaidVideoRow[];
  sourceDist: YtSourceDist[];
  typeDist: YtTypeDist[];
}) {
  const total = phase4d.total_brand_matched || 1;
  const paid = phase4d.total_paid_signal;
  const organicMultiplier = (total - paid) / Math.max(paid, 1);
  const ownedVideos = topChannels
    .filter((c) => c.channel_url && ownedChannels.includes(c.channel_url))
    .reduce((s, c) => s + c.brand_matched_videos, 0);
  const ownedPct = (ownedVideos / total) * 100;
  const maxViral =
    topPaidVideos.length > 0
      ? Math.max(...topPaidVideos.map((v) => v.view_count ?? 0))
      : 0;
  const paidChannels = topChannels.filter((c) => c.paid_videos > 0).length;
  const shortsRatio =
    phase4d.by_type.short /
    Math.max(phase4d.by_type.short + phase4d.by_type.video, 1);

  const metrics = [
    {
      label: "자발 게시 배수",
      value: `${organicMultiplier.toFixed(1)}×`,
      sub: `organic ${total - paid} / paid ${paid}`,
      hint: "유료 1건당 자발 게시 N건",
    },
    {
      label: "Owned 비중",
      value: `${ownedPct.toFixed(1)}%`,
      sub: `owned videos ÷ total`,
      hint: "본사 channel 비중",
    },
    {
      label: "Top viral 도달",
      value:
        maxViral >= 1_000_000
          ? `${(maxViral / 1_000_000).toFixed(1)}M`
          : `${(maxViral / 1000).toFixed(0)}K`,
      sub: "paid 풀 최고 views",
      hint: "단일 캠페인 최대 도달",
    },
    {
      label: "Shorts 비중",
      value: `${(shortsRatio * 100).toFixed(0)}%`,
      sub: `shorts / (shorts + video)`,
      hint: "short-form 운영 비중",
    },
  ];

  return (
    <section
      id="yt-brand-monitor"
      style={{
        marginTop: 32,
        padding: 24,
        borderRadius: 8,
        border: "1px solid var(--color-border, #e5e7eb)",
        background: "var(--color-surface, #fff)",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 4px 0" }}>
          📺 YouTube 브랜드 모니터링 (Phase 4d)
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-muted, #6b7280)",
            fontSize: 12,
          }}
        >
          {phase4d.total_unique.toLocaleString()} unique videos ·{" "}
          {phase4d.unique_channels.toLocaleString()} channels · paid{" "}
          {phase4d.total_paid_signal.toLocaleString()} · long {phase4d.by_type.video} /
          shorts {phase4d.by_type.short} / streams {phase4d.by_type.stream} ·{" "}
          비용 ${phase4d.cost_actual_usd.toFixed(2)} · {paidChannels}명 paid 채널
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              padding: 16,
              border: "1px solid var(--color-border, #e5e7eb)",
              borderRadius: 8,
              background: "var(--color-bg-soft, #f9fafb)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--color-text-muted, #6b7280)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted, #6b7280)", marginTop: 2 }}>{m.sub}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted, #9ca3af)", marginTop: 6, fontStyle: "italic" }}>{m.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>📡 Source 분포</h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Source</th>
              <th style={{ padding: 6, textAlign: "right" }}>Videos</th>
              <th style={{ padding: 6, textAlign: "right" }}>Channels</th>
            </tr>
          </thead>
          <tbody>
            {sourceDist.map((s) => (
              <tr key={s.source} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                <td style={{ padding: 6, fontWeight: 500 }}>{s.source}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{s.videos.toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{s.channels.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>🎬 Type 분포 (Shorts vs Long-form)</h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Type</th>
              <th style={{ padding: 6, textAlign: "right" }}>Count</th>
              <th style={{ padding: 6, textAlign: "right" }}>Paid</th>
              <th style={{ padding: 6, textAlign: "right" }}>Paid %</th>
            </tr>
          </thead>
          <tbody>
            {typeDist.map((t) => (
              <tr key={t.type} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                <td style={{ padding: 6, fontWeight: 500 }}>{t.type}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{t.count}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{t.paid}</td>
                <td style={{ padding: 6, textAlign: "right" }}>
                  {t.count > 0 ? `${((t.paid / t.count) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>⭐ Top channels (max views desc)</h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Channel</th>
              <th style={{ padding: 6, textAlign: "right" }}>Subs</th>
              <th style={{ padding: 6, textAlign: "right" }}>Videos</th>
              <th style={{ padding: 6, textAlign: "right" }}>Shorts</th>
              <th style={{ padding: 6, textAlign: "right" }}>Paid</th>
              <th style={{ padding: 6, textAlign: "right" }}>Max views</th>
              <th style={{ padding: 6 }}>유형</th>
            </tr>
          </thead>
          <tbody>
            {topChannels.slice(0, 25).map((c) => {
              const isOwned = c.channel_url && ownedChannels.includes(c.channel_url);
              const isRepeat = c.brand_matched_videos >= 3;
              const isPaid = c.paid_videos > 0;
              return (
                <tr key={c.channel_name} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                  <td style={{ padding: 6 }}>
                    {c.channel_url ? (
                      <a href={c.channel_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-link, #3b82f6)", textDecoration: "none" }}>
                        {c.channel_name}
                      </a>
                    ) : (
                      c.channel_name
                    )}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {c.subscriber_count != null ? formatNum(c.subscriber_count) : "—"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>{c.total_videos}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{c.shorts_count}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{c.paid_videos}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {c.max_views != null ? formatNum(c.max_views) : "—"}
                  </td>
                  <td style={{ padding: 6, fontSize: 11 }}>
                    {isOwned ? "🏢 owned" : isRepeat ? "🔁 repeat" : isPaid ? "💸 paid" : "📺"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {topPaidVideos.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>💸 Top paid videos (sponsored 풀, views desc)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {topPaidVideos.slice(0, 12).map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: 10,
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--color-bg-soft, #f9fafb)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{v.channel_name}</span>
                  <span style={{
                    fontSize: 10, padding: "2px 5px", borderRadius: 4,
                    background: "var(--color-warning-bg, #fef3c7)",
                    color: "var(--color-warning, #92400e)",
                  }}>
                    {v.paid_signal}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4, fontWeight: 500 }}>
                  {(v.title ?? "").slice(0, 90)}
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                  👁 {formatNum(v.view_count ?? 0)} · ❤️ {formatNum(v.like_count ?? 0)} ·{" "}
                  {v.type === "short" ? "🎞 Short" : "▶️ Long"}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

