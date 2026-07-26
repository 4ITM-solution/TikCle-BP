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
  case_id: string | null;
};

// BE-20: 이벤트 윈도우 케이던스 단축 설정 (docs/ws/BE20_이벤트_케이던스_설계.md).
const EVENT_LEAD_DAYS = Number(process.env.BP_EVENT_LEAD_DAYS || 7);
const EVENT_TRAIL_DAYS = Number(process.env.BP_EVENT_TRAIL_DAYS || 7);
const EVENT_CADENCE_DAYS = Number(process.env.BP_EVENT_CADENCE_DAYS || 1);

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** BE-20: 이벤트 윈도우 내면 짧은 이벤트 케이던스, 아니면 평소 케이던스(min이라 평소가 더 짧으면 존중). */
export function effectiveCadenceDays(
  brandCadence: number,
  inEventWindow: boolean,
): number {
  return inEventWindow
    ? Math.min(brandCadence, EVENT_CADENCE_DAYS)
    : brandCadence;
}

/**
 * BE-20: today ∈ [start_date − LEAD, end_date + TRAIL]인 프로모션 이벤트를 가진 case_id 집합.
 *   (window ⇔ start_date ≤ today+LEAD AND end_date ≥ today−TRAIL). promotion_events는 생성 타입에
 *   없어 untyped 접근. 조회 실패 시 빈 집합 폴백(이벤트 미반영이어도 평소 케이던스로 정상 동작).
 */
async function casesInEventWindow(
  db: SupabaseClient,
  caseIds: string[],
  now: Date,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (caseIds.length === 0) return set;
  const today = now.toISOString().slice(0, 10);
  const upper = addDaysISO(today, EVENT_LEAD_DAYS); // today + LEAD
  const lower = addDaysISO(today, -EVENT_TRAIL_DAYS); // today − TRAIL
  try {
    const { data } = await db
      .from("promotion_events")
      .select("case_id, start_date, end_date")
      .in("case_id", caseIds)
      .lte("start_date", upper)
      .gte("end_date", lower);
    for (const r of (data ?? []) as Array<{ case_id: string | null }>) {
      if (r.case_id) set.add(r.case_id);
    }
  } catch {
    // promotion_events 접근 실패 — 폴백(평소 케이던스). 모니터가 죽지 않게.
  }
  return set;
}

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

    const now = new Date();
    const nowMs = now.getTime();
    const allBrands = (brands ?? []) as BrandRow[];
    // BE-20: 이벤트 윈도우 안 케이스는 케이던스 단축 → 단기 딜 광고 누락 방지.
    const caseIds = [
      ...new Set(allBrands.map((b) => b.case_id).filter((x): x is string => !!x)),
    ];
    const eventCaseIds = await casesInEventWindow(db, caseIds, now);
    const due = allBrands.filter((b) => {
      const inWindow = !!b.case_id && eventCaseIds.has(b.case_id);
      const eff = effectiveCadenceDays(b.cadence_days, inWindow);
      return (
        !b.last_scraped_at ||
        new Date(b.last_scraped_at).getTime() + eff * 86_400_000 <= nowMs
      );
    });
    logger.info("[monitor-cron] due brands", {
      total: allBrands.length,
      due: due.length,
      event_cases: eventCaseIds.size,
    });

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
