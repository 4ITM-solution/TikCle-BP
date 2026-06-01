"use client";

import { useState, useTransition } from "react";
import { runIgProfileScrape } from "@/app/cases/[id]/upload-actions";

/**
 * Phase 4c.5 — IG profile scraper 호출 박스.
 *
 * ig_authors 의 followers IS NULL row 의 username 다 모아 Apify
 * apify/instagram-profile-scraper 호출 → followers / following / bio / external_url
 * / verified / is_business_account / linked_handles 박힘.
 *
 * 효과:
 *   1. IG tier 분류 가능 (지금은 followers NULL 다수 → unknown)
 *   2. bio + external_url 안 TK / YT 핸들 추출 → cross-platform 매칭 정확도 점프
 */
export function IgProfileScrapeBox({
  case_id,
  authorsTotal,
  authorsWithFollowers,
}: {
  case_id: string;
  authorsTotal: number;
  authorsWithFollowers: number;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const missing = Math.max(0, authorsTotal - authorsWithFollowers);
  const estCost = missing * 0.005;

  function runScrape(rescrape_all: boolean) {
    const target = rescrape_all ? authorsTotal : missing;
    if (target === 0) {
      window.alert("대상 author 없음");
      return;
    }
    const cost = target * 0.005;
    if (!window.confirm(`${target}명 author profile 박기 — 비용 ~$${cost.toFixed(2)} (Apify instagram-profile-scraper). 진행?`)) return;
    start(async () => {
      const r = await runIgProfileScrape(case_id, { rescrape_all });
      setMsg(r.ok ? { type: "ok", text: r.message } : { type: "err", text: r.error });
    });
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        background: "#eff6ff",
        border: "1px solid #3b82f6",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#1d4ed8" }}>
        📷 Phase 4c.5 — IG author profile 박기 (follower / bio / cross-channel 링크)
      </div>
      <div style={{ fontSize: 11, color: "#1e40af", marginBottom: 8, lineHeight: 1.6 }}>
        Apify instagram-profile-scraper 가 각 author 의 follower / bio / external_url 박음.
        <br />
        효과: ① IG tier 분류 가능 ② bio + URL 안 TK/YT/X 핸들 추출 → cross-platform 매칭 강화.
        <br />
        <b>현재 상태</b>: 전체 {authorsTotal.toLocaleString()}명 중 follower 박힘 {authorsWithFollowers.toLocaleString()}명 · 미박힘 {missing.toLocaleString()}명.
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => runScrape(false)}
          disabled={pending || missing === 0}
          style={{
            fontSize: 11,
            padding: "5px 12px",
            border: "1px solid #1d4ed8",
            borderRadius: 4,
            background: "#1d4ed8",
            color: "white",
            cursor: pending || missing === 0 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            fontWeight: 700,
            opacity: pending || missing === 0 ? 0.5 : 1,
          }}
        >
          {pending ? "처리 중…" : `↻ 미박힘 ${missing}명 박기 (~$${estCost.toFixed(2)})`}
        </button>
        <button
          type="button"
          onClick={() => runScrape(true)}
          disabled={pending}
          style={{
            fontSize: 11,
            padding: "5px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            background: "white",
            color: "#6b7280",
            cursor: pending ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
          title="이미 박힌 author 도 다시 scrape (follower 갱신)"
        >
          전체 {authorsTotal}명 재scrape (~${(authorsTotal * 0.005).toFixed(2)})
        </button>
      </div>
      {msg && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            padding: "5px 10px",
            borderRadius: 4,
            background: msg.type === "ok" ? "#d1fae5" : "#fee2e2",
            color: msg.type === "ok" ? "#065f46" : "#991b1b",
            fontWeight: 600,
          }}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}
    </div>
  );
}
