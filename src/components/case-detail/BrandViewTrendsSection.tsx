"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadBrandViewTrends } from "@/app/cases/[id]/upload-actions";

/**
 * Exolyt social listener 주간 viral 데이터 업로드.
 *
 * CSV 형식: `date, {brand}_views, {brand}_videos` (3컬럼, 헤더 1줄).
 * 브랜드 단위로 적재 (brand_id + country + week_start + source unique).
 * 같은 브랜드의 다른 케이스끼리 자동 공유 — 한 번 박으면 다 보임.
 */
export function BrandViewTrendsSection({
  case_id,
  existingWeeks,
}: {
  case_id: string;
  existingWeeks: number;
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
      const r = await uploadBrandViewTrends(case_id, fd);
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
        주간 viral 데이터 (Exolyt social listener)
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        Exolyt social listener → brand keyword → weekly export CSV. 박히면 BSR
        추이 차트에 <b>"영상 조회수 / 영상 개수" 토글</b>이 활성화돼서 BSR 라인
        위에 영상 활동 오버레이됨. <b>브랜드 단위 데이터</b>라 같은 브랜드의 다른
        케이스에도 동시에 반영돼.
        {existingWeeks > 0 && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-pos)",
              fontWeight: 600,
            }}
          >
            ✓ {existingWeeks}주 적재됨
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
          📌 CSV 컬럼: <code>date,{"{"}brand{"}"}_views,{"{"}brand{"}"}_videos</code>
          {" "}(예: <code>date,drforhair_views,drforhair_videos</code>). 같은 주
          재업로드 시 기존 row 덮어쓰기 (source=exolyt 기준).
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
