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
    <div className="bp-mockup">
      <details className="footer-dev" id="sec-dev">
        <summary>⚙️ DEV / QA 액션 (펼치기)</summary>
        <div style={{ marginTop: 10 }}>
          <DevTestActions
            case_id={case_id}
            status={status}
            costEstimate={costEstimate}
          />
        </div>
      </details>
    </div>
  );
}
