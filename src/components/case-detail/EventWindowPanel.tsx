"use client";

import { useState } from "react";
import { VideoCard } from "@/components/case-detail/VideoCard";
import type { EventWindowResult, EventPhaseStats } from "@/lib/case-detail/combo-queries";

/**
 * ★ FE-8 Stage3(A, v12): 이벤트 윈도우 (전·중·후).
 * promotion_events 등록 이벤트별 전(2주)/중/후 시딩·광고·BSR 요약 + 대표 영상.
 * 데이터 = eventWindow(BE-31, 기존 테이블 재조회, $0). 미등록/무데이터 시 빈 상태 + 등록 안내.
 */
export function EventWindowPanel({ windows }: { windows: EventWindowResult[] }) {
  const [sel, setSel] = useState(0);
  if (windows.length === 0) {
    return (
      <div style={{ padding: 16, background: "#fffbeb", border: "1px dashed #fcd34d", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
        등록된 이벤트가 없습니다 — 프로모션 이벤트(프라임데이·블프 등)를 등록하면 전·중·후 시딩/광고/BSR 변화를 자동 분해합니다.
        <div style={{ fontSize: 10.5, color: "#b45309", marginTop: 6 }}>
          등록은 케이스 설정에서. 미국 프리셋(Prime Day·Black Friday 등)은 자동 포함됩니다.
        </div>
      </div>
    );
  }
  const w = windows[Math.min(sel, windows.length - 1)]!;
  const phases: Array<{ key: "before" | "during" | "after"; label: string; stats: EventPhaseStats }> = [
    { key: "before", label: "전 (2주)", stats: w.before },
    { key: "during", label: "중", stats: w.during },
    { key: "after", label: "후 (2주)", stats: w.after },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      {/* 이벤트 선택 */}
      {windows.length > 1 && (
        <div className="ch-toggle" style={{ marginBottom: 10 }}>
          {windows.map((ev, i) => (
            <button key={ev.event.id} type="button" className={sel === i ? "active" : ""} onClick={() => setSel(i)}>
              {ev.event.name ?? ev.event.start_date}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
        <b>{w.event.name ?? "이벤트"}</b> {w.event.start_date} ~ {w.event.end_date} — 전/중/후 시딩·광고·BSR
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {phases.map((p) => (
          <div key={p.key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: p.key === "during" ? "#f5f3ff" : "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: p.key === "during" ? "#5b21b6" : "#374151", marginBottom: 8 }}>{p.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
              <Row label="시딩 영상" val={p.stats.seeding_count.toLocaleString()} />
              <Row label="신규 광고" val={p.stats.new_ads.toLocaleString()} />
              <Row label="활성 광고" val={p.stats.active_ads.toLocaleString()} />
              <Row label="BSR 최고" val={p.stats.bsr_best != null ? `#${p.stats.bsr_best.toLocaleString()}` : "—"} />
            </div>
            {p.stats.top_videos.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {p.stats.top_videos.slice(0, 2).map((v, i) => (
                  <VideoCard
                    key={`${p.key}-${i}`}
                    title={v.caption ?? "영상"}
                    url={v.url}
                    metrics={{ views: v.views, likes: v.likes, comments: v.comments, saves: v.saves }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <b style={{ fontFamily: "var(--font-mono, monospace)" }}>{val}</b>
    </div>
  );
}
