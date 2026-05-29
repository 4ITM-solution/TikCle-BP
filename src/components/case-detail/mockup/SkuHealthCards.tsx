import type { Phase2Stats } from "@/lib/inngest/types";

/**
 * SkuHealthCards — mockup line 1063-1095 1:1.
 *
 * SKU 헬스 KPI 3 card (.sku-health-grid):
 *   - 매출 집중도 (Top 3 누적 % + Pareto bar 3 segments)
 *   - 카테고리 수 + 분포 text
 *   - 신상 매출 비중 (출시 1년 내) + 3 dot (신상/1-3년/3년+)
 *
 * .bp-mockup wrapper 안에서 mockup class 그대로 사용.
 *
 * 데이터:
 *   - phase2.sales_summary.top3_revenue_share (집중도)
 *   - phase2.sku_sales (카테고리 분포 — sku.category)
 *   - phase2.sku_sales (신상 비중 — sku.launch_date 기준)
 */

const NEW_DAYS = 365;
const MID_DAYS = 365 * 3;

export function SkuHealthCards({
  phase2,
  selectedSku = "all",
}: {
  phase2: Phase2Stats;
  selectedSku?: string; // "all" 또는 asin
}) {
  if (!phase2.sales_summary || !phase2.sku_sales || phase2.sku_sales.length === 0) {
    return null;
  }

  const isSingleSelected = selectedSku !== "all";
  const skus = isSingleSelected
    ? phase2.sku_sales.filter((s) => s.asin === selectedSku)
    : phase2.sku_sales;

  if (skus.length === 0) return null;

  const totalRev = skus.reduce((s, x) => s + (x.revenue ?? 0), 0);

  // ─── 1. 매출 집중도 ───
  // SKU 선택 시: Top1=선택 SKU 자체 = 100% (자기 한 SKU 안 집중도 의미 약함 — 비중만)
  // 전체 시: phase2.sales_summary 의 top1/top3 share 사용 (정확)
  const summary = phase2.sales_summary;
  const fullTotal = phase2.sku_sales.reduce((s, x) => s + (x.revenue ?? 0), 0);
  const selectedShare =
    isSingleSelected && fullTotal > 0
      ? Math.round((totalRev / fullTotal) * 100)
      : 0;

  const top3Pct = isSingleSelected
    ? selectedShare
    : Math.round((summary.top3_revenue_share ?? 0) * 100);
  const top1Pct = isSingleSelected
    ? selectedShare
    : Math.round((summary.top1_revenue_share ?? 0) * 100);
  const sortedAll = [...phase2.sku_sales].sort(
    (a, b) => (b.revenue ?? 0) - (a.revenue ?? 0),
  );
  const top2Pct = isSingleSelected
    ? 0
    : fullTotal > 0
      ? Math.round(((sortedAll[1]?.revenue ?? 0) / fullTotal) * 100)
      : 0;
  const top3OnlyPct = isSingleSelected ? 0 : Math.max(0, top3Pct - top1Pct - top2Pct);
  const restPct = Math.max(0, 100 - top3Pct);

  // ─── 2. 카테고리 ───
  const catMap = new Map<string, number>();
  for (const s of skus) {
    const cat = (s as { category?: string | null }).category ?? "미상";
    catMap.set(cat, (catMap.get(cat) ?? 0) + (s.revenue ?? 0));
  }
  const cats = [...catMap.entries()]
    .map(([c, r]) => ({ cat: c, rev: r, pct: totalRev > 0 ? Math.round((r / totalRev) * 100) : 0 }))
    .sort((a, b) => b.rev - a.rev);
  const catDistStr = cats
    .slice(0, 5)
    .map((c) => `${c.cat} ${c.pct}%`)
    .join(" · ");
  const catCount = cats.length;
  const isCatDiverse = catCount >= 3;

  // ─── 3. 신상 매출 비중 (launch_date 기준 1년 이내) ───
  const now = Date.now();
  let newRev = 0;
  let midRev = 0;
  let oldRev = 0;
  let newCount = 0;
  for (const s of skus) {
    const launch = (s as { launch_date?: string | null }).launch_date;
    const rev = s.revenue ?? 0;
    if (!launch) {
      oldRev += rev;
      continue;
    }
    const ageMs = now - new Date(launch).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= NEW_DAYS) {
      newRev += rev;
      newCount += 1;
    } else if (ageDays <= MID_DAYS) midRev += rev;
    else oldRev += rev;
  }
  const newPct = totalRev > 0 ? Math.round((newRev / totalRev) * 100) : 0;
  const midPct = totalRev > 0 ? Math.round((midRev / totalRev) * 100) : 0;
  const oldPct = totalRev > 0 ? Math.round((oldRev / totalRev) * 100) : 0;

  const selectedSkuName = isSingleSelected
    ? phase2.sku_sales.find((s) => s.asin === selectedSku)?.name ?? selectedSku
    : null;

  return (
    <div>
      {selectedSkuName && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 11,
            color: "#92400e",
            background: "#fef3c7",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #fde68a",
          }}
        >
          🎯 <b>{selectedSkuName}</b> 선택 — 매출 ${totalRev.toLocaleString()} · 전체의 {selectedShare}%
        </div>
      )}
      <div className="sku-health-grid">
      {/* 1. 매출 집중도 */}
      <div className="sku-health-card">
        <div className="sh-label">{isSingleSelected ? "선택 SKU 비중" : "매출 집중도"}</div>
        <div className="sh-val">{top3Pct}%</div>
        <div className="sh-desc">
          {isSingleSelected
            ? `이 SKU가 전체 매출 중`
            : `Top 3 SKU가 매출 합계 차지`}
        </div>
        <div className="sh-bar">
          {top1Pct > 0 && (
            <div className="sh-segment" style={{ background: "#3b82f6", flex: top1Pct }}>
              Top1 {top1Pct}%
            </div>
          )}
          {top2Pct > 0 && (
            <div className="sh-segment" style={{ background: "#60a5fa", flex: top2Pct }}>
              Top2 {top2Pct}%
            </div>
          )}
          {top3OnlyPct > 0 && (
            <div className="sh-segment" style={{ background: "#93c5fd", flex: top3OnlyPct }}>
              Top3 {top3OnlyPct}%
            </div>
          )}
          {restPct > 0 && (
            <div style={{ fontSize: 9, color: "#9ca3af", marginLeft: 6 }}>
              기타 {restPct}%
            </div>
          )}
        </div>
        <div className="sh-foot">
          {top3Pct >= 70
            ? "★ 집중 → 2-3 SKU 마케팅 주력"
            : "분산 → SKU 다양"}
        </div>
      </div>

      {/* 2. 카테고리 */}
      <div className="sku-health-card">
        <div className="sh-label">카테고리</div>
        <div className="sh-val">{catCount}개</div>
        <div className="sh-desc">
          {skus.length} SKU {catCount} 카테고리
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: "#4b5563" }}>
          {catDistStr || "—"}
        </div>
        <div className="sh-foot">
          {isCatDiverse ? "카테고리 다양 (전반)" : "단일 카테고리"}
        </div>
      </div>

      {/* 3. 신상 매출 비중 */}
      <div className="sku-health-card">
        <div className="sh-label">신상 매출 비중</div>
        <div className="sh-val">{newPct}%</div>
        <div className="sh-desc">출시 1년 내 SKU {newCount}개</div>
        <div style={{ marginTop: 10, fontSize: 10, color: "#4b5563" }}>
          <span style={{ color: "#10b981" }}>●신상 {newPct}%</span>{" "}
          · <span style={{ color: "#f59e0b" }}>1~3년 {midPct}%</span>{" "}
          · <span style={{ color: "#9ca3af" }}>3년+ {oldPct}%</span>
        </div>
        <div className="sh-foot">
          {newPct >= 50
            ? "신상 위주 매출 (launch 폭발형)"
            : newPct >= 20
              ? "신상 + 레거시 균형"
              : "레거시 위주 매출"}
        </div>
      </div>
      </div>
    </div>
  );
}
