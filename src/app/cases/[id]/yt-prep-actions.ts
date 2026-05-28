"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { runPhase4dPrep, type Phase4dPrepResult } from "@/lib/inngest/aggregators/phase4d-prep";
import {
  runPhase4dPostlearn,
  type Phase4dPostlearnResult,
} from "@/lib/inngest/aggregators/phase4d-postlearn";
import type { YtConfig } from "@/lib/inngest/aggregators/phase4d-yt-monitor";

export async function runYtPrep(
  case_id: string,
  seed_channel_url: string,
): Promise<
  | { ok: true; result: Phase4dPrepResult }
  | { ok: false; error: string }
> {
  const supabase = await createServer();
  const cleaned = seed_channel_url.trim();
  if (!cleaned) return { ok: false, error: "seed channel URL 비어있음" };

  try {
    const result = await runPhase4dPrep(supabase, case_id, cleaned);

    const { data: existing } = await supabase
      .from("cases")
      .select("options")
      .eq("id", case_id)
      .single();
    const opts = (existing?.options ?? {}) as Record<string, unknown>;
    opts.yt_config_suggested = result.suggested_config as unknown as Record<
      string,
      unknown
    >;
    opts.yt_prep_debug = result.debug as unknown as Record<string, unknown>;
    opts.yt_prep_at = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("cases")
      .update({ options: opts as never })
      .eq("id", case_id);
    if (upErr) return { ok: false, error: upErr.message };

    revalidatePath(`/cases/${case_id}`);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function acceptYtConfigSuggested(
  case_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServer();
  const { data: existing } = await supabase
    .from("cases")
    .select("options")
    .eq("id", case_id)
    .single();
  const opts = (existing?.options ?? {}) as Record<string, unknown>;
  const suggested = opts.yt_config_suggested as YtConfig | undefined;
  if (!suggested) {
    return { ok: false, error: "yt_config_suggested 없음" };
  }
  const { error } = await supabase
    .from("cases")
    .update({ yt_config: suggested as unknown as never })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

export async function runYtPostlearn(
  case_id: string,
): Promise<
  | { ok: true; result: Phase4dPostlearnResult }
  | { ok: false; error: string }
> {
  const supabase = await createServer();
  try {
    const result = await runPhase4dPostlearn(supabase, case_id);
    const { data: existing } = await supabase
      .from("cases")
      .select("options")
      .eq("id", case_id)
      .single();
    const opts = (existing?.options ?? {}) as Record<string, unknown>;
    opts.yt_config_learned = result.learned_config as unknown as Record<
      string,
      unknown
    >;
    opts.yt_postlearn_diff = result.diff as unknown as Record<string, unknown>;
    opts.yt_postlearn_debug = result.debug as unknown as Record<string, unknown>;
    opts.yt_postlearn_at = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("cases")
      .update({ options: opts as never })
      .eq("id", case_id);
    if (upErr) return { ok: false, error: upErr.message };
    revalidatePath(`/cases/${case_id}`);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function acceptYtConfigLearned(
  case_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServer();
  const { data: existing } = await supabase
    .from("cases")
    .select("options")
    .eq("id", case_id)
    .single();
  const opts = (existing?.options ?? {}) as Record<string, unknown>;
  const learned = opts.yt_config_learned as YtConfig | undefined;
  if (!learned) return { ok: false, error: "yt_config_learned 없음" };
  const { error } = await supabase
    .from("cases")
    .update({ yt_config: learned as unknown as never })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}
