import type { Phase4cStats } from "@/lib/inngest/types";

export type IgAuthorRow = {
  username: string;
  full_name: string | null;
  total_posts: number;
  brand_matched_posts: number;
  paid_posts: number;
  max_likes: number | null;
  max_views: number | null;
  total_likes: number | null;
  tier: string | null;
};

export type IgPaidVideoRow = {
  id: string;
  owner_username: string;
  owner_full_name: string | null;
  caption: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_play_count: number | null;
  paid_signal: string | null;
  url: string;
  display_url: string | null;
  posted_at: string | null;
};

export type IgSourceDist = {
  source: string;
  posts: number;
  authors: number;
};

export type IgHashtagStat = {
  tag: string;
  posts: number;
  paid: number;
  paid_pct: number;
};

/**
 * Phase 4c 결과 표시.
 *
 * 1. 4-metric KPI strip (카테고리 정의자 game)
 * 2. Source 분포 (어디서 발견됐는지)
 * 3. Top hashtag (paid 비율)
 * 4. Top authors (max likes desc)
 * 5. Top paid videos (sponsored 풀)
 *
 * server component — 모든 데이터는 page.tsx에서 props로 받음.
 */
export function IgBrandMonitorSection({
  phase4c,
  ownedUsernames,
  topAuthors,
  topPaidVideos,
  sourceDist,
  topHashtags,
}: {
  phase4c: Phase4cStats;
  ownedUsernames: string[];
  topAuthors: IgAuthorRow[];
  topPaidVideos: IgPaidVideoRow[];
  sourceDist: IgSourceDist[];
  topHashtags: IgHashtagStat[];
}) {
  // 4 metric 산출
  const total = phase4c.total_brand_matched || 1;
  const paid = phase4c.total_paid_signal;
  const organicMultiplier = (total - paid) / Math.max(paid, 1); // 자발 게시 배수
  const ownedAuthorPosts = topAuthors
    .filter((a) => ownedUsernames.includes(a.username))
    .reduce((s, a) => s + a.brand_matched_posts, 0);
  const ownedPct = (ownedAuthorPosts / total) * 100;
  const maxViral =
    topPaidVideos.length > 0
      ? Math.max(
          ...topPaidVideos.map((v) => v.video_play_count ?? 0),
        )
      : 0;
  const paidAuthors = topAuthors.filter((a) => a.paid_posts > 0).length;

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
      sub: `owned posts ÷ total`,
      hint: "자기 광고 의존도",
    },
    {
      label: "Top viral 도달",
      value: maxViral >= 1_000_000 ? `${(maxViral / 1_000_000).toFixed(1)}M` : `${(maxViral / 1000).toFixed(0)}K`,
      sub: "paid 풀 최고 views",
      hint: "단일 캠페인 최대 도달",
    },
    {
      label: "Paid 인플 풀",
      value: `${paidAuthors}명`,
      sub: `unique paid authors`,
      hint: "paid 시그널 잡힌 작성자 수",
    },
  ];

  return (
    <section
      id="ig-brand-monitor"
      style={{
        marginTop: 48,
        padding: 24,
        borderRadius: 8,
        border: "1px solid var(--color-border, #e5e7eb)",
        background: "var(--color-surface, #fff)",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 4px 0" }}>
          📸 Instagram 브랜드 모니터링 (Phase 4c)
        </h2>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-muted, #6b7280)",
            fontSize: 12,
          }}
        >
          {phase4c.total_unique.toLocaleString()} unique posts ·{" "}
          {phase4c.unique_authors.toLocaleString()} authors · paid{" "}
          {phase4c.total_paid_signal.toLocaleString()} · 비용 $
          {phase4c.cost_actual_usd.toFixed(2)} · 분석{" "}
          {new Date(phase4c.computed_at).toLocaleString("ko-KR")}
        </p>
      </header>

      {/* 4-metric KPI strip */}
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
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted, #6b7280)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {m.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
              {m.value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted, #6b7280)",
                marginTop: 2,
              }}
            >
              {m.sub}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--color-text-muted, #9ca3af)",
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              {m.hint}
            </div>
          </div>
        ))}
      </div>

      {/* Source 분포 */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>📡 Source 분포</h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Source</th>
              <th style={{ padding: 6, textAlign: "right" }}>Posts</th>
              <th style={{ padding: 6, textAlign: "right" }}>Authors</th>
              <th style={{ padding: 6 }}>의미</th>
            </tr>
          </thead>
          <tbody>
            {sourceDist.map((s) => (
              <tr key={s.source} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                <td style={{ padding: 6, fontWeight: 500 }}>{s.source}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{s.posts.toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{s.authors.toLocaleString()}</td>
                <td style={{ padding: 6, color: "var(--color-text-muted)" }}>
                  {sourceLabel(s.source)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top hashtag */}
      {topHashtags.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>
            🏷️ Top hashtag (paid % desc)
          </h3>
          <table
            style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: 6 }}>#tag</th>
                <th style={{ padding: 6, textAlign: "right" }}>Posts</th>
                <th style={{ padding: 6, textAlign: "right" }}>Paid</th>
                <th style={{ padding: 6, textAlign: "right" }}>Paid %</th>
              </tr>
            </thead>
            <tbody>
              {topHashtags.slice(0, 15).map((h) => (
                <tr key={h.tag} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                  <td style={{ padding: 6, fontWeight: 500 }}>
                    #{h.tag}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>{h.posts}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{h.paid}</td>
                  <td
                    style={{
                      padding: 6,
                      textAlign: "right",
                      fontWeight: 600,
                      color: h.paid_pct === 100 ? "var(--color-success, #059669)" : "inherit",
                    }}
                  >
                    {h.paid_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top authors */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>
          ⭐ Top authors (max likes desc)
        </h3>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>@username</th>
              <th style={{ padding: 6, textAlign: "right" }}>Posts</th>
              <th style={{ padding: 6, textAlign: "right" }}>Paid</th>
              <th style={{ padding: 6, textAlign: "right" }}>Max likes</th>
              <th style={{ padding: 6, textAlign: "right" }}>Max views</th>
              <th style={{ padding: 6 }}>유형</th>
            </tr>
          </thead>
          <tbody>
            {topAuthors.slice(0, 25).map((a) => {
              const isOwned = ownedUsernames.includes(a.username);
              const isPaid = a.paid_posts > 0;
              const isRepeat = a.brand_matched_posts >= 5;
              return (
                <tr key={a.username} style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}>
                  <td style={{ padding: 6 }}>
                    <a
                      href={`https://www.instagram.com/${a.username}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-link, #3b82f6)", textDecoration: "none" }}
                    >
                      @{a.username}
                    </a>
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.total_posts}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.paid_posts}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {a.max_likes != null && a.max_likes > 0
                      ? a.max_likes.toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {a.max_views != null && a.max_views > 0
                      ? a.max_views.toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ padding: 6, fontSize: 11 }}>
                    {isOwned ? "🏢 owned" : isRepeat ? "🔁 repeat" : isPaid ? "💸 paid" : "📷"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top paid videos */}
      {topPaidVideos.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>
            💸 Top paid videos (sponsored 풀, views desc)
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
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
                  <span style={{ fontWeight: 600, fontSize: 12 }}>@{v.owner_username}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: "var(--color-warning-bg, #fef3c7)",
                      color: "var(--color-warning, #92400e)",
                    }}
                  >
                    {v.paid_signal}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>
                  ❤️ {(v.likes_count ?? 0).toLocaleString()} ·{" "}
                  👁 {(v.video_play_count ?? 0).toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    lineHeight: 1.4,
                  }}
                >
                  {(v.caption ?? "").slice(0, 140)}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "hashtag":
      return "브랜드 해시태그 검색 (#NinjaCREAMI 등)";
    case "owned":
      return "브랜드 owned 계정 (@ninjakitchen 등)";
    case "author_seed":
      return "외부 데스크리서치 발견 작성자 + collab/co-author";
    case "celeb_reel":
      return "셀럽 reel-scraper (sponsorshipStatus 잡힘)";
    default:
      return source;
  }
}
