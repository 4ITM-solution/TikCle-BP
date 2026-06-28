/**
 * 메타 광고 link_url의 UTM(utm_campaign/utm_term)에서 소스 크리에이터 핸들 추출.
 *
 * 일부 브랜드는 광고 소재를 크리에이터 핸들로 라벨링함:
 *   Kiero: utm_campaign=KIERO_MX_ENZYME_dalika_260507
 *          → BRAND_MARKET_PRODUCT_<handle>_<YYMMDD>
 * 브랜드직접 발행(creator_page_name=null) UGC의 출처 식별에 사용.
 *
 * ⚠️ 휴리스틱이며 브랜드마다 네이밍이 다름. 확실한 패턴(날짜 접미 + 핸들 토큰)일 때만
 *    반환하고, 애매하면 null. 정체 단정이 아니라 "힌트"로만 쓸 것.
 */

// 핸들이 아닌 게 명백한 토큰 (마케팅/포맷/시장/제품 키워드)
const STOPWORDS = new Set([
  "image",
  "video",
  "ugc",
  "conversion",
  "meta",
  "all",
  "off",
  "40off",
  "30off",
  "20off",
  "models",
  "model",
  "worldcup",
  "static",
  "carousel",
  "dco",
  "dpa",
  "retargeting",
  "prospecting",
  "broad",
  "test",
  "skincare",
  "sun",
  "spf",
  "enzyme",
  "serum",
  "balm",
  "toner",
  "eye",
  "stick",
  "gel",
  "cleanser",
  "mx",
  "us",
  "kr",
  "es",
  "br",
  "co",
  "global",
]);

// 핸들과 날짜 사이에 낄 수 있는 포맷/타입 접미사 (건너뛰기 대상)
const FORMAT_SUFFIX = new Set([
  "ugc",
  "image",
  "video",
  "static",
  "carousel",
  "dco",
  "dpa",
]);

function isDateToken(t: string): boolean {
  // 6자리 YYMMDD 또는 8자리 YYYYMMDD, 또는 4자리 MMDD
  return /^\d{6}$/.test(t) || /^\d{8}$/.test(t) || /^\d{4}$/.test(t);
}

function looksLikeHandle(t: string): boolean {
  const s = t.toLowerCase();
  if (s.length < 3 || s.length > 30) return false;
  if (STOPWORDS.has(s)) return false;
  if (/^\d+$/.test(s)) return false; // 순수 숫자 제외
  // 핸들은 보통 영문/숫자/언더스코어/점. 너무 일반적인 단어는 위 stopword로 걸름.
  return /^[a-z0-9][a-z0-9._]*$/i.test(s);
}

function parseFromValue(raw: string): string | null {
  // 구분자: 언더스코어 기준 분해 (대시도 보조)
  const tokens = raw.split(/[_]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 3) return null;

  // 날짜 토큰 위치 찾기 → 그 "바로 앞" 토큰만 핸들 후보 (Kiero 패턴).
  // walk-back 하면 브랜드명/제품코드를 잘못 긁으므로 immediate predecessor만.
  // 핸들 슬롯이 stopword(models/IMAGE 등)면 크리에이터 없는 소재 → null.
  const dateIdx = tokens.findIndex(isDateToken);
  if (dateIdx >= 1) {
    // 핸들과 날짜 사이에 낄 수 있는 포맷 접미사만 건너뜀 (ugc/image/video...).
    let i = dateIdx - 1;
    while (i >= 0 && FORMAT_SUFFIX.has(tokens[i]!.toLowerCase())) i -= 1;
    if (i >= 0 && looksLikeHandle(tokens[i]!)) return tokens[i]!.toLowerCase();
  }
  return null;
}

/**
 * link_url에서 크리에이터 핸들 추출. 못 찾으면 null.
 */
export function parseCreatorFromUtm(linkUrl: string | null): string | null {
  if (!linkUrl) return null;
  let params: URLSearchParams;
  try {
    params = new URL(linkUrl).searchParams;
  } catch {
    return null;
  }
  // utm_term 우선(보통 더 구체적) → utm_campaign 폴백
  for (const key of ["utm_term", "utm_campaign"]) {
    const v = params.get(key);
    if (!v) continue;
    const handle = parseFromValue(v);
    if (handle) return handle;
  }
  return null;
}
