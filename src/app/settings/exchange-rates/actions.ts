"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";
import type { ExchangeRates } from "@/lib/case-detail/exchange-rates";

export type SaveResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const ALLOWED_CURRENCIES = [
  "USD", "KRW", "JPY", "EUR", "SAR", "AED", "MXN", "BRL",
  "SGD", "THB", "MYR", "IDR", "PHP", "VND",
];

export async function saveExchangeRates(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const next: ExchangeRates = {};
  for (const c of ALLOWED_CURRENCIES) {
    const raw = formData.get(c);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: `${c} 환율 값이 유효하지 않음 (양수 number 필요): ${raw}` };
    }
    next[c] = n;
  }
  next.USD = 1;

  const supabase = await createServer();
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "exchange_rates", value: next as unknown, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: `환율 저장 실패: ${error.message}` };

  // 환율 변경은 모든 케이스 표시에 영향
  revalidatePath("/cases", "layout");
  return { ok: true, message: "저장 완료. 케이스 페이지에서 새 환율로 환산됨." };
}
