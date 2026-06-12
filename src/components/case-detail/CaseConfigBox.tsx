"use client";

import { useState, useTransition } from "react";
import { updateCaseConfig } from "@/app/cases/[id]/upload-actions";

/**
 * CaseConfigBox — 채널 카드 안에서 케이스 설정을 입력/저장.
 * 구 new-case 폼의 채널별 설정(스토어 URL·키워드·Meta 페이지·IG/YT seed)을 카드로 이관.
 */
export type ConfigField = {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  help?: string;
};

export function CaseConfigBox({
  case_id,
  title,
  fields,
}: {
  case_id: string;
  title: string;
  fields: ConfigField[];
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          const r = await updateCaseConfig(case_id, fd);
          setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
        });
      }}
      style={{
        marginBottom: 12,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {fields.map((f) => (
        <div key={f.name} style={{ marginBottom: 8 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#6b7280",
              marginBottom: 3,
            }}
          >
            {f.label}
          </label>
          <input
            name={f.name}
            defaultValue={f.defaultValue ?? ""}
            placeholder={f.placeholder ?? ""}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              boxSizing: "border-box",
            }}
          />
          {f.help && (
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
              {f.help}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "5px 14px",
            fontSize: 12,
            border: "none",
            borderRadius: 4,
            background: pending ? "#9ca3af" : "#1f2937",
            color: "white",
            cursor: pending ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {pending ? "저장 중…" : "설정 저장"}
        </button>
        {msg && (
          <span
            style={{ fontSize: 11, color: msg.ok ? "#10b981" : "#ef4444" }}
          >
            {msg.ok ? "✓ " : "✕ "}
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
