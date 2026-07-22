#!/usr/bin/env node
/**
 * 인게이지먼트 백필 — Kalodata 유입 등으로 likes/comments/shares가 NULL인 contents를
 * Apify clockworks-tiktok으로 재조회해 채운다. collect_count(저장수)도 함께 채움.
 *
 * 배경(2026-07-22 실측): Kalodata xlsx는 조회수·매출·GPM은 주지만 댓글·좋아요·공유를
 * 제공하지 않아 해당 유입분이 전부 NULL. Exolyt는 인게이지먼트는 주지만 favourited(저장수)가
 * 현재 전량 공란. Apify clockworks는 collectCount 포함 전부 반환 → 백필로 양쪽 공백을 메움.
 *
 * 원칙:
 *  - NULL인 컬럼만 채운다(기존 값 덮어쓰기 금지). collect_count는 전량 NULL이라 채움.
 *  - 멱등: 재실행해도 이미 채워진 행은 대상에서 빠짐.
 *  - 실패/미수집 URL은 NULL로 남긴다(0으로 대체 금지 — 미측정과 실제 0을 구분).
 *
 * 실행: node scripts/backfill-engagement-from-apify.mjs <case_id> [--limit N] [--dry]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of fs.readFileSync(path.join(__dir, "..", ".env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const APIFY = env.APIFY_TOKEN;
if (!SB || !KEY || !APIFY) throw new Error(".env.local에 SUPABASE/APIFY 키 필요");

const ACTOR = "clockworks~tiktok-scraper";
const COST_PER_RESULT = 0.0017;
const CHUNK = 200; // Apify run 당 URL 수

const caseId = process.argv[2];
const dry = process.argv.includes("--dry");
const limArg = process.argv.indexOf("--limit");
const LIMIT = limArg > 0 ? Number(process.argv[limArg + 1]) : Infinity;
if (!caseId) throw new Error("usage: node scripts/backfill-engagement-from-apify.mjs <case_id>");

const rest = async (p, opt = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, {
    ...opt,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json", ...(opt.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${p}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
};

// 1) 대상 케이스의 brand/country
const [cs] = await rest(`cases?id=eq.${caseId}&select=brand_id,country`);
if (!cs) throw new Error("case 없음");

// 2) 백필 대상 수집 (페이지네이션)
//    --field collect|comments : 어느 컬럼이 NULL인 행을 채울지 (기본 collect_count)
//    --minviews N             : 조회수 하한 (비용 절감)
const fieldArg = process.argv.indexOf("--field");
const NULLCOL = (fieldArg > 0 ? process.argv[fieldArg + 1] : "collect") === "comments"
  ? "comments" : "collect_count";
const mvArg = process.argv.indexOf("--minviews");
const MINV = mvArg > 0 ? Number(process.argv[mvArg + 1]) : 0;
const targets = [];
for (let from = 0; ; from += 1000) {
  const page = await rest(
    `contents?brand_id=eq.${cs.brand_id}&country=eq.${cs.country}` +
      `&${NULLCOL}=is.null&url=not.is.null` +
      (MINV > 0 ? `&views=gte.${MINV}` : "") +
      `&select=id,url&order=id&offset=${from}&limit=1000`,
  );
  targets.push(...page);
  if (page.length < 1000) break;
}
const work = targets.slice(0, LIMIT === Infinity ? targets.length : LIMIT);
console.log(`대상 ${targets.length}건 → 처리 ${work.length}건 · 예상 $${(work.length * COST_PER_RESULT).toFixed(2)}`);
if (dry || work.length === 0) { console.log("(dry-run 종료)"); process.exit(0); }

// 3) Apify 청크 — 병렬 실행 (Apify run 자체가 수 분 걸려 순차면 병목)
const chunks = [];
for (let i = 0; i < work.length; i += CHUNK) chunks.push(work.slice(i, i + CHUNK));

const scrapeChunk = async (batch, idx) => {
  const t0 = Date.now();
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY}`,
    {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postURLs: batch.map((b) => b.url),
        resultsPerPage: batch.length,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
      }),
    },
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (!res.ok) { console.log(`  [${idx + 1}] 실패 ${res.status} (${secs}s)`); return []; }
  const items = await res.json();
  const out = (Array.isArray(items) ? items : []).flatMap((it) => {
    const u = it.webVideoUrl || it.submittedVideoUrl;
    if (!u) return [];
    return [[u, {
      views: typeof it.playCount === "number" ? it.playCount : null,
      likes: typeof it.diggCount === "number" ? it.diggCount : null,
      comments: typeof it.commentCount === "number" ? it.commentCount : null,
      shares: typeof it.shareCount === "number" ? it.shareCount : null,
      collect_count: typeof it.collectCount === "number" ? it.collectCount : null,
    }]];
  });
  console.log(`  [${idx + 1}/${chunks.length}] ${batch.length}건 → ${out.length}건 수신 (${secs}s)`);
  return out;
};

// 스크랩 결과 캐시 — DB 단계에서 실패해도 재스크랩(재과금) 없이 재개 가능
const CACHE = path.join("/tmp", `bf-scrape-${caseId}.json`);
let byUrl;
if (fs.existsSync(CACHE)) {
  byUrl = new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE, "utf8"))));
  console.log(`캐시 재사용 ${byUrl.size}건 (${CACHE}) — Apify 재호출 없음`);
} else {
  console.log(`Apify ${chunks.length}청크 병렬 실행…`);
  const results = await Promise.all(chunks.map(scrapeChunk));
  byUrl = new Map(results.flat());
  fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(byUrl)));
  console.log(`스크랩 ${byUrl.size}건 캐시 저장 → ${CACHE}`);
}

// 4) PATCH 병렬 (upsert는 INSERT로 취급돼 NOT NULL 위반 → 행 단위 PATCH가 정답)
const jobs = [];
let missed = 0;
for (const t of work) {
  const m = byUrl.get(t.url);
  if (!m) { missed++; continue; }
  const patch = {};
  for (const k of ["views", "likes", "comments", "shares", "collect_count"]) {
    if (m[k] !== null && m[k] !== undefined) patch[k] = m[k];
  }
  if (Object.keys(patch).length) jobs.push({ id: t.id, patch }); else missed++;
}
let updated = 0, failed = 0;
const CONC = 24;
for (let i = 0; i < jobs.length; i += CONC) {
  await Promise.all(jobs.slice(i, i + CONC).map(async (j) => {
    try {
      await rest(`contents?id=eq.${j.id}`, {
        method: "PATCH", body: JSON.stringify(j.patch),
        headers: { Prefer: "return=minimal" },
      });
      updated++;
    } catch { failed++; }
  }));
  process.stdout.write(`  갱신 ${updated}/${jobs.length}\r`);
}
console.log(`\n완료: 갱신 ${updated} · 실패 ${failed} · 미수집 ${missed}(NULL 유지)`);
