import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMetaAdsCombined } from "@/lib/apify/meta-ads";

/**
 * 광고 모니터링 — 추적 브랜드 1개를 스크랩하고 diff(신규/킬)를 tracked_brand_ads에 적재.
 *
 *   - page_id 있으면 공식 액터(파트너십 attribution 포함), 없으면 keyword(curious_coder).
 *   - 이번 스크랩에서 본 ad = upsert(last_seen 갱신, is_active=true).
 *   - 직전까지 active였는데 이번에 안 보인 ad = killed → is_active=false, ended_at=now.
 *   - active_days(활성기간)는 조회 시 계산 (coalesce(ended_at,now)-start_date).
 *
 * tracked_brands/tracked_brand_ads는 생성 타입에 없어 untyped 클라이언트로 접근.
 */

export type TrackedBrand = {
  id: string;
  brand_name: string;
  page_id: string | null;
  keyword: string | null;
  country: string;
};

export type ScrapeResult = {
  total: number;
  active: number;
  partnership: number;
  new_ads: number;
  killed: number;
  status: string;
  skipped_reason?: string;
};

export async function scrapeTrackedBrand(
  db: SupabaseClient,
  brand: TrackedBrand,
): Promise<ScrapeResult> {
  const countries = [brand.country || "US"];

  // 1) 결합 스크랩 (키워드=종료+활성 + 공식액터=파트너십). page_id 있으면 정확,
  //    없으면 키워드에서 도출. 리테일러·카피 자동 제외.
  const result = await fetchMetaAdsCombined({
    brand_meta_pages: brand.page_id ? [brand.page_id] : [],
    brand_keyword: brand.keyword,
    countries,
    cap: 1000,
  });

  if (result.skipped_reason) {
    return {
      total: 0,
      active: 0,
      partnership: 0,
      new_ads: 0,
      killed: 0,
      status: "skipped",
      skipped_reason: result.skipped_reason,
    };
  }

  const ads = result.ads.filter((a) => a.ad_archive_id);
  const seenIds = new Set(ads.map((a) => a.ad_archive_id as string));
  const now = new Date().toISOString();

  // 2) 이번 스크랩 직전의 active ad_id (killed 판정용) — upsert 전에 조회
  const { data: prevActive } = await db
    .from("tracked_brand_ads")
    .select("ad_archive_id")
    .eq("tracked_brand_id", brand.id)
    .eq("is_active", true);
  const prevActiveIds = new Set(
    (prevActive ?? []).map((r: { ad_archive_id: string }) => r.ad_archive_id),
  );

  // 3) 본 ad upsert. 결합 결과는 종료광고(is_active=false)도 포함 → 그대로 반영.
  //    first_seen_at은 payload에 없어서 insert만 default, update는 유지.
  const rows = ads.map((a) => {
    const ended = a.is_active === false;
    return {
      tracked_brand_id: brand.id,
      ad_archive_id: a.ad_archive_id,
      page_name: a.page_name,
      creator_handle: a.creator_page_name ?? null,
      is_partnership: !!a.creator_page_name,
      start_date: a.start_date,
      format: a.format,
      body_text: a.body_text ? a.body_text.slice(0, 2000) : null,
      video_url: a.video_url,
      thumbnail_url: a.thumbnail_url,
      last_seen_at: now,
      is_active: !ended,
      ended_at: ended ? (a.end_date ?? now) : null,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await db
      .from("tracked_brand_ads")
      .upsert(batch, { onConflict: "tracked_brand_id,ad_archive_id" });
    if (error) throw new Error(`tracked_brand_ads upsert: ${error.message}`);
  }
  // 신규(이번에 처음 본) = 직전 active에 없던 id (근사치 — 직전 ended였다 부활한 것도 포함)
  const newCount = ads.filter(
    (a) => !prevActiveIds.has(a.ad_archive_id as string),
  ).length;

  // 4) killed = 직전 active인데 이번에 안 보인 ad
  const toKill = [...prevActiveIds].filter((id) => !seenIds.has(id as string));
  let killed = 0;
  for (let i = 0; i < toKill.length; i += 200) {
    const chunk = toKill.slice(i, i + 200);
    const { error } = await db
      .from("tracked_brand_ads")
      .update({ is_active: false, ended_at: now })
      .eq("tracked_brand_id", brand.id)
      .in("ad_archive_id", chunk);
    if (!error) killed += chunk.length;
  }

  const partnership = ads.filter((a) => a.creator_page_name).length;
  const activeCount = ads.filter((a) => a.is_active !== false).length;
  return {
    total: ads.length,
    active: activeCount,
    partnership,
    new_ads: newCount,
    killed,
    status: "ok",
  };
}
