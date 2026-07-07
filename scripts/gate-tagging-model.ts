/**
 * WS3 품질 게이트 (BP_재설계_v2 §3.4).
 *
 * 기존 Sonnet으로 태깅된 case_video_analyses.vision_tags / meta_ads.ad_intel에서
 * 샘플(영상 30 + 광고 30)을 뽑아 Haiku로 재태깅 → 필드별 일치율 표 출력.
 * DB에 쓰지 않음(읽기 전용). 실행 비용 ~$1 이내(하드 캡).
 *
 * ⚠ R9(재발방지 원장): 외부 이미지 URL(TikTok/FB CDN)은 서명이 만료됨 →
 *   Vision 입력은 파이프라인이 Storage에 재호스트한 URL(/storage/v1/object/)만 사용.
 *   재호스트 URL이 없는 행은 표본에서 제외하고 페이지네이션으로 대체 표본을 더 뽑아
 *   유효 비교 표본이 목표 건수에 도달할 때까지 진행 (재호스트 로직:
 *   phase4b-vision.ts의 downloadAndStore / meta-ad-assets.ts의 rehostMetaAdAssets).
 *
 * 판정: 필드별·종합 일치율 ≥90%면 Haiku 전환 확정 (최종 승인은 오케스트레이터).
 *
 * 사용:
 *   npm run gate:tagging                 # 기본 30영상 + 30광고
 *   npm run gate:tagging -- --videos 40  # 영상만 40개
 *   npm run gate:tagging -- --ads 15
 *
 * 환경변수(.env.local 자동 로드): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 * 재태깅 모델은 BP_TAGGING_MODEL(기본 Haiku 4.5). 미설정 시 Haiku로 강제.
 */

import { existsSync, readFileSync } from "node:fs";

// .env.local 자동 로드 (tsx --env-file 안 먹는 환경 대비)
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

// 게이트는 반드시 Haiku로 재태깅 (env 없으면 강제 지정).
if (!process.env.BP_TAGGING_MODEL) {
  process.env.BP_TAGGING_MODEL = "claude-haiku-4-5-20251001";
}

import { createClient } from "@supabase/supabase-js";
import { visionTagOne, calcVisionCost } from "../src/lib/anthropic/vision-tagger";
import { tagAdCreative } from "../src/lib/anthropic/ad-creative-tagger";
import { TAGGING_MODEL } from "../src/lib/anthropic/pricing";
import type { VisionTags } from "../src/lib/inngest/types";
import type { AdIntel } from "../src/lib/anthropic/ad-creative-tagger";

const COST_CAP_USD = 1.0;

// 파이프라인이 재호스트한 Supabase Storage URL 식별 패턴
// (asset-downloader.ts getPublicUrl / meta-ad-assets.ts와 동일 기준).
const STORAGE_URL_MARK = "/storage/v1/object/";
const FAIL_WARN_RATIO = 0.05; // 실패 행 5% 초과 시 경고

// 비교 대상 필드 정의 -----------------------------------------------------------
// scalar: 정확 일치. array: Jaccard(교집합/합집합) — 순서 무관 집합 비교.
const VISION_SCALAR_FIELDS: (keyof VisionTags)[] = [
  "content_angle",
  "body_format",
  "visual_style",
  "purchase_intent",
  "cta_type",
];
const VISION_ARRAY_FIELDS: (keyof VisionTags)[] = ["hook_tags", "products_visible"];

// source_channel·banner_style은 신규 필드 → 기존 Sonnet 행에 없어 비교 제외.
const AD_SCALAR_FIELDS: (keyof AdIntel)[] = [
  "origin_class",
  "content_format",
  "hook_type",
  "hook_strength",
  "product_focus",
  "creator_read",
  "market_read",
  "is_ugc_person",
  "has_promo_overlay",
  "has_before_after",
];

type Agg = { match: number; total: number; jaccardSum: number };

function newAgg(): Agg {
  return { match: 0, total: 0, jaccardSum: 0 };
}

function scalarEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function jaccard(a: unknown, b: unknown): number {
  const sa = new Set((Array.isArray(a) ? a : []).map(String));
  const sb = new Set((Array.isArray(b) ? b : []).map(String));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

function pct(n: number, d: number): string {
  return d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(1).padStart(5)}%`;
}

async function main() {
  const args = process.argv.slice(2);
  const num = (flag: string, dflt: number) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1]!, 10) : dflt;
  };
  const videoN = num("--videos", 30);
  const adN = num("--ads", 30);

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "미실행 — NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY 필요",
    );
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("미실행 — ANTHROPIC_API_KEY 필요");
    process.exit(2);
  }
  console.log(`재태깅 모델: ${TAGGING_MODEL}`);
  console.log(`비용 캡: $${COST_CAP_USD}\n`);

  const supabase = createClient(url, key);
  let costUsd = 0;

  // ────────── 영상 vision_tags 게이트 ──────────
  const visionAgg: Record<string, Agg> = {};
  for (const f of [...VISION_SCALAR_FIELDS, ...VISION_ARRAY_FIELDS]) {
    visionAgg[f as string] = newAgg();
  }
  let videoCompared = 0;
  let videoFailed = 0;

  if (videoN > 0) {
    // R9: 재호스트된 Storage URL만 표본으로 사용 (만료 가능한 외부 CDN URL 제외).
    // 목표 건수 도달까지 페이지네이션으로 대체 표본을 계속 뽑는다.
    const PAGE = Math.max(videoN * 3, 60);
    let offset = 0;
    videoLoop: for (;;) {
      const { data: rows } = await supabase
        .from("case_video_analyses")
        .select("id, cover_url, asr_text, content_id, vision_tags")
        .not("vision_tags", "is", null)
        .not("cover_url", "is", null)
        .like("cover_url", `%${STORAGE_URL_MARK}%`)
        .order("id")
        .range(offset, offset + PAGE - 1);
      const sample = rows ?? [];
      if (sample.length === 0) break;
      offset += sample.length;

      // caption 조인 (content_id 있는 TK 행만) — 없으면 null로 진행
      const contentIds = sample
        .map((r) => (r as { content_id: string | null }).content_id)
        .filter((x): x is string => !!x);
      const capById = new Map<string, string | null>();
      if (contentIds.length > 0) {
        const { data: contents } = await supabase
          .from("contents")
          .select("id, caption")
          .in("id", contentIds.slice(0, 1000));
        for (const c of contents ?? [])
          capById.set(c.id as string, (c as { caption: string | null }).caption);
      }

      for (const r of sample) {
        if (videoCompared >= videoN) break videoLoop;
        if (costUsd >= COST_CAP_USD) {
          console.warn(`[gate] 비용 캡 도달 → 영상 ${videoCompared}개에서 중단`);
          break videoLoop;
        }
        const row = r as {
          cover_url: string | null;
          asr_text: string | null;
          content_id: string | null;
          vision_tags: VisionTags | null;
        };
        if (!row.cover_url || !row.vision_tags) continue;
        const caption = row.content_id ? capById.get(row.content_id) ?? null : null;
        try {
          const res = await visionTagOne({
            cover_url: row.cover_url,
            caption,
            asr_text: row.asr_text,
          });
          costUsd += calcVisionCost({
            tokens_input: res.tokens_input,
            tokens_output: res.tokens_output,
            tokens_cache_read: res.tokens_cache_read,
            tokens_cache_write: res.tokens_cache_write,
          });
          if (!res.tags) {
            videoFailed += 1;
            continue;
          }
          const sonnet = row.vision_tags;
          const haiku = res.tags;
          for (const f of VISION_SCALAR_FIELDS) {
            const a = visionAgg[f as string]!;
            a.total += 1;
            if (scalarEq(sonnet[f], haiku[f])) a.match += 1;
          }
          for (const f of VISION_ARRAY_FIELDS) {
            const a = visionAgg[f as string]!;
            a.total += 1;
            a.jaccardSum += jaccard(sonnet[f], haiku[f]);
          }
          videoCompared += 1;
        } catch (e) {
          videoFailed += 1;
          console.warn(
            `[gate] 영상 재태깅 실패(무시): ${(e as Error).message?.slice(0, 100)}`,
          );
        }
      }
      if (sample.length < PAGE) break; // DB 소진
    }
    if (videoCompared < videoN) {
      console.warn(
        `[gate] ⚠ 재호스트된 영상 표본 소진 — 유효 비교 ${videoCompared}/${videoN}건 (목표 미달)`,
      );
    }
  }

  // ────────── 광고 ad_intel 게이트 ──────────
  const adAgg: Record<string, Agg> = {};
  for (const f of AD_SCALAR_FIELDS) adAgg[f as string] = newAgg();
  let adCompared = 0;
  let adFailed = 0;

  if (adN > 0) {
    // R9: 재호스트된 Storage 썸네일만 표본으로 사용 (FB CDN URL은 며칠이면 403 만료).
    const PAGE = Math.max(adN * 3, 60);
    let offset = 0;
    adLoop: for (;;) {
      const { data: rows } = await supabase
        .from("meta_ads")
        .select("id, thumbnail_url, body_text, format, creator_page_name, ad_intel")
        .not("ad_intel", "is", null)
        .not("thumbnail_url", "is", null)
        .like("thumbnail_url", `%${STORAGE_URL_MARK}%`)
        .order("id")
        .range(offset, offset + PAGE - 1);
      const sample = rows ?? [];
      if (sample.length === 0) break;
      offset += sample.length;

      for (const r of sample) {
        if (adCompared >= adN) break adLoop;
        if (costUsd >= COST_CAP_USD) {
          console.warn(`[gate] 비용 캡 도달 → 광고 ${adCompared}개에서 중단`);
          break adLoop;
        }
        const row = r as {
          thumbnail_url: string | null;
          body_text: string | null;
          format: string | null;
          creator_page_name: string | null;
          ad_intel: AdIntel | null;
        };
        if (!row.thumbnail_url || !row.ad_intel) continue;
        try {
          const res = await tagAdCreative({
            thumbnail_url: row.thumbnail_url,
            caption: row.body_text,
            format: row.format,
            is_partnership: !!row.creator_page_name,
          });
          costUsd += calcVisionCost({
            tokens_input: res.tokens_input,
            tokens_output: res.tokens_output,
            tokens_cache_read: res.tokens_cache_read,
            tokens_cache_write: res.tokens_cache_write,
          });
          if (!res.intel) {
            adFailed += 1;
            continue;
          }
          const sonnet = row.ad_intel;
          const haiku = res.intel;
          for (const f of AD_SCALAR_FIELDS) {
            const a = adAgg[f as string]!;
            a.total += 1;
            if (scalarEq(sonnet[f], haiku[f])) a.match += 1;
          }
          adCompared += 1;
        } catch (e) {
          adFailed += 1;
          console.warn(
            `[gate] 광고 재태깅 실패(무시): ${(e as Error).message?.slice(0, 100)}`,
          );
        }
      }
      if (sample.length < PAGE) break; // DB 소진
    }
    if (adCompared < adN) {
      console.warn(
        `[gate] ⚠ 재호스트된 광고 표본 소진 — 유효 비교 ${adCompared}/${adN}건 (목표 미달)`,
      );
    }
  }

  // ────────── 리포트 ──────────
  const line = (label: string, agg: Agg, isArray: boolean) => {
    const rate = isArray
      ? agg.total === 0
        ? "  n/a"
        : `${((100 * agg.jaccardSum) / agg.total).toFixed(1).padStart(5)}%`
      : pct(agg.match, agg.total);
    console.log(`  ${label.padEnd(20)} ${rate}   (n=${agg.total})`);
  };

  console.log("\n═══════════ 영상 vision_tags (Sonnet vs Haiku) ═══════════");
  console.log(`비교 ${videoCompared}건 · 실패 ${videoFailed}건`);
  let vScalarMatch = 0,
    vScalarTotal = 0;
  for (const f of VISION_SCALAR_FIELDS) {
    line(f as string, visionAgg[f as string]!, false);
    vScalarMatch += visionAgg[f as string]!.match;
    vScalarTotal += visionAgg[f as string]!.total;
  }
  for (const f of VISION_ARRAY_FIELDS)
    line(`${f as string} (Jaccard)`, visionAgg[f as string]!, true);
  console.log(`  ${"— scalar 종합".padEnd(20)} ${pct(vScalarMatch, vScalarTotal)}`);

  console.log("\n═══════════ 광고 ad_intel (Sonnet vs Haiku) ═══════════");
  console.log(`비교 ${adCompared}건 · 실패 ${adFailed}건`);
  let aMatch = 0,
    aTotal = 0;
  for (const f of AD_SCALAR_FIELDS) {
    line(f as string, adAgg[f as string]!, false);
    aMatch += adAgg[f as string]!.match;
    aTotal += adAgg[f as string]!.total;
  }
  console.log(`  ${"— scalar 종합".padEnd(20)} ${pct(aMatch, aTotal)}`);

  console.log("\n═══════════ 종합 ═══════════");
  console.log(`  실측 비용        $${costUsd.toFixed(4)}`);
  const warnFailRatio = (label: string, failed: number, compared: number) => {
    const attempted = failed + compared;
    if (attempted > 0 && failed / attempted > FAIL_WARN_RATIO) {
      console.warn(
        `  ⚠ ${label} 실패 행 ${failed}/${attempted}건 (${((100 * failed) / attempted).toFixed(1)}% > ${FAIL_WARN_RATIO * 100}%) — 표본 신뢰도 점검 필요`,
      );
    }
  };
  warnFailRatio("영상", videoFailed, videoCompared);
  warnFailRatio("광고", adFailed, adCompared);
  console.log(
    `  scalar 종합 일치  ${pct(vScalarMatch + aMatch, vScalarTotal + aTotal)}`,
  );
  console.log(
    "\n판정 기준: 필드별·종합 ≥90% → Haiku 전환 확정 (최종 승인은 오케스트레이터).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
