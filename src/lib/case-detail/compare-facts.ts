/**
 * 케이스 비교 페이지 rule-based fact 계산 라이브러리.
 *
 * 입력: 비교 케이스 N개의 key_stats + 메타.
 * 출력: fact 객체 배열 — UI가 카드/차트로 렌더.
 *
 * LLM 호출 없음. 모든 인사이트는 deterministic 코드 계산.
 */

import type {
  Phase2Stats,
  Phase3Stats,
  Phase37Stats,
  Phase4aStats,
  Phase4bClusterStats,
  Phase4bSkuStats,
  Phase5Stats,
} from "@/lib/inngest/types";

export type CompareCaseInput = {
  id: string;
  brand: string;
  country: string;
  channel: string;
  status: string;
  key_stats: KS | null;
};

type KS = {
  phase2?: Phase2Stats;
  phase3?: Phase3Stats;
  phase37?: Phase37Stats;
  phase4a?: Phase4aStats;
  phase4b_clusters?: Phase4bClusterStats;
  phase4b_sku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
  kalodata_creators_xlsx?: Array<{
    handle: string;
    live_gmv_usd?: number | null;
    video_gmv_usd?: number | null;
    revenue_usd?: number | null;
  }>;
};

// =============================================================================
// Mode 감지
// =============================================================================

export type CompareMode =
  | "market" // 같은 brand, 다른 country
  | "brand" // 같은 country, 다른 brand
  | "channel" // 같은 brand, 다른 channel
  | "mixed";

export type CompareModeInfo = {
  mode: CompareMode;
  label: string;
  description: string;
};

export function detectCompareMode(cases: CompareCaseInput[]): CompareModeInfo {
  const brandSet = new Set(cases.map((c) => c.brand));
  const countrySet = new Set(cases.map((c) => c.country));
  const channelSet = new Set(cases.map((c) => c.channel));

  if (brandSet.size === 1 && countrySet.size > 1 && channelSet.size === 1) {
    return {
      mode: "market",
      label: "시장 비교",
      description: `${[...brandSet][0]} · ${cases.length}개 시장 (${[...countrySet].join("/")})`,
    };
  }
  if (countrySet.size === 1 && brandSet.size > 1 && channelSet.size === 1) {
    return {
      mode: "brand",
      label: "브랜드 비교",
      description: `${[...countrySet][0]} · ${[...channelSet][0]} · ${cases.length}개 브랜드`,
    };
  }
  if (brandSet.size === 1 && channelSet.size > 1 && countrySet.size === 1) {
    return {
      mode: "channel",
      label: "채널 비교",
      description: `${[...brandSet][0]} · ${[...countrySet][0]} · ${[...channelSet].join(" vs ")}`,
    };
  }
  return {
    mode: "mixed",
    label: "혼합 비교",
    description: `${cases.length}개 케이스 (브랜드 ${brandSet.size} · 국가 ${countrySet.size} · 채널 ${channelSet.size})`,
  };
}

// =============================================================================
// Fact 타입
// =============================================================================

export type FactValue = {
  caseId: string;
  raw: number | null | undefined;
  display: string;
  /** 0~1 막대 비율 (UI 시각화용) */
  barRatio?: number;
  /** highlight 색상 힌트 */
  tone?: "pos" | "info" | "warn" | "accent" | "neutral";
};

export type CompareFact = {
  id: string;
  title: string;
  category: "sales" | "seeding" | "timing" | "creators" | "content";
  /** "ID는 TH의 3배 매출" 같은 한 줄 요약 */
  headline: string;
  values: FactValue[];
  /** 차트 형식 힌트 */
  visual?: "bar" | "stack" | "sparkline" | "list";
};

// =============================================================================
// Helper
// =============================================================================

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

function maxMinRatio(values: number[]): {
  max: number;
  min: number;
  ratio: number;
  maxIdx: number;
  minIdx: number;
} | null {
  if (values.length < 2) return null;
  let maxIdx = 0;
  let minIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[maxIdx]!) maxIdx = i;
    if (values[i]! < values[minIdx]!) minIdx = i;
  }
  const max = values[maxIdx]!;
  const min = values[minIdx]!;
  const ratio = min > 0 ? max / min : Infinity;
  return { max, min, ratio, maxIdx, minIdx };
}

// =============================================================================
// Fact 함수들
// =============================================================================

function fact_sales(cases: CompareCaseInput[]): CompareFact | null {
  const vals = cases.map(
    (c) => c.key_stats?.phase2?.sales_summary?.total_revenue ?? null,
  );
  if (vals.every((v) => v == null)) return null;
  const valid = vals.map((v) => v ?? 0);
  const max = Math.max(...valid);
  const stats = maxMinRatio(valid);
  let headline = "30일 매출";
  if (stats && stats.ratio > 1.5 && stats.min > 0) {
    headline = `${cases[stats.maxIdx]!.brand} ${cases[stats.maxIdx]!.country}가 ${cases[stats.minIdx]!.brand} ${cases[stats.minIdx]!.country}의 ${stats.ratio.toFixed(1)}배 매출`;
  } else if (stats && stats.ratio <= 1.5) {
    headline = "30일 매출 비슷 (편차 1.5배 이내)";
  }
  return {
    id: "sales_revenue",
    title: "30일 매출",
    category: "sales",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: vals[i],
      display: fmtUsd(vals[i]),
      barRatio: max > 0 ? (valid[i]! / max) : 0,
      tone:
        stats && i === stats.maxIdx
          ? "pos"
          : stats && i === stats.minIdx
            ? "neutral"
            : undefined,
    })),
  };
}

function fact_seeding_volume(cases: CompareCaseInput[]): CompareFact | null {
  const contents = cases.map(
    (c) => c.key_stats?.phase2?.total_contents ?? 0,
  );
  const inflTotal = cases.map(
    (c) => c.key_stats?.phase2?.total_unique_creators ?? 0,
  );
  if (contents.every((v) => v === 0)) return null;
  const max = Math.max(...contents);
  const stats = maxMinRatio(contents);
  let headline = "영상 시딩 양";
  if (stats && stats.ratio > 1.3 && stats.min > 0) {
    headline = `${cases[stats.maxIdx]!.brand} ${cases[stats.maxIdx]!.country}가 시딩 양 ${stats.ratio.toFixed(1)}배`;
  } else if (stats && stats.ratio <= 1.3) {
    headline = "시딩 양 비슷";
  }
  return {
    id: "seeding_volume",
    title: "영상·인플 양",
    category: "seeding",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: contents[i] ?? null,
      display: `${fmtNum(contents[i])} 영상 / ${fmtNum(inflTotal[i])} 인플`,
      barRatio: max > 0 ? (contents[i]! / max) : 0,
      tone:
        stats && i === stats.maxIdx
          ? "info"
          : undefined,
    })),
  };
}

function fact_ad_ratio(cases: CompareCaseInput[]): CompareFact | null {
  const pcts = cases.map((c) => {
    const m = c.key_stats?.phase2?.monthly_video_counts ?? [];
    if (m.length === 0) return null;
    const paid = m.reduce((s, x) => s + x.paid, 0);
    const total = m.reduce((s, x) => s + x.total, 0);
    return total > 0 ? (paid / total) * 100 : null;
  });
  if (pcts.every((v) => v == null)) return null;
  const valid = pcts.map((v) => v ?? 0);
  const max = 100;
  const stats = maxMinRatio(valid);
  let headline = "광고 비중";
  if (stats && stats.max - stats.min > 15) {
    headline = `광고 비중 차이 큼 (${cases[stats.maxIdx]!.country} ${valid[stats.maxIdx]!.toFixed(0)}% vs ${cases[stats.minIdx]!.country} ${valid[stats.minIdx]!.toFixed(0)}%)`;
  } else {
    headline = "광고 비중 비슷";
  }
  return {
    id: "ad_ratio",
    title: "광고 비중 (paid/total)",
    category: "seeding",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: pcts[i],
      display: fmtPct(pcts[i], 0),
      barRatio: (valid[i] ?? 0) / max,
      tone: stats && i === stats.maxIdx ? "warn" : undefined,
    })),
  };
}

function fact_sales_efficiency(
  cases: CompareCaseInput[],
): CompareFact | null {
  const eff = cases.map((c) => {
    const rev = c.key_stats?.phase2?.sales_summary?.total_revenue;
    const contents = c.key_stats?.phase2?.total_contents;
    if (!rev || !contents) return null;
    return rev / contents;
  });
  if (eff.every((v) => v == null)) return null;
  const valid = eff.map((v) => v ?? 0);
  const max = Math.max(...valid);
  const stats = maxMinRatio(valid);
  let headline = "영상당 매출 효율";
  if (stats && stats.ratio > 1.5 && stats.min > 0) {
    headline = `${cases[stats.maxIdx]!.country}가 영상당 효율 ${stats.ratio.toFixed(1)}배 (시딩 효율 우월)`;
  } else if (stats && stats.ratio <= 1.5) {
    headline = "영상당 매출 효율 비슷";
  }
  return {
    id: "sales_efficiency",
    title: "영상당 매출 ($/영상)",
    category: "sales",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: eff[i],
      display: fmtUsd(eff[i]),
      barRatio: max > 0 ? (valid[i]! / max) : 0,
      tone: stats && i === stats.maxIdx ? "pos" : undefined,
    })),
  };
}

function fact_tier_distribution(
  cases: CompareCaseInput[],
): CompareFact | null {
  const dists = cases.map((c) => c.key_stats?.phase3?.tier_distribution);
  if (dists.every((d) => !d)) return null;

  // 메가 max 케이스 찾기
  const megaCounts = cases.map((c, i) =>
    dists[i] ? dists[i]!.mega : 0,
  );
  const stats = maxMinRatio(megaCounts);
  let headline = "티어 분포 (mega/macro/mid/micro/nano/sub-nano)";
  if (stats && stats.max > 0 && stats.max > stats.min) {
    headline = `메가 시딩: ${cases[stats.maxIdx]!.country} ${stats.max}명으로 가장 큼`;
  }
  return {
    id: "tier_distribution",
    title: "티어 분포",
    category: "seeding",
    headline,
    visual: "stack",
    values: cases.map((c, i) => {
      const d = dists[i];
      if (!d) {
        return { caseId: c.id, raw: null, display: "—" };
      }
      const total =
        d.mega + d.macro + d.mid + d.micro + d.nano + d["sub-nano"];
      return {
        caseId: c.id,
        raw: total,
        display: `Mega ${d.mega} · Macro ${d.macro} · Mid ${d.mid} · Micro ${d.micro} · Nano ${d.nano} · Sub-nano ${d["sub-nano"]}`,
      };
    }),
  };
}

function fact_timing(cases: CompareCaseInput[]): CompareFact | null {
  const starts = cases.map((c) => {
    const m = c.key_stats?.phase2?.monthly_video_counts ?? [];
    return m[0]?.month ?? null;
  });
  const ends = cases.map((c) => {
    const m = c.key_stats?.phase2?.monthly_video_counts ?? [];
    return m[m.length - 1]?.month ?? null;
  });
  const lens = cases.map((_, i) => {
    if (!starts[i] || !ends[i]) return 0;
    return monthsBetween(starts[i]!, ends[i]!);
  });
  if (lens.every((l) => l === 0)) return null;
  const stats = maxMinRatio(lens);
  let headline = "운영 기간";
  if (stats && stats.max - stats.min >= 3) {
    headline = `운영 기간 차이: ${cases[stats.maxIdx]!.country} ${stats.max}개월 vs ${cases[stats.minIdx]!.country} ${stats.min}개월`;
  } else if (stats) {
    headline = "운영 기간 비슷";
  }
  const max = Math.max(...lens, 1);
  return {
    id: "timing",
    title: "시작 시점 / 운영 기간",
    category: "timing",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: lens[i],
      display: `${starts[i] ?? "—"} ~ ${ends[i] ?? "—"} (${lens[i] ?? 0}개월)`,
      barRatio: (lens[i] ?? 0) / max,
    })),
  };
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return 0;
  return (by - ay) * 12 + (bm - am) + 1;
}

function fact_live_video_ratio(
  cases: CompareCaseInput[],
): CompareFact | null {
  const ratios = cases.map((c) => {
    const cr = c.key_stats?.kalodata_creators_xlsx ?? [];
    if (cr.length === 0) return null;
    const liveTotal = cr.reduce((s, x) => s + (x.live_gmv_usd ?? 0), 0);
    const videoTotal = cr.reduce((s, x) => s + (x.video_gmv_usd ?? 0), 0);
    const sum = liveTotal + videoTotal;
    if (sum === 0) return null;
    return (liveTotal / sum) * 100;
  });
  if (ratios.every((v) => v == null)) return null;
  const valid = ratios.map((v) => v ?? 0);
  const stats = maxMinRatio(valid);
  let headline = "라이브 vs 영상 GMV 비중";
  if (stats && stats.max - stats.min > 15) {
    headline = `라이브 비중 차이: ${cases[stats.maxIdx]!.country} ${valid[stats.maxIdx]!.toFixed(0)}% vs ${cases[stats.minIdx]!.country} ${valid[stats.minIdx]!.toFixed(0)}%`;
  } else {
    headline = "라이브 비중 비슷";
  }
  return {
    id: "live_video_ratio",
    title: "라이브 GMV 비중 (Kalodata)",
    category: "content",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: ratios[i],
      display:
        ratios[i] == null
          ? "—"
          : `라이브 ${valid[i]!.toFixed(0)}% / 영상 ${(100 - valid[i]!).toFixed(0)}%`,
      barRatio: (valid[i] ?? 0) / 100,
    })),
  };
}

function fact_creator_overlap(
  cases: CompareCaseInput[],
): CompareFact | null {
  // 케이스마다 top_creators handle 집합. overlap 계산.
  if (cases.length < 2) return null;
  const sets = cases.map((c) => {
    const tc = c.key_stats?.phase2?.top_creators ?? [];
    return new Set(tc.map((t) => t.handle ?? "").filter(Boolean));
  });
  if (sets.every((s) => s.size === 0)) return null;

  // 모든 케이스 공통 교집합
  let allIntersect = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    allIntersect = new Set(
      [...allIntersect].filter((x) => sets[i]!.has(x)),
    );
  }
  // 케이스 only (해당 케이스 - 다른 모두)
  const onlyCounts = cases.map((_, i) => {
    const me = sets[i]!;
    const others = new Set<string>();
    for (let j = 0; j < sets.length; j++) {
      if (j === i) continue;
      for (const x of sets[j]!) others.add(x);
    }
    return [...me].filter((x) => !others.has(x)).length;
  });

  let headline = `반복 크리에이터 ${allIntersect.size}명 공통`;
  if (allIntersect.size === 0) {
    headline = "공통 크리에이터 0명 — 시장별 인플 풀 완전 분리";
  } else if (allIntersect.size > 5) {
    headline = `반복 크리에이터 ${allIntersect.size}명 공통 — 같은 인플 풀 활용`;
  }

  const max = Math.max(...sets.map((s) => s.size), 1);
  return {
    id: "creator_overlap",
    title: "반복 크리에이터 (Top 20+)",
    category: "creators",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: sets[i]!.size,
      display: `${sets[i]!.size}명 (전용 ${onlyCounts[i]}명)`,
      barRatio: sets[i]!.size / max,
    })),
  };
}

function fact_hero_concentration(
  cases: CompareCaseInput[],
): CompareFact | null {
  const tops = cases.map(
    (c) => c.key_stats?.phase2?.sales_summary?.top1_revenue_share ?? null,
  );
  const top3s = cases.map(
    (c) => c.key_stats?.phase2?.sales_summary?.top3_revenue_share ?? null,
  );
  if (tops.every((v) => v == null)) return null;
  const valid = tops.map((v) => v ?? 0);
  const stats = maxMinRatio(valid);
  let headline = "Hero SKU 집중도";
  if (stats && stats.max - stats.min > 0.15) {
    headline = `Top 1 SKU 집중도 차이: ${cases[stats.maxIdx]!.country} ${(valid[stats.maxIdx]! * 100).toFixed(0)}% vs ${cases[stats.minIdx]!.country} ${(valid[stats.minIdx]! * 100).toFixed(0)}%`;
  } else {
    headline = "Hero SKU 집중도 비슷";
  }
  return {
    id: "hero_concentration",
    title: "매출 집중도 (Top 1/3)",
    category: "sales",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: tops[i],
      display:
        tops[i] == null
          ? "—"
          : `Top1 ${((tops[i] ?? 0) * 100).toFixed(0)}% · Top3 ${((top3s[i] ?? 0) * 100).toFixed(0)}%`,
      barRatio: (valid[i] ?? 0) / Math.max(1, Math.max(...valid)),
      tone:
        stats && i === stats.maxIdx ? "warn" : undefined,
    })),
  };
}

function fact_monthly_peak(cases: CompareCaseInput[]): CompareFact | null {
  const peaks = cases.map((c) => {
    const m = c.key_stats?.phase2?.monthly_video_counts ?? [];
    if (m.length === 0) return null;
    const peak = [...m].sort((a, b) => b.total - a.total)[0];
    return peak;
  });
  if (peaks.every((p) => !p)) return null;
  const sameMonth = peaks.every((p, i) => i === 0 || p?.month === peaks[0]?.month);
  let headline = "월별 피크 시점";
  if (sameMonth && peaks[0]) {
    headline = `모든 케이스 ${peaks[0].month}에 피크 — 동일 시즌 push`;
  } else {
    headline = "케이스별 피크 시점 다름";
  }
  const maxVal = Math.max(...peaks.map((p) => p?.total ?? 0), 1);
  return {
    id: "monthly_peak",
    title: "월별 영상 피크",
    category: "timing",
    headline,
    visual: "bar",
    values: cases.map((c, i) => ({
      caseId: c.id,
      raw: peaks[i]?.total ?? null,
      display: peaks[i]
        ? `${peaks[i]!.month}: ${peaks[i]!.total}개 영상`
        : "—",
      barRatio: (peaks[i]?.total ?? 0) / maxVal,
    })),
  };
}

// =============================================================================
// 메인 — 모든 fact 계산
// =============================================================================

export function computeCompareFacts(cases: CompareCaseInput[]): {
  mode: CompareModeInfo;
  facts: CompareFact[];
} {
  const mode = detectCompareMode(cases);
  const facts: CompareFact[] = [];

  const candidates: Array<(c: CompareCaseInput[]) => CompareFact | null> = [
    fact_sales,
    fact_sales_efficiency,
    fact_seeding_volume,
    fact_ad_ratio,
    fact_hero_concentration,
    fact_tier_distribution,
    fact_creator_overlap,
    fact_live_video_ratio,
    fact_timing,
    fact_monthly_peak,
  ];

  for (const fn of candidates) {
    const f = fn(cases);
    if (f) facts.push(f);
  }

  return { mode, facts };
}
