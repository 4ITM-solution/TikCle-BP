import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { inngestSupabase } from "@/lib/inngest/supabase";
import {
  scrapeTrackedBrand,
  type TrackedBrand,
} from "@/lib/inngest/monitor/scrape-tracked-brand";

type BrandRow = TrackedBrand & {
  cadence_days: number;
  is_active: boolean;
  last_scraped_at: string | null;
};

async function scrapeAndRecord(db: SupabaseClient, brand: BrandRow) {
  const startedAt = new Date().toISOString();
  try {
    const res = await scrapeTrackedBrand(db, brand);
    await db
      .from("tracked_brands")
      .update({
        last_scraped_at: startedAt,
        last_status: res.skipped_reason ?? res.status,
        last_ad_count: res.total,
        last_active_count: res.active,
      })
      .eq("id", brand.id);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from("tracked_brands")
      .update({ last_scraped_at: startedAt, last_status: `error: ${msg.slice(0, 120)}` })
      .eq("id", brand.id);
    return { error: true, message: msg };
  }
}

/**
 * 매일 06:00 UTC — 활성 추적 브랜드 중 주기(cadence_days) 도래한 것만 스크랩.
 * 각 브랜드는 별도 step.run → Inngest가 브랜드 간 체크포인트(긴 작업도 안전).
 */
export const monitorAdsCron = inngest.createFunction(
  { id: "monitor-ads-cron" },
  { cron: "0 6 * * *" },
  async ({ step, logger }) => {
    const db = inngestSupabase() as unknown as SupabaseClient;
    const { data: brands } = await db
      .from("tracked_brands")
      .select("*")
      .eq("is_active", true);

    const nowMs = Date.now();
    const due = ((brands ?? []) as BrandRow[]).filter(
      (b) =>
        !b.last_scraped_at ||
        new Date(b.last_scraped_at).getTime() + b.cadence_days * 86_400_000 <=
          nowMs,
    );
    logger.info("[monitor-cron] due brands", { total: brands?.length ?? 0, due: due.length });

    const results: unknown[] = [];
    for (const b of due) {
      const r = await step.run(`scrape-${b.id}`, () => scrapeAndRecord(db, b));
      results.push({ brand: b.brand_name, ...((r as object) ?? {}) });
    }
    return { due: due.length, results };
  },
);

/**
 * 수동 "지금 수집" — UI 버튼에서 발행.
 */
export const monitorScrapeBrand = inngest.createFunction(
  { id: "monitor-scrape-brand" },
  { event: "monitor/scrape.brand" },
  async ({ event, step }) => {
    const db = inngestSupabase() as unknown as SupabaseClient;
    const brand_id = (event.data as { brand_id: string }).brand_id;
    const { data: b } = await db
      .from("tracked_brands")
      .select("*")
      .eq("id", brand_id)
      .single();
    if (!b) return { error: "brand 없음" };
    return await step.run("scrape", () => scrapeAndRecord(db, b as BrandRow));
  },
);
