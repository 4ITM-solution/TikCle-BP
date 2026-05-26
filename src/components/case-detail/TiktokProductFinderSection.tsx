"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dryRunTiktokProductFinder,
  uploadTiktokProductFinder,
  undoLastTiktokProductFinder,
  type TtProductFinderDryRun,
} from "@/app/cases/[id]/upload-actions";

/**
 * Helium10 TT Product Finder paste — 2단계 (Preview → Commit) + Undo.
 *
 * 1) paste → "미리보기" → dry-run 결과 diff 박스 표시
 * 2) "확정 적재" → DB commit (Undo snapshot 같이 박힘)
 * 3) 성공 후 토스트에 "방금 적재 취소" 버튼 — 직전 상태 복원
 */
export function TiktokProductFinderSection({
  case_id,
  products,
  existingProducts,
  hasUndo,
}: {
  case_id: string;
  products: Array<{
    id: string;
    name: string;
    asin: string | null;
    external_product_id: string | null;
  }>;
  existingProducts: number;
  hasUndo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [undoPending, startUndo] = useTransition();
  const [text, setText] = useState("");
  const [productId, setProductId] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const [periodEnd, setPeriodEnd] = useState<string>(today);
  const [periodDays, setPeriodDays] = useState<"7" | "14" | "30">("30");
  const [preview, setPreview] = useState<TtProductFinderDryRun | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function runDryRun() {
    if (!productId) {
      setMsg({ type: "err", text: "제품을 선택해주세요" });
      return;
    }
    if (!text.trim()) {
      setMsg({ type: "err", text: "텍스트가 비어있어요" });
      return;
    }
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.append("text", text);
      fd.append("product_id", productId);
      fd.append("period_days", periodDays);
      fd.append("period_end", periodEnd);
      const r = await dryRunTiktokProductFinder(case_id, fd);
      if (!r.ok) {
        setMsg({ type: "err", text: r.error });
        return;
      }
      setPreview(r.preview);
    });
  }

  function commit() {
    if (!preview) return;
    start(async () => {
      const fd = new FormData();
      fd.append("text", text);
      fd.append("product_id", productId);
      fd.append("period_days", periodDays);
      fd.append("period_end", periodEnd);
      const r = await uploadTiktokProductFinder(case_id, fd);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) {
        setText("");
        setPreview(null);
        router.refresh();
      }
    });
  }

  function undo() {
    startUndo(async () => {
      const r = await undoLastTiktokProductFinder(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="field">
      <label className="field-label">
        Helium10 TikTok Product Finder — Product Details (정확한 메타 + 매출)
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        Helium10 → TT Product Finder → 제품 상세 → <b>Cmd+A → 복사 → 아래 paste
        → 미리보기 확인 → 확정</b>. Apify scraper보다 정확한 매출 / Rating /
        Listed Date / Subcategory.
        {existingProducts > 0 && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-pos)",
              fontWeight: 600,
            }}
          >
            ✓ {existingProducts}개 제품 적재됨
          </span>
        )}
        {hasUndo && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-warn)",
              fontWeight: 600,
            }}
          >
            · 직전 적재 롤백 가능
          </span>
        )}
      </span>

      <div
        style={{
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        {products.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-accent)",
              padding: "8px 0",
            }}
          >
            ⚠ 이 케이스에 제품이 없어요. 먼저 product를 등록해주세요.
          </div>
        ) : (
          <>
            {/* 제품 + 기간 + 기준일 */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-g600)",
                  fontFamily: "var(--font-mono)",
                  minWidth: 40,
                }}
              >
                제품
              </span>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setMsg(null);
                  setPreview(null);
                }}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                  cursor: "pointer",
                  flex: 1,
                  maxWidth: 520,
                }}
              >
                <option value="">— 어느 제품 페이지? —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.asin ? `${p.asin} · ` : ""}
                    {p.name.slice(0, 70)}
                    {p.name.length > 70 ? "…" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-g600)",
                  fontFamily: "var(--font-mono)",
                  minWidth: 40,
                }}
              >
                Overview
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["7", "14", "30"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPeriodDays(d);
                      setPreview(null);
                    }}
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "4px 9px",
                      borderRadius: 4,
                      border: `1px solid ${periodDays === d ? "var(--color-ink)" : "var(--color-g200)"}`,
                      background:
                        periodDays === d ? "var(--color-ink)" : "white",
                      color: periodDays === d ? "white" : "var(--color-g600)",
                      cursor: "pointer",
                    }}
                  >
                    Last {d}d
                  </button>
                ))}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-g600)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                기준일
              </span>
              <input
                type="date"
                value={periodEnd}
                max={today}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setPreview(null);
                }}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 8px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                }}
              />
            </div>

            {/* paste 영역 */}
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
              placeholder="{제품명}&#10;United States&#10;·&#10;{Category}&#10;·&#10;Rating&#10;4.3&#10;Price&#10;$1.00&#10;Listed Date&#10;2025-10-18&#10;..."
              rows={8}
              style={{
                width: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "8px 10px",
                border: "1px solid var(--color-g200)",
                borderRadius: 4,
                resize: "vertical",
                background: "white",
                marginTop: 4,
              }}
            />

            {/* 1단계: 미리보기 버튼 / 2단계: preview 박스 + 확정 */}
            {!preview ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={runDryRun}
                  disabled={
                    pending || !productId || text.trim().length === 0
                  }
                  style={{
                    background: "var(--color-info)",
                    color: "white",
                    padding: "6px 14px",
                    fontSize: 12,
                    borderRadius: 5,
                    border: "none",
                    cursor: "pointer",
                    opacity:
                      pending || !productId || text.trim().length === 0
                        ? 0.5
                        : 1,
                  }}
                >
                  {pending ? "분석 중…" : "1️⃣ 미리보기"}
                </button>
                {hasUndo && (
                  <button
                    type="button"
                    onClick={undo}
                    disabled={undoPending}
                    style={{
                      background: "transparent",
                      color: "var(--color-warn)",
                      padding: "5px 11px",
                      fontSize: 11,
                      borderRadius: 5,
                      border: "1px solid var(--color-warn)",
                      cursor: "pointer",
                      opacity: undoPending ? 0.5 : 1,
                    }}
                  >
                    {undoPending ? "롤백 중…" : "↶ 직전 적재 롤백"}
                  </button>
                )}
              </div>
            ) : (
              <PreviewBox
                preview={preview}
                onCommit={commit}
                onCancel={() => setPreview(null)}
                pending={pending}
                periodDays={periodDays}
              />
            )}

            {msg && !preview && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color:
                    msg.type === "ok"
                      ? "var(--color-pos)"
                      : "var(--color-accent)",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                {msg.type === "ok" ? "✓ " : "✕ "}
                {msg.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 미리보기 박스 — diff + 확정/취소 버튼
function PreviewBox({
  preview,
  onCommit,
  onCancel,
  pending,
  periodDays,
}: {
  preview: TtProductFinderDryRun;
  onCommit: () => void;
  onCancel: () => void;
  pending: boolean;
  periodDays: string;
}) {
  const { parsed, product, diff } = preview;
  const fmtUsd = (n: number | null) =>
    n == null ? "—" : `$${n.toLocaleString()}`;
  const fmtPct = (changed: boolean) =>
    changed ? "var(--color-warn)" : "var(--color-g500)";

  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        background: "var(--color-info-soft, rgba(0,100,255,0.05))",
        border: "1px solid var(--color-info)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-info)",
          marginBottom: 8,
        }}
      >
        🔍 미리보기 — 적재 전 변경 확인
      </div>

      {/* 파싱된 제품 정보 */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-ink)",
          marginBottom: 8,
          padding: "8px 10px",
          background: "white",
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          {parsed.product_name?.slice(0, 80)}
          {(parsed.product_name?.length ?? 0) > 80 ? "…" : ""}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          📌 적재 대상 product: {product.asin ? `${product.asin} · ` : ""}
          {product.name.slice(0, 60)}
          {product.name.length > 60 ? "…" : ""}
        </div>
        {parsed.product_name &&
          product.name &&
          !product.name.toLowerCase().includes(
            parsed.product_name.split(" ").slice(0, 3).join(" ").toLowerCase(),
          ) && (
            <div
              style={{
                fontSize: 10,
                color: "var(--color-accent)",
                fontWeight: 700,
                marginTop: 4,
              }}
            >
              ⚠ 파싱된 product name과 선택한 product가 달라요. 잘못된 제품 선택
              아닌지 확인해주세요.
            </div>
          )}
      </div>

      {/* diff 표 */}
      <table
        style={{
          width: "100%",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              textAlign: "left",
            }}
          >
            <th style={{ padding: "4px 6px" }}>필드</th>
            <th style={{ padding: "4px 6px" }}>현재</th>
            <th style={{ padding: "4px 6px" }}>새 값</th>
          </tr>
        </thead>
        <tbody>
          <DiffRow
            field="Price"
            from={diff.price.from != null ? `$${diff.price.from}` : "—"}
            to={diff.price.to != null ? `$${diff.price.to}` : "—"}
            color={fmtPct(diff.price.changed)}
          />
          <DiffRow
            field="Listed Date"
            from={diff.launch_date.from ?? "—"}
            to={diff.launch_date.to ?? "—"}
            color={fmtPct(diff.launch_date.changed)}
          />
          <DiffRow
            field="Subcategory"
            from={diff.subcategory.from ?? "—"}
            to={diff.subcategory.to ?? "—"}
            color={fmtPct(diff.subcategory.changed)}
          />
          <DiffRow
            field={`${periodDays}일 매출`}
            from={fmtUsd(diff.sales_30d.revenue_from)}
            to={fmtUsd(diff.sales_30d.revenue_to)}
            color={fmtPct(diff.sales_30d.changed)}
          />
          <DiffRow
            field={`${periodDays}일 판매량`}
            from={
              diff.sales_30d.units_from?.toLocaleString() ?? "—"
            }
            to={diff.sales_30d.units_to?.toLocaleString() ?? "—"}
            color={fmtPct(diff.sales_30d.changed)}
          />
        </tbody>
      </table>

      {/* 추가 lifetime 정보 */}
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          marginTop: 8,
          padding: "6px 10px",
          background: "white",
          borderRadius: 4,
          fontFamily: "var(--font-mono)",
        }}
      >
        + Lifetime $
        {(parsed.lifetime_gmv_usd ?? 0).toLocaleString()} (
        {parsed.lifetime_items_sold?.toLocaleString() ?? "—"} 판매 ·{" "}
        {parsed.lifetime_relevant_influencers ?? "—"} 인플 ·{" "}
        {parsed.lifetime_relevant_videos ?? "—"} 영상)
        <br />+ Rating {parsed.rating ?? "—"} / 신규 영상{" "}
        {parsed.period_new_videos ?? 0} · 신규 인플{" "}
        {parsed.period_new_influencers ?? 0}
        {diff.has_existing_helium10_for_period && (
          <span
            style={{
              color: "var(--color-warn)",
              fontWeight: 700,
              marginLeft: 6,
            }}
          >
            · 같은 기간 기존 데이터 덮어쓰기
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
        }}
      >
        <button
          type="button"
          onClick={onCommit}
          disabled={pending}
          style={{
            background: "var(--color-ink)",
            color: "white",
            padding: "6px 16px",
            fontSize: 12,
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            opacity: pending ? 0.5 : 1,
          }}
        >
          {pending ? "적재 중…" : "✓ 확정 적재"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={{
            background: "white",
            color: "var(--color-g600)",
            padding: "6px 14px",
            fontSize: 12,
            borderRadius: 5,
            border: "1px solid var(--color-g200)",
            cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function DiffRow({
  field,
  from,
  to,
  color,
}: {
  field: string;
  from: string;
  to: string;
  color: string;
}) {
  return (
    <tr style={{ borderTop: "1px solid var(--color-g100)" }}>
      <td
        style={{
          padding: "5px 6px",
          color: "var(--color-g600)",
          width: 110,
        }}
      >
        {field}
      </td>
      <td
        style={{
          padding: "5px 6px",
          color: "var(--color-g500)",
        }}
      >
        {from}
      </td>
      <td
        style={{
          padding: "5px 6px",
          color,
          fontWeight: 700,
        }}
      >
        {to}
      </td>
    </tr>
  );
}
