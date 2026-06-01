"use client";

import React, { useMemo, useState } from "react";
import type {
  Phase2Stats,
  Phase3Stats,
  Phase35Stats,
  Phase37Stats,
  TierBucket,
  TopCreator,
  TopCreatorVideo,
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

// mockup line 777-781: Mega ~ Nano 5 row 만 표시. Sub-nano / Unknown 0 이면 hide
const TIERS_ORDER: { key: TierBucket; label: string }[] = [
  { key: "mega", label: "Mega" },
  { key: "macro", label: "Macro" },
  { key: "mid", label: "Mid" },
  { key: "micro", label: "Micro" },
  { key: "nano", label: "Nano" },
];
const TIERS_EXTRA: { key: TierBucket; label: string }[] = [
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
  ownedHandles,
}: {
  phase2: Phase2Stats;
  phase3?: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
  crossChannelMatrix?: MatrixRow[];
  topGmvCreators?: TopGmvCreator[];
  shopGmvDistribution?: ShopGmvDistribution | null;
  /** 본사 직접 운영 인플 handle 정규화 set (ig_owned_usernames / yt_owned_channels / brand_meta_pages 등 매핑) */
  ownedHandles?: Set<string>;
}) {
  const [channelMode, setChannelMode] = useState<ChannelMode>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<TierBucket | null>(null);
  const [expandedHandle, setExpandedHandle] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"videos" | "views" | "gmv">("videos");

  // 티어 분포 — channelMode + monthFilter 따라 source 변경
  const igCount = phase2.ig_total_videos ?? 0;
  const ytCount = phase2.yt_total_videos ?? 0;
  const tkUnique = phase2.total_unique_creators ?? 0;

  // 채널 데이터 존재 여부 (disable 판정)
  const hasIg = igCount > 0;
  const hasYt = ytCount > 0;

  // monthFilter 박혔으면 phase3.tier_dist_by_month 의 해당 월 dist 사용 (전체 채널)
  // channelMode='all' 외엔 channel별 tier 데이터 없으므로 그냥 전체 dist 표시 + 안내
  const tierDist = monthFilter !== "all"
    ? phase3?.tier_dist_by_month?.[monthFilter] ?? null
    : phase3?.tier_distribution ?? null;
  const totalCreators = channelMode === "tk"
    ? tkUnique
    : channelMode === "ig"
      ? igCount
      : channelMode === "yt"
        ? ytCount
        : phase3?.total_creators ?? 0;

  // Top 작성자 (20+ 영상) — tierFilter + channelMode + sortBy 적용
  // 현재 phase2.top_creators 는 TikTok only. IG/YT 선택 시 빈 list
  const topCreatorsBase = channelMode === "ig" || channelMode === "yt"
    ? []
    : (phase2.top_creators ?? []);
  const sortFn = (a: TopCreator, b: TopCreator) => {
    if (sortBy === "views") return (b.max_views ?? 0) - (a.max_views ?? 0);
    if (sortBy === "gmv") return (b.lifetime_gmv_usd ?? 0) - (a.lifetime_gmv_usd ?? 0);
    return b.video_count - a.video_count;
  };
  const topCreatorsRaw = topCreatorsBase.slice().sort(sortFn);
  const topCreators = tierFilter
    ? topCreatorsRaw.filter((c) => tierOf(c.follower_count) === tierFilter)
    : topCreatorsRaw;

  // ── 3축 분포 (영상 수 / 조회수 / 매출) — bucket 분포 ──
  const distAll = topCreatorsBase;
  const bucket = <T,>(items: T[], val: (x: T) => number, buckets: Array<{ label: string; min: number; max: number }>) =>
    buckets.map((b) => ({
      label: b.label,
      count: items.filter((x) => val(x) >= b.min && val(x) < b.max).length,
    }));
  const videoBuckets = bucket(distAll, (c) => c.video_count, [
    { label: "1회성", min: 1, max: 2 },
    { label: "2-5회", min: 2, max: 6 },
    { label: "5-10회", min: 6, max: 11 },
    { label: "10-20회", min: 11, max: 21 },
    { label: "20+ heavy", min: 21, max: Infinity },
  ]);
  const viewsBuckets = bucket(distAll, (c) => c.max_views ?? 0, [
    { label: "<10K", min: 0, max: 10_000 },
    { label: "10K~100K", min: 10_000, max: 100_000 },
    { label: "100K~1M", min: 100_000, max: 1_000_000 },
    { label: "1M~10M", min: 1_000_000, max: 10_000_000 },
    { label: "10M+", min: 10_000_000, max: Infinity },
  ]);
  const gmvBuckets = bucket(distAll, (c) => c.lifetime_gmv_usd ?? 0, [
    { label: "$0", min: 0, max: 1 },
    { label: "$1~$1K", min: 1, max: 1_000 },
    { label: "$1K~$10K", min: 1_000, max: 10_000 },
    { label: "$10K~$100K", min: 10_000, max: 100_000 },
    { label: "$100K+", min: 100_000, max: Infinity },
  ]);

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
            {(["all", "tk", "ig", "yt"] as const).map((m) => {
              const isDisabled = (m === "ig" && !hasIg) || (m === "yt" && !hasYt);
              return (
                <button
                  key={m}
                  type="button"
                  className={channelMode === m ? "active" : ""}
                  onClick={() => !isDisabled && setChannelMode(m)}
                  disabled={isDisabled}
                  title={isDisabled ? "이 채널 데이터 없음" : ""}
                  style={isDisabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  {m === "all" ? `전체 (${phase3?.total_creators ?? 0}명)` :
                   m === "tk" ? `TikTok (${tkUnique.toLocaleString()})` :
                   m === "ig" ? `IG (${igCount.toLocaleString()})` :
                   `YT (${ytCount.toLocaleString()})`}
                </button>
              );
            })}
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
          {(() => {
            // mockup line 777-781: 5 row 만. 추가 row (sub-nano/unknown) 는 데이터 있을 때만.
            const rowsToShow = [
              ...TIERS_ORDER,
              ...TIERS_EXTRA.filter((t) => (tierDist?.[t.key] ?? 0) > 0),
            ];
            const maxN = tierDist ? Math.max(...rowsToShow.map((x) => tierDist[x.key] ?? 0)) : 1;
            return rowsToShow.map((t) => {
              const n = tierDist?.[t.key] ?? 0;
              const pct = maxN > 0 ? (n / maxN) * 100 : 0;
              const isSelected = tierFilter === t.key;
              return (
                <div
                  key={t.key}
                  className="tier-row"
                  onClick={() => setTierFilter(isSelected ? null : t.key)}
                  style={{
                    cursor: "pointer",
                    background: isSelected ? "#fef3c7" : undefined,
                    borderRadius: 4,
                    padding: isSelected ? "2px 4px" : undefined,
                    margin: isSelected ? "-2px -4px" : undefined,
                  }}
                  title={`${t.label} 티어 인플만 우측 Top 작성자에 표시`}
                >
                  <span style={{ fontWeight: isSelected ? 700 : 400 }}>{t.label}</span>
                  <div className="tier-bar">
                    <div className="tier-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span style={{ textAlign: "right" }}>{n.toLocaleString()}</span>
                </div>
              );
            });
          })()}
          {monthFilter !== "all" && (
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: "#1d4ed8",
                background: "#dbeafe",
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              📅 <b>{monthFilter}</b> 월 티어 분포만 — 우측 Top 작성자는 전체 기간 그대로
            </div>
          )}
          {tierFilter && (
            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                color: "#92400e",
                background: "#fef3c7",
                padding: "4px 8px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>
                ⭐ <b>{tierFilter}</b> 티어만 우측 Top 작성자에 표시
              </span>
              <button
                type="button"
                onClick={() => setTierFilter(null)}
                style={{
                  marginLeft: "auto",
                  background: "white",
                  border: "1px solid #d97706",
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontSize: 9,
                  color: "#92400e",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ✕ 해제
              </button>
            </div>
          )}

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
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              Top 작성자{" "}
              <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>
                · 팔로워 = TK 본 채널 기준
              </span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, fontSize: 10 }}>
              <span style={{ color: "#6b7280", marginRight: 4 }}>정렬:</span>
              {(["videos", "views", "gmv"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSortBy(s)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
                    border: "1px solid",
                    borderColor: sortBy === s ? "#1f2937" : "#d1d5db",
                    background: sortBy === s ? "#1f2937" : "white",
                    color: sortBy === s ? "white" : "#6b7280",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {s === "videos" ? "영상 수" : s === "views" ? "조회수" : "매출"}
                </button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>팔로워</th>
                <th>채널 활동</th>
                <th style={{ textAlign: "right", background: sortBy === "videos" ? "#fef3c7" : undefined }}>영상</th>
                <th style={{ textAlign: "right", background: sortBy === "views" ? "#fef3c7" : undefined }}>최고 조회</th>
                <th style={{ textAlign: "right", background: sortBy === "gmv" ? "#fef3c7" : undefined }}>Lifetime GMV</th>
              </tr>
            </thead>
            <tbody>
              {topCreators.length === 0 && (channelMode === "ig" || channelMode === "yt") ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 16, color: "#9ca3af", fontSize: 11 }}>
                    {channelMode === "ig" ? "IG" : "YT"} Top 작성자 데이터 미수집 (Phase 4c/4d 결과 필요)
                  </td>
                </tr>
              ) : null}
              {topCreators.slice(0, 5).map((c) => {
                const xc = xcMap.get(normalize(c.handle));
                const isCeleb = c.follower_count != null && c.follower_count >= 10_000_000;
                const isOwned = ownedHandles?.has(normalize(c.handle)) ?? false;
                const isExpanded = expandedHandle === c.handle;
                const hasVideos = (c.top_videos?.length ?? 0) > 0;
                return (
                  <React.Fragment key={c.handle}>
                    <tr
                      onClick={() => hasVideos && setExpandedHandle(isExpanded ? null : c.handle)}
                      style={{
                        cursor: hasVideos ? "pointer" : "default",
                        background: isExpanded ? "#fef3c7" : undefined,
                      }}
                      title={hasVideos ? "클릭하여 영상 Top 3 임베드 보기" : "영상 데이터 없음"}
                    >
                      <td>
                        <b>{c.handle}</b>
                        {isOwned && (
                          <span
                            style={{
                              marginLeft: 4,
                              fontSize: 9,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: "#1f2937",
                              color: "white",
                              fontWeight: 700,
                            }}
                            title="본사 직접 운영 채널 (owned account)"
                          >
                            🏢 본사
                          </span>
                        )}
                        {isCeleb && <span className="tag tag-warn">⭐셀럽</span>}
                        {hasVideos && (
                          <span style={{ marginLeft: 6, fontSize: 9, color: "#92400e" }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        )}
                      </td>
                      <td>{formatFollowers(c.follower_count)}</td>
                      <td>
                        <ChannelPills tk={xc?.tk ?? c.video_count} ig={xc?.ig ?? 0} yt={xc?.yt ?? 0} />
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", background: sortBy === "videos" ? "#fef3c7" : undefined }}>
                        {c.video_count}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", background: sortBy === "views" ? "#fef3c7" : undefined }}>
                        {formatViews(c.max_views)}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", background: sortBy === "gmv" ? "#fef3c7" : undefined, color: c.lifetime_gmv_usd ? "#10b981" : "#9ca3af" }}>
                        {c.lifetime_gmv_usd != null && c.lifetime_gmv_usd > 0 ? formatUsd(c.lifetime_gmv_usd) : "—"}
                      </td>
                    </tr>
                    {isExpanded && hasVideos && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <CreatorVideosEmbed videos={c.top_videos!.slice(0, 3)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {topCreators.length > 5 && (
                <tr style={{ color: "#9ca3af" }}>
                  <td colSpan={6} style={{ textAlign: "center", padding: 8 }}>
                    + {topCreators.length - 5}명 더보기
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ★ 인플 활동 3축 분포 — 영상 수 / 최고 조회수 / Lifetime GMV bucket 분포 */}
      {distAll.length > 0 && (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px dashed #e5e7eb",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            🎯 인플 활동 3축 분포{" "}
            <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>
              · {distAll.length}명 기준 — 많이 올렸냐 / 조회수 잘 나왔냐 / 매출 잘 나왔냐
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[
              { title: "영상 수 (반복)", buckets: videoBuckets, color: "#1f2937", active: sortBy === "videos" },
              { title: "최고 조회수", buckets: viewsBuckets, color: "#06b6d4", active: sortBy === "views" },
              { title: "Lifetime GMV", buckets: gmvBuckets, color: "#10b981", active: sortBy === "gmv" },
            ].map((axis) => {
              const max = Math.max(...axis.buckets.map((b) => b.count), 1);
              return (
                <div
                  key={axis.title}
                  style={{
                    padding: 10,
                    border: "1px solid",
                    borderColor: axis.active ? axis.color : "#e5e7eb",
                    borderRadius: 6,
                    background: axis.active ? "#fafafa" : "white",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: axis.color }}>
                    {axis.title}
                  </div>
                  {axis.buckets.map((b) => {
                    const pct = max > 0 ? (b.count / max) * 100 : 0;
                    return (
                      <div
                        key={b.label}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 1fr 40px",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 10,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: "#6b7280" }}>{b.label}</span>
                        <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3 }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: axis.color,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span style={{ textAlign: "right", fontFamily: "monospace", color: "#1f2937" }}>
                          {b.count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Top GMV 5명 · lifetime cross-brand</div>
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
            ) : (
              <div
                style={{
                  padding: 16,
                  fontSize: 11,
                  color: "#9ca3af",
                  background: "#f9fafb",
                  border: "1px dashed #e5e7eb",
                  borderRadius: 6,
                  textAlign: "center",
                }}
              >
                Top GMV Shop Creator 없음 — lemur Shop creator 룩업 결과 lifetime GMV 박힌 인플 0명
              </div>
            )}

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
      {tk > 0 && <span className="ch-pill pill-tk" title={`TikTok 에서 ${tk}개 영상`}>TK {tk}개</span>}
      {ig > 0 && <span className="ch-pill pill-ig" title={`Instagram 에서 ${ig}개 영상`}>IG {ig}개</span>}
      {yt > 0 && <span className="ch-pill pill-yt" title={`YouTube 에서 ${yt}개 영상`}>YT {yt}개</span>}
      {tk === 0 && ig === 0 && yt === 0 && (
        <span style={{ color: "#9ca3af", fontSize: 10 }}>—</span>
      )}
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

function extractTikTokVideoId(url: string): string | null {
  const m = url.match(/\/(?:video|photo)\/(\d+)/);
  return m?.[1] ?? null;
}

function CreatorVideosEmbed({ videos }: { videos: TopCreatorVideo[] }) {
  return (
    <div
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
        background: "#fffbeb",
      }}
    >
      {videos.map((v, i) => {
        const id = extractTikTokVideoId(v.url);
        return (
          <div key={v.url} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: "#92400e", display: "flex", justifyContent: "space-between" }}>
              <span>#{i + 1}</span>
              <span style={{ fontWeight: 700 }}>{formatViews(v.views)} views</span>
            </div>
            {id ? (
              <iframe
                src={`https://www.tiktok.com/embed/v2/${id}`}
                loading="lazy"
                allowFullScreen
                allow="encrypted-media"
                title={v.url}
                style={{ width: "100%", height: 360, border: "none", borderRadius: 4, background: "#f3f4f6" }}
              />
            ) : (
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", padding: 12, textAlign: "center", fontSize: 11, color: "#1f2937", textDecoration: "underline" }}
              >
                TikTok 에서 열기 ↗
              </a>
            )}
            {v.caption && (
              <div style={{ fontSize: 10, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.caption}>
                {v.caption.length > 40 ? `${v.caption.slice(0, 40)}…` : v.caption}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function tierOf(n: number | null): TierBucket {
  if (n == null) return "unknown";
  if (n >= 1_000_000) return "mega";
  if (n >= 500_000) return "macro";
  if (n >= 100_000) return "mid";
  if (n >= 10_000) return "micro";
  if (n >= 1_000) return "nano";
  return "sub-nano";
}
