import { createHash } from "node:crypto";

/**
 * 태깅 입력 dedup (WS3 §3).
 *
 * WS1의 "vision_tags non-null이면 skip"은 *같은 행 재실행* 방지다.
 * 이 모듈은 *다른 행(다른 content_id / ad_archive_id, 심지어 다른 케이스)이지만
 * 실제 입력이 동일*한 경우 재태깅(=중복 과금)을 막는다.
 *
 * 키: 태깅 입력(caption·cover/thumbnail·asr)의 sha256. 동일 해시가 이미
 * 태깅돼 있으면 LLM 호출 없이 결과를 복사한다.
 */

/**
 * URL에서 만료성 쿼리스트링(TikTok/FB 서명·x-expires 등)을 떼어 안정 키로.
 * 같은 이미지라도 서명이 매번 바뀌므로 경로만 해시에 쓴다.
 */
export function stableUrlKey(url: string | null | undefined): string {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * 태깅 입력 해시. 각 파트는 공백 정규화 후 NUL 구분자로 이어 sha256.
 * cover/thumbnail은 stableUrlKey로 넘길 것(서명 제거).
 */
export function tagInputHash(parts: Array<string | null | undefined>): string {
  const norm = parts.map((p) => (p ?? "").replace(/\s+/g, " ").trim());
  return createHash("sha256").update(norm.join("\u0000")).digest("hex");
}
