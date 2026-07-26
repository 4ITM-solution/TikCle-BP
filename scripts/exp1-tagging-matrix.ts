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

const COST_CAP_USD = 10;
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
  for (let off = 0; off < 100000; off += 1000) {
    const { data } = await sb
      .from("case_video_analyses")
      .select("content_id, cover_url")
      .eq("case_id", caseId)
      .not("cover_url", "is", null)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.content_id && r.cover_url) cvaCovers.set(r.content_id as string, r.cover_url as string);
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

  // ─── EXECUTE (ORCH 전용) ───
  // 프레임 준비(1=cover / 3=앞·중·끝 ffmpeg / 딥=장면전환 컷 키프레임) → 6조합 vision 호출 →
  // 필드 일치율 매트릭스 → docs/ws/EXP1_결과.md. 딥 결과는 case_video_analyses에 별도 run_tag 저장,
  // 다운로드 영상은 Storage 보관(video_storage_path, U-9). 상한 $10.
  console.error(
    "\n[execute] 유료 실행 경로 — ORCH가 프레임 파이프라인(ffmpeg)·API 예산 승인 후 구동. " +
      "본 하네스는 표본/계획 확정까지 제공. 프레임 추출·6조합 호출·매트릭스 생성은 O-8에서 연결.",
  );
  process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
