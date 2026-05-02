import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type SupaClient = SupabaseClient<Database>;

const BUCKET = "case-assets";

/**
 * 외부 URL의 자산을 fetch → Supabase Storage 업로드 → public URL 반환.
 *
 * 실패 시 null 반환 (호출자가 원본 URL 폴백 처리).
 * 같은 path가 이미 있으면 upsert.
 */
export async function downloadAndStore(
  supabase: SupaClient,
  sourceUrl: string,
  storagePath: string,
  contentType: string,
  opts?: { headers?: Record<string, string>; referrerPolicy?: ReferrerPolicy },
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      referrerPolicy: opts?.referrerPolicy ?? "no-referrer",
      headers: opts?.headers,
    });
    if (!res.ok) {
      console.warn(`[downloadAndStore] fetch ${res.status} for ${sourceUrl.slice(0, 80)}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, new Uint8Array(buf), {
        contentType,
        upsert: true,
      });
    if (error) {
      console.warn(`[downloadAndStore] upload error: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data.publicUrl ?? null;
  } catch (e) {
    console.warn(
      `[downloadAndStore] exception: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}
