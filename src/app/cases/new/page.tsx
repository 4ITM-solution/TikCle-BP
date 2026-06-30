"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BrandAutocomplete } from "@/components/case-create/BrandAutocomplete";
import {
  PlatformPicker,
  type PlatformValue,
} from "@/components/case-create/PlatformPicker";
import { createCaseDraft, type ActionResult } from "./actions";
import {
  COUNTRY_OPTIONS,
  isRegionCode,
} from "@/lib/case-detail/countries";

// 드롭다운 구조:
//   - 단일 (헤더 X): US/KR/JP
//   - 권역 통합 case (Hybrid): EU/MENA/LATAM — 시딩 통합 + 매출 marketplace별 sub
//   - 유럽 EU (국가별): GB(UK)/FR/DE/ES/PL — 단일 case
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
      ["US", "KR", "JP"].includes(o.code),
    ),
  },
  {
    label: "권역 통합 case (Hybrid — 시딩 통합 + 매출 국가별)",
    countries: COUNTRY_OPTIONS.filter((o) => isRegionCode(o.code)),
  },
  {
    label: "유럽 EU (국가별)",
    countries: COUNTRY_OPTIONS.filter(
      (o) => o.region === "EU" && !isRegionCode(o.code),
    ),
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

  // A 모델: 새 케이스는 브랜드+국가만. 채널 설정·데이터는 케이스 상세 카드에서.
  void platform;

  return (
    <div style={{ padding: "24px 32px 140px", maxWidth: 920 }}>
      <nav className="breadcrumb">
        <Link href="/cases">My Cases</Link>
        <span className="sep">/</span>
        <span>새 케이스</span>
      </nav>

      <h1 className="page-title">새 케이스 만들기</h1>
      <p className="page-sub">
        브랜드와 국가만 정하면 draft가 생성됩니다. 채널 설정(스토어 URL·키워드·seed)과 데이터 업로드는 다음 단계 — 케이스 상세의 데이터 채널 카드에서 진행해요.
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
          <div
            style={{
              fontSize: 12,
              color: "var(--color-ink)",
              lineHeight: 1.6,
              padding: 12,
              background: "#fef3c7",
              border: "1px dashed #fbbf24",
              borderRadius: 6,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#92400e" }}>
              ⚠ 데이터 업로드는 이 폼에서 안 받아요
            </div>
            <div style={{ fontSize: 11, color: "#92400e" }}>
              케이스 생성 누르면 → 상세 페이지로 이동 → 상단 <b>📥 데이터 채널</b>{" "}
              섹션의 각 카드 클릭 → expand panel 안 업로드 박스에서 적재.
              <br />
              <br />
              <b>각 채널별 적재 방법</b>:
              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 18 }}>
                <li><b>📹 TikTok 영상</b> — Exolyt CSV 업로드 (Exolyt social listener export)</li>
                <li><b>🛒 TT Shop</b> — store URL 입력 (US) / Kalodata 텍스트 paste (SEA)</li>
                <li><b>📦 Amazon</b> — Helium10 매출 CSV + BSR CSV</li>
                <li><b>🛍 Shopee</b> — Shopdora 텍스트 paste</li>
                <li><b>📢 Meta 광고</b> — 카드 안 설정에서 키워드/페이지 입력 → 자동 수집 (Phase 4a)</li>
                <li><b>📷 Instagram / ▶ YouTube</b> — 카드 안 설정에서 owned 계정(seed) 입력 → BP 분석</li>
              </ul>
            </div>
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
