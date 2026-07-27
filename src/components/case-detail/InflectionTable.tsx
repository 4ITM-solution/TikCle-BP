"use client";

import { useState } from "react";
import { VideoCard } from "@/components/case-detail/VideoCard";
import { fetchInflectionVideos } from "@/app/cases/[id]/combo-actions";
import type { VideoCard as VideoCardData } from "@/lib/case-detail/combo-queries";

/**
 * ★ FE-8 Stage3(A, v12): 변곡점 상세 표 — 행 클릭 → 그 기간 대표 영상 Top3(정렬: 조회/댓글/저장).
 * 영상은 inflectionTopVideos(BE-31) 온디맨드 조회. 프로토 A 변곡점 표 1:1.
 */

type Row = {
  date: string;
  asin: string;
  rank_before: number;
  rank_after: number;
  rank_improvement_pct: number;
  views_ratio: number;
};

export function InflectionTable({ caseId, rows }: { caseId: string; rows: Row[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<"views" | "comments" | "saves">("views");
  const [videos, setVideos] = useState<Record<string, VideoCardData[]>>({});
  const [loading, setLoading] = useState(false);

  const key = (month: string, s: string) => `${month}__${s}`;

  async function load(month: string, s: "views" | "comments" | "saves") {
    if (videos[key(month, s)]) return;
    setLoading(true);
    try {
      const v = await fetchInflectionVideos(caseId, month, s);
      setVideos((prev) => ({ ...prev, [key(month, s)]: v }));
    } catch {
      setVideos((prev) => ({ ...prev, [key(month, s)]: [] }));
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(i: number, month: string) {
    if (open === i) { setOpen(null); return; }
    setOpen(i);
    void load(month, sort);
  }

  function changeSort(month: string, s: "views" | "comments" | "saves") {
    setSort(s);
    void load(month, s);
  }

  if (rows.length === 0) return null;

  return (
    <details style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #e5e7eb" }} open>
      <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        변곡점 상세 <span style={{ color: "#9ca3af", fontWeight: 400 }}>행을 누르면 그 기간 대표 영상 Top 3</span>
      </summary>
      <table className="t" style={{ marginTop: 10, width: "100%", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "#6b7280", textAlign: "left" }}>
            <th style={{ width: 14 }} />
            <th>날짜</th><th>제품</th>
            <th style={{ textAlign: "right" }}>이전 순위</th>
            <th style={{ textAlign: "right" }}>이후 순위</th>
            <th style={{ textAlign: "right" }}>개선</th>
            <th style={{ textAlign: "right" }}>뷰 배수</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((t, i) => {
            const isOpen = open === i;
            const month = t.date.slice(0, 7);
            const vids = videos[key(month, sort)] ?? [];
            return (
              <>
                <tr
                  key={`r-${i}`}
                  data-infl={i}
                  onClick={() => toggleRow(i, month)}
                  style={{ cursor: "pointer", background: isOpen ? "#fef3c7" : undefined }}
                >
                  <td>{isOpen ? "▾" : "▸"}</td>
                  <td style={{ fontFamily: "monospace" }}>{t.date}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>{t.asin}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>#{t.rank_before.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}><b>#{t.rank_after.toLocaleString()}</b></td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>{Math.round(t.rank_improvement_pct)}%</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>×{t.views_ratio.toFixed(1)}</td>
                </tr>
                {isOpen && (
                  <tr key={`e-${i}`}>
                    <td colSpan={7} style={{ background: "#fafafa", padding: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11 }}>
                        <span style={{ color: "#6b7280" }}>기준</span>
                        <div className="ch-toggle">
                          {([["views", "조회수"], ["comments", "댓글 수"], ["saves", "저장 수"]] as const).map(([k, lab]) => (
                            <button key={k} type="button" className={sort === k ? "active" : ""} onClick={() => changeSort(month, k)}>{lab}</button>
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>해당 기간 게시 영상 중 Top 3</span>
                      </div>
                      {loading && vids.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>불러오는 중…</div>
                      ) : vids.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>해당 월 영상 없음</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                          {vids.slice(0, 3).map((v, vi) => (
                            <VideoCard key={vi} title={v.caption ?? "영상"} url={v.url} metrics={{ views: v.views, likes: v.likes, comments: v.comments, saves: v.saves }} />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
