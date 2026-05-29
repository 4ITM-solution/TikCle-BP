"use client";

import { useState } from "react";
import { TierDistributionModule } from "./TierDistributionModule";
import { TopCreatorsList } from "./TopCreatorsList";
import { MetaAdsBrowser } from "./MetaAdsBrowser";
import { BsrTrendChart, type WeeklyViewPoint } from "./BsrTrendChart";
import { MonthlyTrendChart } from "./MonthlyTrendChart";
import { CrossChannelMatrix } from "./CrossChannelMatrix";
import { KalodataInsightsModule } from "./KalodataInsightsModule";
import { CreatorSkuMatrix } from "./CreatorSkuMatrix";
import { CategoryRankingChart } from "./CategoryRankingChart";
import { SkuSelectorBanner } from "./SkuSelectorBanner";
import { MissingDataPlaceholder } from "./MissingDataPlaceholder";
import { SectionAChannelToolbar } from "./SectionAChannelToolbar";
import { SectionCTabs } from "./SectionCTabs";
import { HeroSkuMegaVideos } from "./HeroSkuMegaVideos";
import {
  TopGmvShopCreators,
  type TopGmvCreator,
} from "./TopGmvShopCreators";
import {
  ShopCreatorGmvDistribution,
  type ShopGmvDistribution,
} from "./ShopCreatorGmvDistribution";
import type { MetaAdListItem } from "@/app/cases/[id]/page";
import {
  formatLocalAndUsd,
  toUsd,
  type ExchangeRates,
} from "@/lib/case-detail/exchange-rates";
import {
  countryOption,
  isRegionCode,
} from "@/lib/case-detail/countries";
import type {
  DisplayedVideoEntry,
  HeatmapRow,
  LanguageEntry,
  Phase2Stats,
  Phase3Stats,
  Phase35Stats,
  Phase37Stats,
  Phase4aStats,
  Phase4bAsrStats,
  Phase4bClusterStats,
  Phase4bSampleStats,
  Phase4bSkuStats,
  Phase4bVisionStats,
  Phase5Stats,
  UspKeywordEntry,
} from "@/lib/inngest/types";
import {
  DisplayedVideoCard,
  MetaClusterCard,
} from "./MetaClusterCard";
import type {
  KalodataBrandKpi,
  KalodataCreatorXlsxRow,
  KalodataVideoRow,
  KalodataVideoXlsxRow,
  KalodataLiveRow,
} from "@/lib/parsers/kalodata";

export function MiniDashboard({
  phase2,
  phase3,
  phase35,
  phase37,
  phase4a,
  phase4bSample,
  phase4bAsr,
  phase4bVision,
  phase4bClusters,
  phase4bSku,
  phase5,
  metaAdsList,
  currency,
  caseCountry,
  exchangeRates,
  topGmvCreators,
  shopGmvDistribution,
  weeklyViews,
  skuMeta,
  kalodata,
  crossChannelMatrix,
}: {
  phase2: Phase2Stats;
  phase3?: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
  phase4a?: Phase4aStats;
  phase4bSample?: Phase4bSampleStats;
  phase4bAsr?: Phase4bAsrStats;
  phase4bVision?: Phase4bVisionStats;
  phase4bClusters?: Phase4bClusterStats;
  phase4bSku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
  metaAdsList?: MetaAdListItem[];
  currency: string;
  caseCountry: string;
  exchangeRates: ExchangeRates;
  topGmvCreators?: TopGmvCreator[];
  shopGmvDistribution?: ShopGmvDistribution | null;
  weeklyViews?: WeeklyViewPoint[];
  crossChannelMatrix?: import("./CrossChannelMatrix").MatrixRow[];
  skuMeta?: Record<
    string,
    { subcategory: string | null; launch_date: string | null }
  >;
  kalodata?: {
    brand?: KalodataBrandKpi | null;
    creators?: KalodataCreatorXlsxRow[];
    videos?: KalodataVideoRow[];
    videosXlsx?: KalodataVideoXlsxRow[];
    lives?: KalodataLiveRow[];
    meta?: {
      shop?: string | null;
      period_start?: string | null;
      period_end?: string | null;
      account_type_filter?: string | null;
    } | null;
  };
}) {
  // ★ SKU selector state — D 안 모듈 5개 공유 (highlight)
  const [selectedSku, setSelectedSku] = useState<string>("all");
  // ★ Section A 채널 mode — MonthlyTrendChart에 전파 (TK/IG/YT/all)
  const [channelMode, setChannelMode] = useState<"all" | "tk" | "ig" | "yt">("all");
  // 채널별 monthly 데이터 선택
  const monthlyForChart = (() => {
    const byCh = phase2.monthly_by_channel;
    if (!byCh) return phase2.monthly_video_counts; // backfill 전 fallback
    if (channelMode === "tk") return byCh.tk;
    if (channelMode === "ig") return byCh.ig;
    if (channelMode === "yt") return byCh.yt;
    // all = 채널 합산 (월별 합)
    const merged = new Map<string, { paid: number; organic: number; total: number }>();
    for (const arr of [byCh.tk, byCh.ig, byCh.yt]) {
      for (const r of arr) {
        const e = merged.get(r.month) ?? { paid: 0, organic: 0, total: 0 };
        e.paid += r.paid;
        e.organic += r.organic;
        e.total += r.total;
        merged.set(r.month, e);
      }
    }
    return Array.from(merged.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({ month, ...c }));
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI strip */}
      <KpiStrip
        stats={phase2}
        currency={currency}
        caseCountry={caseCountry}
        exchangeRates={exchangeRates}
      />

      {/* Section A: 콘텐츠 활동 */}
      <SectionHeader letter="A" title="콘텐츠 활동" />
      {(() => {
        // mockup A 채널 toggle + 5 KPI — phase2 + IG/YT count 통합
        const tkVids = phase2.total_contents ?? 0;
        const igVids = phase2.ig_total_videos ?? 0;
        const ytVids = phase2.yt_total_videos ?? 0;
        const tkPaid = phase2.monthly_video_counts.reduce(
          (s, m) => s + m.paid,
          0,
        );
        const tkOrganic = phase2.monthly_video_counts.reduce(
          (s, m) => s + m.organic,
          0,
        );
        const pct = (n: number, d: number) =>
          d > 0 ? Math.round((n / d) * 100) : 0;
        const totalViews = (phase2.top_creators ?? []).reduce(
          (s, c) => s + (c.max_views ?? 0),
          0,
        );
        const fmtView = (v: number) =>
          v >= 1_000_000_000
            ? `${(v / 1_000_000_000).toFixed(1)}B`
            : v >= 1_000_000
              ? `${Math.round(v / 1_000_000)}M`
              : `${Math.round(v / 1000)}K`;
        const tkKpi = {
          totalVideos: tkVids,
          paidPct: pct(tkPaid, tkVids),
          organicPct: pct(tkOrganic, tkVids),
          giftedPct: 0,
          totalViewsLabel: fmtView(totalViews),
        };
        const allKpi = {
          totalVideos: tkVids + igVids + ytVids,
          paidPct: pct(tkPaid, tkVids), // 통합 paid는 mocked TK 기준
          organicPct: pct(tkOrganic, tkVids),
          giftedPct: 0,
          totalViewsLabel: fmtView(totalViews),
        };
        return (
          <SectionAChannelToolbar
            all={allKpi}
            tk={tkKpi}
            ig={igVids > 0 ? { totalVideos: igVids, paidPct: 0, organicPct: 0, giftedPct: 0, totalViewsLabel: "-" } : undefined}
            yt={ytVids > 0 ? { totalVideos: ytVids, paidPct: 0, organicPct: 0, giftedPct: 0, totalViewsLabel: "-" } : undefined}
            onChange={setChannelMode}
          />
        );
      })()}
      <MonthlyTrendChart
        tierByMonth={phase3?.tier_dist_by_month}
        adTierByMonth={phase3?.ad_by_month_tier}
        monthlyVideoCounts={monthlyForChart}
        bsrSeries={phase2.bsr_series}
      />

      {/* Section B: 인플루언서 활동 — 채널 toggle + 월 필터 (mockup) */}
      <SectionHeader letter="B" title="인플루언서 활동" />
      <div
        className="section-card"
        style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
      >
        <span style={{ fontSize: 11, color: "var(--color-g500)" }}>채널:</span>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--color-g200)",
            borderRadius: 6,
            overflow: "hidden",
            fontSize: 11,
          }}
        >
          <button
            type="button"
            style={{
              padding: "5px 12px",
              background: "var(--color-ink)",
              color: "white",
              border: "none",
              cursor: "pointer",
              borderRight: "1px solid var(--color-g200)",
            }}
          >
            전체 ({(phase2.total_unique_creators ?? 0).toLocaleString()}명)
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "5px 12px",
              background: "white",
              color: "var(--color-g400)",
              border: "none",
              cursor: "not-allowed",
              opacity: 0.5,
              borderRight: "1px solid var(--color-g200)",
            }}
          >
            TikTok
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "5px 12px",
              background: "white",
              color: "var(--color-g400)",
              border: "none",
              cursor: "not-allowed",
              opacity: 0.5,
              borderRight: "1px solid var(--color-g200)",
            }}
          >
            IG
          </button>
          <button
            type="button"
            disabled
            style={{
              padding: "5px 12px",
              background: "white",
              color: "var(--color-g400)",
              border: "none",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            YT
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--color-g500)", marginLeft: 12 }}>
          월:
        </span>
        <select
          disabled
          style={{
            padding: "5px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 6,
            fontSize: 11,
            background: "white",
            opacity: 0.6,
            cursor: "not-allowed",
          }}
        >
          <option>전체 기간</option>
        </select>
        <span style={{ fontSize: 10, color: "var(--color-g400)", marginLeft: "auto" }}>
          ★ 채널 + 월 필터는 visual prototype (다음 PR에서 active)
        </span>
      </div>
      {phase3 && (
        <TierDistributionModule
          phase3={phase3}
          phase35={phase35}
          phase37={phase37}
        />
      )}
      {shopGmvDistribution && (
        <ShopCreatorGmvDistribution data={shopGmvDistribution} />
      )}
      {topGmvCreators && topGmvCreators.length > 0 && (
        <TopGmvShopCreators creators={topGmvCreators} />
      )}
      <CreatorActivityModule stats={phase2} />
      {crossChannelMatrix && crossChannelMatrix.length > 0 && (
        <div className="section-card">
          <div
            style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}
          >
            ⭐ cross-channel 인플 매트릭스
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              marginBottom: 10,
            }}
          >
            같은 인플이 TikTok·Instagram·YouTube 중 어디서 몇 영상 만들었나 — 일관된 partnership 풀 시그널
          </div>
          <CrossChannelMatrix rows={crossChannelMatrix} maxRows={10} />
        </div>
      )}

      {/* Section C: 콘텐츠 포맷 분석 (Phase 4b) — mockup sub-tabs */}
      {phase4bSample && (
        <>
          <SectionHeader letter="C" title="콘텐츠 포맷 분석" />
          <SectionCTabs
            tabs={[
              {
                id: "clusters",
                label: `통합 클러스터 (${phase4bClusters?.meta_clusters?.length ?? 0})`,
                content:
                  phase4bClusters && phase4bClusters.meta_clusters.length > 0 ? (
                    <>
                      <MetaClustersModule clusters={phase4bClusters} sku={phase4bSku} />
                      <div style={{ height: 10 }} />
                      <MissingDataPlaceholder
                        title="TK + IG + YT 채널 column 통합"
                        reason="현재 TikTok hook 클러스터만. IG/YT 통합 view 는 Phase 4b cluster aggregator 변경 + 재분석 필요."
                        next="별도 PR — phase4b-clusters.ts + Inngest 재실행"
                      />
                    </>
                  ) : phase4bClusters ? (
                    <ClusterEmptyFallback clusters={phase4bClusters} />
                  ) : null,
              },
              {
                id: "usp",
                label: `USP 키워드 (${phase5?.usp_keywords?.length ?? 0})`,
                content:
                  phase5 && (phase5.usp_keywords?.length ?? 0) > 0 ? (
                    <UspKeywordsModule phase5={phase5} />
                  ) : null,
              },
              {
                id: "heatmap",
                label: "시즈널리티 heatmap",
                content:
                  phase5 && (phase5.heatmap?.length ?? 0) > 0 ? (
                    <HeatmapModule phase5={phase5} />
                  ) : null,
              },
              {
                id: "lang",
                label: "언어권",
                content: phase5 ? <LanguageModule phase5={phase5} /> : null,
              },
            ]}
          />
        </>
      )}

      {/* Section D: 매출 & 랭킹 — mockup sub-tabs */}
      {phase2.sales_summary && (
        <>
          <SectionHeader
            letter="D"
            title="매출 & 랭킹"
            subtitle={
              phase2.sales_summary.period_start && phase2.sales_summary.period_end
                ? `${phase2.sales_summary.period_start} ~ ${phase2.sales_summary.period_end}`
                : ""
            }
          />
          {/* SKU selector 배너 (sub-tabs 위에) — 선택 state는 D 안 모든 모듈 공유 */}
          {phase2.sku_sales.length > 1 && (
            <SkuSelectorBanner
              skus={phase2.sku_sales}
              selected={selectedSku}
              onChange={setSelectedSku}
            />
          )}
          <SectionCTabs
            tabs={[
              {
                id: "sku",
                label: `SKU 매출 (${phase2.sku_sales.length})`,
                content: (
                  <>
                    {!(kalodata?.videosXlsx?.length) && (
                      <SkuSalesModule
                        stats={phase2}
                        currency={currency}
                        caseCountry={caseCountry}
                        exchangeRates={exchangeRates}
                        skuMeta={skuMeta}
                        selectedSku={selectedSku}
                      />
                    )}
                    <HeroSkuMegaVideos
                      phase2={phase2}
                      phase4bSku={phase4bSku}
                      currency={currency}
                      exchangeRates={exchangeRates}
                      selectedSku={selectedSku}
                    />
                    {phase2.bsr_series.length > 0 && (
                      <BsrTrendChart
                        bsrSeries={phase2.bsr_series}
                        inflections={phase5?.bsr_inflections}
                        weeklyViews={weeklyViews}
                      />
                    )}
                  </>
                ),
              },
              {
                id: "kalodata",
                label: "Kalodata 인사이트",
                content: kalodata ? (
                  <KalodataInsightsModule
                    brand={kalodata.brand}
                    creators={kalodata.creators}
                    videos={kalodata.videos}
                    videosXlsx={kalodata.videosXlsx}
                    lives={kalodata.lives}
                    meta={kalodata.meta}
                    skuSales={phase2.sku_sales}
                  />
                ) : null,
              },
              {
                id: "creator-sku",
                label: "Creator × SKU",
                content:
                  kalodata?.videosXlsx && kalodata.videosXlsx.length > 0 ? (
                    <CreatorSkuMatrix videos={kalodata.videosXlsx} selectedSku={selectedSku} />
                  ) : null,
              },
              {
                id: "category",
                label: "카테고리 ranking",
                content:
                  kalodata?.videosXlsx && kalodata.videosXlsx.length > 0 ? (
                    <CategoryRankingChart videos={kalodata.videosXlsx} selectedSku={selectedSku} />
                  ) : null,
              },
              // Affiliate code tab — 데이터 source 자체 없음. 사용자 요청대로 hide.
              // {
              //   id: "affiliate",
              //   label: "Affiliate code",
              //   content: null,
              // },
            ]}
          />
        </>
      )}

      {/* Section E: Meta 광고 */}
      {phase4a && (
        <>
          <SectionHeader letter="E" title="Meta 광고" />
          <MetaAdsModule phase4a={phase4a} />
          {phase4a.partner_creators && phase4a.partner_creators.length > 0 && (
            <PartnerCreatorsModule phase4a={phase4a} />
          )}
          {metaAdsList && metaAdsList.length > 0 && (
            <MetaAdsBrowser ads={metaAdsList} phase4a={phase4a} />
          )}
        </>
      )}

      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          background: "var(--color-info-soft)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--color-info)",
        }}
      >
        ℹ️ Phase 2 / 3 / 4a 완료. USP 키워드 / 콘텐츠 포맷 클러스터링은 Phase 4b (Vision)에서 채워집니다.
        {phase3 && phase3.total_unknown > 0 && (
          <>
            <br />
            인플 {phase3.total_unknown.toLocaleString()}명은 외부 DB에 없어 fans 미상.
            Phase 3.5에서 clockworks 폴백 추가 예정.
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Fallback: 클러스터 결과 비었을 때 디버그 메시지
// =============================================================================
function ClusterEmptyFallback({ clusters }: { clusters: Phase4bClusterStats }) {
  const reason = clusters.skipped_reason ?? "메타 클러스터 0개 — 패턴 통합 실패";
  const dbg = clusters.pass1_debug;
  return (
    <div
      className="section-card"
      style={{
        background: "var(--color-warn-soft)",
        borderColor: "var(--color-warn)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-warn)" }}>
        ⚠ 클러스터 표시 불가
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          marginTop: 6,
          lineHeight: 1.6,
        }}
      >
        <b>{reason}</b>
        <br />
        입력 <b>{clusters.total_input_videos}</b> · Pass1 후보{" "}
        <b>{clusters.pass1_candidates}</b> · Pass2 통합{" "}
        <b>{clusters.pass2_validated}</b> · Pass3 메타{" "}
        <b>{clusters.pass3_meta}</b>
        <br />
        비용 ${clusters.cost_actual_usd.toFixed(2)} · 토큰 in{" "}
        {clusters.tokens_input.toLocaleString()} / out{" "}
        {clusters.tokens_output.toLocaleString()}
      </div>

      {dbg && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "white",
            borderRadius: 6,
            border: "1px solid var(--color-g100)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--color-g600)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Pass 1 진단
          </div>
          batch <b>{dbg.batches}</b> · LLM raw 클러스터{" "}
          <b>{dbg.raw_clusters_total}</b>
          {dbg.parse_failures > 0 && (
            <>
              {" · "}parse 실패{" "}
              <b style={{ color: "var(--color-accent)" }}>
                {dbg.parse_failures}
              </b>
            </>
          )}
          <br />
          drop: too_small <b>{dbg.dropped_too_small}</b> · id_mismatch{" "}
          <b style={{ color: "var(--color-accent)" }}>
            {dbg.dropped_id_mismatch}
          </b>
          {dbg.sample_member_id_format && (
            <>
              <br />
              LLM 출력 ID 형식 샘플:{" "}
              <code
                style={{
                  background: "var(--color-g50)",
                  padding: "1px 5px",
                  borderRadius: 2,
                }}
              >
                {dbg.sample_member_id_format}
              </code>
            </>
          )}
          {dbg.sample_unmatched_ids.length > 0 && (
            <>
              <br />
              매칭 실패 ID:{" "}
              {dbg.sample_unmatched_ids.map((s, i) => (
                <code
                  key={i}
                  style={{
                    background: "var(--color-warn-soft)",
                    color: "var(--color-warn)",
                    padding: "1px 5px",
                    borderRadius: 2,
                    marginRight: 4,
                  }}
                >
                  {s}
                </code>
              ))}
            </>
          )}
        </div>
      )}

      {clusters.pass2_debug && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "white",
            borderRadius: 6,
            border: "1px solid var(--color-g100)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--color-g600)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Pass 2 진단
          </div>
          LLM raw 클러스터 <b>{clusters.pass2_debug.raw_clusters_total}</b>
          {clusters.pass2_debug.parse_failed && (
            <>
              {" · "}
              <b style={{ color: "var(--color-accent)" }}>JSON parse 실패</b>
            </>
          )}
          {" · output 토큰 "}
          <b>{clusters.pass2_debug.output_tokens.toLocaleString()}</b>
          <br />
          drop: no_indexes <b>{clusters.pass2_debug.dropped_no_indexes}</b> ·
          too_small (멤버 union {"<"} 3){" "}
          <b style={{ color: "var(--color-accent)" }}>
            {clusters.pass2_debug.dropped_too_small}
          </b>
          {clusters.pass2_debug.invalid_indexes > 0 && (
            <>
              {" · 잘못된 index "}
              <b>{clusters.pass2_debug.invalid_indexes}</b>
            </>
          )}
          {clusters.pass2_debug.stop_reason && (
            <>
              {" · stop="}
              <b>{clusters.pass2_debug.stop_reason}</b>
            </>
          )}
          {clusters.pass2_debug.parse_error_tail && (
            <div
              style={{
                marginTop: 6,
                padding: "6px 8px",
                background: "var(--color-g50)",
                borderRadius: 4,
                fontSize: 10,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: "var(--color-g700)",
              }}
            >
              LLM 출력 tail (마지막 200자):
              {"\n"}
              {clusters.pass2_debug.parse_error_tail}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--color-g500)",
          lineHeight: 1.5,
        }}
      >
        Phase 4b.4 재실행으로 새 결과 시도. 입력 0개면 Phase 4b.3(Vision)부터 점검 필요.
      </div>
    </div>
  );
}

// =============================================================================
// Module: 메타 포맷 클러스터 (Phase 4b.4 + 4b.5 SKU 대표 영상)
// =============================================================================
function MetaClustersModule({
  clusters,
  sku,
}: {
  clusters: Phase4bClusterStats;
  sku?: Phase4bSkuStats;
}) {
  const sorted = [...clusters.meta_clusters].sort(
    (a, b) => b.member_count - a.member_count,
  );
  const reps = sku?.cluster_representatives ?? {};

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {clusters.pass3_meta}개 메타 포맷
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            3-pass 클러스터링 · 입력 {clusters.total_input_videos} → 후보{" "}
            {clusters.pass1_candidates} → 통합 {clusters.pass2_validated} → 메타{" "}
            {clusters.pass3_meta}
            {sku && !sku.skipped_reason && (
              <>
                {" · 대표 영상 SKU 매칭 "}
                <b>
                  {sku.total_matched}/{sku.total_displayed}
                </b>
              </>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          연결 <b style={{ color: "var(--color-ink)" }}>
            {clusters.total_memberships}
          </b>
          {" · 비용 "}
          <b style={{ color: "var(--color-ink)" }}>
            ${clusters.cost_actual_usd.toFixed(2)}
          </b>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {sorted.map((m, i) => (
          <MetaClusterCard
            key={m.id}
            meta={m}
            rank={i}
            representatives={reps[m.id] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Module: 티어×메타 히트맵 (Phase 5)
// =============================================================================
const TIER_LABELS: Record<string, string> = {
  mega: "Mega",
  macro: "Macro",
  mid: "Mid",
  micro: "Micro",
  nano: "Nano",
};

function HeatmapModule({ phase5 }: { phase5: Phase5Stats }) {
  const metas = phase5.meta_order ?? [];
  const heatmap = phase5.heatmap ?? [];
  const totalVideos = phase5.total_videos_in_heatmap ?? 0;
  // 짧은 라벨 — 길면 첫 14자
  const shortLabel = (name: string) =>
    name.length > 14 ? `${name.slice(0, 13)}…` : name;

  // 셀 색 강도 — pct 0~max를 0~1 alpha로
  const allPcts = heatmap.flatMap((row) =>
    row.cells.map((c) => c.views_pct),
  );
  const maxPct = Math.max(1, ...allPcts);
  const cellBg = (pct: number) => {
    if (pct < 0.5) return "transparent";
    const alpha = Math.min(0.85, 0.15 + (pct / maxPct) * 0.7);
    return `rgba(199, 84, 60, ${alpha})`; // accent red 톤
  };
  const cellColor = (pct: number) =>
    pct / maxPct > 0.45 ? "white" : "var(--color-ink)";

  return (
    <div className="section-card">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          티어별 메타 포맷 히트맵 (VIEWS % 기준)
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          분석 샘플 <b>{totalVideos.toLocaleString()}</b>개 ·
          tier row 안에서 정규화 (행 합계 ~100%)
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 4,
            fontSize: 11,
            width: "100%",
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 70, fontWeight: 700, fontSize: 10 }}></th>
              {metas.map((m) => (
                <th
                  key={m.id}
                  title={m.name}
                  style={{
                    padding: "6px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--color-g500)",
                    background: "var(--color-g50)",
                    borderRadius: 4,
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shortLabel(m.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.map((row) => (
              <tr key={row.tier}>
                <td
                  style={{
                    padding: "8px 4px",
                    fontWeight: 700,
                    color: "var(--color-ink)",
                    fontSize: 11,
                  }}
                >
                  {TIER_LABELS[row.tier] ?? row.tier}
                </td>
                {row.cells.map((c) => (
                  <td
                    key={c.meta_id}
                    title={`${row.tier} × ${
                      metas.find((m) => m.id === c.meta_id)?.name ?? ""
                    }: ${c.video_count} 영상, ${c.views_sum.toLocaleString()} views (${c.views_pct.toFixed(1)}%)`}
                    style={{
                      padding: "10px 8px",
                      textAlign: "center",
                      background: cellBg(c.views_pct),
                      color: cellColor(c.views_pct),
                      borderRadius: 4,
                      fontWeight: c.views_pct > 5 ? 700 : 500,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {Math.round(c.views_pct)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Module: USP 키워드 분포 (Phase 5)
// =============================================================================
function UspKeywordsModule({ phase5 }: { phase5: Phase5Stats }) {
  const top = phase5.usp_keywords ?? [];
  if (top.length === 0) return null;

  const max = Math.max(...top.map((k) => k.pct), 1);
  const totalCaptions = phase5.total_captions ?? 0;

  return (
    <div className="section-card">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>USP 키워드 분포</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          전체 {totalCaptions.toLocaleString()} 캡션 기준 · 캡션 빈도 분석 (1-3 word n-gram, stopword 제외) · 클러스터와 별개 축
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {top.map((k) => (
          <UspKeywordRow key={k.keyword} entry={k} maxPct={max} />
        ))}
      </div>
    </div>
  );
}

function UspKeywordRow({
  entry,
  maxPct,
}: {
  entry: UspKeywordEntry;
  maxPct: number;
}) {
  const w = (entry.pct / maxPct) * 100;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 80px 1fr 70px",
        gap: 10,
        alignItems: "center",
        fontSize: 11,
      }}
    >
      <span
        className="font-mono"
        style={{
          color: "var(--color-g600)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={entry.keyword}
      >
        {entry.keyword}
      </span>
      <span
        className="font-mono"
        style={{
          color: "var(--color-ink)",
          fontWeight: 700,
        }}
      >
        {entry.pct.toFixed(1)}%
      </span>
      <div
        style={{
          height: 14,
          background: "var(--color-g50)",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            width: `${w}%`,
            height: "100%",
            background: "var(--color-ink)",
            borderRadius: 3,
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{
          textAlign: "right",
          color: "var(--color-g500)",
        }}
      >
        {entry.count.toLocaleString()}
      </span>
    </div>
  );
}

// =============================================================================
// Module: 언어 분포 (Phase 5)
// =============================================================================
function LanguageModule({ phase5 }: { phase5: Phase5Stats }) {
  const languages = phase5.languages ?? [];
  const total =
    (phase5.total_with_language ?? 0) +
    (phase5.total_without_language ?? 0);
  const top = languages[0];
  const dominantPct = top ? top.pct : 0;
  const hasAnyLang = languages.length > 0;

  return (
    <div className="section-card">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>언어 분포</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          전체 {total.toLocaleString()} 콘텐츠 · 언어 채워짐{" "}
          <b>{(phase5.total_with_language ?? 0).toLocaleString()}</b>
          {(phase5.total_without_language ?? 0) > 0 && (
            <>
              {" · "}미분류{" "}
              <b>{(phase5.total_without_language ?? 0).toLocaleString()}</b>
            </>
          )}
        </div>
      </div>

      {hasAnyLang ? (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 10,
            }}
          >
            {languages.slice(0, 8).map((l) => (
              <LanguageRow key={l.code} lang={l} />
            ))}
            {languages.length > 8 && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-g400)",
                  fontFamily: "var(--font-mono)",
                  padding: "2px 4px",
                }}
              >
                + {languages.length - 8}개 더
              </div>
            )}
          </div>

          {top && (
            <div
              style={{
                fontSize: 11,
                color: "var(--color-g500)",
                background: "var(--color-info-soft)",
                padding: "8px 12px",
                borderRadius: 4,
              }}
            >
              {top.label} <b>{Math.round(dominantPct)}%</b> 우세
              {dominantPct >= 70 && " — 단일 시장 집중"}
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            background: "var(--color-warn-soft)",
            padding: "10px 12px",
            borderRadius: 4,
            lineHeight: 1.5,
          }}
        >
          ⚠ 모든 콘텐츠의 <code style={{ background: "white", padding: "1px 4px", borderRadius: 2 }}>contents.language</code>가 비어있음.
          <br />
          소스 데이터(exolyt CSV 등)에 language 필드가 없거나, 캡션 휴리스틱 자동 검출 미구현 상태.
        </div>
      )}
    </div>
  );
}

function LanguageRow({ lang }: { lang: LanguageEntry }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 80px",
        gap: 10,
        alignItems: "center",
        fontSize: 11,
      }}
    >
      <span
        className="font-mono"
        style={{ color: "var(--color-g500)" }}
      >
        {lang.label}
      </span>
      <div
        style={{
          height: 14,
          background: "var(--color-g50)",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, lang.pct)}%`,
            height: "100%",
            background: "var(--color-ink)",
            borderRadius: 3,
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{
          textAlign: "right",
          color: "var(--color-g600)",
          fontWeight: 600,
        }}
      >
        {lang.count.toLocaleString()} · {lang.pct.toFixed(1)}%
      </span>
    </div>
  );
}

// =============================================================================
// Module: Meta 광고 (Phase 4a)
// =============================================================================
function MetaAdsModule({ phase4a }: { phase4a: Phase4aStats }) {
  if (phase4a.skipped_reason) {
    return (
      <div className="section-card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          Meta 광고
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-g500)",
            padding: "10px 14px",
            background: "var(--color-g25)",
            borderRadius: 6,
          }}
        >
          ⏭ Phase 4a 스킵 — {phase4a.skipped_reason}
        </div>
      </div>
    );
  }

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Meta 광고 라이브러리</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {phase4a.source_urls_count}개 검색 URL · brand_official{" "}
            {phase4a.brand_official_ads}건 · active {phase4a.active_ads}건
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          총{" "}
          <b style={{ color: "var(--color-ink)", fontSize: 14 }}>
            {phase4a.total_ads.toLocaleString()}
          </b>
          건 · 비용{" "}
          <b style={{ color: "var(--color-ink)" }}>
            ${phase4a.cost_actual_usd.toFixed(2)}
          </b>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <KpiBox
          label="VIDEO"
          value={phase4a.formats.video.toLocaleString()}
        />
        <KpiBox
          label="IMAGE"
          value={phase4a.formats.image.toLocaleString()}
        />
        <KpiBox
          label="기타"
          value={phase4a.formats.other.toLocaleString()}
        />
      </div>

      {/* 랜딩 분포 */}
      <div
        style={{
          marginBottom: 14,
          padding: "10px 14px",
          background: "var(--color-g25)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-g500)",
            textTransform: "uppercase",
            letterSpacing: ".05em",
            marginBottom: 8,
          }}
        >
          랜딩 도착지
        </div>
        <LandingBreakdown phase4a={phase4a} />
      </div>

    </div>
  );
}

// =============================================================================
// Module: 파트너 인플 리스트 (Phase 4a partner_creators)
// =============================================================================
// Paid Partnership / Branded Content 광고에서 추출한 creator(인플) ↔ partner brand
// 매핑. 같은 인플이 여러 광고에 등장하면 ad_count로 누적. apify 공식 액터(detail
// endpoint)가 채워주는 snapshot.pageName(creator) + snapshot.brandedContent(brand)
// 가 핵심 소스. curious_coder 단독 케이스는 비어있음 (partnership 정보 손실).
function PartnerCreatorsModule({ phase4a }: { phase4a: Phase4aStats }) {
  const creators = phase4a.partner_creators ?? [];
  if (creators.length === 0) return null;

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            파트너 인플 리스트 (Paid Partnership)
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
              marginTop: 2,
            }}
          >
            {phase4a.partnership_creators ?? creators.length}명 인플 ·{" "}
            {phase4a.partnership_ads ?? 0}건 파트너십 광고
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 12,
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--color-g100)",
                color: "var(--color-g500)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}
            >
              <th
                style={{ textAlign: "left", padding: "8px 6px", width: 56 }}
              ></th>
              <th style={{ textAlign: "left", padding: "8px 6px" }}>인플</th>
              <th style={{ textAlign: "left", padding: "8px 6px" }}>
                파트너 브랜드
              </th>
              <th style={{ textAlign: "right", padding: "8px 6px" }}>광고 수</th>
              <th style={{ textAlign: "right", padding: "8px 6px" }}>active</th>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 6px",
                  whiteSpace: "nowrap",
                }}
              >
                활동 기간
              </th>
            </tr>
          </thead>
          <tbody>
            {creators.map((c) => (
              <tr
                key={c.creator_page_name}
                style={{ borderBottom: "1px solid var(--color-g50)" }}
              >
                <td style={{ padding: "8px 6px" }}>
                  {c.sample_thumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.sample_thumbnail}
                      alt={c.creator_page_name}
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 4,
                        background: "var(--color-g50)",
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        background: "var(--color-g50)",
                        borderRadius: 4,
                      }}
                    />
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 6px",
                    fontWeight: 600,
                    color: "var(--color-ink)",
                  }}
                >
                  {c.creator_page_name}
                </td>
                <td
                  style={{
                    padding: "8px 6px",
                    color: "var(--color-accent)",
                    fontSize: 11,
                  }}
                >
                  {c.partner_page_name ?? "—"}
                </td>
                <td
                  style={{
                    padding: "8px 6px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                  }}
                >
                  {c.ad_count}
                </td>
                <td
                  style={{
                    padding: "8px 6px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    color:
                      c.active_count > 0
                        ? "var(--color-pos)"
                        : "var(--color-g400)",
                  }}
                >
                  {c.active_count}
                </td>
                <td
                  style={{
                    padding: "8px 6px",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-g500)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.first_seen ?? "—"}
                  {c.first_seen !== c.last_seen && c.last_seen
                    ? ` ~ ${c.last_seen}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LandingBreakdown({ phase4a }: { phase4a: Phase4aStats }) {
  const items: Array<{ key: keyof typeof phase4a.landings; label: string }> = [
    { key: "instagram", label: "Instagram" },
    { key: "amazon", label: "Amazon" },
    { key: "tiktok_shop", label: "TikTok Shop" },
    { key: "facebook", label: "Facebook" },
    { key: "dtc", label: "자사몰 (DTC)" },
    { key: "other", label: "기타" },
    { key: "none", label: "랜딩 없음" },
  ];
  const total = phase4a.total_ads;
  // 옛 phase4a 데이터에 landings 키 없을 수 있음 → 항상 숫자로 정규화
  const v = (k: keyof typeof phase4a.landings) => phase4a.landings?.[k] ?? 0;
  const max = Math.max(...items.map((i) => v(i.key)), 1);

  if (!phase4a.landings) {
    return (
      <div style={{ fontSize: 11, color: "var(--color-g400)" }}>
        랜딩 분포 데이터 없음 — 분석 재실행하면 채워집니다.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((it) => {
        const cnt = v(it.key);
        if (cnt === 0) return null;
        const pct = total > 0 ? (cnt / total) * 100 : 0;
        const w = (cnt / max) * 100;
        return (
          <div key={it.key}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 100px",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <span
                className="font-mono"
                style={{ color: "var(--color-g500)" }}
              >
                {it.label}
              </span>
              <div
                style={{
                  height: 14,
                  background: "var(--color-g50)",
                  borderRadius: 3,
                }}
              >
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    background: "var(--color-ink)",
                    borderRadius: 3,
                  }}
                />
              </div>
              <span
                className="font-mono"
                style={{
                  textAlign: "right",
                  color: "var(--color-g600)",
                  fontWeight: 600,
                }}
              >
                {cnt.toLocaleString()} · {pct.toFixed(1)}%
              </span>
            </div>

            {/* 기타 행 아래에 실제 도메인 breakdown */}
            {it.key === "other" &&
              phase4a.other_top_domains &&
              phase4a.other_top_domains.length > 0 && (
                <div
                  style={{
                    marginLeft: 108,
                    marginTop: 4,
                    marginBottom: 4,
                    fontSize: 10,
                    color: "var(--color-g500)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 10px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {phase4a.other_top_domains.map((d) => (
                    <span key={d.domain}>
                      {d.domain}{" "}
                      <b style={{ color: "var(--color-g600)" }}>{d.count}</b>
                    </span>
                  ))}
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * FB DCO/카탈로그 광고의 미렌더 템플릿 변수 제거.
 * 예: "{{product.brand}}" → 빈 문자열, "{{product.name}} - {{product.price}}" → 빈 문자열
 * 정리 후 결과가 비면 null (placeholder만 있던 광고).
 */
function cleanBodyText(text: string | null): {
  text: string | null;
  hadPlaceholder: boolean;
} {
  if (!text) return { text: null, hadPlaceholder: false };
  const hadPlaceholder = /\{\{[^}]+\}\}/.test(text);
  const cleaned = text
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    text: cleaned || null,
    hadPlaceholder,
  };
}

function unwrapFbRedirect(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "l.facebook.com" || u.hostname === "lm.facebook.com") {
      const real = u.searchParams.get("u");
      if (real) return decodeURIComponent(real);
    }
  } catch {
    /* noop */
  }
  return url;
}

function getDomain(url: string | null): string {
  if (!url) return "";
  try {
    const real = unwrapFbRedirect(url);
    const u = new URL(real);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

function landingBadge(
  landing: string,
  url: string | null,
): { label: string; color: string } {
  switch (landing) {
    case "instagram":
      return { label: "→ IG", color: "#E1306C" };
    case "amazon":
      return { label: "→ Amazon", color: "#FF9900" };
    case "tiktok_shop":
      return { label: "→ TT Shop", color: "#000" };
    case "facebook":
      return { label: "→ FB", color: "#1877F2" };
    case "dtc":
      return { label: "→ DTC", color: "var(--color-accent)" };
    case "other": {
      // 기타는 실제 도메인 표시
      const domain = getDomain(url);
      return {
        label: domain ? `→ ${domain}` : "→ 기타",
        color: "var(--color-g500)",
      };
    }
    default:
      return { label: "→ 없음", color: "var(--color-g300)" };
  }
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--color-g25)",
        borderRadius: 6,
        padding: "10px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g400)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function AdPreviewCard({
  ad,
}: {
  ad: Phase4aStats["ads_preview"][number];
}) {
  const fbLibraryUrl = ad.ad_archive_id
    ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
    : null;

  const cleaned = cleanBodyText(ad.body_text);

  const overlayBadges = (
    <>
      {ad.format && (
        <span
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            fontSize: 9,
            background: "var(--color-ink)",
            color: "white",
            padding: "2px 6px",
            borderRadius: 2,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            zIndex: 2,
          }}
        >
          {ad.format}
        </span>
      )}
      <span
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          fontSize: 9,
          background: ad.is_active ? "var(--color-pos)" : "var(--color-g300)",
          color: "white",
          padding: "2px 6px",
          borderRadius: 2,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          zIndex: 2,
        }}
      >
        {ad.is_active ? "ACTIVE" : "ENDED"}
      </span>
      {ad.is_brand_official && (
        <span
          style={{
            position: "absolute",
            bottom: 6,
            left: 6,
            fontSize: 9,
            background: "var(--color-info)",
            color: "white",
            padding: "2px 6px",
            borderRadius: 2,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            zIndex: 2,
          }}
        >
          BRAND
        </span>
      )}
      {fbLibraryUrl && (
        <a
          href={fbLibraryUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="FB Ads Library에서 이 광고 자세히 보기"
          style={{
            position: "absolute",
            bottom: 6,
            right: 6,
            fontSize: 9,
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "3px 8px",
            borderRadius: 2,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            textDecoration: "none",
            zIndex: 2,
          }}
        >
          ↗ FB
        </a>
      )}
    </>
  );

  return (
    <div
      style={{
        border: "1px solid var(--color-g100)",
        borderRadius: 6,
        overflow: "hidden",
        background: "white",
      }}
    >
      {/* 썸네일 영역 — video_url 있으면 inline 재생, 없으면 이미지 */}
      {ad.video_url ? (
        <div
          style={{
            position: "relative",
            aspectRatio: "9/16",
            background: "black",
          }}
        >
          <video
            src={ad.video_url}
            poster={ad.thumbnail_url ?? undefined}
            controls
            preload="metadata"
            playsInline
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: "cover",
            }}
          />
          {overlayBadges}
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            aspectRatio: "9/16",
            background: ad.thumbnail_url
              ? `center / cover no-repeat url("${ad.thumbnail_url}")`
              : "repeating-linear-gradient(45deg, var(--color-g25) 0 8px, var(--color-g50) 8px 16px)",
          }}
        >
          {overlayBadges}
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700 }}>
            {ad.page_name ?? "(no page)"}
          </div>
          {ad.link_url ? (
            <a
              href={unwrapFbRedirect(ad.link_url)}
              target="_blank"
              rel="noopener noreferrer"
              title={ad.link_url}
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: landingBadge(ad.landing, ad.link_url).color,
                whiteSpace: "nowrap",
              }}
            >
              {landingBadge(ad.landing, ad.link_url).label} ↗
            </a>
          ) : (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: "var(--color-g300)",
              }}
            >
              → 없음
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
            marginBottom: 6,
          }}
        >
          {ad.start_date ?? "?"} ~ {ad.end_date ?? (ad.is_active ? "ACTIVE" : "?")}
        </div>
        {cleaned.text ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={ad.body_text ?? undefined}
          >
            {cleaned.hadPlaceholder && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  background: "var(--color-warn-soft)",
                  color: "var(--color-warn)",
                  padding: "1px 5px",
                  borderRadius: 2,
                  marginRight: 5,
                  fontFamily: "var(--font-mono)",
                }}
                title="DCO/카탈로그 광고 — 일부 변수가 미렌더 상태"
              >
                DCO
              </span>
            )}
            {cleaned.text}
          </div>
        ) : cleaned.hadPlaceholder ? (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g400)",
              fontStyle: "italic",
            }}
            title={ad.body_text ?? undefined}
          >
            (다이나믹 카탈로그 광고 — 텍스트 없음)
          </div>
        ) : null}
      </div>
    </div>
  );
}


// =============================================================================
// KPI strip
// =============================================================================
function KpiStrip({
  stats,
  currency,
  caseCountry,
  exchangeRates,
}: {
  stats: Phase2Stats;
  currency: string;
  caseCountry: string;
  exchangeRates: ExchangeRates;
}) {
  const peak = [...stats.monthly_video_counts].sort(
    (a, b) => b.total - a.total,
  )[0];

  // 권역 case면 by_country로 USD 합산. 단일이면 currency 단위 그대로.
  const isRegion = isRegionCode(caseCountry);
  const byCountry = stats.sales_summary?.by_country;
  const salesValue = (() => {
    if (!stats.sales_summary) return null;
    if (isRegion && byCountry) {
      const usdSum = Object.values(byCountry).reduce(
        (acc, v) => acc + (toUsd(v.revenue, v.currency, exchangeRates) ?? 0),
        0,
      );
      return `$${Math.round(usdSum).toLocaleString()}`;
    }
    return formatLocalAndUsd(
      stats.sales_summary.total_revenue,
      currency,
      exchangeRates,
    );
  })();
  const salesSub = (() => {
    if (!stats.sales_summary) return "";
    if (isRegion && byCountry) {
      const parts = Object.entries(byCountry).map(([cc, v]) => {
        const flag = countryOption(cc)?.flag ?? "";
        return `${flag} ${cc} ${v.currency} ${Math.round(v.revenue).toLocaleString()}`;
      });
      return parts.join(" · ");
    }
    return `${stats.sales_summary.sku_count} SKU · ${stats.sales_summary.total_units.toLocaleString()}개`;
  })();

  type Card = { label: string; value: string; sub: string };
  const rawCards: (Card | null)[] = [
    stats.sales_summary && salesValue
      ? {
          label: isRegion ? "30일 매출 (USD 환산 합계)" : "30일 매출",
          value: salesValue,
          sub: salesSub,
        }
      : null,
    {
      label: "콘텐츠",
      value: stats.total_contents.toLocaleString(),
      sub: `인플 ${stats.total_unique_creators.toLocaleString()}명`,
    },
    peak
      ? {
          label: "피크 월 영상",
          value: peak.total.toLocaleString(),
          sub: `${peak.month} · paid ${Math.round((peak.paid / peak.total) * 100)}%`,
        }
      : null,
    stats.sales_summary && stats.sales_summary.top1_revenue_share > 0
      ? {
          label: "Top SKU 점유",
          value: `${Math.round(stats.sales_summary.top1_revenue_share * 100)}%`,
          sub: `Top 3: ${Math.round(stats.sales_summary.top3_revenue_share * 100)}%`,
        }
      : null,
  ];
  const cards: Card[] = rawCards.filter((c): c is Card => c !== null);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cards.length}, 1fr)`,
        gap: 10,
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: "white",
            border: "1px solid var(--color-g100)",
            borderRadius: 8,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--color-g400)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              letterSpacing: "-0.01em",
            }}
          >
            {c.value}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              marginTop: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Section header
// =============================================================================
function SectionHeader({
  letter,
  title,
  subtitle,
}: {
  letter: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      id={`section-${letter.toLowerCase()}`}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginTop: 14,
        scrollMarginTop: 80,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--color-g400)",
        }}
      >
        {letter}
      </span>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: ".05em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      <div style={{ flex: 1, height: 1, background: "var(--color-g100)" }} />
      {subtitle && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--color-g400)",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Module: 인플 1인당 영상 분포 + Top 작성자
// =============================================================================
function CreatorActivityModule({ stats }: { stats: Phase2Stats }) {
  const dist = stats.videos_per_creator;
  const total = dist.total_creators;
  const buckets: { key: keyof typeof dist; label: string; warn?: boolean }[] = [
    { key: "1", label: "1건 (단발)" },
    { key: "2-4", label: "2~4건" },
    { key: "5-9", label: "5~9건" },
    { key: "10-19", label: "10~19건", warn: true },
    { key: "20-49", label: "20~49건", warn: true },
    { key: "50+", label: "50+건", warn: true },
  ];
  const max = Math.max(...buckets.map((b) => Number(dist[b.key]) || 0), 1);

  return (
    <div className="section-card">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>인플루언서 활동</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          전체 {total.toLocaleString()}명 · Class A (Shop+promoted≥5) / B (Shop+promoted≥2) / C (Shop+1) / D (non-Shop+promoted≥1) — 카드 펼치면 뷰 Top 3 영상
        </div>
      </div>

      {/* 상단: 분포 막대 (전체 너비) */}
      <div style={{ marginBottom: 18 }}>
        {buckets.map((b) => {
          const v = Number(dist[b.key]) || 0;
          const pct = total > 0 ? (v / total) * 100 : 0;
          const w = (v / max) * 100;
          return (
            <div
              key={b.key}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 80px",
                gap: 10,
                padding: "4px 0",
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <span
                className="font-mono"
                style={{ color: "var(--color-g500)" }}
              >
                {b.label}
              </span>
              <div
                style={{
                  height: 18,
                  background: "var(--color-g50)",
                  borderRadius: 3,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${w}%`,
                    borderRadius: 3,
                    background: b.warn
                      ? "var(--color-accent)"
                      : "var(--color-ink)",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {v > 0 && w > 8 ? `${v.toLocaleString()}명` : ""}
                </div>
              </div>
              <span
                className="font-mono"
                style={{
                  textAlign: "right",
                  color: "var(--color-g400)",
                }}
              >
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* 하단: Top 반복 작성자 (좌) | 단일 viral outlier (우) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            (stats.outlier_creators?.length ?? 0) > 0 ? "1fr 1fr" : "1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-g500)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 10,
            }}
          >
            10+ 영상 반복 작성자 · Class A/B/C ({stats.top_creators.length}명)
          </div>
          <TopCreatorsList creators={stats.top_creators} />
        </div>

        {(stats.outlier_creators?.length ?? 0) > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-accent)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: 4,
              }}
            >
              단일 Viral Outlier · 1M+ Views
              <span
                style={{
                  color: "var(--color-g400)",
                  fontWeight: 500,
                }}
              >
                {" "}
                ({stats.outlier_creators!.length}명)
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-g500)",
                marginBottom: 10,
                fontFamily: "var(--font-mono)",
              }}
            >
              반복 협업 X · 단일 viral 영상으로 1M+ 도달한 인플
            </div>
            <TopCreatorsList
              creators={stats.outlier_creators!}
              emptyMessage="1M+ 단일 viral 인플 없음"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// =============================================================================
// Module: SKU 매출
// =============================================================================
function formatLaunch(launchDate: string | null | undefined): string | null {
  if (!launchDate) return null;
  const d = new Date(launchDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth());
  return `출시 ~${launchDate.slice(0, 7)} (${months}개월 전)`;
}

function SkuSalesModule({
  stats,
  currency,
  caseCountry,
  exchangeRates,
  skuMeta,
  selectedSku = "all",
}: {
  stats: Phase2Stats;
  currency: string;
  caseCountry: string;
  exchangeRates: ExchangeRates;
  selectedSku?: string; // asin or "all" — 선택된 row highlight
  skuMeta?: Record<
    string,
    { subcategory: string | null; launch_date: string | null }
  >;
}) {
  const [showAll, setShowAll] = useState(false);
  void selectedSku; // ★ Phase 10: SKU selector state lift — row highlight 추후 박을 자리

  if (!stats.sales_summary) return null;
  const max = Math.max(...stats.sku_sales.map((s) => s.revenue), 1);
  const isRegion = isRegionCode(caseCountry);
  const byCountry = stats.sales_summary.by_country;

  const skuCount = stats.sku_sales.length;
  const visibleSkus = showAll ? stats.sku_sales : stats.sku_sales.slice(0, 5);
  const totalRev = stats.sales_summary.total_revenue;
  const top1Pct = Math.round(stats.sales_summary.top1_revenue_share * 100);
  const top3Pct = Math.round(stats.sales_summary.top3_revenue_share * 100);
  const top5Pct = Math.round(
    (stats.sku_sales.slice(0, 5).reduce((s, x) => s + x.revenue, 0) /
      Math.max(totalRev, 1)) *
      100,
  );

  // 카테고리 분포 — skuMeta.subcategory 기준
  const catByRev = (() => {
    const m = new Map<string, { revenue: number; count: number }>();
    for (const s of stats.sku_sales) {
      const cat = skuMeta?.[s.asin]?.subcategory ?? "(카테고리 미상)";
      const e = m.get(cat) ?? { revenue: 0, count: 0 };
      e.revenue += s.revenue;
      e.count += 1;
      m.set(cat, e);
    }
    return [...m.entries()]
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  })();

  // 출시 시기 분포 — 1년 내 / 1~3년 / 3년+
  const ageBuckets = (() => {
    const now = new Date();
    const buckets = { fresh: 0, mid: 0, legacy: 0, unknown: 0 };
    let freshRev = 0,
      midRev = 0,
      legacyRev = 0,
      unknownRev = 0;
    for (const s of stats.sku_sales) {
      const launch = skuMeta?.[s.asin]?.launch_date;
      if (!launch) {
        buckets.unknown += 1;
        unknownRev += s.revenue;
        continue;
      }
      const d = new Date(launch);
      const months =
        (now.getFullYear() - d.getFullYear()) * 12 +
        (now.getMonth() - d.getMonth());
      if (months < 12) {
        buckets.fresh += 1;
        freshRev += s.revenue;
      } else if (months < 36) {
        buckets.mid += 1;
        midRev += s.revenue;
      } else {
        buckets.legacy += 1;
        legacyRev += s.revenue;
      }
    }
    return {
      counts: buckets,
      revs: { fresh: freshRev, mid: midRev, legacy: legacyRev, unknown: unknownRev },
    };
  })();

  const fmtPctRev = (r: number) =>
    Math.round((r / Math.max(totalRev, 1)) * 100);

  // 헤더 총 매출: 권역이면 USD 환산 합계, 단일이면 currency raw + USD
  const headerTotal = (() => {
    if (isRegion && byCountry) {
      const usdSum = Object.values(byCountry).reduce(
        (acc, v) => acc + (toUsd(v.revenue, v.currency, exchangeRates) ?? 0),
        0,
      );
      return `$${Math.round(usdSum).toLocaleString()} (USD 환산 합계)`;
    }
    return formatLocalAndUsd(
      stats.sales_summary.total_revenue,
      currency,
      exchangeRates,
    );
  })();

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>SKU별 30일 매출</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            매출 내림차순 · {stats.sales_summary.sku_count} SKU
            {isRegion && byCountry && (
              <>
                {" · "}
                {Object.entries(byCountry)
                  .map(([cc, v]) => {
                    const flag = countryOption(cc)?.flag ?? "";
                    return `${flag} ${cc} ${v.currency} ${Math.round(v.revenue).toLocaleString()}`;
                  })
                  .join(" / ")}
              </>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            fontFamily: "var(--font-mono)",
          }}
        >
          총 매출{" "}
          <b style={{ color: "var(--color-ink)", fontSize: 14 }}>
            {headerTotal}
          </b>
          {" · "}
          {stats.sales_summary.total_units.toLocaleString()}개
        </div>
      </div>

      {/* SKU 헬스 박스 — 4개 BP 시그널, 시각 위계 강화 */}
      <div
        style={{
          marginBottom: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 10,
        }}
      >
        {/* 1. 매출 집중도 — Pareto 막대 */}
        <SkuHealthCard
          label="매출 집중도"
          headline={`${top3Pct}%`}
          sublabel="Top 3 SKU가 매출 합계 차지"
          tone={top3Pct >= 70 ? "pos" : top3Pct >= 50 ? "info" : "neutral"}
          footer={
            top3Pct >= 70
              ? "강한 집중 → 시딩 SKU 명확"
              : top3Pct >= 50
                ? "중간 집중도"
                : "분산 → 시딩 SKU 다양"
          }
        >
          <ParetoStackBar
            top1Pct={top1Pct}
            top3Pct={top3Pct}
            top5Pct={top5Pct}
          />
        </SkuHealthCard>

        {/* 2. 카테고리 분포 */}
        <SkuHealthCard
          label={`카테고리 (${catByRev.length}개)`}
          headline={
            catByRev[0]
              ? `${fmtPctRev(catByRev[0].revenue)}%`
              : "—"
          }
          sublabel={
            catByRev[0]
              ? `${catByRev[0].cat.length > 22 ? `${catByRev[0].cat.slice(0, 22)}…` : catByRev[0].cat} (${catByRev[0].count} SKU)`
              : ""
          }
          tone="neutral"
          footer={
            catByRev[1]
              ? `2위 ${catByRev[1].cat.length > 18 ? `${catByRev[1].cat.slice(0, 18)}…` : catByRev[1].cat} ${fmtPctRev(catByRev[1].revenue)}%`
              : "—"
          }
        >
          <CategoryBar
            cats={catByRev.slice(0, 5).map((c) => ({
              label: c.cat,
              pct: fmtPctRev(c.revenue),
            }))}
            othersPct={
              catByRev.length > 5
                ? catByRev
                    .slice(5)
                    .reduce((s, c) => s + fmtPctRev(c.revenue), 0)
                : 0
            }
          />
        </SkuHealthCard>

        {/* 3. 출시 시기 매출 비중 */}
        <SkuHealthCard
          label="신상 매출 비중"
          headline={`${fmtPctRev(ageBuckets.revs.fresh)}%`}
          sublabel={`출시 1년 내 SKU ${ageBuckets.counts.fresh}개`}
          tone={
            fmtPctRev(ageBuckets.revs.fresh) >= 40
              ? "pos"
              : fmtPctRev(ageBuckets.revs.fresh) >= 20
                ? "info"
                : "neutral"
          }
          footer={
            fmtPctRev(ageBuckets.revs.fresh) >= 40
              ? "신상 매출 비중 큼 → 시딩 push 시그널"
              : fmtPctRev(ageBuckets.revs.fresh) >= 20
                ? "신상이 일부 기여"
                : "레거시 위주 매출"
          }
        >
          <AgeStackBar
            freshPct={fmtPctRev(ageBuckets.revs.fresh)}
            midPct={fmtPctRev(ageBuckets.revs.mid)}
            legacyPct={fmtPctRev(ageBuckets.revs.legacy)}
            unknownPct={fmtPctRev(ageBuckets.revs.unknown)}
            counts={ageBuckets.counts}
          />
        </SkuHealthCard>

      </div>

      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--color-g400)",
                fontWeight: 700,
                borderBottom: "1px solid var(--color-g100)",
              }}
            >
              ASIN
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 10px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--color-g400)",
                fontWeight: 700,
                borderBottom: "1px solid var(--color-g100)",
              }}
            >
              제품명
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--color-g400)",
                fontWeight: 700,
                borderBottom: "1px solid var(--color-g100)",
              }}
            >
              판매량
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--color-g400)",
                fontWeight: 700,
                borderBottom: "1px solid var(--color-g100)",
              }}
            >
              매출
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 10px",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--color-g400)",
                fontWeight: 700,
                borderBottom: "1px solid var(--color-g100)",
              }}
            >
              BSR
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleSkus.map((s) => {
            const w = s.revenue > 0 ? (s.revenue / max) * 100 : 0;
            return (
              <tr key={s.asin}>
                <td
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--color-g100)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono"
                        style={{
                          fontWeight: 700,
                          color: "var(--color-info)",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        {s.asin} ↗
                      </a>
                    ) : (
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {s.asin}
                      </span>
                    )}
                    {isRegion && s.country && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: "var(--color-g50)",
                          color: "var(--color-g500)",
                        }}
                      >
                        {s.country}
                      </span>
                    )}
                  </span>
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--color-g100)",
                    color: "var(--color-g500)",
                    maxWidth: 320,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={s.name}
                >
                  {s.name}
                  {(() => {
                    const meta = skuMeta?.[s.asin];
                    const launch = formatLaunch(meta?.launch_date);
                    if (!meta?.subcategory && !launch) return null;
                    return (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: "var(--color-g400)",
                          fontFamily: "var(--font-mono)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {meta?.subcategory ?? ""}
                        {meta?.subcategory && launch ? " · " : ""}
                        {launch ?? ""}
                      </div>
                    );
                  })()}
                  <div
                    style={{
                      marginTop: 3,
                      width: "100%",
                      height: 4,
                      background: "var(--color-g50)",
                      borderRadius: 2,
                    }}
                  >
                    <div
                      style={{
                        width: `${w}%`,
                        height: "100%",
                        background: "var(--color-ink)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    borderBottom: "1px solid var(--color-g100)",
                    color:
                      s.units > 0 ? "var(--color-g500)" : "var(--color-g300)",
                  }}
                >
                  {s.units > 0 ? `${s.units.toLocaleString()}개` : "—"}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontWeight: 700,
                    borderBottom: "1px solid var(--color-g100)",
                    color:
                      s.revenue > 0 ? "var(--color-ink)" : "var(--color-g300)",
                  }}
                >
                  {formatLocalAndUsd(s.revenue, s.currency, exchangeRates)}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    borderBottom: "1px solid var(--color-g100)",
                    color: "var(--color-g500)",
                  }}
                >
                  {s.bsr_latest?.toLocaleString() ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {skuCount > 5 && (
        <div
          style={{
            marginTop: 8,
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "5px 12px",
              borderRadius: 5,
              border: "1px solid var(--color-g200)",
              background: "white",
              color: "var(--color-g600)",
              cursor: "pointer",
            }}
          >
            {showAll
              ? `Top 5만 보기`
              : `전체 ${skuCount}개 SKU 보기 (현재 5개)`}
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SKU 헬스 박스 — 카드 + 시각 막대 헬퍼들
// =============================================================================

function SkuHealthCard({
  label,
  headline,
  sublabel,
  footer,
  tone,
  children,
}: {
  label: string;
  headline: string;
  sublabel: string;
  footer?: string;
  tone: "pos" | "info" | "neutral";
  children?: React.ReactNode;
}) {
  const headlineColor =
    tone === "pos"
      ? "var(--color-pos)"
      : tone === "info"
        ? "var(--color-info)"
        : "var(--color-ink)";
  return (
    <div
      style={{
        background: "var(--color-g25)",
        borderRadius: 6,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: headlineColor,
          fontFamily: "var(--font-mono)",
          lineHeight: 1.1,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-g600)",
          lineHeight: 1.4,
        }}
      >
        {sublabel}
      </div>
      {children}
      {footer && (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

// Pareto 스택 막대: Top 1 / Top 2-3 / Top 4-5 / 그 외
function ParetoStackBar({
  top1Pct,
  top3Pct,
  top5Pct,
}: {
  top1Pct: number;
  top3Pct: number;
  top5Pct: number;
}) {
  const seg1 = top1Pct;
  const seg23 = Math.max(0, top3Pct - top1Pct);
  const seg45 = Math.max(0, top5Pct - top3Pct);
  const others = Math.max(0, 100 - top5Pct);
  return (
    <div style={{ marginTop: 2 }}>
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 3,
          overflow: "hidden",
          background: "var(--color-g100)",
        }}
      >
        <div
          style={{ width: `${seg1}%`, background: "var(--color-ink)" }}
          title={`Top 1: ${top1Pct}%`}
        />
        <div
          style={{ width: `${seg23}%`, background: "var(--color-g600)" }}
          title={`Top 2-3: ${seg23}% (누적 ${top3Pct}%)`}
        />
        <div
          style={{ width: `${seg45}%`, background: "var(--color-g400)" }}
          title={`Top 4-5: ${seg45}% (누적 ${top5Pct}%)`}
        />
        <div
          style={{ width: `${others}%`, background: "var(--color-g200)" }}
          title={`나머지: ${others}%`}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          marginTop: 3,
        }}
      >
        <span>Top1 {top1Pct}%</span>
        <span>Top3 {top3Pct}%</span>
        <span>Top5 {top5Pct}%</span>
      </div>
    </div>
  );
}

// 카테고리 가로 스택 막대 (Top 5 + 그 외)
function CategoryBar({
  cats,
  othersPct,
}: {
  cats: { label: string; pct: number }[];
  othersPct: number;
}) {
  const palette = [
    "var(--color-info)",
    "var(--color-warn)",
    "var(--color-pos)",
    "var(--color-accent)",
    "var(--color-g500)",
  ];
  return (
    <div
      style={{
        display: "flex",
        height: 10,
        borderRadius: 3,
        overflow: "hidden",
        background: "var(--color-g100)",
        marginTop: 2,
      }}
    >
      {cats.map((c, i) => (
        <div
          key={c.label}
          style={{
            width: `${c.pct}%`,
            background: palette[i] ?? "var(--color-g300)",
          }}
          title={`${c.label}: ${c.pct}%`}
        />
      ))}
      {othersPct > 0 && (
        <div
          style={{ width: `${othersPct}%`, background: "var(--color-g200)" }}
          title={`그 외: ${othersPct}%`}
        />
      )}
    </div>
  );
}

// 출시 시기 스택 막대: 신상 / 중기 / 레거시 / 미상
function AgeStackBar({
  freshPct,
  midPct,
  legacyPct,
  unknownPct,
  counts,
}: {
  freshPct: number;
  midPct: number;
  legacyPct: number;
  unknownPct: number;
  counts: { fresh: number; mid: number; legacy: number; unknown: number };
}) {
  return (
    <div style={{ marginTop: 2 }}>
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 3,
          overflow: "hidden",
          background: "var(--color-g100)",
        }}
      >
        <div
          style={{ width: `${freshPct}%`, background: "var(--color-pos)" }}
          title={`신상 1년 내: ${freshPct}% (${counts.fresh} SKU)`}
        />
        <div
          style={{ width: `${midPct}%`, background: "var(--color-info)" }}
          title={`1~3년: ${midPct}% (${counts.mid} SKU)`}
        />
        <div
          style={{ width: `${legacyPct}%`, background: "var(--color-g500)" }}
          title={`3년+: ${legacyPct}% (${counts.legacy} SKU)`}
        />
        {unknownPct > 0 && (
          <div
            style={{ width: `${unknownPct}%`, background: "var(--color-g200)" }}
            title={`미상: ${unknownPct}% (${counts.unknown} SKU)`}
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          fontSize: 9,
          color: "var(--color-g500)",
          fontFamily: "var(--font-mono)",
          marginTop: 3,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--color-pos)" }}>
          ● 신상 {freshPct}%
        </span>
        <span style={{ color: "var(--color-info)" }}>
          ● 1~3년 {midPct}%
        </span>
        <span>● 3년+ {legacyPct}%</span>
      </div>
    </div>
  );
}

