"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

type FilterOption = { value: string; label: string; count: number };

export function BrowseFilters({
  regions,
  channels,
  tiers,
  selectedRegions,
  selectedChannels,
  selectedTiers,
}: {
  regions: FilterOption[];
  channels: FilterOption[];
  tiers: FilterOption[];
  selectedRegions: string[];
  selectedChannels: string[];
  selectedTiers: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = useCallback(
    (key: "region" | "channel" | "tier", value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      const current = (sp.get(key) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length > 0) sp.set(key, next.join(","));
      else sp.delete(key);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("region");
    sp.delete("channel");
    sp.delete("tier");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  const hasAny =
    selectedRegions.length > 0 ||
    selectedChannels.length > 0 ||
    selectedTiers.length > 0;

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-g100)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <FilterRow
        label="권역"
        options={regions}
        selected={selectedRegions}
        onToggle={(v) => toggle("region", v)}
      />
      <FilterRow
        label="판매 플랫폼"
        options={channels}
        selected={selectedChannels}
        onToggle={(v) => toggle("channel", v)}
      />
      <FilterRow
        label="매출 티어"
        options={tiers}
        selected={selectedTiers}
        onToggle={(v) => toggle("tier", v)}
        emptyHint="아직 태그 단 케이스 없음 — case detail에서 박을 수 있어요"
      />
      {hasAny && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 6,
          }}
        >
          <button
            type="button"
            onClick={clearAll}
            style={{
              fontSize: 11,
              color: "var(--color-info)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              padding: "4px 8px",
            }}
          >
            모든 필터 해제
          </button>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  selected,
  onToggle,
  emptyHint,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (v: string) => void;
  emptyHint?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        gap: 12,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid var(--color-g50)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--color-g500)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.length === 0 ? (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {emptyHint ?? "(없음)"}
          </span>
        ) : (
          options.map((o) => {
            const isOn = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle(o.value)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 14,
                  border: isOn
                    ? "1px solid var(--color-ink)"
                    : "1px solid var(--color-g200)",
                  background: isOn ? "var(--color-ink)" : "white",
                  color: isOn ? "white" : "var(--color-g600)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 80ms",
                }}
              >
                {o.label}
                <span
                  style={{
                    fontSize: 10,
                    color: isOn
                      ? "rgba(255,255,255,.7)"
                      : "var(--color-g400)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {o.count}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
