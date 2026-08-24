import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadAndStore } from "./asset-downloader";

const BUCKET = "case-assets";

/** case-assets public URL에서 object name을 뽑기 위한 마커. */
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/**
 * 메타 광고의 video/thumbnail을 FB CDN(만료됨)에서 Supabase Storage로 재호스트.
 *
 * - FB CDN video_url은 며칠이면 403 만료 → 컷분석/재생 불가. 영구 보관 필수.
 * - 신규 업로드 경로는 downloadAndStore가 **내용 md5**로 정한다 (`by-hash/{md5}.{ext}`).
 *   메타는 같은 영상을 광고 건마다 다른 ad_archive_id로 노출해서, 광고 ID 기준 경로를
 *   쓰면 동일 바이트가 광고 수만큼 물리 복제된다 (30일 유입의 33%가 중복이었다).
 * - 옛 경로(`{prefix}/{ad_archive_id}.{ext}`)에 이미 저장된 파일은 그대로 재사용한다.
 *   → 같은 광고 재크롤 시 재다운로드 없음(멱등), 기존 파일 삭제/이동 없음.
 * - 실패(만료된 옛 광고 등) 시 원본 URL 유지 → 호출자 무손실.
 *
 * 원본 객체를 in-place로 변경(video_url/thumbnail_url 교체, ad_creative_hash 기입) 후
 * 같은 배열 반환.
 */
export type RehostableAd = {
  ad_archive_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  /**
   * 이 광고가 쓴 소재의 md5 (영상 우선, 없으면 썸네일). rehost가 채워서 호출자에게 넘긴다.
   * 광고 N건 ↔ 소재 1개 집계 키 (meta_ads / tracked_brand_ads.ad_creative_hash).
   */
  ad_creative_hash?: string | null;
};

/**
 * `prefix` 아래 이미 저장된 파일 이름 목록.
 *
 * ⚠️ 이 목록은 **기존(레거시) 파일 조회 전용**이다. 신규 업로드는 더 이상 prefix를 쓰지 않고
 *    `by-hash/{md5}.{ext}`로 간다. prefix 인자는 옛 경로에 이미 있는 파일을 다시 받지 않기
 *    위해서만 남아 있다.
 */
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

/** 이미 case-assets에 올라간 URL이면 object name, 아니면 null. */
function objectPath(url: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARKER);
  if (i < 0) return null;
  const raw = url.slice(i + PUBLIC_MARKER.length).split("?")[0] ?? "";
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * storage 경로 → md5 역방향 조회. 다운로드 없이 media_assets(029)에서만 읽는다.
 * 백필에서 빠진 객체(멀티파트 업로드 = eTag가 내용 md5가 아님)는 여기서 안 잡히고
 * 해당 광고의 ad_creative_hash는 NULL로 남는다 — 다음에 그 바이트가 실제로 다시
 * 들어올 때 by-hash 경로로 한 번 등록되면서 채워진다.
 */
async function hashesByPath(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(paths)];
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const { data, error } = await supabase
      .from("media_assets")
      .select("hash, storage_path")
      .in("storage_path", chunk);
    if (error) {
      console.warn(`[rehost] media_assets path lookup: ${error.message}`);
      break;
    }
    for (const r of (data ?? []) as Array<{
      hash: string;
      storage_path: string;
    }>) {
      out.set(r.storage_path, r.hash);
    }
  }
  return out;
}

/** 직전 실행에서 이 광고에 대해 DB에 저장해둔 값 (ad_archive_id → 값). */
export type PreviousAdAssets = Map<
  string,
  {
    video_url: string | null;
    thumbnail_url: string | null;
    ad_creative_hash: string | null;
  }
>;

/**
 * 직전 실행이 DB에 남긴 저장 URL/해시를 읽어온다.
 *
 * ⚠️ PostgREST 기본 응답 상한이 1000행이라 range로 페이지네이션한다 —
 *    잘리면 그만큼 재다운로드가 발생한다 (Meditherapy 1,994행 = 2페이지).
 * 조회 실패 시 빈 맵 폴백: 재호스트가 죽지 않고 최대한 다시 받을 뿐이다.
 */
export async function fetchPreviousAdAssets(
  supabase: SupabaseClient,
  table: "meta_ads" | "tracked_brand_ads",
  filterColumn: string,
  filterValue: string,
): Promise<PreviousAdAssets> {
  const out: PreviousAdAssets = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("ad_archive_id, video_url, thumbnail_url, ad_creative_hash")
      .eq(filterColumn, filterValue)
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[rehost] ${table} previous lookup: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as Array<{
      ad_archive_id: string | null;
      video_url: string | null;
      thumbnail_url: string | null;
      ad_creative_hash: string | null;
    }>;
    for (const r of rows) {
      if (!r.ad_archive_id) continue;
      out.set(r.ad_archive_id, {
        video_url: r.video_url,
        thumbnail_url: r.thumbnail_url,
        ad_creative_hash: r.ad_creative_hash,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function rehostMetaAdAssets<T extends RehostableAd>(
  supabase: SupabaseClient,
  ads: T[],
  prefix: string,
  opts?: { concurrency?: number; previous?: PreviousAdAssets },
): Promise<{
  stored_videos: number;
  stored_thumbs: number;
  /** 다운로드는 했지만 같은 md5가 이미 있어 업로드를 생략한 건수 */
  deduped: number;
}> {
  const existing = await listExisting(supabase, prefix);
  const pub = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const previous = opts?.previous;
  const work: RehostableAd[] = ads.filter((a) => a.ad_archive_id);

  /**
   * 다운로드 없이 이미 확보된 저장본이 있으면 그 경로. 없으면 null(=받아야 함).
   *
   * 우선순위:
   *   1. 직전 실행이 DB에 남긴 case-assets URL — by-hash 경로도 여기서 잡힌다.
   *      (⚠️ 이게 없으면 신규 업로드가 prefix 밖으로 나가므로 아래 2번이 영영 못 맞춘다
   *       → 매 실행마다 FB CDN에서 전부 다시 받게 된다)
   *   2. 스크랩 결과가 이미 case-assets URL인 경우
   *   3. 옛 prefix 경로에 파일이 남아 있는 경우 (레거시)
   */
  function storedPath(
    ad: RehostableAd,
    kind: "mp4" | "jpg",
  ): string | null {
    const id = ad.ad_archive_id as string;
    const prev = previous?.get(id);
    const prevUrl = kind === "mp4" ? prev?.video_url : prev?.thumbnail_url;
    const fromPrev = objectPath(prevUrl ?? null);
    if (fromPrev) return fromPrev;
    const cur = kind === "mp4" ? ad.video_url : ad.thumbnail_url;
    const fromCur = objectPath(cur);
    if (fromCur) return fromCur;
    if (cur && existing.has(`${id}.${kind}`)) return `${prefix}/${id}.${kind}`;
    return null;
  }

  // 위에서 나온 경로들의 해시를 한 번에 조회 (다운로드 없음).
  const lookupPaths: string[] = [];
  for (const ad of work) {
    for (const kind of ["mp4", "jpg"] as const) {
      const p = storedPath(ad, kind);
      if (p) lookupPaths.push(p);
    }
  }
  const pathHash = await hashesByPath(supabase, lookupPaths);

  let stored_videos = 0;
  let stored_thumbs = 0;
  let deduped = 0;
  const concurrency = opts?.concurrency ?? 6;

  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const ad = work[idx++];
      if (!ad) break;
      const id = ad.ad_archive_id as string;
      const hashes: Record<"mp4" | "jpg", string | null> = {
        mp4: null,
        jpg: null,
      };

      for (const kind of ["mp4", "jpg"] as const) {
        const sourceUrl = kind === "mp4" ? ad.video_url : ad.thumbnail_url;
        if (!sourceUrl) continue;

        // 이미 저장본이 있으면 다운로드 자체를 안 한다 (재실행 멱등 + FB CDN 트래픽 0).
        const known = storedPath(ad, kind);
        if (known) {
          const url = pub(known);
          if (kind === "mp4") {
            ad.video_url = url;
            stored_videos++;
          } else {
            ad.thumbnail_url = url;
            stored_thumbs++;
          }
          hashes[kind] = pathHash.get(known) ?? null;
          continue;
        }

        const stored = await downloadAndStore(
          supabase,
          sourceUrl,
          kind,
          kind === "mp4" ? "video/mp4" : "image/jpeg",
        );
        if (!stored) continue; // 실패 → 원본 URL 유지 (호출자 무손실)
        if (kind === "mp4") {
          ad.video_url = stored.url;
          stored_videos++;
        } else {
          ad.thumbnail_url = stored.url;
          stored_thumbs++;
        }
        hashes[kind] = stored.hash;
        if (stored.reused) deduped++;
      }

      // 소재 기준 = 영상 우선, 영상 없는 이미지 광고는 썸네일.
      // 못 구한 경우 기존 값을 null로 덮어쓰지 않는다 (upsert가 기존 해시를 지우면 안 됨).
      const next =
        hashes.mp4 ?? hashes.jpg ?? previous?.get(id)?.ad_creative_hash ?? null;
      if (next) ad.ad_creative_hash = next;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, work.length) }, worker),
  );

  return { stored_videos, stored_thumbs, deduped };
}
