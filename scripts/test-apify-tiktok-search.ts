/**
 * Apify clockworks~tiktok-scraper 검색 모드 테스트 — Heveblue 케이스용.
 *
 * 목적: Exolyt 대체 가능성 검증.
 *   - hashtag #heveblue (US proxy)
 *   - keyword "heveblue" (US proxy)
 *   - 결과 수 / author region 분포 / Exolyt와 비교
 *
 * 사용:
 *   npm run test:apify
 */

import { existsSync, readFileSync } from "node:fs";

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

const ACTOR_ID = "clockworks~tiktok-scraper";
const SYNC_TIMEOUT_SEC = 600;

type Item = {
  url?: string;
  webVideoUrl?: string;
  videoUrl?: string;
  text?: string; // caption
  authorMeta?: {
    id?: string;
    name?: string;
    region?: string;
    fans?: number;
  };
  hashtags?: Array<{ name?: string; id?: string }>;
  mentions?: string[];
  textExtra?: Array<{ type?: number; userUniqueId?: string; hashtagName?: string }>;
  playCount?: number;
  diggCount?: number;
  createTimeISO?: string;
  videoMeta?: { duration?: number };
};

function getItemUrl(it: Item): string | undefined {
  return it.webVideoUrl ?? it.url ?? it.videoUrl;
}

/**
 * 표준 Apify async 패턴: run 시작 → 주기적 상태 polling → SUCCEEDED면 dataset fetch.
 * sync API가 socket close 자주 발생하는 keyword 모드용 fallback.
 */
async function callActorAsync(
  actorId: string,
  input: Record<string, unknown>,
  label: string,
  pollIntervalMs = 5000,
  maxWaitMs = 5 * 60 * 1000,
): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 필요");
  console.log(`\n[${label}] async run 시작...`);
  const t0 = Date.now();

  // 1. run 시작
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;
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
  if (!runId || !datasetId)
    throw new Error(`run start: id 없음 — ${JSON.stringify(startJson).slice(0, 300)}`);
  console.log(`[${label}] runId=${runId} datasetId=${datasetId}`);

  // 2. 상태 polling
  const runUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const r = await fetch(runUrl);
    if (!r.ok) continue;
    const j = (await r.json()) as { data?: { status?: string } };
    const status = j.data?.status;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[${label}] ${elapsed}s status=${status}`);
    if (status === "SUCCEEDED") break;
    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(`run ${status}`);
    }
  }

  // 3. dataset fetch
  const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`;
  const dsRes = await fetch(dsUrl);
  if (!dsRes.ok) {
    const text = await dsRes.text().catch(() => "");
    throw new Error(`dataset ${dsRes.status}: ${text.slice(0, 400)}`);
  }
  const items = (await dsRes.json()) as Item[];
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${label}] async ${items.length}개 결과, ${total}s`);
  if (items[0]) {
    const top = items[0] as unknown as Record<string, unknown>;
    console.log(`[${label}] top-level keys:`, Object.keys(top).slice(0, 30));
  }
  return items;
}

async function callActorById(
  actorId: string,
  body: Record<string, unknown>,
  label: string,
): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 필요");
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  console.log(`\n[${label}] actor=${actorId} input:`, JSON.stringify(body));
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${text.slice(0, 400)}`);
  }
  const items = (await res.json()) as Item[];
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${label}] ${items.length}개 결과, ${elapsed}s`);
  if (items[0]) {
    const top = items[0] as unknown as Record<string, unknown>;
    console.log(`[${label}] 첫 item top-level keys:`, Object.keys(top).slice(0, 30));
    const urlLike = Object.entries(top)
      .filter(
        ([k, v]) =>
          typeof v === "string" && /url|link/i.test(k) && (v as string).startsWith("http"),
      )
      .map(([k, v]) => `${k}=${String(v).slice(0, 80)}`);
    console.log(`[${label}] URL 후보 필드:`, urlLike);
  }
  return items;
}

async function callActor(
  body: Record<string, unknown>,
  label: string,
): Promise<Item[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 필요");
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  console.log(`\n[${label}] actor 호출... input:`, JSON.stringify(body));
  const t0 = Date.now();

  // transient socket close 대비 1회 재시도
  let res: Response;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.log(`[${label}] attempt ${attempt} fetch fail:`, e instanceof Error ? e.message : e);
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (lastErr) throw lastErr;
  res = res!;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${text.slice(0, 400)}`);
  }
  const items = (await res.json()) as Item[];
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[${label}] ${items.length}개 결과, ${elapsed}s`);

  // 첫 item 전체 키 dump (URL 필드 정체 확인)
  if (items[0]) {
    const top = items[0] as unknown as Record<string, unknown>;
    console.log(`[${label}] 첫 item top-level keys:`, Object.keys(top));
    const urlLike = Object.entries(top)
      .filter(
        ([k, v]) =>
          typeof v === "string" && /url|link/i.test(k) && (v as string).startsWith("http"),
      )
      .map(([k, v]) => `${k}=${String(v).slice(0, 80)}`);
    console.log(`[${label}] URL 후보 필드:`, urlLike);
  }
  return items;
}

function summarize(items: Item[], label: string, brand: string) {
  const regionCounts: Record<string, number> = {};
  const langCounts: Record<string, number> = {};
  let withMention = 0;
  let withHashtag = 0;
  for (const it of items) {
    const r = it.authorMeta?.region ?? "(unknown)";
    regionCounts[r] = (regionCounts[r] ?? 0) + 1;

    // 정확히 @brand 멘션 (textExtra type=0 또는 mentions array)
    const ms = (it.mentions ?? []).map((m) => m.toLowerCase());
    if (ms.some((m) => m.includes(brand.toLowerCase()))) withMention += 1;
    // textExtra에서 type=0(user mention) + userUniqueId 매칭
    const te = it.textExtra ?? [];
    if (
      te.some(
        (e) =>
          e.type === 0 &&
          (e.userUniqueId ?? "").toLowerCase().includes(brand.toLowerCase()),
      )
    ) {
      withMention += 1;
    }

    // 정확히 #brand 해시태그
    const hs = (it.hashtags ?? []).map((h) => (h.name ?? "").toLowerCase());
    if (hs.some((h) => h.includes(brand.toLowerCase()))) withHashtag += 1;
  }

  const topRegions = Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  console.log(`\n=== ${label} 요약 ===`);
  console.log(`  총 ${items.length}개`);
  console.log(`  region 분포:`, topRegions);
  console.log(`  @${brand} 멘션 박힌 영상: ${withMention}`);
  console.log(`  #${brand} 해시태그 박힌 영상: ${withHashtag}`);
  if (items[0]) {
    console.log(`  샘플 영상:`);
    console.log(`    url: ${getItemUrl(items[0])}`);
    console.log(`    region: ${items[0].authorMeta?.region}`);
    console.log(
      `    text: ${(items[0].text ?? "").slice(0, 120).replace(/\n/g, " ")}`,
    );
    console.log(`    hashtags:`, items[0].hashtags?.slice(0, 6));
    console.log(`    mentions:`, items[0].mentions?.slice(0, 6));
  }
}

async function main() {
  const BRAND = "heveblue";
  const RESULTS_PER_PAGE = 200; // 테스트 결과량 — 무리 안 되는 선

  // 테스트 1: hashtag mode + US proxy
  const hashtagResults = await callActor(
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
  summarize(hashtagResults, `hashtag #${BRAND} US`, BRAND);

  // 테스트 2: keyword search — async API (run + poll) 사용
  // sync API는 keyword 모드에서 socket close 자주 발생 → 표준 production 패턴
  let keywordResults: Item[] = [];
  try {
    keywordResults = await callActorAsync(
      "clockworks~tiktok-scraper",
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
      `keyword async "${BRAND}" /video US`,
    );
    summarize(keywordResults, `keyword async "${BRAND}" /video US`, BRAND);
  } catch (e) {
    console.log(
      `\n⚠ keyword async 모드 fail — ${e instanceof Error ? e.message : e}`,
    );
  }

  // 종합: 두 결과 합쳐 dedup
  const seen = new Set<string>();
  const all: Item[] = [];
  for (const r of [...hashtagResults, ...keywordResults]) {
    const u = getItemUrl(r);
    if (u && !seen.has(u)) {
      seen.add(u);
      all.push(r);
    }
  }
  console.log(`\n=== 합친 unique 영상 ${all.length}개 ===`);
  console.log(
    `(Exolyt heveblue case는 3,493개 박혀있음 — 비교 기준)`,
  );

  // 비용 가늠
  const totalResults = hashtagResults.length + keywordResults.length;
  const cost = totalResults * 0.0017;
  console.log(`\n예상 비용 (clockworks $0.0017/result): $${cost.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
