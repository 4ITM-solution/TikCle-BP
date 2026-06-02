/**
 * 케이스별 협업 인플루언서 CSV 다운로드 (TikTok + Instagram + YouTube 통합).
 *
 * 컬럼:
 *   - channel: TikTok / Instagram / YouTube
 *   - brand
 *   - handle (TikTok user_id / IG username / YT channel name)
 *   - followers (TK follower_count / IG followers / YT subscriber_count)
 *   - videos (이 케이스 brand+country scope 영상 수)
 *   - promoted (paid_signal / is_ad / is_paid_promotion)
 *   - top_views (max views; IG는 max_likes proxy)
 *   - is_shop_creator (TK 만 — IG/YT는 빈 값)
 *   - shop_class (A/B/C/D/E, TK 만)
 *   - lifetime_gmv_usd (TK lemur backfill, IG/YT는 빈 값)
 *   - bio (IG profile scraper 박힌 거 / TK·YT는 빈 값)
 *   - linked_handles (cross-channel JSON; IG bio 안 TK/YT 핸들)
 *
 * URL: /api/cases/{id}/creators-csv
 */

import { createServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Row = {
  channel: "TikTok" | "Instagram" | "YouTube";
  brand: string;
  handle: string;
  followers: number | string;
  videos: number;
  promoted: number;
  top_views: number;
  is_shop_creator: "Y" | "N" | "?" | "";
  shop_class: string;
  lifetime_gmv_usd: number | string;
  bio: string;
  linked_handles: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;

  const supabase = await createServer();

  const { data: c, error: cErr } = await supabase
    .from("cases")
    .select("brand_id, country, brand:brands(name)")
    .eq("id", caseId)
    .single();
  if (cErr || !c) {
    return new NextResponse(`case not found: ${cErr?.message}`, { status: 404 });
  }
  const brandName =
    (c.brand as unknown as { name?: string } | null)?.name ?? "(no brand)";

  const rows: Row[] = [];

  // ─── 1. TikTok ───────────────────────────────────────────────────
  // contents → influencer_id 별 aggregate → influencers 메타 join
  const tkAgg = new Map<string, { videos: number; max_views: number; promoted: number }>();
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
      return new NextResponse(`contents fetch: ${error.message}`, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.influencer_id) continue;
      const cur = tkAgg.get(r.influencer_id) ?? { videos: 0, max_views: 0, promoted: 0 };
      cur.videos += 1;
      const v = r.views ?? 0;
      if (v > cur.max_views) cur.max_views = v;
      if (r.is_ad === true) cur.promoted += 1;
      tkAgg.set(r.influencer_id, cur);
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  const tkIds = Array.from(tkAgg.keys());
  const tkMeta = new Map<
    string,
    {
      handle: string | null;
      follower_count: number | null;
      is_tiktok_shop_creator: boolean | null;
      shop_creator_class: string | null;
      lifetime_gmv_usd: number | null;
    }
  >();
  for (let i = 0; i < tkIds.length; i += 50) {
    const slice = tkIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("influencers")
      .select(
        "id, handle, follower_count, is_tiktok_shop_creator, shop_creator_class, lifetime_gmv_usd",
      )
      .in("id", slice);
    if (error) {
      return new NextResponse(
        `influencers fetch (chunk ${i / 50 + 1}): ${error.message}`,
        { status: 500 },
      );
    }
    for (const r of data ?? []) {
      tkMeta.set(r.id, {
        handle: r.handle,
        follower_count: r.follower_count,
        is_tiktok_shop_creator: r.is_tiktok_shop_creator,
        shop_creator_class: r.shop_creator_class,
        lifetime_gmv_usd: r.lifetime_gmv_usd,
      });
    }
  }
  for (const id of tkIds) {
    const a = tkAgg.get(id)!;
    const m = tkMeta.get(id);
    rows.push({
      channel: "TikTok",
      brand: brandName,
      handle: m?.handle ?? "(unknown)",
      followers: m?.follower_count ?? "",
      videos: a.videos,
      promoted: a.promoted,
      top_views: a.max_views,
      is_shop_creator:
        m?.is_tiktok_shop_creator === true
          ? "Y"
          : m?.is_tiktok_shop_creator === false
            ? "N"
            : "?",
      shop_class: m?.shop_creator_class ?? "",
      lifetime_gmv_usd: m?.lifetime_gmv_usd ?? "",
      bio: "",
      linked_handles: "",
    });
  }

  // ─── 2. Instagram (case scope: case_id) ─────────────────────────
  // ig_authors 자체에 case_id + 모든 KPI 박혀있음 (total_posts / paid_posts / max_likes / followers / bio / linked_handles)
  // bio / followers / linked_handles 박힌 migration 012 박힘 (이미 적용) — Supabase generated types 박힌 안 박혔어서 cast.
  type IgAuthorRow = {
    username: string | null;
    followers: number | null;
    total_posts: number | null;
    paid_posts: number | null;
    max_likes: number | null;
    bio: string | null;
    linked_handles: Record<string, string> | null;
  };
  let igFrom = 0;
  while (true) {
    const { data, error } = await (supabase
      .from("ig_authors")
      .select(
        "username, followers, total_posts, paid_posts, max_likes, bio, linked_handles",
      ) as unknown as { eq: (k: string, v: string) => { range: (a: number, b: number) => Promise<{ data: IgAuthorRow[] | null; error: { message: string } | null }> } })
      .eq("case_id", caseId)
      .range(igFrom, igFrom + 999);
    if (error) {
      return new NextResponse(`ig_authors fetch: ${error.message}`, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const a of data) {
      rows.push({
        channel: "Instagram",
        brand: brandName,
        handle: a.username ?? "(unknown)",
        followers: a.followers ?? "",
        videos: a.total_posts ?? 0,
        promoted: a.paid_posts ?? 0,
        top_views: a.max_likes ?? 0, // IG = likes proxy
        is_shop_creator: "",
        shop_class: "",
        lifetime_gmv_usd: "",
        bio: a.bio ?? "",
        linked_handles: a.linked_handles ? JSON.stringify(a.linked_handles) : "",
      });
    }
    if (data.length < 1000) break;
    igFrom += 1000;
  }

  // ─── 3. YouTube (case scope: case_id) ───────────────────────────
  let ytFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from("yt_channels")
      .select(
        "channel_name, subscriber_count, total_videos, paid_videos, max_views",
      )
      .eq("case_id", caseId)
      .range(ytFrom, ytFrom + 999);
    if (error) {
      return new NextResponse(`yt_channels fetch: ${error.message}`, { status: 500 });
    }
    if (!data || data.length === 0) break;
    for (const ch of data) {
      rows.push({
        channel: "YouTube",
        brand: brandName,
        handle: ch.channel_name ?? "(unknown)",
        followers: ch.subscriber_count ?? "",
        videos: ch.total_videos ?? 0,
        promoted: ch.paid_videos ?? 0,
        top_views: ch.max_views ?? 0,
        is_shop_creator: "",
        shop_class: "",
        lifetime_gmv_usd: "",
        bio: "",
        linked_handles: "",
      });
    }
    if (data.length < 1000) break;
    ytFrom += 1000;
  }

  // ─── 4. 정렬 — channel 그룹 박힌 채로 videos desc → top_views desc ───
  const channelOrder: Record<Row["channel"], number> = {
    TikTok: 0,
    Instagram: 1,
    YouTube: 2,
  };
  rows.sort((a, b) => {
    if (a.channel !== b.channel) return channelOrder[a.channel] - channelOrder[b.channel];
    if (b.videos !== a.videos) return b.videos - a.videos;
    return b.top_views - a.top_views;
  });

  // ─── 5. CSV 생성 ─────────────────────────────────────────────────
  const headers = [
    "channel",
    "brand",
    "handle",
    "followers",
    "videos",
    "promoted",
    "top_views",
    "is_shop_creator",
    "shop_class",
    "lifetime_gmv_usd",
    "bio",
    "linked_handles",
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
  // BOM 박힘 — Excel 박힘 박힘 한글 박힘 박힘 박힘 박힘
  const csv = "﻿" + lines.join("\n");

  const safeBrand = brandName.replace(/[^\w\-가-힣]+/g, "_").slice(0, 30);
  const filename = `${safeBrand}_${c.country}_creators_all_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
