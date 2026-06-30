/**
 * 국가 코드 / 권역 매핑.
 *
 * 운영 룰 (2026-05-04, 2026-05-07 LATAM 통합):
 * - 케이스 1개 = 1국가. case.country는 단일 국가 코드만.
 * - 권역 (LATAM / SEA / MENA)은 view 단위 — cases 리스트 그룹 헤더,
 *   브랜드 페이지의 권역 카드, /cases/compare에서 N개 묶어 보기 등.
 * - 권역 리포트는 그 권역 안 국가 case들의 stats를 합산 (SUM/UNION/AVG는 지표별)
 *   계산. 1개 case만 있으면 그 case = 권역 분석.
 * - LATAM은 ES(스페인어권: MX/AR/CO/CL/PE) + BR(포르투갈어) 통합. Exolyt에서
 *   LATAM 검색 시 BR이 자연스럽게 포함되어 분리 운영보다 통합이 실제와 맞음.
 */

export type Region =
  | "AMERICAS"   // US (단일이지만 일관 표기)
  | "EU"
  | "APAC_KR"
  | "APAC_JP"
  | "LATAM"
  | "SEA"
  | "MENA";

export type CountryOption = {
  code: string;
  flag: string;
  label: string;
  region: Region;
  /** 그 마켓플레이스의 default 매출/단가 통화 (Helium10 export 기준). */
  currency: string;
};

/**
 * 신규 case 드롭다운 항목. 운영하면서 분석 시장 추가될 때 여기 추가.
 * 현재는 권역 정의용 + 한국 K-beauty 브랜드 운영 기준 추정 시장 위주.
 */
export const COUNTRY_OPTIONS: CountryOption[] = [
  // 단일 (권역 묶지 않음)
  { code: "US", flag: "🇺🇸", label: "United States", region: "AMERICAS", currency: "USD" },
  { code: "KR", flag: "🇰🇷", label: "Korea", region: "APAC_KR", currency: "KRW" },
  { code: "JP", flag: "🇯🇵", label: "Japan", region: "APAC_JP", currency: "JPY" },

  // EU (유럽) — MENA/LATAM처럼 Hybrid: 개별 국가 단일 case + "EU" 권역 통합 case 둘 다.
  // 개별 국가는 ISO 3166 alpha-2 (Meta Ads Library / YouTube regionCode 인식 기준).
  //   UK는 ISO상 GB — "UK"는 0건 반환되므로 GB 사용.
  { code: "GB", flag: "🇬🇧", label: "United Kingdom", region: "EU", currency: "GBP" },
  { code: "FR", flag: "🇫🇷", label: "France", region: "EU", currency: "EUR" },
  { code: "DE", flag: "🇩🇪", label: "Germany", region: "EU", currency: "EUR" },
  { code: "ES", flag: "🇪🇸", label: "Spain", region: "EU", currency: "EUR" },
  { code: "PL", flag: "🇵🇱", label: "Poland", region: "EU", currency: "PLN" },

  // LATAM (스페인어권 + BR 통합 — Exolyt LATAM export에 BR 자연 포함)
  { code: "MX", flag: "🇲🇽", label: "Mexico", region: "LATAM", currency: "MXN" },
  { code: "AR", flag: "🇦🇷", label: "Argentina", region: "LATAM", currency: "USD" }, // AR 페소 통제로 Helium10 USD 노출
  { code: "CO", flag: "🇨🇴", label: "Colombia", region: "LATAM", currency: "USD" }, // 동일 (이커머스 USD)
  { code: "CL", flag: "🇨🇱", label: "Chile", region: "LATAM", currency: "USD" },
  { code: "PE", flag: "🇵🇪", label: "Peru", region: "LATAM", currency: "USD" },
  { code: "BR", flag: "🇧🇷", label: "Brazil", region: "LATAM", currency: "BRL" },

  // SEA (동남아)
  { code: "SG", flag: "🇸🇬", label: "Singapore", region: "SEA", currency: "SGD" },
  { code: "TH", flag: "🇹🇭", label: "Thailand", region: "SEA", currency: "THB" },
  { code: "MY", flag: "🇲🇾", label: "Malaysia", region: "SEA", currency: "MYR" },
  { code: "ID", flag: "🇮🇩", label: "Indonesia", region: "SEA", currency: "IDR" },
  { code: "PH", flag: "🇵🇭", label: "Philippines", region: "SEA", currency: "PHP" },
  { code: "VN", flag: "🇻🇳", label: "Vietnam", region: "SEA", currency: "VND" },

  // MENA (중동/북아프리카)
  { code: "AE", flag: "🇦🇪", label: "UAE", region: "MENA", currency: "AED" },
  { code: "SA", flag: "🇸🇦", label: "Saudi Arabia", region: "MENA", currency: "SAR" },

  // 권역 통합 case (시딩=권역 통합, 매출=marketplace별 sub).
  // 자기 region이 자기 자신. currency=USD fallback (실 매출은 sub-row의 country별 currency).
  { code: "EU", flag: "🇪🇺", label: "Europe 통합 (UK·FR·DE·ES·PL 시딩 통합)", region: "EU", currency: "EUR" },
  { code: "MENA", flag: "🌍", label: "중동·북아프리카 (시딩 통합)", region: "MENA", currency: "USD" },
  { code: "LATAM", flag: "🌎", label: "라틴아메리카 통합 (ES+BR 시딩 통합)", region: "LATAM", currency: "USD" },
];

/**
 * 권역 통합 case로 운영되는 country 코드 (case.country가 이 값이면 옵션 H 모델).
 * - 시딩(contents/meta_ads) = 통합 fetch (country=권역 코드 그대로)
 * - 매출(products/sales) = 자식 country = 진짜 marketplace 국가 (SA/AE/MX/.../BR)
 */
export const REGION_CODES = ["EU", "MENA", "LATAM"] as const;
export type RegionCode = typeof REGION_CODES[number];

export function isRegionCode(code: string): boolean {
  return (REGION_CODES as readonly string[]).includes(code);
}

/**
 * country → currency. 케이스 country로 default currency 추정용.
 */
export function defaultCurrency(countryCode: string): string {
  return BY_CODE.get(countryCode)?.currency ?? "USD";
}

const BY_CODE = new Map<string, CountryOption>(
  COUNTRY_OPTIONS.map((o) => [o.code, o]),
);

export function countryOption(code: string): CountryOption | null {
  return BY_CODE.get(code) ?? null;
}

export function regionOf(code: string): Region | null {
  return BY_CODE.get(code)?.region ?? null;
}

export const REGION_LABEL: Record<Region, string> = {
  AMERICAS: "Americas",
  EU: "Europe",
  APAC_KR: "Korea",
  APAC_JP: "Japan",
  LATAM: "LATAM (라틴아메리카, BR 포함)",
  SEA: "동남아 (SEA)",
  MENA: "중동·북아프리카 (MENA)",
};

/**
 * 같은 region에 속하는 국가 코드 목록 (권역 리포트 candidate 후보 추출용).
 */
export function countriesInRegion(region: Region): string[] {
  return COUNTRY_OPTIONS.filter((o) => o.region === region).map((o) => o.code);
}
