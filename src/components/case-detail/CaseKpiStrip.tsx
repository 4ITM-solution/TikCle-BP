/**
 * CaseKpiStrip — 페이지 최상단 KPI 6개 카드 strip.
 *
 * 케이스 메타 헤더 아래, 데이터 채널 그리드 위.
 * "이 케이스 한눈에 요약" 역할. 기존 MiniDashboard 안 KpiStrip은 그대로 두고
 * (Phase 2 기반 매출/콘텐츠/메가 viral 영상 정밀 view), 이건 페이지 진입 시
 * 전 채널 통합 요약만.
 */
export function CaseKpiStrip({
  totalVideos,
  totalInfluencers,
  totalViews,
  salesValue,
  salesTrend,
  metaAdsCount,
  metaPartnerCount,
  costEstimate,
}: {
  totalVideos: { value: number; sub: string };
  totalInfluencers: { value: number; sub: string };
  totalViews: { value: string; sub: string };
  salesValue: { value: string; sub: string } | null;
  salesTrend: string | null;
  metaAdsCount: { value: number; sub: string } | null;
  metaPartnerCount?: number;
  costEstimate: { value: string; sub: string };
}) {
  void metaPartnerCount;
  type Card = {
    label: string;
    value: string;
    sub: string;
    trend?: string;
  };
  const cards: (Card | null)[] = [
    {
      label: "총 영상 (전 채널)",
      value: totalVideos.value.toLocaleString(),
      sub: totalVideos.sub,
    },
    {
      label: "총 인플 풀",
      value: `${totalInfluencers.value.toLocaleString()}명`,
      sub: totalInfluencers.sub,
    },
    {
      label: "총 view",
      value: totalViews.value,
      sub: totalViews.sub,
    },
    salesValue
      ? {
          label: "30일 매출",
          value: salesValue.value,
          sub: salesValue.sub,
          trend: salesTrend ?? undefined,
        }
      : null,
    metaAdsCount
      ? {
          label: "Meta 광고",
          value: metaAdsCount.value.toLocaleString(),
          sub: metaAdsCount.sub,
        }
      : null,
    {
      label: "분석 비용",
      value: costEstimate.value,
      sub: costEstimate.sub,
    },
  ];
  const visible = cards.filter((c): c is Card => c !== null);

  return (
    <div
      className="section-card"
      style={{
        padding: "16px 22px",
        marginBottom: 14,
        display: "grid",
        gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
        gap: 12,
      }}
    >
      {visible.map((c, i) => (
        <div
          key={c.label}
          style={{
            borderRight:
              i < visible.length - 1
                ? "1px solid var(--color-g50)"
                : undefined,
            paddingRight: 12,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              color: "var(--color-g500)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {c.label}
          </div>
          <div
            style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}
          >
            {c.value}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              marginTop: 2,
            }}
          >
            {c.trend && (
              <span
                style={{
                  color: c.trend.startsWith("▲")
                    ? "var(--color-pos)"
                    : c.trend.startsWith("▼")
                      ? "var(--color-accent)"
                      : "var(--color-g500)",
                  marginRight: 4,
                  fontWeight: 600,
                }}
              >
                {c.trend}
              </span>
            )}
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
