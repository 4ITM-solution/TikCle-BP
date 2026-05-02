"use client";

import { useState, useTransition } from "react";
import { UploadDropzone } from "./UploadDropzone";
import { uploadAmazonSales } from "@/app/cases/[id]/upload-actions";

export type SkuRow = {
  asin: string;
  name: string;
  url: string | null;
  units_30d: number | null;
  revenue_30d: number | null;
  hasBsr: boolean;
};

export function AmazonSalesSection({
  case_id,
  skuRows,
}: {
  case_id: string;
  skuRows: SkuRow[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

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

    start(async () => {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("period_start", period_start);
      fd.append("period_end", period_end);
      const r = await uploadAmazonSales(case_id, fd);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  const hasUpload = skuRows.length > 0;

  return (
    <div className="field">
      <label className="field-label">
        아마존 30일 매출 데이터 <span className="req">*</span>
      </label>

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

      {!hasUpload ? (
        <UploadDropzone
          onFile={onFile}
          pending={pending}
          hint="CSV · ASIN별 행 · 컬럼 ASIN/Title/Price/ASIN Sales/ASIN Revenue 등"
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "var(--color-pos-soft)",
            border: "1px solid #B8D4BE",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--color-pos)", fontWeight: 800 }}>✓</span>
          <span style={{ flex: 1, fontWeight: 600 }}>
            {skuRows.length}개 SKU 적재 · 다시 업로드하려면 페이지 새로고침
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
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-g500)",
              textTransform: "uppercase",
              letterSpacing: ".04em",
              marginBottom: 10,
            }}
          >
            <span>감지된 SKU</span>
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
              <b style={{ color: "var(--color-ink)" }}>
                $
                {skuRows
                  .reduce((s, r) => s + (r.revenue_30d ?? 0), 0)
                  .toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </b>
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
                >
                  ${(r.revenue_30d ?? 0).toLocaleString()}
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
