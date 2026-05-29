import type { KalodataVideoXlsxRow } from "@/lib/parsers/kalodata";

/**
 * CreatorSkuMatrix — Shop Creator × SKU GMV 매트릭스.
 *
 * Kalodata video xlsx (product_title + creator_handle + revenue_usd) 에서
 * creator × product 단위로 GMV 누적해서 매트릭스 표.
 * "누가 어떤 SKU 잘 팔았나" 한눈 — Creator 전문화 패턴 발견.
 *
 * page.tsx → MiniDashboard → 여기. Kalodata 없으면 null.
 */
export function CreatorSkuMatrix({
  videos,
  topCreators = 10,
  topSkus = 6,
}: {
  videos?: KalodataVideoXlsxRow[];
  topCreators?: number;
  topSkus?: number;
}) {
  if (!videos || videos.length === 0) return null;

  // creator → sku → gmv
  const byCreator = new Map<string, Map<string, number>>();
  const creatorTotal = new Map<string, number>();
  const skuTotal = new Map<string, number>();

  for (const v of videos) {
    const creator = v.creator_handle?.trim();
    const sku = v.product_title?.trim();
    const gmv = v.revenue_usd ?? 0;
    if (!creator || !sku || gmv <= 0) continue;

    let cMap = byCreator.get(creator);
    if (!cMap) {
      cMap = new Map();
      byCreator.set(creator, cMap);
    }
    cMap.set(sku, (cMap.get(sku) ?? 0) + gmv);
    creatorTotal.set(creator, (creatorTotal.get(creator) ?? 0) + gmv);
    skuTotal.set(sku, (skuTotal.get(sku) ?? 0) + gmv);
  }

  if (byCreator.size === 0) return null;

  const topCreatorList = Array.from(creatorTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCreators);
  const topSkuList = Array.from(skuTotal.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topSkus);

  const totalGmv = Array.from(creatorTotal.values()).reduce(
    (s, x) => s + x,
    0,
  );

  const fmt = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1000
        ? `$${(v / 1000).toFixed(1)}K`
        : `$${Math.round(v)}`;

  return (
    <div className="section-card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        ⭐ Shop Creator × SKU GMV 매트릭스
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 10,
        }}
      >
        누가 어떤 SKU 잘 팔았나 — 셀이 진한 = 그 creator의 주력 SKU (Kalodata
        영상 매출 기반)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{
                  padding: "6px 8px",
                  fontSize: 10,
                  color: "var(--color-g500)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--color-g100)",
                  position: "sticky",
                  left: 0,
                  background: "white",
                }}
              >
                Creator
              </th>
              {topSkuList.map(([sku]) => (
                <th
                  key={sku}
                  style={{
                    padding: "6px 8px",
                    fontSize: 10,
                    color: "var(--color-g500)",
                    textAlign: "right",
                    borderBottom: "1px solid var(--color-g100)",
                    minWidth: 80,
                  }}
                  title={sku}
                >
                  {sku.length > 14 ? sku.slice(0, 13) + "…" : sku}
                </th>
              ))}
              <th
                style={{
                  padding: "6px 8px",
                  fontSize: 10,
                  color: "var(--color-g500)",
                  textAlign: "right",
                  borderBottom: "1px solid var(--color-g100)",
                }}
              >
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            {topCreatorList.map(([creator, total]) => {
              const cMap = byCreator.get(creator)!;
              const max = Math.max(...Array.from(cMap.values()));
              return (
                <tr key={creator}>
                  <td
                    style={{
                      padding: "6px 8px",
                      fontWeight: 600,
                      borderBottom: "1px solid var(--color-g50)",
                      position: "sticky",
                      left: 0,
                      background: "white",
                    }}
                  >
                    {creator}
                  </td>
                  {topSkuList.map(([sku]) => {
                    const gmv = cMap.get(sku) ?? 0;
                    const isMain = gmv > 0 && gmv === max;
                    return (
                      <td
                        key={sku}
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          borderBottom: "1px solid var(--color-g50)",
                          background: isMain
                            ? "var(--color-warn-soft)"
                            : "transparent",
                          color:
                            gmv > 0
                              ? isMain
                                ? "var(--color-ink)"
                                : "var(--color-g600)"
                              : "var(--color-g300)",
                          fontWeight: isMain ? 700 : 400,
                        }}
                      >
                        {gmv > 0 ? fmt(gmv) : "—"}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      borderBottom: "1px solid var(--color-g50)",
                    }}
                  >
                    {fmt(total)}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: "var(--color-g25)" }}>
              <td
                style={{
                  padding: "6px 8px",
                  fontWeight: 700,
                  position: "sticky",
                  left: 0,
                  background: "var(--color-g25)",
                }}
              >
                SKU 합계
              </td>
              {topSkuList.map(([sku, total]) => (
                <td
                  key={sku}
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                  }}
                >
                  {fmt(total)}
                </td>
              ))}
              <td
                style={{
                  padding: "6px 8px",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                }}
              >
                {fmt(totalGmv)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          marginTop: 8,
        }}
      >
        💡 노란 셀 = 그 creator의 주력 SKU. 한 creator가 1-2 SKU에 집중하면
        전문화 패턴.
      </div>
    </div>
  );
}
