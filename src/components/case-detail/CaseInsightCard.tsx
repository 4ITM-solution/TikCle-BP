import Link from "next/link";

/**
 * CaseInsightCard — 페이지 상단 "종합 인사이트" 카드.
 *
 * 사람이 본 케이스 한 줄 요약 + 5축 매핑 + cross-platform 인플 + 비교 케이스 link.
 * Phase 5 synthesis 결과가 있으면 거기서 가져오고, 없으면 phase별 stats로 자동 조립.
 */
export type AxisCardData = {
  axis: "제품" | "인플" | "콘텐츠" | "채널" | "시즈널리티";
  value: string; // 한 줄 핵심 (예: "Slushi Max + FlexFlame")
  sub: string; // 보조 (예: "2 SKU가 GMV 60%")
};

export type CrossPlatformAuthor = {
  name: string;
  channels: string; // "TK·IG·YT" 같은 짧은 표기
  totalVideos: number;
};

export type RelatedCase = {
  id: string;
  label: string; // "Dyson US (가전)"
};

export function CaseInsightCard({
  oneLineSummary,
  tagline,
  metaInfo,
  axes,
  keyFindings,
  crossPlatform,
  relatedCases,
}: {
  oneLineSummary: string;
  tagline: string;
  metaInfo?: string; // 예: "주력 언어: 영어 78% · 스페인어 9%"
  axes: AxisCardData[];
  keyFindings: string[];
  crossPlatform: CrossPlatformAuthor[];
  relatedCases: RelatedCase[];
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
        color: "white",
        borderRadius: 10,
        padding: "22px 26px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.7,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        🎯 종합 인사이트
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.4,
          marginTop: 6,
          marginBottom: 10,
        }}
      >
        {oneLineSummary}
      </div>
      <div
        style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.5 }}
      >
        {tagline}
      </div>
      {metaInfo && (
        <div
          style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}
        >
          {metaInfo}
        </div>
      )}

      {/* 5축 axis grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${axes.length}, 1fr)`,
          gap: 8,
          marginTop: 18,
        }}
      >
        {axes.map((ax) => (
          <div
            key={ax.axis}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#fcd34d",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {ax.axis}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "white",
                marginBottom: 4,
              }}
            >
              {ax.value}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "#cbd5e1",
                lineHeight: 1.4,
              }}
            >
              {ax.sub}
            </div>
          </div>
        ))}
      </div>

      {/* 핵심 발견 + cross-platform 인플 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 14,
          marginTop: 18,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 6,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#fcd34d",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            📊 핵심 발견 ({keyFindings.length})
          </div>
          {keyFindings.map((k, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "white",
                lineHeight: 1.55,
                paddingLeft: 12,
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  color: "#fcd34d",
                }}
              >
                ▸
              </span>
              {k}
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 6,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#fcd34d",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            ⭐ cross-platform 인플 ({crossPlatform.length})
          </div>
          {crossPlatform.length === 0 ? (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              여러 채널 동시 활동 인플 없음
            </div>
          ) : (
            <table style={{ fontSize: 11, width: "100%" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      color: "#cbd5e1",
                      fontSize: 9.5,
                      padding: "4px 6px",
                      textAlign: "left",
                    }}
                  >
                    이름
                  </th>
                  <th
                    style={{
                      color: "#cbd5e1",
                      fontSize: 9.5,
                      padding: "4px 6px",
                      textAlign: "left",
                    }}
                  >
                    채널
                  </th>
                  <th
                    style={{
                      color: "#cbd5e1",
                      fontSize: 9.5,
                      padding: "4px 6px",
                      textAlign: "right",
                    }}
                  >
                    영상
                  </th>
                </tr>
              </thead>
              <tbody>
                {crossPlatform.slice(0, 5).map((a) => (
                  <tr key={a.name}>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        color: "white",
                      }}
                    >
                      {a.name}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        color: "white",
                      }}
                    >
                      {a.channels}
                    </td>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        color: "white",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {a.totalVideos}
                    </td>
                  </tr>
                ))}
                {crossPlatform.length > 5 && (
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: 10,
                        padding: "4px 6px",
                      }}
                    >
                      + {crossPlatform.length - 5}명 더보기
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 비교 케이스 link */}
      {relatedCases.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(252, 211, 77, 0.1)",
            border: "1px dashed rgba(252, 211, 77, 0.3)",
            borderRadius: 6,
            fontSize: 11,
            color: "#fde68a",
          }}
        >
          <b>🔗 비교 가능 케이스:</b>{" "}
          {relatedCases.map((rc) => (
            <Link
              key={rc.id}
              href={`/cases/${rc.id}`}
              style={{
                color: "#fcd34d",
                textDecoration: "underline",
                marginRight: 10,
              }}
            >
              {rc.label}
            </Link>
          ))}
          <Link
            href={`/cases/compare?ids=${relatedCases.map((c) => c.id).join(",")}`}
            style={{
              color: "#fcd34d",
              textDecoration: "underline",
              marginLeft: 4,
            }}
          >
            → 비교 페이지
          </Link>
        </div>
      )}
    </div>
  );
}
