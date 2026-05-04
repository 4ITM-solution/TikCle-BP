import type {
  DisplayedVideoEntry,
  Phase2Stats,
  Phase4bSkuStats,
} from "@/lib/inngest/types";
import {
  formatLocalAndUsd,
  type ExchangeRates,
} from "@/lib/case-detail/exchange-rates";

const MEGA_VIEWS_THRESHOLD = 1_000_000;
const MAX_VIDEOS_PER_SKU = 6;

/**
 * 매출 Top 3 SKU (히어로) × 메가 영상 매칭.
 *
 * 사용자 메소드론:
 * - 외부 분석에선 시딩 시 여러 제품을 통째로 보내니 어느 제품이 마케팅 주력인지 판단 어려움
 * - 메가 viral 영상에 어떤 SKU 노출됐는지 보고 마케팅 주력 추정
 *
 * 매칭 룰:
 * - views ≥ 1M (메가 tier)
 * - matched_skus.includes(sku.asin)
 * - confidence === "high" (low/mid 제외 — 노이즈 컷)
 * - views 내림차순 → 가장 viral 영상 우선
 */
export function HeroSkuMegaVideos({
  phase2,
  phase4bSku,
  currency,
  exchangeRates,
}: {
  phase2: Phase2Stats;
  phase4bSku?: Phase4bSkuStats;
  currency: string;
  exchangeRates: ExchangeRates;
}) {
  if (!phase2.sales_summary || phase2.sku_sales.length === 0) return null;
  const top3 = phase2.sku_sales.slice(0, 3);
  const allDisplayed = phase4bSku?.displayed_videos ?? [];

  const sections = top3.map((sku) => {
    const matched = allDisplayed
      .filter(
        (v) =>
          v.views >= MEGA_VIEWS_THRESHOLD &&
          v.confidence === "high" &&
          v.matched_skus.includes(sku.asin),
      )
      .sort((a, b) => b.views - a.views)
      .slice(0, MAX_VIDEOS_PER_SKU);
    return { sku, matched };
  });

  return (
    <div className="section-card">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          히어로 SKU Top 3 × 메가 영상
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          매출 Top 3 SKU에 매칭된 메가 viral 영상 (views ≥ 1M, Vision confidence
          high). 마케팅 주력 SKU 추정용.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.map(({ sku, matched }, i) => (
          <SkuRow
            key={sku.asin}
            rank={i + 1}
            sku={sku}
            matched={matched}
            currency={currency}
            exchangeRates={exchangeRates}
          />
        ))}
      </div>

      {!phase4bSku && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "var(--color-warn-soft)",
            border: "1px solid var(--color-warn)",
            borderRadius: 4,
            fontSize: 11,
            color: "var(--color-warn)",
          }}
        >
          ⚠ Phase 4b SKU 매칭 결과가 없어 영상 매칭 표시 불가. Phase 4b 재실행
          필요.
        </div>
      )}
    </div>
  );
}

function SkuRow({
  rank,
  sku,
  matched,
  currency,
  exchangeRates,
}: {
  rank: number;
  sku: Phase2Stats["sku_sales"][number];
  matched: DisplayedVideoEntry[];
  currency: string;
  exchangeRates: ExchangeRates;
}) {
  const skuCurrency =
    (sku as Phase2Stats["sku_sales"][number] & { currency?: string }).currency ??
    currency;
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
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 9,
            background: "var(--color-ink)",
            color: "white",
            fontFamily: "var(--font-mono)",
          }}
        >
          #{rank}
        </span>
        {sku.url ? (
          <a
            href={sku.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-info)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {sku.asin} ↗
          </a>
        ) : (
          <span className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>
            {sku.asin}
          </span>
        )}
        <span
          style={{
            fontSize: 12,
            color: "var(--color-g500)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
          title={sku.name}
        >
          {sku.name}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink)" }}
        >
          {formatLocalAndUsd(sku.revenue, skuCurrency, exchangeRates)}
        </span>
      </div>

      {matched.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            background: "var(--color-g25)",
            padding: "8px 10px",
            borderRadius: 4,
            fontFamily: "var(--font-mono)",
          }}
        >
          매칭된 메가 영상 없음 (views ≥ 1M + confidence high 기준)
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {matched.map((v) => (
            <VideoCard key={v.content_id} v={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ v }: { v: DisplayedVideoEntry }) {
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "var(--color-g25)",
        borderRadius: 4,
        overflow: "hidden",
        border: "1px solid var(--color-g100)",
      }}
    >
      <div
        style={{
          aspectRatio: "9 / 16",
          maxHeight: 200,
          background: "var(--color-g100)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {v.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={v.thumbnail_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <span
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 3,
            background: "rgba(0,0,0,.7)",
            color: "white",
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatViews(v.views)}
        </span>
      </div>
      {v.caption_preview && (
        <div
          style={{
            padding: "6px 8px",
            fontSize: 10,
            lineHeight: 1.4,
            color: "var(--color-g600)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={v.caption_preview}
        >
          {v.caption_preview}
        </div>
      )}
    </a>
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
