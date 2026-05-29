import { DevTestActions } from "./RunningPlaceholder";
import type { CostEstimate } from "@/lib/cost-estimate";

/**
 * CaseDevFooter — 페이지 맨 아래 접힌 dev 액션 footer.
 *
 * 평소엔 접혀있고 (펼치기 클릭 시 노출). 기존 DevTestActions를 그대로 wrapping.
 */
export function CaseDevFooter({
  case_id,
  status,
  costEstimate,
}: {
  case_id: string;
  status: string;
  costEstimate: CostEstimate;
}) {
  return (
    <details
      style={{
        marginTop: 32,
        padding: "14px 22px",
        background: "var(--color-g25)",
        borderRadius: 8,
        fontSize: 11,
        color: "var(--color-g500)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 700,
          color: "var(--color-g600)",
        }}
      >
        ⚙️ DEV / QA 액션 (펼치기) — 평소엔 사용 안 함
      </summary>
      <div style={{ marginTop: 12 }}>
        <DevTestActions
          case_id={case_id}
          status={status}
          costEstimate={costEstimate}
        />
      </div>
    </details>
  );
}
