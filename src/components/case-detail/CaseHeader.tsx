import { DeleteCaseButton } from "./DeleteCaseButton";
import { RevenueTierPicker } from "./RevenueTierPicker";
import { RegionScopeToggle } from "./RegionScopeToggle";
import type { RegionScope } from "@/lib/case-detail/region-filter";

/**
 * CaseHeader — 케이스 메타 헤더 (브랜드 큰 이름 + status pills + 액션).
 *
 * sticky strip 아래, KpiStrip 위에 박힘.
 * 기존 헤더가 여러 곳에 흩어져 있던 거 (DeleteCaseButton · RevenueTierPicker ·
 * RegionScopeToggle 등) 를 한 카드에 모음.
 */
export function CaseHeader({
  case_id,
  brand,
  country,
  channel,
  status,
  revenueTier,
  regionScope,
}: {
  case_id: string;
  brand: string;
  country: string;
  channel: string;
  status: string;
  revenueTier: string | null;
  regionScope: RegionScope;
}) {
  const statusColor =
    status === "ready"
      ? { bg: "var(--color-pos-soft)", fg: "var(--color-pos)" }
      : status === "running"
        ? { bg: "var(--color-warn-soft)", fg: "var(--color-warn)" }
        : { bg: "var(--color-g50)", fg: "var(--color-g500)" };

  return (
    <div
      className="section-card"
      style={{
        padding: "16px 22px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800 }}>{brand}</div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Pill bg={statusColor.bg} fg={statusColor.fg}>
          {status}
        </Pill>
        <Pill>🌍 {country}</Pill>
        <Pill>{channel}</Pill>
        {revenueTier && <Pill>💰 매출 tier {revenueTier}</Pill>}
      </div>

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <RevenueTierPicker case_id={case_id} current={revenueTier} />
        <RegionScopeToggle case_id={case_id} currentScope={regionScope} />
        <DeleteCaseButton case_id={case_id} brand_label={brand} />
      </div>
    </div>
  );
}

function Pill({
  children,
  bg = "var(--color-g50)",
  fg = "var(--color-g600)",
}: {
  children: React.ReactNode;
  bg?: string;
  fg?: string;
}) {
  return (
    <span
      style={{
        background: bg,
        color: fg,
        padding: "3px 9px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
