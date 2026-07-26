/**
 * BE-29 — SKU 채널 간 동일제품 매칭 (결정론 엔진, $0).
 *
 * Kalodata(한국어·ml) ↔ Amazon(영어·oz) 리스팅을 같은 제품으로 판정하기 위한 신호 산출:
 *   ① 이름 토큰 Jaccard (브랜드·상투어 제거) ② 용량 환산 매칭(ml/fl oz/g) ③ 카테고리 ④ 가격대
 * → 결정론 verdict + 모순 플래그. LLM 쌍 판정(sku-match-llm)과 이중 판정해 일치율 검증.
 * (제품 이미지 대조는 products에 이미지 컬럼 부재 → 후속. 현재는 텍스트+용량+가격.)
 */

export type SkuProduct = {
  id: string;
  name: string;
  channel: string;
  price: number | null;
  category: string | null;
};

// 브랜드·카테고리 일반어·상투어 — 이름 토큰에서 제거(제품 구분 신호 아님).
const NAME_STOP = new Set([
  "the","and","for","with","by","of","natural","korean","kbeauty","k","beauty",
  "hair","care","haircare","skincare","skin","facial","face","pure","new","pro",
  "set","pack","value","size","fl","oz","ml","g","kg","l","official","premium",
  "deep","intensive","ultra","daily","original","formula","product","cosmetics",
  "한국","천연","정품","세트","대용량","리필","증정","기획","본품",
]);

const VOL_RE = /(\d+(?:\.\d+)?)\s*(fl\s*oz|floz|fluid\s*ounce|oz|ml|milliliter|g\b|gram|kg|l\b|liter)/gi;

export type VolumeInfo = { ml: number | null; g: number | null };

/** 이름에서 용량 파싱 → ml(액체)·g(무게) 정규화. fl oz→ml(×29.5735), oz는 액체 가정(fl oz). */
export function parseVolume(name: string): VolumeInfo {
  let ml: number | null = null;
  let g: number | null = null;
  const s = name.toLowerCase();
  let m: RegExpExecArray | null;
  VOL_RE.lastIndex = 0;
  while ((m = VOL_RE.exec(s)) !== null) {
    const v = parseFloat(m[1]!);
    const unit = m[2]!.replace(/\s+/g, "");
    if (Number.isNaN(v)) continue;
    if (/^(floz|fluidounce|oz|fluid)/.test(unit) || unit === "oz") {
      ml = Math.max(ml ?? 0, v * 29.5735);
    } else if (unit === "ml" || unit === "milliliter") {
      ml = Math.max(ml ?? 0, v);
    } else if (unit === "l" || unit === "liter") {
      ml = Math.max(ml ?? 0, v * 1000);
    } else if (unit === "g" || unit === "gram") {
      g = Math.max(g ?? 0, v);
    } else if (unit === "kg") {
      g = Math.max(g ?? 0, v * 1000);
    }
  }
  return { ml: ml && ml > 0 ? Math.round(ml * 10) / 10 : null, g: g && g > 0 ? g : null };
}

/** 이름 토큰화: 소문자·구두점 제거·브랜드·상투어 제외. 용량 토큰도 제거(별도 신호). */
export function nameTokens(name: string, brandTokens: string[] = []): Set<string> {
  const brand = new Set(brandTokens.map((b) => b.toLowerCase()));
  const cleaned = name
    .toLowerCase()
    .replace(VOL_RE, " ")
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const out = new Set<string>();
  for (const w of cleaned.split(" ")) {
    if (!w || w.length < 2) continue;
    if (NAME_STOP.has(w) || brand.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

export type PairSignals = {
  name_score: number;
  volume_match: "match" | "mismatch" | "unknown";
  category_match: "match" | "mismatch" | "unknown";
  price_ratio: number | null;
  contradiction_flags: string[];
  verdict: "same" | "maybe" | "diff";
  shared_tokens: string[];
};

const VOL_TOL = 0.12; // 용량 12% 오차 허용(반올림·표기 차)

/** 두 제품 쌍 신호 산출 + 결정론 verdict. */
export function scorePair(
  a: SkuProduct,
  b: SkuProduct,
  brandTokens: string[] = [],
): PairSignals {
  const ta = nameTokens(a.name, brandTokens);
  const tb = nameTokens(b.name, brandTokens);
  const nameScore = Math.round(jaccard(ta, tb) * 100) / 100;
  const shared = [...ta].filter((x) => tb.has(x));

  const va = parseVolume(a.name);
  const vb = parseVolume(b.name);
  let volume: PairSignals["volume_match"] = "unknown";
  if (va.ml != null && vb.ml != null) {
    volume = Math.abs(va.ml - vb.ml) / Math.max(va.ml, vb.ml) <= VOL_TOL ? "match" : "mismatch";
  } else if (va.g != null && vb.g != null) {
    volume = Math.abs(va.g - vb.g) / Math.max(va.g, vb.g) <= VOL_TOL ? "match" : "mismatch";
  }

  const catA = (a.category ?? "").trim().toLowerCase();
  const catB = (b.category ?? "").trim().toLowerCase();
  let category: PairSignals["category_match"] = "unknown";
  if (catA && catB) {
    // 완전 일치 또는 한쪽이 다른쪽 포함(상위/하위 카테고리)
    category = catA === catB || catA.includes(catB) || catB.includes(catA) ? "match" : "mismatch";
  }

  let priceRatio: number | null = null;
  if (a.price != null && b.price != null && a.price > 0 && b.price > 0) {
    priceRatio = Math.round((Math.max(a.price, b.price) / Math.min(a.price, b.price)) * 100) / 100;
  }

  // 모순 플래그
  const flags: string[] = [];
  if (category === "mismatch") flags.push("category_mismatch");
  if (volume === "mismatch") flags.push("volume_mismatch");
  if (priceRatio != null && priceRatio >= 3) flags.push("price_3x");

  // 결정론 verdict:
  //  - hard 모순(용량 불일치·가격 3배차)만 verdict를 maybe로 강제. category_mismatch는 채널 간
  //    granularity 차이(amazon "Beauty & Personal Care" vs tiktok "Facial Cleansers")로 노이즈가
  //    커서 flag로만 남기고 verdict는 안 낮춘다.
  //  - 이름 약함(<0.2) → diff / 강함(≥0.5) 또는 (≥0.34+용량일치) → same / 그 외 maybe
  const hardContradiction = flags.includes("volume_mismatch") || flags.includes("price_3x");
  let verdict: PairSignals["verdict"];
  if (nameScore < 0.2) {
    verdict = "diff";
  } else if (hardContradiction) {
    verdict = "maybe";
  } else if (nameScore >= 0.5 || (nameScore >= 0.34 && volume === "match")) {
    verdict = "same";
  } else {
    verdict = "maybe";
  }

  return {
    name_score: nameScore,
    volume_match: volume,
    category_match: category,
    price_ratio: priceRatio,
    contradiction_flags: flags,
    verdict,
    shared_tokens: shared.slice(0, 8),
  };
}

export type CandidatePair = { a: SkuProduct; b: SkuProduct; signals: PairSignals };

/**
 * 채널 간 후보 쌍 생성 — 다른 채널 제품끼리, 이름 토큰 1개+ 공유하는 쌍만 스코어링(전량 O(N²) 회피).
 * verdict='diff'(이름 약함)는 제외.
 */
export function candidatePairs(
  products: SkuProduct[],
  brandTokens: string[] = [],
): CandidatePair[] {
  // 토큰 역색인
  const tokensById = new Map<string, Set<string>>();
  const index = new Map<string, string[]>();
  for (const p of products) {
    const t = nameTokens(p.name, brandTokens);
    tokensById.set(p.id, t);
    for (const tok of t) {
      const arr = index.get(tok) ?? [];
      arr.push(p.id);
      index.set(tok, arr);
    }
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const pairs: CandidatePair[] = [];
  for (const p of products) {
    const cand = new Set<string>();
    for (const tok of tokensById.get(p.id) ?? []) {
      for (const other of index.get(tok) ?? []) if (other !== p.id) cand.add(other);
    }
    for (const oid of cand) {
      const key = p.id < oid ? `${p.id}|${oid}` : `${oid}|${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = byId.get(oid)!;
      if (o.channel === p.channel) continue; // 채널 간만
      const signals = scorePair(p, o, brandTokens);
      if (signals.verdict === "diff") continue;
      pairs.push({ a: p, b: o, signals });
    }
  }
  return pairs.sort((x, y) => y.signals.name_score - x.signals.name_score);
}
