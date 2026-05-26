"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "./UploadDropzone";
import {
  rollbackLatestSalesBatch,
  uploadAmazonSales,
} from "@/app/cases/[id]/upload-actions";
import {
  COUNTRY_OPTIONS,
  countriesInRegion,
  isRegionCode,
  type Region,
} from "@/lib/case-detail/countries";
import {
  toUsd,
  type ExchangeRates,
} from "@/lib/case-detail/exchange-rates";

export type SkuRow = {
  id: string;
  asin: string;
  external_product_id: string | null;
  name: string;
  url: string | null;
  units_30d: number | null;
  revenue_30d: number | null;
  currency: string;
  country: string | null;
  hasBsr: boolean;
};

export function AmazonSalesSection({
  case_id,
  skuRows,
  caseCountry,
  exchangeRates,
}: {
  case_id: string;
  skuRows: SkuRow[];
  caseCountry: string;
  exchangeRates: ExchangeRates;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // 권역 case면 marketplace select 노출. 단일이면 case.country 그대로 박힘.
  const isRegion = isRegionCode(caseCountry);
  const marketplaceOptions = isRegion
    ? countriesInRegion(caseCountry as Region)
        .map((c) => COUNTRY_OPTIONS.find((o) => o.code === c)!)
        .filter(Boolean)
    : [];
  const [marketplaceCountry, setMarketplaceCountry] = useState<string>(
    marketplaceOptions[0]?.code ?? "",
  );

  function onRollback() {
    if (
      !window.confirm(
        "가장 최근 매출 업로드 1번을 삭제합니다 (이전 업로드는 보존). 계속할까요?",
      )
    ) {
      return;
    }
    start(async () => {
      const r = await rollbackLatestSalesBatch(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  function onFile(f: File) {
    const today = new Date().toISOString().slice(0, 10);
    const ago = new Date(Date.now() - 30 * 86400_000)
      .toISOString()
      .slice(0, 10);

    const period_start =
      (document.getElementById("period_start") as HTMLInputElement | null)
        ?.value || ago;
    const period_end =
      (document.getElementById("period_end") as HTMLInputElement | null)
        ?.value || today;

    if (isRegion && !marketplaceCountry) {
      setMsg({ type: "err", text: "권역 case는 marketplace 국가를 먼저 선택하세요" });
      return;
    }

    start(async () => {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("period_start", period_start);
      fd.append("period_end", period_end);
      if (isRegion) fd.append("marketplace_country", marketplaceCountry);
      const r = await uploadAmazonSales(case_id, fd);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  const hasUpload = skuRows.length > 0;

  return (
    <div className="field">
      <label className="field-label">
        아마존 30일 매출 데이터 <span className="req">*</span>
      </label>

      {isRegion && (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            background: "var(--color-g25)",
            border: "1px solid var(--color-g100)",
            borderRadius: 6,
          }}
        >
          <label
            className="field-label"
            style={{ display: "block", marginBottom: 8 }}
          >
            Marketplace 국가 <span className="req">*</span>
          </label>
          <select
            className="field-select"
            value={marketplaceCountry}
            onChange={(e) => setMarketplaceCountry(e.target.value)}
          >
            {marketplaceOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code} ({c.label}) · {c.currency}
              </option>
            ))}
          </select>
          <span
            className="field-help"
            style={{ display: "block", marginTop: 6 }}
          >
            업로드 csv가 어느 마켓플레이스 export인지. {caseCountry} 권역 안 marketplace별로 SKU/매출 분리 박힘.
          </span>
        </div>
      )}

      <div
        style={{
          marginBottom: 12,
          padding: "12px 14px",
          background: "var(--color-g25)",
          border: "1px solid var(--color-g100)",
          borderRadius: 6,
        }}
      >
        <label
          className="field-label"
          style={{ display: "block", marginBottom: 8 }}
        >
          매출 기준 기간 <span className="req">*</span>
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 12px 1fr",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            id="period_start"
            className="field-input mono"
            type="date"
            defaultValue={new Date(Date.now() - 30 * 86400_000)
              .toISOString()
              .slice(0, 10)}
          />
          <span style={{ textAlign: "center", color: "var(--color-g400)" }}>
            ~
          </span>
          <input
            id="period_end"
            className="field-input mono"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <span
          className="field-help"
          style={{ display: "block", marginTop: 6 }}
        >
          CSV의 매출 데이터가 어느 기간 기준인지. 매월 누적 업로드 시 MoM 비교 자동.
        </span>
      </div>

      <UploadDropzone
        onFile={onFile}
        pending={pending}
        hint="CSV · ASIN별 행 · 컬럼 ASIN/Title/Price/ASIN Sales/ASIN Revenue 등"
      />
      {hasUpload && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginTop: 8,
            background: "var(--color-pos-soft)",
            border: "1px solid #B8D4BE",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--color-pos)", fontWeight: 800 }}>✓</span>
          <span style={{ flex: 1, fontWeight: 600 }}>
            {skuRows.length}개 SKU 적재됨 · 같은 ASIN+기간은 갱신, 다른 기간은 누적됨
          </span>
        </div>
      )}

      {hasUpload && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            background: "var(--color-g25)",
            border: "1px solid var(--color-g100)",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-g500)",
              textTransform: "uppercase",
              letterSpacing: ".04em",
              marginBottom: 10,
              gap: 10,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              감지된 SKU
              <button
                type="button"
                onClick={onRollback}
                disabled={pending}
                title="가장 최근 매출 업로드 1번 삭제 (이전 업로드는 보존)"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "none",
                  letterSpacing: 0,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "transparent",
                  color: "var(--color-accent)",
                  border: "1px solid var(--color-accent)",
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                ↶ 최근 업로드 롤백
              </button>
            </span>
            <span>
              <b style={{ color: "var(--color-ink)", fontSize: 13 }}>
                {skuRows.length}
              </b>
              개 · 총 판매량{" "}
              <b style={{ color: "var(--color-ink)" }}>
                {skuRows
                  .reduce((s, r) => s + (r.units_30d ?? 0), 0)
                  .toLocaleString()}
              </b>
              개 · 총 매출{" "}
              {(() => {
                // currency별 sum (권역 case는 SA/AE 통화 다름)
                const byCurrency = new Map<string, number>();
                for (const r of skuRows) {
                  const c = r.currency || "USD";
                  byCurrency.set(c, (byCurrency.get(c) ?? 0) + (r.revenue_30d ?? 0));
                }
                const usdTotal = Array.from(byCurrency.entries()).reduce(
                  (acc, [cur, v]) => acc + (toUsd(v, cur, exchangeRates) ?? 0),
                  0,
                );
                const curParts = Array.from(byCurrency.entries())
                  .map(([cur, v]) =>
                    cur === "USD"
                      ? `$${Math.round(v).toLocaleString()}`
                      : `${cur} ${Math.round(v).toLocaleString()}`,
                  )
                  .join(" / ");
                const showUsdEnvelope =
                  byCurrency.size > 1 ||
                  (byCurrency.size === 1 && !byCurrency.has("USD"));
                return (
                  <>
                    {showUsdEnvelope && (
                      <b style={{ color: "var(--color-ink)" }}>
                        ${Math.round(usdTotal).toLocaleString()}
                      </b>
                    )}
                    {showUsdEnvelope && (
                      <span style={{ color: "var(--color-g400)", fontWeight: 500 }}>
                        {" ("}
                        {curParts}
                        {")"}
                      </span>
                    )}
                    {!showUsdEnvelope && (
                      <b style={{ color: "var(--color-ink)" }}>{curParts}</b>
                    )}
                  </>
                );
              })()}
            </span>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            {skuRows.map((r) => (
              <div
                key={r.asin}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr 70px 100px 90px",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  background: "white",
                  borderRadius: 5,
                  fontSize: 11,
                }}
              >
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono"
                    style={{
                      fontWeight: 700,
                      fontSize: 11,
                      color: "var(--color-info)",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                    title={r.url}
                  >
                    {r.asin} ↗
                  </a>
                ) : (
                  <span
                    className="font-mono"
                    style={{ fontWeight: 700, fontSize: 11 }}
                  >
                    {r.asin}
                  </span>
                )}
                <span
                  style={{
                    color: "var(--color-g500)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.name}
                </span>
                <span
                  className="font-mono"
                  style={{
                    textAlign: "right",
                    fontWeight: 500,
                    color:
                      r.units_30d != null
                        ? "var(--color-g500)"
                        : "var(--color-g300)",
                  }}
                >
                  {r.units_30d != null
                    ? `${r.units_30d.toLocaleString()}개`
                    : "—"}
                </span>
                <span
                  className="font-mono"
                  style={{
                    textAlign: "right",
                    fontWeight: 600,
                    color: "var(--color-g600)",
                  }}
                  title={r.country ? `${r.country} marketplace` : ""}
                >
                  {r.currency === "USD"
                    ? `$${(r.revenue_30d ?? 0).toLocaleString()}`
                    : `${r.currency} ${(r.revenue_30d ?? 0).toLocaleString()}`}
                  {isRegion && r.country && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "var(--color-g50)",
                        color: "var(--color-g500)",
                      }}
                    >
                      {r.country}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "3px 8px",
                    borderRadius: 9,
                    background: r.hasBsr
                      ? "var(--color-pos-soft)"
                      : "var(--color-g50)",
                    color: r.hasBsr
                      ? "var(--color-pos)"
                      : "var(--color-g400)",
                  }}
                >
                  {r.hasBsr ? "BSR ✓" : "BSR 대기"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color:
              msg.type === "ok"
                ? "var(--color-pos)"
                : "var(--color-accent)",
            fontWeight: 600,
          }}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}
    </div>
  );
}
