"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 케이스 분석이 백그라운드(Inngest)로 진행 중일 때 page server component를
 * 일정 간격으로 router.refresh() 트리거. status가 'ready'/'draft'로 바뀌면
 * 자식 props가 변하므로 enabled가 false로 전달되어 polling 중단.
 *
 * 비활성 탭(document.hidden)에서는 polling 안 함 — 백그라운드 비용 절약.
 */
export function AutoRefresh({
  enabled,
  intervalMs = 5000,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
