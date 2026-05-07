/**
 * novi/advanced-search-tiktok-api Heveblue 풀 → DB(Exolyt) 비교.
 *
 * 특징:
 *   - isUnlimited 플래그 — TikTok page cap 우회 가능성
 *   - region / publishTime / sortType 지원
 *   - Apify Store: "Advanced Search TikTok API (free-watermark videos)"
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

const ACTOR_ID = "novi~tiktok-scraper-ultimate";
const BRAND = "heveblue";
const HEVEBLUE_CASE_ID = "a494d303-d67f-434a-9578-e930a45ea95a";

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
    `[${label}] async ${items.length}개, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  return items;
}

function videoIdFromUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const m = u.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

function getItemVideoId(it: Item): string | null {
  // novi/advanced-search-tiktok-api는 TikTok 모바일 API 응답 그대로 — aweme_id가 video_id
  const aweme = it["aweme_id"];
  if (typeof aweme === "string" && /^\d+$/.test(aweme)) return aweme;
  if (typeof aweme === "number") return String(aweme);
  // fallback: webVideoUrl이 박혀있으면
  for (const k of ["webVideoUrl", "url", "videoUrl", "shareUrl"]) {
    const v = it[k];
    if (typeof v === "string") {
      const id = videoIdFromUrl(v);
      if (id) return id;
    }
  }
  return null;
}

async function main() {
  // sample 50개로 응답 구조 먼저 — novi/tiktok-scraper-ultimate input schema
  // (apidojo와 동일: keywords + maxItems + dateRange + location + sortType)
  const sample = await callActorAsync(
    {
      keywords: [BRAND],
      maxItems: 50,
      dateRange: "ALL_TIME",
      location: "US",
      sortType: "MOST_RECENT",
    },
    `novi-ultimate sample ${BRAND}`,
  );
  if (sample[0]) {
    const top = sample[0] as Record<string, unknown>;
    console.log(
      `[sample] top-level keys:`,
      Object.keys(top).slice(0, 30),
    );
    const urlLike = Object.entries(top)
      .filter(
        ([, v]) =>
          typeof v === "string" && /url|link/i.test(JSON.stringify(top))
            ? true
            : typeof v === "string" && (v as string).includes("tiktok.com"),
      )
      .slice(0, 10)
      .map(
        ([k, v]) =>
          `${k}=${typeof v === "string" ? (v as string).slice(0, 80) : JSON.stringify(v).slice(0, 80)}`,
      );
    console.log(`[sample] URL-like fields:`, urlLike);
    console.log(
      `[sample] full first item:`,
      JSON.stringify(sample[0]).slice(0, 800),
    );
  }

  // unlimited 시도 — maxItems 5000 (apidojo 동일 schema)
  const unlimited = await callActorAsync(
    {
      keywords: [BRAND],
      maxItems: 5000,
      dateRange: "ALL_TIME",
      location: "US",
      sortType: "MOST_RECENT",
    },
    `novi-ultimate maxItems5K ${BRAND}`,
  );

  // dedup
  const apifyMap = new Map<string, Item>();
  for (const r of [...sample, ...unlimited]) {
    const k = getItemVideoId(r);
    if (k && !apifyMap.has(k)) apifyMap.set(k, r);
  }
  console.log(`\n=== novi 합산 unique: ${apifyMap.size}개 ===`);

  // DB 비교
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
      .select("url")
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

  const cutoff365 = new Date(
    Date.now() - 365 * 24 * 3600 * 1000,
  ).toISOString();
  const dbVideoIds365 = new Set<string>();
  from = 0;
  while (true) {
    const { data } = await supabase
      .from("contents")
      .select("url")
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
    `\n=== DB(Exolyt): 전체 ${dbVideoIds.size} / 365일 ${dbVideoIds365.size} ===`,
  );

  const apifyIds = new Set(apifyMap.keys());
  let inBoth365 = 0;
  let inBothAll = 0;
  for (const id of apifyIds) {
    if (dbVideoIds.has(id)) inBothAll += 1;
    if (dbVideoIds365.has(id)) inBoth365 += 1;
  }
  console.log(`\n=== 비교 ===`);
  console.log(`  novi 총: ${apifyIds.size}`);
  console.log(`  DB 전체: ${dbVideoIds.size}, 교집합: ${inBothAll}`);
  console.log(
    `  DB 365일: ${dbVideoIds365.size}, 교집합: ${inBoth365}, cover: ${dbVideoIds365.size > 0 ? ((inBoth365 / dbVideoIds365.size) * 100).toFixed(1) : "0"}%`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
