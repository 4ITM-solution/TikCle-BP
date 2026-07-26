"use client";

import { useEffect, useState } from "react";
import { fetchCreatorProfile } from "@/app/cases/[id]/combo-actions";
import type { CreatorProfile } from "@/lib/case-detail/combo-queries";

/**
 * ★ FE-8 Stage4(B, v12): 크리에이터 드로어 — 우측 슬라이드 패널.
 * creatorProfile(BE-31): 풀 내 평균뷰 백분위 · 스파크 편수(is_ad) · 메타 사용 구분(파트너십 확정/후보) · 활동기간 · 반응률.
 */
export function CreatorDrawer({
  caseId,
  handle,
  onClose,
}: {
  caseId: string;
  handle: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setProfile(null);
    setLoading(true);
    let alive = true;
    fetchCreatorProfile(caseId, handle)
      .then((p) => { if (alive) setProfile(p); })
      .catch(() => { if (alive) setProfile(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [caseId, handle]);

  if (!handle) return null;

  const row = (label: string, val: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <b style={{ fontFamily: "var(--font-mono, monospace)" }}>{val}</b>
    </div>
  );

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 360, maxWidth: "90vw", background: "#fff", zIndex: 51, boxShadow: "-4px 0 24px rgba(0,0,0,.15)", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <b style={{ fontSize: 15 }}>@{handle}</b>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>불러오는 중…</div>
        ) : !profile ? (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>프로필 데이터 없음 (TikTok 인플 기준).</div>
        ) : (
          <div>
            {row("영상 수", profile.video_count.toLocaleString())}
            {row("최고 조회", profile.max_views.toLocaleString())}
            {row("평균 조회", Math.round(profile.avg_views).toLocaleString())}
            {row("풀 내 백분위", profile.percentile != null ? `상위 ${(100 - profile.percentile).toFixed(0)}%` : "—")}
            {row("반응률(댓글/1만뷰)", profile.reaction_rate != null ? profile.reaction_rate.toFixed(1) : "—")}
            {row("스파크애즈 집행 편수", `${profile.spark_ad_count.toLocaleString()}편`)}
            {row("채널", profile.channels.map((c) => c.toUpperCase()).join(" · ") || "—")}
            {row("활동 기간", `${profile.activity_period.first ?? "?"} ~ ${profile.activity_period.last ?? "?"}`)}
            <div style={{ marginTop: 14, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>메타 광고 사용</div>
              <div style={{ fontSize: 11, color: "#374151", display: "flex", flexDirection: "column", gap: 4 }}>
                <span>파트너십 라벨 확정: <b>{profile.meta_match.partnership_confirmed}</b>건</span>
                <span style={{ color: "#5b21b6" }}>원본 후보(캡션 대조): <b>{profile.meta_match.original_candidates}</b>건 <span style={{ color: "#9ca3af" }}>· 확정 전</span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
