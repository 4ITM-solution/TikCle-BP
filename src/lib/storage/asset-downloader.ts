import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type SupaClient = SupabaseClient<Database>;

const BUCKET = "case-assets";

/** 내용 주소 지정(content-addressed) 업로드 경로. by-hash/{md5}.{ext} */
const HASH_PREFIX = "by-hash";

export type StoredAsset = {
  url: string;
  /** 파일 내용 md5 (hex 32자) — media_assets.hash */
  hash: string;
  /** true면 이미 같은 바이트가 있어서 업로드를 생략했다 (dedupe 히트) */
  reused: boolean;
};

/** 확장자 정규화 — 경로에 그대로 들어가므로 영숫자만 허용. */
function normalizeExt(ext: string): string {
  const e = ext.replace(/^\./, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return e || "bin";
}

/**
 * 외부 URL의 자산을 fetch → (같은 내용이 없으면) Supabase Storage 업로드 → URL + md5 반환.
 *
 * 실패 시 null 반환 (호출자가 원본 URL 폴백 처리).
 *
 * ⚠️ 저장 경로는 내용 md5로 정해진다 (`by-hash/{md5}.{ext}`). 호출자가 경로를 정하지
 *    않는 이유 — 메타는 같은 영상을 광고 건마다 다른 ad_archive_id로 노출해서,
 *    광고 ID 기준 경로를 쓰면 동일 바이트가 광고 수만큼 물리 복제된다
 *    (실측: 최근 30일 유입 18.77GB 중 6.13GB(33%)가 중복. Anua 25.1MB 영상 1개 = 13사본).
 *    media_assets(029)에 md5가 이미 있으면 다운로드한 버퍼를 버리고 기존 경로를 돌려준다.
 */
export async function downloadAndStore(
  supabase: SupaClient,
  sourceUrl: string,
  ext: string,
  contentType: string,
  opts?: { headers?: Record<string, string>; referrerPolicy?: ReferrerPolicy },
): Promise<StoredAsset | null> {
  const MAX_BYTES = 80 * 1024 * 1024; // 80MB cap — 큰 영상 arrayBuffer OOM 방지
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000); // 60s fetch 타임아웃
  try {
    const res = await fetch(sourceUrl, {
      referrerPolicy: opts?.referrerPolicy ?? "no-referrer",
      headers: opts?.headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[downloadAndStore] fetch ${res.status} for ${sourceUrl.slice(0, 80)}`);
      return null;
    }
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) {
      console.warn(`[downloadAndStore] skip large file ${(len / 1e6).toFixed(0)}MB ${sourceUrl.slice(0, 60)}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

    const bytes = new Uint8Array(buf);
    const hash = createHash("md5").update(bytes).digest("hex");

    // 1) 이미 같은 내용이 올라가 있나 — 있으면 업로드 생략.
    const { data: known, error: lookupErr } = await supabase
      .from("media_assets")
      .select("storage_path")
      .eq("hash", hash)
      .maybeSingle();
    if (lookupErr) {
      // 레지스트리 조회 실패는 치명적이지 않다 → 그냥 업로드로 진행 (upsert라 안전).
      console.warn(`[downloadAndStore] media_assets lookup: ${lookupErr.message}`);
    }
    if (known?.storage_path) {
      const { data } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(known.storage_path);
      if (data?.publicUrl) return { url: data.publicUrl, hash, reused: true };
    }

    // 2) 신규 내용 → by-hash 경로로 업로드.
    const storagePath = `${HASH_PREFIX}/${hash}.${normalizeExt(ext)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (error) {
      console.warn(`[downloadAndStore] upload error: ${error.message}`);
      return null;
    }

    // 3) 레지스트리 등록. 동시 워커가 같은 해시를 올렸을 수 있으므로 중복은 무시
    //    (같은 내용 → 같은 경로라 어느 쪽이 이겨도 결과가 같다).
    const { error: regErr } = await supabase
      .from("media_assets")
      .upsert(
        {
          hash,
          storage_path: storagePath,
          mime: contentType,
          bytes: bytes.byteLength,
        },
        { onConflict: "hash", ignoreDuplicates: true },
      );
    if (regErr) {
      // 등록 실패해도 파일은 올라갔다 → URL은 유효. 다음 실행에서 재시도된다.
      console.warn(`[downloadAndStore] media_assets insert: ${regErr.message}`);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl ? { url: data.publicUrl, hash, reused: false } : null;
  } catch (e) {
    console.warn(
      `[downloadAndStore] exception: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
