"use server";

import { createServer } from "@/lib/supabase/server";
import {
  inflectionTopVideos,
  creatorProfile,
  type VideoCard,
  type CreatorProfile,
} from "@/lib/case-detail/combo-queries";

/**
 * ★ FE-8 Stage3~5: 인터랙티브 combo-queries 서버 액션 (온디맨드).
 * 변곡점 표 행 확장·크리에이터 드로어처럼 선택 시점에만 조회 — 전량 프리페치 회피.
 */

export async function fetchInflectionVideos(
  caseId: string,
  month: string,
  sortBy: "views" | "comments" | "saves",
): Promise<VideoCard[]> {
  const supabase = await createServer();
  return inflectionTopVideos(supabase, caseId, month, sortBy);
}

export async function fetchCreatorProfile(
  caseId: string,
  handle: string,
): Promise<CreatorProfile | null> {
  const supabase = await createServer();
  return creatorProfile(supabase, caseId, handle);
}
