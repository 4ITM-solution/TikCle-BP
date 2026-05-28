/**
 * YouTube 액터 공통 모듈 — instagram-shared.ts 패턴 재사용.
 * 같은 actor (streamers~youtube-scraper)를 input 다르게 호출 (search vs channel).
 */

const POLL_INTERVAL_SEC = 5;
const MAX_POLL_MINUTES = 20;

export type YtVideoRaw = {
  yt_id: string | null;
  url: string | null;
  type: string | null;                  // "video" / "short" / "stream"
  channel_name: string | null;
  channel_id: string | null;
  channel_url: string | null;
  subscriber_count: number | null;
  title: string | null;
  description: string | null;
  hashtags: string[];
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  uploaded_at: string | null;
  thumbnail_url: string | null;
  monetization_status: string | null;
  is_short: boolean | null;
  raw: Record<string, unknown>;
};

export type YtRunResult = {
  items: unknown[];
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

export async function runYtActor(
  actorId: string,
  input: unknown,
  token: string,
): Promise<YtRunResult> {
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => "");
    throw new Error(
      `Apify ${actorId} start ${startRes.status}: ${text.slice(0, 300)}`,
    );
  }
  const startJson = (await startRes.json()) as {
    data?: { id?: string; defaultDatasetId?: string };
  };
  const runId = startJson.data?.id;
  const datasetId = startJson.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new Error(`Apify ${actorId}: run start response missing id`);
  }

  const runUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const deadline = Date.now() + MAX_POLL_MINUTES * 60 * 1000;
  let status = "RUNNING";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_SEC * 1000));
    const r = await fetch(runUrl);
    if (!r.ok) continue;
    const j = (await r.json()) as { data?: { status?: string } };
    status = j.data?.status ?? "UNKNOWN";
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      break;
    }
  }

  const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`;
  let items: unknown[] = [];
  try {
    const dsRes = await fetch(dsUrl);
    if (dsRes.ok) {
      items = (await dsRes.json()) as unknown[];
    }
  } catch {
    /* dataset fetch fail 무시 */
  }

  return {
    items,
    apify_run_id: runId,
    dataset_id: datasetId,
    status,
    skipped_reason:
      status === "SUCCEEDED" ? undefined : `actor 완료 안 됨: ${status}`,
  };
}

/**
 * streamers/youtube-scraper raw item → YtVideoRaw.
 *
 * 실제 출력 필드 (검증 필요시 raw 보존):
 *   - id, url, title, descriptionText, viewCount, likes, commentsCount, duration
 *   - channelName, channelUrl, channelId, numberOfSubscribers
 *   - date, dateText, type ("video"/"short"/"stream")
 *   - thumbnail
 *   - hashtags
 *   - monetizationStatus (있을 때)
 */
export function mapYtRawToVideo(raw: unknown): YtVideoRaw {
  if (!raw || typeof raw !== "object") {
    return emptyYtVideo();
  }
  const r = raw as Record<string, unknown>;

  const hashtags = Array.isArray(r.hashtags)
    ? (r.hashtags as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const type =
    typeof r.type === "string"
      ? r.type
      : (r.fromYTUrl as string | undefined)?.includes("/shorts/")
        ? "short"
        : null;
  const isShort = type === "short" || (typeof r.duration === "string" && parseInt(r.duration, 10) <= 60);

  // duration이 string ("PT3M21S" 또는 "3:21") 또는 number(초)
  let durationSeconds: number | null = null;
  if (typeof r.duration === "number") {
    durationSeconds = r.duration;
  } else if (typeof r.duration === "string") {
    const parsed = parseDuration(r.duration);
    if (parsed != null) durationSeconds = parsed;
  }

  return {
    yt_id: (r.id as string | undefined) ?? null,
    url: (r.url as string | undefined) ?? null,
    type,
    channel_name: (r.channelName as string | undefined) ?? null,
    channel_id: (r.channelId as string | undefined) ?? null,
    channel_url: (r.channelUrl as string | undefined) ?? null,
    subscriber_count:
      typeof r.numberOfSubscribers === "number"
        ? r.numberOfSubscribers
        : null,
    title: (r.title as string | undefined) ?? null,
    description:
      (r.descriptionText as string | undefined) ??
      (r.description as string | undefined) ??
      null,
    hashtags,
    view_count: typeof r.viewCount === "number" ? r.viewCount : null,
    like_count: typeof r.likes === "number" ? r.likes : null,
    comment_count:
      typeof r.commentsCount === "number" ? r.commentsCount : null,
    duration_seconds: durationSeconds,
    uploaded_at: typeof r.date === "string" ? r.date : null,
    thumbnail_url: (r.thumbnailUrl as string | undefined) ?? (r.thumbnail as string | undefined) ?? null,
    monetization_status:
      (r.monetizationStatus as string | undefined) ?? null,
    is_short: isShort,
    raw: r,
  };
}

function emptyYtVideo(): YtVideoRaw {
  return {
    yt_id: null,
    url: null,
    type: null,
    channel_name: null,
    channel_id: null,
    channel_url: null,
    subscriber_count: null,
    title: null,
    description: null,
    hashtags: [],
    view_count: null,
    like_count: null,
    comment_count: null,
    duration_seconds: null,
    uploaded_at: null,
    thumbnail_url: null,
    monetization_status: null,
    is_short: null,
    raw: {},
  };
}

function parseDuration(s: string): number | null {
  // "PT3M21S" 또는 "3:21" 또는 "1:23:45"
  if (s.startsWith("PT")) {
    const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return null;
    return (
      parseInt(m[1] ?? "0", 10) * 3600 +
      parseInt(m[2] ?? "0", 10) * 60 +
      parseInt(m[3] ?? "0", 10)
    );
  }
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3)
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return null;
}
