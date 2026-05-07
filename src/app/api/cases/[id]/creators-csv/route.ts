/**
 * 케이스별 협업 인플루언서 CSV 다운로드.
 *
 * 컬럼:
 *   - brand
 *   - handle (TikTok user_id / @핸들)
 *   - follower_count (팔로워 수)
 *   - video_count (이 케이스 brand+country scope의 영상 수)
 *   - top_views (그 인플의 max views)
 *   - is_shop_creator
 *   - shop_creator_class (A/B/C/D/E)
 *   - lifetime_gmv_usd (lemur backfill 데이터)
 *
 * URL: /cases/{id}/influencers.csv
 */

import { createServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;

  const supabase = await createServer();

  // 1. case 정보
  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, country, brand:brands(name)")
    .eq("id", caseId)
    .single();
  if (cErr || !c) {
    return new NextResponse(`case not found: ${cErr?.message}`, {
      status: 404,
    });
  }
  const brandName =
    (c.brand as unknown as { name?: string } | null)?.name ?? "(no brand)";

  // 2. 케이스 scope의 모든 contents — influencer 별 aggregation
  // 1만개 이상 흔하니 chunked fetch.
  const aggMap = new Map<
    string,
    { videos: number; max_views: number; promoted: number }
  >();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("influencer_id, views, is_ad")
      .eq("brand_id", c.brand_id)
      .eq("country", c.country)
      .not("influencer_id", "is", null)
      .range(from, from + 999);
    if (error) {
      return new NextResponse(`contents fetch: ${error.message}`, {
        status: 500,
      });
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.influencer_id) continue;
      const cur = aggMap.get(r.influencer_id) ?? {
        videos: 0,
        max_views: 0,
        promoted: 0,
      };
      cur.videos += 1;
      const v = r.views ?? 0;
      if (v > cur.max_views) cur.max_views = v;
      if (r.is_ad === true) cur.promoted += 1;
      aggMap.set(r.influencer_id, cur);
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  // 3. influencer 메타 fetch
  const ids = Array.from(aggMap.keys());
  const inflMap = new Map<
    string,
    {
      handle: string | null;
      follower_count: number | null;
      is_tiktok_shop_creator: boolean | null;
      shop_creator_class: string | null;
      lifetime_gmv_usd: number | null;
    }
  >();
  // chunk 200 — UUID×36chars×1000 = 37KB로 .in() URL 길이 한계 초과해서 Bad Request
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("influencers")
      .select(
        "id, handle, follower_count, is_tiktok_shop_creator, shop_creator_class, lifetime_gmv_usd",
      )
      .in("id", slice);
    if (error) {
      return new NextResponse(`influencers fetch: ${error.message}`, {
        status: 500,
      });
    }
    for (const r of data ?? []) {
      inflMap.set(r.id, {
        handle: r.handle,
        follower_count: r.follower_count,
        is_tiktok_shop_creator: r.is_tiktok_shop_creator,
        shop_creator_class: r.shop_creator_class,
        lifetime_gmv_usd: r.lifetime_gmv_usd,
      });
    }
  }

  // 4. CSV 생성
  const rows = ids.map((id) => {
    const a = aggMap.get(id)!;
    const inf = inflMap.get(id);
    return {
      brand: brandName,
      handle: inf?.handle ?? "(unknown)",
      follower_count: inf?.follower_count ?? "",
      is_shop_creator:
        inf?.is_tiktok_shop_creator === true
          ? "Y"
          : inf?.is_tiktok_shop_creator === false
            ? "N"
            : "?",
      shop_creator_class: inf?.shop_creator_class ?? "",
      lifetime_gmv_usd: inf?.lifetime_gmv_usd ?? "",
      video_count: a.videos,
      promoted_count: a.promoted,
      top_views: a.max_views,
    };
  });

  // 협업 영상 수 desc → top views desc tiebreak
  rows.sort((a, b) => {
    if (b.video_count !== a.video_count) return b.video_count - a.video_count;
    return b.top_views - a.top_views;
  });

  const headers = [
    "brand",
    "handle",
    "follower_count",
    "is_shop_creator",
    "shop_creator_class",
    "lifetime_gmv_usd",
    "video_count",
    "promoted_count",
    "top_views",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => escape((r as Record<string, unknown>)[h])).join(","),
    ),
  ];
  // BOM 추가 — Excel에서 한글/UTF-8 깨짐 방지
  const csv = "﻿" + lines.join("\n");

  const safeBrand = brandName.replace(/[^\w\-가-힣]+/g, "_").slice(0, 30);
  const filename = `${safeBrand}_${c.country}_creators_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
