/**
 * CrossChannelMatrix — 인플 × 채널 활동 매트릭스.
 *
 * Top 인플 N명이 TK·IG·YT 채널 중 어디서 몇 영상 만들었나 한눈에.
 * 같은 인플이 여러 채널에 활동하면 "일관된 partnership 풀" 시그널.
 *
 * 데이터 출처:
 *   - TK: contents 테이블 (brand+country 스코프) influencer_id별 count
 *   - IG: ig_authors 테이블 (handle 매칭)
 *   - YT: yt_channels 테이블 (channel_title 매칭)
 *
 * page.tsx 또는 MiniDashboard B 안에서 호출.
 */
export type MatrixRow = {
  name: string;
  /** 각 채널 영상 수. 0이면 해당 채널 활동 없음 (회색 셀). */
  tk: number;
  ig: number;
  yt: number;
};

export function CrossChannelMatrix({
  rows,
  maxRows = 10,
}: {
  rows: MatrixRow[];
  maxRows?: number;
}) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          padding: 10,
          background: "var(--color-g25)",
          borderRadius: 4,
        }}
      >
        cross-channel 인플 매칭 결과 없음. Phase 4c/4d 실행 필요.
      </div>
    );
  }

  // 채널 2+ 활동 인플만 (1채널만 활동은 의미 약함)
  const crossOnly = rows.filter(
    (r) => [r.tk, r.ig, r.yt].filter((n) => n > 0).length >= 2,
  );
  const display = crossOnly.slice(0, maxRows);

  return (
    <div>
      <table style={{ width: "100%", fontSize: 11 }}>
        <thead>
          <tr>
            <th
              style={{
                padding: "6px 8px",
                textAlign: "left",
                fontSize: 10,
                color: "var(--color-g500)",
                fontWeight: 700,
              }}
            >
              인플
            </th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>
              <span
                style={{
                  background: "#fce7f3",
                  color: "#831843",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: 9.5,
                  fontWeight: 700,
                }}
              >
                TK
              </span>
            </th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>
              <span
                style={{
                  background: "#ede9fe",
                  color: "#5b21b6",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: 9.5,
                  fontWeight: 700,
                }}
              >
                IG
              </span>
            </th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>
              <span
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: 9.5,
                  fontWeight: 700,
                }}
              >
                YT
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.name}>
              <td
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--color-g50)",
                  fontWeight: 600,
                }}
              >
                {r.name}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--color-g50)",
                  textAlign: "center",
                }}
              >
                <Cell n={r.tk} />
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--color-g50)",
                  textAlign: "center",
                }}
              >
                <Cell n={r.ig} />
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--color-g50)",
                  textAlign: "center",
                }}
              >
                <Cell n={r.yt} />
              </td>
            </tr>
          ))}
          {crossOnly.length > maxRows && (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: 6,
                  textAlign: "center",
                  color: "var(--color-g400)",
                  fontSize: 10,
                }}
              >
                + {crossOnly.length - maxRows}명 cross-platform 더보기
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          marginTop: 8,
        }}
      >
        ★ 2채널 이상 활동 인플 <b>{crossOnly.length}명</b> — 강한 brand
        affinity 시그널 (일관된 partnership 풀)
      </div>
    </div>
  );
}

function Cell({ n }: { n: number }) {
  if (n === 0) {
    return (
      <span
        style={{
          display: "inline-block",
          width: 28,
          height: 28,
          lineHeight: "28px",
          borderRadius: 4,
          background: "var(--color-g50)",
          color: "var(--color-g300)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        ·
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-block",
        width: 28,
        height: 28,
        lineHeight: "28px",
        borderRadius: 4,
        background: "var(--color-pos)",
        color: "white",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {n}
    </span>
  );
}
