/**
 * BP IG/YT 데이터 분석 헬퍼 — page.tsx에서 fetch한 ig_posts/ig_authors,
 * yt_videos/yt_channels 데이터를 후처리해서 차트용 시리즈로.
 *
 * 두 차원:
 *   1. 티어 분포 (likes 또는 subscriber 기준 proxy 분류)
 *   2. 시기별 트렌드 (월별 영상 수 + paid 비율)
 *   3. 풀 summary (총 작성자/영상/owned/paid 등)
 */

// IG: max_likes proxy 티어 (followers 잡힐 때만 진짜 티어, 일반은 likes proxy)
export type ProxyTier = "mega" | "macro" | "mid" | "micro" | "nano" | "unknown";

export function maxLikesProxyTier(maxLikes: number | null | undefined): ProxyTier {
  if (maxLikes == null) return "unknown";
  if (maxLikes >= 100_000) return "mega";
  if (maxLikes >= 10_000) return "macro";
  if (maxLikes >= 1_000) return "mid";
  if (maxLikes >= 100) return "micro";
  return "nano";
}

// YT: subscriber_count 정확 (잡혔을 때만)
export function subscriberTier(subs: number | null | undefined): ProxyTier {
  if (subs == null) return "unknown";
  if (subs >= 1_000_000) return "mega";
  if (subs >= 100_000) return "macro";
  if (subs >= 10_000) return "mid";
  if (subs >= 1_000) return "micro";
  return "nano";
}

export type TierBucket = {
  tier: ProxyTier;
  authors: number;
  videos: number;     // 그 티어 작성자들의 영상 합
  paid_videos: number;
};

export function tierDistributionIg(
  authors: Array<{
    max_likes: number | null;
    brand_matched_posts: number;
    paid_posts: number;
  }>,
): TierBucket[] {
  const map = new Map<ProxyTier, TierBucket>();
  const init: ProxyTier[] = ["mega", "macro", "mid", "micro", "nano", "unknown"];
  for (const t of init) {
    map.set(t, { tier: t, authors: 0, videos: 0, paid_videos: 0 });
  }
  for (const a of authors) {
    const t = maxLikesProxyTier(a.max_likes);
    const b = map.get(t)!;
    b.authors += 1;
    b.videos += a.brand_matched_posts;
    b.paid_videos += a.paid_posts;
  }
  return Array.from(map.values()).filter((b) => b.authors > 0);
}

export function tierDistributionYt(
  channels: Array<{
    subscriber_count: number | null;
    brand_matched_videos: number;
    paid_videos: number;
  }>,
): TierBucket[] {
  const map = new Map<ProxyTier, TierBucket>();
  const init: ProxyTier[] = ["mega", "macro", "mid", "micro", "nano", "unknown"];
  for (const t of init) {
    map.set(t, { tier: t, authors: 0, videos: 0, paid_videos: 0 });
  }
  for (const ch of channels) {
    const t = subscriberTier(ch.subscriber_count);
    const b = map.get(t)!;
    b.authors += 1;
    b.videos += ch.brand_matched_videos;
    b.paid_videos += ch.paid_videos;
  }
  return Array.from(map.values()).filter((b) => b.authors > 0);
}

// 시기별 — 월 단위 (YYYY-MM)
export type MonthlyBucket = {
  month: string;         // "2026-05"
  videos: number;
  paid: number;
  total_views: number;
};

export function monthlyTrend(
  rows: Array<{
    posted_at?: string | null;
    uploaded_at?: string | null;
    paid_signal: string | null;
    view_count?: number | null;
    video_play_count?: number | null;
    likes_count?: number | null;
  }>,
): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>();
  for (const r of rows) {
    const ts = r.posted_at ?? r.uploaded_at;
    if (!ts) continue;
    const month = ts.slice(0, 7); // "YYYY-MM"
    let b = map.get(month);
    if (!b) {
      b = { month, videos: 0, paid: 0, total_views: 0 };
      map.set(month, b);
    }
    b.videos += 1;
    if (r.paid_signal) b.paid += 1;
    const views =
      r.view_count ?? r.video_play_count ?? r.likes_count ?? 0;
    b.total_views += views;
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// 풀 summary
export type PoolSummary = {
  total_authors: number;
  paid_authors: number;
  owned_authors: number;
  repeat_authors: number;          // brand_matched 5+ posts (committed)
  one_off_authors: number;         // 1 post (occasional)
  top5_views_share_pct: number;    // top 5 작성자가 차지하는 총 views 비율
};

export function poolSummary(
  authors: Array<{
    max_likes: number | null;
    max_views?: number | null;
    paid_posts: number;
    brand_matched_posts: number;
    total_likes?: number | null;
    total_views?: number | null;
    username?: string;
    channel_name?: string;
    channel_url?: string;
  }>,
  ownedIds: string[],
): PoolSummary {
  const totalViews = authors.reduce((s, a) => {
    const v = a.total_views ?? a.total_likes ?? 0;
    return s + v;
  }, 0);
  const sortedByViews = [...authors].sort(
    (a, b) => (b.total_views ?? b.total_likes ?? 0) - (a.total_views ?? a.total_likes ?? 0),
  );
  const top5Views = sortedByViews.slice(0, 5).reduce((s, a) => {
    return s + (a.total_views ?? a.total_likes ?? 0);
  }, 0);

  return {
    total_authors: authors.length,
    paid_authors: authors.filter((a) => a.paid_posts > 0).length,
    owned_authors: authors.filter((a) => {
      const id = a.username ?? a.channel_url ?? a.channel_name ?? "";
      return ownedIds.includes(id);
    }).length,
    repeat_authors: authors.filter((a) => a.brand_matched_posts >= 5).length,
    one_off_authors: authors.filter((a) => a.brand_matched_posts === 1).length,
    top5_views_share_pct:
      totalViews > 0 ? Math.round((top5Views * 100) / totalViews) : 0,
  };
}
