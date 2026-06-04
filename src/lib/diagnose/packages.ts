/** TikCle가 파는 시딩 패키지(상품) 카탈로그 레코드. */
export type SeedingPackage = {
  id: string;
  name: string;
  tagline: string | null;
  price_label: string | null;
  price_krw: number | null;
  duration: string | null;
  includes: string | null;
  target_situation: string | null;
  sort_order: number;
  active: boolean;
};
