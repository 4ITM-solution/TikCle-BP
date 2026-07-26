/**
 * BE-30 — 광고 "원본 후보" 텍스트 대조 ($0, 텍스트 정규화).
 *
 * meta_ads.body_text × (contents.caption + case_video_analyses.asr_text)를 정규화 대조해
 * "이 광고의 원본일 가능성이 있는 영상" 후보를 뽑는다. **확정 아님(후보)** — E 원본 후보 배지·
 * 교집합 "2차 가공" 근거의 데이터 소스. pHash 2차 정합은 후속.
 *
 * 알고리즘(전량 O(N×M) 회피): 정규화 토큰 역색인 → 광고별로 희소 토큰 공유 콘텐츠만 후보로
 * 좁힌 뒤 containment 점수(공유 토큰 / 광고 토큰)로 정렬. 일반어는 stopword·posting cap으로 배제.
 */

export type MatchDoc = { id: string; text: string };
export type OriginalCandidate = {
  ad_id: string;
  content_id: string;
  score: number; // 0~1 (광고 토큰 중 콘텐츠와 공유된 비율)
  shared_terms: string[]; // 근거 토큰 (상위 8)
};

// 플랫폼/유통/PR 상투어 + 초경량 불용어 — 일반어 매칭 오탐 방지(BE-22와 결이 같음).
const STOPWORDS = new Set([
  "the","and","for","you","your","with","this","that","are","was","have","has",
  "from","not","but","all","can","get","out","now","new","한","것","수","더","및",
  "fyp","foryou","viral","tiktok","reels","instagram","official","brand","gifted",
  "ad","sponsored","link","bio","shop","buy","sale","off","code","use","free",
  "그리고","그런데","합니다","했어요","해요","이제","진짜","너무","완전","우리",
]);

/** 정규화: 소문자·URL/이모지/구두점 제거·공백 정규화. 한글·영숫자만 남김. */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]\S+/g, " ") // 해시태그·멘션 마커 제거(단어 자체는 캡션 본문에서 잡힘)
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 토큰화: 정규화 후 길이 2+ (한글은 2+, 영문은 3+) & 불용어 제외. 중복 제거된 Set. */
export function tokenize(s: string | null | undefined): Set<string> {
  const norm = normalizeText(s);
  const out = new Set<string>();
  for (const w of norm.split(" ")) {
    if (!w) continue;
    const isHangul = /[가-힣]/.test(w);
    if (w.length < (isHangul ? 2 : 3)) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

export type MatchOpts = {
  minScore?: number; // 후보 임계 (기본 0.35)
  minSharedTerms?: number; // 최소 공유 토큰 수 (기본 3) — 짧은 광고 오탐 방지
  maxCandidatesPerAd?: number; // 광고당 후보 상한 (기본 3)
  postingCap?: number; // 토큰별 posting list 상한 — 초과(일반어)는 색인 제외 (기본 400)
};

/**
 * 광고 목록 × 콘텐츠 목록 → 원본 후보. 순수 함수(네트워크 없음).
 */
export function matchAdsToContents(
  ads: MatchDoc[],
  contents: MatchDoc[],
  opts?: MatchOpts,
): OriginalCandidate[] {
  const minScore = opts?.minScore ?? 0.35;
  const minShared = opts?.minSharedTerms ?? 3;
  const maxPerAd = opts?.maxCandidatesPerAd ?? 3;
  const postingCap = opts?.postingCap ?? 400;

  // 1. 콘텐츠 토큰화 + 역색인
  const contentTokens = contents.map((c) => tokenize(c.text));
  const index = new Map<string, number[]>();
  for (let i = 0; i < contents.length; i += 1) {
    for (const t of contentTokens[i]!) {
      let arr = index.get(t);
      if (!arr) {
        arr = [];
        index.set(t, arr);
      }
      arr.push(i);
    }
  }
  // 일반어(posting cap 초과) 색인 제외 — 오탐·비용 방지.
  for (const [t, arr] of index) if (arr.length > postingCap) index.delete(t);

  const results: OriginalCandidate[] = [];
  for (const ad of ads) {
    const adTokens = tokenize(ad.text);
    if (adTokens.size < minShared) continue;
    // 후보 콘텐츠별 공유 토큰 수 카운트
    const sharedCount = new Map<number, number>();
    for (const t of adTokens) {
      const arr = index.get(t);
      if (!arr) continue;
      for (const ci of arr) sharedCount.set(ci, (sharedCount.get(ci) ?? 0) + 1);
    }
    const scored: OriginalCandidate[] = [];
    for (const [ci, shared] of sharedCount) {
      if (shared < minShared) continue;
      const score = shared / adTokens.size; // containment (광고가 원본에서 파생 = 광고 토큰이 원본에 포함)
      if (score < minScore) continue;
      const sharedTerms: string[] = [];
      for (const t of adTokens) {
        if (contentTokens[ci]!.has(t)) sharedTerms.push(t);
        if (sharedTerms.length >= 8) break;
      }
      scored.push({
        ad_id: ad.id,
        content_id: contents[ci]!.id,
        score: Math.round(score * 1000) / 1000,
        shared_terms: sharedTerms,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    results.push(...scored.slice(0, maxPerAd));
  }
  return results;
}
