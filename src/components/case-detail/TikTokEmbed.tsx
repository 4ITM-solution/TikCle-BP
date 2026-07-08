"use client";

import { useState } from "react";

/**
 * ★ C2(WS4b): TikTok 영상 인라인 임베드 (embed v2). ws-4a-screens 의 TikTokEmbed 이식 —
 * 단, 페이지에 iframe 여러 개가 한 번에 뜨면 무거워 **클릭 시 로드**(lazy) 방식으로 개선.
 * 임베드 불가(비-tiktok / video·photo id 없음) → 새 탭 링크 폴백.
 */
export function TikTokEmbed({
  url,
  title,
  compact,
}: {
  url: string;
  title?: string;
  /** true 면 작은 미리보기 버튼(리스트 인라인용) */
  compact?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  const embeddable = !!m?.[1] && /tiktok\.com/i.test(url);

  if (!embeddable) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 11, color: "#3b82f6", textDecoration: "underline" }}
      >
        영상 열기 ↗
      </a>
    );
  }

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        title={title ?? url}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: compact ? "3px 8px" : "8px 12px",
          fontSize: compact ? 11 : 12,
          background: "#111827", color: "white", border: "none",
          borderRadius: 6, cursor: "pointer",
        }}
      >
        ▶ 영상 미리보기
      </button>
    );
  }

  return (
    <div style={{ position: "relative", width: compact ? 240 : 300, maxWidth: "100%" }}>
      <iframe
        src={`https://www.tiktok.com/embed/v2/${m![1]}`}
        title={title ?? url}
        loading="lazy"
        allowFullScreen
        allow="encrypted-media"
        style={{ width: "100%", height: compact ? 400 : 560, border: "1px solid #e5e7eb", borderRadius: 8 }}
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 4, fontSize: 10, color: "#6b7280", textDecoration: "underline" }}
      >
        새 탭에서 열기 ↗
      </a>
    </div>
  );
}
