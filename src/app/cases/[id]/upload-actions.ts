"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServer } from "@/lib/supabase/server";
import { parseExolyt } from "@/lib/parsers/exolyt";
import { parseAmazonSales } from "@/lib/parsers/amazon-sales";
import { parseBsr } from "@/lib/parsers/bsr";
import { extractAsinFromFilename } from "@/lib/parsers/utils";
import { inngest } from "@/lib/inngest/client";

type Result =
  | { ok: true; message: string }
  | { ok: false; error: string };

const BATCH = 500;

async function getCase(case_id: string) {
  const supabase = await createServer();
  const { data, error } = await supabase
    .from("cases")
    .select("id, brand_id, country, channel, status")
    .eq("id", case_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("케이스를 찾을 수 없습니다");
  return { supabase, c: data };
}

// =============================================================================
// 1. exolyt 업로드 (Supabase Storage 경유 — Vercel 4.5MB body 한도 우회)
// =============================================================================
export async function uploadExolytFromStorage(
  case_id: string,
  storagePath: string,
): Promise<Result> {
  const { supabase, c } = await getCase(case_id);

  // Storage에서 파일 다운로드
  const { data: blob, error: downloadErr } = await supabase.storage
    .from("case-assets")
    .download(storagePath);
  if (downloadErr || !blob) {
    return {
      ok: false,
      error: `Storage 다운로드 실패: ${downloadErr?.message ?? "no data"}`,
    };
  }
  const text = await blob.text();

  const result = await processExolytText(supabase, c, text);

  // 처리 후 임시 파일 정리
  await supabase.storage.from("case-assets").remove([storagePath]);

  return result;
}

/**
 * Legacy entrypoint — 작은 파일용 (Vercel body 한도 < 4.5MB).
 * 큰 파일은 uploadExolytFromStorage 사용.
 */
export async function uploadExolyt(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일이 첨부되지 않았습니다" };
  }

  const { supabase, c } = await getCase(case_id);
  const text = await file.text();
  return processExolytText(supabase, c, text);
}

async function processExolytText(
  supabase: Awaited<ReturnType<typeof getCase>>["supabase"],
  c: Awaited<ReturnType<typeof getCase>>["c"],
  text: string,
): Promise<Result> {
  const parseResult = parseExolyt(text);
  const {
    rows,
    errors,
    totalLines,
    skippedNoUsername,
    skippedNoUrl,
    duplicateUrls,
    detectedHeaders,
  } = parseResult;

  console.log("[uploadExolyt] parse stats", {
    totalLines,
    parsedRows: rows.length,
    skippedNoUsername,
    skippedNoUrl,
    duplicateUrls,
    detectedHeaders: detectedHeaders.slice(0, 10),
  });

  if (rows.length === 0) {
    return {
      ok: false,
      error: `파싱된 행 0개. 헤더: ${detectedHeaders.slice(0, 5).join(", ")}... ${errors[0] ?? ""}`,
    };
  }

  // 1. influencer 업서트 (TikTok platform 가정 — exolyt는 TikTok 데이터)
  const uniqueUsernames = Array.from(new Set(rows.map((r) => r.username)));
  const inflInserts = uniqueUsernames.map((u) => ({
    platform: "tiktok" as const,
    external_id: u, // 임시 — Phase 3 clockworks가 진짜 user_id로 backfill
    handle: u,
    fans_source: "manual",
  }));
  for (let i = 0; i < inflInserts.length; i += BATCH) {
    const batch = inflInserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("influencers")
      .upsert(batch, { onConflict: "platform,external_id", ignoreDuplicates: true });
    if (error) {
      return {
        ok: false,
        error: `influencer upsert (batch ${i}): ${error.message || JSON.stringify(error)}`,
      };
    }
  }

  // 2. influencer.id 매핑 — PostgREST URL 8KB 제한 회피 위해 청크로 조회
  const handleToId = new Map<string, string>();
  const LOOKUP_CHUNK = 200;
  for (let i = 0; i < uniqueUsernames.length; i += LOOKUP_CHUNK) {
    const chunk = uniqueUsernames.slice(i, i + LOOKUP_CHUNK);
    const { data: chunkRows, error } = await supabase
      .from("influencers")
      .select("id, handle")
      .eq("platform", "tiktok")
      .in("handle", chunk);
    if (error) {
      return {
        ok: false,
        error: `influencer fetch (chunk ${i}~${i + chunk.length}/${uniqueUsernames.length}): ${error.message || JSON.stringify(error)}`,
      };
    }
    for (const r of chunkRows ?? []) {
      handleToId.set(r.handle, r.id);
    }
  }

  // 3. contents 업서트 (url 유니크 키)
  const contentInsertsRaw = rows.map((r) => ({
    brand_id: c.brand_id,
    country: c.country,
    influencer_id: handleToId.get(r.username) ?? null,
    url: r.url,
    caption: r.caption,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    collect_count: r.collect_count,
    engagement_rate: r.engagement_rate,
    uploaded_at: r.uploaded_at,
    duration_ms: r.duration_ms,
    is_ad: r.is_ad,
    hashtags: r.hashtags,
    sentiment: r.sentiment,
  }));

  // CSV 안에서 같은 URL이 중복으로 등장하면 ON CONFLICT 같은 batch에서 두 번 update 시도해
  // postgres가 거부 → 마지막 등장 행만 남기고 dedupe
  const contentInserts = Array.from(
    new Map(contentInsertsRaw.map((item) => [item.url, item])).values(),
  );

  let inserted = 0;
  for (let i = 0; i < contentInserts.length; i += BATCH) {
    const batch = contentInserts.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from("contents")
      .upsert(batch, { onConflict: "url", ignoreDuplicates: false, count: "exact" });
    if (error) {
      return {
        ok: false,
        error: `content upsert (batch ${i}): ${error.message || JSON.stringify(error)}`,
      };
    }
    inserted += count ?? batch.length;
  }

  revalidatePath(`/cases/${c.id}`);
  const skipNote =
    skippedNoUsername + skippedNoUrl + duplicateUrls > 0
      ? ` (CSV ${totalLines}행 중: 적재 ${contentInserts.length}, 중복url ${duplicateUrls}, username결측 ${skippedNoUsername}, url결측 ${skippedNoUrl})`
      : "";
  return {
    ok: true,
    message: `exolyt ${inserted}행 적재 완료${skipNote}`,
  };
}

// =============================================================================
// 2. exolyt 재사용
// =============================================================================
export async function reuseExolyt(case_id: string): Promise<Result> {
  // contents는 brand_id+country로 묶여있어 별도 동작 불필요. 단지 사용자가
  // "재사용 선택했음"을 status로 표현하기 위해 case.options에 마크.
  const { supabase, c } = await getCase(case_id);

  const { count, error: cntErr } = await supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", c.brand_id)
    .eq("country", c.country);
  if (cntErr) return { ok: false, error: cntErr.message };
  if (!count || count === 0) {
    return { ok: false, error: "재사용할 기존 콘텐츠가 없습니다" };
  }

  const { error } = await supabase
    .from("cases")
    .update({ options: { exolyt_reused: true } })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cases/${case_id}`);
  return { ok: true, message: `${count}행 콘텐츠 재사용 OK` };
}

// =============================================================================
// 3. Amazon 30일 매출
// =============================================================================
export async function uploadAmazonSales(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  const period_start = formData.get("period_start");
  const period_end = formData.get("period_end");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일이 첨부되지 않았습니다" };
  }
  if (typeof period_start !== "string" || typeof period_end !== "string") {
    return { ok: false, error: "매출 기준 기간을 입력하세요" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "amazon") {
    return { ok: false, error: "Amazon 케이스에서만 사용 가능" };
  }

  const text = await file.text();
  const { rows, errors } = parseAmazonSales(text);
  if (rows.length === 0) {
    return { ok: false, error: `파싱된 행 0개. ${errors[0] ?? ""}` };
  }

  // 1. products 업서트 (case_id, asin 유니크)
  const productInserts = rows.map((r) => ({
    case_id: c.id,
    brand_id: c.brand_id,
    name: r.name,
    asin: r.asin,
    product_url: r.url,
    platform: "amazon",
    channel: "amazon",
    price: r.price,
    category: r.category,
  }));
  const { error: prodErr } = await supabase
    .from("products")
    .upsert(productInserts, { onConflict: "case_id,asin" });
  if (prodErr) return { ok: false, error: `product upsert: ${prodErr.message}` };

  // 2. product.id 매핑
  const { data: prodRows, error: prodFetchErr } = await supabase
    .from("products")
    .select("id, asin")
    .eq("case_id", c.id);
  if (prodFetchErr) return { ok: false, error: prodFetchErr.message };
  const asinToId = new Map((prodRows ?? []).map((p) => [p.asin, p.id]));

  // 3. case_product_sales 업서트
  const salesInserts = rows
    .map((r) => {
      const product_id = asinToId.get(r.asin);
      if (!product_id) return null;
      return {
        case_id: c.id,
        product_id,
        units_30d: r.units_30d,
        revenue_30d: r.revenue_30d,
        period_start,
        period_end,
        source: "manual_csv",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { error: salesErr } = await supabase
    .from("case_product_sales")
    .upsert(salesInserts, { onConflict: "case_id,product_id,period_end" });
  if (salesErr) return { ok: false, error: `sales upsert: ${salesErr.message}` };

  revalidatePath(`/cases/${case_id}`);
  return { ok: true, message: `${rows.length}개 SKU 적재 완료 (${period_start} ~ ${period_end})` };
}

// =============================================================================
// 4. BSR per-product
// =============================================================================
export async function uploadBsr(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  const explicitAsin = formData.get("asin");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일이 첨부되지 않았습니다" };
  }

  const filenameAsin = extractAsinFromFilename(file.name);
  const slotAsin =
    typeof explicitAsin === "string" && explicitAsin ? explicitAsin : null;

  // 슬롯 ASIN이 있으면 그게 기준. 단 파일명 ASIN과 mismatch면 reject (실수 방지)
  if (slotAsin && filenameAsin && slotAsin !== filenameAsin) {
    return {
      ok: false,
      error: `슬롯 ASIN(${slotAsin})과 파일명 ASIN(${filenameAsin})이 다릅니다. 다른 SKU 파일을 잘못 드롭한 것 같아요. 올바른 파일을 다시 선택하거나 "여러 개 한 번에 업로드" 버튼을 사용하세요.`,
    };
  }

  const asin = slotAsin ?? filenameAsin;
  if (!asin) {
    return {
      ok: false,
      error: "ASIN을 식별할 수 없습니다 (파일명에 ASIN 포함시키거나 슬롯에 끌어다놓기)",
    };
  }

  const { supabase, c } = await getCase(case_id);

  // 1. product 찾기
  const { data: prod, error: prodErr } = await supabase
    .from("products")
    .select("id, brand_id")
    .eq("case_id", c.id)
    .eq("asin", asin)
    .maybeSingle();
  if (prodErr) return { ok: false, error: prodErr.message };
  if (!prod) {
    return {
      ok: false,
      error: `ASIN ${asin}의 product가 없습니다. 매출 CSV 먼저 업로드.`,
    };
  }

  // 2. 파싱
  const text = await file.text();
  const { rows, errors } = parseBsr(text);
  if (rows.length === 0) {
    return { ok: false, error: `파싱된 행 0개. ${errors[0] ?? ""}` };
  }

  // 3. dedup — Keepa는 같은 날에 여러 번 측정값을 export할 수 있음 (오전/오후 등).
  // upsert unique key가 (product_id, channel, collected_at)이라 같은 날 row 2개가
  // 한 batch에 들어가면 ON CONFLICT 두 번 update 불가 에러. 같은 날짜는 마지막 row 유지.
  const deduped = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    deduped.set(r.collected_at, r);
  }
  const dedupedRows = Array.from(deduped.values());

  // 3.5 재업로드 reset — Keepa는 lifetime 시계열을 통째로 export하는 게 정상이라
  // incremental append보다 기존 데이터 통째 교체가 깔끔. 잘못된 파일 올린 경우도 자동 정리.
  const { error: resetErr } = await supabase
    .from("sales_snapshot")
    .delete()
    .eq("product_id", prod.id)
    .eq("channel", "amazon");
  if (resetErr) return { ok: false, error: `bsr reset: ${resetErr.message}` };

  // 4. sales_snapshot 업서트
  const inserts = dedupedRows.map((r) => ({
    brand_id: prod.brand_id,
    product_id: prod.id,
    channel: "amazon",
    bsr: r.bsr,
    new_price: r.new_price,
    list_price: r.list_price,
    source: "keepa",
    collected_at: r.collected_at,
  }));

  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("sales_snapshot")
      .upsert(batch, { onConflict: "product_id,channel,collected_at" });
    if (error) {
      return {
        ok: false,
        error: `bsr upsert (batch ${i}, asin ${asin}): ${error.message || JSON.stringify(error)}`,
      };
    }
  }

  revalidatePath(`/cases/${case_id}`);
  const dupCount = rows.length - dedupedRows.length;
  const dupNote = dupCount > 0 ? ` (중복 ${dupCount}건 통합)` : "";
  return { ok: true, message: `ASIN ${asin} BSR ${dedupedRows.length}일 적재 완료${dupNote}` };
}

// =============================================================================
// 5. 케이스 삭제
// =============================================================================
// 의존성 순서대로 명시적 삭제 (FK CASCADE 설정 안 된 테이블 안전하게 처리).
// contents / influencers / brands는 보존 — 다른 케이스에서 재사용될 수 있음.
export async function deleteCase(case_id: string): Promise<Result> {
  const supabase = await createServer();

  // 0. 케이스 존재 확인
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("id")
    .eq("id", case_id)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!c) return { ok: false, error: "이미 삭제되었거나 존재하지 않는 케이스" };

  // 1. 종속 ID 수집
  const { data: products } = await supabase
    .from("products")
    .select("id")
    .eq("case_id", case_id);
  const productIds = (products ?? []).map((p) => p.id);

  const { data: clusters } = await supabase
    .from("content_clusters")
    .select("id")
    .eq("case_id", case_id);
  const clusterIds = (clusters ?? []).map((cl) => cl.id);

  // 2. 의존성 역방향 삭제
  if (clusterIds.length > 0) {
    const { error } = await supabase
      .from("content_cluster_members")
      .delete()
      .in("cluster_id", clusterIds);
    if (error) return { ok: false, error: `cluster_members: ${error.message}` };
  }

  for (const t of [
    "case_video_analyses",
    "case_video_assets",
    "case_product_sales",
    "content_clusters",
    "meta_ads",
    "pipeline_runs",
  ] as const) {
    const { error } = await supabase.from(t).delete().eq("case_id", case_id);
    if (error) return { ok: false, error: `${t}: ${error.message}` };
  }

  if (productIds.length > 0) {
    const { error } = await supabase
      .from("sales_snapshot")
      .delete()
      .in("product_id", productIds);
    if (error) return { ok: false, error: `sales_snapshot: ${error.message}` };
  }

  const { error: prodErr } = await supabase
    .from("products")
    .delete()
    .eq("case_id", case_id);
  if (prodErr) return { ok: false, error: `products: ${prodErr.message}` };

  const { error: caseErr } = await supabase
    .from("cases")
    .delete()
    .eq("id", case_id);
  if (caseErr) return { ok: false, error: `cases: ${caseErr.message}` };

  revalidatePath("/cases");
  redirect("/cases");
}

// =============================================================================
// 6a. 케이스 상태 리셋 (테스트용)
// =============================================================================
export async function resetToDraft(case_id: string): Promise<Result> {
  const supabase = await createServer();
  const { error } = await supabase
    .from("cases")
    .update({ status: "draft" })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${case_id}`);
  return { ok: true, message: "draft로 되돌림" };
}

// =============================================================================
// 6. 분석 시작
// =============================================================================
import type { PhaseKey } from "@/lib/inngest/client";

export async function startAnalysis(
  case_id: string,
  force_phases?: PhaseKey[],
): Promise<Result> {
  const { supabase } = await getCase(case_id);

  const { error } = await supabase
    .from("cases")
    .update({ status: "running" })
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };

  try {
    await inngest.send({
      name: "case/start.analysis",
      data: {
        case_id,
        with_video: false,
        ...(force_phases && force_phases.length > 0 ? { force_phases } : {}),
      },
    });
  } catch (e) {
    console.warn(
      "[startAnalysis] Inngest send 실패:",
      e instanceof Error ? e.message : e,
    );
  }

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message:
      force_phases && force_phases.length > 0
        ? `Phase 강제 재실행: ${force_phases.join(", ")}`
        : "분석 시작 — 캐시된 phase는 skip, 누락된 것만 실행",
  };
}
