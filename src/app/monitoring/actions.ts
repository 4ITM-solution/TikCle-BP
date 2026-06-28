"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import type { SupabaseClient } from "@supabase/supabase-js";

function db(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * 케이스의 이미 적재된 meta_ads에서 브랜드 공식 page_id 도출.
 *   1) is_brand_official=true 광고의 page_id 최빈값
 *   2) 없으면 page_name에 브랜드명 포함된 광고의 page_id 최빈값
 */
async function deriveBrandPageId(
  supa: SupabaseClient,
  case_id: string,
  brandName: string,
): Promise<string | null> {
  const mode = (rows: { page_id: string | null }[] | null): string | null => {
    const counts = new Map<string, number>();
    for (const r of rows ?? [])
      if (r.page_id) counts.set(r.page_id, (counts.get(r.page_id) ?? 0) + 1);
    let best: string | null = null;
    let max = 0;
    for (const [p, n] of counts) if (n > max) ((max = n), (best = p));
    return best;
  };
  const { data: off } = await supa
    .from("meta_ads")
    .select("page_id")
    .eq("case_id", case_id)
    .eq("is_brand_official", true)
    .not("page_id", "is", null)
    .limit(400);
  const fromOfficial = mode(off as { page_id: string | null }[]);
  if (fromOfficial) return fromOfficial;

  const { data: byName } = await supa
    .from("meta_ads")
    .select("page_id")
    .eq("case_id", case_id)
    .ilike("page_name", `%${brandName}%`)
    .not("page_id", "is", null)
    .limit(400);
  return mode(byName as { page_id: string | null }[]);
}

export async function addTrackedBrand(fd: FormData): Promise<void> {
  const case_id = str(fd, "case_id");
  const cadence_days = Number(str(fd, "cadence_days") ?? "3") || 3;
  const pageIdOverride = str(fd, "page_id"); // 선택 — 수동 override
  if (!case_id) return;

  const supa = db();
  const { data: c } = await supa
    .from("cases")
    .select("country, brand_keyword, brand_meta_pages, brands(name)")
    .eq("id", case_id)
    .single();
  if (!c) return;

  type CaseRow = {
    country: string | null;
    brand_keyword: string | null;
    brand_meta_pages: string[] | null;
    brands: { name: string } | { name: string }[] | null;
  };
  const cc = c as CaseRow;
  const brandObj = Array.isArray(cc.brands) ? cc.brands[0] : cc.brands;
  const brand_name = brandObj?.name ?? "(이름 없음)";
  const country = cc.country ?? "US";
  const keyword = cc.brand_keyword ?? brand_name;
  // page_id: override > brand_meta_pages 숫자 > meta_ads에서 자동 도출
  const numericPage = (cc.brand_meta_pages ?? []).find((p) => /^\d+$/.test(p));
  const page_id =
    pageIdOverride ??
    numericPage ??
    (await deriveBrandPageId(supa, case_id, brand_name));

  await supa
    .from("tracked_brands")
    .insert({ case_id, brand_name, page_id, keyword, country, cadence_days });
  revalidatePath("/monitoring");
}

export async function toggleTrackedBrand(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  await db()
    .from("tracked_brands")
    .update({ is_active: str(fd, "to") === "on" })
    .eq("id", id);
  revalidatePath("/monitoring");
}

export async function deleteTrackedBrand(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  await db().from("tracked_brands").delete().eq("id", id);
  revalidatePath("/monitoring");
}

export async function scrapeNow(fd: FormData): Promise<void> {
  const id = str(fd, "id");
  if (!id) return;
  await inngest.send({ name: "monitor/scrape.brand", data: { brand_id: id } });
  await db()
    .from("tracked_brands")
    .update({ last_status: "수집 중…" })
    .eq("id", id);
  revalidatePath("/monitoring");
}
