/**
 * Apify lemur/tiktok-shop-creators 호출 래퍼.
 *
 * 입력: TikTok handle 리스트
 * 출력: handle별 isShopCreator 판별 결과
 *
 * Phase 3.7에서 사용 — tiktok_shop 케이스의 인플 중 Shop creator만 필터링용.
 *
 * 단가: ~$0.005/check (mockup 기준 $2.00 / 400명)
 */

const ACTOR_ID = "lemur~tiktok-shop-creators";
const SYNC_TIMEOUT_SEC = 60; // 핸들 1개당 최대 60초
const COST_PER_CHECK = 0.005;
const CONCURRENCY = 8; // 동시 호출 수 (actor가 username 단수형이라 핸들별 1run)

export type LemurShopCreatorItem = {
  handle: string; // 입력한 handle (lowercased)
  is_shop_creator: boolean;
  shop_creator_class: string | null; // 가능하면 분류 (e.g., "official", "affiliate")
  user_id: string | null; // TikTok user_id (있으면)
};

export type LemurResult = {
  items: LemurShopCreatorItem[];
  cost_estimate_usd: number;
  raw_count: number;
  skipped_reason?: string;
  // 디버그 — 첫 응답 그대로 (필드명 확인용)
  debug_first_item_keys?: string[];
  debug_first_item_sample?: string;
};

/**
 * Handle 리스트를 lemur에 보내 Shop creator 여부 판별.
 */
export async function checkShopCreators(opts: {
  handles: string[];
}): Promise<LemurResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      items: [],
      cost_estimate_usd: 0,
      raw_count: 0,
      skipped_reason: "APIFY_TOKEN 미설정",
    };
  }
  if (opts.handles.length === 0) {
    return {
      items: [],
      cost_estimate_usd: 0,
      raw_count: 0,
      skipped_reason: "handle 0개",
    };
  }

  // Handle 정규화 (소문자 + @ 제거)
  const normalized = opts.handles
    .map((h) => h.replace(/^@/, "").toLowerCase().trim())
    .filter(Boolean);

  // 첫 응답 캡처 (필드명 확인용)
  let debug_first_item_keys: string[] | undefined;
  let debug_first_item_sample: string | undefined;

  // 동시 N개 호출
  const allItems: LemurShopCreatorItem[] = [];
  let rawCount = 0;

  for (let i = 0; i < normalized.length; i += CONCURRENCY) {
    const slice = normalized.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((handle) => callActorOne(token, handle)),
    );
    for (let j = 0; j < results.length; j += 1) {
      const r = results[j];
      const handle = slice[j]!;
      if (r?.status !== "fulfilled") {
        const err = r?.status === "rejected" ? r.reason : "unknown";
        console.warn(
          `[lemur] handle "${handle}" failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      // 첫 raw item 캡처
      if (!debug_first_item_keys && r.value.firstRaw) {
        debug_first_item_keys = Object.keys(r.value.firstRaw).slice(0, 30);
        debug_first_item_sample = JSON.stringify(r.value.firstRaw).slice(0, 800);
      }
      allItems.push(...r.value.items);
      rawCount += r.value.raw_count;
    }
  }

  return {
    items: allItems,
    cost_estimate_usd: rawCount * COST_PER_CHECK,
    raw_count: rawCount,
    debug_first_item_keys,
    debug_first_item_sample,
  };
}

async function callActorOne(
  token: string,
  handle: string,
): Promise<{
  items: LemurShopCreatorItem[];
  raw_count: number;
  firstRaw?: Record<string, unknown>;
}> {
  const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${SYNC_TIMEOUT_SEC}`;
  const body = { username: handle };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`lemur actor ${response.status}: ${text.slice(0, 300)}`);
  }

  const raw = (await response.json()) as unknown[];
  const firstRaw =
    raw[0] && typeof raw[0] === "object"
      ? (raw[0] as Record<string, unknown>)
      : undefined;

  const items = raw
    .map((r) => mapItem(r, handle))
    .filter((x): x is LemurShopCreatorItem => x !== null);

  return { items, raw_count: raw.length, firstRaw };
}

function mapItem(
  raw: unknown,
  fallbackHandle: string,
): LemurShopCreatorItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const handleRaw =
    (r.handle as string | undefined) ??
    (r.username as string | undefined) ??
    (r.uniqueId as string | undefined) ??
    (r.unique_id as string | undefined) ??
    fallbackHandle;
  const handle =
    typeof handleRaw === "string" && handleRaw ? handleRaw : fallbackHandle;

  // 이 actor는 Shop creator만 반환하므로 응답 존재 자체가 확정 신호.
  // (응답에 is_shop_creator 같은 boolean 필드 없음 — 명시적 boolean이 있으면 우선 사용)
  const explicit =
    r.is_shop_creator ??
    r.isShopCreator ??
    r.shop_creator ??
    r.isShop ??
    r.is_shop;
  const is_shop_creator =
    typeof explicit === "boolean"
      ? explicit
      : typeof explicit === "string"
        ? explicit.toLowerCase() === "true" || explicit === "1"
        : true; // 기본값: 응답 존재 = Shop creator

  // shop_creator_class: stats.categories[0] (TikTok 카테고리 코드) 또는 명시 필드
  let shop_creator_class: string | null = null;
  const stats = r.stats as Record<string, unknown> | undefined;
  const categories = stats?.categories as unknown;
  if (Array.isArray(categories) && categories.length > 0) {
    shop_creator_class = categories
      .filter((x): x is string | number => typeof x === "string" || typeof x === "number")
      .map(String)
      .slice(0, 3)
      .join(",");
  }
  if (!shop_creator_class) {
    const cls =
      (r.shop_creator_class as string | undefined) ??
      (r.shopCreatorClass as string | undefined) ??
      (r.creator_class as string | undefined) ??
      (r.class as string | undefined);
    if (typeof cls === "string") shop_creator_class = cls;
  }

  // user_id 찾기: 응답에 명시 없을 수도 있음
  const user_id =
    (r.user_id as string | number | undefined) ??
    (r.userId as string | number | undefined) ??
    (r.id as string | number | undefined) ??
    null;

  return {
    handle: handle.replace(/^@/, "").toLowerCase().trim(),
    is_shop_creator,
    shop_creator_class,
    user_id: user_id != null ? String(user_id) : null,
  };
}
