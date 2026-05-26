"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServer } from "@/lib/supabase/server";
import { parseExolyt } from "@/lib/parsers/exolyt";
import { parseAmazonSales } from "@/lib/parsers/amazon-sales";
import { parseBsr } from "@/lib/parsers/bsr";
import {
  parseShopdoraSnapshot,
  parseShopdoraMonthly,
} from "@/lib/parsers/shopdora";
import {
  parseKalodata,
  parseKalodataCreatorXlsx,
  parseKalodataVideoXlsx,
} from "@/lib/parsers/kalodata";
import { parseTiktokShopUsAffiliate } from "@/lib/parsers/tt-shop-us";
import { extractAsinFromFilename } from "@/lib/parsers/utils";
import { inngest } from "@/lib/inngest/client";
import { defaultCurrency, isRegionCode } from "@/lib/case-detail/countries";

type Result =
  | { ok: true; message: string }
  | { ok: false; error: string };

const BATCH = 500;

/**
 * 가장 최근 매출 업로드 batch 1개 롤백.
 * captured_at 시점 기준 — 같은 csv 업로드는 거의 동시에 박혀 같은 captured_at(±1초).
 * 직전 batch는 그대로 보존. period_end 잘못 박은 경우 1단계 undo용.
 */
export async function rollbackLatestSalesBatch(
  case_id: string,
): Promise<Result> {
  const supabase = await createServer();

  const { data: latest, error: fetchErr } = await supabase
    .from("case_product_sales")
    .select("captured_at, period_start, period_end")
    .eq("case_id", case_id)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!latest) {
    return { ok: false, error: "삭제할 매출 업로드가 없습니다" };
  }

  // 가장 최근 captured_at의 ±2초 범위가 같은 batch 1번 업로드.
  const lastTs = new Date(latest.captured_at).getTime();
  const lo = new Date(lastTs - 2_000).toISOString();
  const hi = new Date(lastTs + 2_000).toISOString();

  const { error: delErr, count } = await supabase
    .from("case_product_sales")
    .delete({ count: "exact" })
    .eq("case_id", case_id)
    .gte("captured_at", lo)
    .lte("captured_at", hi);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `최근 매출 업로드 ${count ?? 0}건 롤백 (기간 ${latest.period_start ?? "?"} ~ ${latest.period_end ?? "?"}). 이전 업로드는 보존됨.`,
  };
}

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

  // 기존 contents의 metric을 미리 조회 — 과거 데이터 CSV를 올려도 조회수 등이
  // 후퇴하지 않도록, url 충돌 시 단조증가 metric은 GREATEST(기존, 신규)로 머지.
  // (조회수·좋아요·댓글·공유·저장수는 시간이 지나며 누적 증가만 함)
  const csvUrls = contentInserts.map((r) => r.url);
  const existingMetrics = new Map<
    string,
    {
      views: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      collect_count: number | null;
    }
  >();
  // url은 ~70자 → PostgREST URL 8KB 제한 회피 위해 작은 청크.
  const URL_LOOKUP_CHUNK = 100;
  for (let i = 0; i < csvUrls.length; i += URL_LOOKUP_CHUNK) {
    const urlChunk = csvUrls.slice(i, i + URL_LOOKUP_CHUNK);
    const { data: exRows, error: exErr } = await supabase
      .from("contents")
      .select("url, views, likes, comments, shares, collect_count")
      .eq("brand_id", c.brand_id)
      .eq("country", c.country)
      .in("url", urlChunk);
    if (exErr) {
      return {
        ok: false,
        error: `기존 content 조회 실패 (chunk ${i}): ${exErr.message || JSON.stringify(exErr)}`,
      };
    }
    for (const r of exRows ?? []) {
      existingMetrics.set(r.url, {
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        collect_count: r.collect_count,
      });
    }
  }

  const maxNum = (a: number | null, b: number | null): number | null => {
    if (a == null) return b;
    if (b == null) return a;
    return Math.max(a, b);
  };

  let metricMerged = 0;
  for (const row of contentInserts) {
    const prev = existingMetrics.get(row.url);
    if (!prev) continue;
    metricMerged += 1;
    row.views = maxNum(row.views, prev.views);
    row.likes = maxNum(row.likes, prev.likes);
    row.comments = maxNum(row.comments, prev.comments);
    row.shares = maxNum(row.shares, prev.shares);
    row.collect_count = maxNum(row.collect_count, prev.collect_count);
  }

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
  const mergeNote =
    metricMerged > 0
      ? ` · 기존 영상 ${metricMerged}개는 metric 큰 값으로 머지(후퇴 방지)`
      : "";
  return {
    ok: true,
    message: `exolyt ${inserted}행 적재 완료${skipNote}${mergeNote}`,
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
  const marketplaceCountryRaw = formData.get("marketplace_country");

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

  // 권역 case면 marketplace_country select 필수, 단일이면 case.country fallback.
  const productCountry =
    typeof marketplaceCountryRaw === "string" && marketplaceCountryRaw.length > 0
      ? marketplaceCountryRaw
      : c.country;
  if (isRegionCode(c.country) && productCountry === c.country) {
    return {
      ok: false,
      error: `권역 case(${c.country})는 marketplace 국가 선택 필수입니다.`,
    };
  }
  const currency = defaultCurrency(productCountry);

  const text = await file.text();
  const { rows, errors } = parseAmazonSales(text);
  if (rows.length === 0) {
    return { ok: false, error: `파싱된 행 0개. ${errors[0] ?? ""}` };
  }

  // Listing Age (Months) → launch_date 역산. period_end 기준 N개월 전, day=1.
  // Black Box는 월 단위 나이만 줘서 일자 정밀도는 없음 (월초로 고정).
  const launchDateFromAge = (months: number | null): string | null => {
    if (months == null || months < 0) return null;
    const ref = new Date(period_end);
    if (Number.isNaN(ref.getTime())) return null;
    const d = new Date(
      Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - Math.round(months), 1),
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  // 1. products 업서트 — (case_id, country, asin) 유니크
  const productInserts = rows.map((r) => ({
    case_id: c.id,
    brand_id: c.brand_id,
    country: productCountry,
    name: r.name,
    asin: r.asin,
    product_url: r.url,
    platform: "amazon",
    channel: "amazon",
    price: r.price,
    category: r.category,
    subcategory: r.subcategory,
    launch_date: launchDateFromAge(r.listing_age_months),
  }));
  const { error: prodErr } = await supabase
    .from("products")
    .upsert(productInserts, { onConflict: "case_id,country,asin" });
  if (prodErr) return { ok: false, error: `product upsert: ${prodErr.message}` };

  // 2. product.id 매핑 — 같은 ASIN이 권역 case의 다른 country에도 있을 수 있어
  //    (case_id, country, asin) 키로 fetch.
  const { data: prodRows, error: prodFetchErr } = await supabase
    .from("products")
    .select("id, asin, country")
    .eq("case_id", c.id)
    .eq("country", productCountry);
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
        country: productCountry,
        units_30d: r.units_30d,
        revenue_30d: r.revenue_30d,
        currency,
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
  return {
    ok: true,
    message: `${rows.length}개 SKU 적재 완료 (${productCountry} · ${currency} · ${period_start} ~ ${period_end})`,
  };
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

  // 1. product 찾기 — 권역 case면 같은 ASIN이 SA/AE 두 country에 박힐 수 있어
  //    formData에 country가 와있으면 그걸로 좁힘. 없으면 첫 매칭 row.
  const explicitCountry = formData.get("country");
  let productQuery = supabase
    .from("products")
    .select("id, brand_id, country")
    .eq("case_id", c.id)
    .eq("asin", asin);
  if (typeof explicitCountry === "string" && explicitCountry) {
    productQuery = productQuery.eq("country", explicitCountry);
  }
  const { data: prods, error: prodErr } = await productQuery.limit(2);
  if (prodErr) return { ok: false, error: prodErr.message };
  if (!prods || prods.length === 0) {
    return {
      ok: false,
      error: `ASIN ${asin}의 product가 없습니다. 매출 CSV 먼저 업로드.`,
    };
  }
  if (prods.length > 1) {
    return {
      ok: false,
      error: `ASIN ${asin}이 권역 case의 여러 country에 박혀있어요 (${prods.map((p) => p.country).join(", ")}). 슬롯에 country 추가 후 다시 시도.`,
    };
  }
  const prod = prods[0]!;

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

  // 4. sales_snapshot 업서트 — product의 country/currency 그대로 박음 (권역 case 분리)
  const bsrCountry = prod.country ?? c.country;
  const bsrCurrency = defaultCurrency(bsrCountry);
  const inserts = dedupedRows.map((r) => ({
    brand_id: prod.brand_id,
    product_id: prod.id,
    country: bsrCountry,
    channel: "amazon",
    bsr: r.bsr,
    new_price: r.new_price,
    list_price: r.list_price,
    currency: bsrCurrency,
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

  // skipped_reason 박힌 phase는 자동으로 force에 포함.
  // 이유: 옛 케이스 (brand_keyword 비어있어 phase4a skip, max_tokens 부족으로 phase4b_clusters
  // skip 등)는 cached skip 결과 그대로 반환돼 글로벌 재실행 눌러도 갱신 안 됨.
  // skipped_reason 있으면 "재시도해야 함"으로 간주.
  const { data: ksRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const ks =
    (ksRow?.key_stats as Record<string, { skipped_reason?: string } | undefined>) ??
    {};
  const phaseKeysToCheck: PhaseKey[] = [
    "phase1_5",
    "phase2",
    "phase3",
    "phase35",
    "phase37",
    "phase4a",
    "phase4b_sample",
    "phase4b_asr",
    "phase4b_vision",
    "phase4b_clusters",
    "phase4b_sku",
    "phase5",
  ];
  const autoForced = phaseKeysToCheck.filter((k) => ks[k]?.skipped_reason);
  const merged = Array.from(
    new Set([...(force_phases ?? []), ...autoForced]),
  );

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
        ...(merged.length > 0 ? { force_phases: merged } : {}),
      },
    });
  } catch (e) {
    console.warn(
      "[startAnalysis] Inngest send 실패:",
      e instanceof Error ? e.message : e,
    );
  }

  revalidatePath(`/cases/${case_id}`);
  const msgParts: string[] = [];
  if (force_phases && force_phases.length > 0) {
    msgParts.push(`수동 강제: ${force_phases.join(", ")}`);
  }
  if (autoForced.length > 0) {
    msgParts.push(`skipped 자동 재시도: ${autoForced.join(", ")}`);
  }
  return {
    ok: true,
    message:
      msgParts.length > 0
        ? msgParts.join(" · ")
        : "분석 시작 — 캐시된 phase는 skip, 누락된 것만 실행",
  };
}

// =============================================================================
// Shopdora — Shopee SEA 매출 데이터
//
// 두 가지 입력:
//   1) 제품 스냅샷 (Shopdora 웹 화면 텍스트 통째 붙여넣기) → products + case_product_sales
//   2) 월별 시계열 (제품별 12개월 등) → sales_snapshot
//
// Amazon Black Box 패턴 동일: 스냅샷 = 전 제품, 시계열 = 상위 제품.
// =============================================================================

const SHOPDORA_CURRENCY_BY_COUNTRY: Record<string, string> = {
  ID: "IDR",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  VN: "VND",
  PH: "PHP",
};

export async function uploadShopdoraSnapshot(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const text = formData.get("text");
  const period_start = formData.get("period_start");
  const period_end = formData.get("period_end");

  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Shopdora 텍스트가 비어있습니다" };
  }
  if (typeof period_start !== "string" || typeof period_end !== "string") {
    return { ok: false, error: "기간을 입력하세요" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "shopee") {
    return { ok: false, error: "Shopee 케이스에서만 사용 가능" };
  }

  const { rows, errors } = parseShopdoraSnapshot(text);
  if (rows.length === 0) {
    return { ok: false, error: errors[0] ?? "파싱 실패" };
  }

  const country = c.country;
  const currency =
    SHOPDORA_CURRENCY_BY_COUNTRY[country] ?? rows[0]?.currency ?? "USD";

  // 1) products upsert — external_product_id 키 (Shopee item id)
  const productInserts = rows.map((r) => ({
    case_id: c.id,
    brand_id: c.brand_id,
    country,
    name: r.name,
    external_product_id: r.ext_id,
    platform: "shopee",
    channel: "shopee" as const,
    price: r.price,
    category: r.category,
    subcategory: r.subcategory,
    launch_date: r.listing_date,
  }));

  const { error: prodErr } = await supabase
    .from("products")
    .upsert(productInserts, { onConflict: "case_id,country,external_product_id" });
  if (prodErr)
    return { ok: false, error: `product upsert: ${prodErr.message}` };

  // 2) product.id 매핑
  const { data: prodRows, error: prodFetchErr } = await supabase
    .from("products")
    .select("id, external_product_id")
    .eq("case_id", c.id)
    .eq("country", country);
  if (prodFetchErr) return { ok: false, error: prodFetchErr.message };
  const extToId = new Map(
    (prodRows ?? []).map((p) => [p.external_product_id ?? "", p.id]),
  );

  // 3) case_product_sales upsert (스냅샷)
  const salesInserts = rows
    .map((r) => {
      const product_id = extToId.get(r.ext_id);
      if (!product_id) return null;
      return {
        case_id: c.id,
        product_id,
        country,
        units_30d: r.sold_month,
        revenue_30d: r.revenue_month,
        price: r.price,
        currency,
        period_start,
        period_end,
        source: "shopdora",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { error: salesErr } = await supabase
    .from("case_product_sales")
    .upsert(salesInserts, { onConflict: "case_id,product_id,period_end" });
  if (salesErr)
    return { ok: false, error: `sales upsert: ${salesErr.message}` };

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `Shopdora 스냅샷 ${rows.length}개 SKU 적재 완료 (${country} · ${currency} · ${period_start} ~ ${period_end})`,
  };
}

export async function uploadShopdoraMonthly(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const text = formData.get("text");
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "월별 시계열 텍스트가 비어있습니다" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "shopee") {
    return { ok: false, error: "Shopee 케이스에서만 사용 가능" };
  }

  const { rows, errors } = parseShopdoraMonthly(text);
  if (rows.length === 0) {
    return { ok: false, error: errors[0] ?? "월 데이터 파싱 실패" };
  }

  // ext_id → product_id 매핑 (제품 스냅샷이 먼저 적재돼 있어야 함)
  const country = c.country;
  const currency =
    SHOPDORA_CURRENCY_BY_COUNTRY[country] ?? "USD";
  const uniqueExt = Array.from(new Set(rows.map((r) => r.ext_id)));
  const { data: prodRows } = await supabase
    .from("products")
    .select("id, external_product_id")
    .eq("case_id", c.id)
    .eq("country", country)
    .in("external_product_id", uniqueExt);
  const extToId = new Map(
    (prodRows ?? []).map((p) => [p.external_product_id ?? "", p.id]),
  );

  const unmatched = uniqueExt.filter((ext) => !extToId.has(ext));
  if (extToId.size === 0) {
    return {
      ok: false,
      error: `제품 매칭 0건. 먼저 Shopdora 스냅샷을 업로드해 products를 채워주세요. (${unmatched.length}개 ext_id 미매칭)`,
    };
  }

  // sales_snapshot에 월별 row 적재 — collected_at = 월말
  const snapshots = rows
    .map((r) => {
      const pid = extToId.get(r.ext_id);
      if (!pid) return null;
      const [y, m] = r.year_month.split("-").map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 월말
      return {
        brand_id: c.brand_id,
        product_id: pid,
        channel: "shopee" as const,
        units_sold: r.sold_month,
        revenue: r.revenue_month,
        new_price: r.avg_price,
        source: "shopdora_monthly",
        collected_at: `${r.year_month}-${String(last).padStart(2, "0")}`,
        currency,
        country,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const { error: ssErr } = await supabase
    .from("sales_snapshot")
    .upsert(snapshots, { onConflict: "product_id,channel,collected_at" });
  if (ssErr)
    return { ok: false, error: `sales_snapshot upsert: ${ssErr.message}` };

  revalidatePath(`/cases/${case_id}`);
  const note =
    unmatched.length > 0
      ? ` (미매칭 ext_id ${unmatched.length}개 — 스냅샷에 없는 제품)`
      : "";
  return {
    ok: true,
    message: `Shopdora 월별 ${snapshots.length}행 적재 완료 (${extToId.size}개 제품)${note}`,
  };
}

// =============================================================================
// Kalodata — TikTok Shop SEA 분석 도구
//
// Brand 페이지(예: SKIN1004 Thailand) 화면 통째 텍스트 복붙 → 한 번에 적재:
//   - Brand KPI (key_stats.kalodata_brand)
//   - Products(Top N) → products + case_product_sales (USD)
//   - Creators(Top N) → influencers (handle 기반, lifetime_gmv_usd 갱신)
//
// Kalodata는 product에 외부 ID를 노출하지 않아 제품명 자체를 식별자로 사용
// (external_product_id = "kalodata:<name>").
// =============================================================================
export async function uploadKalodata(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const text = formData.get("text");
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Kalodata 텍스트가 비어있습니다" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "tiktok_shop") {
    return { ok: false, error: "TikTok Shop 케이스에서만 사용 가능" };
  }

  const parsed = parseKalodata(text);
  if (parsed.products.length === 0 && parsed.creators.length === 0) {
    return { ok: false, error: parsed.errors[0] ?? "파싱 실패" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const period_start = parsed.brand_kpi.period_start ?? thirtyAgo;
  const period_end = parsed.brand_kpi.period_end ?? today;

  // 1) Brand KPI + Videos → case.key_stats JSONB merge
  // Videos는 contents url 매칭 어려워(Kalodata는 url X) key_stats에 raw 저장.
  // 새 업로드 시 누적 (이전 Videos에 이번 Videos 머지 — caption 중복 dedupe)
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", c.id)
    .single();
  const existingStats = (caseRow?.key_stats as Record<string, unknown>) ?? {};
  const existingVideos =
    (existingStats.kalodata_videos as { caption: string }[] | undefined) ?? [];
  // dedupe by caption (Kalodata가 한 영상에 unique id 안 줘서 caption이 최선)
  const existingCaptions = new Set(existingVideos.map((v) => v.caption));
  const mergedVideos = [
    ...existingVideos,
    ...parsed.videos.filter((v) => !existingCaptions.has(v.caption)),
  ];

  // Lives 누적 (title + start_at 조합으로 dedupe — 같은 라이브 두 번 안 박힘)
  const existingLives =
    (existingStats.kalodata_lives as {
      title: string;
      start_at: string | null;
    }[] | undefined) ?? [];
  const liveKey = (l: { title: string; start_at: string | null }) =>
    `${l.title}@${l.start_at ?? ""}`;
  const existingLiveKeys = new Set(existingLives.map(liveKey));
  const mergedLives = [
    ...existingLives,
    ...parsed.lives.filter((l) => !existingLiveKeys.has(liveKey(l))),
  ];

  // Brand KPI 머지 — null 값은 기존값 유지 (Product/Creator/Video 페이지만 복붙한 텍스트엔
  // Core Metrics 섹션이 없어 모든 KPI가 null로 파싱됨. 그때 기존 KPI를 null로 덮어쓰면 안 됨)
  const existingBrand =
    (existingStats.kalodata_brand as Record<string, unknown> | undefined) ?? {};
  const mergedBrand: Record<string, unknown> = { ...existingBrand };
  for (const [k, v] of Object.entries(parsed.brand_kpi)) {
    if (v != null) mergedBrand[k] = v;
  }
  mergedBrand.captured_at = new Date().toISOString();

  const newStats = {
    ...existingStats,
    kalodata_brand: mergedBrand,
    kalodata_videos: mergedVideos,
    kalodata_lives: mergedLives,
  } as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("cases").update({ key_stats: newStats as any }).eq("id", c.id);

  // 2) Products upsert
  let productCount = 0;
  if (parsed.products.length > 0) {
    const productInserts = parsed.products.map((p) => ({
      case_id: c.id,
      brand_id: c.brand_id,
      country: c.country,
      name: p.name,
      // Kalodata는 외부 product ID를 화면에 노출 안 함 — 이름을 식별자로 사용
      external_product_id: `kalodata:${p.name.slice(0, 220)}`,
      platform: "tiktok_shop",
      channel: "tiktok_shop" as const,
      price: p.avg_unit_price,
      launch_date: p.publish_date,
    }));
    const { error: prodErr } = await supabase
      .from("products")
      .upsert(productInserts, {
        onConflict: "case_id,country,external_product_id",
      });
    if (prodErr)
      return { ok: false, error: `product upsert: ${prodErr.message}` };

    // product_id 매핑
    const { data: prodRows } = await supabase
      .from("products")
      .select("id, external_product_id")
      .eq("case_id", c.id)
      .eq("country", c.country);
    const extToId = new Map(
      (prodRows ?? []).map((p) => [p.external_product_id ?? "", p.id]),
    );

    const salesInserts = parsed.products
      .map((p) => {
        const product_id = extToId.get(`kalodata:${p.name.slice(0, 220)}`);
        if (!product_id) return null;
        return {
          case_id: c.id,
          product_id,
          country: c.country,
          units_30d: p.item_sold,
          revenue_30d: p.revenue_usd,
          price: p.avg_unit_price,
          currency: "USD",
          period_start,
          period_end,
          source: "kalodata",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const { error: salesErr } = await supabase
      .from("case_product_sales")
      .upsert(salesInserts, { onConflict: "case_id,product_id,period_end" });
    if (salesErr)
      return { ok: false, error: `sales upsert: ${salesErr.message}` };
    productCount = salesInserts.length;
  }

  // 3) Creators upsert (handle 기반) — influencers.lifetime_gmv_usd 갱신
  // Kalodata 매출 = 그 케이스(국가/기간)의 합산이라 lifetime과 완전 동치는 아니지만
  // 신호로 사용. 이미 더 큰 값 있으면 보존.
  let creatorCount = 0;
  if (parsed.creators.length > 0) {
    const inflRows = parsed.creators.map((cr) => ({
      platform: "tiktok" as const,
      external_id: cr.handle.replace(/^@/, ""),
      handle: cr.handle.replace(/^@/, ""),
      fans_source: "kalodata",
      lifetime_gmv_usd: cr.revenue_usd,
    }));
    const { error: inflErr } = await supabase
      .from("influencers")
      .upsert(inflRows, {
        onConflict: "platform,external_id",
        ignoreDuplicates: false,
      });
    if (inflErr) {
      // 비치명적 — 매출은 이미 들어갔으니 경고만
      console.warn("[uploadKalodata] influencer upsert:", inflErr.message);
    } else {
      creatorCount = inflRows.length;
    }
  }

  // 누적 수치 — DB 다시 조회해서 정확한 총량 표시
  const { count: totalProducts } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("case_id", c.id);
  const totalCreators = parsed.creators.length; // upsert 후 정확한 누적은 brand+case scope이 아니라 일단 이번 파싱분
  const brandRev =
    (mergedBrand.revenue_usd as number | null | undefined) ??
    parsed.brand_kpi.revenue_usd ??
    0;

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `Kalodata 적재 — 이번 [제품 ${productCount} · 크리에이터 ${creatorCount} · 영상 ${parsed.videos.length} · 라이브 ${parsed.lives.length}] · 누적 [제품 ${totalProducts ?? "?"} · 영상 ${mergedVideos.length} · 라이브 ${mergedLives.length}] · 브랜드 매출 $${brandRev.toLocaleString()} (${period_start} ~ ${period_end})`,
  };
}

/**
 * Kalodata Creator xlsx export 업로드 — Top N(예: 500) 크리에이터의
 * Live/Video GMV 분리, 컨택, 팔로워 등 풍부한 데이터를 한 번에 적재.
 *
 * influencers: handle 기반 upsert. lifetime_gmv_usd 갱신.
 * cases.key_stats.kalodata_creators_xlsx: row[]를 그대로 보관 (UI 표시·BP 분석용).
 */
export async function uploadKalodataCreatorsXlsx(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "xlsx 파일 비어있음" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "tiktok_shop") {
    return { ok: false, error: "TikTok Shop 케이스만" };
  }

  // SheetJS로 xlsx 파싱
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const listSheet =
    wb.Sheets["LIST_CREATOR"] ?? wb.Sheets[wb.SheetNames[0] ?? ""];
  const introSheet = wb.Sheets["Intro"];
  if (!listSheet) return { ok: false, error: "LIST_CREATOR 시트 없음" };
  const list = XLSX.utils.sheet_to_json(listSheet) as Record<string, unknown>[];
  const intro = introSheet
    ? (XLSX.utils.sheet_to_json(introSheet) as Record<string, unknown>[])
    : [];

  const parsed = parseKalodataCreatorXlsx({ list, intro });
  if (parsed.rows.length === 0) {
    return { ok: false, error: parsed.errors[0] ?? "xlsx 파싱 실패" };
  }

  // 1) influencers upsert (handle 키)
  const inflRows = parsed.rows.map((r) => ({
    platform: "tiktok" as const,
    external_id: r.handle,
    handle: r.handle,
    follower_count: r.followers,
    fans_source: "kalodata",
    lifetime_gmv_usd: r.revenue_usd,
  }));
  const { error: inflErr } = await supabase
    .from("influencers")
    .upsert(inflRows, {
      onConflict: "platform,external_id",
      ignoreDuplicates: false,
    });
  if (inflErr) {
    console.warn(
      "[uploadKalodataCreatorsXlsx] influencer upsert:",
      inflErr.message,
    );
  }

  // 2) cases.key_stats.kalodata_creators_xlsx 저장 (누적 머지, handle dedupe)
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", c.id)
    .single();
  const existingStats = (caseRow?.key_stats as Record<string, unknown>) ?? {};
  const existingCreators =
    (existingStats.kalodata_creators_xlsx as { handle: string }[] | undefined) ??
    [];
  const existingHandles = new Set(existingCreators.map((cc) => cc.handle));
  const merged = [
    ...existingCreators,
    ...parsed.rows.filter((r) => !existingHandles.has(r.handle)),
  ];
  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existingStats,
        kalodata_creators_xlsx: merged,
        kalodata_creators_meta: parsed.meta,
      },
    })
    .eq("id", c.id);

  revalidatePath(`/cases/${case_id}`);
  const livePct =
    parsed.rows.reduce(
      (acc, r) => acc + (r.live_gmv_usd ?? 0),
      0,
    ) /
    Math.max(
      parsed.rows.reduce((acc, r) => acc + (r.revenue_usd ?? 0), 0),
      1,
    );
  // Intro 시트(메타) 없는 export도 있어서 — 정보 있을 때만 보여줌
  const periodStr =
    parsed.meta.period_start && parsed.meta.period_end
      ? ` · ${parsed.meta.period_start}~${parsed.meta.period_end}`
      : "";
  const filterStr = parsed.meta.account_type_filter
    ? ` · ${parsed.meta.account_type_filter}`
    : "";

  return {
    ok: true,
    message: `Creator xlsx ${parsed.rows.length}명 적재 (누적 ${merged.length}명)${periodStr}${filterStr} · Live ${Math.round(livePct * 100)}%`,
  };
}

/**
 * Kalodata Video xlsx export 업로드 — Top N 영상의 풀 데이터 적재.
 *
 * 핵심: TikTokUrl이 있어서 contents 테이블에 url 기반으로 적재 →
 * Phase 4b Vision/클러스터링이 자동으로 픽업. 영상-제품 매핑, 광고 ROAS 같이.
 *
 * - products: Product Title 기반 upsert (external_product_id = "kalodata:<title>")
 * - contents: TikTokUrl 기반 upsert (caption, views, is_ad, uploaded_at, product_id, influencer_id)
 *   → Phase 4b에 들어감
 * - influencers: Creator Handle 기반 upsert (외부 ID = handle)
 * - cases.key_stats.kalodata_videos_xlsx: raw row[] 누적 (Ad ROAS·GPM 등 표시용)
 */
export async function uploadKalodataVideosXlsx(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Video xlsx 파일 비어있음" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "tiktok_shop") {
    return { ok: false, error: "TikTok Shop 케이스만" };
  }

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const listSheet =
    wb.Sheets["LIST_VIDEO"] ?? wb.Sheets[wb.SheetNames[0] ?? ""];
  const introSheet = wb.Sheets["Intro"];
  if (!listSheet) return { ok: false, error: "LIST_VIDEO 시트 없음" };
  const list = XLSX.utils.sheet_to_json(listSheet) as Record<string, unknown>[];
  const intro = introSheet
    ? (XLSX.utils.sheet_to_json(introSheet) as Record<string, unknown>[])
    : [];

  const parsed = parseKalodataVideoXlsx({ list, intro });
  if (parsed.rows.length === 0) {
    return { ok: false, error: parsed.errors[0] ?? "파싱 실패" };
  }

  const country = c.country;
  const period_start = parsed.meta.period_start ?? null;
  const period_end = parsed.meta.period_end ?? null;

  // 1) Products upsert — Product Title 기준 (external_product_id = "kalodata:<title>")
  const uniqueProducts = new Map<string, { title: string; category: string | null }>();
  for (const r of parsed.rows) {
    if (!r.product_title) continue;
    const key = r.product_title;
    if (!uniqueProducts.has(key)) {
      uniqueProducts.set(key, {
        title: r.product_title,
        category: r.product_category,
      });
    }
  }
  if (uniqueProducts.size > 0) {
    const productInserts = [...uniqueProducts.values()].map((p) => ({
      case_id: c.id,
      brand_id: c.brand_id,
      country,
      name: p.title,
      external_product_id: `kalodata:${p.title.slice(0, 220)}`,
      platform: "tiktok_shop",
      channel: "tiktok_shop" as const,
      category: p.category,
      subcategory: p.category,
    }));
    await supabase
      .from("products")
      .upsert(productInserts, {
        onConflict: "case_id,country,external_product_id",
      });
  }

  // product_id 매핑
  const { data: prodRows } = await supabase
    .from("products")
    .select("id, external_product_id")
    .eq("case_id", c.id)
    .eq("country", country);
  const productKeyToId = new Map(
    (prodRows ?? []).map((p) => [p.external_product_id ?? "", p.id]),
  );

  // 2) Influencers upsert — Creator Handle 기준
  const uniqueHandles = Array.from(
    new Set(
      parsed.rows.map((r) => r.creator_handle).filter((h): h is string => !!h),
    ),
  );
  if (uniqueHandles.length > 0) {
    const inflInserts = uniqueHandles.map((h) => ({
      platform: "tiktok" as const,
      external_id: h,
      handle: h,
      fans_source: "kalodata_video",
    }));
    await supabase.from("influencers").upsert(inflInserts, {
      onConflict: "platform,external_id",
      ignoreDuplicates: true,
    });
  }

  // influencer_id 매핑
  const { data: inflRows } = await supabase
    .from("influencers")
    .select("id, handle")
    .eq("platform", "tiktok")
    .in("handle", uniqueHandles);
  const handleToInflId = new Map(
    (inflRows ?? []).map((i) => [i.handle, i.id]),
  );

  // 3) Contents upsert — TikTokUrl 기준 (Phase 4b가 이걸 픽업)
  const contentInserts = parsed.rows.map((r) => {
    const productKey = r.product_title
      ? `kalodata:${r.product_title.slice(0, 220)}`
      : null;
    return {
      brand_id: c.brand_id,
      country,
      url: r.video_url,
      caption: r.description,
      uploaded_at: r.publish_date,
      views: r.views,
      is_ad: (r.ad_spend_usd ?? 0) > 0,
      influencer_id: r.creator_handle
        ? handleToInflId.get(r.creator_handle) ?? null
        : null,
      product_id: productKey ? productKeyToId.get(productKey) ?? null : null,
      duration_ms: r.duration_s != null ? r.duration_s * 1000 : null,
    };
  });

  // url 중복 처리 — 같은 url이 batch에 두 번 등장하면 postgres가 거부
  const dedupedContents = Array.from(
    new Map(contentInserts.map((c) => [c.url, c])).values(),
  );

  let contentsInserted = 0;
  for (let i = 0; i < dedupedContents.length; i += 500) {
    const batch = dedupedContents.slice(i, i + 500);
    const { error, count } = await supabase
      .from("contents")
      .upsert(batch, {
        onConflict: "url",
        ignoreDuplicates: false,
        count: "exact",
      });
    if (error) {
      return {
        ok: false,
        error: `content upsert (batch ${i}): ${error.message}`,
      };
    }
    contentsInserted += count ?? batch.length;
  }

  // 4) cases.key_stats.kalodata_videos_xlsx 누적 (raw + 광고 데이터 표시용)
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", c.id)
    .single();
  const existingStats = (caseRow?.key_stats as Record<string, unknown>) ?? {};
  const existingXlsxVideos =
    (existingStats.kalodata_videos_xlsx as { video_url: string }[] | undefined) ??
    [];
  const existingUrls = new Set(existingXlsxVideos.map((v) => v.video_url));
  const mergedXlsx = [
    ...existingXlsxVideos,
    ...parsed.rows.filter((r) => !existingUrls.has(r.video_url)),
  ];
  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existingStats,
        kalodata_videos_xlsx: mergedXlsx,
        kalodata_videos_meta: parsed.meta,
      } as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", c.id);

  // 광고 ROAS 평균 (요약)
  const adVideos = parsed.rows.filter((r) => (r.ad_spend_usd ?? 0) > 0);
  const avgRoas =
    adVideos.length > 0
      ? adVideos.reduce((acc, r) => acc + (r.ad_roas ?? 0), 0) / adVideos.length
      : null;

  const periodStr =
    period_start && period_end ? ` · ${period_start}~${period_end}` : "";

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `Video xlsx ${parsed.rows.length}개 적재 (누적 ${mergedXlsx.length}) · 제품 ${uniqueProducts.size} · 크리에이터 ${uniqueHandles.length}명 · 광고 ${adVideos.length}/${parsed.rows.length}${avgRoas != null ? ` (ROAS 평균 ${avgRoas.toFixed(2)})` : ""}${periodStr}`,
  };
}

/**
 * Exolyt social listener 주간 데이터 (brand_view_trends) 업로드.
 *
 * 컬럼 형식: `date, {anything}_views, {anything}_videos` — 사용자가 받는 CSV는
 * 브랜드 prefix가 컬럼명에 박힘 (예: drforhair_views). 두번째/세번째 컬럼이
 * 무조건 views/videos라고 가정해 row 단위로 적재.
 *
 * UPSERT on (brand_id, country, week_start) — 같은 주 중복 박으면 갱신.
 */
export async function uploadBrandViewTrends(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "file 없음" };

  const supabase = await createServer();
  const { data: c, error: caseErr } = await supabase
    .from("cases")
    .select("id, brand_id, country")
    .eq("id", case_id)
    .single();
  if (caseErr || !c) return { ok: false, error: "case 없음" };
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV에 데이터 row 없음" };
  }

  // 헤더: "date", "{brand}_views", "{brand}_videos" — quote 제거
  const splitCsv = (line: string): string[] =>
    line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const header = splitCsv(lines[0]!);
  if (header.length < 3) {
    return {
      ok: false,
      error: `CSV 컬럼 3개 필요 (date / views / videos), 받은 건 ${header.length}개`,
    };
  }

  // ISO date 검증
  const isoDate = (s: string): string | null => {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1] ?? null;
  };

  const rows: Array<{
    brand_id: string;
    country: string | null;
    week_start: string;
    total_views: number;
    total_videos: number;
    source: string;
  }> = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]!);
    if (cells.length < 3) continue;
    const week = isoDate(cells[0]!);
    if (!week) {
      errors.push(`row ${i + 1}: date 파싱 실패 (${cells[0]})`);
      continue;
    }
    const views = Number(cells[1]);
    const videos = Number(cells[2]);
    if (!Number.isFinite(views) || !Number.isFinite(videos)) {
      errors.push(`row ${i + 1}: 숫자 파싱 실패`);
      continue;
    }
    rows.push({
      brand_id: c.brand_id,
      country: c.country,
      week_start: week,
      total_views: Math.round(views),
      total_videos: Math.round(videos),
      source: "exolyt",
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: `적재할 row 0개${errors.length > 0 ? ` · 오류: ${errors[0]}` : ""}`,
    };
  }

  const { error: upErr } = await supabase
    .from("brand_view_trends")
    .upsert(rows, { onConflict: "brand_id,country,week_start,source" });
  if (upErr) {
    return { ok: false, error: `upsert: ${upErr.message}` };
  }

  revalidatePath(`/cases/${case_id}`);
  const periodStart = rows[0]?.week_start;
  const periodEnd = rows[rows.length - 1]?.week_start;
  const totalViews = rows.reduce((s, r) => s + r.total_views, 0);
  const totalVideos = rows.reduce((s, r) => s + r.total_videos, 0);
  return {
    ok: true,
    message: `주간 viral ${rows.length}주 적재 (${periodStart} ~ ${periodEnd}) · 총 조회수 ${(totalViews / 1_000_000).toFixed(1)}M · 영상 ${totalVideos.toLocaleString()}개${errors.length > 0 ? ` · 스킵 ${errors.length}건` : ""}`,
  };
}

/**
 * TikTok Shop US — 제품 단위 affiliate creator CSV 업로드.
 *
 * Source: TikTok Shop Seller Center → Product Detail → Affiliate Creators export.
 * 컬럼: Username · Nickname · Follower Count · Follower Demographics · Category ·
 * Engagement Rate · Items Sold (30d) · GMV (30d) · Videos · Number of Videos.
 *
 * 적재:
 *   1) influencers 업서트 (platform=tiktok, handle/follower 기반)
 *   2) contents 업서트 (Videos URL 리스트, url unique)
 *   3) cases.key_stats.tt_shop_us_affiliates raw 누적 (제품 단위로 들어올 수
 *      있어서 array merge by handle)
 *
 * 같은 제품에 대해 여러 번 export하면 누적되도록 handle 기준 dedupe.
 */
export async function uploadTiktokShopUsAffiliate(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "CSV 파일 비어있음" };
  }

  const { supabase, c } = await getCase(case_id);
  if (c.channel !== "tiktok_shop") {
    return { ok: false, error: "TikTok Shop 케이스만 지원" };
  }
  if (c.country !== "US") {
    return { ok: false, error: "US TikTok Shop 전용 (SEA는 Kalodata 사용)" };
  }
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  const text = await file.text();
  const parsed = parseTiktokShopUsAffiliate(text);
  if (parsed.rows.length === 0) {
    return { ok: false, error: parsed.errors[0] ?? "파싱된 행 0개" };
  }

  // 1) influencers 업서트 (platform=tiktok + handle 기준)
  const inflRows = parsed.rows.map((r) => ({
    platform: "tiktok" as const,
    external_id: r.handle,
    handle: r.handle,
    follower_count: r.follower_count,
    fans_source: "tt_shop_us_affiliate",
    lifetime_gmv_usd: r.gmv_30d_usd,
  }));
  const { error: inflErr } = await supabase
    .from("influencers")
    .upsert(inflRows, {
      onConflict: "platform,external_id",
      ignoreDuplicates: false,
    });
  if (inflErr) {
    console.warn("[uploadTiktokShopUsAffiliate] influencer upsert:", inflErr.message);
  }

  // 2) influencer id 매핑
  const { data: inflRowsBack } = await supabase
    .from("influencers")
    .select("id, external_id")
    .eq("platform", "tiktok")
    .in(
      "external_id",
      parsed.rows.map((r) => r.handle),
    );
  const handleToId = new Map(
    (inflRowsBack ?? []).map((x) => [x.external_id ?? "", x.id]),
  );

  // 3) contents 업서트 (url unique). Videos URL 모두 풀어서 박음.
  const contentInserts: Array<{
    url: string;
    brand_id: string;
    country: string;
    influencer_id: string | null;
    is_ad: boolean;
  }> = [];
  for (const r of parsed.rows) {
    const influencer_id = handleToId.get(r.handle) ?? null;
    for (const url of r.videos) {
      contentInserts.push({
        url,
        brand_id: c.brand_id,
        country: c.country,
        influencer_id,
        is_ad: false,
      });
    }
  }
  // url dedupe (같은 영상이 여러 export에 있을 수 있음)
  const uniqueContents = Array.from(
    new Map(contentInserts.map((c) => [c.url, c])).values(),
  );

  let contentInserted = 0;
  if (uniqueContents.length > 0) {
    const { error: contentErr, count } = await supabase
      .from("contents")
      .upsert(uniqueContents, {
        onConflict: "url",
        ignoreDuplicates: false,
        count: "exact",
      });
    if (contentErr) {
      console.warn(
        "[uploadTiktokShopUsAffiliate] content upsert:",
        contentErr.message,
      );
    }
    contentInserted = count ?? uniqueContents.length;
  }

  // 4) cases.key_stats.tt_shop_us_affiliates 누적 (handle dedupe)
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const existingStats = (caseRow?.key_stats ?? {}) as Record<string, unknown>;
  const existingAffiliates = Array.isArray(
    existingStats["tt_shop_us_affiliates"],
  )
    ? (existingStats["tt_shop_us_affiliates"] as Array<{ handle: string }>)
    : [];
  const merged = new Map<string, unknown>();
  for (const e of existingAffiliates) {
    if (e?.handle) merged.set(e.handle, e);
  }
  for (const r of parsed.rows) {
    merged.set(r.handle, r);
  }
  const mergedArr = Array.from(merged.values());
  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existingStats,
        tt_shop_us_affiliates: mergedArr,
        tt_shop_us_affiliates_updated_at: new Date().toISOString(),
      } as never,
    })
    .eq("id", case_id);

  // 요약
  const totalGmv = parsed.rows.reduce((s, r) => s + (r.gmv_30d_usd ?? 0), 0);
  const totalItems = parsed.rows.reduce(
    (s, r) => s + (r.items_sold_30d ?? 0),
    0,
  );

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `affiliate ${parsed.rows.length}명 적재 (누적 ${mergedArr.length}) · 영상 ${contentInserted}개 · 30일 GMV $${totalGmv.toLocaleString()} · 판매 ${totalItems.toLocaleString()}개`,
  };
}
