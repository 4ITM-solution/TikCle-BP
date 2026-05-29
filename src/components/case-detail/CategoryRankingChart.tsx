import type { KalodataVideoXlsxRow } from "@/lib/parsers/kalodata";

/**
 * CategoryRankingChart — TT Shop 카테고리별 GMV 시계열.
 *
 * Kalodata video xlsx (publish_date + product_category + revenue_usd) 에서
 * 월별 × 카테고리별 GMV 합산. heatmap-style + 월별 ranking 변화.
 *
 * BSR 대용 (TT Shop은 BSR 없지만 카테고리 ranking은 의미 있음).
 */
export function CategoryRankingChart({
  videos,
  selectedSku = "all",
}: {
  videos?: KalodataVideoXlsxRow[];
  selectedSku?: string;
}) {
  void selectedSku;
  if (!videos || videos.length === 0) return null;

  // month → category → gmv
  const byMonthCategory = new Map<string, Map<string, number>>();
  const categoryTotal = new Map<string, number>();
  for (const v of videos) {
    if (!v.publish_date || !v.product_category || !v.revenue_usd) continue;
    const month = v.publish_date.slice(0, 7);
    const cat = v.product_category.trim();
    const gmv = v.revenue_usd;
    if (gmv <= 0) continue;
    let mMap = byMonthCategory.get(month);
    if (!mMap) {
      mMap = new Map();
      byMonthCategory.set(month, mMap);
    }
    mMap.set(cat, (mMap.get(cat) ?? 0) + gmv);
    categoryTotal.set(cat, (categoryTotal.get(cat) ?? 0) + gmv);
  }

  if (byMonthCategory.size === 0 || categoryTotal.size === 0) return null;

  const months = Array.from(byMonthCategory.keys()).sort();
  const topCategories = Array.from(categoryTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat);

  // GMV → 색 (0~max 정규화)
  const maxGmv = Math.max(
    ...Array.from(byMonthCategory.values()).flatMap((m) =>
      Array.from(m.values()),
    ),
  );

  const cellColor = (gmv: number) => {
    if (gmv <= 0) return "var(--color-g50)";
    const ratio = gmv / maxGmv;
    if (ratio > 0.8) return "#7f1d1d";
    if (ratio > 0.5) return "#dc2626";
    if (ratio > 0.3) return "#ea580c";
    if (ratio > 0.15) return "#f59e0b";
    if (ratio > 0.05) return "#fcd34d";
    return "#fde68a";
  };

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
        ? `${Math.round(v / 1000)}K`
        : `${Math.round(v)}`;

  return (
    <div className="section-card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        📊 TT Shop 카테고리 GMV 시계열 (BSR 대용)
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 10,
        }}
      >
        Kalodata 영상매출의 월 × 카테고리별 GMV 누적. 색이 진할수록 그 달
        그 카테고리에서 매출 폭발.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `130px repeat(${months.length}, 1fr)`,
          gap: 2,
          fontSize: 10,
        }}
      >
        <div style={{ padding: 4 }}></div>
        {months.map((m) => (
          <div
            key={m}
            style={{
              padding: 4,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
              textAlign: "center",
            }}
          >
            {m.slice(2)}
          </div>
        ))}
        {topCategories.map((cat) => (
          <>
            <div
              key={`${cat}-label`}
              style={{
                padding: 4,
                fontSize: 10,
                color: "var(--color-g600)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={cat}
            >
              {cat.length > 18 ? cat.slice(0, 17) + "…" : cat}
            </div>
            {months.map((m) => {
              const gmv = byMonthCategory.get(m)?.get(cat) ?? 0;
              return (
                <div
                  key={`${cat}-${m}`}
                  style={{
                    padding: 4,
                    background: cellColor(gmv),
                    color: gmv > maxGmv * 0.3 ? "white" : "var(--color-g600)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    borderRadius: 2,
                    textAlign: "center",
                  }}
                  title={`${m} · ${cat} · $${Math.round(gmv).toLocaleString()}`}
                >
                  {gmv > 0 ? fmt(gmv) : "—"}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
