import Anthropic from "@anthropic-ai/sdk";
import type { VisionTags } from "@/lib/inngest/types";
import { SONNET_MODEL, TAGGING_MODEL, calcCost } from "./pricing";

// WS3 §3.4: pass1(후보 추출)=Haiku(닫힌 나열), pass2/3(통합·명명)=Sonnet(개방형 판단).
const PASS1_MODEL = TAGGING_MODEL;
const PASS23_MODEL = SONNET_MODEL;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
    client = new Anthropic({ apiKey });
  }
  return client;
}

// =============================================================================
// 입력 데이터 타입
// =============================================================================
export type ClusterPlatform = "tiktok" | "instagram" | "youtube";

export type VideoForClustering = {
  // LLM이 다루는 short id (prefix 포함, ex: "tk_a1b2c3d4" / "ig_BxYz1234" / "yt_dQw4w9Wg")
  cluster_key: string;
  platform: ClusterPlatform;
  // TikTok: case_video_analyses.content_id (uuid). 그 외: null
  content_id: string | null;
  // IG: ig_id, YT: yt_id. TikTok: null
  external_ref: string | null;
  // TikTok: vision_tags (있을 때만). IG/YT는 null → caption 모드.
  vision_tags: VisionTags | null;
  // IG/YT: caption (또는 title+description). TikTok: 보통 null.
  caption: string | null;
  views: number | null;
  collect_count: number | null;
};

// =============================================================================
// 출력 타입
// =============================================================================
export type ClusterCandidate = {
  name: string;
  description: string;
  hook_pattern: string;
  body_pattern: string;
  member_ids: string[];
};

export type ValidatedCluster = ClusterCandidate;

export type MetaCluster = {
  name: string;
  description: string;
  child_indexes: number[]; // ValidatedCluster 배열 인덱스
};

export type TokenUsage = {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
};

const PASS1_BATCH_SIZE = 80;

// =============================================================================
// 영상 한 줄 요약
// =============================================================================
const PLATFORM_TAG: Record<ClusterPlatform, string> = {
  tiktok: "TT",
  instagram: "IG",
  youtube: "YT",
};

export function platformPrefix(p: ClusterPlatform): string {
  return p === "tiktok" ? "tk" : p === "instagram" ? "ig" : "yt";
}

export function parseClusterKey(
  key: string,
): { platform: ClusterPlatform; shortId: string } | null {
  if (key.startsWith("tk_")) return { platform: "tiktok", shortId: key.slice(3) };
  if (key.startsWith("ig_")) return { platform: "instagram", shortId: key.slice(3) };
  if (key.startsWith("yt_")) return { platform: "youtube", shortId: key.slice(3) };
  return null;
}

function summarizeVideo(v: VideoForClustering): string {
  const tag = `[${PLATFORM_TAG[v.platform]}]`;
  // vision_tags 있으면 (TikTok) 기존 풍부 요약. 없으면 caption 모드.
  if (v.vision_tags) {
    const t = v.vision_tags;
    const overlay =
      t.overlay_text && t.overlay_text.length > 40
        ? `${t.overlay_text.slice(0, 40)}…`
        : (t.overlay_text ?? "");
    return [
      `ID:${v.cluster_key}`,
      tag,
      `hook:${t.hook_tags.join(",") || "?"}`,
      `angle:${t.content_angle}`,
      `body:${t.body_format}`,
      `style:${t.visual_style}`,
      `intent:${t.purchase_intent}`,
      overlay ? `overlay:"${overlay.replace(/"/g, "'")}"` : null,
      t.cta_type ? `cta:${t.cta_type}` : null,
      t.products_visible.length > 0
        ? `products:${t.products_visible.slice(0, 3).join("|")}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  // caption 모드 (IG/YT)
  const cap = (v.caption ?? "").replace(/\s+/g, " ").trim();
  const capTrim = cap.length > 220 ? `${cap.slice(0, 220)}…` : cap;
  return [
    `ID:${v.cluster_key}`,
    tag,
    capTrim ? `caption:"${capTrim.replace(/"/g, "'")}"` : "caption:(empty)",
  ].join(" ");
}

// cluster_key 변형 → canonical cluster_key 매핑. LLM이 prefix를 떼거나 케이스를
// 바꿔도 통과시키기 위해 여러 변형 등록.
function buildIdMap(videos: VideoForClustering[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of videos) {
    const key = v.cluster_key; // 예: "tk_a1b2c3d4"
    m.set(key, key);
    m.set(key.toLowerCase(), key);
    // prefix 제거 변형 (LLM이 "a1b2c3d4"만 반환할 가능성)
    const noPrefix = key.replace(/^(tk_|ig_|yt_)/, "");
    m.set(noPrefix, key);
    m.set(noPrefix.toLowerCase(), key);
  }
  return m;
}

function resolveLlmId(
  raw: string,
  idMap: Map<string, string>,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return (
    idMap.get(trimmed) ??
    idMap.get(trimmed.toLowerCase()) ??
    idMap.get(trimmed.replace(/-/g, "")) ??
    null
  );
}

// =============================================================================
// Pass 1 — 후보 클러스터 발견 (batch 단위)
// =============================================================================
const PASS1_SYSTEM = `You cluster creator videos across TikTok ([TT]) / Instagram ([IG]) / YouTube ([YT]) by similar HOOK strategy + BODY format patterns for brand-performance benchmarking.

Two input formats appear in the same batch:
- [TT] rows: rich vision tags (hook/angle/body/style/intent/cta/overlay/products).
- [IG] / [YT] rows: caption-only (vision tags unavailable). Infer hook/body pattern from caption text + hashtags + emoji + CTA phrases.

Cross-platform clustering: a cluster CAN mix TT/IG/YT members when the underlying strategy is the same (예: "할인코드/스왑 CTA형", "Before/After 결과 시각화형"). Do not force platform-pure clusters.

Each video ID has a platform prefix ("tk_"/"ig_"/"yt_") — preserve the prefix verbatim in member_ids.

Rules:
- A video can belong to multiple clusters (overlap OK).
- Cluster names: short Korean labels (예: "리스트·큐레이션 저장 유도형", "공감 서사 일상 페르소나형").
- Each cluster needs ≥3 members to be valid (drop smaller).
- hook_pattern + body_pattern: short Korean descriptions of the recurring pattern.

Output ONLY valid JSON (no markdown, no commentary):
{
  "clusters": [
    {
      "name": "...",
      "description": "한 줄 설명",
      "hook_pattern": "...",
      "body_pattern": "...",
      "member_ids": ["tk_a1b2c3d4", "ig_BxYz1234", ...]
    }
  ]
}`;

export type Pass1Diagnostics = {
  batches: number;
  raw_clusters_total: number; // LLM이 반환한 클러스터 합계 (필터 전)
  parse_failures: number; // batch 단위 JSON parse 실패 수
  dropped_too_small: number; // member_ids.length < 3
  dropped_id_mismatch: number; // ID 매핑 후 fullIds.length < 3
  sample_unmatched_ids: string[]; // 매칭 실패한 raw id 샘플 (디버깅용)
  sample_member_id_format: string | null; // 첫 cluster의 첫 member_id 원본
};

export async function pass1FindCandidates(
  videos: VideoForClustering[],
): Promise<{
  candidates: ClusterCandidate[];
  usage: TokenUsage;
  diagnostics: Pass1Diagnostics;
}> {
  const candidates: ClusterCandidate[] = [];
  const usage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const idMap = buildIdMap(videos);
  const diag: Pass1Diagnostics = {
    batches: 0,
    raw_clusters_total: 0,
    parse_failures: 0,
    dropped_too_small: 0,
    dropped_id_mismatch: 0,
    sample_unmatched_ids: [],
    sample_member_id_format: null,
  };

  // 배치 빌드
  const pass1Batches: { batchIdx: number; userText: string }[] = [];
  for (let i = 0; i < videos.length; i += PASS1_BATCH_SIZE) {
    const batch = videos.slice(i, i + PASS1_BATCH_SIZE);
    pass1Batches.push({
      batchIdx: i / PASS1_BATCH_SIZE,
      userText: batch.map(summarizeVideo).join("\n"),
    });
  }
  diag.batches = pass1Batches.length;

  // ★ LLM 호출 동시성 제한 병렬 — 기존엔 배치를 순차 await 해서, 영상 많을 때
  //   (예: ~900개=12배치) pass1만 8분+ 걸려 Vercel 800s 한계 초과 → 타임아웃(500)이
  //   클러스터링 실패의 근본 원인이었음. waves(5개씩 동시)로 묶어 pass1 시간을
  //   1/5 수준으로 단축. rate-limit 안전 위해 동시성 5로 제한.
  const PASS1_CONCURRENCY = 5;
  const llmResults: {
    batchIdx: number;
    result: Awaited<ReturnType<typeof callAnthropicJson>>;
  }[] = [];
  for (let i = 0; i < pass1Batches.length; i += PASS1_CONCURRENCY) {
    const wave = pass1Batches.slice(i, i + PASS1_CONCURRENCY);
    const settled = await Promise.all(
      wave.map(async (b) => ({
        batchIdx: b.batchIdx,
        // 80영상 × 8자리 ID × 4-10클러스터 → 출력 2K+ 토큰. 여유있게 5K.
        result: await callAnthropicJson(
          PASS1_SYSTEM,
          `Videos:\n${b.userText}`,
          5000,
          PASS1_MODEL,
        ),
      })),
    );
    llmResults.push(...settled);
  }
  // 결정적 처리 순서 (sample_member_id_format 등 안정화)
  llmResults.sort((a, b) => a.batchIdx - b.batchIdx);

  // 결과 처리 — 순차(공유 상태 candidates/usage/diag mutation 안전)
  for (const { batchIdx, result } of llmResults) {
    addUsage(usage, result.usage);
    if (!result.json) {
      diag.parse_failures += 1;
      console.warn(
        `[clusterer pass1] JSON parse failed for batch ${batchIdx} (output_tokens=${result.usage.output})`,
      );
      continue;
    }

    const parsed = result.json as {
      clusters?: Array<{
        name?: string;
        description?: string;
        hook_pattern?: string;
        body_pattern?: string;
        member_ids?: string[];
      }>;
    };
    const rawClusters = parsed.clusters ?? [];
    diag.raw_clusters_total += rawClusters.length;

    if (
      diag.sample_member_id_format == null &&
      rawClusters[0]?.member_ids?.[0]
    ) {
      diag.sample_member_id_format = rawClusters[0].member_ids[0];
    }

    for (const c of rawClusters) {
      if (!c.name || !c.member_ids || c.member_ids.length < 3) {
        diag.dropped_too_small += 1;
        continue;
      }
      const fullIds: string[] = [];
      for (const raw of c.member_ids) {
        const resolved = resolveLlmId(raw, idMap);
        if (resolved) fullIds.push(resolved);
        else if (diag.sample_unmatched_ids.length < 5) {
          diag.sample_unmatched_ids.push(raw);
        }
      }
      if (fullIds.length < 3) {
        diag.dropped_id_mismatch += 1;
        continue;
      }
      candidates.push({
        name: c.name,
        description: c.description ?? "",
        hook_pattern: c.hook_pattern ?? "",
        body_pattern: c.body_pattern ?? "",
        member_ids: fullIds,
      });
    }
  }

  return { candidates, usage, diagnostics: diag };
}

// =============================================================================
// Pass 2 — 검증 / 병합
// =============================================================================
const PASS2_SYSTEM = `You merge candidate cluster definitions from multiple batches into a clean validated set.

Rules:
- Combine candidates with overlapping themes (same hook+body pattern → merge into one).
- Drop too-vague candidates (no clear pattern).
- Final set: 5~15 distinct clusters (or fewer if input has few unique themes).
- Each cluster: clear Korean name, distinct from others.
- For each output cluster, list which input candidate indexes it covers in "merged_from".
- A candidate index can appear in only ONE output cluster.

Output ONLY valid JSON (compact — DO NOT enumerate member ids, just indexes):
{
  "clusters": [
    {
      "name": "...",
      "description": "...",
      "hook_pattern": "...",
      "body_pattern": "...",
      "merged_from": [int, int, ...]
    }
  ]
}`;

export type Pass2Diagnostics = {
  raw_clusters_total: number;
  parse_failed: boolean;
  dropped_no_indexes: number;
  dropped_too_small: number;
  invalid_indexes: number;
  output_tokens: number;
  parse_error_tail?: string; // parse 실패시 LLM 출력 끝 200자
  stop_reason?: string; // end_turn / max_tokens / stop_sequence 등
};

export async function pass2Validate(
  candidates: ClusterCandidate[],
): Promise<{
  validated: ValidatedCluster[];
  usage: TokenUsage;
  diagnostics: Pass2Diagnostics;
}> {
  const usage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const diag: Pass2Diagnostics = {
    raw_clusters_total: 0,
    parse_failed: false,
    dropped_no_indexes: 0,
    dropped_too_small: 0,
    invalid_indexes: 0,
    output_tokens: 0,
  };
  if (candidates.length === 0) return { validated: [], usage, diagnostics: diag };

  // 입력: 각 candidate의 메타정보만 (member_ids는 보내지 않음 — 토큰 절약)
  const lines = candidates.map(
    (c, i) =>
      `[C${i}] "${c.name}" m=${c.member_ids.length} hook="${c.hook_pattern}" body="${c.body_pattern}"`,
  );
  const userText = `Candidate clusters (${candidates.length} total):\n${lines.join("\n")}`;

  // Pass 2 — 최대 15개 cluster × ~400 tokens(이름+description+hook+body+merged_from)
  // = ~6K. Claude verbose 시 8K+. truncation 안 일어나게 16K 박음 (Dr. Reju-all 케이스에서
  // 5,276/6000 거의 max라 JSON 끊겨 parse 실패한 사례 — 5/6).
  const result = await callAnthropicJson(PASS2_SYSTEM, userText, 16000, PASS23_MODEL);
  addUsage(usage, result.usage);
  diag.output_tokens = result.usage.output;
  diag.stop_reason = result.stop_reason;
  if (!result.json) {
    diag.parse_failed = true;
    diag.parse_error_tail = result.parse_error_tail;
    console.warn(
      `[clusterer pass2] JSON parse failed (input_clusters=${candidates.length}, output_tokens=${result.usage.output}, stop=${result.stop_reason})`,
    );
    return { validated: [], usage, diagnostics: diag };
  }

  const parsed = result.json as {
    clusters?: Array<{
      name?: string;
      description?: string;
      hook_pattern?: string;
      body_pattern?: string;
      merged_from?: number[];
    }>;
  };
  const rawClusters = parsed.clusters ?? [];
  diag.raw_clusters_total = rawClusters.length;

  const validated: ValidatedCluster[] = [];
  for (const c of rawClusters) {
    if (!c.name) {
      diag.dropped_no_indexes += 1;
      continue;
    }
    const indexes = (c.merged_from ?? []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
    );
    diag.invalid_indexes += (c.merged_from ?? []).length - indexes.length;
    if (indexes.length === 0) {
      diag.dropped_no_indexes += 1;
      continue;
    }
    // member_ids = union of merged candidate members
    const memberSet = new Set<string>();
    for (const idx of indexes) {
      const cand = candidates[idx];
      if (!cand) continue;
      for (const id of cand.member_ids) memberSet.add(id);
    }
    if (memberSet.size < 3) {
      diag.dropped_too_small += 1;
      continue;
    }
    validated.push({
      name: c.name,
      description: c.description ?? "",
      hook_pattern: c.hook_pattern ?? "",
      body_pattern: c.body_pattern ?? "",
      member_ids: Array.from(memberSet),
    });
  }

  return { validated, usage, diagnostics: diag };
}

// =============================================================================
// Pass 3 — 메타 클러스터 grouping
// =============================================================================
const PASS3_SYSTEM = `Group these validated clusters into 4-8 META clusters representing high-level content strategy archetypes for the brand's market.

Each meta cluster:
- Korean name (예: "엔터테인먼트 × 비교 충격 훅 바이럴형", "전문가 권위 × 성분 과학 교육형")
- Description (한 줄, 어떤 큰 전략인지)
- child_indexes: 입력 클러스터 인덱스 배열

Rules:
- 4 <= meta count <= 8
- Each input cluster goes to exactly one meta cluster (no overlap at meta level)
- Try to make meta clusters distinct and balanced when possible

Output ONLY valid JSON:
{
  "meta_clusters": [
    { "name", "description", "child_indexes": [int...] }
  ]
}`;

export async function pass3Meta(
  validated: ValidatedCluster[],
): Promise<{ metas: MetaCluster[]; usage: TokenUsage }> {
  const usage: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  if (validated.length === 0) return { metas: [], usage };

  const lines = validated.map(
    (c, i) =>
      `[${i}] "${c.name}" m=${c.member_ids.length} hook="${c.hook_pattern}" body="${c.body_pattern}"`,
  );
  const userText = `Validated clusters:\n${lines.join("\n")}`;

  // Pass 3 — 4-8 meta × ~300 tok(name+description+child_indexes) = ~2.4K.
  // Pass 2가 truncation으로 fail한 전례 있어서 여유 있게 4K.
  const result = await callAnthropicJson(PASS3_SYSTEM, userText, 4000, PASS23_MODEL);
  addUsage(usage, result.usage);
  if (!result.json) {
    console.warn(
      `[clusterer pass3] JSON parse failed (input_validated=${validated.length}, output_tokens=${result.usage.output})`,
    );
    return { metas: [], usage };
  }

  const parsed = result.json as {
    meta_clusters?: Array<{
      name?: string;
      description?: string;
      child_indexes?: number[];
    }>;
  };
  const metas: MetaCluster[] = [];
  for (const m of parsed.meta_clusters ?? []) {
    if (!m.name || !m.child_indexes || m.child_indexes.length === 0) continue;
    const validIdx = m.child_indexes.filter(
      (i) => Number.isInteger(i) && i >= 0 && i < validated.length,
    );
    if (validIdx.length === 0) continue;
    metas.push({
      name: m.name,
      description: m.description ?? "",
      child_indexes: validIdx,
    });
  }

  return { metas, usage };
}

// =============================================================================
// helpers
// =============================================================================
// JSON 추출 — 첫 `{` 부터 마지막 `}` 까지. 중간에 commentary나 fence 변형이 있어도 통과.
function extractJsonEnvelope(s: string): string | null {
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  return s.slice(firstBrace, lastBrace + 1);
}

// JSON5 cleanup — trailing commas 제거. 다른 변형들은 의도적으로 다루지 않음
// (string 내부 변형 처리는 위험해서).
function looseJsonCleanup(s: string): string {
  return s.replace(/,(\s*[}\]])/g, "$1");
}

async function callAnthropicJson(
  systemPrompt: string,
  userText: string,
  maxTokens: number,
  model: string,
): Promise<{
  json: unknown;
  usage: TokenUsage;
  parse_error_tail?: string;
  stop_reason?: string;
}> {
  const { sanitizeUtf16 } = await import("./sanitize");
  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: sanitizeUtf16(systemPrompt),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: sanitizeUtf16(userText) }],
  });

  const u = response.usage;
  const usage: TokenUsage = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_creation_input_tokens ?? 0,
  };

  const block = response.content.find(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  if (!block) return { json: null, usage };

  const stop = (response as { stop_reason?: string }).stop_reason ?? "?";

  // 1차: fence 떼고 시도
  const stripped = block.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return { json: JSON.parse(stripped), usage, stop_reason: stop };
  } catch {
    /* fallthrough */
  }

  // 2차: 첫 `{` ~ 마지막 `}` 구간만 추출 (앞뒤 commentary 제거)
  const envelope = extractJsonEnvelope(stripped);
  if (envelope) {
    try {
      return { json: JSON.parse(envelope), usage, stop_reason: stop };
    } catch {
      /* fallthrough */
    }
    // 3차: trailing comma 제거 후 재시도
    try {
      return {
        json: JSON.parse(looseJsonCleanup(envelope)),
        usage,
        stop_reason: stop,
      };
    } catch (e) {
      const tail = envelope.slice(-200);
      console.warn(
        `[clusterer] JSON parse error (stop=${stop}, envelope_len=${envelope.length}): ...${tail}`,
        e instanceof Error ? e.message : String(e),
      );
      return { json: null, usage, parse_error_tail: tail, stop_reason: stop };
    }
  }

  const tail = block.text.slice(-200);
  console.warn(
    `[clusterer] No JSON envelope (stop=${stop}, len=${block.text.length}): ...${tail}`,
  );
  return { json: null, usage, parse_error_tail: tail, stop_reason: stop };
}

function addUsage(acc: TokenUsage, add: TokenUsage): void {
  acc.input += add.input;
  acc.output += add.output;
  acc.cache_read += add.cache_read;
  acc.cache_write += add.cache_write;
}

/**
 * 3-pass 클러스터 비용 (WS3 §3.4 티어링 반영).
 * pass1(후보 추출)은 Haiku 단가, pass2/3(통합·명명)은 Sonnet 단가.
 * 두 usage 누산기를 분리해서 받아 각 단가로 합산한다.
 */
export function calcClusterCost(
  pass1Usage: TokenUsage,
  pass23Usage: TokenUsage,
): number {
  return calcCost(pass1Usage, PASS1_MODEL) + calcCost(pass23Usage, PASS23_MODEL);
}
