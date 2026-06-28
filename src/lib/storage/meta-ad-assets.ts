import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadAndStore } from "./asset-downloader";

const BUCKET = "case-assets";

/**
 * 메타 광고의 video/thumbnail을 FB CDN(만료됨)에서 Supabase Storage로 재호스트.
 *
 * - FB CDN video_url은 며칠이면 403 만료 → 컷분석/재생 불가. 영구 보관 필수.
 * - storage path는 ad_archive_id 기준 결정적(deterministic) → 이미 있으면 download 스킵
 *   (delete→insert 재실행, cron 재시도, 모니터링 반복 적재 시 멱등 + 비용 절감).
 * - 실패(만료된 옛 광고 등) 시 원본 URL 유지 → 호출자 무손실.
 *
 * 원본 객체를 in-place로 변경(video_url/thumbnail_url 교체) 후 같은 배열 반환.
 */
export type RehostableAd = {
  ad_archive_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
};

async function listExisting(
  supabase: SupabaseClient,
  prefix: string,
): Promise<Set<string>> {
  const names = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const f of data) names.add(f.name);
    if (data.length < 1000) break;
    offset += data.length;
  }
  return names;
}

export async function rehostMetaAdAssets<T extends RehostableAd>(
  supabase: SupabaseClient,
  ads: T[],
  prefix: string,
  opts?: { concurrency?: number },
): Promise<{ stored_videos: number; stored_thumbs: number }> {
  const existing = await listExisting(supabase, prefix);
  const pub = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  let stored_videos = 0;
  let stored_thumbs = 0;
  const concurrency = opts?.concurrency ?? 6;

  const work = ads.filter((a) => a.ad_archive_id);
  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const ad = work[idx++];
      if (!ad) break;
      const id = ad.ad_archive_id as string;
      // video
      if (ad.video_url && !ad.video_url.includes("/storage/v1/object/")) {
        const name = `${id}.mp4`;
        const path = `${prefix}/${name}`;
        if (existing.has(name)) {
          ad.video_url = pub(path);
          stored_videos++;
        } else {
          const url = await downloadAndStore(
            supabase,
            ad.video_url,
            path,
            "video/mp4",
          );
          if (url) {
            ad.video_url = url;
            stored_videos++;
          }
        }
      }
      // thumbnail
      if (
        ad.thumbnail_url &&
        !ad.thumbnail_url.includes("/storage/v1/object/")
      ) {
        const name = `${id}.jpg`;
        const path = `${prefix}/${name}`;
        if (existing.has(name)) {
          ad.thumbnail_url = pub(path);
          stored_thumbs++;
        } else {
          const url = await downloadAndStore(
            supabase,
            ad.thumbnail_url,
            path,
            "image/jpeg",
          );
          if (url) {
            ad.thumbnail_url = url;
            stored_thumbs++;
          }
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, work.length) }, worker),
  );

  return { stored_videos, stored_thumbs };
}
