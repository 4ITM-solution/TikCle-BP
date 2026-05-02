import { createClient } from "@supabase/supabase-js";

/**
 * 외부 인플루언서 DB (`dynqedcbmanvyfdlruni.influencer_db_tt`)에서 fans + Shop 여부 룩업.
 * 핸들은 exolyt가 저장한 그대로 (대소문자 보존).
 */

function client() {
  const url = process.env.INFLUENCER_DB_URL;
  const key = process.env.INFLUENCER_DB_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "INFLUENCER_DB_URL / INFLUENCER_DB_ANON_KEY 환경변수가 비어있습니다",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const CHUNK = 200;

export type InfluencerLookupResult = {
  follower_count: number | null;
  is_tiktok_shop_creator: boolean | null;
};

/**
 * 주어진 핸들 리스트에서 외부 DB에 존재하는 row의 fans + tiktokshop 여부 반환.
 * 못 찾은 핸들은 Map에 없음.
 */
export async function lookupInfluencerFans(
  handles: string[],
): Promise<Map<string, InfluencerLookupResult>> {
  if (handles.length === 0) return new Map();
  const supabase = client();
  const result = new Map<string, InfluencerLookupResult>();

  for (let i = 0; i < handles.length; i += CHUNK) {
    const chunk = handles.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("influencer_db_tt")
      .select("inf_username, inf_follower, inf_tiktokshop")
      .in("inf_username", chunk);
    if (error) {
      throw new Error(
        `influencer DB lookup chunk ${i}: ${error.message || JSON.stringify(error)}`,
      );
    }
    for (const row of (data ?? []) as Array<{
      inf_username: string;
      inf_follower: number | null;
      inf_tiktokshop: boolean | null;
    }>) {
      result.set(row.inf_username, {
        follower_count: row.inf_follower,
        is_tiktok_shop_creator: row.inf_tiktokshop,
      });
    }
  }
  return result;
}
