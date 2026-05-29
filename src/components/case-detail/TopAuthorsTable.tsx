import type { TopCreator } from "@/lib/inngest/types";
import type { MatrixRow } from "./CrossChannelMatrix";

/**
 * TopAuthorsTable — mockup line 795-808 1:1.
 *
 * Top 작성자 (20+ 영상) 테이블.
 * 컬럼: 썸네일 / 이름 (셀럽 뱃지) / 팔로워 / 채널 활동 (TK/IG/YT pill) / 영상 / 총조회
 *
 * 채널 활동 매핑: phase2.top_creators의 handle을 crossChannelMatrix와 매칭.
 * 매칭 없으면 TK count 만 (현재 phase2는 TikTok 영상 기준).
 */
const CELEB_THRESHOLD = 10_000_000; // 10M+ 팔로워 = 셀럽 뱃지
const ROWS_DEFAULT = 5;

export function TopAuthorsTable({
  creators,
  crossChannel,
  maxRows = ROWS_DEFAULT,
}: {
  creators: TopCreator[];
  crossChannel?: MatrixRow[];
  maxRows?: number;
}) {
  if (!creators || creators.length === 0) {
    return (
      <div className="section-card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
          Top 작성자 (20+ 영상)
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            background: "var(--color-g25)",
            padding: 10,
            borderRadius: 4,
          }}
        >
          20+ 영상 작성자 없음. Phase 2 분석 후 표시됩니다.
        </div>
      </div>
    );
  }

  const xcMap = new Map<string, MatrixRow>();
  for (const r of crossChannel ?? []) xcMap.set(normalize(r.name), r);

  const sorted = [...creators]
    .sort((a, b) => b.video_count - a.video_count)
    .slice(0, maxRows);
  const more = Math.max(0, creators.length - maxRows);

  return (
    <div className="section-card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
        Top 작성자 (20+ 영상)
      </div>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--color-g500)", fontSize: 10 }}>
            <th style={{ padding: "5px 4px", textAlign: "left" }}></th>
            <th style={{ padding: "5px 4px", textAlign: "left" }}>이름</th>
            <th style={{ padding: "5px 4px", textAlign: "right" }}>팔로워</th>
            <th style={{ padding: "5px 4px", textAlign: "left" }}>채널 활동</th>
            <th style={{ padding: "5px 4px", textAlign: "right" }}>영상</th>
            <th style={{ padding: "5px 4px", textAlign: "right" }}>총 view</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const xc = xcMap.get(normalize(c.handle));
            const isCeleb =
              c.follower_count !== null && c.follower_count >= CELEB_THRESHOLD;
            return (
              <tr
                key={c.handle}
                style={{ borderTop: "1px solid var(--color-g100)" }}
              >
                <td style={{ padding: "6px 4px" }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "var(--color-g100)",
                    }}
                  />
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <span style={{ fontWeight: isCeleb ? 700 : 500 }}>
                    {c.handle}
                  </span>
                  {isCeleb && (
                    <span
                      style={{
                        fontSize: 9,
                        background: "#fef3c7",
                        color: "#92400e",
                        padding: "1px 5px",
                        borderRadius: 8,
                        marginLeft: 5,
                        fontWeight: 700,
                      }}
                    >
                      ⭐셀럽
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-g600)",
                  }}
                >
                  {formatFollowers(c.follower_count)}
                </td>
                <td style={{ padding: "6px 4px" }}>
                  <ChannelPills tk={xc?.tk ?? c.video_count} ig={xc?.ig ?? 0} yt={xc?.yt ?? 0} />
                </td>
                <td
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                  }}
                >
                  {c.video_count}
                </td>
                <td
                  style={{
                    padding: "6px 4px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {formatViews(c.max_views)}
                </td>
              </tr>
            );
          })}
          {more > 0 && (
            <tr style={{ color: "var(--color-g400)" }}>
              <td
                colSpan={6}
                style={{
                  textAlign: "center",
                  padding: "8px",
                  fontSize: 10,
                  borderTop: "1px solid var(--color-g100)",
                }}
              >
                + {more}명 더보기
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ChannelPills({ tk, ig, yt }: { tk: number; ig: number; yt: number }) {
  const items: Array<{ label: string; n: number; color: string }> = [
    { label: "TK", n: tk, color: "#000000" },
    { label: "IG", n: ig, color: "#E1306C" },
    { label: "YT", n: yt, color: "#FF0000" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {items
        .filter((it) => it.n > 0)
        .map((it) => (
          <span
            key={it.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 8,
              background: `${it.color}15`,
              color: it.color,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            {it.label}
            {it.n}
          </span>
        ))}
    </div>
  );
}

function formatFollowers(n: number | null): string {
  if (n == null || n === 0) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatViews(n: number | null): string {
  if (n == null || n === 0) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/^@/, "").trim();
}
