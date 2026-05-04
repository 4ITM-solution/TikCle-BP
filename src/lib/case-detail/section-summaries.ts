import type {
  LandingType,
  Phase2Stats,
  Phase3Stats,
  Phase37Stats,
  Phase4aStats,
  Phase4bClusterStats,
  Phase4bSampleStats,
  Phase4bSkuStats,
  Phase4bVisionStats,
  Phase5Stats,
  TierBucket,
  TierDistribution,
} from "@/lib/inngest/types";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function summarizeSectionA(phase2: Phase2Stats): string | null {
  const months = phase2.monthly_video_counts;
  if (months.length === 0) return null;
  const totalVideos = phase2.total_contents;
  const totalCreators = phase2.total_unique_creators;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const first = sorted[0]!;
  const peak = months.reduce(
    (max, m) => (m.total > max.total ? m : max),
    sorted[0]!,
  );
  const ratio =
    first.total > 0 ? Math.round((peak.total / first.total) * 10) / 10 : null;
  const totalPaid = months.reduce((a, m) => a + m.paid, 0);
  const promotedPct =
    totalVideos > 0 ? Math.round((totalPaid / totalVideos) * 100) : 0;

  const ratioStr =
    ratio && ratio >= 2
      ? `${first.month} ${first.total}편 → ${peak.month} 피크 ${peak.total}편 (${ratio}×)`
      : `${first.month}~${peak.month} 활동 (피크 ${peak.total}편)`;

  return `전체 ${totalVideos.toLocaleString()}건 · 작성자 ${totalCreators.toLocaleString()}명 · ${ratioStr}. PROMOTED ${promotedPct}%.`;
}

export function summarizeSectionB(
  phase2: Phase2Stats,
  phase3?: Phase3Stats,
  phase37?: Phase37Stats,
): string | null {
  const repeatN = phase2.top_creators.length;
  const outlierN = phase2.outlier_creators?.length ?? 0;
  if (!phase3) {
    return `반복 작성자 ${repeatN}명${outlierN > 0 ? ` · 단발 viral outlier ${outlierN}명` : ""}.`;
  }
  const dist = phase3.tier_distribution;
  const topTiers: TierBucket[] = ["mega", "macro", "mid"];
  const topSum = topTiers.reduce((a, t) => a + (dist[t] ?? 0), 0);
  const matched = phase3.total_with_fans;
  const matchPct =
    phase3.total_creators > 0
      ? Math.round((matched / phase3.total_creators) * 100)
      : 0;

  const shopBit = phase37
    ? phase37.total_shop_creators > 0
      ? ` · TikTok Shop creator ${phase37.total_shop_creators}/${phase37.total_attempted}명`
      : ""
    : "";

  return `인플 ${phase3.total_creators}명 · fans 매칭 ${matched}(${matchPct}%) · 상위 tier(mega+macro+mid) ${topSum}명 · 반복작성자 ${repeatN}명${outlierN > 0 ? ` + outlier ${outlierN}명` : ""}${shopBit}.`;
}

export function summarizeSectionC(
  sample?: Phase4bSampleStats,
  vision?: Phase4bVisionStats,
  clusters?: Phase4bClusterStats,
  phase5?: Phase5Stats,
  sku?: Phase4bSkuStats,
): string | null {
  if (!sample) return null;
  const visionStr = vision
    ? `${vision.total_with_tags}/${vision.total_attempted}`
    : "0";
  const clusterN = clusters?.meta_clusters.length ?? 0;
  const top = clusterN > 0 ? clusters!.meta_clusters[0]! : null;
  const langTop = phase5?.languages?.[0];
  const skuMatchPct =
    sku && sku.total_displayed > 0
      ? Math.round((sku.total_matched / sku.total_displayed) * 100)
      : null;

  return [
    `샘플 ${sample.total_picked}편`,
    `Vision ${visionStr} 태깅`,
    clusterN > 0
      ? `메타 클러스터 ${clusterN}개 (1위 "${top!.name}" ${top!.member_count}편)`
      : "클러스터 0",
    skuMatchPct != null ? `SKU 매칭 ${skuMatchPct}%` : null,
    langTop ? `1위 언어 ${langTop.label} ${Math.round(langTop.pct)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ") + ".";
}

export function summarizeSectionD(phase2: Phase2Stats): string | null {
  const s = phase2.sales_summary;
  if (!s) return null;
  const top1Pct = Math.round(s.top1_revenue_share * 100);
  const top3Pct = Math.round(s.top3_revenue_share * 100);
  const heroSku = phase2.sku_sales[0];
  return `${fmtMoney(s.total_revenue)} · ${s.total_units.toLocaleString()} units · ${s.sku_count} SKU · Top1 ${top1Pct}%${heroSku ? ` (${heroSku.asin})` : ""} · Top3 ${top3Pct}%.`;
}

const LANDING_LABEL: Record<LandingType, string> = {
  dtc: "DTC",
  amazon: "Amazon",
  instagram: "Instagram",
  tiktok_shop: "TikTok Shop",
  facebook: "Facebook",
  other: "기타",
  none: "랜딩 없음",
};

export function summarizeSectionE(phase4a: Phase4aStats): string | null {
  const total = phase4a.total_ads;
  if (total === 0) return null;
  const officialPct = Math.round((phase4a.brand_official_ads / total) * 100);
  const activePct =
    total > 0 ? Math.round((phase4a.active_ads / total) * 100) : 0;

  // 본사 광고만 기준으로 landing 분포 — 전체 분포는 유통/인플 노이즈
  const top3Landings = (Object.entries(phase4a.landings) as [LandingType, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, c]) => `${LANDING_LABEL[k]} ${Math.round((c / total) * 100)}%`)
    .join(" / ");

  return `광고 ${total.toLocaleString()}건 · 본사 ${officialPct}% · active ${activePct}%${top3Landings ? ` · ${top3Landings}` : ""}.`;
}

const TIER_LABEL: Record<TierBucket, string> = {
  mega: "Mega",
  macro: "Macro",
  mid: "Mid",
  micro: "Micro",
  nano: "Nano",
  "sub-nano": "Sub-nano",
  unknown: "미상",
};

/**
 * 다른 곳에서도 쓸 수 있는 tier 분포 요약 (예: KPI strip).
 * 사용 안 하면 dead code 될 수 있어 export만 일단.
 */
export function topTierLabel(dist: TierDistribution): string {
  const entries = Object.entries(dist) as [TierBucket, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries.find(([t, c]) => t !== "unknown" && c > 0);
  if (!top) return "—";
  return `${TIER_LABEL[top[0]]} ${top[1]}명`;
}
