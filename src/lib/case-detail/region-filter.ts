/**
 * Region filter — case.options.region_scope ("global" | "us-only") 적용.
 *
 * IG/YT가 글로벌 풀을 다 수집하지만 일부 케이스는 "US 시장만 분석"하고 싶음.
 * 진짜 country 분류는 API 한계로 불가 → 휴리스틱 필터:
 *   1. caption/title에 non-Latin script (한국/일/중/아랍/태국 등) 50%+ → 제외
 *   2. owner/channel name 끝/시작에 명시적 country suffix → 제외
 *      (ninjakitchenuk, ninja.deutschland, ninja.france 등 자매 owned 계정)
 *
 * 한계:
 *   - 진짜 US 인플이 owner_username에 "us" 같은 suffix 안 박는 경우가 다수
 *   - 영국/호주/캐나다 영어권은 US와 구분 불가 (영어 + suffix 없음)
 *   - "ninjakitchenuk" 같은 자매 owned는 거의 정확히 잡힘
 *
 * 그래서 us-only 결과는 "글로벌 풀 - 명백한 non-US"가 더 정확한 정의.
 */

export type RegionScope = "global" | "us-only";

// non-Latin Unicode ranges (대략):
//   한글 (가-힣 ㄱ-ㅎ ㅏ-ㅣ)
//   일본어 (히라가나 가타가나 한자)
//   중국어 (한자)
//   키릴 (а-я А-Я)
//   아랍 / 히브리 / 데바나가리 / 태국 등
const NON_LATIN_RE =
  /[가-힯぀-ヿ一-鿿Ѐ-ӿ؀-ۿ֐-׿ऀ-ॿ฀-๿]/g;

// owner/channel name에 박힌 명시적 country suffix
const COUNTRY_SUFFIX_PATTERNS = [
  /(?:^|[.\-_])(uk|gb|de|fr|it|es|nl|be|pl|se|no|fi|dk|at|ch|cz|gr|pt|ie|ru)(?:[.\-_]|$)/i,
  /(?:^|[.\-_])(kr|jp|cn|tw|hk|sg|th|vn|id|my|ph|in)(?:[.\-_]|$)/i,
  /(?:^|[.\-_])(mx|br|ar|cl|co|pe)(?:[.\-_]|$)/i,
  /(?:^|[.\-_])(au|nz|za|tr|ae|sa|il|eg)(?:[.\-_]|$)/i,
  /(?:^|[.\-_])(bnl|nordics|emea|apac|latam|eu)(?:[.\-_]|$)/i,
  // 도시/지역 suffix (덜 확정적이지만 흔함)
  /(?:^|[.\-_])(deutschland|france|nippon|nihon|korea|china|mexico|brasil|brazil|espana|italia)(?:[.\-_]|$)/i,
];

/**
 * caption/title의 non-Latin script 비율.
 */
export function nonLatinRatio(text: string | null | undefined): number {
  if (!text) return 0;
  const matches = text.match(NON_LATIN_RE);
  const nonLatinCount = matches?.length ?? 0;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return 0;
  return nonLatinCount / totalChars;
}

/**
 * owner/channel name이 명시적 non-US suffix 가지나?
 */
export function hasNonUsCountrySuffix(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return COUNTRY_SUFFIX_PATTERNS.some((re) => re.test(lower));
}

/**
 * 한 video/post가 US 시장으로 분류 가능한가?
 *
 * @param caption  caption 또는 title + description 합친 텍스트
 * @param ownerName  ig owner_username 또는 yt channel_name
 * @returns  true = US-likely (글로벌 풀에서 제외 안 됨)
 */
export function isLikelyUs(
  caption: string | null | undefined,
  ownerName: string | null | undefined,
): boolean {
  // non-Latin 50%+ → 명백히 non-US
  if (nonLatinRatio(caption) >= 0.5) return false;
  // owner에 country suffix → non-US
  if (hasNonUsCountrySuffix(ownerName)) return false;
  // 그 외 = US-likely
  return true;
}

/**
 * cases.options.region_scope 추출. default "global".
 */
export function getRegionScope(options: unknown): RegionScope {
  if (!options || typeof options !== "object") return "global";
  const scope = (options as { region_scope?: unknown }).region_scope;
  if (scope === "us-only") return "us-only";
  return "global";
}
