"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import { isRevenueTier } from "@/lib/case-detail/revenue-tiers";

export async function updateRevenueTier(
  case_id: string,
  tier: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (tier !== null && !isRevenueTier(tier)) {
    return { ok: false, error: `Unknown tier: ${tier}` };
  }
  const supabase = await createServer();
  const { error } = await supabase
    .from("cases")
    .update({ revenue_tier: tier })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cases");
  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

/**
 * 같은 brand+country 인 두 옛 case 를 합침 (A 모델 마이그레이션).
 *
 * source 의 모든 case_id 박힌 데이터를 target 으로 옮기고 source case 삭제.
 * Unique 충돌:
 *   - products(case_id,country,asin): source 의 충돌 row 삭제 (target 우선)
 *
 * case_id 박힌 17 테이블: products, case_product_sales, case_rejections,
 *   case_video_analyses, case_video_assets, content_clusters, ig_authors,
 *   ig_posts, ig_runs, meta_ads, pipeline_runs, promotion_events,
 *   viral_bsr_impacts, viral_clusters, yt_channels, yt_runs, yt_videos.
 */
export async function mergeCases(
  sourceId: string,
  targetId: string,
): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  if (sourceId === targetId) {
    return { ok: false, error: "source == target — 합칠 수 없음" };
  }
  const supabase = await createServer();

  // 사전 검증: 두 case 가 동일 brand+country 인지 확인
  const { data: pair, error: fetchErr } = await supabase
    .from("cases")
    .select("id, brand_id, country, status, channel")
    .in("id", [sourceId, targetId]);
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!pair || pair.length !== 2) {
    return { ok: false, error: "두 case 모두 찾을 수 없음" };
  }
  const src = pair.find((c) => c.id === sourceId);
  const tgt = pair.find((c) => c.id === targetId);
  if (!src || !tgt) return { ok: false, error: "source/target id 매칭 실패" };
  if (src.brand_id !== tgt.brand_id || src.country !== tgt.country) {
    return {
      ok: false,
      error: `brand+country 불일치 — source(${src.brand_id}/${src.country}) vs target(${tgt.brand_id}/${tgt.country})`,
    };
  }

  // 1) products 충돌 해소 — source 의 같은 country+asin row 삭제
  // RPC 함수는 generated types 에 없어서 cast 로 우회.
  const { error: delErr } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>)("merge_cases_clear_products", {
    p_source: sourceId,
    p_target: targetId,
  });
  if (delErr) return { ok: false, error: `products 충돌 정리 실패: ${delErr.message}` };

  // 2) 17 테이블 case_id UPDATE
  const tables = [
    "products",
    "case_product_sales",
    "case_rejections",
    "case_video_analyses",
    "case_video_assets",
    "content_clusters",
    "ig_authors",
    "ig_posts",
    "ig_runs",
    "meta_ads",
    "pipeline_runs",
    "promotion_events",
    "viral_bsr_impacts",
    "viral_clusters",
    "yt_channels",
    "yt_runs",
    "yt_videos",
  ];
  const reasons: string[] = [];
  // table 이름은 generated types union 에서 derive 되지 않으므로 cast 로 우회.
  const sb = supabase as unknown as {
    from: (t: string) => {
      update: (
        v: Record<string, unknown>,
        opts?: { count?: "exact" },
      ) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{ error: { message: string } | null; count: number | null }>;
      };
    };
  };
  for (const t of tables) {
    const { error: upErr, count } = await sb
      .from(t)
      .update({ case_id: targetId }, { count: "exact" })
      .eq("case_id", sourceId);
    if (upErr) {
      return {
        ok: false,
        error: `${t} 합치기 실패: ${upErr.message} (이미 진행: ${reasons.join(", ")})`,
      };
    }
    if ((count ?? 0) > 0) reasons.push(`${t}=${count}`);
  }

  // 3) source case 삭제
  const { error: delCaseErr } = await supabase
    .from("cases")
    .delete()
    .eq("id", sourceId);
  if (delCaseErr) {
    return {
      ok: false,
      error: `source case 삭제 실패: ${delCaseErr.message} (데이터는 이미 옮겨짐)`,
    };
  }

  revalidatePath("/cases");
  revalidatePath(`/cases/${targetId}`);
  return {
    ok: true,
    message: `source case ${sourceId.slice(0, 8)}… 흡수 완료 → target ${targetId.slice(0, 8)}… (${reasons.join(", ") || "데이터 없음"})`,
  };
}

/**
 * 같은 brand+country 의 다른 case 후보 list (mergeCases dropdown 용).
 */
export async function listMergeCandidates(case_id: string): Promise<
  Array<{ id: string; channel: string | null; status: string; updated_at: string }>
> {
  const supabase = await createServer();
  const { data: me } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", case_id)
    .maybeSingle();
  if (!me?.brand_id || !me.country) return [];
  const { data } = await supabase
    .from("cases")
    .select("id, channel, status, updated_at")
    .eq("brand_id", me.brand_id)
    .eq("country", me.country)
    .neq("id", case_id)
    .order("updated_at", { ascending: false });
  return (data ?? []) as Array<{
    id: string;
    channel: string | null;
    status: string;
    updated_at: string;
  }>;
}
