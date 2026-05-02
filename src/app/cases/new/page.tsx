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

const COUNTRIES = [
  { code: "US", flag: "🇺🇸", label: "United States" },
  { code: "KR", flag: "🇰🇷", label: "Korea" },
  { code: "JP", flag: "🇯🇵", label: "Japan" },
  { code: "SG", flag: "🇸🇬", label: "Singapore" },
];

export default function NewCasePage() {
  const [platform, setPlatform] = useState<PlatformValue>("amazon");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createCaseDraft,
    null,
  );

  const isAmazon = platform === "amazon";
  const isShop = platform === "tiktok_shop";

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
              <select className="field-select" name="country" defaultValue="US">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.label})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">
              플랫폼 <span className="req">*</span>
            </label>
            <PlatformPicker
              name="platform"
              defaultValue="amazon"
              onChange={setPlatform}
            />
          </div>
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
            🚧 케이스 생성 후 상세 페이지에서 진행됩니다.
            <br />
            {isAmazon
              ? "Amazon 케이스 → exolyt CSV · 30일 매출 CSV · BSR per-product CSV"
              : "TikTok Shop 케이스 → exolyt CSV (재사용 가능시 자동 감지)"}
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
          <div className="field" style={{ opacity: isShop ? 1 : 0.45 }}>
            <label className="field-label">
              TikTok Shop 스토어 URL
              {isShop ? (
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
                  TIKTOK_SHOP 전용
                </span>
              )}
            </label>
            <input
              className="field-input mono"
              name="tiktok_shop_store_url"
              disabled={!isShop}
              placeholder={
                isShop ? "https://www.tiktok.com/shop/store/..." : ""
              }
            />
            <span className="field-help">
              apify pro100chok actor 입력. 잘못된 URL이면 분석이 실패할 수 있어요.
            </span>
          </div>
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
