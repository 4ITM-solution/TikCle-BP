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
import { parseTiktokProductFinder } from "@/lib/parsers/tt-product-finder";
import { extractAsinFromFilename } from "@/lib/parsers/utils";
import { inngest, mapOldForceToStages } from "@/lib/inngest/client";
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
  // A 모델: case.channel check 제거 — 다채널 자유 (Amazon 매출/BSR 데이터는 어느 case 든 업로드 가능)

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

  // 3.5 (WS5 §5) delete-후-재삽입 손실 창 제거 — 기존엔 통째 delete 후 upsert라
  // upsert 실패 시 시계열 전체가 사라졌음. upsert가 멱등 키(product_id,channel,collected_at)를
  // 가지므로 순서를 뒤집는다: ①upsert 먼저 → ②새 파일에 없는 stale 행만 명시적 삭제(R12).
  // stale 삭제로 "잘못된 파일 잔재 자동 정리"라는 기존 reset 목적은 유지.

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

  // 5. stale 정리 — 새 export에 없는 collected_at만 골라 명시적 id 목록으로 삭제 (R12).
  // upsert가 이미 성공했으므로 이 단계가 실패해도 데이터 손실은 없다 (잔재만 남음).
  {
    // 컬럼 타입 date → "YYYY-MM-DD"로 반환되지만, 타입이 바뀌어도 오판으로 전량 삭제되지
    // 않게 양쪽 다 날짜부(10자)로 정규화해 비교한다.
    const newDates = new Set(dedupedRows.map((r) => r.collected_at.slice(0, 10)));
    const { data: existing, error: exErr } = await supabase
      .from("sales_snapshot")
      .select("id, collected_at")
      .eq("product_id", prod.id)
      .eq("channel", "amazon")
      .limit(10000);
    if (!exErr && existing) {
      const staleIds = existing
        .filter(
          (r) => r.collected_at && !newDates.has(String(r.collected_at).slice(0, 10)),
        )
        .map((r) => r.id);
      for (let i = 0; i < staleIds.length; i += BATCH) {
        const { error: delErr } = await supabase
          .from("sales_snapshot")
          .delete()
          .in("id", staleIds.slice(i, i + BATCH));
        if (delErr) {
          console.warn(`[bsr] stale 정리 실패(데이터 손실 아님): ${delErr.message}`);
          break;
        }
      }
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

  // migration 020에서 case_video_assets·pipeline_runs drop → 리셋 목록에서 제거.
  for (const t of [
    "case_video_analyses",
    "case_product_sales",
    "content_clusters",
    "meta_ads",
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

/**
 * Phase 1.5만 트리거 — TT Shop US 케이스에서 본 분석 시작 전에 products만 채우기.
 * 사용처: Helium10 paste / Affiliate CSV 슬롯이 product 드롭다운 필요한데
 * draft 상태에선 Apify가 안 돌아서 products 0개라 슬롯 비활성. 이 액션으로
 * Phase 1.5만 trigger → 끝나면 products 박혀서 paste/CSV 박을 수 있게 됨.
 * status는 'running' 임시로 바꿨다가 Phase 1.5 끝나면 case-run-analysis가
 * early return하므로 'ready'로 못 가고, 다른 작업이 status 안 되돌리면 stuck
 * 가능 — onFailure handler가 'ready'로 바꿔주지만 phase15_only success path는
 * status 안 건드림 → 별도 정리 필요.
 *
 * 처리: phase15_only success path도 status를 'draft'로 되돌림 (case-run-analysis
 * 안에서 early return 전에).
 */
export async function startPhase15Only(case_id: string): Promise<Result> {
  const { supabase, c } = await getCase(case_id);
  // A 모델: case.channel check 제거 — 다채널 자유. country 는 데이터 소스 구분 (US=Helium10).
  if (c.country !== "US") {
    return { ok: false, error: "US 전용 (비US TikTok Shop 은 Kalodata 업로드 사용)" };
  }
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  // status 'running'으로 설정 (UI에서 진행 중 표시)
  const { error: updErr } = await supabase
    .from("cases")
    .update({ status: "running" })
    .eq("id", case_id);
  if (updErr) return { ok: false, error: updErr.message };

  try {
    await inngest.send({
      name: "case/start.analysis",
      data: {
        case_id,
        phase15_only: true,
        force_phases: ["phase1_5"], // 캐시 무시하고 항상 새로
      },
    });
  } catch (e) {
    // 실패 시 status 'draft' 되돌리기
    await supabase
      .from("cases")
      .update({ status: "draft" })
      .eq("id", case_id);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Inngest send 실패",
    };
  }

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message:
      "Phase 1.5 시작 — 약 5~30분 소요. products 박힌 후 새로고침하면 Helium10 / Affiliate 슬롯 활성화돼요.",
  };
}

export async function startAnalysis(
  case_id: string,
  force_phases?: PhaseKey[],
  opts?: { skipAutoForce?: boolean },
): Promise<Result> {
  const { supabase } = await getCase(case_id);

  // ─── WS2: 단독 phase 재실행 (PhaseProgress 개별 버튼) → case/phase.requested ───
  // 구 방식(force_phases로 전체 runAnalysis 재기동) 대신 해당 스테이지 함수만 직접 실행.
  // status를 'running'으로 바꾸지 않음 — phase 함수가 phase_runs로 상태 추적.
  if (opts?.skipAutoForce && force_phases && force_phases.length > 0) {
    const stages = mapOldForceToStages(force_phases);
    try {
      for (const stage of stages) {
        await inngest.send({
          name: "case/phase.requested",
          data: { case_id, phase: stage, force: true },
        });
      }
    } catch (e) {
      return {
        ok: false,
        error: `Inngest send 실패: ${e instanceof Error ? e.message : e}`,
      };
    }
    revalidatePath(`/cases/${case_id}`);
    return {
      ok: true,
      message: `phase 재실행: ${force_phases.join(", ")} → ${stages.join(", ")}`,
    };
  }

  // skipped_reason 박힌 phase는 자동으로 force에 포함.
  // 이유: 옛 케이스 (brand_keyword 비어있어 phase4a skip, max_tokens 부족으로 phase4b_clusters
  // skip 등)는 cached skip 결과 그대로 반환돼 글로벌 재실행 눌러도 갱신 안 됨.
  // skipped_reason 있으면 "재시도해야 함"으로 간주.
  //
  // ⚠️ 단독 phase 재실행 (PhaseProgress의 개별 phase "재실행" 버튼) 시에는 autoForce 끔.
  // 그렇지 않으면 정상 skip인 phase (예: "샘플 0개", "Unknown 0명")까지 force돼서
  // clockworks fail 같은 의도치 않은 부작용 발생.
  let autoForced: PhaseKey[] = [];
  if (!opts?.skipAutoForce) {
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
      // phase4c / phase4d는 BP 분석 전용 — autoForce 안 함. ig/yt_config 없는 케이스도 skip이라.
    ];
    autoForced = phaseKeysToCheck.filter((k) => ks[k]?.skipped_reason);
  }
  const merged = Array.from(
    new Set([...(force_phases ?? []), ...autoForced]),
  );

  // status=running + 동시에 옛 last_error clear (직전 실패 흔적이 ready 시점까지 남아있던 버그 fix)
  const { data: caseRowForClear } = await supabase
    .from("cases")
    .select("status, key_stats")
    .eq("id", case_id)
    .single();
  const priorStatus = caseRowForClear?.status ?? "draft";
  const ksClear = (caseRowForClear?.key_stats ?? {}) as Record<string, unknown>;
  if ("last_error" in ksClear) delete ksClear.last_error;
  const { error } = await supabase
    .from("cases")
    .update({ status: "running", key_stats: ksClear as never })
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
    // BE-10 (CX1-F1): 이벤트 발행 실패를 성공으로 위장하지 않는다. 발행이 실패하면
    //   오케스트레이터가 영원히 안 도는데 status만 running으로 박제되므로 →
    //   직전 status로 원복 + last_error 기록 + ok:false 반환(호출부/화면이 실패를 인지).
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[startAnalysis] Inngest send 실패:", msg);
    await supabase
      .from("cases")
      .update({
        status: priorStatus,
        key_stats: {
          ...ksClear,
          last_error: {
            message: `event_dispatch_failed: ${msg}`.slice(0, 500),
            at: new Date().toISOString(),
          },
        } as never,
      })
      .eq("id", case_id);
    return {
      ok: false,
      error: `분석 시작 이벤트 발행 실패(재시도 필요): ${msg}`,
    };
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
  // A 모델: case.channel check 제거 — 다채널 자유 (Shopee 데이터 업로드 case 채널 무관)

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
  // A 모델: case.channel check 제거 — 다채널 자유 (Shopee 데이터 업로드 case 채널 무관)

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
  // A 모델: case.channel 의미 없음 — 한 case 다채널. Kalodata 데이터는 products.channel='tiktok_shop' 박아 적재.

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
    (existingStats.kalodata_videos as {
      caption: string;
      revenue_usd?: number | null;
      views?: number | null;
      publish_date?: string | null;
    }[] | undefined) ?? [];
  // dedupe (Kalodata가 한 영상에 unique id 안 줘서) — caption 단독은 위험:
  //   캡션 없는 영상(설명 X)이 여럿이면 caption="" 끼리 충돌해 두 번째가 통째로 누락됨.
  //   → caption + 매출 + 조회수 + 게시일 조합을 키로 사용.
  const videoKey = (v: {
    caption: string;
    revenue_usd?: number | null;
    views?: number | null;
    publish_date?: string | null;
  }) => `${v.caption}@${v.revenue_usd ?? ""}@${v.views ?? ""}@${v.publish_date ?? ""}`;
  const existingVideoKeys = new Set(existingVideos.map(videoKey));
  const mergedVideos = [
    ...existingVideos,
    ...parsed.videos.filter((v) => !existingVideoKeys.has(videoKey(v))),
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

  // ★ 기간별 브랜드 KPI 시계열 — period_end 키로 누적(덮어쓰기 X). 화면 기간 토글용.
  //   실제 Core Metrics(기간+매출)가 파싱된 복붙일 때만 그 기간 entry 저장. 제품만 붙인
  //   복붙(brand_kpi 전부 null)은 기간 entry 안 만듦(오늘 날짜로 오염 방지).
  const existingPeriods =
    (existingStats.kalodata_brand_periods as Record<string, unknown>) ?? {};
  const mergedPeriods: Record<string, unknown> = { ...existingPeriods };
  if (parsed.brand_kpi.period_end && parsed.brand_kpi.revenue_usd != null) {
    mergedPeriods[parsed.brand_kpi.period_end] = {
      ...parsed.brand_kpi,
      captured_at: new Date().toISOString(),
    };
  }

  const newStats = {
    ...existingStats,
    kalodata_brand: mergedBrand,
    kalodata_brand_periods: mergedPeriods,
    kalodata_videos: mergedVideos,
    kalodata_lives: mergedLives,
  } as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from("cases").update({ key_stats: newStats as any }).eq("id", c.id);

  // 2) Products upsert
  let productCount = 0;
  if (parsed.products.length > 0) {
    // 같은 이름(앞 220자) 제품이 둘 이상이면 external_product_id가 같아져 upsert 배치 내
    //   conflict 키 중복 → "ON CONFLICT DO UPDATE cannot affect row a second time" 에러.
    //   매출 큰 행만 남겨 dedup (제품·매출 둘 다 이걸로 빌드).
    const byExtId = new Map<string, (typeof parsed.products)[number]>();
    for (const p of parsed.products) {
      const key = `kalodata:${p.name.slice(0, 220)}`;
      const prev = byExtId.get(key);
      if (!prev || (p.revenue_usd ?? 0) > (prev.revenue_usd ?? 0)) {
        byExtId.set(key, p);
      }
    }
    const dedupedProducts = [...byExtId.values()];
    const productInserts = dedupedProducts.map((p) => ({
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

    const salesInserts = dedupedProducts
      .map((p) => {
        const product_id = extToId.get(`kalodata:${p.name.slice(0, 220)}`);
        if (!product_id) return null;
        return {
          case_id: c.id,
          product_id,
          country: c.country,
          // units_30d는 integer 컬럼 — K/M 변환 시 float 오차 (4.06k → 4059.9999...) 박힘.
          // Math.round로 정수화.
          units_30d: p.item_sold != null ? Math.round(p.item_sold) : null,
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
  // A 모델: case.channel check 제거 — 한 case 다채널 자유

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
  //   lifetime_gmv_usd 는 video GMV 기준(라이브 커머스 GMV 제외) — 인플 풀은
  //   "시딩(영상) 기여" 신호라 라이브 매출이 섞이면 안 됨. video_gmv 없으면(컬럼
  //   부재) 총매출로 폴백. 순수 라이브 크리에이터는 video_gmv=0 → 풀에서 자연 제외.
  const inflRows = parsed.rows.map((r) => ({
    platform: "tiktok" as const,
    external_id: r.handle,
    handle: r.handle,
    follower_count: r.followers,
    fans_source: "kalodata",
    lifetime_gmv_usd: r.video_gmv_usd ?? r.revenue_usd,
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
  // A 모델: case.channel check 제거 — 한 case 다채널 자유

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
  const product_id = String(formData.get("product_id") ?? "").trim();
  if (!product_id) {
    return {
      ok: false,
      error: "product_id 필수 — 어느 제품 export인지 선택해주세요",
    };
  }
  const period_end = String(formData.get("period_end") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return {
      ok: false,
      error: "period_end 필수 — YYYY-MM-DD 형식 기준일을 선택해주세요",
    };
  }

  const { supabase, c } = await getCase(case_id);
  // A 모델: case.channel check 제거 — 다채널 자유
  if (c.country !== "US") {
    return { ok: false, error: "US 전용 (SEA는 Kalodata 사용)" };
  }
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  // product 매핑 검증
  const { data: prodRow, error: prodErr } = await supabase
    .from("products")
    .select("id, name, asin, external_product_id")
    .eq("id", product_id)
    .eq("case_id", case_id)
    .maybeSingle();
  if (prodErr || !prodRow) {
    return {
      ok: false,
      error: `이 케이스에 속한 product가 아닙니다 (id=${product_id})`,
    };
  }
  const productLabel = prodRow.asin
    ? `${prodRow.asin} · ${prodRow.name?.slice(0, 60) ?? ""}`
    : (prodRow.name?.slice(0, 60) ?? product_id);

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

  // 3) contents 업서트 (url unique). Videos URL 모두 풀어서 박음. product_id 매핑.
  const contentInserts: Array<{
    url: string;
    brand_id: string;
    country: string;
    influencer_id: string | null;
    product_id: string;
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
        product_id,
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

  // 4) cases.key_stats.tt_shop_us_affiliates 누적
  //    Dedupe key = `${handle}@${product_id}@${period_end}` — 같은 affiliate가
  //    다른 제품/시점에 대해 별도 GMV/Items 보존. 같은 (제품, affiliate, 시점)
  //    재업로드만 덮어쓰기.
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const existingStats = (caseRow?.key_stats ?? {}) as Record<string, unknown>;
  const existingAffiliates = Array.isArray(
    existingStats["tt_shop_us_affiliates"],
  )
    ? (existingStats["tt_shop_us_affiliates"] as Array<{
        handle: string;
        product_id?: string;
        period_end?: string;
      }>)
    : [];
  const merged = new Map<string, unknown>();
  for (const e of existingAffiliates) {
    if (e?.handle) {
      const k = `${e.handle}@${e.product_id ?? ""}@${e.period_end ?? ""}`;
      merged.set(k, e);
    }
  }
  for (const r of parsed.rows) {
    const k = `${r.handle}@${product_id}@${period_end}`;
    merged.set(k, { ...r, product_id, period_end });
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
    message: `[${productLabel}] affiliate ${parsed.rows.length}명 적재 (누적 ${mergedArr.length}) · 영상 ${contentInserted}개 · 30일 GMV $${totalGmv.toLocaleString()} · 판매 ${totalItems.toLocaleString()}개 · 기준 ${period_end}`,
  };
}

/**
 * Helium10 TT Product Finder paste dry-run — 적재 안 하고 diff만 계산해서 반환.
 * UI에서 사용자에게 "이렇게 박혀" 미리보기 → 확인 후 commit.
 */
export type TtProductFinderDryRun = {
  ok: true;
  parsed: ReturnType<typeof parseTiktokProductFinder>;
  product: {
    id: string;
    name: string;
    asin: string | null;
  };
  diff: {
    price: { from: number | null; to: number | null; changed: boolean };
    launch_date: {
      from: string | null;
      to: string | null;
      changed: boolean;
    };
    subcategory: {
      from: string | null;
      to: string | null;
      changed: boolean;
    };
    sales_30d: {
      revenue_from: number | null;
      revenue_to: number | null;
      units_from: number | null;
      units_to: number | null;
      changed: boolean;
    };
    has_existing_helium10_for_period: boolean;
  };
};

export async function dryRunTiktokProductFinder(
  case_id: string,
  formData: FormData,
): Promise<{ ok: true; preview: TtProductFinderDryRun } | { ok: false; error: string }> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "텍스트 비어있음" };
  const product_id = String(formData.get("product_id") ?? "").trim();
  if (!product_id) return { ok: false, error: "product_id 필수" };
  const period_days = String(formData.get("period_days") ?? "30").trim();
  if (!["7", "14", "30"].includes(period_days)) {
    return { ok: false, error: "period_days 7/14/30 중 하나" };
  }
  const period_end = String(formData.get("period_end") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return { ok: false, error: "period_end YYYY-MM-DD 형식" };
  }

  const { supabase, c } = await getCase(case_id);
  // A 모델: case.channel check 제거 — 다채널 자유. country 는 데이터 소스 구분 (US=Helium10).
  if (c.country !== "US") {
    return { ok: false, error: "US 전용 (비US TikTok Shop 은 Kalodata 업로드 사용)" };
  }

  const { data: prodRow } = await supabase
    .from("products")
    .select("id, name, asin, price, launch_date, subcategory")
    .eq("id", product_id)
    .eq("case_id", case_id)
    .maybeSingle();
  if (!prodRow) return { ok: false, error: "이 케이스의 product 아님" };

  const parsed = parseTiktokProductFinder(text);
  if (parsed.errors.length > 0) {
    return { ok: false, error: parsed.errors.join(" · ") };
  }

  // 기존 case_product_sales 확인 (같은 period_end)
  const { data: existingSales } = await supabase
    .from("case_product_sales")
    .select("revenue_30d, units_30d, source")
    .eq("case_id", case_id)
    .eq("product_id", product_id)
    .eq("period_end", period_end)
    .maybeSingle();

  // 기존 helium10 데이터
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const existingHelium = ((caseRow?.key_stats as Record<string, unknown>)?.[
    "tt_shop_us_helium10"
  ] ?? {}) as Record<string, { periods?: Record<string, unknown> }>;
  const periodKey = `${period_days}d@${period_end}`;
  const has_existing_helium10_for_period = !!existingHelium[product_id]?.periods?.[periodKey];

  return {
    ok: true,
    preview: {
      ok: true,
      parsed,
      product: {
        id: prodRow.id,
        name: prodRow.name,
        asin: prodRow.asin,
      },
      diff: {
        price: {
          from: prodRow.price != null ? Number(prodRow.price) : null,
          to: parsed.price_usd,
          changed:
            parsed.price_usd != null &&
            Number(prodRow.price ?? 0) !== parsed.price_usd,
        },
        launch_date: {
          from: prodRow.launch_date,
          to: parsed.listed_date,
          changed:
            !!parsed.listed_date && prodRow.launch_date !== parsed.listed_date,
        },
        subcategory: {
          from: prodRow.subcategory,
          to: parsed.subcategory,
          changed:
            !!parsed.subcategory && prodRow.subcategory !== parsed.subcategory,
        },
        sales_30d: {
          revenue_from:
            existingSales?.revenue_30d != null
              ? Number(existingSales.revenue_30d)
              : null,
          revenue_to: parsed.period_gmv_usd,
          units_from: existingSales?.units_30d ?? null,
          units_to: parsed.period_items_sold,
          changed:
            existingSales?.revenue_30d != null
              ? Number(existingSales.revenue_30d) !==
                (parsed.period_gmv_usd ?? 0)
              : parsed.period_gmv_usd != null,
        },
        has_existing_helium10_for_period,
      },
    },
  };
}

/**
 * Helium10 TikTok Product Finder commit — dry-run에서 확인한 데이터 실제 적재.
 * Undo용 이전 상태 snapshot도 같이 박음.
 *
 * Apify scraper(`tiktok_shop_scraper`)가 박는 매출 데이터가 변형 옵션 가격
 * 가정 차이로 28배 과대평가되는 경우가 있음 (NOONI Lip Oil 검증). Helium10이
 * 훨씬 정확.
 */
export async function uploadTiktokProductFinder(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, error: "텍스트 비어있음" };

  const product_id = String(formData.get("product_id") ?? "").trim();
  if (!product_id) {
    return { ok: false, error: "product_id 필수 — 제품 선택 해주세요" };
  }
  const period_days = String(formData.get("period_days") ?? "30").trim();
  if (!["7", "14", "30"].includes(period_days)) {
    return { ok: false, error: "period_days 7/14/30 중 하나" };
  }
  const period_end = String(formData.get("period_end") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    return { ok: false, error: "period_end YYYY-MM-DD 형식 필요" };
  }

  const { supabase, c } = await getCase(case_id);
  // A 모델: case.channel check 제거 — 다채널 자유. country 는 데이터 소스 구분 (US=Helium10).
  if (c.country !== "US") {
    return { ok: false, error: "US 전용 (비US TikTok Shop 은 Kalodata 업로드 사용)" };
  }
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  // product 검증 (Undo snapshot용으로 기존 메타도 같이 가져옴)
  const { data: prodRow } = await supabase
    .from("products")
    .select("id, name, asin, external_product_id, price, launch_date, subcategory")
    .eq("id", product_id)
    .eq("case_id", case_id)
    .maybeSingle();
  if (!prodRow) {
    return { ok: false, error: `이 케이스에 속한 product가 아닙니다` };
  }

  const parsed = parseTiktokProductFinder(text);
  if (parsed.errors.length > 0) {
    return { ok: false, error: parsed.errors.join(" · ") };
  }

  // period_start 계산
  const periodEndDate = new Date(period_end);
  const periodStartDate = new Date(periodEndDate);
  periodStartDate.setUTCDate(
    periodStartDate.getUTCDate() - Number(period_days),
  );
  const period_start = periodStartDate.toISOString().slice(0, 10);

  // Undo snapshot용 — 기존 case_product_sales row + helium10 entry
  const { data: existingSalesRow } = await supabase
    .from("case_product_sales")
    .select("*")
    .eq("case_id", case_id)
    .eq("product_id", product_id)
    .eq("period_end", period_end)
    .maybeSingle();

  // 1) products 메타 업데이트 (Helium10 데이터로 override)
  const productUpdates: {
    price?: number;
    launch_date?: string;
    subcategory?: string;
  } = {};
  if (parsed.price_usd != null) productUpdates.price = parsed.price_usd;
  if (parsed.listed_date) productUpdates.launch_date = parsed.listed_date;
  if (parsed.subcategory) productUpdates.subcategory = parsed.subcategory;
  if (Object.keys(productUpdates).length > 0) {
    const { error: prodErr } = await supabase
      .from("products")
      .update(productUpdates)
      .eq("id", product_id);
    if (prodErr) {
      return { ok: false, error: `products 업데이트: ${prodErr.message}` };
    }
  }

  // 2) case_product_sales upsert (period_days 기준 매출/판매량)
  if (parsed.period_gmv_usd != null || parsed.period_items_sold != null) {
    const { error: salesErr } = await supabase
      .from("case_product_sales")
      .upsert(
        [
          {
            case_id: c.id,
            product_id,
            country: c.country,
            units_30d: parsed.period_items_sold,
            revenue_30d: parsed.period_gmv_usd,
            price: parsed.price_usd,
            currency: "USD",
            period_start,
            period_end,
            source: "helium10_tt_finder",
          },
        ],
        { onConflict: "case_id,product_id,period_end" },
      );
    if (salesErr) {
      console.warn(
        "[uploadTiktokProductFinder] sales upsert:",
        salesErr.message,
      );
    }
  }

  // 3) cases.key_stats.tt_shop_us_helium10 raw 누적
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const existingStats = (caseRow?.key_stats ?? {}) as Record<string, unknown>;
  const existingHelium = (existingStats["tt_shop_us_helium10"] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const productKey = product_id;
  const existingForProduct = (existingHelium[productKey] ?? {}) as Record<
    string,
    unknown
  >;

  // 같은 (product_id, period_end, period_days) 재업로드 시 덮어쓰기
  const periodKey = `${period_days}d@${period_end}`;
  const existingPeriods = (existingForProduct["periods"] ?? {}) as Record<
    string,
    unknown
  >;

  const merged: Record<string, unknown> = {
    ...existingForProduct,
    product_name: parsed.product_name,
    shop_name: parsed.shop_name,
    rating: parsed.rating,
    listed_date: parsed.listed_date,
    category_path: parsed.category_path,
    subcategory: parsed.subcategory,
    price_usd: parsed.price_usd,
    lifetime_items_sold: parsed.lifetime_items_sold,
    lifetime_gmv_usd: parsed.lifetime_gmv_usd,
    lifetime_relevant_influencers: parsed.lifetime_relevant_influencers,
    lifetime_relevant_videos: parsed.lifetime_relevant_videos,
    periods: {
      ...existingPeriods,
      [periodKey]: {
        period_days: Number(period_days),
        period_start,
        period_end,
        items_sold: parsed.period_items_sold,
        gmv_usd: parsed.period_gmv_usd,
        new_videos: parsed.period_new_videos,
        new_influencers: parsed.period_new_influencers,
        captured_at: new Date().toISOString(),
      },
    },
  };

  const newHelium = {
    ...existingHelium,
    [productKey]: merged,
  };

  // Undo snapshot — 직전 상태 보관 (사용자가 "방금 적재 취소" 누를 때 복원용)
  const undoSnapshot = {
    type: "helium10_product_finder",
    case_id,
    product_id,
    captured_at: new Date().toISOString(),
    prev_products: {
      price: prodRow.price,
      launch_date: prodRow.launch_date,
      subcategory: prodRow.subcategory,
    },
    prev_case_product_sales: existingSalesRow ?? null, // null이면 신규 INSERT라 삭제로 롤백
    prev_helium10_entry: existingHelium[productKey] ?? null, // null이면 신규 추가
    period_end,
    period_days,
  };

  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existingStats,
        tt_shop_us_helium10: newHelium,
        _last_undo: undoSnapshot,
      } as never,
    })
    .eq("id", case_id);

  revalidatePath(`/cases/${case_id}`);
  const productLabel = parsed.product_name
    ? parsed.product_name.slice(0, 50) +
      (parsed.product_name.length > 50 ? "…" : "")
    : prodRow.name?.slice(0, 50) ?? product_id;
  return {
    ok: true,
    message: `[${productLabel}] Helium10 적재 OK · Listed ${parsed.listed_date ?? "—"} · Rating ${parsed.rating ?? "—"} · Lifetime $${(parsed.lifetime_gmv_usd ?? 0).toLocaleString()} (${parsed.lifetime_items_sold?.toLocaleString() ?? "—"} 판매) · Last ${period_days}d $${(parsed.period_gmv_usd ?? 0).toLocaleString()} (신규 영상 ${parsed.period_new_videos ?? 0} · 신규 인플 ${parsed.period_new_influencers ?? 0})`,
  };
}

/**
 * 마지막 helium10 paste 적재 롤백.
 * cases.key_stats._last_undo에 박힌 snapshot으로 prev 상태 복원.
 */
export async function undoLastTiktokProductFinder(
  case_id: string,
): Promise<Result> {
  const { supabase } = await getCase(case_id);
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const stats = (caseRow?.key_stats ?? {}) as Record<string, unknown>;
  const undo = stats["_last_undo"] as
    | {
        type: string;
        product_id: string;
        prev_products: {
          price: number | null;
          launch_date: string | null;
          subcategory: string | null;
        };
        prev_case_product_sales: Record<string, unknown> | null;
        prev_helium10_entry: Record<string, unknown> | null;
        period_end: string;
      }
    | undefined;

  if (!undo || undo.type !== "helium10_product_finder") {
    return { ok: false, error: "롤백할 직전 적재 없음" };
  }

  // 1) products 메타 복원
  await supabase
    .from("products")
    .update({
      price: undo.prev_products.price,
      launch_date: undo.prev_products.launch_date,
      subcategory: undo.prev_products.subcategory,
    })
    .eq("id", undo.product_id);

  // 2) case_product_sales 복원
  if (undo.prev_case_product_sales) {
    // 기존 row 있었음 → 그 값으로 복원
    await supabase
      .from("case_product_sales")
      .upsert([undo.prev_case_product_sales as never], {
        onConflict: "case_id,product_id,period_end",
      });
  } else {
    // 기존 row 없었음 → 추가된 row 삭제
    await supabase
      .from("case_product_sales")
      .delete()
      .eq("case_id", case_id)
      .eq("product_id", undo.product_id)
      .eq("period_end", undo.period_end)
      .eq("source", "helium10_tt_finder");
  }

  // 3) cases.key_stats.tt_shop_us_helium10[product_id] 복원
  const existingHelium = ((stats["tt_shop_us_helium10"] ?? {}) as Record<
    string,
    unknown
  >);
  if (undo.prev_helium10_entry) {
    existingHelium[undo.product_id] = undo.prev_helium10_entry;
  } else {
    delete existingHelium[undo.product_id];
  }
  // _last_undo 제거 (중복 undo 방지)
  const newStats = { ...stats, tt_shop_us_helium10: existingHelium };
  delete (newStats as Record<string, unknown>)["_last_undo"];

  await supabase
    .from("cases")
    .update({ key_stats: newStats as never })
    .eq("id", case_id);

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `직전 Helium10 적재 롤백 완료 (product ${undo.product_id.slice(0, 8)}… · 기준 ${undo.period_end})`,
  };
}

/**
 * YouTube Data API로 키워드 검색해서 시딩 영상 풀 자동 수집.
 *
 * 흐름:
 *   1. 사용자 입력 keywords[] (예: ["Ninja CREAMi", "Ninja Swirl", "Ninja Slushi"])
 *   2. 각 키워드로 YouTube 검색 (date 내림차순, regionCode = case.country)
 *   3. 영상 metadata + 채널 metadata 받음
 *   4. influencers 업서트 (platform='youtube', external_id=channelId, follower=subs)
 *   5. contents 업서트 (url unique)
 *   6. cases.key_stats.youtube_seeding raw 누적 (search_term별 분리)
 *
 * Quota: 키워드당 ~102 units. 일일 10K 무료 → 케이스당 키워드 3-5개 적절.
 */
export async function fetchYoutubeSeeding(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  // 1) Input 파싱
  const keywordsRaw = String(formData.get("keywords") ?? "").trim();
  if (!keywordsRaw) return { ok: false, error: "검색 키워드 입력 필요" };
  const keywords = keywordsRaw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10); // safety cap
  if (keywords.length === 0) {
    return { ok: false, error: "유효한 키워드 없음" };
  }
  const maxResultsPerKw = Number(formData.get("max_results") ?? "50");
  const order = String(formData.get("order") ?? "date") as
    | "relevance"
    | "date"
    | "viewCount";
  const publishedAfter = String(formData.get("published_after") ?? "").trim();

  const { supabase, c } = await getCase(case_id);
  if (!c.brand_id) return { ok: false, error: "case에 brand_id 없음" };

  // 2) YouTube API import (lazy — env 없으면 명확한 에러)
  let searchYoutubeFullData;
  let subscribersToTier;
  let parseDuration;
  let classifyYoutubeContent;
  try {
    const yt = await import("@/lib/youtube/api");
    searchYoutubeFullData = yt.searchYoutubeFullData;
    subscribersToTier = yt.subscribersToTier;
    parseDuration = yt.parseDuration;
    classifyYoutubeContent = yt.classifyYoutubeContent;
  } catch (e) {
    return {
      ok: false,
      error: `YouTube API 모듈 로드 실패: ${e instanceof Error ? e.message : e}`,
    };
  }

  // 3) 각 키워드로 검색 + 영상 + 채널 풀 수집
  const allVideos: Array<{
    keyword: string;
    videoId: string;
    url: string;
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    duration_s: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    contentClass: "ad" | "seeded" | "organic";
    tags: string[];
  }> = [];
  const channelMap = new Map<
    string,
    {
      handle: string | null;
      title: string;
      subscriberCount: number | null;
      viewCount: number;
      videoCount: number;
    }
  >();

  for (const kw of keywords) {
    try {
      const r = await searchYoutubeFullData({
        query: kw,
        maxResults: maxResultsPerKw,
        order,
        publishedAfter: publishedAfter || undefined,
        regionCode: c.country === "US" ? "US" : undefined,
      });
      for (const v of r.videos) {
        const contentClass = classifyYoutubeContent(
          v.description,
          v.title,
          v.tags,
        );
        allVideos.push({
          keyword: kw,
          videoId: v.videoId,
          url: v.url,
          title: v.title,
          description: v.description,
          channelId: v.channelId,
          channelTitle: v.channelTitle,
          publishedAt: v.publishedAt,
          duration_s: parseDuration(v.duration),
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          commentCount: v.commentCount,
          contentClass,
          tags: v.tags,
        });
      }
      for (const [cid, cm] of r.channels) {
        channelMap.set(cid, {
          handle: cm.handle,
          title: cm.title,
          subscriberCount: cm.subscriberCount,
          viewCount: cm.viewCount,
          videoCount: cm.videoCount,
        });
      }
    } catch (e) {
      return {
        ok: false,
        error: `'${kw}' 검색 실패: ${e instanceof Error ? e.message : e}`,
      };
    }
  }

  if (allVideos.length === 0) {
    return { ok: false, error: "검색 결과 0개 — 키워드 점검" };
  }

  // 4) influencers 업서트 (platform='youtube', external_id=channelId)
  // influencer_tier_type enum은 nano/micro/mid/macro/mega만 → sub-nano/unknown은 null로
  const ENUM_TIERS = new Set(["nano", "micro", "mid", "macro", "mega"]);
  const inflRows = Array.from(channelMap.entries()).map(([channelId, c]) => {
    const tier = subscribersToTier(c.subscriberCount);
    return {
      platform: "youtube" as const,
      external_id: channelId,
      handle: c.handle ?? channelId,
      follower_count: c.subscriberCount,
      tier: ENUM_TIERS.has(tier) ? tier : null,
      fans_source: "youtube_data_api",
    };
  });
  if (inflRows.length > 0) {
    const { error: inflErr } = await supabase
      .from("influencers")
      .upsert(inflRows, {
        onConflict: "platform,external_id",
        ignoreDuplicates: false,
      });
    if (inflErr) {
      console.warn("[fetchYoutubeSeeding] influencer upsert:", inflErr.message);
    }
  }

  // 5) channel_id → influencer.id 매핑
  const { data: inflBack } = await supabase
    .from("influencers")
    .select("id, external_id")
    .eq("platform", "youtube")
    .in("external_id", Array.from(channelMap.keys()));
  const channelToInflId = new Map(
    (inflBack ?? []).map((x) => [x.external_id ?? "", x.id]),
  );

  // 6) contents 업서트 (url unique) — Top 영상만 (Shorts 포함)
  const uniqueByUrl = Array.from(
    new Map(allVideos.map((v) => [v.url, v])).values(),
  );
  const contentInserts = uniqueByUrl.map((v) => ({
    url: v.url,
    brand_id: c.brand_id!,
    country: c.country,
    influencer_id: channelToInflId.get(v.channelId) ?? null,
    caption: v.title, // YouTube는 description이 길어 title이 caption에 적합
    views: v.viewCount,
    likes: v.likeCount,
    comments: v.commentCount,
    uploaded_at: v.publishedAt.slice(0, 10),
    duration_ms: v.duration_s * 1000,
    // is_ad = "ad" 명시적 광고만. "seeded"는 organic 콘텐츠로 간주 (제품만 받음).
    is_ad: v.contentClass === "ad",
  }));
  let contentInserted = 0;
  if (contentInserts.length > 0) {
    const { error: contentErr, count } = await supabase
      .from("contents")
      .upsert(contentInserts, {
        onConflict: "url",
        ignoreDuplicates: false,
        count: "exact",
      });
    if (contentErr) {
      console.warn("[fetchYoutubeSeeding] content upsert:", contentErr.message);
    }
    contentInserted = count ?? contentInserts.length;
  }

  // 7) 분류 카운트
  const classCounts = uniqueByUrl.reduce(
    (acc, v) => {
      acc[v.contentClass] = (acc[v.contentClass] ?? 0) + 1;
      return acc;
    },
    { ad: 0, seeded: 0, organic: 0 } as Record<string, number>,
  );

  // 8) cases.key_stats.youtube_seeding raw 누적
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", case_id)
    .single();
  const existing = (caseRow?.key_stats ?? {}) as Record<string, unknown>;
  const existingSeeding = Array.isArray(existing["youtube_seeding_runs"])
    ? (existing["youtube_seeding_runs"] as Array<unknown>)
    : [];
  const totalViews = allVideos.reduce((s, v) => s + v.viewCount, 0);

  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existing,
        youtube_seeding_runs: [
          ...existingSeeding,
          {
            captured_at: new Date().toISOString(),
            keywords,
            order,
            published_after: publishedAfter || null,
            videos_count: uniqueByUrl.length,
            channels_count: channelMap.size,
            total_views: totalViews,
            content_class_counts: classCounts,
          },
        ],
      } as never,
    })
    .eq("id", case_id);

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `YouTube ${uniqueByUrl.length}개 영상 적재 (광고 ${classCounts.ad} · 시딩 ${classCounts.seeded} · organic ${classCounts.organic}) · ${channelMap.size}개 채널 · 총 조회수 ${(totalViews / 1_000_000).toFixed(1)}M`,
  };
}

/**
 * C1 — Kalodata Category Ranking 적재.
 *
 * Kalodata Brand 페이지의 "Category Ranking" 시계열 데이터 (export 형식 미정 — 일단
 * 단순 TSV: 한 줄당 "YYYY-MM-DD\trank" 형식). cases.key_stats.kalodata_category_ranking
 * 에 박힘.
 *
 * 사용자가 Kalodata UI에서 캡처/복붙 후 적재. parser 는 단순 — 첫 컬럼이 date,
 * 두 번째 컬럼이 정수 rank.
 */
export async function uploadKalodataCategoryRanking(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const text = formData.get("text");
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Category Ranking 텍스트가 비어있습니다" };
  }
  const { supabase, c } = await getCase(case_id);

  // 파싱 — date \t rank (or date,rank / date rank) 가능. 첫 컬럼 ISO date, 두 번째 정수.
  const rows: Array<{ date: string; rank: number }> = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    const parts = cleaned.split(/[\t,;\s]+/);
    if (parts.length < 2) continue;
    const date = parts[0]!;
    const rank = Number(parts[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(rank) || rank <= 0) continue;
    rows.push({ date, rank: Math.round(rank) });
  }
  if (rows.length < 2) {
    return { ok: false, error: "유효한 row 2개 이상 필요 (date<tab>rank 형식)" };
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  // key_stats merge
  const { data: caseRow } = await supabase
    .from("cases")
    .select("key_stats")
    .eq("id", c.id)
    .single();
  const existing = (caseRow?.key_stats as Record<string, unknown>) ?? {};
  await supabase
    .from("cases")
    .update({
      key_stats: {
        ...existing,
        kalodata_category_ranking: {
          points: rows,
          last_uploaded: new Date().toISOString(),
        },
      } as never,
    })
    .eq("id", c.id);

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `Category Ranking ${rows.length}개 point 적재 (${rows[0]!.date} ~ ${rows[rows.length - 1]!.date})`,
  };
}


/**
 * Phase 4c.5 — IG profile scraper 호출.
 *
 * ig_authors 중 followers IS NULL (또는 strategy='all' 이면 전체) 인 username 모아서
 * Apify instagram-profile-scraper 호출 + DB update.
 *
 * 박는 컬럼: followers / following / bio / external_url / verified / is_business_account /
 *            linked_handles (bio+url 안 TK/YT/X 핸들 추출) / profile_scraped_at.
 *
 * 비용: ~$0.005/username (700명 ~$3.50).
 */
export async function runIgProfileScrape(
  case_id: string,
  opts?: { rescrape_all?: boolean },
): Promise<Result> {
  const supabase = await createServer();
  const { data: c } = await supabase
    .from("cases")
    .select("id")
    .eq("id", case_id)
    .maybeSingle();
  if (!c) return { ok: false, error: "case 없음" };

  const { enrichIgAuthorFollowers } = await import(
    "@/lib/inngest/aggregators/phase4c-ig-monitor"
  );
  let r: Awaited<ReturnType<typeof enrichIgAuthorFollowers>>;
  try {
    r = await enrichIgAuthorFollowers(supabase, case_id, opts);
  } catch (e) {
    return {
      ok: false,
      error: `Apify 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (r.targeted === 0) {
    return { ok: true, message: r.skipped_reason ?? "대상 author 0명" };
  }
  if (r.updated === 0) {
    return { ok: false, error: r.skipped_reason ?? "Apify 결과 0건" };
  }

  revalidatePath(`/cases/${case_id}`);
  return {
    ok: true,
    message: `${r.updated}/${r.targeted}명 IG profile 박힘 · 비용 $${r.cost_estimate_usd.toFixed(2)} · run ${r.apify_run_id ?? "?"}`,
  };
}

// =============================================================================
// 케이스 설정 — 채널 카드에서 입력 (구 new-case 폼의 채널별 설정을 카드로 이관).
//   스토어 URL / brand_keyword / Meta 페이지 / IG·YT seed. formData에 들어온 필드만 갱신.
// =============================================================================
export async function updateCaseConfig(
  case_id: string,
  formData: FormData,
): Promise<Result> {
  const supabase = await createServer();
  const s = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  const { data: existing, error: exErr } = await supabase
    .from("cases")
    .select("ig_config, yt_config")
    .eq("id", case_id)
    .maybeSingle();
  if (exErr || !existing) {
    return { ok: false, error: exErr?.message ?? "케이스를 찾을 수 없습니다" };
  }

  const update: Record<string, unknown> = {};

  if (formData.has("tiktok_shop_store_url")) {
    update.tiktok_shop_store_url = s("tiktok_shop_store_url") || null;
  }
  if (formData.has("brand_keyword")) {
    update.brand_keyword = s("brand_keyword") || null;
  }
  if (formData.has("brand_meta_pages")) {
    const pages = s("brand_meta_pages")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    update.brand_meta_pages = pages.length > 0 ? pages : null;
  }
  // IG: owned username + brand hashtags(태그/언급 수집) 한 폼에서 같이 머지.
  if (formData.has("ig_owned_username") || formData.has("ig_brand_hashtags")) {
    const igConfig = {
      ...((existing.ig_config as Record<string, unknown>) ?? {}),
    };
    if (formData.has("ig_owned_username")) {
      const u = s("ig_owned_username").replace(/^@/, "");
      igConfig.ig_owned_usernames = u ? [u] : [];
    }
    if (formData.has("ig_brand_hashtags")) {
      const tags = s("ig_brand_hashtags")
        .split(",")
        .map((x) => x.trim().replace(/^#/, ""))
        .filter(Boolean);
      igConfig.ig_brand_hashtags = tags;
    }
    update.ig_config = igConfig as never;
  }
  // YT: owned channel + brand keywords(검색/언급 수집) 한 폼에서 같이 머지.
  if (formData.has("yt_owned_channel") || formData.has("yt_brand_keywords")) {
    const ytConfig = {
      ...((existing.yt_config as Record<string, unknown>) ?? {}),
    };
    if (formData.has("yt_owned_channel")) {
      const u = s("yt_owned_channel");
      ytConfig.yt_owned_channels = u ? [u] : [];
    }
    if (formData.has("yt_brand_keywords")) {
      const kws = s("yt_brand_keywords")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      ytConfig.yt_brand_keywords = kws;
    }
    update.yt_config = ytConfig as never;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "변경할 설정이 없습니다" };
  }

  const { error } = await supabase
    .from("cases")
    .update(update as never)
    .eq("id", case_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cases/${case_id}`);
  return { ok: true, message: "설정 저장됨" };
}
