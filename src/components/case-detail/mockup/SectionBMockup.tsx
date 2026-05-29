"use client";

import { useMemo, useState } from "react";
import type {
  Phase2Stats,
  Phase3Stats,
  Phase35Stats,
  Phase37Stats,
  TierBucket,
  TopCreator,
} from "@/lib/inngest/types";
import type { MatrixRow } from "../CrossChannelMatrix";
import type { TopGmvCreator } from "../TopGmvShopCreators";
import type { ShopGmvDistribution } from "../ShopCreatorGmvDistribution";

/**
 * SectionBMockup — mockup line 754-843 1:1.
 *
 * 인플루언서 풀:
 *   - 채널 toggle + 월 select (prototype)
 *   - 2-col 그리드 (1fr 1.5fr):
 *     좌: 티어 분포 (.tier-row + .tier-bar + .tier-fill) + cross-channel matrix (.matrix-table)
 *     우: Top 작성자 (.thumb + .ch-pill TK/IG/YT)
 *   - Shop creator GMV section (TT Shop 활성 시):
 *     2-col: Top GMV 5명 + GMV 분포 histogram (.hg-bar + .hg-labels)
 *   - details: raw 보기
 */

type ChannelMode = "all" | "tk" | "ig" | "yt";

const TIERS_ORDER: { key: TierBucket; label: string }[] = [
  { key: "mega", label: "Mega" },
  { key: "macro", label: "Macro" },
  { key: "mid", label: "Mid" },
  { key: "micro", label: "Micro" },
  { key: "nano", label: "Nano" },
  { key: "sub-nano", label: "Sub-nano" },
  { key: "unknown", label: "Unknown" },
];

export function SectionBMockup({
  phase2,
  phase3,
  phase35,
  phase37,
  crossChannelMatrix,
  topGmvCreators,
  shopGmvDistribution,
}: {
  phase2: Phase2Stats;
  phase3?: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
  crossChannelMatrix?: MatrixRow[];
  topGmvCreators?: TopGmvCreator[];
  shopGmvDistribution?: ShopGmvDistribution | null;
}) {
  const [channelMode, setChannelMode] = useState<ChannelMode>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // 티어 분포 (phase3 or phase35 or phase37 우선)
  const tierDist = phase3?.tier_distribution ?? null;
  const totalCreators = phase3?.total_creators ?? 0;

  // Top 작성자 (20+ 영상)
  const topCreators = (phase2.top_creators ?? [])
    .slice()
    .sort((a, b) => b.video_count - a.video_count);

  // cross-channel matrix
  const xcMap = new Map<string, MatrixRow>();
  for (const r of crossChannelMatrix ?? []) {
    xcMap.set(normalize(r.name), r);
  }

  // cross-channel matrix Top 인플 (2+ 채널)
  const xcTop = useMemo(() => {
    if (!crossChannelMatrix) return [];
    return crossChannelMatrix
      .filter((r) => [r.tk, r.ig, r.yt].filter((n) => n > 0).length >= 2)
      .slice(0, 4);
  }, [crossChannelMatrix]);

  // Shop creator section 표시 조건
  const showShopSection =
    (topGmvCreators && topGmvCreators.length > 0) ||
    (shopGmvDistribution && shopGmvDistribution.buckets.length > 0);

  return (
    <div className="section" id="sec-b">
      <div className="section-h">
        <span className="letter">B</span>
        <span className="title">인플루언서 풀</span>
        <span className="sub">★ 채널 toggle + 월 필터 + cross-channel matrix + Shop creator + GMV 분포</span>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>채널:</span>
          <div className="ch-toggle">
            {(["all", "tk", "ig", "yt"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={channelMode === m ? "active" : ""}
                onClick={() => setChannelMode(m)}
              >
                {m === "all" ? `전체 (${totalCreators}명)` :
                 m === "tk" ? `TikTok (${(phase2.total_unique_creators ?? 0).toLocaleString()})` :
                 m === "ig" ? "IG" : "YT"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 11, color: "#6b7280", marginRight: 8 }}>월:</span>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{
              padding: "5px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            <option value="all">전체 기간 (12개월)</option>
            {Object.keys(phase3?.tier_dist_by_month ?? {})
              .sort()
              .reverse()
              .slice(0, 12)
              .map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 24 }}>
        {/* 좌 column: 티어 분포 + cross-channel matrix */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>티어 분포 (전 채널)</div>
          {TIERS_ORDER.map((t) => {
            const n = tierDist?.[t.key] ?? 0;
            const maxN = tierDist ? Math.max(...TIERS_ORDER.map((x) => tierDist[x.key] ?? 0)) : 1;
            const pct = maxN > 0 ? (n / maxN) * 100 : 0;
            return (
              <div key={t.key} className="tier-row">
                <span>{t.label}</span>
                <div className="tier-bar">
                  <div className="tier-fill" style={{ width: `${pct}%` }} />
                </div>
                <span style={{ textAlign: "right" }}>{n.toLocaleString()}</span>
              </div>
            );
          })}

          {xcTop.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 6 }}>
                ★ cross-channel matrix (Top 인플)
              </div>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>TK</th>
                    <th>IG</th>
                    <th>YT</th>
                  </tr>
                </thead>
                <tbody>
                  {xcTop.map((r) => (
                    <tr key={r.name}>
                      <td style={{ textAlign: "left" }}>{r.name}</td>
                      <td>
                        <span className={`mt-cell ${r.tk > 0 ? "mt-on" : "mt-off"}`}>
                          {r.tk > 0 ? r.tk : "·"}
                        </span>
                      </td>
                      <td>
                        <span className={`mt-cell ${r.ig > 0 ? "mt-on" : "mt-off"}`}>
                          {r.ig > 0 ? r.ig : "·"}
                        </span>
                      </td>
                      <td>
                        <span className={`mt-cell ${r.yt > 0 ? "mt-on" : "mt-off"}`}>
                          {r.yt > 0 ? r.yt : "·"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* 우 column: Top 작성자 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Top 작성자 (20+ 영상)</div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>이름</th>
                <th>팔로워</th>
                <th>채널 활동</th>
                <th style={{ textAlign: "right" }}>영상</th>
                <th style={{ textAlign: "right" }}>총조회</th>
              </tr>
            </thead>
            <tbody>
              {topCreators.slice(0, 10).map((c) => {
                const xc = xcMap.get(normalize(c.handle));
                const isCeleb = c.follower_count != null && c.follower_count >= 10_000_000;
                return (
                  <tr key={c.handle}>
                    <td>
                      <span className="thumb" />
                    </td>
                    <td>
                      <b>{c.handle}</b>
                      {isCeleb && <span className="tag tag-warn">⭐셀럽</span>}
                    </td>
                    <td>{formatFollowers(c.follower_count)}</td>
                    <td>
                      <ChannelPills tk={xc?.tk ?? c.video_count} ig={xc?.ig ?? 0} yt={xc?.yt ?? 0} />
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {c.video_count}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {formatViews(c.max_views)}
                    </td>
                  </tr>
                );
              })}
              {topCreators.length > 10 && (
                <tr style={{ color: "#9ca3af" }}>
                  <td colSpan={6} style={{ textAlign: "center", padding: 8 }}>
                    + {topCreators.length - 10}명 더보기
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shop creator section */}
      {showShopSection && (
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px dashed #e5e7eb",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            🛒 TT Shop Creator GMV (TT Shop 활성 시)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {topGmvCreators && topGmvCreators.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Top GMV 5명</div>
                <table>
                  <thead>
                    <tr>
                      <th>핸들</th>
                      <th style={{ textAlign: "right" }}>Lifetime GMV</th>
                      <th style={{ textAlign: "right" }}>브랜드 협업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGmvCreators.slice(0, 5).map((c) => (
                      <tr key={c.handle}>
                        <td>@{c.handle.replace(/^@/, "")}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {c.lifetime_gmv_usd != null ? formatUsd(c.lifetime_gmv_usd) : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                          {c.total_brand_collabs ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div />}

            {shopGmvDistribution && shopGmvDistribution.buckets.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                  Shop Creator GMV 분포 ({shopGmvDistribution.total_shop_creators}명)
                </div>
                <div className="histogram">
                  {shopGmvDistribution.buckets.map((b) => {
                    const maxN = Math.max(...shopGmvDistribution.buckets.map((x) => x.count), 1);
                    const h = (b.count / maxN) * 100;
                    return (
                      <div
                        key={b.label}
                        className="hg-bar"
                        style={{ height: `${Math.max(h, 2)}%` }}
                        title={`${b.label}: ${b.count}명`}
                      />
                    );
                  })}
                </div>
                <div className="hg-labels">
                  {shopGmvDistribution.buckets.map((b) => (
                    <span key={b.label}>{b.label}</span>
                  ))}
                </div>
              </div>
            ) : <div />}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelPills({ tk, ig, yt }: { tk: number; ig: number; yt: number }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {tk > 0 && <span className="ch-pill pill-tk">TK{tk}</span>}
      {ig > 0 && <span className="ch-pill pill-ig">IG{ig}</span>}
      {yt > 0 && <span className="ch-pill pill-yt">YT{yt}</span>}
    </div>
  );
}

function formatFollowers(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatViews(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/^@/, "").trim();
}
