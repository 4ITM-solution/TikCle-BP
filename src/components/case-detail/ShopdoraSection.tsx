"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadShopdoraSnapshot,
  uploadShopdoraMonthly,
} from "@/app/cases/[id]/upload-actions";

/**
 * Shopee SEA 케이스용 Shopdora 데이터 업로드 섹션.
 *
 * 두 가지 입력 (Amazon Black Box + BSR 시계열 패턴 대응):
 *   - 제품 스냅샷: Shopdora 웹 화면 통째 복사 → products + case_product_sales (Past 30days)
 *   - 월별 시계열: 제품별 12개월 매출 추이 → sales_snapshot
 */
export function ShopdoraSection({
  case_id,
  productCount,
}: {
  case_id: string;
  productCount: number;
}) {
  const router = useRouter();

  // 스냅샷
  const [snapText, setSnapText] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const [periodStart, setPeriodStart] = useState(thirtyDaysAgo);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [snapPending, snapStart] = useTransition();
  const [snapMsg, setSnapMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // 월별
  const [monthlyText, setMonthlyText] = useState("");
  const [monthlyPending, monthlyStart] = useTransition();
  const [monthlyMsg, setMonthlyMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function submitSnapshot() {
    snapStart(async () => {
      const fd = new FormData();
      fd.append("text", snapText);
      fd.append("period_start", periodStart);
      fd.append("period_end", periodEnd);
      const r = await uploadShopdoraSnapshot(case_id, fd);
      setSnapMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) {
        setSnapText("");
        router.refresh();
      }
    });
  }

  function submitMonthly() {
    monthlyStart(async () => {
      const fd = new FormData();
      fd.append("text", monthlyText);
      const r = await uploadShopdoraMonthly(case_id, fd);
      setMonthlyMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) {
        setMonthlyText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="field">
      <label className="field-label">
        Shopee 매출 데이터 (Shopdora) <span className="req">*</span>
      </label>
      <span className="field-help" style={{ marginBottom: 10, display: "block" }}>
        Shopdora 웹 화면을 복사해서 그대로 붙여넣으세요. 텍스트 한 가지 포맷만
        지원 — .xls 파일은 엑셀에서 열어 전체 복사하면 됩니다.
      </span>

      {/* 1) 스냅샷 */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          ① 제품 스냅샷 (Past 30days, 전 제품){" "}
          {productCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--color-pos)",
                marginLeft: 6,
                fontWeight: 600,
              }}
            >
              ✓ {productCount}개 적재됨
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-g500)", marginBottom: 8 }}>
          Shopdora &gt; 브랜드 검색 &gt; 제품 리스트 화면 → 표 통째 복사 → 아래
          붙여넣기. "Traffic Word Analysis"로 끝나는 블록들이 자동 파싱돼요.
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <label style={{ flex: 1, fontSize: 11 }}>
            기간 시작
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="field-input"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 11 }}>
            기간 끝
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="field-input"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
        </div>
        <textarea
          value={snapText}
          onChange={(e) => setSnapText(e.target.value)}
          placeholder="Shopdora 화면 복사한 텍스트…&#10;&#10;1&#10;SKIN1004 Madagascar Centella Hyalu-Cica Water-Fit Sun Serum…&#10;16581227588&#10;19…"
          rows={6}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "8px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 4,
            resize: "vertical",
            background: "white",
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            type="button"
            onClick={submitSnapshot}
            disabled={snapPending || snapText.trim().length === 0}
            className="btn"
            style={{
              background: "var(--color-ink)",
              color: "white",
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 5,
              opacity:
                snapPending || snapText.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {snapPending ? "처리 중…" : "스냅샷 업로드"}
          </button>
          {snapMsg && (
            <span
              style={{
                fontSize: 11,
                color:
                  snapMsg.type === "ok"
                    ? "var(--color-pos)"
                    : "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              {snapMsg.type === "ok" ? "✓ " : "✕ "}
              {snapMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* 2) 월별 시계열 */}
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
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          ② 월별 시계열 (상위 제품, 선택)
        </div>
        <div style={{ fontSize: 11, color: "var(--color-g500)", marginBottom: 8 }}>
          제품별 12개월 매출 추이. 헤더 줄(ID + 제품명)과 월 데이터 줄(YYYYMM Sold
          Rev Price)이 한 블록. ① 스냅샷 먼저 업로드 후 가능.
        </div>
        <textarea
          value={monthlyText}
          onChange={(e) => setMonthlyText(e.target.value)}
          placeholder="16581227588	SKIN1004 Madagascar Centella Hyalu-Cica…&#10;202506	9694	Rp3,489,840,000.00	Rp147,950.00&#10;202507	8794	Rp1,266,336,000.00	Rp150,967.74&#10;…"
          rows={6}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "8px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 4,
            resize: "vertical",
            background: "white",
          }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            type="button"
            onClick={submitMonthly}
            disabled={monthlyPending || monthlyText.trim().length === 0}
            className="btn"
            style={{
              background: "var(--color-ink)",
              color: "white",
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 5,
              opacity:
                monthlyPending || monthlyText.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {monthlyPending ? "처리 중…" : "월별 시계열 업로드"}
          </button>
          {monthlyMsg && (
            <span
              style={{
                fontSize: 11,
                color:
                  monthlyMsg.type === "ok"
                    ? "var(--color-pos)"
                    : "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              {monthlyMsg.type === "ok" ? "✓ " : "✕ "}
              {monthlyMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
