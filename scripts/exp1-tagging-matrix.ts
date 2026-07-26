/**
 * EXP-1 — 태깅 통합 실험 하네스 (BE-28). 지시서: docs/ws/EXP1_태깅실험_지시서.md.
 *
 * 쿤달 US 표본(영상 50 층화 + 광고 30) × 6조합 [Sonnet,Haiku]×[1프레임·3프레임·딥]을 한 판으로
 * 대조해 필드별 일치율 매트릭스 + 조합별 단가 산출. **실행·판정은 ORCH.** BE는 하네스 + dry-run.
 *
 *   dry-run(기본): 층화 표본 선정 + 조합 계획 + 예상 호출수/비용만 출력 (API·ffmpeg·다운로드 0).
 *   실행(--execute): ORCH만. 프레임 준비(1/3/딥) + 6조합 vision 호출 + 매트릭스 + case_video_analyses
 *     별도 run_tag 저장 + 영상 Storage 보관(U-9). 비용 상한 $10.
 *
 * 사용:
 *   npx tsx scripts/exp1-tagging-matrix.ts               # dry-run
 *   npx tsx scripts/exp1-tagging-matrix.ts --videos 50 --ads 30
 *   BP_TAGGING_MODEL=... npx tsx scripts/exp1-tagging-matrix.ts --execute   # ORCH
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync as fsRead, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../src/lib/anthropic/vision-tagger";

const COST_CAP_USD = 10;
const MODEL_ID: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};
// 대략 단가($/Mtok) — 비용 추적용.
const RATE: Record<string, { in: number; out: number }> = {
  sonnet: { in: 3, out: 15 },
  haiku: { in: 1, out: 5 },
};
const FIELDS = ["content_angle", "hook_tags", "overlay_text", "products_visible", "content_format"] as const;

type VisionImage =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: string; data: string };

let anthropic: Anthropic | null = null;
function ai(): Anthropic {
  if (!anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY 미설정");
    anthropic = new Anthropic({ apiKey: key });
  }
  return anthropic;
}

/** 다프레임 vision 호출 — SYSTEM_PROMPT(현행) 재사용, 이미지 N장 + 모델 지정. raw JSON 파싱. */
async function callVision(
  images: VisionImage[],
  caption: string | null,
  asr: string | null,
  modelKey: string,
): Promise<{ tags: Record<string, unknown> | null; cost: number }> {
  const userText = `Caption:\n${caption ?? "(none)"}\n\nASR transcript:\n${asr ?? "(none)"}`;
  const content: Anthropic.MessageParam["content"] = [
    ...images.map((im) =>
      im.type === "url"
        ? ({ type: "image", source: { type: "url", url: im.url } } as const)
        : ({ type: "image", source: { type: "base64", media_type: im.media_type as "image/jpeg", data: im.data } } as const),
    ),
    { type: "text", text: userText } as const,
  ];
  const res = await ai().messages.create({
    model: MODEL_ID[modelKey] ?? modelKey,
    max_tokens: 800,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  const rate = RATE[modelKey] ?? RATE.sonnet!;
  const cost = ((res.usage.input_tokens ?? 0) * rate.in + (res.usage.output_tokens ?? 0) * rate.out) / 1e6;
  const tb = res.content.find((c): c is Anthropic.TextBlock => c.type === "text");
  if (!tb) return { tags: null, cost };
  try {
    const j = JSON.parse(tb.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    return { tags: j as Record<string, unknown>, cost };
  } catch {
    return { tags: null, cost };
  }
}

/**
 * 영상 1회 다운로드 → Storage 보관(U-9) → ffmpeg 프레임 추출(3프레임 앞·중·끝 + 딥 장면전환 컷).
 * 조합마다 재다운로드하지 않도록 프레임셋을 함께 반환. Storage 업로드 실패는 무시(보관은 best-effort).
 */
async function prepVideo(
  sb: SupabaseClient,
  videoUrl: string,
  storageKey: string,
): Promise<{ f3: VisionImage[]; deep: VisionImage[]; storagePath: string | null }> {
  const dir = mkdtempSync(join(tmpdir(), "exp1-"));
  const mp4 = join(dir, "v.mp4");
  try {
    execFileSync("curl", ["-sL", "--max-time", "90", "-o", mp4, videoUrl], { stdio: "ignore" });

    // Storage 보관(U-9) — case-assets 버킷. 실패해도 진행.
    let storagePath: string | null = null;
    try {
      const buf = fsRead(mp4);
      const path = `exp1-videos/${storageKey}.mp4`;
      const up = await sb.storage.from("case-assets").upload(path, buf, { contentType: "video/mp4", upsert: true });
      if (!up.error) storagePath = path;
    } catch {
      /* Storage 업로드 실패 무시 */
    }

    // 3프레임 (앞·중·끝)
    const f3: VisionImage[] = [];
    const dur =
      parseFloat(
        execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim(),
      ) || 9;
    for (const t of [dur * 0.1, dur * 0.5, dur * 0.9]) {
      const f = join(dir, `f${Math.round(t * 10)}.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-q:v", "3", f], { stdio: "ignore" });
      f3.push({ type: "base64", media_type: "image/jpeg", data: fsRead(f).toString("base64") });
    }

    // 딥 (장면전환 컷 키프레임, 최대 8)
    const deep: VisionImage[] = [];
    const pat = join(dir, "s%03d.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-vf", "select='gt(scene,0.3)',scale=512:-1", "-vsync", "vfr", "-frames:v", "8", "-q:v", "3", pat], { stdio: "ignore" });
    for (let i = 1; i <= 8; i++) {
      const f = join(dir, `s${String(i).padStart(3, "0")}.jpg`);
      try {
        deep.push({ type: "base64", media_type: "image/jpeg", data: fsRead(f).toString("base64") });
      } catch {
        break;
      }
    }
    return { f3, deep: deep.length > 0 ? deep : f3, storagePath };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp 정리 실패 무시 */
    }
  }
}

// 필드 일치: scalar=정확일치, array=Jaccard≥0.5를 일치로.
function fieldAgree(field: string, a: unknown, b: unknown): boolean {
  if (field === "hook_tags" || field === "products_visible") {
    const sa = new Set((Array.isArray(a) ? a : []).map(String));
    const sb = new Set((Array.isArray(b) ? b : []).map(String));
    if (sa.size === 0 && sb.size === 0) return true;
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter += 1;
    const uni = sa.size + sb.size - inter;
    return uni > 0 && inter / uni >= 0.5;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

const STORAGE_MARK = "/storage/v1/object/"; // R9: 재호스트 URL만 (fbcdn/tiktok CDN 만료 URL 금지)

type Args = { execute: boolean; videos: number; ads: number; brand: string; country: string };
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const num = (flag: string, d: number) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] ? parseInt(a[i + 1]!, 10) : d;
  };
  const str = (flag: string, d: string) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] ? a[i + 1]! : d;
  };
  return {
    execute: a.includes("--execute"),
    videos: num("--videos", 50),
    ads: num("--ads", 30),
    brand: str("--brand", "kundal"),
    country: str("--country", "US"),
  };
}

type SampleVideo = {
  content_id: string;
  url: string;
  cover_url: string | null;
  video_download_url: string | null;
  views: number;
  save_rate: number | null;
  comment_rate: number | null;
  stratum: "revenue" | "top_views" | "outlier" | "random";
};

/** 쿤달 US 영상 표본 층화 선정 — 전부 재호스트 cover(R9) 보유분에서만. */
async function selectVideoSample(
  sb: SupabaseClient,
  caseId: string,
  brandId: string,
  country: string,
  n: number,
): Promise<SampleVideo[]> {
  // kalodata 매출연결 url 집합
  const { data: cRow } = await sb.from("cases").select("key_stats").eq("id", caseId).single();
  const kdUrls = new Set(
    (((cRow?.key_stats as { kalodata_videos_xlsx?: Array<{ video_url: string | null; revenue_usd: number | null }> } | null)?.kalodata_videos_xlsx) ?? [])
      .filter((v) => v.video_url && (v.revenue_usd ?? 0) > 0)
      .map((v) => v.video_url as string),
  );

  // cover 있는 case_video_analyses (content_id) → contents 조인으로 지표.
  //   R9 재호스트는 광고 fbcdn(만료)에만 필수. TikTok cover는 Anthropic이 CDN 직접 fetch(vision-tagger
  //   URL source)라 재호스트 불요 → 영상은 non-null cover면 표본 대상(재호스트분 우선은 아님).
  const cvaCovers = new Map<string, string>();
  const cvaVideo = new Map<string, string>(); // content_id → video_download_url (딥/3프레임용)
  for (let off = 0; off < 100000; off += 1000) {
    const { data } = await sb
      .from("case_video_analyses")
      .select("content_id, cover_url, video_download_url")
      .eq("case_id", caseId)
      .not("cover_url", "is", null)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.content_id && r.cover_url) cvaCovers.set(r.content_id as string, r.cover_url as string);
      if (r.content_id && r.video_download_url) cvaVideo.set(r.content_id as string, r.video_download_url as string);
    }
    if (data.length < 1000) break;
  }
  const ids = [...cvaCovers.keys()];
  if (ids.length === 0) return [];

  // contents 지표 (views, collect_count, comments)
  const rows: Array<{ id: string; url: string; views: number; collect: number; comments: number }> = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb
      .from("contents")
      .select("id, url, views, collect_count, comments")
      .in("id", ids.slice(i, i + 300));
    for (const r of data ?? []) {
      const views = (r.views as number) ?? 0;
      rows.push({
        id: r.id as string,
        url: (r.url as string) ?? "",
        views,
        collect: (r.collect_count as number) ?? 0,
        comments: (r.comments as number) ?? 0,
      });
    }
  }
  const mk = (r: (typeof rows)[number], stratum: SampleVideo["stratum"]): SampleVideo => ({
    content_id: r.id,
    url: r.url,
    cover_url: cvaCovers.get(r.id) ?? null,
    video_download_url: cvaVideo.get(r.id) ?? null,
    views: r.views,
    save_rate: r.views > 0 ? (r.collect / r.views) * 100 : null,
    comment_rate: r.views > 0 ? (r.comments / r.views) * 10000 : null,
    stratum,
  });

  const chosen = new Set<string>();
  const pick = (pool: typeof rows, k: number, stratum: SampleVideo["stratum"]): SampleVideo[] => {
    const out: SampleVideo[] = [];
    for (const r of pool) {
      if (out.length >= k) break;
      if (chosen.has(r.id)) continue;
      chosen.add(r.id);
      out.push(mk(r, stratum));
    }
    return out;
  };

  // 층화 목표 비율 (50 기준: 10/15/10/15) → n에 비례
  const q = { revenue: Math.round(n * 0.2), top: Math.round(n * 0.3), outlier: Math.round(n * 0.2) };
  q.revenue = Math.max(q.revenue, 1);

  const revenue = pick(rows.filter((r) => kdUrls.has(r.url)), q.revenue, "revenue");
  const top = pick([...rows].sort((a, b) => b.views - a.views), q.top, "top_views");
  const outlierPool = [...rows].sort((a, b) => (b.comments / Math.max(b.views, 1)) - (a.comments / Math.max(a.views, 1)));
  const outlier = pick(outlierPool, q.outlier, "outlier");
  // 무작위(결정적): id 해시 순
  const rnd = [...rows].sort((a, b) => hash(a.id) - hash(b.id));
  const random = pick(rnd, n - revenue.length - top.length - outlier.length, "random");
  return [...revenue, ...top, ...outlier, ...random];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

async function selectAdSample(sb: SupabaseClient, caseId: string, n: number) {
  const { data } = await sb
    .from("meta_ads")
    .select("id, thumbnail_url, body_text")
    .eq("case_id", caseId)
    .not("thumbnail_url", "is", null)
    .like("thumbnail_url", `%${STORAGE_MARK}%`) // R9: 재호스트 썸네일만
    .limit(n * 3);
  return (data ?? []).slice(0, n).map((r) => ({
    id: r.id as string,
    thumbnail_url: r.thumbnail_url as string,
    body_text: (r.body_text as string | null) ?? null,
  }));
}

const COMBOS = [
  { model: "sonnet", depth: "1frame" },
  { model: "sonnet", depth: "3frame" },
  { model: "sonnet", depth: "deep" },
  { model: "haiku", depth: "1frame" },
  { model: "haiku", depth: "3frame" },
  { model: "haiku", depth: "deep" },
] as const;

async function main() {
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE URL/KEY 필요");
  const sb = createClient(url, key);

  // 케이스 해석 (쿤달 US)
  const { data: brands } = await sb.from("brands").select("id, name").ilike("name", `%${args.brand}%`).limit(1);
  const brandId = brands?.[0]?.id as string | undefined;
  if (!brandId) throw new Error(`브랜드 '${args.brand}' 없음`);
  const { data: cases } = await sb.from("cases").select("id").eq("brand_id", brandId).eq("country", args.country).limit(1);
  const caseId = cases?.[0]?.id as string | undefined;
  if (!caseId) throw new Error(`케이스 없음 (${args.brand}/${args.country})`);

  const videos = await selectVideoSample(sb, caseId, brandId, args.country, args.videos);
  const ads = await selectAdSample(sb, caseId, args.ads);

  const byStratum = videos.reduce<Record<string, number>>((acc, v) => {
    acc[v.stratum] = (acc[v.stratum] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`# EXP-1 태깅 실험 하네스 — ${args.execute ? "EXECUTE(ORCH)" : "DRY-RUN"}`);
  console.log(`케이스: ${args.brand}/${args.country} ${String(caseId).slice(0, 8)}`);
  console.log(`\n## 표본`);
  console.log(`영상 ${videos.length}/${args.videos} 층화:`, JSON.stringify(byStratum));
  console.log(`  (revenue=매출연결·top_views=조회상위·outlier=댓글율이상치·random=무작위 · cover는 TikTok CDN 직 fetch라 재호스트 무관)`);
  console.log(`광고 ${ads.length}/${args.ads} (재호스트 썸네일만 — R9: fbcdn 만료 URL 금지)`);
  if (ads.length === 0) {
    console.log(`  ⚠ 이 케이스는 재호스트 meta_ads 썸네일 0건 — 광고 조합은 스킵되거나 광고 있는 케이스로 별도 실행 필요(ORCH).`);
  }

  // 조합별 예상 호출수 (프레임 수 = 1/3/딥6~10). 딥은 영상당 ~8프레임 가정.
  const framesOf = (d: string) => (d === "1frame" ? 1 : d === "3frame" ? 3 : 8);
  console.log(`\n## 6조합 계획 (같은 표본에 전부)`);
  let totalCalls = 0;
  for (const c of COMBOS) {
    const vCalls = videos.length; // 조합당 영상 1콜(N프레임 1메시지)
    const aCalls = ads.length;
    totalCalls += vCalls + aCalls;
    console.log(`  ${c.model.padEnd(7)} × ${c.depth.padEnd(7)} → 영상 ${vCalls}콜(${framesOf(c.depth)}프레임/콜) + 광고 ${aCalls}콜`);
  }
  // 대략 단가: Sonnet ~$0.006/이미지콜, Haiku ~$0.002. 딥은 프레임수 배.
  const estCost = COMBOS.reduce((s, c) => {
    const per = (c.model === "haiku" ? 0.002 : 0.006) * framesOf(c.depth);
    return s + per * (videos.length + ads.length);
  }, 0);
  console.log(`\n## 예상`);
  console.log(`  총 호출 ${totalCalls} · 예상 비용 ~$${estCost.toFixed(2)} (상한 $${COST_CAP_USD})`);
  console.log(`  판정 준정답 = Sonnet 딥 / 필드: content_angle·hook_tags·overlay_text·products_visible·content_format·(광고)origin_class`);

  if (estCost > COST_CAP_USD) {
    console.warn(`  ⚠ 예상 비용이 상한 초과 — 표본 축소 필요`);
  }

  if (!args.execute) {
    console.log(`\n(dry-run — API·ffmpeg·다운로드 0회. 실행은 ORCH: --execute)`);
    return;
  }

  // ─── EXECUTE (ORCH 전용, 유료) ───
  if (!apiKeyPresent()) throw new Error("ANTHROPIC_API_KEY 필요(execute)");
  const runTag = `exp1-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
  console.log(`\n[execute] run_tag=${runTag} · 상한 $${COST_CAP_USD}`);
  let spent = 0;
  const stop = () => spent >= COST_CAP_USD;

  // 1) 영상별 1회 전처리: 다운로드→Storage 보관(U-9)→프레임셋(1/3/deep) 캐시. 영상 없으면 cover 폴백.
  const frameSets = new Map<string, { "1frame": VisionImage[]; "3frame": VisionImage[]; deep: VisionImage[]; fellBack: boolean; storagePath: string | null }>();
  let fallbacks = 0;
  const storageByCid = new Map<string, string>();
  for (const v of videos) {
    const cover: VisionImage[] = v.cover_url ? [{ type: "url", url: v.cover_url }] : [];
    if (!v.video_download_url) {
      fallbacks += 1;
      frameSets.set(v.content_id, { "1frame": cover, "3frame": cover, deep: cover, fellBack: true, storagePath: null });
      continue;
    }
    try {
      const { f3, deep, storagePath } = await prepVideo(sb, v.video_download_url, `${caseId}/${v.content_id}`);
      if (storagePath) storageByCid.set(v.content_id, storagePath);
      frameSets.set(v.content_id, { "1frame": cover, "3frame": f3.length ? f3 : cover, deep, fellBack: false, storagePath });
    } catch {
      fallbacks += 1;
      frameSets.set(v.content_id, { "1frame": cover, "3frame": cover, deep: cover, fellBack: true, storagePath: null });
    }
  }
  console.log(`전처리 완료 · 프레임 폴백(영상 없음/실패→cover) ${fallbacks}건 · Storage 보관 ${storageByCid.size}건`);

  // 2) 6조합 호출 (캐시된 프레임셋 재사용 — 재다운로드 없음)
  const results = new Map<string, Record<string, Record<string, unknown> | null>>();
  for (const combo of COMBOS) {
    const key = `${combo.model}_${combo.depth}`;
    for (const v of videos) {
      if (stop()) {
        console.warn(`  ⚠ 비용 상한 $${COST_CAP_USD} 도달 — ${key}에서 중단`);
        break;
      }
      const fs = frameSets.get(v.content_id);
      const imgs = fs ? fs[combo.depth as "1frame" | "3frame" | "deep"] : [];
      if (imgs.length === 0) continue;
      const { tags, cost } = await callVision(imgs, null, null, combo.model);
      spent += cost;
      const r = results.get(v.content_id) ?? {};
      r[key] = tags;
      results.set(v.content_id, r);
    }
    console.log(`  ${key} 완료 (누적 $${spent.toFixed(2)})`);
  }

  // 매트릭스 — 준정답 = sonnet_deep. 각 조합의 필드별 일치율.
  const gt = "sonnet_deep";
  const matrix: Record<string, Record<string, { agree: number; total: number }>> = {};
  for (const combo of COMBOS) {
    const key = `${combo.model}_${combo.depth}`;
    matrix[key] = {};
    for (const f of FIELDS) matrix[key]![f] = { agree: 0, total: 0 };
    for (const [, r] of results) {
      const g = r[gt];
      const c = r[key];
      if (!g || !c) continue;
      for (const f of FIELDS) {
        matrix[key]![f]!.total += 1;
        if (fieldAgree(f, g[f], c[f])) matrix[key]![f]!.agree += 1;
      }
    }
  }

  // EXP1_결과.md 초안
  const lines: string[] = [`# EXP-1 결과 (${runTag})`, "", `표본 영상 ${videos.length} · 준정답=Sonnet 딥 · 폴백 ${fallbacks}`, "", "## 필드 일치율 매트릭스 (vs Sonnet 딥)", "", `| 조합 | ${FIELDS.join(" | ")} |`, `|---|${FIELDS.map(() => "---").join("|")}|`];
  for (const combo of COMBOS) {
    const key = `${combo.model}_${combo.depth}`;
    const cells = FIELDS.map((f) => {
      const m = matrix[key]![f]!;
      return m.total > 0 ? `${((100 * m.agree) / m.total).toFixed(0)}%` : "—";
    });
    lines.push(`| ${key} | ${cells.join(" | ")} |`);
  }
  lines.push("", `## 비용`, `- 실측 $${spent.toFixed(2)} (상한 $${COST_CAP_USD})`, "", `판정선: Haiku 자기일치 ≥85% AND 핵심필드 열화 ≤10%p · 3프레임 채택 +10%p (ORCH).`);
  writeFileSync("docs/ws/EXP1_결과.md", lines.join("\n"));
  console.log(`\n✅ docs/ws/EXP1_결과.md 생성 · 실측 $${spent.toFixed(2)}`);

  // case_video_analyses에 딥 결과 별도 컬럼 저장 (기존 vision_tags 미변경, 멱등 upsert). 마이그레이션 026.
  for (const [cid, r] of results) {
    const patch: Record<string, unknown> = { exp_vision_tags: r, exp_run_tag: runTag };
    const sp = storageByCid.get(cid);
    if (sp) patch.video_storage_path = sp;
    const { error } = await sb
      .from("case_video_analyses")
      .update(patch as never)
      .eq("case_id", caseId)
      .eq("content_id", cid);
    if (error) {
      console.warn(`[execute] exp 저장 실패(026 미적용?): ${error.message}`);
      break;
    }
  }
}

function apiKeyPresent(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
