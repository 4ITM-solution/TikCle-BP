"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadKalodata } from "@/app/cases/[id]/upload-actions";

/**
 * TikTok Shop SEA 케이스용 Kalodata 데이터 업로드.
 *
 * Kalodata Pro 플랜은 API/대량 export 없이 화면만 보임. 다운로드는
 * 제한된 크레딧 소비라 화면 통째 텍스트 복붙이 가장 안전한 경로.
 * 한 번 복붙으로 Brand KPI + Products(Top N) + Creators(Top N) 일괄 적재.
 */
export function KalodataSection({
  case_id,
  productCount,
}: {
  case_id: string;
  productCount: number;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.append("text", text);
      const r = await uploadKalodata(case_id, fd);
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
        Kalodata 매출 데이터 (TikTok Shop SEA){" "}
        <span className="req">*</span>
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        Kalodata 브랜드 페이지(예: SKIN1004 Thailand) 통째 텍스트 복사 →
        붙여넣기. <b>크레딧 0 소비</b>, 다운로드 X. Brand KPI + Products(Top N)
        + Creators(Top N) 한 번에 적재돼요.
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
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          Kalodata 브랜드 페이지 통째 복사
          {productCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--color-pos)",
                marginLeft: 6,
                fontWeight: 600,
              }}
            >
              ✓ 제품 {productCount}개 적재됨
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          📌 Kalodata 로그인 → 브랜드 페이지(SKIN1004 Thailand 등) → 페이지
          <b> 전체 텍스트 선택</b>(Cmd+A) → 복사 → 아래 붙여넣기.
          <br />
          "Core Metrics", "Creator(N items)", "Product(N items)" 섹션이 모두 한
          텍스트 안에 있으면 파싱 OK.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SKIN1004 Thailand&#10;Follow&#10;BRAND&#10;...&#10;Core Metrics&#10;Last 30 Days (04/19 ~ 05/18)&#10;Revenue&#10;$1.10m&#10;..."
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
            disabled={pending || text.trim().length === 0}
            className="btn"
            style={{
              background: "var(--color-ink)",
              color: "white",
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 5,
              opacity: pending || text.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {pending ? "처리 중…" : "Kalodata 업로드"}
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
      </div>
    </div>
  );
}
