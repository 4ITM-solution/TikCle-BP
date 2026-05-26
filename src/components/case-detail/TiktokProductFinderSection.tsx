"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTiktokProductFinder } from "@/app/cases/[id]/upload-actions";

/**
 * Helium10 TikTok Product Finder → Product Details 페이지 텍스트 paste 업로드.
 *
 * Apify scraper가 박는 매출(특히 GMV)이 변형 옵션 가격대 큰 제품에서 부정확
 * (NOONI Lip Oil: Apify $3.46M vs Helium10 $124K = 28배 차이). 사용자가 그
 * 페이지 통째 텍스트 복사(Cmd+A) → 슬롯에 paste → 정확한 매출 + Rating + Listed
 * Date + Subcategory + 30일 active 데이터로 덮어쓰기.
 */
export function TiktokProductFinderSection({
  case_id,
  products,
  existingProducts,
}: {
  case_id: string;
  products: Array<{
    id: string;
    name: string;
    asin: string | null;
    external_product_id: string | null;
  }>;
  existingProducts: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [productId, setProductId] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const [periodEnd, setPeriodEnd] = useState<string>(today);
  const [periodDays, setPeriodDays] = useState<"7" | "14" | "30">("30");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function submit() {
    if (!productId) {
      setMsg({ type: "err", text: "어느 제품인지 선택해주세요" });
      return;
    }
    if (!text.trim()) {
      setMsg({ type: "err", text: "Product Details 페이지 텍스트가 비어있어요" });
      return;
    }
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
        router.refresh();
      }
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
        Helium10 → TikTok Product Finder → 제품 상세 페이지 → <b>Cmd+A로 전체
        선택 → 복사 → 아래 붙여넣기</b>. <b>Apify scraper보다 정확한 매출 / Rating
        / Listed Date / Subcategory</b>를 박음. (Apify GMV는 변형 옵션 평균가
        반영 못 해 과대평가 가능)
        {existingProducts > 0 && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-pos)",
              fontWeight: 600,
            }}
          >
            ✓ Helium10 데이터 {existingProducts}개 제품 적재됨
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
            ⚠ 이 케이스에 제품이 적재되어 있지 않아요. Phase 1.5 자동 수집 또는
            매출 CSV로 product 먼저 등록해주세요.
          </div>
        ) : (
          <>
            {/* 제품 선택 */}
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
                }}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "5px 8px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                  color: "var(--color-ink)",
                  cursor: "pointer",
                  flex: 1,
                  maxWidth: 520,
                }}
              >
                <option value="">— 어느 제품 페이지인지? —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.asin ? `${p.asin} · ` : ""}
                    {p.name.slice(0, 70)}
                    {p.name.length > 70 ? "…" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* 기간 + 기준일 */}
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
                    onClick={() => setPeriodDays(d)}
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "4px 9px",
                      borderRadius: 4,
                      border: `1px solid ${periodDays === d ? "var(--color-ink)" : "var(--color-g200)"}`,
                      background: periodDays === d ? "var(--color-ink)" : "white",
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
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 8px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                  color: "var(--color-ink)",
                }}
              />
            </div>

            {/* paste 텍스트 영역 */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="TikTok Product Finder&#10;/&#10;Product Details&#10;{제품명}&#10;United States&#10;...&#10;Rating&#10;4.3&#10;...&#10;Overview&#10;{30일 Items Sold}&#10;{30일 GMV}&#10;{30일 New Videos}&#10;{30일 New Influencers}"
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

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={submit}
                disabled={pending || !productId || text.trim().length === 0}
                className="btn"
                style={{
                  background: "var(--color-ink)",
                  color: "white",
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 5,
                  opacity:
                    pending || !productId || text.trim().length === 0
                      ? 0.5
                      : 1,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {pending ? "처리 중…" : "Helium10 적재"}
              </button>
              {msg && (
                <span
                  style={{
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
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
