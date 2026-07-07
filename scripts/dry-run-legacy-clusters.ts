/**
 * BE-2 dry-run (R12): interpret-cluster의 force+빈결과 legacy 삭제가 어떤 클러스터를
 * 지우게 될지 **SELECT만으로** 미리 집계한다. 삭제·write 없음 (워커 SELECT 권한 범위).
 *
 * 대상: WS5 §2에서 실측된 4케이스(id 8자 프리픽스). 인자로 추가 프리픽스 지정 가능.
 *   npm run dryrun:clusters
 *   npm run dryrun:clusters -- 542e7625 ec60ffba
 *
 * 환경변수(.env.local 자동 로드): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 출력: 케이스별 삭제 대상 클러스터 수·멤버 수·목록(명시 ID). REPORT에 첨부.
 */

import { existsSync, readFileSync } from "node:fs";

// .env.local 자동 로드 (gate-tagging-model.ts와 동일 패턴)
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
import type { Database } from "../src/lib/supabase/types";
import { previewCaseClusters } from "../src/lib/inngest/aggregators/phase4b-clusters";

// WS5 §2 실측 4케이스 (id 8자 프리픽스)
const DEFAULT_PREFIXES = ["542e7625", "ec60ffba", "a6000e91", "f724e382"];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  }
  const supabase = createClient<Database>(url, key);

  const prefixes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_PREFIXES;

  console.log(`# BE-2 legacy 클러스터 삭제 dry-run (SELECT only)`);
  console.log(`# 프로젝트: ${url}`);
  console.log(`# 대상 프리픽스: ${prefixes.join(", ")}\n`);

  // id는 uuid라 서버측 ilike가 안 먹는다 → 전체 케이스를 받아 JS에서 프리픽스 매칭.
  const { data: allCases, error } = await supabase
    .from("cases")
    .select("id, brand_id, status");
  if (error) throw new Error(`cases 조회: ${error.message}`);

  let totalClusters = 0;
  let totalMembers = 0;

  for (const prefix of prefixes) {
    const matched = (allCases ?? []).filter((c) => c.id.startsWith(prefix));
    if (matched.length === 0) {
      console.log(`## ${prefix} — ⚠️ 매칭 케이스 없음\n`);
      continue;
    }
    for (const c of matched) {
      const preview = await previewCaseClusters(supabase, c.id);
      totalClusters += preview.cluster_count;
      totalMembers += preview.member_count;
      console.log(`## ${prefix} — brand_id=${c.brand_id} [status=${c.status}]`);
      console.log(`   case_id: ${c.id}`);
      console.log(
        `   삭제 대상: 클러스터 ${preview.cluster_count}개 · 멤버 ${preview.member_count}개`,
      );
      for (const cl of preview.clusters) {
        console.log(
          `     - ${cl.is_meta ? "META" : "child"} ${cl.id}  "${cl.name}"  members=${cl.member_count}  run_tag=${cl.run_tag ?? "null(legacy)"}`,
        );
      }
      console.log("");
    }
  }

  console.log(`# 합계: 클러스터 ${totalClusters}개 · 멤버 ${totalMembers}개`);
  console.log(
    `# 주: force 재실행 & 새 클러스터 0(입력/후보/검증/메타 0)일 때만 삭제됨. 자연 실행은 보존.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
