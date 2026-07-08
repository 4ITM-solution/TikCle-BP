/**
 * ★ C4(WS4b): 적재 위저드 체크리스트 — 케이스 channel×country 기반 수동 재료 목록.
 * spec §0.1 / ws-4a intake 목업 이식(실데이터 연동). 추정 금지 — done 은 실제 적재 신호.
 */

export type IntakeItem = {
  key: string;
  label: string;
  /** 어디서 받는지 (도구명 노출 의도적 — 사용자 안내 목적, U3 예외) */
  source: string;
  /** 무엇을/어떻게 */
  howTo: string;
  etaMinutes: number;
  done: boolean;
  rowNote?: string;
};

export type IntakeStatus = {
  channel: string | null;
  country: string;
  contentCount: number;
  salesExists: boolean;
  hasBsr: boolean;
  storeUrl: boolean;
  skuExists: boolean;
};

export function buildIntakeChecklist(s: IntakeStatus): IntakeItem[] {
  const items: IntakeItem[] = [];

  // TikTok 유기 영상 — 거의 모든 케이스 공통 재료
  items.push({
    key: "exolyt",
    label: "① Exolyt 영상 CSV (TikTok 유기 발행)",
    source: "exolyt.com → 브랜드 키워드 검색 → CSV Export",
    howTo: "브랜드 키워드로 영상 목록 검색 후 CSV 내보내기",
    etaMinutes: 5,
    done: s.contentCount > 0,
    rowNote: s.contentCount > 0 ? `${s.contentCount.toLocaleString()}건 적재됨` : undefined,
  });

  if (s.channel === "amazon") {
    items.push({
      key: "helium",
      label: "② Helium10 30일 매출 CSV",
      source: "Helium10 → Manage Inventory → Export",
      howTo: "30일 매출/단가/재고 내보내기",
      etaMinutes: 5,
      done: s.salesExists,
    });
    items.push({
      key: "keepa",
      label: "③ Keepa BSR CSV",
      source: "Keepa → Product Finder → BSR 히스토리 Export",
      howTo: "제품 BSR 히스토리 내보내기(변곡점 분석용)",
      etaMinutes: 5,
      done: s.hasBsr,
    });
  } else if (s.channel === "tiktok_shop" && s.country === "US") {
    items.push({
      key: "affiliate",
      label: "② TikTok Shop 스토어 URL 또는 Affiliate CSV",
      source: "TikTok Shop Seller Center → Affiliate → Export",
      howTo: "스토어 URL 입력 또는 어필리에이트 영상 CSV",
      etaMinutes: 5,
      done: s.storeUrl || s.contentCount > 0,
    });
  } else if (s.channel === "tiktok_shop") {
    items.push({
      key: "kalodata",
      label: "② Kalodata 영상·크리에이터 텍스트 (SEA)",
      source: "kalodata.com → 브랜드 검색 → 표 복사",
      howTo: "영상/크리에이터/매출 표 텍스트 붙여넣기",
      etaMinutes: 10,
      done: s.skuExists,
    });
  } else if (s.channel === "shopee") {
    items.push({
      key: "shopdora",
      label: "② Shopdora 매출 텍스트",
      source: "shopdora → 브랜드 → 표 복사",
      howTo: "매출 표 텍스트 붙여넣기",
      etaMinutes: 10,
      done: s.skuExists,
    });
  }

  return items;
}
