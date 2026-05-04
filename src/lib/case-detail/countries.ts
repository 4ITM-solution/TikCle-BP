/**
 * 국가 코드 / 권역 매핑.
 *
 * 운영 룰 (2026-05-04 결정):
 * - 케이스 1개 = 1국가. case.country는 단일 국가 코드만.
 * - 권역 (LATAM_ES / LATAM_BR / SEA / MENA)은 view 단위 — cases 리스트 그룹 헤더,
 *   브랜드 페이지의 권역 카드, /cases/compare에서 N개 묶어 보기 등.
 * - 권역 리포트는 그 권역 안 국가 case들의 stats를 합산 (SUM/UNION/AVG는 지표별)
 *   계산. 1개 case만 있으면 그 case = 권역 분석.
 */

export type Region =
  | "AMERICAS"   // US (단일이지만 일관 표기)
  | "EU"
  | "APAC_KR"
  | "APAC_JP"
  | "LATAM_ES"
  | "LATAM_BR"
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
  { code: "EU", flag: "🇪🇺", label: "Europe 통합", region: "EU", currency: "EUR" },

  // LATAM_ES (스페인어권 라틴아메리카)
  { code: "MX", flag: "🇲🇽", label: "Mexico", region: "LATAM_ES", currency: "MXN" },
  { code: "AR", flag: "🇦🇷", label: "Argentina", region: "LATAM_ES", currency: "USD" }, // AR 페소 통제로 Helium10 USD 노출
  { code: "CO", flag: "🇨🇴", label: "Colombia", region: "LATAM_ES", currency: "USD" }, // 동일 (이커머스 USD)
  { code: "CL", flag: "🇨🇱", label: "Chile", region: "LATAM_ES", currency: "USD" },
  { code: "PE", flag: "🇵🇪", label: "Peru", region: "LATAM_ES", currency: "USD" },

  // LATAM_BR (포르투갈어권 — 사실상 BR 단독)
  { code: "BR", flag: "🇧🇷", label: "Brazil", region: "LATAM_BR", currency: "BRL" },

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
  { code: "MENA", flag: "🌍", label: "중동·북아프리카 (시딩 통합)", region: "MENA", currency: "USD" },
  { code: "LATAM_ES", flag: "🌎", label: "스페인어권 라틴 (시딩 통합)", region: "LATAM_ES", currency: "USD" },
];

/**
 * 권역 통합 case로 운영되는 country 코드 (case.country가 이 값이면 옵션 H 모델).
 * - 시딩(contents/meta_ads) = 통합 fetch (country=권역 코드 그대로)
 * - 매출(products/sales) = 자식 country = 진짜 marketplace 국가 (SA/AE/MX/...)
 */
export const REGION_CODES = ["MENA", "LATAM_ES"] as const;
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
  LATAM_ES: "LATAM (스페인어권)",
  LATAM_BR: "LATAM (브라질)",
  SEA: "동남아 (SEA)",
  MENA: "중동·북아프리카 (MENA)",
};

/**
 * 같은 region에 속하는 국가 코드 목록 (권역 리포트 candidate 후보 추출용).
 */
export function countriesInRegion(region: Region): string[] {
  return COUNTRY_OPTIONS.filter((o) => o.region === region).map((o) => o.code);
}
