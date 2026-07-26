/**
 * BE-21 — 광고 랜딩 "브릿지→아마존" 판별 ($0, HTML 1회 fetch).
 *
 * 자사 도메인(DTC) 랜딩 광고가 실제로는 아마존으로 유도하는지 판별한다. 랜딩 HTML을 1회
 * fetch → 페이지 내 URL 중 **아마존 도메인 + Amazon Attribution 태그(maas·aa_maas)**가 있으면
 * bridge_to_amazon 확정. JS 렌더·접속 불가는 "버튼 미확인"으로 정직 표기(오판 금지).
 *
 * 프로토_데이터계약.md E섹션 "브릿지→아마존 랜딩" 로직 상세화.
 */

export type BridgeStatus = "confirmed" | "unconfirmed";

export type BridgeResult = {
  status: BridgeStatus;
  amazon_urls: string[]; // 확정 시 근거 URL (최대 5)
  reason?: string; // unconfirmed 사유 (fetch 실패/버튼 미확인 등)
};

const AMAZON_HOST_RE = /(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.(to|com)$|(^|\.)a\.co$/i;

/** URL 하나가 아마존 도메인 + attribution(maas/aa_maas)인지. */
function isAmazonAttributionUrl(raw: string): boolean {
  const u = raw.replace(/&amp;/g, "&");
  let host: string;
  let params: URLSearchParams;
  try {
    const p = new URL(u);
    host = p.hostname;
    params = p.searchParams;
  } catch {
    return false;
  }
  if (!AMAZON_HOST_RE.test(host)) return false;
  // Amazon Attribution 시그니처: maas / aa_maas 파라미터, 또는 ref_ 값에 maas 포함.
  // (실측 예: ...amazon.com/dp/XXX?maas=maas_adg_..._afap_abs&ref_=aa_maas&tag=maas)
  const refv = (params.get("ref_") ?? "").toLowerCase();
  return (
    params.has("maas") ||
    params.has("aa_maas") ||
    refv.includes("maas") ||
    /[?&](aa_)?maas=/i.test(u)
  );
}

/**
 * HTML 문자열에서 아마존 attribution URL을 찾아 브릿지 판별. 순수 함수(네트워크 없음).
 * href·data 속성·onclick·JSON 블롭 등 위치 무관하게 페이지 내 모든 http(s) URL을 후보로 스캔한다
 * (버튼 목적지가 JS/데이터 속성에 있어도 포착).
 */
export function detectAmazonBridge(html: string): BridgeResult {
  const urls = html.match(/https?:\/\/[^\s"'<>\\)]+/gi) ?? [];
  const hits: string[] = [];
  for (const raw of urls) {
    if (isAmazonAttributionUrl(raw)) hits.push(raw.replace(/&amp;/g, "&"));
  }
  if (hits.length === 0) {
    return { status: "unconfirmed", amazon_urls: [], reason: "버튼 미확인" };
  }
  return { status: "confirmed", amazon_urls: [...new Set(hits)].slice(0, 5) };
}

const FETCH_TIMEOUT_MS = 8000;
const UA =
  "Mozilla/5.0 (compatible; TikCleBridgeBot/1.0; +https://tikcle.example/bot)";

/**
 * 랜딩 URL을 1회 fetch → detectAmazonBridge. 접속 불가·비HTML·타임아웃은 unconfirmed(버튼 미확인).
 * $0 — 유료 API 아님, 공개 페이지 GET 1회. 리다이렉트는 fetch가 따라감.
 */
export async function fetchLandingBridge(
  url: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<BridgeResult> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? FETCH_TIMEOUT_MS,
  );
  try {
    const res = await doFetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept: "text/html,*/*" },
    });
    if (!res.ok) {
      return { status: "unconfirmed", amazon_urls: [], reason: `HTTP ${res.status}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ctype)) {
      // 비HTML(대개 JS 앱 셸·리다이렉트 스크립트) → 버튼 미확인
      return { status: "unconfirmed", amazon_urls: [], reason: `non-html (${ctype.slice(0, 40)})` };
    }
    const html = await res.text();
    return detectAmazonBridge(html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "unconfirmed", amazon_urls: [], reason: `fetch 실패: ${msg.slice(0, 80)}` };
  } finally {
    clearTimeout(timer);
  }
}
