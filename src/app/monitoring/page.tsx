import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toggleTrackedBrand,
  deleteTrackedBrand,
  scrapeNow,
} from "./actions";
import { AddBrandForm } from "./add-brand-form";

export const dynamic = "force-dynamic";

type Brand = {
  id: string;
  case_id: string | null;
  brand_name: string;
  page_id: string | null;
  keyword: string | null;
  country: string;
  cadence_days: number;
  is_active: boolean;
  last_scraped_at: string | null;
  last_status: string | null;
  last_active_count: number | null;
};
type AdRow = {
  tracked_brand_id: string;
  is_active: boolean;
  is_partnership: boolean | null;
  start_date: string | null;
  ended_at: string | null;
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  fontSize: 10.5,
  fontWeight: 800,
  color: "var(--color-g500)",
  textTransform: "uppercase",
  borderBottom: "1px solid var(--color-g100)",
};
const td: React.CSSProperties = {
  padding: "9px 10px",
  fontSize: 12.5,
  borderBottom: "1px solid var(--color-g50)",
  verticalAlign: "middle",
};
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({
  background: bg,
  color: fg,
  border: "none",
  padding: "5px 10px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
});

function rel(ts: string | null): string {
  if (!ts) return "—";
  const d = Date.now() - new Date(ts).getTime();
  const h = Math.floor(d / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(d / 60_000))}분 전`;
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
function days(start: string | null, end: string | null): number {
  if (!start) return 0;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

export default async function MonitoringPage() {
  const db = createServiceClient() as unknown as SupabaseClient;
  const { data: brandsData } = await db
    .from("tracked_brands")
    .select("*")
    .order("created_at", { ascending: false });
  const brands = (brandsData ?? []) as Brand[];

  const { data: adsData } = await db
    .from("tracked_brand_ads")
    .select("tracked_brand_id, is_active, is_partnership, start_date, ended_at");
  const ads = (adsData ?? []) as AdRow[];

  // BP 케이스 드롭다운 — 메타 광고가 적재됐거나 brand 설정이 있는 케이스
  const { data: caseData } = await db
    .from("cases")
    .select("id, country, brand_meta_pages, brands(name), meta_ads(count)")
    .order("created_at", { ascending: false });
  type CaseOpt = {
    id: string;
    country: string | null;
    brand_meta_pages: string[] | null;
    brands: { name: string } | { name: string }[] | null;
    meta_ads: { count: number }[] | null;
  };
  const trackedCaseIds = new Set(brands.map((b) => b.case_id).filter(Boolean));
  const caseOpts = ((caseData ?? []) as CaseOpt[])
    .map((c) => {
      const bo = Array.isArray(c.brands) ? c.brands[0] : c.brands;
      const adCount = c.meta_ads?.[0]?.count ?? 0;
      const hasPageId = (c.brand_meta_pages ?? []).some((p) => /^\d+$/.test(p));
      return {
        id: c.id,
        name: bo?.name ?? "(이름 없음)",
        country: c.country ?? "US",
        adCount,
        hasPageId,
      };
    })
    .filter((c) => c.adCount > 0 && !trackedCaseIds.has(c.id))
    .sort((a, b) => b.adCount - a.adCount);

  const agg = new Map<
    string,
    { total: number; active: number; killed: number; partner: number; maxd: number }
  >();
  for (const a of ads) {
    const m =
      agg.get(a.tracked_brand_id) ??
      { total: 0, active: 0, killed: 0, partner: 0, maxd: 0 };
    m.total += 1;
    if (a.is_active) {
      m.active += 1;
      m.maxd = Math.max(m.maxd, days(a.start_date, null));
    } else m.killed += 1;
    if (a.is_partnership) m.partner += 1;
    agg.set(a.tracked_brand_id, m);
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 60px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 2px" }}>
        광고 모니터링
      </h1>
      <p style={{ fontSize: 12.5, color: "var(--color-g500)", marginBottom: 18 }}>
        선택한 브랜드의 Meta 광고를 주기적으로 자동 수집 · 활성기간(효율) 누적.
        매일 06:00(UTC) cron이 주기 도래 브랜드를 스크랩하고, 사라진 광고는 killed로
        기록해 <b>위너(롱런)/루저(숏런)</b>가 시간이 갈수록 쌓입니다.
      </p>

      {/* 추가 폼 — 국가 선택 → 해당 국가 케이스만 (클라이언트 의존 드롭다운) */}
      <AddBrandForm caseOpts={caseOpts} />

      {/* 목록 */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--color-g100)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>브랜드</th>
              <th style={th}>소스</th>
              <th style={th}>국가</th>
              <th style={th}>주기</th>
              <th style={th}>마지막 적재</th>
              <th style={th}>누적</th>
              <th style={th}>활성</th>
              <th style={th}>킬됨</th>
              <th style={th}>최장활성</th>
              <th style={th}>추적</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {brands.length === 0 && (
              <tr>
                <td style={{ ...td, color: "var(--color-g400)" }} colSpan={11}>
                  추적 중인 브랜드가 없어요. 위에서 추가하세요. (page_id는 Meta Ad
                  Library 페이지 URL의 view_all_page_id 값)
                </td>
              </tr>
            )}
            {brands.map((b) => {
              const a = agg.get(b.id) ?? {
                total: 0,
                active: 0,
                killed: 0,
                partner: 0,
                maxd: 0,
              };
              return (
                <tr key={b.id} style={{ opacity: b.is_active ? 1 : 0.5 }}>
                  <td style={{ ...td, fontWeight: 700 }}>{b.brand_name}</td>
                  <td style={{ ...td, fontSize: 11, color: "var(--color-g500)" }}>
                    {b.page_id ? `page ${b.page_id}` : `kw "${b.keyword}"`}
                    {a.partner > 0 && (
                      <span style={{ color: "#7445FB", fontWeight: 700 }}>
                        {" "}
                        · 파트너십 {a.partner}
                      </span>
                    )}
                  </td>
                  <td style={td}>{b.country}</td>
                  <td style={td}>{b.cadence_days}일</td>
                  <td style={td}>
                    {rel(b.last_scraped_at)}
                    {b.last_status && (
                      <div style={{ fontSize: 10, color: "var(--color-g400)" }}>
                        {b.last_status}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{a.total}</td>
                  <td style={{ ...td, textAlign: "right", color: "#10b981", fontWeight: 700 }}>
                    {a.active}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "#ef4444" }}>
                    {a.killed}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                    {a.maxd}일
                  </td>
                  <td style={td}>
                    <form action={toggleTrackedBrand}>
                      <input type="hidden" name="id" value={b.id} />
                      <input
                        type="hidden"
                        name="to"
                        value={b.is_active ? "off" : "on"}
                      />
                      <button
                        type="submit"
                        style={btn(
                          b.is_active ? "#10b981" : "var(--color-g200)",
                          b.is_active ? "#fff" : "#374151",
                        )}
                      >
                        {b.is_active ? "ON" : "OFF"}
                      </button>
                    </form>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <form action={scrapeNow} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" style={btn("#3b82f6")}>
                        지금 수집
                      </button>
                    </form>{" "}
                    <form action={deleteTrackedBrand} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={b.id} />
                      <button
                        type="submit"
                        style={btn("transparent", "#ef4444")}
                      >
                        삭제
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
