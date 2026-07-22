#!/usr/bin/env node
/**
 * IG 게시물을 기존(TikTok) 내러티브 클러스터에 분류 — 프로토타입용 통합 축.
 *
 * 배경: content_cluster_members가 content_id로만 묶여 IG(external_ref 연결)는 원천 배제.
 * 정식 편입(BE-24)은 스키마+clusterer 변경 필요. 이 스크립트는 그 전 프로토 표시용으로,
 * 이미 태깅된 IG의 캡션+앵글+자막을 Haiku로 기존 클러스터명에 배정한다(신규 수집·재태깅 없음).
 *
 * 출력: /tmp/ig-clusters-<case_id>.json  { cluster: {n, cr10k, sr10k, posts:[...]} }
 * 실행: node scripts/classify-ig-to-clusters.mjs <case_id>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const env = {};
for (const l of fs.readFileSync(path.join(__dir, "..", ".env.local"), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) env[l.slice(0, i)] = l.slice(i + 1).replace(/^"|"$/g, "");
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY, AK = env.ANTHROPIC_API_KEY;
const caseId = process.argv[2];
if (!caseId) throw new Error("usage: node scripts/classify-ig-to-clusters.mjs <case_id>");

const rest = async (p) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

// 1) 기존 클러스터명 + 훅
const clusters = await rest(`content_clusters?case_id=eq.${caseId}&is_meta=eq.false&select=name,hook_pattern&order=member_count.desc`);
const names = clusters.map((c) => c.name);

// 2) 태깅된 IG 게시물 (RPC 대신 두 테이블 조인은 REST로 → ig_posts + case_video_analyses 각각 받아 JS 조인)
const vids = [];
for (let f = 0; ; f += 1000) {
  const p = await rest(`case_video_analyses?case_id=eq.${caseId}&platform=eq.instagram&vision_tags=not.is.null&select=external_ref,vision_tags&offset=${f}&limit=1000`);
  vids.push(...p); if (p.length < 1000) break;
}
const posts = [];
for (let f = 0; ; f += 1000) {
  const p = await rest(`ig_posts?case_id=eq.${caseId}&select=ig_id,short_code,owner_username,caption,likes_count,comments_count,video_play_count,paid_signal&offset=${f}&limit=1000`);
  posts.push(...p); if (p.length < 1000) break;
}
const byId = new Map(posts.map((p) => [p.ig_id, p]));
const items = vids.map((v) => {
  const p = byId.get(v.external_ref); if (!p) return null;
  const t = v.vision_tags || {};
  return { sc: p.short_code, who: p.owner_username, likes: p.likes_count ?? 0,
    cm: p.comments_count ?? 0, views: p.video_play_count ?? 0, paid: p.paid_signal,
    ang: t.content_angle, fmt: t.body_format, ovl: t.overlay_text,
    pr: t.products_visible || [], cap: (p.caption || "").slice(0, 180) };
}).filter(Boolean);
console.log(`IG 게시물 ${items.length}건 · 클러스터 ${names.length}종`);

// 3) Haiku 분류 (배치 25건씩)
const listStr = clusters.map((c, i) => `${i}. ${c.name} — ${(c.hook_pattern || "").slice(0, 70)}`).join("\n");
const call = async (batch) => {
  const body = {
    model: "claude-haiku-4-5-20251001", max_tokens: 1500,
    system: `너는 인스타그램 게시물을 사전 정의된 마케팅 내러티브 클러스터에 배정한다.\n각 게시물의 앵글·포맷·화면자막·캡션·제품을 근거로, 아래 목록에서 가장 잘 맞는 클러스터 번호 하나만 고른다.\n애매하면 훅 설명과 가장 유사한 것을 고른다.\n\n클러스터 목록:\n${listStr}\n\n출력: JSON 배열만. [{"i":0,"c":클러스터번호}, ...] 형식. 설명 금지.`,
    messages: [{ role: "user", content: batch.map((it, i) =>
      `[${i}] 앵글:${it.ang}/${it.fmt} · 자막:"${(it.ovl || "").slice(0, 50)}" · 제품:${it.pr.join(",")} · 캡션:"${it.cap.slice(0, 100)}"`).join("\n") }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AK, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.content) { console.error(JSON.stringify(j).slice(0, 300)); return []; }
  const txt = j.content.map((c) => c.text || "").join("");
  const m = txt.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : [];
};

const B = 25;
for (let i = 0; i < items.length; i += B) {
  const batch = items.slice(i, i + B);
  try {
    const res = await call(batch);
    for (const { i: bi, c } of res) if (batch[bi] && names[c]) batch[bi].cluster = names[c];
  } catch (e) { console.error(`batch ${i}: ${e.message}`); }
  process.stdout.write(`  분류 ${Math.min(i + B, items.length)}/${items.length}\r`);
}

// 4) 클러스터별 집계 (조회수 있는 것만 반응률/저장률)
const agg = {};
for (const it of items) {
  const cl = it.cluster; if (!cl) continue;
  (agg[cl] ||= { n: 0, crSum: 0, crN: 0, posts: [] }).n++;
  if (it.views > 0) { agg[cl].crSum += (it.cm / it.views) * 10000; agg[cl].crN++; }
  agg[cl].posts.push(it);
}
const out = {};
for (const [cl, a] of Object.entries(agg)) {
  a.posts.sort((x, y) => (y.views > 0 ? y.cm / y.views : 0) - (x.views > 0 ? x.cm / x.views : 0));
  out[cl] = { n: a.n, cr10k: a.crN ? +(a.crSum / a.crN).toFixed(1) : null,
    posts: a.posts.slice(0, 5).map((p) => [p.who, p.sc, p.likes, p.cm, p.views,
      p.views > 0 ? +((p.cm / p.views) * 10000).toFixed(1) : null, p.ang, p.fmt, (p.ovl || "").slice(0, 60), p.pr, p.paid]) };
}
const f = `/tmp/ig-clusters-${caseId}.json`;
fs.writeFileSync(f, JSON.stringify(out));
const unc = items.filter((i) => !i.cluster).length;
console.log(`\n완료: ${Object.keys(out).length}개 클러스터 배정 · 미분류 ${unc}건 → ${f}`);
