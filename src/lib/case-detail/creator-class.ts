/**
 * Class A~E 분류 — bp-playbook 메소드론 (classify_creators.py) 그대로.
 *
 * Shop creator 여부 + PROMOTED 영상 수 기반:
 *   A: Shop creator + promoted ≥ 5      (반복 협업 슈퍼 affiliate)
 *   B: Shop creator + promoted 2~4      (정기 협업)
 *   C: Shop creator + promoted = 1      (단발 협업)
 *   D: not Shop + promoted ≥ 1          (외부 직접 딜 — Organic은 아님)
 *   E: 그 외                            (long tail / 미분류)
 *
 * "promoted 영상" = contents.is_ad = true 또는 Exolyt 'promoted' 컬럼.
 * Shop creator = influencers.is_tiktok_shop_creator = true.
 *
 * 📌 옛 영상 수 50/30/10 (Class A/B/C)는 보조 라벨로 따로 둠. 메소드론 정공법은 이거.
 */
export type CreatorClass = "A" | "B" | "C" | "D" | "E";

export function classifyCreator(
  isShopCreator: boolean | null,
  promotedCount: number,
): CreatorClass {
  if (isShopCreator === true) {
    if (promotedCount >= 5) return "A";
    if (promotedCount >= 2) return "B";
    if (promotedCount === 1) return "C";
    return "E"; // shop이지만 promoted 0 — long tail
  }
  if (promotedCount >= 1) return "D";
  return "E";
}

export const CLASS_LABEL: Record<CreatorClass, string> = {
  A: "Class A · Shop+5+",
  B: "Class B · Shop+2~4",
  C: "Class C · Shop+1",
  D: "Class D · 직접 딜",
  E: "Class E · long tail",
};

export const CLASS_COLOR: Record<CreatorClass, { bg: string; fg: string }> = {
  A: { bg: "var(--color-pos-soft)", fg: "var(--color-pos)" },
  B: { bg: "var(--color-info-soft)", fg: "var(--color-info)" },
  C: { bg: "var(--color-warn-soft)", fg: "var(--color-warn)" },
  D: { bg: "var(--color-g50)", fg: "var(--color-g600)" },
  E: { bg: "var(--color-g25)", fg: "var(--color-g400)" },
};

/**
 * 옛 영상 수 기반 보조 분류 (legacy — UI 보조 라벨용).
 * - heavy: 50+ 영상
 * - mid: 30~49
 * - light: 10~29
 */
export function classifyByVideoCount(
  videoCount: number,
): "heavy" | "mid" | "light" | null {
  if (videoCount >= 50) return "heavy";
  if (videoCount >= 30) return "mid";
  if (videoCount >= 10) return "light";
  return null;
}
