"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BrandAutocomplete } from "@/components/case-create/BrandAutocomplete";
import {
  PlatformPicker,
  type PlatformValue,
} from "@/components/case-create/PlatformPicker";
import { MetaPagesInput } from "@/components/case-create/MetaPagesInput";
import { createCaseDraft, type ActionResult } from "./actions";
import {
  COUNTRY_OPTIONS,
  isRegionCode,
} from "@/lib/case-detail/countries";

// 드롭다운 구조:
//   - 단일 (헤더 X): US/KR/JP/EU
//   - 권역 통합 case (Hybrid): MENA/LATAM — 시딩 통합 + 매출 marketplace별 sub
//   - 동남아 SEA (국가별): SG/TH/MY/ID/PH/VN — 무조건 단일 case
//   - MENA 안 단일 분석: SA/AE
//   - LATAM 안 단일 분석: MX/AR/CO/CL/PE/BR (BR 포함 통합)
type DropdownGroup = {
  label: string | null; // null = optgroup 없이 평면 노출
  countries: typeof COUNTRY_OPTIONS;
};

const COUNTRY_GROUPS: DropdownGroup[] = [
  {
    label: null,
    countries: COUNTRY_OPTIONS.filter((o) =>
      ["US", "KR", "JP", "EU"].includes(o.code),
    ),
  },
  {
    label: "권역 통합 case (Hybrid — 시딩 통합 + 매출 국가별)",
    countries: COUNTRY_OPTIONS.filter((o) => isRegionCode(o.code)),
  },
  {
    label: "동남아 SEA (국가별)",
    countries: COUNTRY_OPTIONS.filter((o) => o.region === "SEA"),
  },
  {
    label: "MENA 안 단일 분석",
    countries: COUNTRY_OPTIONS.filter(
      (o) => o.region === "MENA" && !isRegionCode(o.code),
    ),
  },
  {
    label: "LATAM 안 단일 분석",
    countries: COUNTRY_OPTIONS.filter(
      (o) => o.region === "LATAM" && !isRegionCode(o.code),
    ),
  },
];

export default function NewCasePage() {
  // A 모델: platform 의미 제거 — 모든 field 항상 active (한 case 다채널 데이터 자유)
  const platform: PlatformValue = "amazon";
  const setPlatform: (p: PlatformValue) => void = () => undefined;
  // 변수 그대로 두되 분기 다 true (사용자 의도)
  void setPlatform;
  const [country, setCountry] = useState("US");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createCaseDraft,
    null,
  );

  // A 모델: 모든 field 항상 active. 분기 변수 = true (옛 코드 호환)
  const isAmazon = true;
  const isShop = true;
  const isShopee = true;
  void platform;
  // SEA TikTok Shop = Kalodata 경로 (스토어 URL 불필요)
  const SEA_COUNTRIES = ["SG", "MY", "TH", "ID", "VN", "PH"];
  const isShopUs = isShop && country === "US";
  const isShopSea = isShop && SEA_COUNTRIES.includes(country);

  return (
    <div style={{ padding: "24px 32px 140px", maxWidth: 920 }}>
      <nav className="breadcrumb">
        <Link href="/cases">My Cases</Link>
        <span className="sep">/</span>
        <span>새 케이스</span>
      </nav>

      <h1 className="page-title">새 케이스 만들기</h1>
      <p className="page-sub">
        브랜드·국가·플랫폼을 정하고, API 호출에 필요한 입력을 채워주세요. 데이터 업로드는 다음 단계에서 진행됩니다.
      </p>

      <form action={action}>
        {/* Section 1: 기본 정보 */}
        <section className="section-card" style={{ marginBottom: 14 }}>
          <div className="section-head">
            <span className="section-num">SECTION 01</span>
            <span className="section-title">기본 정보</span>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label">
                브랜드명 <span className="req">*</span>
              </label>
              <BrandAutocomplete name="brand_name" />
              <span className="field-help">
                기존 브랜드면 자동완성에서 선택. 신규면 그대로 입력.
              </span>
            </div>

            <div className="field">
              <label className="field-label">
                국가 <span className="req">*</span>
              </label>
              <select
                className="field-select"
                name="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRY_GROUPS.map((g, gi) =>
                  g.label === null ? (
                    g.countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.label})
                      </option>
                    ))
                  ) : (
                    <optgroup key={gi} label={g.label}>
                      {g.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code} ({c.label})
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
              <span className="field-help">
                권역 코드(MENA/LATAM)는 시딩 통합 + 매출 국가별 분리. 단일 국가는 시딩·매출 모두 단일.
              </span>
            </div>
          </div>

          {/* A 모델: 플랫폼/채널 선택 제거 — 한 case = 한 country, 데이터 추가하면서 다채널 활성.
              메인 채널 라벨 (cases.channel)은 hidden default "amazon" 로 박혀있음 (DB 호환).
              실제 사용은 case-detail 의 데이터 채널 그리드 — 사용자가 카드 클릭해서 다채널 자유 박힘. */}
          <input type="hidden" name="platform" value="amazon" />
        </section>

        {/* Section 2: 데이터 업로드 (placeholder) */}
        <section
          className="section-card"
          style={{ marginBottom: 14, opacity: 0.55 }}
        >
          <div className="section-head">
            <span className="section-num">SECTION 02</span>
            <span className="section-title">데이터 업로드</span>
            <span className="section-status todo">다음 단계</span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-g500)",
              lineHeight: 1.6,
            }}
          >
            🚧 케이스 생성 후 상세 페이지의 데이터 채널 그리드에서 각 채널 카드 클릭하여
            데이터 추가:
            <br />
            <b>TikTok 영상</b> (Exolyt CSV) · <b>TT Shop</b> (Helium10 / Kalodata) ·
            <b>Amazon</b> (매출 + BSR CSV) · <b>Shopee</b> (Shopdora) ·
            <b>Meta 광고</b> (brand 설정) · <b>Instagram / YouTube</b> (자동 발굴)
          </p>
        </section>

        {/* Section 3: API 입력 */}
        <section className="section-card" style={{ marginBottom: 80 }}>
          <div className="section-head">
            <span className="section-num">SECTION 03</span>
            <span className="section-title">API 호출용 입력</span>
          </div>

          <p
            style={{
              fontSize: 12,
              color: "var(--color-g500)",
              marginBottom: 16,
            }}
          >
            Apify로 외부 데이터를 가져옵니다. 호출은 다음 단계에서 비용 확인 후 시작.
          </p>

          {/* Amazon-only */}
          <div className="field" style={{ opacity: isAmazon ? 1 : 0.45 }}>
            <label className="field-label">
              브랜드 키워드
              {isAmazon ? (
                <span className="req">*</span>
              ) : (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    background: "var(--color-g50)",
                    color: "var(--color-g400)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    letterSpacing: 0,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  AMAZON 전용
                </span>
              )}
            </label>
            <input
              className="field-input mono"
              name="brand_keyword"
              disabled={!isAmazon}
              placeholder={isAmazon ? "Dr.Reju-All, Rejuall, PDRN cream Korea" : ""}
            />
            <span className="field-help">
              아래 페이지 이름으로 못 찾는 광고를 보충 수집할 때 쓸 키워드. 콤마로 구분.
            </span>
          </div>

          <div className="field" style={{ opacity: isAmazon ? 1 : 0.45 }}>
            <label className="field-label">
              Meta 광고 페이지 이름 (우선)
              {!isAmazon && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    background: "var(--color-g50)",
                    color: "var(--color-g400)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    letterSpacing: 0,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  AMAZON 전용
                </span>
              )}
            </label>
            <MetaPagesInput name="brand_meta_pages" disabled={!isAmazon} />
            <span className="field-help">
              본사/유통 페이지를 1순위로 끌어옵니다 (총 1,000건 cap 내). 비워두면 키워드 검색만 사용.
            </span>
          </div>

          {/* TikTok Shop-only */}
          {isShopSea ? (
            <div className="field">
              <label className="field-label">
                TikTok Shop 매출 데이터
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    background: "var(--color-info-soft)",
                    color: "var(--color-info)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    letterSpacing: 0,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  SEA — KALODATA 경로
                </span>
              </label>
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--color-info-soft)",
                  border: "1px solid #C7D6E8",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--color-info)",
                  lineHeight: 1.6,
                }}
              >
                <b style={{ fontWeight: 800 }}>
                  스토어 URL 입력 불필요 — 케이스 생성 후 상세 페이지에서{" "}
                  <code>KalodataSection</code>에 데이터를 직접 붙여넣습니다.
                </b>
                <br />
                <span style={{ fontSize: 11 }}>
                  SEA TikTok Shop은 pro100chok actor가 미지원이라 Kalodata가
                  유일한 경로. Brand 페이지 화면 텍스트(크레딧 0) + Creator
                  xlsx Export(브랜드당 Top 500 = 500 크레딧 권장) 둘 다 가능해요.
                </span>
              </div>
            </div>
          ) : (
            <div className="field" style={{ opacity: isShopUs ? 1 : 0.45 }}>
              <label className="field-label">
                TikTok Shop 스토어 URL
                {isShopUs ? (
                  <span className="req">*</span>
                ) : (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      background: "var(--color-g50)",
                      color: "var(--color-g400)",
                      padding: "1px 6px",
                      borderRadius: 3,
                      letterSpacing: 0,
                      textTransform: "none",
                      fontWeight: 700,
                    }}
                  >
                    TIKTOK_SHOP US 전용
                  </span>
                )}
              </label>
              <input
                className="field-input mono"
                name="tiktok_shop_store_url"
                disabled={!isShopUs}
                placeholder={
                  isShopUs ? "https://www.tiktok.com/shop/store/..." : ""
                }
              />
              <span className="field-help">
                apify pro100chok actor 입력 (US만 지원). 잘못된 URL이면 분석이 실패할 수 있어요.
              </span>
            </div>
          )}
        </section>

        {/* Footer / Submit */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 200,
            right: 0,
            background: "white",
            borderTop: "1px solid var(--color-g100)",
            padding: "14px 32px",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 16,
            alignItems: "center",
            zIndex: 5,
            boxShadow: "0 -4px 14px rgba(0,0,0,.04)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g500)",
              lineHeight: 1.5,
            }}
          >
            {state && !state.ok && (
              <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>
                ✕ {state.error}
              </span>
            )}
            {!state && (
              <span>
                케이스를 먼저 draft로 생성합니다. 그 다음 데이터 업로드 + 분석 진행.
              </span>
            )}
          </div>

          {/* BP IG/YT 분석 옵션 — Dyson/Medicube/Poppi 같은 카테고리 정의자 분석용.
              매출 데이터 없어도 OK. IG/YT seed 박으면 case 생성 시 status=ready 자동 +
              IG/YT 박스에서 자동 발굴 시작 가능. */}
          <details
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 8,
              border: "1px dashed var(--color-g200)",
              background: "var(--color-g25)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--color-g600)",
                listStyle: "none",
              }}
            >
              🎯 BP IG/YouTube 분석 추가 (옵션) — 카테고리 정의자 BP용
            </summary>
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-g500)",
                  marginBottom: 10,
                  lineHeight: 1.6,
                }}
              >
                IG/YT seed 둘 중 하나라도 박으면 케이스 생성 시{" "}
                <b>status=ready 바로 박힘</b> (매출 데이터 안 박아도 OK). 케이스
                페이지의 🎯 BP 박스에서 자동 발굴 → Accept → Phase 4c/4d 재실행 흐름.
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">
                  IG seed username (옵션)
                </label>
                <input
                  className="field-input mono"
                  name="ig_seed_username"
                  placeholder="ninjakitchen / dyson / medicube_us / drinkpoppi"
                />
                <span className="field-help">
                  @ 없이. 브랜드 owned IG 계정.
                </span>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">
                  YT seed channel URL (옵션)
                </label>
                <input
                  className="field-input mono"
                  name="yt_seed_url"
                  placeholder="https://www.youtube.com/@ninjakitchen"
                />
                <span className="field-help">
                  브랜드 owned YouTube 채널 URL.
                </span>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Region scope (옵션)</label>
                <select className="field-input" name="region_scope" defaultValue="global">
                  <option value="global">🌍 글로벌 (default)</option>
                  <option value="us-only">🇺🇸 US-only (휴리스틱 필터)</option>
                </select>
                <span className="field-help">
                  나중에 케이스 페이지에서도 토글 가능.
                </span>
              </div>
            </div>
          </details>

          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/cases" className="btn btn-ghost">
              취소
            </Link>
            <button type="submit" className="btn btn-accent" disabled={pending}>
              {pending ? "생성 중…" : "케이스 만들기 →"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
