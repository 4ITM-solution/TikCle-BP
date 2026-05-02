import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { classifyTier } from "./phase3";
import type {
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
  unknown: "미분류",
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

  // 5. 클러스터 결과 없으면 히트맵 생략 (언어/USP는 그대로 반환)
  if (!phase4bClusters || phase4bClusters.meta_clusters.length === 0) {
    return {
      heatmap: [],
      meta_order: [],
      total_videos_in_heatmap: 0,
      languages,
      total_with_language,
      total_without_language,
      usp_keywords,
      total_captions,
      skipped_reason: "메타 클러스터 없음 (Phase 4b.4 비어있음)",
      computed_at: new Date().toISOString(),
    };
  }

  // 6. 히트맵
  const heatmapResult = await computeHeatmap(
    supabase,
    case_id,
    phase4bClusters,
  );

  return {
    heatmap: heatmapResult.heatmap,
    meta_order: heatmapResult.meta_order,
    total_videos_in_heatmap: heatmapResult.total_videos,
    languages,
    total_with_language,
    total_without_language,
    usp_keywords,
    total_captions,
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
  total_videos: number;
}> {
  // 메타 컬럼 순서: member_count 내림차순 (MetaClustersModule과 동일)
  const meta_order = [...phase4bClusters.meta_clusters]
    .sort((a, b) => b.member_count - a.member_count)
    .map((m) => ({ id: m.id, name: m.name }));

  // 1. case_video_analyses의 (content_id, pass3_meta_id) 가져옴
  const { data: analyses, error: aErr } = await supabase
    .from("case_video_analyses")
    .select("content_id, pass3_meta_id")
    .eq("case_id", case_id)
    .not("pass3_meta_id", "is", null);
  if (aErr) throw new Error(`analyses fetch: ${aErr.message}`);

  if (!analyses || analyses.length === 0) {
    return { heatmap: [], meta_order, total_videos: 0 };
  }

  const contentIds = analyses.map((a) => a.content_id);

  // 2. contents (views, influencer_id)
  const contentMap = new Map<
    string,
    { views: number; influencer_id: string | null }
  >();
  for (let i = 0; i < contentIds.length; i += FETCH_CHUNK) {
    const slice = contentIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("contents")
      .select("id, views, influencer_id")
      .in("id", slice);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    for (const r of data ?? []) {
      contentMap.set(r.id, {
        views: r.views ?? 0,
        influencer_id: r.influencer_id,
      });
    }
  }

  // 3. influencer → tier
  const inflIds = Array.from(
    new Set(
      Array.from(contentMap.values())
        .map((v) => v.influencer_id)
        .filter((x): x is string => !!x),
    ),
  );
  const inflTier = new Map<string, TierBucket>();
  for (let i = 0; i < inflIds.length; i += FETCH_CHUNK) {
    const slice = inflIds.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .from("influencers")
      .select("id, tier, follower_count")
      .in("id", slice);
    if (error) throw new Error(`influencers fetch: ${error.message}`);
    for (const r of data ?? []) {
      // DB tier가 있으면 우선, 없으면 fans 기반으로 재분류
      const tier: TierBucket = r.tier
        ? (r.tier as TierBucket)
        : classifyTier(r.follower_count);
      inflTier.set(r.id, tier);
    }
  }

  // 4. tier × meta_id cross-tab
  type CellAcc = { views_sum: number; video_count: number };
  const grid = new Map<string, CellAcc>(); // key = `${tier}|${meta_id}`
  const tierTotals = new Map<TierBucket, { views: number; videos: number }>();
  let total_videos_with_data = 0;

  for (const a of analyses) {
    if (!a.pass3_meta_id) continue;
    const c = contentMap.get(a.content_id);
    if (!c || !c.influencer_id) continue;
    const tier = inflTier.get(c.influencer_id);
    if (!tier) continue;
    if (!HEATMAP_TIERS.includes(tier)) continue; // sub-nano/unknown 제외

    total_videos_with_data += 1;
    const key = `${tier}|${a.pass3_meta_id}`;
    const cur = grid.get(key) ?? { views_sum: 0, video_count: 0 };
    cur.views_sum += c.views;
    cur.video_count += 1;
    grid.set(key, cur);

    const tt = tierTotals.get(tier) ?? { views: 0, videos: 0 };
    tt.views += c.views;
    tt.videos += 1;
    tierTotals.set(tier, tt);
  }

  // 5. tier row 빌드 (HEATMAP_TIERS 순서, 데이터 있는 것만)
  const heatmap: HeatmapRow[] = [];
  for (const tier of HEATMAP_TIERS) {
    const tt = tierTotals.get(tier);
    if (!tt || tt.videos === 0) continue;

    const cells: HeatmapCell[] = meta_order.map((m) => {
      const acc = grid.get(`${tier}|${m.id}`);
      const views_sum = acc?.views_sum ?? 0;
      const video_count = acc?.video_count ?? 0;
      const views_pct = tt.views > 0 ? (views_sum / tt.views) * 100 : 0;
      return {
        meta_id: m.id,
        views_sum,
        views_pct,
        video_count,
      };
    });

    heatmap.push({
      tier,
      total_videos: tt.videos,
      total_views: tt.views,
      cells,
    });
  }

  return { heatmap, meta_order, total_videos: total_videos_with_data };
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

function computeLanguageDistribution(rows: ContentRow[]): {
  languages: LanguageEntry[];
  total_with_language: number;
  total_without_language: number;
} {
  const counts = new Map<string, number>();
  let total_without = 0;
  for (const r of rows) {
    const lang = r.language?.trim().toLowerCase();
    if (!lang) total_without += 1;
    else counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const total_with = Array.from(counts.values()).reduce((s, n) => s + n, 0);
  const total = total_with + total_without;

  const languages: LanguageEntry[] = Array.from(counts.entries())
    .map(([code, count]) => ({
      code,
      label: LANGUAGE_LABELS[code] ?? code.toUpperCase(),
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
