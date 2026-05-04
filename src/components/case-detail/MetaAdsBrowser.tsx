"use client";

import { useMemo, useState } from "react";
import type { MetaAdListItem } from "@/app/cases/[id]/page";
import type { LandingType, Phase4aStats } from "@/lib/inngest/types";

const PAGE_SIZE = 6;

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
  const [activeOnly, setActiveOnly] = useState(false);
  const [brandOfficialOnly, setBrandOfficialOnly] = useState(true);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    return ads.filter((a) => {
      if (selectedMonth !== "all") {
        if (!a.start_date || a.start_date.slice(0, 7) !== selectedMonth) {
          return false;
        }
      }
      if (activeOnly && !a.is_active) return false;
      if (brandOfficialOnly && !a.is_brand_official) return false;
      if (selectedLanding !== "all") {
        const landing = adLandings.get(a.id) ?? "none";
        if (landing !== selectedLanding) return false;
      }
      return true;
    });
  }, [
    ads,
    selectedMonth,
    activeOnly,
    brandOfficialOnly,
    selectedLanding,
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
          title={ad.page_name ?? ""}
        >
          {ad.page_name ?? "(unknown)"}
        </div>
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
