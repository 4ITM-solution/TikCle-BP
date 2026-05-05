/**
 * GMV 큰 Shop creator 5명 + 각자 top 3 영상.
 *
 * 사용자 메소드론:
 * - 영상 수 많은 인플(반복 작성자 30명) ≠ GMV 큰 인플(슈퍼 affiliate)
 * - GMV 기준으로 핵심 관리 대상 별도 노출
 * - "역대 판매 0건 크리에이터가 약 80%, 실질 판매 이력있는 약 20%" 분포 가시화
 *
 * 데이터: lemur stats.gmv.total 기반. phase37가 새 코드로 호출된 케이스만 채워짐.
 */

export type TopGmvCreator = {
  handle: string;
  follower_count: number | null;
  lifetime_gmv_usd: number | null;
  gpm_usd: number | null;
  post_rate: number | null;
  total_brand_collabs: number | null;
  shop_creator_gmv_range: string | null;
  // 그 인플의 top 3 영상 (brand+country scope)
  top_videos: Array<{
    url: string;
    views: number;
    caption: string | null;
    is_ad: boolean;
  }>;
  total_videos: number;
  promoted_videos: number;
};

function formatFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function TopGmvShopCreators({
  creators,
}: {
  creators: TopGmvCreator[];
}) {
  if (creators.length === 0) return null;

  return (
    <div className="section-card">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Top GMV Shop Creator (5명) · 슈퍼 affiliate
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
            marginTop: 2,
          }}
        >
          lemur stats.gmv.total 기준 · 영상 수 많은 인플과 별개 (실질 판매 검증)
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {creators.map((c, i) => (
          <CreatorCard key={c.handle} rank={i + 1} c={c} />
        ))}
      </div>
    </div>
  );
}

function CreatorCard({ rank, c }: { rank: number; c: TopGmvCreator }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 9,
            background: "var(--color-pos)",
            color: "white",
            fontFamily: "var(--font-mono)",
          }}
        >
          #{rank}
        </span>
        <a
          href={`https://www.tiktok.com/@${c.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-info)",
            textDecoration: "none",
          }}
        >
          @{c.handle} ↗
        </a>
        {c.lifetime_gmv_usd != null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "var(--color-pos)",
              fontFamily: "var(--font-mono)",
            }}
          >
            GMV {formatMoney(c.lifetime_gmv_usd)}
          </span>
        )}
        {c.shop_creator_gmv_range && (
          <span
            style={{
              fontSize: 10,
              color: "var(--color-info)",
              fontFamily: "var(--font-mono)",
              padding: "2px 6px",
              borderRadius: 9,
              background: "var(--color-info-soft)",
            }}
          >
            {c.shop_creator_gmv_range}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        {c.follower_count != null && (
          <span>{formatFans(c.follower_count)} fans</span>
        )}
        {c.gpm_usd != null && c.gpm_usd > 0 && (
          <span>GPM ${c.gpm_usd.toFixed(2)}/1K views</span>
        )}
        {c.post_rate != null && (
          <span>post rate {(c.post_rate * 100).toFixed(0)}%</span>
        )}
        {c.total_brand_collabs != null && (
          <span>collabs {c.total_brand_collabs}</span>
        )}
        <span>
          이 brand: <b style={{ color: "var(--color-ink)" }}>{c.total_videos}</b>
          영상 (promoted {c.promoted_videos})
        </span>
      </div>

      {c.top_videos.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 8,
          }}
        >
          {c.top_videos.map((v, vi) => (
            <a
              key={v.url}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "8px 10px",
                background: "var(--color-g25)",
                border: "1px solid var(--color-g100)",
                borderRadius: 4,
                textDecoration: "none",
                color: "inherit",
              }}
              title={v.caption ?? ""}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 3,
                  color: "var(--color-g500)",
                }}
              >
                <span>#{vi + 1}</span>
                <span>
                  <b style={{ color: "var(--color-ink)" }}>
                    {formatFans(v.views)}
                  </b>{" "}
                  views{v.is_ad ? " · ad" : ""}
                </span>
              </div>
              {v.caption && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-g600)",
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {v.caption}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
