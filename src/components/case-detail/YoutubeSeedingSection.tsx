"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchYoutubeSeeding } from "@/app/cases/[id]/upload-actions";

/**
 * YouTube Data API v3로 시딩 영상 검색 + BP에 적재.
 *
 * 사용자가 키워드 N개 입력 → 각 키워드별 Top 50 영상 검색 (date 순) →
 * contents·influencers 업서트 + cases.key_stats.youtube_seeding_runs 누적.
 *
 * Quota: 키워드당 ~102 units. 일일 10K 무료 → 케이스당 키워드 3-5개 적절.
 */
export function YoutubeSeedingSection({
  case_id,
  existingRuns,
}: {
  case_id: string;
  existingRuns: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [keywords, setKeywords] = useState("");
  const [maxResults, setMaxResults] = useState("50");
  const [order, setOrder] = useState<"date" | "relevance" | "viewCount">(
    "date",
  );
  const [publishedAfter, setPublishedAfter] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function submit() {
    if (!keywords.trim()) {
      setMsg({ type: "err", text: "키워드 입력 필요" });
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.append("keywords", keywords);
      fd.append("max_results", maxResults);
      fd.append("order", order);
      if (publishedAfter) {
        fd.append(
          "published_after",
          `${publishedAfter}T00:00:00Z`,
        );
      }
      const r = await fetchYoutubeSeeding(case_id, fd);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="field">
      <label className="field-label">
        YouTube 시딩 영상 자동 수집 (YouTube Data API v3)
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        키워드별 YouTube Top N 영상 자동 검색 → contents/influencers/key_stats
        적재. <b>BP 시스템의 TikTok-only 한계를 YouTube까지 확장</b>. Quota: 키워드당
        ~102 units (일일 10K 무료).
        {existingRuns > 0 && (
          <span
            style={{
              marginLeft: 6,
              color: "var(--color-pos)",
              fontWeight: 600,
            }}
          >
            ✓ {existingRuns}회 실행됨
          </span>
        )}
      </span>

      <div
        style={{
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          📌 키워드 여러 개면 줄바꿈 또는 쉼표로 분리. 예시: <br />
          <code
            style={{
              fontSize: 10,
              background: "white",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            Ninja CREAMi review{"\n"}Ninja Swirl{"\n"}Ninja Slushi unboxing
          </code>
        </div>

        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="키워드 (줄바꿈 또는 쉼표 분리)"
          rows={3}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "8px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 4,
            resize: "vertical",
            background: "white",
            marginBottom: 8,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 10,
            flexWrap: "wrap",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
          }}
        >
          <span style={{ color: "var(--color-g600)" }}>키워드당 영상</span>
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
          </select>

          <span style={{ color: "var(--color-g600)" }}>정렬</span>
          <div style={{ display: "flex", gap: 4 }}>
            {(["date", "viewCount", "relevance"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  padding: "4px 9px",
                  borderRadius: 4,
                  border: `1px solid ${order === o ? "var(--color-ink)" : "var(--color-g200)"}`,
                  background: order === o ? "var(--color-ink)" : "white",
                  color: order === o ? "white" : "var(--color-g600)",
                  cursor: "pointer",
                }}
              >
                {o === "date" ? "최신순" : o === "viewCount" ? "조회수" : "관련도"}
              </button>
            ))}
          </div>

          <span style={{ color: "var(--color-g600)" }}>출시 이후</span>
          <input
            type="date"
            value={publishedAfter}
            onChange={(e) => setPublishedAfter(e.target.value)}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
            }}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !keywords.trim()}
          className="btn"
          style={{
            background: "var(--color-ink)",
            color: "white",
            padding: "6px 14px",
            fontSize: 12,
            borderRadius: 5,
            border: "none",
            cursor: "pointer",
            opacity: pending || !keywords.trim() ? 0.5 : 1,
          }}
        >
          {pending ? "검색 중…" : "YouTube 검색 + 적재"}
        </button>

        {msg && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color:
                msg.type === "ok"
                  ? "var(--color-pos)"
                  : "var(--color-accent)",
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            {msg.type === "ok" ? "✓ " : "✕ "}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
