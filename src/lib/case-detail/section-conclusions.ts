/**
 * ★ C1(WS4b): 섹션별 1줄 결론 조립 (서버, 템플릿+수치 — LLM 금지).
 * 근거 부족하면 null → 화면은 "데이터 없음" 회색 처리.
 */

type Loose = Record<string, unknown> | null | undefined;

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a * 100) / b) : 0);
const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;

export type SectionConclusions = {
  A: string | null;
  B: string | null;
  C: string | null;
  D: string | null;
  E: string | null;
  G: string | null;
};

export function buildSectionConclusions(ks: Loose, brand: string): SectionConclusions {
  const phase2 = (ks?.phase2 ?? null) as Loose;
  const phase3 = (ks?.phase3 ?? null) as Loose;
  const phase4a = (ks?.phase4a ?? null) as Loose;
  const phase4bC = (ks?.phase4b_clusters ?? null) as Loose;
  const phase5 = (ks?.phase5 ?? null) as Loose;

  // A — 콘텐츠 활동: 총 영상 · 광고 비중 · 피크 월
  const A = (() => {
    if (!phase2) return null;
    const total = num(phase2.total_contents);
    if (total === 0) return null;
    const monthly = (phase2.monthly_video_counts as Array<{ month: string; paid: number; organic: number; total: number }> | undefined) ?? [];
    let paidSum = 0, allSum = 0;
    let peak: { month: string; total: number } | null = null;
    for (const m of monthly) {
      paidSum += m.paid;
      allSum += m.total;
      if (!peak || m.total > peak.total) peak = { month: m.month, total: m.total };
    }
    const parts = [`총 ${total.toLocaleString()}건`];
    if (allSum > 0) parts.push(`광고 ${pct(paidSum, allSum)}%`);
    if (peak && peak.total > 0) parts.push(`피크 ${peak.month} ${peak.total.toLocaleString()}건`);
    return parts.join(" · ");
  })();

  // B — 인플루언서 풀: 인플 수 · 1편만(long-tail) 비율
  const B = (() => {
    if (!phase2) return null;
    const creators = num(phase2.total_unique_creators);
    if (creators === 0) return null;
    const vpc = (phase2.videos_per_creator as Record<string, number> | undefined) ?? {};
    const oneOff = num(vpc["1"]);
    const parts = [`인플 ${creators.toLocaleString()}명`];
    if (oneOff > 0) parts.push(`1편만 ${pct(oneOff, creators)}% (long-tail)`);
    return parts.join(" · ");
  })();

  // C — 콘텐츠 포맷: 클러스터 수 · 상위 USP 키워드
  const C = (() => {
    const metas = (phase4bC?.meta_clusters as Array<unknown> | undefined) ?? [];
    const usp = (phase5?.usp_keywords as Array<{ keyword: string }> | undefined) ?? [];
    if (metas.length === 0 && usp.length === 0) return null;
    const parts: string[] = [];
    if (metas.length > 0) parts.push(`콘텐츠 유형 ${metas.length}개`);
    if (usp.length > 0) parts.push(`상위 USP '${usp[0]!.keyword}'`);
    return parts.join(" · ");
  })();

  // D — 매출·SKU: 30일 매출 · SKU 수 · top3 비중
  const D = (() => {
    const sales = (phase2?.sales_summary ?? null) as Loose;
    if (!sales) return null;
    const rev = num(sales.total_revenue);
    const skuCount = num(sales.sku_count);
    const parts: string[] = [];
    if (rev > 0) parts.push(`30일 매출 $${fmtK(rev)}`);
    if (skuCount > 0) parts.push(`SKU ${skuCount}개`);
    if (parts.length === 0) return null;
    return parts.join(" · ");
  })();

  // E — Meta 광고: 광고 수 · 활성 · partnership
  const E = (() => {
    if (!phase4a) return null;
    const totalAds = num(phase4a.total_ads);
    if (totalAds === 0) return null;
    const active = num(phase4a.active_ads);
    const partners = num(phase4a.partnership_creators);
    const parts = [`광고 ${totalAds.toLocaleString()}건`];
    if (active > 0) parts.push(`활성 ${active.toLocaleString()}`);
    if (partners > 0) parts.push(`partnership 인플 ${partners}명`);
    return parts.join(" · ");
  })();

  // G — 종합: 브랜드 + 채널 폭
  const G = (() => {
    if (!phase2) return null;
    const total = num(phase2.total_contents);
    const ig = num(phase2.ig_total_videos);
    const yt = num(phase2.yt_total_videos);
    const ads = num(phase4a?.total_ads);
    if (total === 0 && ig === 0 && yt === 0 && ads === 0) return null;
    const chans: string[] = [];
    if (total > 0) chans.push(`TikTok ${fmtK(total)}`);
    if (ig > 0) chans.push(`IG ${fmtK(ig)}`);
    if (yt > 0) chans.push(`YT ${fmtK(yt)}`);
    if (ads > 0) chans.push(`광고 ${fmtK(ads)}`);
    return `${brand} — ${chans.join(" · ")}`;
  })();

  return { A, B, C, D, E, G };
}
