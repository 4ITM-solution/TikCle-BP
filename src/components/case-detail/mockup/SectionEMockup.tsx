"use client";

import { useMemo, useState } from "react";
import type { Phase4aStats, LandingType } from "@/lib/inngest/types";

/** MetaAdEntry 또는 page.tsx 의 MetaAdListItem 둘 다 받기 위한 lax type. */
type AdLike = {
  ad_archive_id: string | null;
  page_name: string | null;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  body_text: string | null;
  thumbnail_url: string | null;
  link_url: string | null;
  is_brand_official: boolean;
  landing?: LandingType;
};

/**
 * SectionEMockup — mockup line 1285-1351 1:1 React 변환.
 *
 * mockup CSS class 그대로 사용 (.bp-mockup wrapper 안):
 *   .section-h, .kpi-grid, .kpi, .ad-toolbar, .ad-search, .ad-check,
 *   .ad-grid, .ad-card, .ad-thumb, .ad-badges, .ad-badge.active/.brand/.partner,
 *   .ad-info, .ad-page, .ad-partner, .ad-date, .ad-body,
 *   .load-more, .dist-row, .dist-bar, .dist-fill.amazon/.ig, .ch-pill.pill-tk/.pill-ig/.pill-yt
 *
 * 데이터:
 *   - phase4a: total_ads / active_ads / brand_official_ads / partnership_ads
 *              partner_creators / formats / landings / cost_actual_usd
 *   - metaAdsList: 광고 grid (filter 적용 가능)
 */
export function SectionEMockup({
  phase4a,
  metaAdsList,
  partnerChannelMap,
}: {
  phase4a: Phase4aStats;
  metaAdsList?: AdLike[];
  /** creator_page_name 정규화 → 다른 채널 활동 (TK/IG/YT count + 팔로워).
   * page.tsx 에서 crossPlatformMatches + top_creators handle 매칭으로 만듦. */
  partnerChannelMap?: Record<string, { tk: number; ig: number; yt: number; follower?: number | null }>;
}) {
  const [search, setSearch] = useState("");
  const [landingFilter, setLandingFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [brandOnly, setBrandOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [retailerOnly, setRetailerOnly] = useState(false);
  const [showCount, setShowCount] = useState(8);

  const ads = metaAdsList ?? phase4a.ads_preview ?? [];

  // 데이터 자체 없으면 (brand_meta_pages 비어있어 분석 skip 등) 빈 mockup 대신 짧은 "—"
  if (phase4a.total_ads === 0) {
    return (
      <div className="section" id="sec-e">
        <div className="section-h">
          <span className="letter">E</span>
          <span className="title">Meta 광고 + Partnership</span>
          <span className="sub">★ 필터 + 더보기 + partnership cross-channel</span>
        </div>
        <div style={{ padding: 16, background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
          —{phase4a.skipped_reason ? ` (${phase4a.skipped_reason})` : ""}
        </div>
      </div>
    );
  }

  // ── 광고 3분류: 본사 / 유통 retailer / 인플 partnership ──
  // is_brand_official=true → 본사
  // is_brand_official=false + page_name 안 retailer keyword 매칭 → 유통
  // 그 외 → 인플
  const RETAILER_KEYWORDS = [
    "walmart", "target", "sephora", "ulta", "amazon", "costco", "sams club",
    "kroger", "cvs", "walgreens", "rite aid", "best buy", "macy", "kohls",
    "jcpenney", "nordstrom", "tj maxx", "marshalls", "ross", "ikea",
    "home depot", "lowes", "qvc", "hsn", "publix", "wegmans", "whole foods",
    "shoppe", "shopee", "lazada", "tokopedia",
  ];
  const isRetailer = (pageName: string | null): boolean => {
    if (!pageName) return false;
    const lower = pageName.toLowerCase();
    return RETAILER_KEYWORDS.some((kw) => lower.includes(kw));
  };
  const classifyAd = (ad: AdLike): "brand" | "retailer" | "partner" => {
    if (ad.is_brand_official) return "brand";
    if (isRetailer(ad.page_name)) return "retailer";
    return "partner";
  };

  // ── 필터 적용 ──
  const filteredAds = useMemo(() => {
    let r = ads;
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(
        (a) =>
          (a.body_text ?? "").toLowerCase().includes(s) ||
          (a.page_name ?? "").toLowerCase().includes(s),
      );
    }
    if (landingFilter !== "all") {
      r = r.filter((a) => a.landing === landingFilter);
    }
    if (formatFilter !== "all") {
      r = r.filter((a) => (a.format ?? "").toLowerCase() === formatFilter.toLowerCase());
    }
    if (brandOnly) r = r.filter((a) => classifyAd(a) === "brand");
    if (retailerOnly) r = r.filter((a) => classifyAd(a) === "retailer");
    if (partnerOnly) r = r.filter((a) => classifyAd(a) === "partner");
    if (activeOnly) r = r.filter((a) => a.is_active);
    return r;
  }, [ads, search, landingFilter, formatFilter, brandOnly, activeOnly, partnerOnly, retailerOnly]);

  const displayed = filteredAds.slice(0, showCount);
  const moreCount = Math.max(0, filteredAds.length - showCount);

  // ── C2: 광고 promo code 추출 (regex) ──
  // patterns: "use CODE", "with CODE", "promo CODE", "code: CODE" / "CODE10" 자체
  const codeMap = new Map<string, number>(); // code → ad count
  const PROMO_RE_1 = /(?:use|with|enter|apply|promo|code|coupon|discount|save)[:\s]+([A-Z][A-Z0-9]{3,14})\b/g;
  const PROMO_RE_2 = /\b([A-Z]{3,12}\d{1,3})\b/g;
  for (const a of ads) {
    const text = (a.body_text ?? "").toUpperCase();
    if (!text) continue;
    const seen = new Set<string>();
    let m;
    PROMO_RE_1.lastIndex = 0;
    while ((m = PROMO_RE_1.exec(text)) !== null) {
      const code = m[1];
      if (code) seen.add(code);
    }
    PROMO_RE_2.lastIndex = 0;
    while ((m = PROMO_RE_2.exec(text)) !== null) {
      const code = m[1];
      // common 단어 제외 (예: ALL20, NEW10 등 일반 단어성 우회 — 단어 시작 + 숫자만 통과)
      if (code && code.length >= 4 && /^[A-Z]+\d+$/.test(code)) {
        seen.add(code);
      }
    }
    for (const code of seen) {
      codeMap.set(code, (codeMap.get(code) ?? 0) + 1);
    }
  }
  const topCodes = [...codeMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 6);

  // ── KPI ──
  const brandPct =
    phase4a.total_ads > 0
      ? Math.round((phase4a.brand_official_ads / phase4a.total_ads) * 100)
      : 0;

  // ★ 광고 3분류 카운트 (fetched ads sample 안 — ads_preview 또는 metaAdsList)
  const adCls = { brand: 0, retailer: 0, partner: 0 };
  for (const ad of ads) {
    adCls[classifyAd(ad)] += 1;
  }
  const adClsTotal = adCls.brand + adCls.retailer + adCls.partner || 1;
  const amazonCount = phase4a.landings.amazon ?? 0;
  const dtcCount = phase4a.landings.dtc ?? 0;
  const amazonPct =
    phase4a.total_ads > 0 ? Math.round((amazonCount / phase4a.total_ads) * 100) : 0;
  const dtcPct =
    phase4a.total_ads > 0 ? Math.round((dtcCount / phase4a.total_ads) * 100) : 0;

  // ── landing 분포 ──
  const landingRows = [
    { key: "amazon", label: "Amazon", n: amazonCount, cls: "amazon" },
    { key: "dtc", label: "DTC", n: dtcCount, cls: "" },
    { key: "instagram", label: "Instagram", n: phase4a.landings.instagram ?? 0, cls: "ig" },
    { key: "facebook", label: "Facebook", n: phase4a.landings.facebook ?? 0, cls: "" },
    { key: "tiktok_shop", label: "TT Shop", n: phase4a.landings.tiktok_shop ?? 0, cls: "" },
    { key: "other", label: "기타 도메인", n: phase4a.landings.other ?? 0, cls: "" },
    { key: "none", label: "랜딩 없음", n: phase4a.landings.none ?? 0, cls: "" },
  ].filter((r) => r.n > 0);

  const totalLanding =
    landingRows.reduce((s, r) => s + r.n, 0) || phase4a.total_ads || 1;

  // ── format 분포 ──
  const formatRows = [
    { key: "video", label: "VIDEO", n: phase4a.formats.video },
    { key: "image", label: "IMAGE", n: phase4a.formats.image },
    { key: "other", label: "기타", n: phase4a.formats.other },
  ].filter((r) => r.n > 0);
  const totalFormat = formatRows.reduce((s, r) => s + r.n, 0) || 1;

  // ── 5 KPI (mockup) ──
  return (
    <div className="section" id="sec-e">
      <div className="section-h">
        <span className="letter">E</span>
        <span className="title">Meta 광고 + Partnership</span>
        <span className="sub">★ 필터 + 더보기 + partnership cross-channel</span>
      </div>

      <div
        className="kpi-grid"
        style={{ marginBottom: 16, gridTemplateColumns: "repeat(5, 1fr)" }}
      >
        <div className="kpi">
          <div className="kpi-label">총 광고</div>
          <div className="kpi-val">{(phase4a.total_ads ?? 0).toLocaleString()}</div>
          <div className="kpi-sub">active {phase4a.active_ads ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">🏢 본사 직접</div>
          <div className="kpi-val">{(phase4a.brand_official_ads ?? 0).toLocaleString()}</div>
          <div className="kpi-sub">{brandPct}%</div>
        </div>
        <div className="kpi" title="유통 retailer (Walmart/Target/Sephora 등) — 본사 비용 X">
          <div className="kpi-label">🛒 유통 retailer</div>
          <div className="kpi-val">{(adCls.retailer ?? 0).toLocaleString()}</div>
          <div className="kpi-sub">샘플 안 {Math.round(((adCls.retailer ?? 0) / adClsTotal) * 100)}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">👤 인플 partnership ★</div>
          <div className="kpi-val">{(phase4a.partnership_ads ?? 0).toLocaleString()}</div>
          <div className="kpi-sub">{phase4a.partnership_creators ?? 0}명 인플</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">landing → Amazon</div>
          <div className="kpi-val">{amazonPct}%</div>
          <div className="kpi-sub">DTC {dtcPct}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">분석 비용</div>
          <div className="kpi-val">${phase4a.cost_actual_usd.toFixed(2)}</div>
          <div className="kpi-sub">하이브리드</div>
        </div>
      </div>

      {/* 광고 필터 toolbar */}
      <div className="ad-toolbar">
        <input
          className="ad-search"
          placeholder="🔍 광고 body / page name 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={landingFilter}
          onChange={(e) => setLandingFilter(e.target.value)}
        >
          <option value="all">전체 landing</option>
          {landingRows.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label} ({r.n})
            </option>
          ))}
        </select>
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
        >
          <option value="all">전체 format</option>
          {formatRows.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label} ({r.n})
            </option>
          ))}
        </select>
        <label className="ad-check">
          <input
            type="checkbox"
            checked={brandOnly}
            onChange={(e) => setBrandOnly(e.target.checked)}
          />{" "}
          본사만
        </label>
        <label className="ad-check">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />{" "}
          active만
        </label>
        <label className="ad-check">
          <input
            type="checkbox"
            checked={retailerOnly}
            onChange={(e) => setRetailerOnly(e.target.checked)}
          />{" "}
          🛒 유통만
        </label>
        <label className="ad-check">
          <input
            type="checkbox"
            checked={partnerOnly}
            onChange={(e) => setPartnerOnly(e.target.checked)}
          />{" "}
          👤 인플만
        </label>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#6b7280" }}>
          {filteredAds.length} / {ads.length} 표시
        </span>
      </div>

      {/* 광고 grid */}
      <div className="ad-grid">
        {displayed.map((ad) => (
          <a
            key={ad.ad_archive_id ?? `${ad.page_name}-${ad.start_date}`}
            className="ad-card"
            href={
              ad.ad_archive_id
                ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}`
                : ad.link_url ?? "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div className="ad-thumb">
              {ad.thumbnail_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ad.thumbnail_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
              <div className="ad-badges">
                {ad.is_active && <span className="ad-badge active">active</span>}
                {(() => {
                  const cls = classifyAd(ad);
                  if (cls === "brand") {
                    return <span className="ad-badge brand" title="본사 직접 광고">🏢 본사</span>;
                  }
                  if (cls === "retailer") {
                    return (
                      <span
                        className="ad-badge"
                        title="유통 retailer 광고 (본사 비용 X)"
                        style={{ background: "#06b6d4", color: "white" }}
                      >
                        🛒 유통
                      </span>
                    );
                  }
                  return <span className="ad-badge partner" title="인플 partnership 광고">👤 인플</span>;
                })()}
              </div>
            </div>
            <div className="ad-info">
              <div className="ad-page">{ad.page_name ?? "—"}</div>
              {!ad.is_brand_official && (
                <div className="ad-partner">× partnership</div>
              )}
              <div className="ad-date">
                {ad.start_date ?? "—"} {ad.is_active ? "~" : `~ ${ad.end_date ?? ""}`}
              </div>
              <div className="ad-body">
                {ad.body_text
                  ? ad.body_text.length > 90
                    ? `${ad.body_text.slice(0, 90)}…`
                    : ad.body_text
                  : "—"}
              </div>
            </div>
          </a>
        ))}
      </div>
      {moreCount > 0 && (
        <button
          type="button"
          className="load-more"
          onClick={() => setShowCount((c) => c + 12)}
        >
          + {moreCount}개 광고 더보기
        </button>
      )}

      {/* landing + format 분포 (2-col) */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            광고 landing 분포
          </div>
          {landingRows.map((r) => {
            const pct = Math.round((r.n / totalLanding) * 100);
            return (
              <div key={r.key} className="dist-row">
                <span>{r.label}</span>
                <div className="dist-bar">
                  <div className={`dist-fill ${r.cls}`} style={{ width: `${pct}%` }} />
                </div>
                <span style={{ textAlign: "right" }}>{r.n}</span>
                <span style={{ color: "#9ca3af", textAlign: "right" }}>{pct}%</span>
              </div>
            );
          })}
          {(phase4a.other_top_domains ?? []).length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#9ca3af" }}>
              기타 Top: {phase4a.other_top_domains.slice(0, 3).map((d) => d.domain).join(" · ")}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>광고 format</div>
          {formatRows.map((r) => {
            const pct = Math.round((r.n / totalFormat) * 100);
            return (
              <div key={r.key} className="dist-row">
                <span>{r.label}</span>
                <div className="dist-bar">
                  <div className="dist-fill" style={{ width: `${pct}%` }} />
                </div>
                <span style={{ textAlign: "right" }}>{r.n}</span>
                <span style={{ color: "#9ca3af", textAlign: "right" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* C2: 광고 promo code 추출 카드 */}
      {topCodes.length > 0 && (
        <div
          style={{
            marginTop: 18,
            padding: 12,
            border: "1px solid #fde68a",
            borderRadius: 6,
            background: "#fffbeb",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#92400e" }}>
            🎟 광고 promo code 추출 ({topCodes.length}개) — body_text regex
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {topCodes.map(([code, n]) => (
              <span
                key={code}
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  padding: "4px 8px",
                  border: "1px solid #d97706",
                  borderRadius: 3,
                  background: "white",
                  color: "#92400e",
                  fontWeight: 700,
                }}
              >
                {code} <span style={{ color: "#b45309", fontWeight: 400 }}>×{n}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#92400e", marginTop: 6 }}>
            ※ 전체 광고 body_text 에서 추출 (use code / promo / coupon 패턴 + 단어+숫자 형식)
          </div>
        </div>
      )}

      {/* partnership 인플 테이블 */}
      {phase4a.partner_creators && phase4a.partner_creators.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 8 }}>
            파트너 인플 {phase4a.partner_creators.length}명 — cross-channel ★
          </div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>인플</th>
                <th style={{ textAlign: "right" }}>팔로워</th>
                <th style={{ textAlign: "right" }}>광고</th>
                <th>다른 채널 활동</th>
                <th>활동 기간</th>
              </tr>
            </thead>
            <tbody>
              {phase4a.partner_creators.slice(0, 5).map((c) => {
                // partnerChannelMap 에서 normalize 매칭 — name 기준
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                const xc = partnerChannelMap?.[norm(c.creator_page_name)];
                return (
                  <tr key={c.creator_page_name}>
                    <td>
                      <span
                        className="thumb"
                        style={{
                          background: c.sample_thumbnail
                            ? `url(${c.sample_thumbnail}) center/cover`
                            : undefined,
                        }}
                      />
                    </td>
                    <td>
                      <b>{c.creator_page_name}</b>
                      {c.partner_page_name && (
                        <span style={{ color: "#6b7280", fontSize: 10 }}>
                          {" "}× {c.partner_page_name}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#6b7280" }}>
                      {xc?.follower ? formatFollowers(xc.follower) : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {c.ad_count}
                    </td>
                    <td>
                      {xc && (xc.tk > 0 || xc.ig > 0 || xc.yt > 0) ? (
                        <>
                          {xc.tk > 0 && <span className="ch-pill pill-tk">TK{xc.tk}</span>}
                          {xc.ig > 0 && <span className="ch-pill pill-ig">IG{xc.ig}</span>}
                          {xc.yt > 0 && <span className="ch-pill pill-yt">YT{xc.yt}</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 10, color: "#6b7280" }}>
                      {c.first_seen ?? "—"}
                      {c.first_seen !== c.last_seen && c.last_seen ? ` ~ ${c.last_seen}` : ""}
                    </td>
                  </tr>
                );
              })}
              {phase4a.partner_creators.length > 5 && (
                <tr style={{ color: "#9ca3af" }}>
                  <td colSpan={6} style={{ textAlign: "center", padding: 8 }}>
                    + {phase4a.partner_creators.length - 5}명 더보기
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function formatFollowers(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}
