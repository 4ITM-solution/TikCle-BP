/**
 * Apify apify/instagram-profile-scraper 호출 래퍼.
 *
 * 입력: username list (max ~1000)
 * 출력: profile per username — followers / following / bio / external_url / verified / business
 *
 * 사용: Phase 4c.5 — ig_authors 의 followers IS NULL 인 row 의 username 다 모아서 호출 + DB update.
 * 비용: 약 $0.005 / username (700명 ~$3.50).
 */

import { runApifyActor } from "./instagram-shared";

export type IgProfileRaw = {
  username: string;
  full_name: string | null;
  followers: number | null;
  following: number | null;
  bio: string | null;
  external_url: string | null;
  verified: boolean | null;
  is_business_account: boolean | null;
  posts_count: number | null;
};

export async function runIgProfileScraper(
  usernames: string[],
): Promise<{
  profiles: IgProfileRaw[];
  apify_run_id: string | null;
  status: string;
  cost_estimate_usd: number;
  skipped_reason?: string;
}> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 미설정");
  if (usernames.length === 0) {
    return { profiles: [], apify_run_id: null, status: "SKIPPED", cost_estimate_usd: 0 };
  }

  const cleanUsernames = [...new Set(usernames.map((u) => u.replace(/^@/, "").trim()).filter((u) => u.length > 0))];

  // Apify actor: apify/instagram-scraper + resultsType='details' + directUrls (profile URL)
  // 'apify/instagram-profile-scraper' 는 존재 안 함 (404). 이게 정식 actor.
  const input = {
    directUrls: cleanUsernames.map((u) => `https://www.instagram.com/${u}/`),
    resultsType: "details",
    resultsLimit: cleanUsernames.length,
    addParentData: false,
    proxy: { useApifyProxy: true },
  };

  const result = await runApifyActor("apify/instagram-scraper", input, token);

  // apify/instagram-scraper details mode 응답 field:
  // username, fullName, biography, externalUrl, externalUrlShimmed,
  // followersCount, followsCount, hasChannel, highlightReelCount,
  // isBusinessAccount, joinedRecently, businessCategoryName, private, verified,
  // profilePicUrl, profilePicUrlHD, postsCount, ...
  const profiles: IgProfileRaw[] = (result.items ?? []).map((raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      username: typeof r.username === "string" ? r.username : "",
      full_name: typeof r.fullName === "string" ? r.fullName : null,
      followers: typeof r.followersCount === "number" ? r.followersCount : null,
      following: typeof r.followsCount === "number" ? r.followsCount : null,
      bio: typeof r.biography === "string" ? r.biography : null,
      external_url:
        typeof r.externalUrl === "string"
          ? r.externalUrl
          : typeof r.externalUrlShimmed === "string"
            ? r.externalUrlShimmed
            : null,
      verified: typeof r.verified === "boolean" ? r.verified : null,
      is_business_account: typeof r.isBusinessAccount === "boolean" ? r.isBusinessAccount : null,
      posts_count: typeof r.postsCount === "number" ? r.postsCount : null,
    };
  }).filter((p) => p.username.length > 0);

  return {
    profiles,
    apify_run_id: result.apify_run_id,
    status: result.status,
    cost_estimate_usd: cleanUsernames.length * 0.005,
    skipped_reason: result.skipped_reason,
  };
}

/**
 * bio + external_url 안에서 TK / YT / X 핸들 추출.
 *
 * 패턴:
 *   - "TikTok: @x" / "TT: @x" / "tt @x"
 *   - "YouTube: @x" / "YT: @x" / "youtube.com/@x"
 *   - "twitter.com/x" / "x.com/x"
 *   - external_url 의 도메인 매칭 (tiktok.com / youtube.com)
 */
export function extractCrossChannelHandles(
  bio: string | null,
  externalUrl: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const text = `${bio ?? ""} ${externalUrl ?? ""}`;

  // TikTok
  const tk =
    text.match(/tiktok\.com\/@([a-z0-9._]{2,30})/i) ||
    text.match(/(?:^|\s)(?:tiktok|tt)\s*[:：]?\s*@([a-z0-9._]{2,30})/i);
  if (tk?.[1]) out.tiktok = tk[1].toLowerCase();

  // YouTube
  const yt =
    text.match(/youtube\.com\/(?:@|c\/|channel\/|user\/)([a-zA-Z0-9._-]{2,40})/i) ||
    text.match(/youtu\.be\/([a-zA-Z0-9._-]{2,40})/i) ||
    text.match(/(?:^|\s)(?:youtube|yt)\s*[:：]?\s*@([a-zA-Z0-9._-]{2,40})/i);
  if (yt?.[1]) out.youtube = yt[1].toLowerCase();

  // Twitter / X
  const tw =
    text.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]{2,15})/i) ||
    text.match(/(?:^|\s)(?:twitter|x)\s*[:：]?\s*@([a-zA-Z0-9_]{2,15})/i);
  if (tw?.[1]) out.twitter = tw[1].toLowerCase();

  return out;
}
