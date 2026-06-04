"use server";

import { createServer } from "@/lib/supabase/server";
import {
  extractMatchInput,
  type DiagnoseAnswers,
} from "@/lib/diagnose/questionnaire";
import {
  computeDiagnoseMatch,
  type DiagnoseCaseInput,
  type DiagnoseMatchResult,
} from "@/lib/diagnose/match";
import type { Phase2Stats, Phase3Stats } from "@/lib/inngest/types";

type KeyStats = {
  phase2?: Phase2Stats;
  phase3?: Phase3Stats;
};

export async function runDiagnose(
  answers: DiagnoseAnswers,
): Promise<DiagnoseMatchResult> {
  const supabase = await createServer();

  // ready 케이스만 — 매출/시딩 데이터가 채워진 것
  const { data: rows, error } = await supabase
    .from("cases")
    .select("id, country, channel, status, key_stats, brand:brands(name)")
    .eq("status", "ready");

  if (error) {
    throw new Error(`케이스 조회 실패: ${error.message}`);
  }

  const cases: DiagnoseCaseInput[] = (rows ?? []).map((r) => {
    const ks = (r.key_stats ?? {}) as KeyStats;
    const p2 = ks.phase2;
    const p3 = ks.phase3;
    return {
      id: r.id,
      brand:
        (r.brand as unknown as { name: string } | null)?.name ?? "(no brand)",
      country: r.country,
      channel: r.channel,
      rev30dUsd: p2?.sales_summary?.total_revenue ?? null,
      totalContents: p2?.total_contents ?? null,
      totalCreators: p2?.total_unique_creators ?? null,
      monthlyVideoCounts: (p2?.monthly_video_counts ?? []).map((m) => ({
        month: m.month,
        total: m.total,
      })),
      tierDistribution: p3?.tier_distribution ?? null,
      summaryLine: null,
    };
  });

  const input = extractMatchInput(answers);
  return computeDiagnoseMatch(input, cases);
}
