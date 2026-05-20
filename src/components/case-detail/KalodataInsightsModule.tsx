"use client";

import { useState } from "react";
import type {
  KalodataBrandKpi,
  KalodataVideoRow,
  KalodataVideoXlsxRow,
  KalodataCreatorXlsxRow,
  KalodataLiveRow,
} from "@/lib/parsers/kalodata";

/**
 * SEA TikTok Shop 케이스(channel=tiktok_shop, country!=US) 전용
 * Kalodata 인사이트 모듈.
 *
 * 표시:
 *   1) Brand KPI — Revenue 분해 (Self-Operated / Affiliate / Mall %) + 핵심 숫자
 *   2) Top Creators — Live vs Video GMV 분리 (BP 시딩 분석 핵심 시그널)
 *   3) Top Videos — Kalodata 화면 텍스트로 들어온 영상 표
 */
export function KalodataInsightsModule({
  brand,
  creators,
  videos,
  videosXlsx,
  lives,
  meta,
}: {
  brand?: KalodataBrandKpi | null;
  creators?: KalodataCreatorXlsxRow[];
  videos?: KalodataVideoRow[];
  videosXlsx?: KalodataVideoXlsxRow[];
  lives?: KalodataLiveRow[];
  meta?: {
    shop?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    account_type_filter?: string | null;
  } | null;
}) {
  // xlsx가 있으면 그게 더 풍부한 데이터 — 텍스트 페이스트 videos는 무시
  const useXlsxVideos = (videosXlsx?.length ?? 0) > 0;

  // 표시할 데이터가 하나도 없으면 모듈 자체 숨김
  const hasBrand = !!brand && brand.revenue_usd != null;
  const hasCreators = (creators?.length ?? 0) > 0;
  const hasVideos = useXlsxVideos || (videos?.length ?? 0) > 0;
  const hasLives = (lives?.length ?? 0) > 0;
  if (!hasBrand && !hasCreators && !hasVideos && !hasLives) return null;

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
            Kalodata 인사이트 (TikTok Shop SEA)
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {meta?.shop ? `${meta.shop} · ` : ""}
            {brand?.period_start && brand?.period_end
              ? `${brand.period_start} ~ ${brand.period_end}`
              : ""}
            {meta?.account_type_filter
              ? ` · filter: ${meta.account_type_filter}`
              : ""}
          </div>
        </div>
      </div>

      {hasBrand && brand && <BrandKpiBlock brand={brand} />}
      {hasCreators && creators && <CreatorsTable creators={creators} />}
      {useXlsxVideos && videosXlsx ? (
        <VideosXlsxTable videos={videosXlsx} />
      ) : (
        hasVideos && videos && <VideosTable videos={videos} />
      )}
      {hasLives && lives && <LivesTable lives={lives} />}
    </div>
  );
}

// =============================================================================
function BrandKpiBlock({ brand }: { brand: KalodataBrandKpi }) {
  const total = brand.revenue_usd ?? 0;
  const self = brand.self_operated_revenue_usd ?? 0;
  const aff = brand.affiliate_revenue_usd ?? 0;
  const mall = brand.shopping_mall_revenue_usd ?? 0;
  const denom = Math.max(total, 1);
  const pct = (v: number) => Math.round((v / denom) * 100);

  return (
    <div
      style={{
        background: "var(--color-g25)",
        borderRadius: 6,
        padding: "14px 16px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 14,
          alignItems: "end",
        }}
      >
        <Kpi label="Total Revenue" value={fmtUsd(total)} accent />
        <Kpi
          label="Self-Operated"
          value={`${fmtUsd(self)} (${pct(self)}%)`}
          color="var(--color-info)"
        />
        <Kpi
          label="Affiliate"
          value={`${fmtUsd(aff)} (${pct(aff)}%)`}
          color="var(--color-warn)"
        />
        <Kpi
          label="Shopping Mall"
          value={`${fmtUsd(mall)} (${pct(mall)}%)`}
          color="var(--color-pos)"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 14,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--color-g100)",
        }}
      >
        {brand.item_sold != null && (
          <Kpi label="Item Sold" value={fmtNum(brand.item_sold)} />
        )}
        {brand.avg_unit_price != null && (
          <Kpi label="Avg Unit Price" value={`$${brand.avg_unit_price.toFixed(2)}`} />
        )}
        {brand.active_affiliates != null && (
          <Kpi label="Active Affiliates" value={fmtNum(brand.active_affiliates)} />
        )}
        {brand.new_videos_by_affiliate != null && (
          <Kpi
            label="New Videos / Affiliate"
            value={fmtNum(brand.new_videos_by_affiliate)}
          />
        )}
      </div>

      {/* Revenue 분포 막대 */}
      {total > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
              marginBottom: 4,
            }}
          >
            Revenue mix
          </div>
          <div
            style={{
              display: "flex",
              height: 10,
              borderRadius: 5,
              overflow: "hidden",
              background: "var(--color-g100)",
            }}
          >
            <div
              style={{
                width: `${pct(self)}%`,
                background: "var(--color-info)",
              }}
              title={`Self-Operated ${pct(self)}%`}
            />
            <div
              style={{
                width: `${pct(aff)}%`,
                background: "var(--color-warn)",
              }}
              title={`Affiliate ${pct(aff)}%`}
            />
            <div
              style={{
                width: `${pct(mall)}%`,
                background: "var(--color-pos)",
              }}
              title={`Shopping Mall ${pct(mall)}%`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: accent ? 18 : 14,
          fontWeight: 700,
          color: color ?? "var(--color-ink)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// =============================================================================
function CreatorsTable({ creators }: { creators: KalodataCreatorXlsxRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...creators].sort(
    (a, b) => (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0),
  );
  const visible = showAll ? sorted : sorted.slice(0, 10);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          크리에이터 ({sorted.length}명) — Live vs Video GMV
        </div>
        {sorted.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              fontSize: 11,
              background: "transparent",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              padding: "3px 8px",
              cursor: "pointer",
              color: "var(--color-g600)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {showAll ? "Top 10만 보기" : `전체 ${sorted.length}명 보기`}
          </button>
        )}
      </div>
      <div style={{ overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
            fontFamily: "var(--font-mono)",
          }}
        >
          <thead>
            <tr>
              <Th left>#</Th>
              <Th left>Handle</Th>
              <Th>Followers</Th>
              <Th>Revenue</Th>
              <Th>Live%</Th>
              <Th>Video%</Th>
              <Th>Live/Video #</Th>
              <Th>Products</Th>
              <Th left>Debut</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const rev = c.revenue_usd ?? 0;
              const live = c.live_gmv_usd ?? 0;
              const video = c.video_gmv_usd ?? 0;
              const livePct = rev > 0 ? Math.round((live / rev) * 100) : 0;
              const videoPct = rev > 0 ? Math.round((video / rev) * 100) : 0;
              const dominant: "live" | "video" | "mixed" =
                livePct >= 70 ? "live" : videoPct >= 70 ? "video" : "mixed";
              return (
                <tr key={c.handle}>
                  <Td>{i + 1}</Td>
                  <Td left>
                    <a
                      href={
                        c.tiktok_url ?? `https://www.tiktok.com/@${c.handle}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-info)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      @{c.handle}
                    </a>
                    {c.nickname && (
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--color-g400)",
                          fontFamily: "inherit",
                        }}
                      >
                        {c.nickname}
                      </div>
                    )}
                  </Td>
                  <Td>{fmtNum(c.followers ?? 0)}</Td>
                  <Td bold>{fmtUsd(rev)}</Td>
                  <Td
                    color={
                      dominant === "live" ? "var(--color-accent)" : undefined
                    }
                    bold={dominant === "live"}
                  >
                    {livePct}%
                  </Td>
                  <Td
                    color={
                      dominant === "video" ? "var(--color-info)" : undefined
                    }
                    bold={dominant === "video"}
                  >
                    {videoPct}%
                  </Td>
                  <Td>
                    {c.live_num ?? 0} / {c.video_num ?? 0}
                  </Td>
                  <Td>{c.product_count ?? 0}</Td>
                  <Td left>{c.debut_date ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          marginTop: 6,
        }}
      >
        💡 <b>Live% ≥ 70</b> = 라이브 중심 크리에이터 ·{" "}
        <b>Video% ≥ 70</b> = 영상 콘텐츠 중심. 시딩 전략 갈림.
      </div>
    </div>
  );
}

// =============================================================================
function VideosTable({ videos }: { videos: KalodataVideoRow[] }) {
  const sorted = [...videos].sort(
    (a, b) => (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0),
  );
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        매출 상위 영상 ({sorted.length}개)
      </div>
      <div style={{ overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
            fontFamily: "var(--font-mono)",
          }}
        >
          <thead>
            <tr>
              <Th left>#</Th>
              <Th left>Caption</Th>
              <Th>Duration</Th>
              <Th>Revenue</Th>
              <Th>Views</Th>
              <Th>Item Sold</Th>
              <Th left>Published</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => (
              <tr key={`${v.rank}-${v.caption.slice(0, 20)}`}>
                <Td>{v.rank}</Td>
                <Td
                  left
                  style={{
                    maxWidth: 380,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={v.caption}
                >
                  {v.caption}
                </Td>
                <Td>{v.duration_s != null ? `${v.duration_s}s` : "—"}</Td>
                <Td bold>{fmtUsd(v.revenue_usd ?? 0)}</Td>
                <Td>{fmtNum(v.views ?? 0)}</Td>
                <Td>{fmtNum(v.item_sold ?? 0)}</Td>
                <Td left>{v.publish_date ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
function VideosXlsxTable({ videos }: { videos: KalodataVideoXlsxRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...videos].sort(
    (a, b) => (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0),
  );
  const visible = showAll ? sorted : sorted.slice(0, 30);
  const adCount = sorted.filter((v) => (v.ad_spend_usd ?? 0) > 0).length;
  const roasAvg = (() => {
    const withRoas = sorted.filter((v) => v.ad_roas != null) as Array<
      KalodataVideoXlsxRow & { ad_roas: number }
    >;
    if (withRoas.length === 0) return null;
    return withRoas.reduce((s, v) => s + v.ad_roas, 0) / withRoas.length;
  })();

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          매출 상위 영상 ({sorted.length}개) — 광고 {adCount}개 (
          {Math.round((adCount / Math.max(sorted.length, 1)) * 100)}%)
          {roasAvg != null && (
            <span style={{ marginLeft: 8, color: "var(--color-g500)" }}>
              · ROAS 평균 {roasAvg.toFixed(2)}x
            </span>
          )}
        </div>
        {sorted.length > 30 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              fontSize: 11,
              background: "transparent",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              padding: "3px 8px",
              cursor: "pointer",
              color: "var(--color-g600)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {showAll ? "Top 30만 보기" : `전체 ${sorted.length}개 보기`}
          </button>
        )}
      </div>
      <div style={{ overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
            fontFamily: "var(--font-mono)",
          }}
        >
          <thead>
            <tr>
              <Th left>#</Th>
              <Th left>Creator / Caption</Th>
              <Th left>Product</Th>
              <Th>Revenue</Th>
              <Th>Sold</Th>
              <Th>Views</Th>
              <Th>GPM</Th>
              <Th>Ad Spend</Th>
              <Th>ROAS</Th>
              <Th>Dur</Th>
              <Th left>Date</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v, i) => {
              const isAd = (v.ad_spend_usd ?? 0) > 0;
              const goodRoas = (v.ad_roas ?? 0) >= 2;
              return (
                <tr key={v.video_url}>
                  <Td>{i + 1}</Td>
                  <Td left style={{ maxWidth: 280 }}>
                    {v.creator_handle && (
                      <div>
                        <a
                          href={`https://www.tiktok.com/@${v.creator_handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--color-info)",
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          @{v.creator_handle}
                        </a>
                      </div>
                    )}
                    <a
                      href={v.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={v.description}
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: "var(--color-g500)",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textDecoration: "none",
                      }}
                    >
                      {v.description || "(no caption)"}
                    </a>
                  </Td>
                  <Td
                    left
                    title={v.product_title ?? undefined}
                    style={{
                      maxWidth: 220,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {v.product_title ? (
                      <>
                        <div>{v.product_title}</div>
                        {v.product_category && (
                          <div
                            style={{
                              fontSize: 9,
                              color: "var(--color-g400)",
                            }}
                          >
                            {v.product_category}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td bold>{fmtUsd(v.revenue_usd ?? 0)}</Td>
                  <Td>{fmtNum(v.item_sold ?? 0)}</Td>
                  <Td>{fmtNum(v.views ?? 0)}</Td>
                  <Td>{v.gpm_usd != null ? `$${v.gpm_usd.toFixed(1)}` : "—"}</Td>
                  <Td
                    color={isAd ? "var(--color-warn)" : undefined}
                    bold={isAd}
                  >
                    {isAd ? fmtUsd(v.ad_spend_usd ?? 0) : "—"}
                  </Td>
                  <Td
                    color={
                      goodRoas
                        ? "var(--color-pos)"
                        : isAd
                          ? "var(--color-accent)"
                          : undefined
                    }
                    bold={isAd}
                  >
                    {v.ad_roas != null ? `${v.ad_roas.toFixed(2)}x` : "—"}
                  </Td>
                  <Td>{v.duration_s != null ? `${v.duration_s}s` : "—"}</Td>
                  <Td left>{v.publish_date ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          marginTop: 6,
        }}
      >
        💡 <b>ROAS ≥ 2x</b> = 광고비 회수 OK · <b>광고 비중 ↑</b> = 페이드
        부스팅 의존 · TikTokUrl 박힌 영상은 Phase 4b Vision/클러스터링 자동 분석.
      </div>
    </div>
  );
}

// =============================================================================
function LivesTable({ lives }: { lives: KalodataLiveRow[] }) {
  const sorted = [...lives].sort(
    (a, b) => (b.revenue_usd ?? 0) - (a.revenue_usd ?? 0),
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        매출 상위 라이브 ({sorted.length}개)
      </div>
      <div style={{ overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
            fontFamily: "var(--font-mono)",
          }}
        >
          <thead>
            <tr>
              <Th left>#</Th>
              <Th left>Title</Th>
              <Th left>시작</Th>
              <Th>Duration</Th>
              <Th>Revenue</Th>
              <Th>Products</Th>
              <Th>Views</Th>
              <Th>Item Sold</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={`${l.rank}-${l.start_at ?? l.title.slice(0, 12)}`}>
                <Td>{l.rank}</Td>
                <Td
                  left
                  style={{
                    maxWidth: 280,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={l.title}
                >
                  {l.title}
                </Td>
                <Td left>{l.start_at ?? "—"}</Td>
                <Td>{l.duration_s != null ? fmtDuration(l.duration_s) : "—"}</Td>
                <Td bold>{fmtUsd(l.revenue_usd ?? 0)}</Td>
                <Td>{l.product_count ?? 0}</Td>
                <Td>{fmtNum(l.views ?? 0)}</Td>
                <Td>{fmtNum(l.item_sold ?? 0)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtDuration(s: number): string {
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}m ${ss}s`;
  }
  return `${s}s`;
}

// =============================================================================
function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th
      style={{
        textAlign: left ? "left" : "right",
        padding: "6px 8px",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: "var(--color-g400)",
        fontWeight: 700,
        borderBottom: "1px solid var(--color-g100)",
      }}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  left,
  bold,
  color,
  style,
  title,
}: {
  children: React.ReactNode;
  left?: boolean;
  bold?: boolean;
  color?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <td
      title={title}
      style={{
        padding: "6px 8px",
        textAlign: left ? "left" : "right",
        borderBottom: "1px solid var(--color-g100)",
        color: color ?? (bold ? "var(--color-ink)" : "var(--color-g600)"),
        fontWeight: bold ? 700 : 400,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
