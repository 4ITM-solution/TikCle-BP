"use server";

import { revalidatePath } from "next/cache";
import { createServer } from "@/lib/supabase/server";

function parseKrw(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw.replace(/[,\s원]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fields(formData: FormData) {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    name: str("name") ?? "(이름 없음)",
    tagline: str("tagline"),
    price_label: str("price_label"),
    price_krw: parseKrw(formData.get("price_krw")),
    duration: str("duration"),
    includes: str("includes"),
    target_situation: str("target_situation"),
    sort_order: Number(formData.get("sort_order")) || 0,
    active: formData.get("active") === "on",
  };
}

export async function createPackage(formData: FormData): Promise<void> {
  const supabase = await createServer();
  // 생성된 타입에 신규 테이블 미반영(stale) → as never 우회
  await supabase.from("seeding_packages").insert(fields(formData) as never);
  revalidatePath("/settings/packages");
}

export async function updatePackage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await createServer();
  await supabase
    .from("seeding_packages")
    .update({ ...fields(formData), updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  revalidatePath("/settings/packages");
}

export async function deletePackage(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const supabase = await createServer();
  await supabase.from("seeding_packages").delete().eq("id", id);
  revalidatePath("/settings/packages");
}
