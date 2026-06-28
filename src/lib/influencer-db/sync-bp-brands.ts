import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * 케이스 분석 완료 시, 그 케이스에 등장한 인플들의 "BP 브랜드 이력"(bp_brands)을
 * TIKCLE 2.0 운영 DB(influencer_db_tt / influencer_db_ig)에 실시간 반영.
 *
 *  - 각 인플의 brands = 그 인플의 "전체" 콘텐츠 기준 (이 케이스만 X) → RPC bp_brands_for_case.
 *  - 2.0에 이미 있으면 update(bp_* 만), 없으면 insert.
 *  - INFLUENCER_DB_SERVICE_KEY 없으면 skip (안전).
 */

type SupaClient = SupabaseClient<Database>;

type AggRow = {
  platform: "tiktok" | "instagram";
  handle: string;
  brands: string[];
  brand_count: number;
  content_count: number;
};

function opsClient() {
  const url = process.env.INFLUENCER_DB_URL;
  const key = process.env.INFLUENCER_DB_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function syncTable(
  ops: SupabaseClient,
  table: "influencer_db_tt" | "influencer_db_ig",
  rows: AggRow[],
): Promise<{ updated: number; inserted: number }> {
  if (rows.length === 0) return { updated: 0, inserted: 0 };
  const now = new Date().toISOString();
  const byHandle = new Map(rows.map((r) => [r.handle, r]));
  const handles = [...byHandle.keys()];

  // 1) 2.0에 이미 있는 핸들 조회 (청크 200)
  const existing = new Set<string>();
  for (let i = 0; i < handles.length; i += 200) {
    const chunk = handles.slice(i, i + 200);
    const { data } = await ops
      .from(table)
      .select("inf_username")
      .in("inf_username", chunk);
    for (const r of (data ?? []) as Array<{ inf_username: string }>) {
      existing.add(r.inf_username);
    }
  }

  const bpCols = (r: AggRow) => ({
    bp_brands: r.brands,
    bp_brand_count: r.brand_count,
    bp_content_count: r.content_count,
    bp_synced_at: now,
  });

  // 2) 기존 → update (upsert: 전부 conflict라 update만, inf_email_status 안 건드림)
  const updateRows = handles
    .filter((h) => existing.has(h))
    .map((h) => ({ inf_username: h, ...bpCols(byHandle.get(h)!) }));
  let updated = 0;
  for (let i = 0; i < updateRows.length; i += 500) {
    const batch = updateRows.slice(i, i + 500);
    const { error } = await ops
      .from(table)
      .upsert(batch as never, { onConflict: "inf_username" });
    if (!error) updated += batch.length;
  }

  // 3) 신규 → insert (tt는 inf_email_status NOT NULL → 'active')
  const insertRows = handles
    .filter((h) => !existing.has(h))
    .map((h) => ({
      inf_username: h,
      ...(table === "influencer_db_tt" ? { inf_email_status: "active" } : {}),
      ...bpCols(byHandle.get(h)!),
    }));
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += 500) {
    const batch = insertRows.slice(i, i + 500);
    const { error } = await ops.from(table).insert(batch as never);
    if (!error) inserted += batch.length;
  }

  return { updated, inserted };
}

export async function syncCaseBpBrands(
  bp: SupaClient,
  case_id: string,
): Promise<{
  tt: { updated: number; inserted: number };
  ig: { updated: number; inserted: number };
} | { skipped: string }> {
  const ops = opsClient();
  if (!ops) return { skipped: "INFLUENCER_DB_SERVICE_KEY 미설정" };

  const { data, error } = await (bp as unknown as SupabaseClient).rpc(
    "bp_brands_for_case",
    { p_case_id: case_id },
  );
  if (error) return { skipped: `rpc 실패: ${error.message}` };

  const rows = (data ?? []) as AggRow[];
  const tt = rows.filter((r) => r.platform === "tiktok");
  const ig = rows.filter((r) => r.platform === "instagram");

  const [ttRes, igRes] = await Promise.all([
    syncTable(ops, "influencer_db_tt", tt),
    syncTable(ops, "influencer_db_ig", ig),
  ]);
  return { tt: ttRes, ig: igRes };
}
