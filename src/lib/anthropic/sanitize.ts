/**
 * UTF-16 surrogate pair가 깨진 문자 제거.
 *
 * TikTok caption 또는 ASR text에 깨진 emoji/unicode가 들어 있으면
 * Anthropic SDK의 JSON serialize에서 "no low surrogate in string" 400 에러.
 *
 * - high surrogate (D800-DBFF) 다음에 low surrogate (DC00-DFFF) 안 오면 high 제거
 * - low surrogate가 high 없이 단독으로 있으면 제거
 */
export function sanitizeUtf16(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
