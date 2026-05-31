"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tierLabel } from "@/lib/case-detail/revenue-tiers";

export type CaseListItem = {
  id: string;
  brand: string;
  brand_id: string | null;
  country: string;
  channel: string;
  status: string;
  revenue_tier: string | null;
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
                gridTemplateColumns: "32px 1fr auto auto auto auto",
                gap: 12,
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
              <div>
                {c.brand_id ? (
                  <Link
                    href={`/brands/${c.brand_id}`}
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                    title={`${c.brand} 브랜드 페이지`}
                  >
                    {c.brand}
                  </Link>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {c.brand}
                  </span>
                )}
                <Link
                  href={`/cases/${c.id}`}
                  style={{
                    display: "block",
                    fontSize: 10,
                    color: "var(--color-g400)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 2,
                    textDecoration: "none",
                  }}
                >
                  {c.country} · {new Date(c.updated_at).toLocaleString("ko-KR")} → 케이스
                  열기
                </Link>
              </div>
              <span className="case-tag country">{c.country}</span>
              {c.revenue_tier ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 9,
                    background: "var(--color-info-soft)",
                    color: "var(--color-info)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {tierLabel(c.revenue_tier)}
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--color-g300)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  —
                </span>
              )}
              <span className={`status-pill ${c.status}`}>{c.status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
