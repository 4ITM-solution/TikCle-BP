"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { runPhase4cPrep, type Phase4cPrepResult } from "@/lib/inngest/aggregators/phase4c-prep";
import type { IgConfig } from "@/lib/inngest/aggregators/phase4c-ig-monitor";

/**
 * Phase 4c-prep server action — seed username 1개로 ig_config 자동 발굴.
 *
 * 흐름:
 *   1. seed username 받음
 *   2. runPhase4cPrep으로 hashtag/mention/regex 자동 발굴
 *   3. 결과를 cases.options.ig_config_suggested에 임시 박음 (사용자 검토용)
 *   4. UI에서 accept → ig_config로 commit
 *
 * 비용: ~$0.10 (post-scraper × 1 username × 100 post)
 */
export async function runIgPrep(
  case_id: string,
  seed_username: string,
): Promise<
  | { ok: true; result: Phase4cPrepResult }
  | { ok: false; error: string }
> {
  const supabase = await createServer();

  const cleaned = seed_username.trim().replace(/^@/, "");
  if (!cleaned) {
    return { ok: false, error: "seed username 비어있음" };
  }

  try {
    const result = await runPhase4cPrep(supabase, case_id, cleaned);

    // 결과를 cases.options.ig_config_suggested에 박음 (검토용)
    const { data: existing } = await supabase
      .from("cases")
      .select("options")
      .eq("id", case_id)
      .single();
    const opts = (existing?.options ?? {}) as Record<string, unknown>;
    opts.ig_config_suggested = result.suggested_config as unknown as Record<
      string,
      unknown
    >;
    opts.ig_prep_debug = result.debug as unknown as Record<string, unknown>;
    opts.ig_prep_at = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("cases")
      .update({ options: opts as never })
      .eq("id", case_id);
    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    revalidatePath(`/cases/${case_id}`);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 자동 발굴된 ig_config_suggested를 cases.ig_config로 commit.
 * 그 다음 사용자가 phase4c 재실행 버튼 누르면 실 동작.
 */
export async function acceptIgConfigSuggested(
  case_id: string,
  edited_config?: IgConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServer();

  const { data: existing } = await supabase
    .from("cases")
    .select("options, ig_config")
    .eq("id", case_id)
    .single();
  const opts = (existing?.options ?? {}) as Record<string, unknown>;
  const suggested = (edited_config ?? opts.ig_config_suggested) as
    | IgConfig
    | undefined;

  if (!suggested) {
    return { ok: false, error: "추천된 config 없음 (먼저 runIgPrep 실행)" };
  }

  const { error } = await supabase
    .from("cases")
    .update({ ig_config: suggested as unknown as never })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
