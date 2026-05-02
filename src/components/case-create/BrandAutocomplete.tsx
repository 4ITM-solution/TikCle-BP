"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Suggestion = {
  id: string;
  name: string;
  case_count: number;
};

/**
 * 브랜드명 자동완성. 기존 brands 검색 + 신규 입력 옵션 제공.
 *
 * Server Action에 `brand_name` (text) 만 보냄. 기존 ID 매칭은 서버에서 다시 함
 * (사용자가 자동완성을 거치지 않고 같은 이름 입력해도 정상 동작).
 */
export function BrandAutocomplete({
  name = "brand_name",
  defaultValue = "",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside click closes dropdown
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    const supabase = createClient();
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, cases:cases(count)")
        .ilike("name", `%${value.trim()}%`)
        .limit(8);

      if (error) return;

      const list: Suggestion[] = (data ?? []).map((b) => {
        const cases = b.cases as unknown as Array<{ count: number }> | null;
        return {
          id: b.id,
          name: b.name,
          case_count: cases?.[0]?.count ?? 0,
        };
      });
      setSuggestions(list);
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  const exactMatch = suggestions.find(
    (s) => s.name.toLowerCase() === value.trim().toLowerCase(),
  );

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="field-input"
        name={name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="브랜드명 입력"
        autoComplete="off"
      />

      {open && (suggestions.length > 0 || value.trim()) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid var(--color-g200)",
            borderRadius: 6,
            boxShadow: "0 6px 16px rgba(0,0,0,.06)",
            zIndex: 5,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {suggestions.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setValue(s.name);
                setOpen(false);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                cursor: "pointer",
                borderBottom: "1px solid var(--color-g50)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--color-g25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "white")
              }
            >
              <span>{s.name}</span>
              <span
                className="font-mono"
                style={{ fontSize: 10, color: "var(--color-g400)" }}
              >
                기존 · {s.case_count}개 케이스
              </span>
            </div>
          ))}

          {value.trim() && !exactMatch && (
            <div
              onClick={() => setOpen(false)}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--color-g25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "white")
              }
            >
              <span>+ 새 브랜드 &quot;{value.trim()}&quot;</span>
              <span
                style={{
                  color: "var(--color-accent)",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                NEW
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
