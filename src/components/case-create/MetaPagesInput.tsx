"use client";

import { useState, type KeyboardEvent } from "react";

/**
 * Meta 광고 페이지 이름 태그 입력. Enter / 콤마로 추가.
 * Server Action엔 `brand_meta_pages` (콤마 구분 string)으로 전송 → 서버에서 split.
 */
export function MetaPagesInput({
  name = "brand_meta_pages",
  defaultValue = [],
  disabled = false,
}: {
  name?: string;
  defaultValue?: string[];
  disabled?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setDraft("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      const last = tags.at(-1);
      if (last !== undefined) removeTag(last);
    }
  }

  return (
    <>
      <input type="hidden" name={name} value={tags.join(",")} />
      <div
        style={{
          border: "1px solid var(--color-g200)",
          borderRadius: 6,
          padding: 8,
          background: disabled ? "var(--color-g50)" : "white",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          minHeight: 40,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {tags.map((t) => (
          <span
            key={t}
            style={{
              background: "var(--color-g50)",
              padding: "4px 10px 4px 12px",
              borderRadius: 4,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
            }}
          >
            {t}
            <span
              onClick={() => !disabled && removeTag(t)}
              style={{
                cursor: disabled ? "default" : "pointer",
                color: "var(--color-g400)",
                fontSize: 11,
              }}
            >
              ×
            </span>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => addTag(draft)}
          disabled={disabled}
          placeholder={tags.length === 0 ? "페이지 이름 입력 후 Enter" : ""}
          style={{
            border: 0,
            outline: "none",
            flex: 1,
            minWidth: 120,
            fontFamily: "inherit",
            fontSize: 12,
            padding: "4px 6px",
            background: "transparent",
          }}
        />
      </div>
    </>
  );
}
