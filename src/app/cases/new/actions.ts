"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServer } from "@/lib/supabase/server";

const schema = z.object({
  brand_name: z.string().min(1, "브랜드명을 입력하세요").max(100).trim(),
  country: z.string().min(2).max(8),
  platform: z.enum(["amazon", "tiktok_shop"]),
  brand_keyword: z.string().optional().default(""),
  brand_meta_pages: z.string().optional().default(""),
  tiktok_shop_store_url: z.string().optional().default(""),
});

export type ActionResult =
  | { ok: true; case_id: string }
  | { ok: false; error: string };

export async function createCaseDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // disabled input은 submit 안 되어 null로 옴 → 빈 문자열로 정규화
  const get = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };

  const parsed = schema.safeParse({
    brand_name: get("brand_name"),
    country: get("country"),
    platform: get("platform"),
    brand_keyword: get("brand_keyword"),
    brand_meta_pages: get("brand_meta_pages"),
    tiktok_shop_store_url: get("tiktok_shop_store_url"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "입력값 오류" };
  }

  const { brand_name, country, platform } = parsed.data;
  const supabase = await createServer();

  // 1. 브랜드 upsert (대소문자 무시)
  const { data: existing } = await supabase
    .from("brands")
    .select("id, name")
    .ilike("name", brand_name)
    .limit(1)
    .maybeSingle();

  let brand_id = existing?.id;
  if (!brand_id) {
    const { data: created, error: createErr } = await supabase
      .from("brands")
      .insert({ name: brand_name })
      .select("id")
      .single();
    if (createErr || !created) {
      return { ok: false, error: `브랜드 생성 실패: ${createErr?.message}` };
    }
    brand_id = created.id;
  }

  // 2. 동일 (brand, country, platform) 케이스 중복 체크
  const { data: dup } = await supabase
    .from("cases")
    .select("id, status")
    .eq("brand_id", brand_id)
    .eq("country", country)
    .eq("channel", platform)
    .maybeSingle();

  if (dup) {
    return {
      ok: false,
      error: `이미 같은 조합의 케이스가 있습니다 (${dup.status}). 기존 케이스를 사용하거나 삭제 후 다시 시도하세요.`,
    };
  }

  // 3. 케이스 draft 생성
  const meta_pages = parsed.data.brand_meta_pages
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: created, error: caseErr } = await supabase
    .from("cases")
    .insert({
      brand_id,
      country,
      channel: platform,
      status: "draft",
      brand_keyword: parsed.data.brand_keyword || null,
      brand_meta_pages: meta_pages.length > 0 ? meta_pages : null,
      tiktok_shop_store_url: parsed.data.tiktok_shop_store_url || null,
    })
    .select("id")
    .single();

  if (caseErr || !created) {
    return { ok: false, error: `케이스 생성 실패: ${caseErr?.message}` };
  }

  redirect(`/cases/${created.id}`);
}
