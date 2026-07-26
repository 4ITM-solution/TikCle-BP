import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyLanding,
  unwrapRedirect,
} from "@/lib/inngest/aggregators/phase4a";
import { fetchLandingBridge, type BridgeResult } from "./bridge-detect";

/**
 * BE-21 — 케이스의 DTC(자사 도메인) 랜딩 광고를 도메인 단위 1회 판별해 bridge_status 저장.
 *
 * - 대상: link_url이 있고 landing=dtc인 광고(자사몰). 아마존/IG 등 직접 랜딩은 대상 아님.
 * - "1회 저장"(계약): 같은 도메인 광고가 여러 건이면 도메인당 1회만 fetch → 결과 일괄 적용.
 * - $0: 공개 페이지 GET만. 접속 불가·JS 렌더는 unconfirmed(버튼 미확인)로 정직 표기.
 * - bridge_status 컬럼(마이그레이션 023) 미적용이면 update가 에러나지만 무시(파이프라인 무영향).
 */
export type BridgeBatchStats = {
  dtc_ads: number;
  unique_domains: number;
  confirmed_domains: number;
  updated_ads: number;
  skipped_reason?: string;
};

type AdRow = { id: string; link_url: string | null };

export async function detectAmazonBridgesForCase(
  supabase: SupabaseClient,
  case_id: string,
  opts?: { brandKeyword?: string | null; fetchImpl?: typeof fetch; limitDomains?: number },
): Promise<BridgeBatchStats> {
  const base: BridgeBatchStats = {
    dtc_ads: 0,
    unique_domains: 0,
    confirmed_domains: 0,
    updated_ads: 0,
  };

  const { data: rows, error } = await supabase
    .from("meta_ads")
    .select("id, link_url")
    .eq("case_id", case_id)
    .not("link_url", "is", null);
  if (error) return { ...base, skipped_reason: `fetch: ${error.message}` };

  // DTC 광고만 + 도메인별 그룹핑
  const byDomain = new Map<string, { url: string; ads: AdRow[] }>();
  for (const ad of (rows ?? []) as AdRow[]) {
    if (!ad.link_url) continue;
    if (classifyLanding(ad.link_url, opts?.brandKeyword) !== "dtc") continue;
    base.dtc_ads += 1;
    const real = unwrapRedirect(ad.link_url);
    let domain: string;
    try {
      domain = new URL(real).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const g = byDomain.get(domain) ?? { url: real, ads: [] };
    g.ads.push(ad);
    byDomain.set(domain, g);
  }
  base.unique_domains = byDomain.size;
  if (byDomain.size === 0) return { ...base, skipped_reason: "DTC 랜딩 광고 없음" };

  const domains = [...byDomain.entries()].slice(0, opts?.limitDomains ?? 200);
  const now = new Date().toISOString();
  for (const [, group] of domains) {
    const result: BridgeResult = await fetchLandingBridge(group.url, {
      fetchImpl: opts?.fetchImpl,
    });
    if (result.status === "confirmed") base.confirmed_domains += 1;
    const ids = group.ads.map((a) => a.id);
    // 도메인 결과를 해당 도메인 전 광고에 일괄 저장 (컬럼 미적용이면 error 무시).
    const { error: upErr } = await supabase
      .from("meta_ads")
      .update({
        bridge_status: result.status,
        bridge_amazon_url: result.amazon_urls[0] ?? null,
        bridge_checked_at: now,
      } as never)
      .in("id", ids);
    if (!upErr) base.updated_ads += ids.length;
  }

  return base;
}
