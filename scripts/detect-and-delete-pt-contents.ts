/**
 * 케이스의 contents 캡션에 franc-min 돌려서 포르투갈어 영상 찾고 DELETE.
 *
 * 사용:
 *   npx tsx --env-file=.env.local scripts/detect-and-delete-pt-contents.ts <case_id> [--dry-run]
 */

import { existsSync, readFileSync } from "node:fs";

// .env.local 로드
const envPath = ".env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

import { createClient } from "@supabase/supabase-js";
import { franc } from "franc-min";

async function main() {
  const caseId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!caseId) {
    throw new Error("case_id 필수");
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE 키 필요");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // case info
  const { data: c } = await supabase
    .from("cases")
    .select("brand_id, country")
    .eq("id", caseId)
    .single();
  if (!c) throw new Error("case 없음");

  // fetch all contents in scope
  console.log(`[fetch] brand_id=${c.brand_id} country=${c.country}`);
  const contents: Array<{ id: string; caption: string | null; url: string | null }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("contents")
      .select("id, caption, url")
      .eq("brand_id", c.brand_id)
      .eq("country", c.country)
      .range(from, from + 999);
    if (error) throw new Error(`contents fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    contents.push(...(data as { id: string; caption: string | null; url: string | null }[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`[fetch] ${contents.length}개`);

  // detect Portuguese
  const ptIds: string[] = [];
  const langCount: Record<string, number> = {};
  for (const c2 of contents) {
    if (!c2.caption) {
      langCount["(no caption)"] = (langCount["(no caption)"] ?? 0) + 1;
      continue;
    }
    const cleaned = c2.caption
      .replace(/[#@][\w가-힣ぁ-んァ-ン一-龯]+/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .trim();
    if (cleaned.length < 10) {
      langCount["(too short)"] = (langCount["(too short)"] ?? 0) + 1;
      continue;
    }
    const code3 = franc(cleaned, { minLength: 10 });
    langCount[code3] = (langCount[code3] ?? 0) + 1;
    if (code3 === "por") ptIds.push(c2.id);
  }

  // 분포 출력
  console.log("\n[lang detect 분포]");
  const sorted = Object.entries(langCount).sort((a, b) => b[1] - a[1]);
  for (const [code, n] of sorted) {
    console.log(`  ${code}: ${n}`);
  }
  console.log(`\n[detect] Portuguese (por): ${ptIds.length}개`);

  if (dryRun) {
    console.log("[dry-run] 삭제 skip");
    return;
  }

  if (ptIds.length === 0) {
    console.log("[done] PT 영상 0개 — 삭제 skip");
    return;
  }

  // DELETE — chunked
  console.log(`\n[delete] ${ptIds.length}개 PT contents 삭제 중...`);
  let deleted = 0;
  for (let i = 0; i < ptIds.length; i += 100) {
    const slice = ptIds.slice(i, i + 100);
    const { error } = await supabase.from("contents").delete().in("id", slice);
    if (error) {
      console.error(`  chunk ${i / 100} fail: ${error.message}`);
      break;
    }
    deleted += slice.length;
  }
  console.log(`[done] ${deleted}개 삭제 완료`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
