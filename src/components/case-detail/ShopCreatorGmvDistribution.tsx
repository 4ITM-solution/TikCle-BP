/**
 * TikTok Shop Creator 판매력 분포.
 *
 * 케이스 인플 풀 안에서 is_tiktok_shop_creator=true인 인플의 lifetime_gmv_usd 분포.
 * "역대 0건" vs "검증 셀러($10K+)" 비율로 브랜드의 인플 풀 quality를 한 줄로 보여줌.
 *
 * 의미: TikTok Shop은 케이스별 매출 기여를 노출 안 함. 그래서 "검증된 Shop 셀러와
 * 일하고 있나"의 proxy로 인플의 lifetime cross-brand GMV 분포를 활용.
 */

export type ShopGmvBucket = {
  label: string;
  count: number;
  color: string;
};

export type ShopGmvDistribution = {
  total_shop_creators: number; // case scope에서 is_tiktok_shop_creator=true인 인플 총
  not_yet_backfilled: number; // GMV 데이터 아직 없음 (lifetime_gmv_usd IS NULL)
  buckets: ShopGmvBucket[]; // [0, $1~1K, $1K~10K, $10K~100K, $100K+]
};

export function ShopCreatorGmvDistribution({
  data,
}: {
  data: ShopGmvDistribution;
}) {
  const total = data.total_shop_creators;
  if (total === 0) return null;

  const totalWithGmv = total - data.not_yet_backfilled;
  const zeroSellers = data.buckets[0]?.count ?? 0;
  const verifiedSellers =
    (data.buckets[3]?.count ?? 0) + (data.buckets[4]?.count ?? 0);

  const pct = (n: number, d: number) =>
    d === 0 ? "0.0" : ((n / d) * 100).toFixed(1);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 8,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            margin: 0,
            color: "var(--color-g800)",
          }}
        >
          TikTok Shop 판매력 분포
        </h3>
        <span
          style={{
            fontSize: 10,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Shop creator n={total}
          {data.not_yet_backfilled > 0 &&
            ` · 미수집 ${data.not_yet_backfilled}`}
        </span>
      </div>

      {/* stacked bar */}
      <div
        style={{
          display: "flex",
          height: 28,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 10,
          background: "var(--color-g50)",
        }}
        title="Shop creator의 lifetime GMV (cross-brand 누적) 기준 분포"
      >
        {data.buckets.map((b) => {
          const w = totalWithGmv === 0 ? 0 : (b.count / total) * 100;
          if (w === 0) return null;
          return (
            <div
              key={b.label}
              style={{
                width: `${w}%`,
                background: b.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                color: "white",
                fontFamily: "var(--font-mono)",
              }}
              title={`${b.label}: ${b.count}명 (${pct(b.count, total)}%)`}
            >
              {w >= 8 ? `${pct(b.count, total)}%` : ""}
            </div>
          );
        })}
        {data.not_yet_backfilled > 0 && (
          <div
            style={{
              width: `${(data.not_yet_backfilled / total) * 100}%`,
              background: "var(--color-g100)",
            }}
            title={`아직 GMV 미수집: ${data.not_yet_backfilled}명`}
          />
        )}
      </div>

      {/* legend */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {data.buckets.map((b) => (
          <div
            key={b.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--color-g700)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                background: b.color,
                borderRadius: 2,
              }}
            />
            <span>{b.label}</span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                color: "var(--color-g500)",
              }}
            >
              {b.count}명 ({pct(b.count, total)}%)
            </span>
          </div>
        ))}
      </div>

      {/* summary insight */}
      <div
        style={{
          padding: "8px 10px",
          background: "var(--color-g25)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--color-g700)",
          lineHeight: 1.6,
        }}
      >
        <div>
          🎯 <b>검증 셀러 ($10K+)</b>:{" "}
          <b style={{ color: "var(--color-pos)" }}>
            {pct(verifiedSellers, total)}%
          </b>{" "}
          ({verifiedSellers}명) — 핵심 관리 대상
        </div>
        <div>
          ⚠️ <b>역대 0건 셀러</b>:{" "}
          <b style={{ color: "var(--color-g500)" }}>
            {pct(zeroSellers, total)}%
          </b>{" "}
          ({zeroSellers}명) — Shop 등록만, 판매 이력 없음
        </div>
      </div>
    </div>
  );
}
