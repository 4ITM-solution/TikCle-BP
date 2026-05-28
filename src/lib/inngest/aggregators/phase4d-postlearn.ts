import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { YtConfig } from "./phase4d-yt-monitor";

type SupaClient = SupabaseClient<Database>;

const CELEB_VIEW_THRESHOLD = 100_000;  // YT는 IG보다 낮게 (long-form 100K = paid 큰편)
const HIGH_PAID_PCT = 60;               // YT는 paid hashtag 약함, threshold 낮춤
const MIN_HASHTAG_VIDEOS = 5;

export type Phase4dPostlearnResult = {
  learned_config: YtConfig;
  diff: {
    new_author_seeds: string[];          // 채널 URL
    new_celeb_handles: string[];
    new_brand_keywords: string[];
    new_paid_keywords: string[];
  };
  debug: {
    top_channels_count: number;
    high_view_celebs_count: number;
    high_paid_hashtags_count: number;
    videos_analyzed: number;
  };
  skipped_reason?: string;
};

export async function runPhase4dPostlearn(
  supabase: SupaClient,
  case_id: string,
): Promise<Phase4dPostlearnResult> {
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("yt_config")
    .eq("id", case_id)
    .single();
  if (cErr || !c) throw new Error(`case fetch: ${cErr?.message}`);

  const cfg = (c.yt_config ?? {}) as YtConfig;
  const owned = new Set(cfg.yt_owned_channels ?? []);
  const existingSeeds = new Set(cfg.yt_author_seeds ?? []);
  const existingCelebs = new Set(cfg.yt_celeb_handles ?? []);
  const existingKeywords = new Set(
    (cfg.yt_brand_keywords ?? []).map((s) => s.toLowerCase()),
  );
  const existingPaidKw = new Set(
    (cfg.yt_paid_keywords ?? []).map((s) => s.toLowerCase()),
  );

  // 1. author_seeds — top max_views 채널 (channel_url 기준, owned + 기존 seed 제외)
  const { data: chRaw } = await supabase
    .from("yt_channels")
    .select("channel_name, channel_url, max_views, paid_videos, subscriber_count")
    .eq("case_id", case_id)
    .order("max_views", { ascending: false, nullsFirst: false })
    .limit(50);
  const topChannels = (chRaw ?? []).filter(
    (c2) => c2.channel_url && !owned.has(c2.channel_url),
  );
  const newAuthorSeeds = topChannels
    .slice(0, 20)
    .map((c2) => c2.channel_url!)
    .filter((u) => !existingSeeds.has(u));

  // 2. celeb_handles — paid video + max_views >= threshold + subscriber >= 100K
  const newCelebs = topChannels
    .filter(
      (c2) =>
        c2.paid_videos > 0 &&
        (c2.max_views ?? 0) >= CELEB_VIEW_THRESHOLD &&
        (c2.subscriber_count ?? 0) >= 100_000 &&
        c2.channel_url &&
        !existingCelebs.has(c2.channel_url),
    )
    .map((c2) => c2.channel_url!);

  // 3. paid % 높은 hashtag → keyword + paid_kw 자동
  const { data: vidRaw } = await supabase
    .from("yt_videos")
    .select("hashtags, paid_signal")
    .eq("case_id", case_id)
    .eq("brand_matched", true)
    .limit(5000);
  const tagMap = new Map<string, { count: number; paid: number }>();
  for (const r of vidRaw ?? []) {
    if (!Array.isArray(r.hashtags)) continue;
    const isPaid = !!r.paid_signal;
    for (const t of r.hashtags) {
      if (typeof t !== "string") continue;
      let agg = tagMap.get(t);
      if (!agg) {
        agg = { count: 0, paid: 0 };
        tagMap.set(t, agg);
      }
      agg.count += 1;
      if (isPaid) agg.paid += 1;
    }
  }
  const highPaidHashtags = Array.from(tagMap.entries())
    .filter(
      ([, v]) =>
        v.count >= MIN_HASHTAG_VIDEOS && (v.paid * 100) / v.count >= HIGH_PAID_PCT,
    )
    .map(([tag]) => tag);

  const newBrandKeywords = highPaidHashtags
    .filter((t) => !existingKeywords.has(t.toLowerCase()))
    .slice(0, 10);
  const newPaidKeywords = highPaidHashtags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((kw) => !existingPaidKw.has(kw.toLowerCase()));

  const learned: YtConfig = {
    ...cfg,
    yt_author_seeds: Array.from(
      new Set([...(cfg.yt_author_seeds ?? []), ...newAuthorSeeds]),
    ),
    yt_celeb_handles: Array.from(
      new Set([...(cfg.yt_celeb_handles ?? []), ...newCelebs]),
    ),
    yt_brand_keywords: Array.from(
      new Set([...(cfg.yt_brand_keywords ?? []), ...newBrandKeywords]),
    ),
    yt_paid_keywords: Array.from(
      new Set([...(cfg.yt_paid_keywords ?? []), ...newPaidKeywords]),
    ),
  };

  return {
    learned_config: learned,
    diff: {
      new_author_seeds: newAuthorSeeds,
      new_celeb_handles: newCelebs,
      new_brand_keywords: newBrandKeywords,
      new_paid_keywords: newPaidKeywords,
    },
    debug: {
      top_channels_count: topChannels.length,
      high_view_celebs_count: newCelebs.length,
      high_paid_hashtags_count: highPaidHashtags.length,
      videos_analyzed: vidRaw?.length ?? 0,
    },
  };
}
