/**
 * Heveblue 전체 풀: Apify hashtag + keyword 모드로 Exolyt 결과(DB)와 동등한지 검증.
 *
 * 비교 항목:
 *   - Apify 총 unique 영상 수 vs DB(Exolyt) 3,493개
 *   - URL overlap: Apify ∩ DB
 *   - Coverage gap: DB - Apify (Exolyt에만 있고 Apify에 없는 영상)
 *   - 신규 발견: Apify - DB
 *
 * 사용:
 *   npm run validate:apify
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// .env.local 로드
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

const ACTOR_ID = "clockworks~tiktok-scraper";
const BRAND = "heveblue";
const HEVEBLUE_CASE_ID = "a494d303-d67f-434a-9578-e930a45ea95a";
// 충분히 크게 — Heveblue Exolyt 3,493개니까 4K씩 풀로 가져옴
const RESULTS_PER_PAGE = 4000;

type Item = {
  id?: string;
  webVideoUrl?: string;
  text?: string;
  hashtags?: Array<{ name?: string }>;
  mentions?: string[];
  authorMeta?: { region?: string; name?: string };
  isAd?: boolean;
  isSponsored?: boolean;
  playCount?: number;
  createTimeISO?: string;
};

async function callActorAsync(
  input: Record<string, unknown>,
  label: string,
): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 필요");
  console.log(`\n[${label}] async run 시작...`);
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
  if (!runId || !datasetId) throw new Error(`run start: id 없음`);
  console.log(`[${label}] runId=${runId} datasetId=${datasetId}`);

  const runUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const maxWaitMs = 30 * 60 * 1000; // 30분 cap
  const deadline = Date.now() + maxWaitMs;
  let lastLog = Date.now();
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    const r = await fetch(runUrl);
    if (!r.ok) continue;
    const j = (await r.json()) as {
      data?: { status?: string; stats?: { computeUnits?: number } };
    };
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

  // Dataset full fetch — 큰 dataset이면 페이징
  const items: Item[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json&offset=${offset}&limit=${limit}`;
    const dsRes = await fetch(dsUrl);
    if (!dsRes.ok) {
      const text = await dsRes.text().catch(() => "");
      throw new Error(`dataset ${dsRes.status}: ${text.slice(0, 400)}`);
    }
    const batch = (await dsRes.json()) as Item[];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${label}] async ${items.length}개 결과, ${total}s`);
  return items;
}

function urlKey(it: Item): string | null {
  // TikTok URL은 /@user/video/123 형태. video_id를 핵심 키로 사용 (계정명 자주 case-mismatch)
  const u = it.webVideoUrl ?? "";
  const m = u.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

async function main() {
  // 1. Apify hashtag pull
  const hashtagResults = await callActorAsync(
    {
      hashtags: [BRAND],
      resultsPerPage: RESULTS_PER_PAGE,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadAvatars: false,
      shouldDownloadSubtitles: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      proxyCountryCode: "US",
    },
    `hashtag #${BRAND} US`,
  );

  // 2. Apify keyword pull (async, /video section)
  const keywordResults = await callActorAsync(
    {
      searchQueries: [BRAND],
      searchSection: "/video",
      resultsPerPage: RESULTS_PER_PAGE,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadAvatars: false,
      shouldDownloadSubtitles: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      proxyCountryCode: "US",
    },
    `keyword "${BRAND}" /video US`,
  );

  // 3. Apify 합산 dedup (video_id 기준)
  const apifyMap = new Map<string, Item>();
  for (const r of [...hashtagResults, ...keywordResults]) {
    const k = urlKey(r);
    if (k && !apifyMap.has(k)) apifyMap.set(k, r);
  }
  console.log(
    `\n=== Apify 합산 unique: ${apifyMap.size}개 (hashtag ${hashtagResults.length} + keyword ${keywordResults.length}) ===`,
  );

  // 4. DB(Exolyt) 영상 풀 fetch
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
  if (!c) throw new Error("Heveblue case 없음");

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
      const m = r.url?.match(/\/(?:video|photo)\/(\d+)/);
      if (m) dbVideoIds.add(m[1]!);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`=== DB(Exolyt) Heveblue 영상: ${dbVideoIds.size}개 ===`);

  // 5. 비교
  const apifyIds = new Set(apifyMap.keys());
  let inBoth = 0;
  for (const id of apifyIds) if (dbVideoIds.has(id)) inBoth += 1;
  const apifyOnly = apifyIds.size - inBoth;
  const dbOnly = dbVideoIds.size - inBoth;

  console.log(`\n=== 비교 결과 ===`);
  console.log(`  Apify 총: ${apifyIds.size}`);
  console.log(`  DB(Exolyt) 총: ${dbVideoIds.size}`);
  console.log(`  교집합 (둘 다): ${inBoth}`);
  console.log(
    `  DB에만 있음 (Exolyt가 잡았지만 Apify가 놓침): ${dbOnly} (DB 대비 ${((dbOnly / dbVideoIds.size) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Apify에만 있음 (Exolyt가 못 잡은 신규): ${apifyOnly} (Apify 대비 ${((apifyOnly / apifyIds.size) * 100).toFixed(1)}%)`,
  );

  // 6. 비용 가늠
  const totalResults = hashtagResults.length + keywordResults.length;
  console.log(
    `\n예상 비용 (clockworks $0.0017/result × ${totalResults}): $${(totalResults * 0.0017).toFixed(2)}`,
  );

  // 7. 결과 저장 (디버깅용)
  const outPath = "/tmp/heveblue-apify-vs-exolyt.json";
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        apify_total: apifyIds.size,
        db_total: dbVideoIds.size,
        intersection: inBoth,
        db_only: dbOnly,
        apify_only: apifyOnly,
        sample_apify_only_ids: Array.from(apifyIds)
          .filter((id) => !dbVideoIds.has(id))
          .slice(0, 10),
        sample_db_only_ids: Array.from(dbVideoIds)
          .filter((id) => !apifyIds.has(id))
          .slice(0, 10),
      },
      null,
      2,
    ),
  );
  console.log(`\n샘플 IDs 저장: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
