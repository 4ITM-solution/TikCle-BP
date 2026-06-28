"use client";

import { useMemo, useState } from "react";
import type { MetaAdListItem } from "@/app/cases/[id]/page";
import type { LandingType, Phase4aStats } from "@/lib/inngest/types";

const PAGE_SIZE = 6;

// 광고 집행기간(일) + 라이프사이클 단계.
//   test  = 1~3일 (초기 테스트에서 솎인 것 — 대량테스트 묘지)
//   scaled= 7일+ (스케일까지 살아남은 것 = 진짜 효율 신호)
function adDays(a: MetaAdListItem): number {
  if (!a.start_date) return 0;
  const end = a.end_date ? new Date(a.end_date) : new Date();
  const d = (end.getTime() - new Date(a.start_date).getTime()) / 86400000;
  return Math.max(0, Math.round(d));
}
function lifecycle(days: number): "test" | "mid" | "scaled" {
  if (days >= 7) return "scaled";
  if (days <= 3) return "test";
  return "mid";
}

const ORIGIN_LABEL: Record<string, string> = {
  ugc_as_is: "인플 원본(as-is)",
  ugc_processed: "인플 가공",
  brand_produced: "브랜드 제작",
};

/**
 * 광고 인텔 롤업 — 라이프사이클 분리로 평균 오염(테스트 묘지) 회피.
 * scaled(7일+) 광고만으로 hook/origin별 효율을 보여줌.
 */
function AdIntelRollup({ ads }: { ads: MetaAdListItem[] }) {
  const data = useMemo(() => {
    const tagged = ads.filter((a) => a.ad_intel);
    if (tagged.length === 0) return null;
    const enriched = tagged.map((a) => {
      const days = adDays(a);
      return { a, days, stage: lifecycle(days) };
    });
    const total = enriched.length;
    const stageCounts = { test: 0, mid: 0, scaled: 0 };
    for (const e of enriched) stageCounts[e.stage] += 1;

    const groupBy = (key: (i: (typeof enriched)[number]) => string | undefined) => {
      const m = new Map<
        string,
        { n: number; scaled: number; scaledMaxDays: number; scaledSumDays: number }
      >();
      for (const e of enriched) {
        const k = key(e) ?? "(없음)";
        const g = m.get(k) ?? { n: 0, scaled: 0, scaledMaxDays: 0, scaledSumDays: 0 };
        g.n += 1;
        if (e.stage === "scaled") {
          g.scaled += 1;
          g.scaledSumDays += e.days;
          g.scaledMaxDays = Math.max(g.scaledMaxDays, e.days);
        }
        m.set(k, g);
      }
      return [...m.entries()]
        .map(([k, v]) => ({
          k,
          ...v,
          scaledAvg: v.scaled > 0 ? Math.round(v.scaledSumDays / v.scaled) : 0,
        }))
        .sort((x, y) => y.scaledMaxDays - x.scaledMaxDays || y.n - x.n);
    };

    return {
      total,
      stageCounts,
      byOrigin: groupBy((e) => e.a.ad_intel?.origin_class),
      byHook: groupBy((e) => e.a.ad_intel?.hook_type),
    };
  }, [ads]);

  if (!data) return null;

  const Row = ({
    label,
    n,
    scaled,
    avg,
    max,
    maxBar,
  }: {
    label: string;
    n: number;
    scaled: number;
    avg: number;
    max: number;
    maxBar: number;
  }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 0.5fr 1.6fr 0.7fr",
        gap: 8,
        alignItems: "center",
        fontSize: 11,
        padding: "3px 0",
      }}
    >
      <div style={{ color: "var(--color-ink)", fontWeight: 600 }}>
        {ORIGIN_LABEL[label] ?? label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-g400)" }}>
        {n}개
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--color-accent)",
            width: `${maxBar > 0 ? Math.max(4, (max / maxBar) * 100) : 0}%`,
            minWidth: max > 0 ? 4 : 0,
          }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-g500)" }}>
          max {max}일
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-g400)" }}>
        {scaled > 0 ? `평균 ${avg}일·${scaled}건` : "—"}
      </div>
    </div>
  );

  const hookMaxBar = Math.max(1, ...data.byHook.map((r) => r.scaledMaxDays));
  const originMaxBar = Math.max(1, ...data.byOrigin.map((r) => r.scaledMaxDays));

  return (
    <div
      style={{
        border: "1px solid var(--color-g100)",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 14,
        background: "var(--color-g25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>🔬 광고 인텔 — 효율 패턴</div>
        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-g400)" }}>
          {data.total}개 분석 · scaled(7일+) {data.stageCounts.scaled} / mid {data.stageCounts.mid} / test(≤3일) {data.stageCounts.test}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--color-g400)", marginBottom: 8 }}>
        대량테스트(test)가 평균을 오염시키므로 <b>scaled(7일+) 광고 기준</b>으로 효율 표시
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-g500)", margin: "6px 0 2px" }}>
        HOOK별
      </div>
      {data.byHook.slice(0, 8).map((r) => (
        <Row key={`h-${r.k}`} label={r.k} n={r.n} scaled={r.scaled} avg={r.scaledAvg} max={r.scaledMaxDays} maxBar={hookMaxBar} />
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-g500)", margin: "10px 0 2px" }}>
        ORIGIN별 (인플 원본 vs 가공 vs 브랜드제작)
      </div>
      {data.byOrigin.map((r) => (
        <Row key={`o-${r.k}`} label={r.k} n={r.n} scaled={r.scaled} avg={r.scaledAvg} max={r.scaledMaxDays} maxBar={originMaxBar} />
      ))}
    </div>
  );
}

const LANDING_OPTIONS: Array<{ key: "all" | LandingType; label: string }> = [
  { key: "all", label: "전체 랜딩" },
  { key: "dtc", label: "자사몰 (DTC)" },
  { key: "amazon", label: "Amazon" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok_shop", label: "TikTok Shop" },
  { key: "facebook", label: "Facebook" },
  { key: "other", label: "기타" },
  { key: "none", label: "랜딩 없음" },
];

// brand_keyword 토큰이 도메인에 들어가는지 (DTC 분류와 동일 룰)
function classifyAdLanding(
  url: string | null,
  brandKeyword?: string | null,
): LandingType {
  if (!url) return "none";
  const real = url.toLowerCase();
  if (real.includes("instagram.com") || real.includes("instagr.am"))
    return "instagram";
  if (
    real.includes("amazon.com") ||
    real.includes("amzn.to") ||
    real.includes("a.co/") ||
    real.includes("amzn.com")
  ) {
    return "amazon";
  }
  if (real.includes("tiktok.com/shop")) return "tiktok_shop";
  if (real.includes("facebook.com") || real.includes("fb.com"))
    return "facebook";
  if (brandKeyword) {
    const tokens = brandKeyword
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3);
    if (tokens.length > 0 && tokens.some((t) => real.includes(t))) {
      return "dtc";
    }
  }
  return "other";
}

export function MetaAdsBrowser({
  ads,
  phase4a,
}: {
  ads: MetaAdListItem[];
  phase4a?: Phase4aStats;
}) {
  // 각 광고의 landing 카테고리 lazy 계산 (brand_keyword 정보는 phase4a 결과 활용 어려움 →
  // phase4a.landings의 분포만 직접 표시. 광고 list 자체 landing은 url 기반 추정)
  const adLandings = useMemo(() => {
    const m = new Map<string, LandingType>();
    for (const a of ads) {
      m.set(a.id, classifyAdLanding(a.link_url, null));
    }
    return m;
  }, [ads]);

  // 월 list (start_date YYYY-MM 기준 내림차순)
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const a of ads) {
      if (a.start_date) set.add(a.start_date.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [ads]);

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedLanding, setSelectedLanding] = useState<"all" | LandingType>(
    "all",
  );
  const [selectedFormat, setSelectedFormat] = useState<string>("all");
  const [searchQ, setSearchQ] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [brandOfficialOnly, setBrandOfficialOnly] = useState(true);
  const [partnershipOnly, setPartnershipOnly] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return ads.filter((a) => {
      if (selectedMonth !== "all") {
        if (!a.start_date || a.start_date.slice(0, 7) !== selectedMonth) {
          return false;
        }
      }
      if (activeOnly && !a.is_active) return false;
      if (brandOfficialOnly && !a.is_brand_official) return false;
      if (partnershipOnly && !a.partner_page_name) return false;
      if (selectedLanding !== "all") {
        const landing = adLandings.get(a.id) ?? "none";
        if (landing !== selectedLanding) return false;
      }
      if (selectedFormat !== "all") {
        if ((a.format ?? "").toLowerCase() !== selectedFormat) return false;
      }
      if (q) {
        const hay = `${a.page_name ?? ""} ${a.body_text ?? ""} ${a.partner_page_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    ads,
    selectedMonth,
    activeOnly,
    brandOfficialOnly,
    partnershipOnly,
    selectedLanding,
    selectedFormat,
    searchQ,
    adLandings,
  ]);

  // 정렬: brand_official → active → 최신순
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.is_brand_official !== b.is_brand_official) {
        return a.is_brand_official ? -1 : 1;
      }
      if ((a.is_active ?? false) !== (b.is_active ?? false)) {
        return a.is_active ? -1 : 1;
      }
      return (b.start_date ?? "").localeCompare(a.start_date ?? "");
    });
  }, [filtered]);

  const visible = sorted.slice(0, pageSize);
  const hasMore = sorted.length > pageSize;

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>광고 라이브러리</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            전체 {ads.length.toLocaleString()}개 →{" "}
            <b style={{ color: "var(--color-ink)" }}>
              {filtered.length.toLocaleString()}개
            </b>{" "}
            표시
            {brandOfficialOnly ? " · 본사만" : ""}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <input
            type="search"
            placeholder="🔍 검색 (page · body · partner)"
            value={searchQ}
            onChange={(e) => {
              setSearchQ(e.target.value);
              setPageSize(PAGE_SIZE);
            }}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
              minWidth: 180,
            }}
          />
          <select
            value={selectedFormat}
            onChange={(e) => {
              setSelectedFormat(e.target.value);
              setPageSize(PAGE_SIZE);
            }}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
              color: "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            <option value="all">전체 format</option>
            <option value="video">VIDEO</option>
            <option value="image">IMAGE</option>
            <option value="carousel">CAROUSEL</option>
            <option value="dco">DCO</option>
          </select>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--color-g600)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={partnershipOnly}
              onChange={(e) => {
                setPartnershipOnly(e.target.checked);
                setPageSize(PAGE_SIZE);
              }}
              style={{ cursor: "pointer" }}
            />
            partnership만
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setPageSize(PAGE_SIZE);
            }}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
              color: "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            <option value="all">전체 기간</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={selectedLanding}
            onChange={(e) => {
              setSelectedLanding(e.target.value as "all" | LandingType);
              setPageSize(PAGE_SIZE);
            }}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              border: "1px solid var(--color-g200)",
              borderRadius: 4,
              background: "white",
              color: "var(--color-ink)",
              cursor: "pointer",
            }}
          >
            {LANDING_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
            title="본사 페이지 광고만 (스타일코리안 등 유통 광고 제외)"
          >
            <input
              type="checkbox"
              checked={brandOfficialOnly}
              onChange={(e) => {
                setBrandOfficialOnly(e.target.checked);
                setPageSize(PAGE_SIZE);
              }}
            />
            본사만
          </label>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              fontFamily: "var(--font-mono)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPageSize(PAGE_SIZE);
              }}
            />
            active만
          </label>
        </div>
      </div>

      <AdIntelRollup ads={ads} />

      {visible.length === 0 ? (
        <div
          style={{
            padding: 20,
            background: "var(--color-g25)",
            borderRadius: 6,
            fontSize: 11,
            color: "var(--color-g400)",
            textAlign: "center",
          }}
        >
          조건에 맞는 광고 없음
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {visible.map((a) => (
            <AdCard key={a.id} ad={a} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setPageSize((s) => s + PAGE_SIZE)}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "8px 0",
            fontSize: 11,
            color: "var(--color-g500)",
            background: "transparent",
            border: "1px dashed var(--color-g200)",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + {sorted.length - pageSize}개 더보기
        </button>
      )}
    </div>
  );
}

function AdCard({ ad }: { ad: MetaAdListItem }) {
  const dateRange =
    ad.start_date && ad.end_date
      ? `${ad.start_date.slice(0, 10)} ~ ${ad.end_date.slice(0, 10)}`
      : ad.start_date
        ? `${ad.start_date.slice(0, 10)} ~`
        : "";

  return (
    <div
      style={{
        border: "1px solid var(--color-g100)",
        borderRadius: 6,
        overflow: "hidden",
        background: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "var(--color-g50)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {ad.video_url ? (
          <video
            src={ad.video_url}
            poster={ad.thumbnail_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              background: "black",
            }}
          />
        ) : ad.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={ad.thumbnail_url}
            alt={ad.page_name ?? "ad"}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {ad.is_brand_official && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 8,
                background: "var(--color-info)",
                color: "white",
              }}
            >
              본사
            </span>
          )}
          {ad.partner_page_name && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 8,
                background: "var(--color-accent)",
                color: "white",
              }}
              title={`Paid partnership with ${ad.partner_page_name}`}
            >
              partnership
            </span>
          )}
          {ad.is_active && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 8,
                background: "var(--color-pos)",
                color: "white",
              }}
            >
              active
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: "8px 10px", fontSize: 11 }}>
        <div
          style={{
            fontWeight: 700,
            color: "var(--color-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={ad.creator_page_name ?? ad.page_name ?? ""}
        >
          {ad.creator_page_name ?? ad.page_name ?? "(unknown)"}
        </div>
        {ad.partner_page_name && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              marginTop: 1,
            }}
            title={`Paid partnership with ${ad.partner_page_name}`}
          >
            × <b style={{ color: "var(--color-accent)" }}>{ad.partner_page_name}</b>
          </div>
        )}
        {dateRange && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
              marginTop: 2,
            }}
          >
            {dateRange}
          </div>
        )}
        {ad.ad_intel && (
          <div
            style={{
              display: "flex",
              gap: 3,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            {ad.ad_intel.origin_class && (
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 6,
                  background:
                    ad.ad_intel.origin_class === "ugc_as_is"
                      ? "#16a34a"
                      : ad.ad_intel.origin_class === "ugc_processed"
                        ? "#ea580c"
                        : "#64748b",
                  color: "white",
                }}
              >
                {ORIGIN_LABEL[ad.ad_intel.origin_class] ??
                  ad.ad_intel.origin_class}
              </span>
            )}
            {ad.ad_intel.hook_type && ad.ad_intel.hook_type !== "none" && (
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 6,
                  background: "var(--color-g100)",
                  color: "var(--color-g600)",
                }}
              >
                {ad.ad_intel.hook_type}
                {ad.ad_intel.hook_strength === "strong" ? " ⚡" : ""}
              </span>
            )}
            {ad.inferred_creator_handle && (
              <span
                style={{
                  fontSize: 8.5,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 6,
                  background: "var(--color-info)",
                  color: "white",
                }}
                title="UTM에서 추출한 소스 크리에이터"
              >
                @{ad.inferred_creator_handle}
              </span>
            )}
          </div>
        )}
        {ad.body_text && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-g500)",
              marginTop: 6,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.4,
            }}
            title={ad.body_text}
          >
            {ad.body_text}
          </div>
        )}
        {ad.link_url && (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              marginTop: 6,
              fontSize: 10,
              color: "var(--color-info)",
              textDecoration: "underline",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={ad.link_url}
          >
            랜딩 ↗
          </a>
        )}
      </div>
    </div>
  );
}
