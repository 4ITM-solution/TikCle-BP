"use client";

import { useRef, useState, type ChangeEvent } from "react";

/**
 * 공통 드롭존. 파일 선택 시 호출자에게 File 객체 전달.
 * 업로드 진행/결과는 호출자가 처리.
 */
export function UploadDropzone({
  accept = ".csv,text/csv",
  hint,
  onFile,
  pending = false,
  uploadedLabel,
  onClear,
}: {
  accept?: string;
  hint?: string;
  onFile: (f: File) => void;
  pending?: boolean;
  uploadedLabel?: string | null;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(f: File) {
    onFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (uploadedLabel) {
    return (
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
        <span style={{ flex: 1, fontWeight: 600 }}>{uploadedLabel}</span>
        {onClear && (
          <span
            onClick={onClear}
            style={{
              cursor: "pointer",
              color: "var(--color-g400)",
              fontSize: 14,
              padding: "0 4px",
            }}
            title="지우기"
          >
            ×
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => !pending && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) pick(f);
      }}
      style={{
        border: `1.5px dashed ${drag ? "var(--color-ink)" : "var(--color-g200)"}`,
        borderRadius: 8,
        padding: "22px 16px",
        background: drag ? "var(--color-g50)" : "var(--color-g25)",
        textAlign: "center",
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 22, opacity: 0.55, marginBottom: 6 }}>⬆</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>
        {pending ? "업로드 중…" : "파일을 끌어다 놓거나 클릭하여 선택"}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            marginTop: 3,
            fontFamily: "var(--font-mono)",
          }}
        >
          {hint}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />
    </div>
  );
}
