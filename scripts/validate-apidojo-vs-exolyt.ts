/**
 * apidojo/tiktok-scraper 로 Heveblue 풀 → DB(Exolyt) 비교.
 *
 * apidojo 특징:
 *   - keywords 검색 + dateRange 필터 + location ISO 코드
 *   - sortType: RELEVANCE / MOST_LIKED / DATE_POSTED
 *   - $0.30 / 1K posts (clockworks $1.70/1K보다 저렴)
 */

import { existsSync, readFileSync } from "node:fs";

const envPath = ".env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const ACTOR_ID = "apidojo~tiktok-scraper";
const BRAND = "heveblue";
const HEVEBLUE_CASE_ID = "a494d303-d67f-434a-9578-e930a45ea95a";
const MAX_ITEMS = 5000;

type Item = Record<string, unknown>;

async function callActorAsync(
  input: Record<string, unknown>,
  label: string,
): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 필요");
  console.log(`\n[${label}] async run 시작...`);
  console.log(`[${label}] input:`, JSON.stringify(input));
  const t0 = Date.now();

  const startUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => "");
    throw new Error(`run start ${startRes.status}: ${text.slice(0, 400)}`);
  }
  const startJson = (await startRes.json()) as {
    data?: { id?: string; defaultDatasetId?: string };
  };
  const runId = startJson.data?.id;
  const datasetId = startJson.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error("run start: id 없음");
  console.log(`[${label}] runId=${runId} datasetId=${datasetId}`);

  const runUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const maxWaitMs = 30 * 60 * 1000;
  const deadline = Date.now() + maxWaitMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    const r = await fetch(runUrl);
    if (!r.ok) continue;
    const j = (await r.json()) as { data?: { status?: string } };
    const status = j.data?.status;
    if (Date.now() - lastLog >= 30000) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${label}] ${elapsed}s status=${status}`);
      lastLog = Date.now();
    }
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`run ${status}`);
    }
  }

  const items: Item[] = [];
  let offset = 0;
  while (true) {
    const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&offset=${offset}&limit=1000`;
    const dsRes = await fetch(dsUrl);
    if (!dsRes.ok) {
      const text = await dsRes.text().catch(() => "");
      throw new Error(`dataset ${dsRes.status}: ${text.slice(0, 400)}`);
    }
    const batch = (await dsRes.json()) as Item[];
    items.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  console.log(
    `[${label}] async ${items.length}개 결과, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  return items;
}

function videoIdFromUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const m = u.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

function getItemUrl(it: Item): string | null {
  // apidojo은 다양한 형태로 URL 박을 수 있음
  for (const k of ["webVideoUrl", "url", "videoUrl", "shareUrl", "playUrl"]) {
    const v = it[k];
    if (typeof v === "string" && /tiktok\.com\/(?:@|video)/.test(v)) return v;
  }
  return null;
}

async function main() {
  // 첫 번째 호출에서 응답 구조 확인 (sample 50개)
  const sampleResults = await callActorAsync(
    {
      keywords: [BRAND],
      maxItems: 50,
      dateRange: "ALL_TIME",
      location: "US",
      sortType: "RELEVANCE",
    },
    `apidojo keyword "${BRAND}" sample`,
  );
  console.log(
    `\n[sample] 첫 item top-level keys:`,
    sampleResults[0]
      ? Object.keys(sampleResults[0] as Record<string, unknown>).slice(0, 30)
      : "(empty)",
  );
  const sampleUrl = sampleResults[0]
    ? getItemUrl(sampleResults[0])
    : null;
  console.log(`[sample] URL 추출 샘플:`, sampleUrl);

  // 1. keyword search ALL_TIME + DATE_POSTED (최신순으로 더 깊게)
  const keywordResults = await callActorAsync(
    {
      keywords: [BRAND],
      maxItems: MAX_ITEMS,
      dateRange: "ALL_TIME",
      location: "US",
      sortType: "DATE_POSTED",
    },
    `apidojo keyword "${BRAND}" ALL_TIME DATE_POSTED US`,
  );

  // 2. hashtag tag URL via startUrls
  const tagResults = await callActorAsync(
    {
      startUrls: [
        { url: `https://www.tiktok.com/tag/${BRAND}`, method: "GET" },
      ],
      maxItems: MAX_ITEMS,
      location: "US",
    },
    `apidojo tag URL #${BRAND} US`,
  );

  // 3. dedup
  const apifyMap = new Map<string, Item>();
  for (const r of [...keywordResults, ...tagResults]) {
    const k = videoIdFromUrl(getItemUrl(r));
    if (k && !apifyMap.has(k)) apifyMap.set(k, r);
  }
  console.log(
    `\n=== apidojo 합산 unique: ${apifyMap.size}개 (keyword ${keywordResults.length} + tag ${tagResults.length}) ===`,
  );

  // 4. DB 비교
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE 키 필요");
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  const { data: c } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", HEVEBLUE_CASE_ID)
    .single();
  if (!c) throw new Error("case 없음");

  const dbVideoIds = new Set<string>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("contents")
      .select("url, uploaded_at")
      .eq("brand_id", c.brand_id)
      .eq("country", c.country)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const id = videoIdFromUrl(r.url);
      if (id) dbVideoIds.add(id);
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  // 365일 한정 DB
  const cutoff365 = new Date(
    Date.now() - 365 * 24 * 3600 * 1000,
  ).toISOString();
  const dbVideoIds365 = new Set<string>();
  from = 0;
  while (true) {
    const { data } = await supabase
      .from("contents")
      .select("url, uploaded_at")
      .eq("brand_id", c.brand_id)
      .eq("country", c.country)
      .gte("uploaded_at", cutoff365)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const id = videoIdFromUrl(r.url);
      if (id) dbVideoIds365.add(id);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(
    `\n=== DB(Exolyt) Heveblue: 전체 ${dbVideoIds.size} / 최근 365일 ${dbVideoIds365.size} ===`,
  );

  // 비교
  const apifyIds = new Set(apifyMap.keys());
  let inBoth = 0;
  let inBoth365 = 0;
  for (const id of apifyIds) {
    if (dbVideoIds.has(id)) inBoth += 1;
    if (dbVideoIds365.has(id)) inBoth365 += 1;
  }

  console.log(`\n=== 비교 (전체 기간) ===`);
  console.log(`  apidojo 총: ${apifyIds.size}`);
  console.log(`  DB 총: ${dbVideoIds.size}`);
  console.log(`  교집합: ${inBoth}`);
  console.log(
    `  DB만: ${dbVideoIds.size - inBoth} (${(((dbVideoIds.size - inBoth) / dbVideoIds.size) * 100).toFixed(1)}% miss)`,
  );

  console.log(`\n=== 비교 (최근 365일) ===`);
  console.log(`  DB(365d): ${dbVideoIds365.size}`);
  console.log(`  apidojo ∩ DB(365d): ${inBoth365}`);
  console.log(
    `  cover율 (apidojo가 catch한 DB 365d 영상 비율): ${((inBoth365 / dbVideoIds365.size) * 100).toFixed(1)}%`,
  );

  const totalResults = keywordResults.length + tagResults.length;
  console.log(
    `\n예상 비용 ($0.30/1K × ${totalResults} = $${((totalResults * 0.3) / 1000).toFixed(2)})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
