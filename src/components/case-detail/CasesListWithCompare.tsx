"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type CaseListItem = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  status: string;
  updated_at: string;
};

const MAX_COMPARE = 4;

export function CasesListWithCompare({ cases }: { cases: CaseListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }

  function compareNow() {
    const ids = Array.from(selected).join(",");
    router.push(`/cases/compare?ids=${ids}`);
  }

  return (
    <>
      {/* sticky bar (선택된 게 1개 이상이면 보임) */}
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky",
            top: 60,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: "var(--color-ink)",
            color: "white",
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 12,
          }}
        >
          <b>{selected.size}개 선택됨</b>
          <span style={{ color: "rgba(255,255,255,.6)", fontSize: 11 }}>
            (최대 {MAX_COMPARE}개)
          </span>
          <button
            type="button"
            onClick={compareNow}
            disabled={selected.size < 2}
            style={{
              marginLeft: "auto",
              padding: "6px 14px",
              background:
                selected.size >= 2 ? "var(--color-accent)" : "rgba(255,255,255,.15)",
              color: "white",
              border: "none",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: selected.size >= 2 ? "pointer" : "not-allowed",
            }}
          >
            {selected.size >= 2 ? "비교하기 →" : "최소 2개 필요"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            style={{
              padding: "6px 10px",
              background: "transparent",
              color: "rgba(255,255,255,.7)",
              border: "1px solid rgba(255,255,255,.3)",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            선택 해제
          </button>
        </div>
      )}

      <div
        style={{
          background: "white",
          border: "1px solid var(--color-g100)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {cases.map((c) => {
          const isSelected = selected.has(c.id);
          const cantSelect = !isSelected && selected.size >= MAX_COMPARE;
          return (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto auto auto",
                gap: 16,
                alignItems: "center",
                padding: "14px 18px",
                borderBottom: "1px solid var(--color-g100)",
                background: isSelected
                  ? "var(--color-accent-soft)"
                  : "white",
                opacity: cantSelect ? 0.4 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={cantSelect}
                onChange={() => toggle(c.id)}
                style={{
                  cursor: cantSelect ? "not-allowed" : "pointer",
                  width: 16,
                  height: 16,
                }}
                title={
                  cantSelect ? `최대 ${MAX_COMPARE}개까지 비교 가능` : ""
                }
              />
              <Link
                href={`/cases/${c.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.brand}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--color-g400)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                  }}
                >
                  {new Date(c.updated_at).toLocaleString("ko-KR")}
                </div>
              </Link>
              <span className="case-tag country">{c.country}</span>
              <span className="case-tag platform">
                {c.channel.toUpperCase()}
              </span>
              <span className={`status-pill ${c.status}`}>{c.status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
