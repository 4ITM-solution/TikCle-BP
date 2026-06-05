"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import {
  DEFAULT_PRICING,
  DEFAULT_PRODUCT_PRICING,
  PRICING_TIERS,
  PRODUCT_TYPES,
  type ProductPricing,
  type SeedingPricing,
} from "@/lib/diagnose/pricing";

export type SaveResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function saveSeedingPricing(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const tierCost = { ...DEFAULT_PRICING.tierCost };
  for (const { tier, label } of PRICING_TIERS) {
    const raw = formData.get(tier);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    // 콤마 허용 ("15,000,000")
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${label} 단가 값이 유효하지 않음 (0 이상 숫자): ${raw}` };
    }
    tierCost[tier] = n;
  }

  const value: SeedingPricing = { tierCost };
  const supabase = await createServer();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: "diagnose_pricing",
        value: value as unknown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: `단가 저장 실패: ${error.message}` };

  revalidatePath("/diagnose");
  return { ok: true, message: "저장 완료. 진단서 예산별 실행 규모에 새 단가가 반영됩니다." };
}

export async function saveProductPricing(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const value = { ...DEFAULT_PRODUCT_PRICING } as ProductPricing;
  for (const { key, label } of PRODUCT_TYPES) {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${label} 단가 값이 유효하지 않음: ${raw}` };
    }
    value[key] = n;
  }

  const supabase = await createServer();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: "diagnose_product_pricing",
        value: value as unknown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: `상품 단가 저장 실패: ${error.message}` };

  revalidatePath("/diagnose");
  return { ok: true, message: "저장 완료. 진단서 마일스톤 견적에 반영됩니다." };
}
