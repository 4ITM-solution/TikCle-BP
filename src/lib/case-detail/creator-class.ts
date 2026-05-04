/**
 * 동일 브랜드 영상 수 기반 Class 분류.
 * 사용자 메소드론 룰 (2026-05-04):
 *   - Class A: 50개+ 영상 (브랜드와 깊은 반복 협업)
 *   - Class B: 30~49개
 *   - Class C: 10~29개
 *   - 그 외: 분류 없음 (long tail)
 *
 * lemur GMV 호출 없이 Phase 2의 video_count 기반으로 즉시 산출.
 */
export type CreatorClass = "A" | "B" | "C" | null;

export function classifyCreator(videoCount: number): CreatorClass {
  if (videoCount >= 50) return "A";
  if (videoCount >= 30) return "B";
  if (videoCount >= 10) return "C";
  return null;
}

export const CLASS_LABEL: Record<NonNullable<CreatorClass>, string> = {
  A: "Class A · 50+",
  B: "Class B · 30+",
  C: "Class C · 10+",
};

export const CLASS_COLOR: Record<
  NonNullable<CreatorClass>,
  { bg: string; fg: string }
> = {
  A: { bg: "var(--color-pos-soft)", fg: "var(--color-pos)" },
  B: { bg: "var(--color-info-soft)", fg: "var(--color-info)" },
  C: { bg: "var(--color-g50)", fg: "var(--color-g600)" },
};
