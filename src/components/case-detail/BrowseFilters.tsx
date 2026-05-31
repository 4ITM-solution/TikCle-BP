"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  COUNTRY_OPTIONS,
  isRegionCode,
} from "@/lib/case-detail/countries";
import { REVENUE_TIERS } from "@/lib/case-detail/revenue-tiers";

// 케이스 생성 form (src/app/cases/new/page.tsx)과 동일 구조
const COUNTRY_GROUPS: { label: string | null; codes: string[] }[] = [
  { label: null, codes: ["US", "KR", "JP", "EU"] },
  { label: "권역 통합 case (Hybrid)", codes: ["MENA", "LATAM"] },
  { label: "동남아 SEA (국가별)", codes: ["SG", "TH", "MY", "ID", "PH", "VN"] },
  { label: "MENA 안 단일 분석", codes: ["SA", "AE"] },
  {
    label: "LATAM 안 단일 분석",
    codes: ["MX", "AR", "CO", "CL", "PE", "BR"],
  },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "amazon", label: "Amazon" },
  { value: "tiktok_shop", label: "TikTok Shop" },
];

export function BrowseFilters({
  selectedRegion,
  selectedChannel,
  selectedTier,
  selectedQ,
}: {
  selectedRegion: string;
  selectedChannel: string;
  selectedTier: string;
  selectedQ?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: "region" | "channel" | "tier" | "q", value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set(key, value);
      else sp.delete(key);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("region");
    sp.delete("channel");
    sp.delete("tier");
    sp.delete("q");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  const hasAny = !!(selectedRegion || selectedChannel || selectedTier || selectedQ);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
        padding: "12px 14px",
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 8,
      }}
    >
      {/* brand 명 검색 */}
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--color-g600)",
        }}
      >
        🔍
        <input
          type="search"
          placeholder="brand 명 검색"
          defaultValue={selectedQ ?? ""}
          onChange={(e) => setParam("q", e.target.value.trim())}
          style={{
            padding: "5px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 6,
            fontSize: 12,
            minWidth: 180,
          }}
        />
      </label>

      <FilterSelect
        label="국가"
        value={selectedRegion}
        onChange={(v) => setParam("region", v)}
      >
        <option value="">전체</option>
        {COUNTRY_GROUPS.map((g, gi) =>
          g.label === null ? (
            g.codes.map((code) => {
              const o = COUNTRY_OPTIONS.find((c) => c.code === code);
              if (!o) return null;
              return (
                <option key={code} value={code}>
                  {o.flag} {o.code} ({o.label})
                </option>
              );
            })
          ) : (
            <optgroup key={gi} label={g.label}>
              {g.codes.map((code) => {
                const o = COUNTRY_OPTIONS.find((c) => c.code === code);
                if (!o) return null;
                return (
                  <option key={code} value={code}>
                    {o.flag} {o.code} ({o.label})
                  </option>
                );
              })}
            </optgroup>
          ),
        )}
      </FilterSelect>

      <FilterSelect
        label="플랫폼"
        value={selectedChannel}
        onChange={(v) => setParam("channel", v)}
      >
        <option value="">전체</option>
        {CHANNEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="티어"
        value={selectedTier}
        onChange={(v) => setParam("tier", v)}
      >
        <option value="">전체</option>
        {REVENUE_TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </FilterSelect>

      {hasAny && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--color-info)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          모든 필터 해제
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--color-g500)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12,
          fontFamily: "inherit",
          padding: "5px 10px",
          border: "1px solid var(--color-g200)",
          borderRadius: 4,
          background: "white",
          color: "var(--color-ink)",
          cursor: "pointer",
          minWidth: 140,
        }}
      >
        {children}
      </select>
    </label>
  );
}

// 사용 안 하지만 import 유지 — UI 라벨 추가 시 재사용 여지
void isRegionCode;
