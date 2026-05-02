"use client";

import { useState, useTransition } from "react";
import { UploadDropzone } from "./UploadDropzone";
import { reuseExolyt, uploadExolyt } from "@/app/cases/[id]/upload-actions";

export function ExolytSection({
  case_id,
  hasContents,
  reusable,
  reusedAlready,
  contentCount,
}: {
  case_id: string;
  hasContents: boolean;
  reusable: { other_case_label: string; row_count: number } | null;
  reusedAlready: boolean;
  contentCount: number;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [showReupload, setShowReupload] = useState(false);

  function onFile(f: File) {
    start(async () => {
      const fd = new FormData();
      fd.append("file", f);
      const r = await uploadExolyt(case_id, fd);
      if (!r.ok) {
        console.error("[Exolyt upload]", r.error);
        window.alert(`exolyt 업로드 실패\n\n${r.error}`);
      } else {
        // 재업로드 성공 시 dropzone 자동 닫기
        setShowReupload(false);
      }
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  function onReuse() {
    start(async () => {
      const r = await reuseExolyt(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  return (
    <div className="field">
      <label className="field-label">
        exolyt 1년 콘텐츠 데이터 <span className="req">*</span>
      </label>

      {reusable && !hasContents && (
        <div
          style={{
            background: "var(--color-info-soft)",
            border: "1px solid #C7D6E8",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "28px 1fr auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 18, color: "var(--color-info)" }}>↻</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-info)",
              lineHeight: 1.5,
            }}
          >
            <b style={{ fontWeight: 800 }}>{reusable.other_case_label}</b>{" "}
            케이스의 exolyt 데이터를 재사용할 수 있습니다.
            <br />
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              {reusable.row_count.toLocaleString()}행 · 같은 brand+country
            </span>
          </div>
          <button
            type="button"
            onClick={onReuse}
            disabled={pending}
            className="btn"
            style={{
              background: "var(--color-info)",
              color: "white",
              padding: "5px 12px",
              fontSize: 11,
              borderRadius: 5,
            }}
          >
            재사용
          </button>
        </div>
      )}

      {hasContents || reusedAlready ? (
        <>
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
            <span style={{ color: "var(--color-pos)", fontWeight: 800 }}>
              ✓
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>
              {reusedAlready
                ? "기존 exolyt 데이터 재사용 중"
                : `exolyt 데이터 적재 완료 · ${contentCount.toLocaleString()}행`}
            </span>
            {!reusedAlready && (
              <button
                type="button"
                onClick={() => setShowReupload((v) => !v)}
                disabled={pending}
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-g300)",
                  color: "var(--color-g600)",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {showReupload ? "취소" : "다시 업로드"}
              </button>
            )}
          </div>

          {showReupload && (
            <div style={{ marginTop: 10 }}>
              <UploadDropzone
                onFile={onFile}
                pending={pending}
                hint="기존 url과 겹치는 행은 업데이트, 새 url은 추가됨 (upsert)"
              />
            </div>
          )}
        </>
      ) : (
        <UploadDropzone
          onFile={onFile}
          pending={pending}
          hint="CSV · 첫 컬럼 username · url 필수"
        />
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

      <span className="field-help">
        같은 brand+country면 다른 플랫폼 케이스의 exolyt를 재사용할 수 있어요.
      </span>
    </div>
  );
}
