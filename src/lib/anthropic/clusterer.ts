import Anthropic from "@anthropic-ai/sdk";
import type { VisionTags } from "@/lib/inngest/types";

const MODEL = "claude-sonnet-4-6";

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
export type VideoForClustering = {
  content_id: string;
  vision_tags: VisionTags;
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
function summarizeVideo(v: VideoForClustering): string {
  const t = v.vision_tags;
  const overlay =
    t.overlay_text && t.overlay_text.length > 40
      ? `${t.overlay_text.slice(0, 40)}…`
      : (t.overlay_text ?? "");
  return [
    `ID:${v.content_id.slice(0, 8)}`,
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

// short id → full id 매핑. LLM은 8자리 prefix를 쓰도록 안내하지만, 실제로는
// 풀 UUID, dash 제거된 값 등 다양한 형식이 반환될 수 있어 여러 키를 미리 매핑.
function buildIdMap(videos: VideoForClustering[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of videos) {
    const full = v.content_id;
    const short = full.slice(0, 8);
    const noDash = full.replace(/-/g, "");
    m.set(full, full);
    m.set(short, full);
    m.set(noDash, full);
    m.set(noDash.slice(0, 8), full);
    m.set(full.toLowerCase(), full);
    m.set(short.toLowerCase(), full);
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
    idMap.get(trimmed.slice(0, 8)) ??
    idMap.get(trimmed.replace(/-/g, "").slice(0, 8)) ??
    null
  );
}

// =============================================================================
// Pass 1 — 후보 클러스터 발견 (batch 단위)
// =============================================================================
const PASS1_SYSTEM = `You cluster TikTok content videos by similar HOOK strategy + BODY format patterns for brand-performance benchmarking.

Given a batch of video tags, identify 4-10 distinct clusters where each cluster represents a recurring "way of doing the video".

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
      "member_ids": ["8charID", ...]
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

  for (let i = 0; i < videos.length; i += PASS1_BATCH_SIZE) {
    diag.batches += 1;
    const batch = videos.slice(i, i + PASS1_BATCH_SIZE);
    const userText = batch.map(summarizeVideo).join("\n");
    const result = await callAnthropicJson(
      PASS1_SYSTEM,
      `Videos:\n${userText}`,
      // 80영상 × 8자리 ID × 4-10클러스터 → 출력 2K+ 토큰. 여유있게 5K.
      5000,
    );
    addUsage(usage, result.usage);
    if (!result.json) {
      diag.parse_failures += 1;
      console.warn(
        `[clusterer pass1] JSON parse failed for batch ${i / PASS1_BATCH_SIZE} (size=${batch.length}, output_tokens=${result.usage.output})`,
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

  const result = await callAnthropicJson(PASS2_SYSTEM, userText, 6000);
  addUsage(usage, result.usage);
  diag.output_tokens = result.usage.output;
  if (!result.json) {
    diag.parse_failed = true;
    console.warn(
      `[clusterer pass2] JSON parse failed (input_clusters=${candidates.length}, output_tokens=${result.usage.output})`,
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

  const result = await callAnthropicJson(PASS3_SYSTEM, userText, 1500);
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
async function callAnthropicJson(
  systemPrompt: string,
  userText: string,
  maxTokens: number,
): Promise<{ json: unknown; usage: TokenUsage }> {
  const { sanitizeUtf16 } = await import("./sanitize");
  const response = await getClient().messages.create({
    model: MODEL,
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

  try {
    const cleaned = block.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return { json: JSON.parse(cleaned), usage };
  } catch (e) {
    // 디버그: 끝 80자 + stop_reason으로 truncation 여부 판단
    const tail = block.text.slice(-120);
    const stop = (response as { stop_reason?: string }).stop_reason ?? "?";
    console.warn(
      `[clusterer] JSON parse error (stop=${stop}, len=${block.text.length}): ...${tail}`,
      e instanceof Error ? e.message : String(e),
    );
    return { json: null, usage };
  }
}

function addUsage(acc: TokenUsage, add: TokenUsage): void {
  acc.input += add.input;
  acc.output += add.output;
  acc.cache_read += add.cache_read;
  acc.cache_write += add.cache_write;
}

export function calcClusterCost(usage: TokenUsage): number {
  const M = 1_000_000;
  return (
    (usage.input * 3) / M +
    (usage.cache_read * 0.3) / M +
    (usage.cache_write * 3.75) / M +
    (usage.output * 15) / M
  );
}
