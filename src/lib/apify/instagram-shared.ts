/**
 * IG 액터 공통 모듈 — async run + poll 패턴 + raw item → IgPostRaw 매핑.
 *
 * 다 Apify의 비동기 run + dataset poll 패턴 (clockworks와 동일).
 * sync API는 5분 한도라 async가 안전.
 */

const POLL_INTERVAL_SEC = 5;
const MAX_POLL_MINUTES = 20;

export type IgPostRaw = {
  ig_id: string | null;
  short_code: string | null;
  url: string | null;
  owner_username: string | null;
  owner_full_name: string | null;
  owner_id: string | null;
  type: string | null;             // "Image" / "Video" / "Sidecar"
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  likes_count: number | null;
  comments_count: number | null;
  video_play_count: number | null;
  video_view_count: number | null;
  video_duration: number | null;
  posted_at: string | null;        // ISO timestamp
  display_url: string | null;
  video_url: string | null;
  // reel-scraper 전용 (post-scraper엔 없음)
  sponsorship_status: string | null;
  raw: Record<string, unknown>;
};

export type ApifyRunResult = {
  items: unknown[];
  apify_run_id: string | null;
  dataset_id: string | null;
  status: string;
  skipped_reason?: string;
};

/**
 * Apify async run: start → poll → fetch dataset.
 */
export async function runApifyActor(
  actorId: string,
  input: unknown,
  token: string,
): Promise<ApifyRunResult> {
  // 1) Start
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

  // 2) Poll
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
      // 부분 결과라도 회수 시도
      break;
    }
  }

  // 3) Fetch dataset
  const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`;
  let items: unknown[] = [];
  try {
    const dsRes = await fetch(dsUrl);
    if (dsRes.ok) {
      items = (await dsRes.json()) as unknown[];
    }
  } catch {
    // dataset fetch 실패 무시 (status로 판단)
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
 * Raw IG actor item → 정규화된 IgPostRaw.
 * 액터마다 필드명 약간 다르지만 (caption/text, owner/ownerUsername 등) 공통 필드만 매핑.
 */
export function mapIgRawToPost(raw: unknown): IgPostRaw {
  if (!raw || typeof raw !== "object") {
    return emptyIgPost();
  }
  const r = raw as Record<string, unknown>;

  const hashtags = Array.isArray(r.hashtags)
    ? (r.hashtags as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const mentions = Array.isArray(r.mentions)
    ? (r.mentions as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return {
    ig_id: typeof r.id === "string" ? r.id : null,
    short_code: typeof r.shortCode === "string" ? r.shortCode : null,
    url: typeof r.url === "string" ? r.url : null,
    owner_username:
      typeof r.ownerUsername === "string" ? r.ownerUsername : null,
    owner_full_name:
      typeof r.ownerFullName === "string" ? r.ownerFullName : null,
    owner_id: typeof r.ownerId === "string" ? r.ownerId : null,
    type: typeof r.type === "string" ? r.type : null,
    caption:
      typeof r.caption === "string"
        ? r.caption
        : typeof r.text === "string"
          ? r.text
          : null,
    hashtags,
    mentions,
    likes_count: typeof r.likesCount === "number" ? r.likesCount : null,
    comments_count:
      typeof r.commentsCount === "number" ? r.commentsCount : null,
    video_play_count:
      typeof r.videoPlayCount === "number" ? r.videoPlayCount : null,
    video_view_count:
      typeof r.videoViewCount === "number" ? r.videoViewCount : null,
    video_duration:
      typeof r.videoDuration === "number" ? r.videoDuration : null,
    posted_at: typeof r.timestamp === "string" ? r.timestamp : null,
    display_url: typeof r.displayUrl === "string" ? r.displayUrl : null,
    video_url: typeof r.videoUrl === "string" ? r.videoUrl : null,
    sponsorship_status:
      typeof r.sponsorshipStatus === "string" ? r.sponsorshipStatus : null,
    raw: r,
  };
}

function emptyIgPost(): IgPostRaw {
  return {
    ig_id: null,
    short_code: null,
    url: null,
    owner_username: null,
    owner_full_name: null,
    owner_id: null,
    type: null,
    caption: null,
    hashtags: [],
    mentions: [],
    likes_count: null,
    comments_count: null,
    video_play_count: null,
    video_view_count: null,
    video_duration: null,
    posted_at: null,
    display_url: null,
    video_url: null,
    sponsorship_status: null,
    raw: {},
  };
}
