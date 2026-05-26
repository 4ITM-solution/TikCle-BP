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
 * 한 제품에 대한 export지만 같은 케이스에 여러 제품 export를 누적 박을 수 있음
 * (handle 기준 dedupe). 영상 URL은 contents에 박혀 Phase 4b/Vision/클러스터링 활용.
 */
export function TiktokShopUsAffiliateSection({
  case_id,
  existingAffiliates,
}: {
  case_id: string;
  existingAffiliates: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function onFile(f: File) {
    start(async () => {
      const fd = new FormData();
      fd.append("file", f);
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
        <b>Export CSV</b>. 컬럼: Username / Follower Count / GMV (30d) / Items
        Sold / Videos URLs 등. 같은 케이스에 <b>여러 제품 export 누적 가능</b>
        (handle 기준 dedupe).
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
          📌 한 제품에 대한 affiliate 리스트 export. 여러 제품을 분석하려면 각
          제품 페이지에서 export 받고 차례로 업로드. Videos URL은{" "}
          <b>contents에 박혀 Phase 4b Vision / 클러스터링</b>으로 자동 분석됨.
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          style={{ fontSize: 11 }}
        />
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
