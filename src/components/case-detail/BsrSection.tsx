"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadBsr } from "@/app/cases/[id]/upload-actions";
import type { SkuRow } from "./AmazonSalesSection";

export function BsrSection({
  case_id,
  skuRows,
}: {
  case_id: string;
  skuRows: SkuRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pendingAsin, setPendingAsin] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function uploadFor(asin: string, file: File) {
    setPendingAsin(asin);
    start(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("asin", asin);
      const r = await uploadBsr(case_id, fd);
      setPendingAsin(null);
      if (!r.ok) {
        console.error("[BSR upload]", r.error);
        window.alert(`BSR 업로드 실패\n\n${r.error}`);
      }
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  function uploadBulk(files: FileList) {
    start(async () => {
      const results: string[] = [];
      const errors: string[] = [];
      let anySuccess = false;
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await uploadBsr(case_id, fd);
        if (r.ok) {
          results.push(`✓ ${r.message}`);
          anySuccess = true;
        } else {
          results.push(`✕ ${f.name}: ${r.error}`);
          errors.push(`${f.name}: ${r.error}`);
        }
      }
      if (errors.length > 0) {
        console.error("[BSR bulk]", errors);
        window.alert(`BSR 일부 실패 (${errors.length}/${files.length})\n\n${errors.join("\n")}`);
      }
      setMsg({
        type: errors.length > 0 ? "err" : "ok",
        text: results.join(" · "),
      });
      if (anySuccess) router.refresh();
    });
  }

  if (skuRows.length === 0) {
    return (
      <div className="field" style={{ opacity: 0.45 }}>
        <label className="field-label">아마존 BSR 데이터 (제품별)</label>
        <span className="field-help">먼저 30일 매출 CSV를 업로드해 SKU를 등록하세요.</span>
      </div>
    );
  }

  return (
    <div className="field">
      <label className="field-label">아마존 BSR 데이터 (제품별)</label>
      <span className="field-help" style={{ marginBottom: 10 }}>
        SKU별로 keepa CSV를 슬롯에 매칭해 업로드하세요. 비워둔 SKU는 BSR 차트에서 제외.
      </span>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {skuRows.map((r) => (
          <BsrRow
            key={r.asin}
            sku={r}
            pending={pendingAsin === r.asin && pending}
            onPick={(file) => uploadFor(r.asin, file)}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "var(--color-g500)",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        또는{" "}
        <label
          style={{
            color: "var(--color-info)",
            fontWeight: 600,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          CSV 여러 개 한 번에 업로드
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            style={{ display: "none" }}
            onChange={(e) => e.target.files && uploadBulk(e.target.files)}
          />
        </label>{" "}
        — 파일명에 ASIN(B0xxx…) 포함되면 자동 매칭.
      </div>

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
          {msg.text}
        </div>
      )}
    </div>
  );
}

function BsrRow({
  sku,
  pending,
  onPick,
}: {
  sku: SkuRow;
  pending: boolean;
  onPick: (f: File) => void;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        border: "1px solid var(--color-g100)",
        borderRadius: 6,
        background: "white",
        cursor: pending ? "default" : "pointer",
      }}
    >
      {sku.url ? (
        <a
          href={sku.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono"
          style={{
            fontWeight: 700,
            fontSize: 11,
            color: "var(--color-info)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
          title={sku.url}
        >
          {sku.asin} ↗
        </a>
      ) : (
        <span
          className="font-mono"
          style={{ fontWeight: 700, fontSize: 11 }}
        >
          {sku.asin}
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {sku.name}
      </span>
      <span
        className="font-mono"
        style={{
          fontSize: 11,
          padding: "6px 12px",
          border: "1px dashed var(--color-g200)",
          borderRadius: 5,
          background: sku.hasBsr ? "var(--color-pos-soft)" : "var(--color-g25)",
          color: sku.hasBsr ? "var(--color-pos)" : "var(--color-g400)",
          fontWeight: sku.hasBsr ? 600 : 400,
          ...(sku.hasBsr
            ? { borderStyle: "solid", borderColor: "var(--color-pos)" }
            : {}),
        }}
      >
        {pending
          ? "업로드 중…"
          : sku.hasBsr
            ? "✓ 적재됨 · 다시 클릭해 덮어쓰기"
            : "CSV 업로드"}
      </span>
      <input
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (
              sku.hasBsr &&
              !window.confirm(
                `${sku.asin}에 이미 BSR 데이터가 있습니다.\n파일: ${f.name}\n\n기존 시계열을 모두 삭제하고 새 파일로 교체합니다. 진행할까요?`,
              )
            ) {
              e.currentTarget.value = "";
              return;
            }
            onPick(f);
          }
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}
