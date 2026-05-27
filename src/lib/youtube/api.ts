/**
 * YouTube Data API v3 클라이언트 (무료 quota 10,000 units/day).
 *
 * 사용처: TT Shop 자연 viral / Amazon 케이스에서 인플루언서 시딩 영상을 YouTube
 * 채널에서 자동 발견. SharkNinja 같은 글로벌 브랜드 분석 시 TikTok-only BP의
 * 한계 보완.
 *
 * Quota 가이드:
 * - Search 1회: 100 units → 100 searches/day 가능
 * - Video metadata 1개: 1 unit → 10,000 영상/day
 * - Channel metadata 1개: 1 unit
 *
 * API key 발급: Google Cloud Console → YouTube Data API v3 활성화 → API key 생성.
 * 결제 카드 등록 X (free tier).
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export type YoutubeSearchVideo = {
  videoId: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string; // ISO
  thumbnailUrl: string | null;
};

export type YoutubeVideoMetadata = {
  videoId: string;
  url: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration: string; // ISO 8601 (PT1M30S 형식)
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
};

export type YoutubeChannelMetadata = {
  channelId: string;
  handle: string | null; // @handle (있으면)
  title: string;
  description: string;
  subscriberCount: number | null; // 100K 단위로 반올림됨
  viewCount: number;
  videoCount: number;
  publishedAt: string;
  thumbnailUrl: string | null;
};

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key)
    throw new Error(
      "YOUTUBE_API_KEY 환경변수 없음. Google Cloud Console에서 발급 후 .env에 박아주세요.",
    );
  return key;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`YouTube API ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

/**
 * 키워드 검색 — Top N 영상 (relevance 또는 date 순).
 * 100 quota units 소모.
 */
export async function searchYoutubeVideos(opts: {
  query: string;
  maxResults?: number; // 1-50
  order?: "relevance" | "date" | "viewCount";
  publishedAfter?: string; // ISO 8601
  regionCode?: string; // "US"
  pageToken?: string;
}): Promise<{
  videos: YoutubeSearchVideo[];
  nextPageToken: string | null;
  totalResults: number;
}> {
  const key = getApiKey();
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: opts.query,
    maxResults: String(opts.maxResults ?? 50),
    order: opts.order ?? "relevance",
    key,
  });
  if (opts.publishedAfter) params.set("publishedAfter", opts.publishedAfter);
  if (opts.regionCode) params.set("regionCode", opts.regionCode);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  type SearchResponse = {
    items: Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        description: string;
        channelId: string;
        channelTitle: string;
        publishedAt: string;
        thumbnails?: { medium?: { url: string }; default?: { url: string } };
      };
    }>;
    nextPageToken?: string;
    pageInfo?: { totalResults: number };
  };

  const data = await fetchJson<SearchResponse>(
    `${YOUTUBE_API_BASE}/search?${params}`,
  );

  return {
    videos: data.items.map((item) => ({
      videoId: item.id.videoId,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl:
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ??
        null,
    })),
    nextPageToken: data.nextPageToken ?? null,
    totalResults: data.pageInfo?.totalResults ?? 0,
  };
}

/**
 * 영상 metadata 일괄 fetch (1 unit / 영상). videoIds 50개씩 batch.
 */
export async function getYoutubeVideoMetadata(
  videoIds: string[],
): Promise<YoutubeVideoMetadata[]> {
  if (videoIds.length === 0) return [];
  const key = getApiKey();
  const out: YoutubeVideoMetadata[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: batch.join(","),
      key,
    });
    type Resp = {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          description: string;
          channelId: string;
          channelTitle: string;
          publishedAt: string;
          tags?: string[];
        };
        contentDetails: { duration: string };
        statistics: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    };
    const data = await fetchJson<Resp>(`${YOUTUBE_API_BASE}/videos?${params}`);
    for (const item of data.items) {
      out.push({
        videoId: item.id,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails.duration,
        viewCount: Number(item.statistics.viewCount ?? 0),
        likeCount: Number(item.statistics.likeCount ?? 0),
        commentCount: Number(item.statistics.commentCount ?? 0),
        tags: item.snippet.tags ?? [],
      });
    }
  }
  return out;
}

/**
 * Channel metadata 일괄 fetch (1 unit / 채널). 시딩 인플의 팔로워·영상 수 등 매핑.
 */
export async function getYoutubeChannelMetadata(
  channelIds: string[],
): Promise<YoutubeChannelMetadata[]> {
  if (channelIds.length === 0) return [];
  const key = getApiKey();
  const out: YoutubeChannelMetadata[] = [];

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: batch.join(","),
      key,
    });
    type Resp = {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          description: string;
          publishedAt: string;
          customUrl?: string;
          thumbnails?: {
            medium?: { url: string };
            default?: { url: string };
          };
        };
        statistics: {
          subscriberCount?: string;
          hiddenSubscriberCount?: boolean;
          viewCount?: string;
          videoCount?: string;
        };
      }>;
    };
    const data = await fetchJson<Resp>(
      `${YOUTUBE_API_BASE}/channels?${params}`,
    );
    for (const item of data.items) {
      out.push({
        channelId: item.id,
        handle: item.snippet.customUrl
          ? item.snippet.customUrl.replace(/^@/, "")
          : null,
        title: item.snippet.title,
        description: item.snippet.description,
        subscriberCount: item.statistics.hiddenSubscriberCount
          ? null
          : Number(item.statistics.subscriberCount ?? 0),
        viewCount: Number(item.statistics.viewCount ?? 0),
        videoCount: Number(item.statistics.videoCount ?? 0),
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl:
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          null,
      });
    }
  }
  return out;
}

/**
 * Search + 영상 metadata + 채널 metadata 통합 fetch — 한 번에 N개 풍부한 데이터.
 * Total quota: 100 (search) + ceil(N/50) (video) + ceil(unique_channels/50) (channel).
 *
 * 50 영상 받기 = 약 102 units.
 */
export async function searchYoutubeFullData(opts: {
  query: string;
  maxResults?: number;
  order?: "relevance" | "date" | "viewCount";
  publishedAfter?: string;
  regionCode?: string;
}): Promise<{
  videos: YoutubeVideoMetadata[];
  channels: Map<string, YoutubeChannelMetadata>;
}> {
  const search = await searchYoutubeVideos(opts);
  if (search.videos.length === 0) {
    return { videos: [], channels: new Map() };
  }
  const videoIds = search.videos.map((v) => v.videoId);
  const videos = await getYoutubeVideoMetadata(videoIds);

  const uniqueChannels = Array.from(new Set(videos.map((v) => v.channelId)));
  const channels = await getYoutubeChannelMetadata(uniqueChannels);
  const channelMap = new Map(channels.map((c) => [c.channelId, c]));

  return { videos, channels: channelMap };
}

/**
 * ISO 8601 duration ("PT1M30S") → 초 단위.
 */
export function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + sec;
}

/**
 * Subscriber count → tier (BP tier system과 호환).
 * mega: 1M+, macro: 100K-1M, mid: 50K-100K, micro: 10K-50K, nano: 1K-10K, sub-nano: <1K
 */
export function subscribersToTier(subs: number | null): string {
  if (subs == null) return "unknown";
  if (subs >= 1_000_000) return "mega";
  if (subs >= 100_000) return "macro";
  if (subs >= 50_000) return "mid";
  if (subs >= 10_000) return "micro";
  if (subs >= 1_000) return "nano";
  return "sub-nano";
}
