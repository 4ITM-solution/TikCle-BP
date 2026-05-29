"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServer } from "@/lib/supabase/server";

const schema = z.object({
  brand_name: z.string().min(1, "브랜드명을 입력하세요").max(100).trim(),
  country: z.string().min(2).max(8),
  platform: z.enum(["amazon", "tiktok_shop", "shopee"]),
  brand_keyword: z.string().optional().default(""),
  brand_meta_pages: z.string().optional().default(""),
  tiktok_shop_store_url: z.string().optional().default(""),
  // BP IG/YT 분석 옵션 (모두 optional)
  ig_seed_username: z.string().optional().default(""),
  yt_seed_url: z.string().optional().default(""),
  region_scope: z.enum(["global", "us-only"]).optional().default("global"),
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
    ig_seed_username: get("ig_seed_username"),
    yt_seed_url: get("yt_seed_url"),
    region_scope: (get("region_scope") || "global") as "global" | "us-only",
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

  // BP IG/YT seed 박혀있으면 status='ready' 자동 (매출 데이터 없어도 IG/YT 박스 노출 가능).
  // 매출 데이터 나중에 추가하려면 일반 흐름 그대로 — IG/YT seed 안 박으면 draft.
  const hasBpSeed =
    !!parsed.data.ig_seed_username.trim() ||
    !!parsed.data.yt_seed_url.trim();

  const optionsBlob: Record<string, unknown> = {};
  if (parsed.data.region_scope === "us-only") {
    optionsBlob.region_scope = "us-only";
  }

  const { data: created, error: caseErr } = await supabase
    .from("cases")
    .insert({
      brand_id,
      country,
      channel: platform,
      status: hasBpSeed ? "ready" : "draft",
      brand_keyword: parsed.data.brand_keyword || null,
      brand_meta_pages: meta_pages.length > 0 ? meta_pages : null,
      tiktok_shop_store_url: parsed.data.tiktok_shop_store_url || null,
      options: Object.keys(optionsBlob).length > 0 ? (optionsBlob as never) : null,
    })
    .select("id")
    .single();

  if (caseErr || !created) {
    return { ok: false, error: `케이스 생성 실패: ${caseErr?.message}` };
  }

  // BP seed 박혀있으면 ig_config / yt_config에 seed 자동 박기 (사용자가 IG/YT 박스에서
  // "자동 발굴 시작" 클릭하면 그 seed 사용). 단 prep까지 자동 trigger는 X — 사용자가
  // case 페이지 가서 명시적으로 누르는 게 비용 투명 + 안전.
  if (hasBpSeed) {
    const igConfig: Record<string, unknown> = {};
    const ytConfig: Record<string, unknown> = {};
    if (parsed.data.ig_seed_username.trim()) {
      igConfig.ig_owned_usernames = [
        parsed.data.ig_seed_username.trim().replace(/^@/, ""),
      ];
    }
    if (parsed.data.yt_seed_url.trim()) {
      ytConfig.yt_owned_channels = [parsed.data.yt_seed_url.trim()];
    }
    if (Object.keys(igConfig).length > 0 || Object.keys(ytConfig).length > 0) {
      await supabase
        .from("cases")
        .update({
          ig_config:
            Object.keys(igConfig).length > 0 ? (igConfig as never) : null,
          yt_config:
            Object.keys(ytConfig).length > 0 ? (ytConfig as never) : null,
        })
        .eq("id", created.id);
    }
  }

  redirect(`/cases/${created.id}`);
}
