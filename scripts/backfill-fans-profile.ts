// BE-37 백필 — unknown 크리에이터 팬 수를 프로필 직접 조회로 채움 (영상 URL 경유 폐기)
// 실행: npx tsx --env-file=.env.local scripts/backfill-fans-profile.ts
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;
const token = process.env.APIFY_TOKEN!;
const BRANDS = (process.env.BRANDS ?? "Abib,Elta MD,Larocheposay,Skin1004").split(",");
const CHUNK = Number(process.env.CHUNK ?? 300);
const tierOf = (f: number) => f >= 1000000 ? "mega" : f >= 500000 ? "macro" : f >= 100000 ? "mid" : f >= 10000 ? "micro" : f >= 1000 ? "nano" : null;

async function runActor(handles: string[]): Promise<Map<string, number>> {
  const start = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-profile-scraper/runs?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profiles: handles, resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadAvatars: false, shouldDownloadSubtitles: false }) });
  const sj = await start.json() as any;
  if (!sj.data?.id) throw new Error("start fail: " + JSON.stringify(sj).slice(0, 200));
  const runId = sj.data.id, ds = sj.data.defaultDatasetId;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10000));
    const st = await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`)).json() as any;
    if (st.data.status === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st.data.status)) { console.error("run", st.data.status); break; }
  }
  const out = new Map<string, number>();
  for (let off = 0; ; off += 1000) {
    const items = await (await fetch(`https://api.apify.com/v2/datasets/${ds}/items?token=${token}&format=json&offset=${off}&limit=1000`)).json() as any[];
    if (!items.length) break;
    for (const it of items) {
      const a = it.authorMeta ?? {};
      const name = (a.name ?? "").toLowerCase();
      if (name && typeof a.fans === "number") out.set(name, a.fans);
    }
    if (items.length < 1000) break;
  }
  return out;
}

async function main() {
  let totalFilled = 0, totalTried = 0;
  for (const bname of BRANDS) {
    const { data: b } = await sb.from("brands").select("id").eq("name", bname).single();
    const unk: any[] = [];
    for (let off = 0; ; off += 1000) {
      const { data } = await sb.from("contents").select("influencer_id, influencers!inner(id,handle,follower_count)")
        .eq("brand_id", b.id).eq("country", "US").is("influencers.follower_count", null).range(off, off + 999);
      if (!data?.length) break; unk.push(...data); if (data.length < 1000) break;
    }
    const byHandle = new Map<string, string>();
    for (const r of unk) { const h = (r.influencers?.handle ?? "").toLowerCase().replace(/^@/, ""); if (h) byHandle.set(h, r.influencers.id); }
    const handles = [...byHandle.keys()];
    console.error(bname, "unknown handles:", handles.length);
    totalTried += handles.length;
    for (let i = 0; i < handles.length; i += CHUNK) {
      const chunk = handles.slice(i, i + CHUNK);
      const fans = await runActor(chunk);
      let filled = 0;
      for (const [h, f] of fans.entries()) {
        const id = byHandle.get(h);
        if (!id) continue;
        const { error } = await sb.from("influencers").update({ follower_count: f, tier: tierOf(f), fans_source: "apify_clockworks_profile" }).eq("id", id);
        if (!error) filled++;
      }
      totalFilled += filled;
      console.error(`  chunk ${Math.floor(i / CHUNK) + 1}: sent ${chunk.length} → got ${fans.size} → filled ${filled}`);
    }
  }
  console.error("TOTAL tried", totalTried, "filled", totalFilled);
}
main().catch(e => { console.error("FAIL", e.message); process.exit(1); });
