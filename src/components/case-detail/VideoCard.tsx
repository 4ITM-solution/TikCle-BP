"use client";

import { useState } from "react";

/**
 * ★ FE-8 Stage8 (프로토 v12 vidCard 1:1) — 표준 영상 카드.
 * 좌: 세로(9:16) 임베드(클릭 로드 실 iframe) · 우: 제목 + 지표 6종.
 * 모든 영상 노출 지점(A 변곡점·B top·C 클러스터/키메시지·D BSR·E 원본)에서 공통 사용.
 *
 * 지표 6종: 조회·좋아요·댓글·저장·저장율·댓글율.
 * - 없는 값(NULL)은 "—" (0 아님 — 카로데이터 유입·IG -1 등 측정불가 구분, 데이터계약 B·C 규칙)
 * - 저장율/댓글율 = 값/조회. 조회 0이거나 분자 NULL이면 "—"
 */

export type VideoMetrics = {
  /** 조회수 */
  views?: number | null;
  /** 좋아요 */
  likes?: number | null;
  /** 댓글수 */
  comments?: number | null;
  /** 저장수 */
  saves?: number | null;
};

const fmtV = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : `${n}`;
const fmtN = (n: number) => n.toLocaleString();

function parseTikTokId(url: string): string | null {
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] && /tiktok\.com/i.test(url) ? m[1] : null;
}

export function VideoCard({
  title,
  url,
  metrics,
}: {
  title: string;
  url: string;
  metrics: VideoMetrics;
}) {
  const [loaded, setLoaded] = useState(false);
  const v = metrics.views ?? 0;
  const lk = metrics.likes ?? null;
  const cm = metrics.comments ?? null;
  const sv = metrics.saves ?? null;
  const rate = (a: number | null) => (a == null || v === 0 ? "—" : `${((a / v) * 100).toFixed(2)}%`);
  const tkId = parseTikTokId(url);

  const row = (lab: string, val: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "#6b7280" }}>{lab}</span>
      <b style={{ fontFamily: "var(--font-mono, monospace)" }}>{val}</b>
    </div>
  );

  return (
    <div
      style={{
        display: "flex", gap: 10, border: "1px solid #e5e7eb", borderRadius: 8,
        padding: 8, background: "#fff", minWidth: 0,
      }}
    >
      {/* 세로 임베드 (9:16) — 클릭 로드 */}
      <div style={{ flex: "0 0 86px" }}>
        {tkId && loaded ? (
          <iframe
            src={`https://www.tiktok.com/embed/v2/${tkId}`}
            title={title}
            loading="lazy"
            allowFullScreen
            allow="encrypted-media"
            style={{ width: 86, height: 152, border: "none", borderRadius: 6 }}
          />
        ) : tkId ? (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            title="영상 미리보기"
            style={{
              width: 86, height: 152, borderRadius: 6, border: "none", cursor: "pointer",
              background: "repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 8px,#e5e7eb 8px,#e5e7eb 16px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: "#9ca3af",
            }}
          >
            ▶
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="영상 열기"
            style={{
              width: 86, height: 152, borderRadius: 6,
              background: "repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 8px,#e5e7eb 8px,#e5e7eb 16px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "#6b7280", textDecoration: "underline",
            }}
          >
            열기 ↗
          </a>
        )}
      </div>
      {/* 지표 6종 */}
      <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{ fontWeight: 700, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={title}
        >
          {title}
        </div>
        {row("조회", fmtV(v))}
        {row("좋아요", lk == null ? "—" : fmtV(lk))}
        {row("댓글", cm == null ? "—" : fmtN(cm))}
        {row("저장", sv == null ? "—" : fmtN(sv))}
        {row("저장율", rate(sv))}
        {row("댓글율", rate(cm))}
      </div>
    </div>
  );
}
