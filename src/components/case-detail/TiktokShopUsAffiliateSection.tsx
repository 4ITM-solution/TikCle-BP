"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTiktokShopUsAffiliate } from "@/app/cases/[id]/upload-actions";

/**
 * TikTok Shop US 케이스의 제품 단위 affiliate creator CSV 업로드.
 *
 * Source: TT Shop Seller Center → 제품 상세 → Affiliate Creators → Export CSV.
 * 컬럼: Username · Nickname · Follower Count · Demographics · Category ·
 * Engagement Rate · Items Sold (30d) · GMV (30d) · Videos · Number of Videos.
 *
 * CSV 자체에는 어느 제품에서 export됐는지 정보가 없어 — 사용자가 드롭다운에서
 * 선택해야 함. 선택한 product_id는 contents/key_stats에 박혀 분석 시 인플 ↔
 * 제품 매핑이 살아 있음.
 */
export function TiktokShopUsAffiliateSection({
  case_id,
  products,
  existingAffiliates,
}: {
  case_id: string;
  products: Array<{
    id: string;
    name: string;
    asin: string | null;
    external_product_id: string | null;
  }>;
  existingAffiliates: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState<string>("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function onFile(f: File) {
    if (!productId) {
      setMsg({
        type: "err",
        text: "어느 제품에서 export한 CSV인지 먼저 선택해주세요",
      });
      // input 초기화는 안 해도 됨 — 사용자가 드롭다운 선택 후 다시 던지면 됨
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("product_id", productId);
      const r = await uploadTiktokShopUsAffiliate(case_id, fd);
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
        TikTok Shop US — 제품별 affiliate creator
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        TT Shop Seller Center → 제품 상세 페이지 → Affiliate Creators 섹션의{" "}
        <b>Export CSV</b>. <b>제품 페이지마다 따로 export 받아 차례로 업로드</b>
        — 각 CSV가 어느 제품 export인지 드롭다운으로 선택해야 영상 ↔ 제품 매핑이
        살아남.
        {existingAffiliates > 0 && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-pos)",
              fontWeight: 600,
            }}
          >
            ✓ {existingAffiliates}명 적재됨
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
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          📌 같은 제품 export를 다시 업로드하면 누적 (handle dedupe). 여러 제품을
          분석하려면 각 제품 페이지에서 export → 드롭다운에서 그 제품 선택 →
          업로드, 반복.
        </div>

        {products.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-accent)",
              padding: "8px 0",
            }}
          >
            ⚠ 이 케이스에 제품이 적재되어 있지 않아요. 먼저 매출 CSV 또는 BSR
            CSV를 업로드해 product를 등록해주세요.
          </div>
        ) : (
          <>
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
                <option value="">— 어느 제품 페이지에서 export? —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.asin ? `${p.asin} · ` : ""}
                    {p.name.slice(0, 70)}
                    {p.name.length > 70 ? "…" : ""}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={pending || !productId}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              style={{ fontSize: 11 }}
            />
          </>
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
              lineHeight: 1.5,
            }}
          >
            {msg.type === "ok" ? "✓ " : "✕ "}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
