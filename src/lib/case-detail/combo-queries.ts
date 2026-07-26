import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BE-31 — 조합 데이터 계층 (combo-queries). 프로토 v12 교차 뷰들이 요구하는 조인을 서버 모듈로.
 * 전부 기존 테이블 재조합 — 유료 호출 0, 집계 결과 저장 없음(라이브 계산). period-filter.ts 준수.
 *
 * 멤버 정규화·kdMap GMV는 page.tsx clusterBundle 로직을 추출·재사용(신규 로직 아님) + 반응률 위해
 * engagement 필드(likes/comments/shares) 확장. 반응률 NULL 규칙(BE-23): 세 값 동시 NULL(Kalodata
 * 유입) 및 IG -1은 분모·분자 제외.
 */

export type Period = { start: string | null; end: string | null };
export type Channel = "tk" | "ig" | "yt";
export type TierKey =
  | "mega" | "macro" | "mid" | "micro" | "nano" | "sub-nano" | "unknown";

type SupaClient = SupabaseClient;

// 표준 영상 카드 6지표 (조회·좋아요·댓글·저장·저장율·댓글율).
export type VideoCard = {
  url: string;
  views: number;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  save_rate_pct: number | null;
  comment_rate_pct: number | null; // 댓글/1만뷰
  caption: string | null;
  channel: Channel;
};

export type ClusterLevel = "l1" | "meta";

export type NarrativeMember = {
  l1Id: string; // L1 자식 클러스터 (is_meta=false) — 기준값 산출 단위
  l1Name: string;
  metaId: string; // 롤업 메타 (is_meta=true)
  metaName: string;
  channel: Channel;
  url: string;
  views: number;
  caption: string | null;
  is_ad: boolean;
  month: string | null; // YYYY-MM
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collect_count: number | null;
  measurable: boolean; // 반응률 대상 (BE-23 NULL 규칙)
  gmv: number | null;
  gmvMonth: string | null;
  influencerId: string | null;
  tier: TierKey;
};

// BE-23 NULL 규칙: -1(IG 미제공 sentinel)·null 정규화 후, 세 값 모두 없으면 미측정(Kalodata 유입).
function normEng(v: number | null | undefined): number | null {
  return v == null || v === -1 ? null : v;
}
function isMeasurable(
  likes: number | null,
  comments: number | null,
  shares: number | null,
): boolean {
  return [likes, comments, shares].some((v) => v != null);
}

function tierOf(n: number | null | undefined): TierKey {
  if (n == null) return "unknown";
  if (n >= 1_000_000) return "mega";
  if (n >= 500_000) return "macro";
  if (n >= 100_000) return "mid";
  if (n >= 10_000) return "micro";
  if (n >= 1_000) return "nano";
  return "sub-nano";
}

function chunk<T>(arr: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type ClusterInfo = {
  metas: Array<{ id: string; name: string }>; // is_meta=true (롤업)
  l1: Array<{ id: string; name: string; metaId: string | null }>; // is_meta=false (기준 단위)
  childToMeta: Map<string, string>;
  l1NameById: Map<string, string>;
  metaNameById: Map<string, string>;
};

/**
 * 클러스터 로딩 — **content_clusters DB가 authoritative**(기준값 대사가 이 테이블 SQL 기준, ORCH).
 * L1(is_meta=false) 19개가 기준 산출 단위, 메타(is_meta=true)는 롤업. key_stats는 DB 비면 폴백(메타만).
 */
async function loadClusters(supabase: SupaClient, caseId: string): Promise<ClusterInfo> {
  const empty: ClusterInfo = {
    metas: [],
    l1: [],
    childToMeta: new Map(),
    l1NameById: new Map(),
    metaNameById: new Map(),
  };
  const { data: ccRows } = await supabase
    .from("content_clusters")
    .select("id, name, is_meta, parent_cluster_id, display_order")
    .eq("case_id", caseId);
  if (ccRows && ccRows.length > 0) {
    const metaRows = ccRows
      .filter((r) => r.is_meta)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const l1Rows = ccRows
      .filter((r) => !r.is_meta)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const info: ClusterInfo = {
      metas: metaRows.map((m) => ({ id: m.id, name: m.name ?? "" })),
      l1: l1Rows.map((r) => ({ id: r.id, name: r.name ?? "", metaId: r.parent_cluster_id ?? null })),
      childToMeta: new Map(),
      l1NameById: new Map(),
      metaNameById: new Map(metaRows.map((m) => [m.id, m.name ?? ""])),
    };
    for (const r of l1Rows) {
      info.l1NameById.set(r.id, r.name ?? "");
      if (r.parent_cluster_id) info.childToMeta.set(r.id, r.parent_cluster_id);
    }
    return info;
  }
  // 폴백: key_stats.phase4b_clusters (DB 비었을 때만) — 메타 + child_clusters 이름.
  const { data: cRow } = await supabase.from("cases").select("key_stats").eq("id", caseId).single();
  const fromKs = (
    cRow?.key_stats as
      | { phase4b_clusters?: { meta_clusters?: Array<{ id: string; name: string; child_clusters?: Array<{ id: string; name?: string }> }> } }
      | null
  )?.phase4b_clusters?.meta_clusters;
  if (!fromKs || fromKs.length === 0) return empty;
  const info = { ...empty, childToMeta: new Map(), l1NameById: new Map(), metaNameById: new Map() } as ClusterInfo;
  info.metas = fromKs.map((m) => ({ id: m.id, name: m.name ?? "" }));
  for (const m of fromKs) {
    info.metaNameById.set(m.id, m.name ?? "");
    for (const cc of m.child_clusters ?? []) {
      info.l1.push({ id: cc.id, name: cc.name ?? "", metaId: m.id });
      info.l1NameById.set(cc.id, cc.name ?? "");
      info.childToMeta.set(cc.id, m.id);
    }
  }
  return info;
}

export type NarrativeLoad = {
  metas: Array<{ id: string; name: string }>;
  l1: Array<{ id: string; name: string; metaId: string | null }>;
  members: NarrativeMember[];
};

/**
 * 내러티브(메타 클러스터)별 통합 멤버 로딩 — TK(contents)/IG(ig_posts)/YT(yt_videos) + engagement +
 * kdMap GMV(TK). page.tsx clusterBundle 재사용·확장. period 미적용(호출부에서 month로 필터).
 */
export async function loadNarrativeMembers(
  supabase: SupaClient,
  caseId: string,
): Promise<NarrativeLoad> {
  const { metas, l1, childToMeta, l1NameById, metaNameById } = await loadClusters(supabase, caseId);
  if (l1.length === 0 && metas.length === 0) return { metas: [], l1: [], members: [] };
  // 멤버는 L1(자식) 클러스터에 매달림. childIds = L1 클러스터 id.
  const childIds = l1.map((c) => c.id);
  if (childIds.length === 0) {
    return { metas, l1, members: [] };
  }

  // 멤버 (platform + content_id + external_ref). ⚠️ 한 클러스터에 멤버가 많아 .in()이 PostgREST
  //   1000행 캡에 걸리므로 각 chunk를 range로 페이지네이션(안 하면 멤버 유실 → 집계 축소).
  const allMembers: Array<{ cluster_id: string; platform: string; content_id: string | null; external_ref: string | null }> = [];
  for (const slice of chunk(childIds)) {
    for (let off = 0; off < 200000; off += 1000) {
      const { data } = await supabase
        .from("content_cluster_members")
        .select("cluster_id, platform, content_id, external_ref")
        .in("cluster_id", slice)
        .range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const row of data) allMembers.push(row);
      if (data.length < 1000) break;
    }
  }

  const tkMembers = allMembers.filter((r) => r.platform === "tiktok" && r.content_id);
  const igMembers = allMembers.filter((r) => r.platform === "instagram" && r.external_ref);
  const ytMembers = allMembers.filter((r) => r.platform === "youtube" && r.external_ref);
  const tkIds = [...new Set(tkMembers.map((m) => m.content_id!))];
  const igRefs = [...new Set(igMembers.map((m) => m.external_ref!))];
  const ytRefs = [...new Set(ytMembers.map((m) => m.external_ref!))];

  const [tkRows, igRows, ytRows] = await Promise.all([
    tkIds.length === 0
      ? Promise.resolve([] as Array<Record<string, unknown>>)
      : Promise.all(
          chunk(tkIds).map((slice) =>
            supabase
              .from("contents")
              .select("id, url, views, caption, is_ad, collect_count, influencer_id, uploaded_at, likes, comments, shares")
              .in("id", slice),
          ),
        ).then((res) => res.flatMap((r) => r.data ?? [])),
    igRefs.length === 0
      ? Promise.resolve([] as Array<Record<string, unknown>>)
      : Promise.all(
          chunk(igRefs).map((slice) =>
            supabase
              .from("ig_posts")
              .select("ig_id, url, caption, video_view_count, video_play_count, likes_count, comments_count, posted_at, paid_signal")
              .eq("case_id", caseId)
              .in("ig_id", slice),
          ),
        ).then((res) => res.flatMap((r) => r.data ?? [])),
    ytRefs.length === 0
      ? Promise.resolve([] as Array<Record<string, unknown>>)
      : Promise.all(
          chunk(ytRefs).map((slice) =>
            supabase
              .from("yt_videos")
              .select("yt_id, url, title, description, view_count, like_count, comment_count, uploaded_at, paid_signal, subscriber_count")
              .eq("case_id", caseId)
              .in("yt_id", slice),
          ),
        ).then((res) => res.flatMap((r) => r.data ?? [])),
  ]);

  // TK tier (influencers)
  const inflIds = [...new Set(tkRows.map((r) => r.influencer_id as string | null).filter((x): x is string => !!x))];
  const tierByInfl = new Map<string, TierKey>();
  if (inflIds.length > 0) {
    const inflResults = await Promise.all(
      chunk(inflIds).map((slice) => supabase.from("influencers").select("id, follower_count").in("id", slice)),
    );
    for (const r of inflResults) for (const row of r.data ?? []) tierByInfl.set(row.id, tierOf(row.follower_count));
  }

  // Kalodata GMV map (TK only) — kdMap 로직 재사용 (page.tsx clusterBundle ④)
  const kdMap = await loadKdMap(supabase, caseId);

  const tkSrc = new Map(tkRows.map((r) => [r.id as string, r]));
  const igSrc = new Map(igRows.map((r) => [r.ig_id as string, r]));
  const ytSrc = new Map(ytRows.map((r) => [r.yt_id as string, r]));
  const members: NarrativeMember[] = [];

  for (const m of tkMembers) {
    const l1Id = m.cluster_id;
    const s = tkSrc.get(m.content_id!);
    if (!s) continue;
    const metaId = childToMeta.get(l1Id) ?? "";
    const url = (s.url as string) ?? "";
    const likes = normEng(s.likes as number | null);
    const comments = normEng(s.comments as number | null);
    const shares = normEng(s.shares as number | null);
    const kd = kdMap.get(url) ?? null;
    members.push({
      l1Id,
      l1Name: l1NameById.get(l1Id) ?? l1Id,
      metaId,
      metaName: metaId ? metaNameById.get(metaId) ?? metaId : "(no meta)",
      channel: "tk",
      url,
      views: (s.views as number) ?? 0,
      caption: (s.caption as string | null) ?? null,
      is_ad: !!s.is_ad,
      month: s.uploaded_at ? String(s.uploaded_at).slice(0, 7) : null,
      likes,
      comments,
      shares,
      collect_count: (s.collect_count as number | null) ?? null,
      measurable: isMeasurable(likes, comments, shares),
      gmv: kd?.gmv ?? null,
      gmvMonth: kd?.month ?? null,
      influencerId: (s.influencer_id as string | null) ?? null,
      tier: s.influencer_id ? tierByInfl.get(s.influencer_id as string) ?? "unknown" : "unknown",
    });
  }
  for (const m of igMembers) {
    const l1Id = m.cluster_id;
    const s = igSrc.get(m.external_ref!);
    if (!s) continue;
    const metaId = childToMeta.get(l1Id) ?? "";
    const likes = normEng(s.likes_count as number | null);
    const comments = normEng(s.comments_count as number | null);
    members.push({
      l1Id,
      l1Name: l1NameById.get(l1Id) ?? l1Id,
      metaId,
      metaName: metaId ? metaNameById.get(metaId) ?? metaId : "(no meta)",
      channel: "ig",
      url: (s.url as string) ?? "",
      views: ((s.video_view_count as number) ?? (s.video_play_count as number) ?? (s.likes_count as number) ?? 0),
      caption: (s.caption as string | null) ?? null,
      is_ad: !!s.paid_signal,
      month: s.posted_at ? String(s.posted_at).slice(0, 7) : null,
      likes,
      comments,
      shares: null,
      collect_count: null,
      measurable: isMeasurable(likes, comments, null),
      gmv: null,
      gmvMonth: null,
      influencerId: null,
      tier: "unknown",
    });
  }
  for (const m of ytMembers) {
    const l1Id = m.cluster_id;
    const s = ytSrc.get(m.external_ref!);
    if (!s) continue;
    const metaId = childToMeta.get(l1Id) ?? "";
    const likes = normEng(s.like_count as number | null);
    const comments = normEng(s.comment_count as number | null);
    members.push({
      l1Id,
      l1Name: l1NameById.get(l1Id) ?? l1Id,
      metaId,
      metaName: metaId ? metaNameById.get(metaId) ?? metaId : "(no meta)",
      channel: "yt",
      url: (s.url as string) ?? "",
      views: (s.view_count as number) ?? 0,
      caption: `${(s.title as string) ?? ""}\n${((s.description as string) ?? "").slice(0, 200)}`.trim() || null,
      is_ad: !!s.paid_signal,
      month: s.uploaded_at ? String(s.uploaded_at).slice(0, 7) : null,
      likes,
      comments,
      shares: null,
      collect_count: null,
      measurable: isMeasurable(likes, comments, null),
      gmv: null,
      gmvMonth: null,
      influencerId: null,
      tier: tierOf(s.subscriber_count as number | null),
    });
  }

  return { metas, l1, members };
}

/** clusterLevel에 따라 멤버의 narrative id/name 선택 (l1=기준 단위, meta=롤업). */
function narrativeKey(m: NarrativeMember, level: ClusterLevel): { id: string; name: string } {
  return level === "meta"
    ? { id: m.metaId, name: m.metaName }
    : { id: m.l1Id, name: m.l1Name };
}

// kdMap 재사용 (page.tsx clusterBundle ④) — kalodata_videos_xlsx: video_url → {month, gmv}.
async function loadKdMap(
  supabase: SupaClient,
  caseId: string,
): Promise<Map<string, { month: string; gmv: number }>> {
  const map = new Map<string, { month: string; gmv: number }>();
  const { data } = await supabase.from("cases").select("key_stats").eq("id", caseId).single();
  const kdVids =
    ((data?.key_stats as { kalodata_videos_xlsx?: Array<{ video_url: string | null; publish_date: string | null; revenue_usd: number | null }> } | null)?.kalodata_videos_xlsx) ?? [];
  for (const v of kdVids) {
    if (!v.video_url || !v.publish_date || (v.revenue_usd ?? 0) <= 0) continue;
    map.set(v.video_url, { month: v.publish_date.slice(0, 7), gmv: v.revenue_usd ?? 0 });
  }
  return map;
}

function inPeriod(month: string | null, period?: Period): boolean {
  if (!period || (!period.start && !period.end)) return true;
  if (!month) return false;
  const ps = period.start ? period.start.slice(0, 7) : null;
  const pe = period.end ? period.end.slice(0, 7) : null;
  return (!ps || month >= ps) && (!pe || month <= pe);
}

// ── 1. narrativePerf ────────────────────────────────────────────────────────
export type NarrativePerfRow = {
  cluster_id: string;
  cluster_name: string;
  level: ClusterLevel;
  video_count: number;
  measurable_count: number;
  reaction_rate: number | null; // 댓글/1만뷰 (measurable만)
  shop_gmv: number;
  gpm: number | null; // GMV per 1000 views (gmv 보유 영상 기준)
  channel_counts: { tk: number; ig: number; yt: number };
};

/**
 * 내러티브별 성과. clusterLevel 기본 'l1'(기준값 산출 단위 = L1 자식 클러스터 19개).
 * 'meta'는 롤업(메타 8개). ORCH 정정(2026-07-26): 지시서 "메타 클러스터"는 표기 오류, 기준값은 L1층.
 */
export async function narrativePerf(
  supabase: SupaClient,
  caseId: string,
  opts?: { period?: Period; clusterLevel?: ClusterLevel },
): Promise<NarrativePerfRow[]> {
  const level = opts?.clusterLevel ?? "l1";
  const { members } = await loadNarrativeMembers(supabase, caseId);
  const scoped = members.filter((m) => inPeriod(m.month, opts?.period));
  const groups = new Map<string, { name: string; members: NarrativeMember[] }>();
  for (const m of scoped) {
    const k = narrativeKey(m, level);
    if (!k.id) continue;
    const g = groups.get(k.id) ?? { name: k.name, members: [] };
    g.members.push(m);
    groups.set(k.id, g);
  }
  const rows: NarrativePerfRow[] = [];
  for (const [id, g] of groups) {
    let measurable = 0;
    let gmvSum = 0;
    let gmvViews = 0;
    // 반응률 = TK 영상별 (댓글/뷰×1만)의 평균. (내러티브 탐색기 기준값 대사: 리스트 115.9·퍼스널
    //   17.5 정확 일치 — TK-only per-video mean. IG는 고뷰·저댓글이라 집계 희석되어 제외.)
    const tkRx: number[] = [];
    const ch = { tk: 0, ig: 0, yt: 0 };
    for (const m of g.members) {
      ch[m.channel] += 1;
      if (m.measurable) measurable += 1;
      if (m.channel === "tk" && m.measurable && m.views > 0 && m.comments != null) {
        tkRx.push((m.comments / m.views) * 10000);
      }
      if (m.gmv != null && m.gmv > 0) {
        gmvSum += m.gmv;
        gmvViews += m.views;
      }
    }
    rows.push({
      cluster_id: id,
      cluster_name: g.name,
      level,
      video_count: g.members.length,
      measurable_count: measurable,
      reaction_rate:
        tkRx.length > 0 ? Math.round((tkRx.reduce((s, x) => s + x, 0) / tkRx.length) * 10) / 10 : null,
      shop_gmv: Math.round(gmvSum),
      gpm: gmvViews > 0 ? Math.round((gmvSum / (gmvViews / 1000)) * 100) / 100 : null,
      channel_counts: ch,
    });
  }
  return rows.sort((a, b) => b.video_count - a.video_count);
}

// ── 5. sparkByNarrative (C 광고 집행 콘텐츠) ─────────────────────────────────
export type SparkRow = {
  cluster_id: string;
  cluster_name: string;
  level: ClusterLevel;
  total: number;
  ad_count: number; // is_ad
  ad_ratio_pct: number;
};

export async function sparkByNarrative(
  supabase: SupaClient,
  caseId: string,
  opts?: { period?: Period; clusterLevel?: ClusterLevel },
): Promise<SparkRow[]> {
  const level = opts?.clusterLevel ?? "l1";
  const { members } = await loadNarrativeMembers(supabase, caseId);
  const scoped = members.filter((m) => inPeriod(m.month, opts?.period));
  const groups = new Map<string, { name: string; total: number; ad: number }>();
  for (const m of scoped) {
    const k = narrativeKey(m, level);
    if (!k.id) continue;
    const cur = groups.get(k.id) ?? { name: k.name, total: 0, ad: 0 };
    cur.total += 1;
    if (m.is_ad) cur.ad += 1;
    groups.set(k.id, cur);
  }
  const rows: SparkRow[] = [];
  for (const [id, v] of groups) {
    if (v.total === 0) continue;
    rows.push({
      cluster_id: id,
      cluster_name: v.name,
      level,
      total: v.total,
      ad_count: v.ad,
      ad_ratio_pct: Math.round((v.ad / v.total) * 1000) / 10,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

// ── 4. inflectionTopVideos ──────────────────────────────────────────────────
function toCard(m: NarrativeMember): VideoCard {
  const saveRate =
    m.collect_count != null && m.views > 0 ? Math.round((m.collect_count / m.views) * 1000) / 10 : null;
  const commentRate =
    m.measurable && m.comments != null && m.views > 0
      ? Math.round((m.comments / m.views) * 10000 * 10) / 10
      : null;
  return {
    url: m.url,
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    saves: m.collect_count,
    save_rate_pct: saveRate,
    comment_rate_pct: commentRate,
    caption: m.caption,
    channel: m.channel,
  };
}

/** 변곡점 월(YYYY-MM) 게시 영상 Top3 — sortBy: views | comments | saves. 6지표 포함. */
export async function inflectionTopVideos(
  supabase: SupaClient,
  caseId: string,
  month: string,
  sortBy: "views" | "comments" | "saves" = "views",
): Promise<VideoCard[]> {
  const { members } = await loadNarrativeMembers(supabase, caseId);
  const mo = month.slice(0, 7);
  const inMonth = members.filter((m) => m.month === mo);
  const key = (m: NarrativeMember) =>
    sortBy === "comments"
      ? (m.comments ?? -1)
      : sortBy === "saves"
        ? (m.collect_count ?? -1)
        : m.views;
  // url 중복 제거(같은 영상이 여러 클러스터 멤버일 수 있음)
  const seen = new Set<string>();
  const uniq: NarrativeMember[] = [];
  for (const m of inMonth.sort((a, b) => key(b) - key(a))) {
    if (m.url && !seen.has(m.url)) {
      seen.add(m.url);
      uniq.push(m);
    }
  }
  return uniq.slice(0, 3).map(toCard);
}

// ── 2. creatorProfile (B 드로어) ────────────────────────────────────────────
export type CreatorProfile = {
  handle: string;
  video_count: number;
  max_views: number;
  reaction_rate: number | null; // 댓글/1만뷰 (measurable만)
  avg_views: number;
  percentile: number | null; // 풀 내 백분위 (평균뷰 percent_rank, 0~100)
  spark_ad_count: number; // is_ad 편수
  activity_period: { first: string | null; last: string | null };
  channels: Channel[];
  meta_match: {
    partnership_confirmed: number; // meta_ads.creator_page_name = handle (확정)
    original_candidates: number; // BE-30 후보분 (있으면, 없으면 0)
  };
};

/**
 * 크리에이터 드로어 — TK contents 중심(핸들=influencers.handle). 풀 내 평균뷰 백분위 포함.
 * 메타 매칭: 파트너십 라벨 확정(creator_page_name) + BE-30 후보(ad_original_candidates, 있으면).
 */
export async function creatorProfile(
  supabase: SupaClient,
  caseId: string,
  handle: string,
): Promise<CreatorProfile | null> {
  const { data: cRow } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", caseId)
    .single();
  const brand_id = (cRow?.brand_id as string) ?? null;
  const country = (cRow?.country as string) ?? null;
  if (!brand_id) return null;

  const { data: inf } = await supabase
    .from("influencers")
    .select("id, handle")
    .eq("handle", handle)
    .limit(1);
  const inflId = (inf?.[0]?.id as string) ?? null;

  // 풀 전체: influencer_id → {views 합, n} (brand+country). 백분위 산출용.
  const perInfl = new Map<string, { views: number; n: number }>();
  const mine: Array<{ views: number; comments: number | null; likes: number | null; shares: number | null; is_ad: boolean; month: string | null }> = [];
  let first: string | null = null;
  let last: string | null = null;
  for (let off = 0; off < 300000; off += 1000) {
    let q = supabase
      .from("contents")
      .select("influencer_id, views, likes, comments, shares, is_ad, uploaded_at")
      .eq("brand_id", brand_id)
      .not("influencer_id", "is", null);
    if (country) q = q.eq("country", country);
    const { data } = await q.range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const id = r.influencer_id as string;
      const views = (r.views as number) ?? 0;
      const agg = perInfl.get(id) ?? { views: 0, n: 0 };
      agg.views += views;
      agg.n += 1;
      perInfl.set(id, agg);
      if (inflId && id === inflId) {
        mine.push({
          views,
          comments: normEng(r.comments as number | null),
          likes: normEng(r.likes as number | null),
          shares: normEng(r.shares as number | null),
          is_ad: !!r.is_ad,
          month: r.uploaded_at ? String(r.uploaded_at).slice(0, 10) : null,
        });
        const d = r.uploaded_at ? String(r.uploaded_at).slice(0, 10) : null;
        if (d) {
          if (!first || d < first) first = d;
          if (!last || d > last) last = d;
        }
      }
    }
    if (data.length < 1000) break;
  }

  if (mine.length === 0) {
    // 핸들이 풀에 없음 — 공백 계약대로 최소 반환
    return {
      handle,
      video_count: 0,
      max_views: 0,
      reaction_rate: null,
      avg_views: 0,
      percentile: null,
      spark_ad_count: 0,
      activity_period: { first: null, last: null },
      channels: [],
      meta_match: { partnership_confirmed: 0, original_candidates: 0 },
    };
  }

  const myAvg = mine.reduce((s, m) => s + m.views, 0) / mine.length;
  const maxViews = Math.max(...mine.map((m) => m.views));
  let measViews = 0;
  let measComments = 0;
  for (const m of mine) {
    if (isMeasurable(m.likes, m.comments, m.shares)) {
      measViews += m.views;
      measComments += m.comments ?? 0;
    }
  }
  // percent_rank: 풀 내 평균뷰 기준 (내 avg 이하인 크리에이터 비율)
  const avgs = [...perInfl.values()].map((v) => (v.n > 0 ? v.views / v.n : 0));
  const below = avgs.filter((a) => a <= myAvg).length;
  const percentile = avgs.length > 1 ? Math.round(((below - 1) / (avgs.length - 1)) * 1000) / 10 : null;

  // 메타 매칭
  let partnership = 0;
  {
    const { count } = await supabase
      .from("meta_ads")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId)
      .eq("creator_page_name", handle);
    partnership = count ?? 0;
  }
  let originalCands = 0;
  {
    // BE-30 후보 (테이블 미적용/미실행이면 0 — 공백 계약)
    const r = await supabase
      .from("ad_original_candidates")
      .select("id", { count: "exact", head: true })
      .eq("case_id", caseId);
    if (!r.error) originalCands = r.count ?? 0;
  }

  return {
    handle,
    video_count: mine.length,
    max_views: maxViews,
    reaction_rate: measViews > 0 ? Math.round((measComments / measViews) * 10000 * 10) / 10 : null,
    avg_views: Math.round(myAvg),
    percentile,
    spark_ad_count: mine.filter((m) => m.is_ad).length,
    activity_period: { first, last },
    channels: ["tk"],
    meta_match: { partnership_confirmed: partnership, original_candidates: originalCands },
  };
}

// ── 3. eventWindow (E 이벤트 전/중/후) ──────────────────────────────────────
export type EventPhaseStats = {
  seeding_count: number;
  top_videos: VideoCard[];
  new_ads: number;
  active_ads: number;
  bsr_best: number | null; // 구간 최저(=최고 순위) BSR
};
export type EventWindowResult = {
  event: { id: string; name: string | null; start_date: string; end_date: string };
  before: EventPhaseStats;
  during: EventPhaseStats;
  after: EventPhaseStats;
};

function addDays(d: string, n: number): string {
  const x = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** promotion_events 1건 → 전(2주)/중/후 구간별 시딩·광고·BSR 요약. */
export async function eventWindow(
  supabase: SupaClient,
  caseId: string,
  eventId: string,
  leadDays = 14,
  trailDays = 14,
): Promise<EventWindowResult | null> {
  const evSb = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          eq: (col: string, v: string) => { single: () => Promise<{ data: { id: string; name: string | null; start_date: string | null; end_date: string | null } | null }> };
        };
      };
    };
  };
  const { data: ev } = await evSb
    .from("promotion_events")
    .select("id, name, start_date, end_date")
    .eq("id", eventId)
    .eq("case_id", caseId)
    .single();
  if (!ev || !ev.start_date || !ev.end_date) return null;
  const start = ev.start_date.slice(0, 10);
  const end = ev.end_date.slice(0, 10);

  const { data: cRow } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", caseId)
    .single();
  const brand_id = (cRow?.brand_id as string) ?? null;
  const country = (cRow?.country as string) ?? null;

  const windows: Array<{ key: "before" | "during" | "after"; from: string; to: string }> = [
    { key: "before", from: addDays(start, -leadDays), to: addDays(start, -1) },
    { key: "during", from: start, to: end },
    { key: "after", from: addDays(end, 1), to: addDays(end, trailDays) },
  ];

  const phase = async (from: string, to: string): Promise<EventPhaseStats> => {
    // 시딩(콘텐츠) — brand+country, uploaded_at 구간
    const vids: VideoCard[] = [];
    let seeding = 0;
    if (brand_id) {
      let q = supabase
        .from("contents")
        .select("url, views, likes, comments, shares, collect_count, uploaded_at")
        .eq("brand_id", brand_id)
        .gte("uploaded_at", from)
        .lte("uploaded_at", `${to}T23:59:59`);
      if (country) q = q.eq("country", country);
      const { data } = await q.limit(2000);
      for (const r of data ?? []) {
        seeding += 1;
        vids.push({
          url: (r.url as string) ?? "",
          views: (r.views as number) ?? 0,
          likes: normEng(r.likes as number | null),
          comments: normEng(r.comments as number | null),
          saves: (r.collect_count as number | null) ?? null,
          save_rate_pct:
            (r.collect_count as number | null) != null && (r.views as number) > 0
              ? Math.round((((r.collect_count as number) / (r.views as number)) * 1000)) / 10
              : null,
          comment_rate_pct: null,
          caption: null,
          channel: "tk",
        });
      }
    }
    vids.sort((a, b) => b.views - a.views);

    // 광고 — start_date 구간에 시작한 신규 광고 수 + 그 구간에 활성인 광고 수
    let newAds = 0;
    {
      const { count } = await supabase
        .from("meta_ads")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .gte("start_date", from)
        .lte("start_date", to);
      newAds = count ?? 0;
    }
    let activeAds = 0;
    {
      // 구간과 겹치는 광고: start_date <= to AND (end_date >= from OR is_active)
      const { count } = await supabase
        .from("meta_ads")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
        .lte("start_date", to)
        .gte("end_date", from);
      activeAds = count ?? 0;
    }

    // BSR 구간 최고(최저 순위값)
    let bsrBest: number | null = null;
    {
      const { data } = await supabase
        .from("sales_snapshot")
        .select("bsr")
        .eq("channel", "amazon")
        .not("bsr", "is", null)
        .gte("collected_at", from)
        .lte("collected_at", `${to}T23:59:59`)
        .order("bsr", { ascending: true })
        .limit(1);
      bsrBest = (data?.[0]?.bsr as number | null) ?? null;
    }

    return { seeding_count: seeding, top_videos: vids.slice(0, 3), new_ads: newAds, active_ads: activeAds, bsr_best: bsrBest };
  };

  const [before, during, after] = await Promise.all([
    phase(windows[0]!.from, windows[0]!.to),
    phase(windows[1]!.from, windows[1]!.to),
    phase(windows[2]!.from, windows[2]!.to),
  ]);

  return {
    event: { id: ev.id, name: ev.name, start_date: start, end_date: end },
    before,
    during,
    after,
  };
}
