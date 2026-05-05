/**
 * 옛 phase37 호출에서 박힌 Shop creator (is_tiktok_shop_creator=true)의
 * GMV / GPM / post_rate / brand_collabs / top_brands / gmv_range 를 lemur로 backfill.
 *
 * 옛 코드는 lemur 응답에서 4개 필드(handle/is_shop_creator/shop_creator_class/user_id)만 박고
 * GMV 등 stats 다 버림. 새 코드(commit 0995b1b)부턴 다 받지만 옛 인플은 GMV NULL.
 *
 * 사용:
 *   npm run backfill:gmv -- <case_id> --class-a   # Class A (Shop+promoted≥5) 만 — 추천
 *   npm run backfill:gmv -- <case_id> --class-ab  # Class A+B (Shop+promoted≥2)
 *   npm run backfill:gmv -- <case_id>             # 그 case scope의 모든 Shop creator
 *   npm run backfill:gmv                          # 전체 Shop creator (전 brand 통틀어)
 *   npm run backfill:gmv -- <case_id> --class-a --dry-run   # 비용 추정만
 *
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN (.env.local 또는 export)
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import { checkShopCreators } from "../src/lib/apify/lemur-shop-creators";

const BATCH_SIZE = 50; // lemur 한 호출당 핸들 수
const FETCH_CHUNK = 200; // supabase fetch chunk

async function main() {
  const args = process.argv.slice(2);
  const caseIdArg = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  // Class 필터 — promoted 영상 수 minimum
  const minPromoted = args.includes("--class-a")
    ? 5
    : args.includes("--class-ab")
      ? 2
      : 0;
  if (minPromoted > 0 && !caseIdArg) {
    throw new Error(
      "--class-a/--class-ab 옵션은 case_id 필수 (promoted 영상 수가 brand+country scope 기준)",
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local에 박혀있나 확인)",
    );
  }
  if (!process.env.APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN 필요");
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  // 1. 대상 인플 fetch
  // case scope 한정이면 그 brand+country contents의 인플만, 아니면 전체.
  let candidateIds: string[] = [];
  if (caseIdArg) {
    console.log(`[scope] case_id=${caseIdArg}`);
    const { data: c } = await supabase
      .from("cases")
      .select("brand_id, country")
      .eq("id", caseIdArg)
      .single();
    if (!c) throw new Error(`case ${caseIdArg} 없음`);

    // contents fetch + (옵션) is_ad 같이 받아 promoted_count 계산
    const promotedMap = new Map<string, number>();
    const allMap = new Set<string>();
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("contents")
        .select("influencer_id, is_ad")
        .eq("brand_id", c.brand_id)
        .eq("country", c.country)
        .not("influencer_id", "is", null)
        .range(from, from + FETCH_CHUNK - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        if (!r.influencer_id) continue;
        allMap.add(r.influencer_id);
        if (r.is_ad === true) {
          promotedMap.set(
            r.influencer_id,
            (promotedMap.get(r.influencer_id) ?? 0) + 1,
          );
        }
      }
      if (data.length < FETCH_CHUNK) break;
      from += FETCH_CHUNK;
    }

    if (minPromoted > 0) {
      candidateIds = Array.from(allMap).filter(
        (id) => (promotedMap.get(id) ?? 0) >= minPromoted,
      );
      console.log(
        `[scope] case scope unique 인플 ${allMap.size}명 → promoted≥${minPromoted} ${candidateIds.length}명`,
      );
    } else {
      candidateIds = Array.from(allMap);
      console.log(`[scope] case scope에 unique 인플 ${candidateIds.length}명`);
    }
  }

  // is_tiktok_shop_creator=true + lifetime_gmv_usd IS NULL 인 인플만 backfill 대상
  const targetIds: Array<{ id: string; handle: string }> = [];
  if (candidateIds.length > 0) {
    for (let i = 0; i < candidateIds.length; i += FETCH_CHUNK) {
      const slice = candidateIds.slice(i, i + FETCH_CHUNK);
      const { data } = await supabase
        .from("influencers")
        .select("id, handle, lifetime_gmv_usd")
        .in("id", slice)
        .eq("is_tiktok_shop_creator", true)
        .is("lifetime_gmv_usd", null);
      for (const r of data ?? []) {
        if (r.handle) targetIds.push({ id: r.id, handle: r.handle });
      }
    }
  } else {
    // 전체 — chunked pagination
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("influencers")
        .select("id, handle, lifetime_gmv_usd")
        .eq("is_tiktok_shop_creator", true)
        .is("lifetime_gmv_usd", null)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.handle) targetIds.push({ id: r.id, handle: r.handle });
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  console.log(`[target] backfill 대상 ${targetIds.length}명`);
  console.log(
    `[cost] 예상 비용 ${(targetIds.length * 0.005).toFixed(2)} USD`,
  );

  if (targetIds.length === 0) {
    console.log("[done] backfill 대상 0명 — 종료");
    return;
  }

  if (dryRun) {
    console.log("[dry-run] 실제 호출/update 안 함. 종료.");
    return;
  }

  // 2. lemur 호출 + update (batch 단위)
  let total_updated = 0;
  let total_failed_lookup = 0;
  let total_update_errors = 0;
  for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
    const slice = targetIds.slice(i, i + BATCH_SIZE);
    const handles = slice.map((c) => c.handle);
    console.log(
      `[batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targetIds.length / BATCH_SIZE)}] ${handles.length}명 lemur 호출...`,
    );

    const result = await checkShopCreators({ handles });
    if (result.skipped_reason) {
      console.error(`  skipped: ${result.skipped_reason}`);
      continue;
    }

    const handleToId = new Map(
      slice.map((c) => [c.handle.toLowerCase().replace(/^@/, "").trim(), c.id]),
    );

    for (const item of result.items) {
      const inflId = handleToId.get(item.handle);
      if (!inflId) {
        total_failed_lookup += 1;
        continue;
      }
      const { error } = await supabase
        .from("influencers")
        .update({
          lifetime_gmv_usd: item.lifetime_gmv_usd,
          gpm_usd: item.gpm_usd,
          post_rate: item.post_rate,
          total_brand_collabs: item.total_brand_collabs,
          top_brands: item.top_brands as never,
          shop_creator_gmv_range: item.gmv_range,
          shop_creator_class: item.shop_creator_class,
          ...(item.follower_count != null
            ? { follower_count: item.follower_count }
            : {}),
        })
        .eq("id", inflId);
      if (error) {
        total_update_errors += 1;
        console.error(`  update fail ${inflId.slice(0, 8)}: ${error.message}`);
      } else {
        total_updated += 1;
      }
    }
  }

  console.log("\n[done]");
  console.log(`  updated: ${total_updated}`);
  console.log(`  lookup miss: ${total_failed_lookup}`);
  console.log(`  update error: ${total_update_errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
