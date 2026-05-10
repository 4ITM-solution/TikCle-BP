/**
 * Apify clockworks/tiktok-scraper 호출 래퍼.
 * 단가: $1.70/1,000 results (base, 다운로드 옵션 X)
 *
 * 입력: postURLs[]
 * 출력: 각 영상마다 authorMeta(fans, user_id, ...) + videoMeta.subtitleLinks[]
 *
 * Phase 4b.2 (ASR 수집) 및 Phase 3.5 (fans 폴백) 양쪽에서 사용.
 */

const ACTOR_ID = "clockworks~tiktok-scraper";
// Apify sync API의 maxClientWaitMillis는 보통 300s (5분) — 그 이상은 408 timeout.
// 안전 cap = 280s (Apify 측에서 endpoint별 한도 다양). batch size 줄여서 단일 호출 짧게 유지.
const SYNC_TIMEOUT_SEC = 280;
const COST_PER_RESULT = 0.0017;

export type ClockworksItem = {
  url: string;
  user_id: string | null; // authorMeta.id (TikTok 진짜 user_id)
  username: string | null; // authorMeta.name
  fans: number | null; // authorMeta.fans (팔로워 수)
  views: number | null; // playCount
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collect_count: number | null;
  is_ad: boolean | null; // isAd
  asr_subtitle_url: string | null; // English ASR (subtitleLinks[0].downloadLink)
  cover_url: string | null; // videoMeta.coverUrl (Vision 태깅 입력)
  video_download_url: string | null; // videoMeta.downloadAddr / mediaUrls[0] (만료성, Storage 다운로드용)
};

export type ClockworksResult = {
  items: ClockworksItem[];
  cost_estimate_usd: number;
  skipped_reason?: string;
};

/**
 * 영상 URL 리스트를 clockworks로 호출. ASR 메타까지 가져옴 (실제 텍스트는 별도 fetch).
 */
export async function fetchTikTokVideos(opts: {
  postURLs: string[];
}): Promise<ClockworksResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      items: [],
      cost_estimate_usd: 0,
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }
  if (opts.postURLs.length === 0) {
    return { items: [], cost_estimate_usd: 0, skipped_reason: "URL 0개" };
  }

  // Async run + poll 패턴 — sync API 5분 한도 + actor TIMED-OUT 회피
  const body = {
    postURLs: opts.postURLs,
    resultsPerPage: 1,
    scrapeRelatedVideos: false,
    shouldDownloadAvatars: false,
    shouldDownloadCovers: false,
    shouldDownloadMusicCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadVideos: false,
  };

  const startUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${token}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => "");
    throw new Error(
      `Apify clockworks start ${startRes.status}: ${text.slice(0, 300)}`,
    );
  }
  const startJson = (await startRes.json()) as {
    data?: { id?: string; defaultDatasetId?: string };
  };
  const runId = startJson.data?.id;
  const datasetId = startJson.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new Error("Apify clockworks: run start response missing id");
  }

  // Poll status
  const runUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
  const maxWaitMs = SYNC_TIMEOUT_SEC * 1000; // 280s default — 단일 batch 안전선
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(runUrl);
    if (!r.ok) continue;
    const j = (await r.json()) as { data?: { status?: string } };
    const status = j.data?.status;
    if (status === "SUCCEEDED") break;
    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(`Apify clockworks: actor run ${status}`);
    }
  }

  // Fetch dataset
  const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`;
  const dsRes = await fetch(dsUrl);
  if (!dsRes.ok) {
    const text = await dsRes.text().catch(() => "");
    throw new Error(
      `Apify clockworks dataset ${dsRes.status}: ${text.slice(0, 300)}`,
    );
  }
  const raw = (await dsRes.json()) as unknown[];

  // 디버그: 첫 항목의 키 구조 로그 (cover_url 추출 검증용)
  if (raw[0] && typeof raw[0] === "object") {
    const first = raw[0] as Record<string, unknown>;
    const topKeys = Object.keys(first).slice(0, 30);
    const videoMeta = first.videoMeta as Record<string, unknown> | undefined;
    const videoKeys = videoMeta ? Object.keys(videoMeta).slice(0, 30) : [];
    console.log("[clockworks] first item top-level keys:", topKeys);
    console.log("[clockworks] first item videoMeta keys:", videoKeys);
    console.log(
      "[clockworks] first item coverUrl sample:",
      videoMeta?.coverUrl ?? "(missing)",
    );
    console.log(
      "[clockworks] first item downloadAddr sample:",
      (videoMeta?.downloadAddr as string | undefined)?.slice(0, 80) ??
        (videoMeta?.playAddr as string | undefined)?.slice(0, 80) ??
        (Array.isArray(first.mediaUrls)
          ? String(first.mediaUrls[0]).slice(0, 80)
          : "(missing)"),
    );
  }

  const items = raw.map(mapItem).filter((x): x is ClockworksItem => x !== null);

  return {
    items,
    cost_estimate_usd: items.length * COST_PER_RESULT,
  };
}

function mapItem(raw: unknown): ClockworksItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const author = r.authorMeta as Record<string, unknown> | undefined;
  const video = r.videoMeta as Record<string, unknown> | undefined;

  // subtitleLinks[]에서 영문 ASR 우선, 없으면 첫 항목
  let asr_subtitle_url: string | null = null;
  const subs = video?.subtitleLinks as
    | Array<Record<string, unknown>>
    | undefined;
  if (subs && subs.length > 0) {
    const eng = subs.find((s) => {
      const lang = s.language as string | undefined;
      return typeof lang === "string" && lang.toLowerCase().startsWith("eng");
    });
    const pick = eng ?? subs[0];
    if (pick) {
      asr_subtitle_url =
        (pick.downloadLink as string | undefined) ??
        (pick.tiktokLink as string | undefined) ??
        null;
    }
  }

  return {
    url:
      (r.webVideoUrl as string | undefined) ??
      (r.submittedVideoUrl as string | undefined) ??
      "",
    user_id:
      typeof author?.id === "string"
        ? author.id
        : typeof author?.id === "number"
          ? String(author.id)
          : null,
    username: (author?.name as string | undefined) ?? null,
    fans: typeof author?.fans === "number" ? author.fans : null,
    views: typeof r.playCount === "number" ? r.playCount : null,
    likes: typeof r.diggCount === "number" ? r.diggCount : null,
    comments: typeof r.commentCount === "number" ? r.commentCount : null,
    shares: typeof r.shareCount === "number" ? r.shareCount : null,
    collect_count:
      typeof r.collectCount === "number" ? r.collectCount : null,
    is_ad: typeof r.isAd === "boolean" ? r.isAd : null,
    asr_subtitle_url,
    cover_url:
      (video?.coverUrl as string | undefined) ??
      (video?.originalCoverUrl as string | undefined) ??
      null,
    video_download_url: extractVideoDownloadUrl(r, video),
  };
}

function extractVideoDownloadUrl(
  r: Record<string, unknown>,
  video: Record<string, unknown> | undefined,
): string | null {
  // 우선순위: videoMeta.downloadAddr > videoMeta.playAddr > mediaUrls[0]
  const fromMeta =
    (video?.downloadAddr as string | undefined) ??
    (video?.playAddr as string | undefined);
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;

  const media = r.mediaUrls;
  if (Array.isArray(media)) {
    const first = media.find((m) => typeof m === "string" && m);
    if (typeof first === "string") return first;
  }
  return null;
}

/**
 * 자막 파일 (.vtt 또는 .srt) URL을 fetch → 평문 텍스트로 변환.
 * 타임스탬프 / 인덱스 / 헤더 제거.
 */
export async function fetchAndParseSubtitle(
  subtitleUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(subtitleUrl, { referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw.trim()) return null;

    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l !== "" &&
          !/^WEBVTT/i.test(l) &&
          !/^\d+$/.test(l) && // SRT index lines
          !/-->/.test(l) && // timestamp lines
          !/^NOTE\b/i.test(l) &&
          !/^STYLE\b/i.test(l),
      );

    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    return text || null;
  } catch {
    return null;
  }
}
