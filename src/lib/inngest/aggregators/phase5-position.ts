import type { SupabaseClient } from "@supabase/supabase-js";
import { franc } from "franc-min";
import type { Database } from "@/lib/supabase/types";
import { classifyTier } from "./phase3";
import type {
  BsrInflection,
  BsrInflectionVideo,
  HeatmapCell,
  HeatmapRow,
  LanguageEntry,
  Phase4bClusterStats,
  Phase5Stats,
  TierBucket,
  UspKeywordEntry,
} from "../types";

type SupaClient = SupabaseClient<Database>;

const FETCH_CHUNK = 200;

const HEATMAP_TIERS: TierBucket[] = ["mega", "macro", "mid", "micro", "nano"];

const LANGUAGE_LABELS: Record<string, string> = {
  en: "영어",
  es: "스페인어",
  ko: "한국어",
  ja: "일본어",
  zh: "중국어",
  pt: "포르투갈어",
  fr: "프랑스어",
  de: "독일어",
  th: "태국어",
  vi: "베트남어",
  id: "인도네시아어",
  ar: "아랍어",
  ru: "러시아어",
  it: "이탈리아어",
  tr: "터키어",
  ms: "말레이어",
  unknown: "확인 불가",
};

/**
 * Phase 5 — 포지셔닝 분석
 *
 * 1. 티어 × 메타 클러스터 히트맵 (VIEWS% 기준)
 *    - 분석 샘플 영상의 pass3_meta_id (Phase 4b.4 결과) 기반
 *    - 각 영상의 인플루언서 tier × meta cluster로 cross-tab
 *    - tier row 안에서 views% 정규화 (행 합계 ~100%)
 *
 * 2. 언어 분포 — brand+country 전체 contents의 language 컬럼 집계
 *
 * 비용: 무료 (SQL 집계).
 */
export async function runPhase5(
  supabase: SupaClient,
  case_id: string,
  phase4bClusters: Phase4bClusterStats | undefined,
): Promise<Phase5Stats> {
  // 1. 케이스 정보 + 브랜드명 (USP 추출 시 brand 자체 단어 필터링용)
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, country, brand:brands(name)")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);
  const brandName =
    (c.brand as unknown as { name: string } | null)?.name ?? "";

  // 2. 캡션 fetch (한 번에 가져와서 언어 + USP 둘 다 사용)
  const captionRows = await fetchAllCaptionsAndLanguages(
    supabase,
    c.brand_id,
    c.country,
  );

  // 3. 언어 분포
  const { languages, total_with_language, total_without_language } =
    computeLanguageDistribution(captionRows);

  // 4. USP 키워드
  const { usp_keywords, total_captions } = computeUspKeywords(
    captionRows,
    brandName,
  );

  // 5. BSR inflection (Amazon 케이스만 의미. 다른 채널은 빈 결과)
  const bsr_inflections = await computeBsrInflections(
    supabase,
    case_id,
    c.brand_id,
    c.country,
  );

  // 6. 클러스터 결과 없으면 히트맵 생략 (언어/USP/inflection은 그대로 반환)
  if (!phase4bClusters || phase4bClusters.meta_clusters.length === 0) {
    return {
      heatmap: [],
      meta_order: [],
      month_order: [],
      total_videos_in_heatmap: 0,
      languages,
      total_with_language,
      total_without_language,
      usp_keywords,
      total_captions,
      bsr_inflections,
      skipped_reason: "메타 클러스터 없음 (Phase 4b.4 비어있음)",
      computed_at: new Date().toISOString(),
    };
  }

  // 7. 히트맵
  const heatmapResult = await computeHeatmap(
    supabase,
    case_id,
    phase4bClusters,
  );

  return {
    heatmap: heatmapResult.heatmap,
    meta_order: heatmapResult.meta_order,
    month_order: heatmapResult.month_order,
    total_videos_in_heatmap: heatmapResult.total_videos,
    languages,
    total_with_language,
    total_without_language,
    usp_keywords,
    total_captions,
    bsr_inflections,
    computed_at: new Date().toISOString(),
  };
}

// =============================================================================
// Heatmap 계산
// =============================================================================

async function computeHeatmap(
  supabase: SupaClient,
  case_id: string,
  phase4bClusters: Phase4bClusterStats,
): Promise<{
  heatmap: HeatmapRow[];
  meta_order: Array<{ id: string; name: string }>;
  month_order: string[];
  total_videos: number;
}> {
  // 메타 행 순서: member_count 내림차순
  const meta_order = [...phase4bClusters.meta_clusters]
    .sort((a, b) => b.member_count - a.member_count)
    .map((m) => ({ id: m.id, name: m.name }));

  // 1. case_video_analyses (content_id, pass3_meta_id)
  const { data: analyses, error: aErr } = await supabase
    .from("case_video_analyses")
    .select("content_id, pass3_meta_id")
    .eq("case_id", case_id)
    .not("pass3_meta_id", "is", null);
  if (aErr) throw new Error(`analyses fetch: ${aErr.message}`);

  if (!analyses || analyses.length === 0) {
    return { heatmap: [], meta_order, month_order: [], total_videos: 0 };
  }

  const contentIds = analyses.map((a) => a.content_id);

  // 2. contents (views, uploaded_at, is_ad) — month + paid 추출용
  const contentMap = new Map<
    string,
    { views: number; uploaded_at: string | null; is_ad: boolean }
  >();
  for (let i = 0; i < contentIds.length; i += FETCH_CHUNK) {
    const slice = contentIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("contents")
      .select("id, views, uploaded_at, is_ad")
      .in("id", slice);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    for (const r of data ?? []) {
      contentMap.set(r.id, {
        views: r.views ?? 0,
        uploaded_at: r.uploaded_at,
        is_ad: !!r.is_ad,
      });
    }
  }

  // 3. meta × month cross-tab
  type CellAcc = { views_sum: number; video_count: number; paid_count: number };
  const grid = new Map<string, CellAcc>(); // key = `${meta_id}|${month}`
  const metaTotals = new Map<string, { views: number; videos: number }>();
  const monthSet = new Set<string>();
  let total_videos_with_data = 0;

  for (const a of analyses) {
    if (!a.pass3_meta_id) continue;
    const c = contentMap.get(a.content_id);
    if (!c || !c.uploaded_at) continue;
    const month = String(c.uploaded_at).slice(0, 7); // "YYYY-MM"
    if (!month) continue;

    total_videos_with_data += 1;
    monthSet.add(month);

    const key = `${a.pass3_meta_id}|${month}`;
    const cur = grid.get(key) ?? { views_sum: 0, video_count: 0, paid_count: 0 };
    cur.views_sum += c.views;
    cur.video_count += 1;
    if (c.is_ad) cur.paid_count += 1;
    grid.set(key, cur);

    const tt = metaTotals.get(a.pass3_meta_id) ?? { views: 0, videos: 0 };
    tt.views += c.views;
    tt.videos += 1;
    metaTotals.set(a.pass3_meta_id, tt);
  }

  // 4. month_order = 최근 12개월 오름차순 (데이터 있는 month 중)
  const month_order = [...monthSet].sort().slice(-12);

  // 5. heatmap row 빌드 (meta_order 순서, 데이터 있는 cluster만)
  const heatmap: HeatmapRow[] = [];
  for (const m of meta_order) {
    const tt = metaTotals.get(m.id);
    if (!tt || tt.videos === 0) continue;

    const cells: HeatmapCell[] = month_order.map((mo) => {
      const acc = grid.get(`${m.id}|${mo}`);
      return {
        month: mo,
        video_count: acc?.video_count ?? 0,
        views_sum: acc?.views_sum ?? 0,
        paid_count: acc?.paid_count ?? 0,
      };
    });

    heatmap.push({
      meta_id: m.id,
      meta_name: m.name,
      total_videos: tt.videos,
      total_views: tt.views,
      cells,
    });
  }

  return { heatmap, meta_order, month_order, total_videos: total_videos_with_data };
}

// =============================================================================
// 캡션 + 언어 일괄 fetch
// =============================================================================

type ContentRow = {
  caption: string | null;
  language: string | null;
};

async function fetchAllCaptionsAndLanguages(
  supabase: SupaClient,
  brand_id: string,
  country: string,
): Promise<ContentRow[]> {
  const out: ContentRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("caption, language")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// =============================================================================
// 언어 분포 계산
// =============================================================================

// franc 반환은 ISO 639-3 (3자). 자주 나오는 거만 ISO 639-1 (2자)로 매핑.
const FRANC_TO_ISO1: Record<string, string> = {
  eng: "en",
  spa: "es",
  kor: "ko",
  jpn: "ja",
  cmn: "zh",
  yue: "zh",
  fra: "fr",
  deu: "de",
  por: "pt",
  ita: "it",
  rus: "ru",
  vie: "vi",
  ind: "id",
  tha: "th",
  ara: "ar",
  tur: "tr",
};

/**
 * Caption 텍스트에서 언어 detect.
 * - 짧은 텍스트(franc 기본 minLength)이면 'und' 반환 → null로 처리
 * - hashtag 위주 caption이라 hashtag 제거 후 detect
 */
function detectLanguageFromCaption(caption: string | null): string | null {
  if (!caption) return null;
  // hashtag와 mention 제거 (#word, @word) → 순수 텍스트만
  const cleaned = caption
    .replace(/[#@][\w가-힣ぁ-んァ-ン一-龯]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .trim();
  if (cleaned.length < 10) return null; // 너무 짧으면 부정확
  const code3 = franc(cleaned, { minLength: 10 });
  if (code3 === "und") return null;
  return FRANC_TO_ISO1[code3] ?? code3;
}

function computeLanguageDistribution(rows: ContentRow[]): {
  languages: LanguageEntry[];
  total_with_language: number;
  total_without_language: number;
} {
  const counts = new Map<string, number>();
  let total_without = 0;
  for (const r of rows) {
    // contents.language가 채워져있으면 그걸 우선, 아니면 caption에서 detect
    const stored = r.language?.trim().toLowerCase();
    const detected = stored || detectLanguageFromCaption(r.caption);
    if (!detected) {
      total_without += 1;
      continue;
    }
    // franc-min이 짧은 캡션·이모지 영상에서 SWE/LIN/HAU/HNJ 등 false positive 자주 발생.
    // K-beauty 시장에 의미 있는 언어만 그대로 두고, 나머지는 'unknown' 버킷으로 통합.
    const lang = LANGUAGE_LABELS[detected] ? detected : "unknown";
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const total_with = Array.from(counts.values()).reduce((s, n) => s + n, 0);
  const total = total_with + total_without;

  const languages: LanguageEntry[] = Array.from(counts.entries())
    .map(([code, count]) => ({
      code,
      label: LANGUAGE_LABELS[code] ?? "확인 불가",
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    languages,
    total_with_language: total_with,
    total_without_language: total_without,
  };
}

// =============================================================================
// USP 키워드 — 캡션 빈도 분석
// =============================================================================

const USP_TOP_N = 20;
const USP_MIN_COUNT = 5; // 5개 미만 등장하면 노이즈로 간주

// 영어 + 한국어 흔한 stopword. 카테고리 무관 빈출어.
const STOPWORDS = new Set<string>([
  // 영어 articles/pronouns/verbs
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "being", "do", "does", "did", "have", "has", "had", "will", "would", "can",
  "could", "should", "shall", "may", "might", "must", "this", "that", "these",
  "those", "it", "its", "i", "you", "he", "she", "we", "they", "me", "him",
  "her", "us", "them", "my", "your", "our", "their", "his", "hers", "ours",
  "yours", "theirs", "what", "which", "who", "whom", "whose", "when", "where",
  "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "not", "only", "own", "same", "so", "than", "too",
  "very", "just", "also", "than", "then", "there", "here", "now", "well",
  "yes", "yeah", "yep", "ok", "okay", "oh", "wow", "love", "like", "want",
  "need", "get", "got", "go", "going", "going", "come", "came", "make", "made",
  "see", "saw", "look", "looking", "use", "using", "used", "good", "great",
  "best", "new", "old", "long", "short", "small", "large", "high", "low",
  "first", "last", "next", "many", "much", "every", "still", "always", "never",
  "really", "actually", "literally", "totally", "honestly", "obviously",
  "amp", "rt", "via",
  // 한국어 조사/어미/대명사
  "은", "는", "이", "가", "을", "를", "의", "에", "도", "만", "와", "과",
  "에서", "까지", "부터", "라고", "이라고", "다", "요", "죠", "네", "이다",
  "있다", "없다", "하다", "되다", "안", "못", "더", "좀", "이런", "저런",
  "그런", "그", "이", "저", "제", "내", "너", "우리", "여러분",
]);

function tokenizeCaption(text: string, brandLower: string): string[] {
  // URL/멘션/이모지 제거 → 단어만
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .replace(/#/g, " ") // 해시태그 # 떼고 단어는 유지
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(" ")
    .filter(
      (w) =>
        w.length >= 2 &&
        !STOPWORDS.has(w) &&
        w !== brandLower &&
        !/^\d+$/.test(w),
    );
  return words;
}

function extractGrams(words: string[]): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    grams.add(words[i]!);
    if (i + 1 < words.length) grams.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length)
      grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return grams;
}

function computeUspKeywords(
  rows: ContentRow[],
  brandName: string,
): { usp_keywords: UspKeywordEntry[]; total_captions: number } {
  const brandLower = brandName.toLowerCase();
  const counts = new Map<string, number>(); // gram → 캡션 등장 수
  let total_captions = 0;

  for (const r of rows) {
    const caption = r.caption?.trim();
    if (!caption) continue;
    total_captions += 1;
    const words = tokenizeCaption(caption, brandLower);
    if (words.length === 0) continue;
    const grams = extractGrams(words);
    for (const g of grams) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }

  // 같은 의미 중복 줄이기: bigram이 더 frequent하면 그 안의 unigram은 제거
  // (예: "glass skin"이 1800번이면 "glass"/"skin" unigram 카운트는 무시)
  // 일단 단순 sort + filter; 후처리로 dedup.
  const ranked = Array.from(counts.entries())
    .filter(([gram, n]) => n >= USP_MIN_COUNT && gram.length >= 2)
    .sort((a, b) => b[1] - a[1]);

  // dedup: 더 긴 gram이 이미 top에 있으면 그 단어들의 unigram은 제거
  const accepted: Array<[string, number]> = [];
  const acceptedWords = new Set<string>();
  for (const [gram, n] of ranked) {
    const tokens = gram.split(" ");
    if (tokens.length === 1) {
      // unigram: 이미 longer gram의 일부면 skip (단, 단독 카운트가 longer gram 카운트의 1.3배 이상이면 살림)
      const inLongerCount = acceptedWords.has(gram) ? 1 : 0;
      if (inLongerCount > 0) {
        // 더 긴 매치보다 1.3배 이상 frequent하면 의미 다른 거니 살림
        // (간단히: skip)
        continue;
      }
    } else {
      // bigram/trigram: 멤버 단어를 acceptedWords에 등록
      for (const t of tokens) acceptedWords.add(t);
    }
    accepted.push([gram, n]);
    if (accepted.length >= USP_TOP_N) break;
  }

  const usp_keywords: UspKeywordEntry[] = accepted.map(([keyword, count]) => ({
    keyword,
    count,
    pct: total_captions > 0 ? (count / total_captions) * 100 : 0,
  }));

  return { usp_keywords, total_captions };
}

// =============================================================================
// BSR Inflection 계산
//
// 알고리즘:
//   1. 각 SKU별 BSR 시계열에서 7일 rolling rank 변화율 계산
//   2. (rank_before - rank_after) / rank_before >= 0.5 인 시점 t를 급등 후보로 마킹
//   3. 그 시점 ±0~7일 윈도우 콘텐츠 viewCount 합계 (BSR 변화 직전 7일이 cause)
//   4. [t-14, t-7] 윈도우 viewCount 합계와 비교. ratio >= 2면 "메가 볼륨"
//   5. [t-7, t] 윈도우 영상 중 뷰 desc top 3을 inflection에 포함
// =============================================================================

const RANK_IMPROVE_THRESHOLD = 0.5; // 50% 이상 개선
const VOLUME_RATIO_THRESHOLD = 2.0; // 직전 7일 대비 2배 이상이면 메가 볼륨
const TOP_VIDEOS_PER_INFLECTION = 3;

async function computeBsrInflections(
  supabase: SupaClient,
  case_id: string,
  brand_id: string,
  country: string,
): Promise<BsrInflection[]> {
  // 1. 케이스의 product list (asin)
  const { data: products } = await supabase
    .from("products")
    .select("id, asin")
    .eq("case_id", case_id)
    .not("asin", "is", null);
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const asinByProductId = new Map(products.map((p) => [p.id, p.asin ?? ""]));

  // 2. 모든 product의 sales_snapshot 시계열 fetch
  const bsrByProduct = new Map<
    string,
    Array<{ collected_at: string; bsr: number }>
  >();
  const SNAP_CHUNK = 1000;
  // product별 limit 큼 (lifetime 시계열 전체)
  for (const pid of productIds) {
    const { data: snaps } = await supabase
      .from("sales_snapshot")
      .select("collected_at, bsr")
      .eq("product_id", pid)
      .eq("channel", "amazon")
      .not("bsr", "is", null)
      .order("collected_at", { ascending: true })
      .limit(SNAP_CHUNK);
    if (!snaps || snaps.length === 0) continue;
    bsrByProduct.set(
      pid,
      snaps
        .filter((s): s is { collected_at: string; bsr: number } =>
          typeof s.bsr === "number" && typeof s.collected_at === "string",
        )
        .map((s) => ({ collected_at: s.collected_at.slice(0, 10), bsr: s.bsr })),
    );
  }
  if (bsrByProduct.size === 0) return [];

  // 3. brand+country contents fetch (uploaded_at + views + url + caption)
  const allContents: Array<{
    uploaded_at: string;
    views: number;
    url: string;
    caption: string | null;
  }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("uploaded_at, views, url, caption")
      .eq("brand_id", brand_id)
      .eq("country", country)
      .not("uploaded_at", "is", null)
      .range(from, from + SNAP_CHUNK - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.uploaded_at || !r.url) continue;
      allContents.push({
        uploaded_at: String(r.uploaded_at).slice(0, 10),
        views: r.views ?? 0,
        url: r.url,
        caption: r.caption ?? null,
      });
    }
    if (data.length < SNAP_CHUNK) break;
    from += SNAP_CHUNK;
  }
  if (allContents.length === 0) return [];

  // 4. 각 SKU별 inflection 계산
  const inflections: BsrInflection[] = [];
  for (const [pid, series] of bsrByProduct.entries()) {
    if (series.length < 8) continue; // 7일 비교 못 함
    const asin = asinByProductId.get(pid) ?? "";

    // dedupe by date (마지막 값 유지)
    const byDate = new Map<string, number>();
    for (const s of series) byDate.set(s.collected_at, s.bsr);
    const sorted = Array.from(byDate.entries())
      .map(([date, bsr]) => ({ date, bsr }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 5. 7일 차이 비교: 같은 SKU에서 한 inflection의 ±7일 안에 또 다른 inflection 안 잡히게
    let lastFlaggedDate = "";
    for (let i = 7; i < sorted.length; i++) {
      const after = sorted[i]!;
      const before = sorted[i - 7]!;
      // 두 시점 사이 실제 일 차이가 7일 이상이어야 (sparse 시계열 보호)
      const dayDiff =
        (Date.parse(after.date) - Date.parse(before.date)) / 86_400_000;
      if (dayDiff < 5 || dayDiff > 10) continue;
      const improvement = (before.bsr - after.bsr) / before.bsr;
      if (improvement < RANK_IMPROVE_THRESHOLD) continue;
      // 같은 SKU에서 14일 내 직전 flag와 중복이면 skip
      if (lastFlaggedDate) {
        const since =
          (Date.parse(after.date) - Date.parse(lastFlaggedDate)) / 86_400_000;
        if (since < 14) continue;
      }
      lastFlaggedDate = after.date;

      const tMs = Date.parse(after.date);
      const w0Start = new Date(tMs - 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const w0End = after.date;
      const wPrevStart = new Date(tMs - 14 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const wPrevEnd = w0Start;

      let viewsWindow = 0;
      let viewsCompare = 0;
      const inWindow: typeof allContents = [];
      for (const c of allContents) {
        if (c.uploaded_at >= w0Start && c.uploaded_at < w0End) {
          viewsWindow += c.views;
          inWindow.push(c);
        } else if (c.uploaded_at >= wPrevStart && c.uploaded_at < wPrevEnd) {
          viewsCompare += c.views;
        }
      }
      const viewsRatio =
        viewsCompare > 0
          ? viewsWindow / viewsCompare
          : viewsWindow > 0
            ? Infinity
            : 0;
      const isMegaVolume =
        viewsCompare > 0 && viewsRatio >= VOLUME_RATIO_THRESHOLD;

      const top3: BsrInflectionVideo[] = inWindow
        .sort((a, b) => b.views - a.views)
        .slice(0, TOP_VIDEOS_PER_INFLECTION)
        .map((c) => ({
          url: c.url,
          views: c.views,
          caption: c.caption,
        }));

      inflections.push({
        asin,
        date: after.date,
        rank_before: before.bsr,
        rank_after: after.bsr,
        rank_improvement_pct: improvement * 100,
        views_window: viewsWindow,
        views_compare: viewsCompare,
        views_ratio: viewsRatio === Infinity ? 999 : viewsRatio,
        is_mega_volume: isMegaVolume,
        top_videos: top3,
      });
    }
  }

  // 6. 최신순 정렬, max 50개
  return inflections
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);
}
