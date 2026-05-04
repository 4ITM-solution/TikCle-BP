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

/**
 * 깊은 traversal로 모든 string 필드의 surrogate 깨진 char 제거.
 * Inngest step.run의 return value를 cloud에 JSON serialize할 때 "JCS: Missing surrogate"
 * 에러 방지용. phase 결과 stats가 raw caption/ad text를 들고 있으면 그게 깨질 수 있음.
 *
 * Date / null / undefined / number / boolean은 그대로.
 * Array / object는 재귀.
 */
export function sanitizeDeep<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return sanitizeUtf16(v) as T;
  if (Array.isArray(v)) return (v.map(sanitizeDeep) as unknown) as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeDeep(val);
    }
    return out as T;
  }
  return v;
}
