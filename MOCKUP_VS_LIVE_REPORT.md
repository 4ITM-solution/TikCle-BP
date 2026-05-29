# Mockup vs 라이브 코드 비교 보고서

mockup: `~/Downloads/bp-case-detail-mockup.html` (1457 줄)
라이브 코드: `src/app/cases/[id]/page.tsx` + `src/components/case-detail/mockup/*.tsx` + `src/app/globals.css` (mockup CSS scoped)

검토 일자: 2026-05-30
검토 기준: mockup HTML line by line vs 우리 컴포넌트 sub-element

---

## 0. CSS

| 영역 | mockup CSS | 라이브 globals.css | 상태 |
|---|---|---|---|
| 전체 class 수 | 121 단독 selector | 동일 (`.bp-mockup` prefix) | ✅ scoped 박힘 |
| `body` 글로벌 룰 | 있음 (font / bg / color) | 제거 (scoping 시 제외) | ⚠️ `.bp-mockup` 안 폰트/bg 미적용 → 시각 차이 가능 |
| `* { box-sizing }` | 있음 | 제거 | ⚠️ 일부 element border-box 미적용 가능 |
| `.stack-bar { overflow: hidden }` | 있음 (mockup 원본) | **제거함** (sb-label 잘림 fix) | 의도적 diff |
| @import font | 없음 (시스템 폰트) | 동일 | ✅ |

### CSS 누락 (mockup 에 있지만 globals 에서 안 적용):
- mockup `body` 룰: `font-family: Pretendard, ...; background: #f9fafb; color: #111827; font-size: 13px;`
  → `.bp-mockup` 내부 element 가 우리 시스템 폰트 사용. 시각 차이 가능.
- mockup `* { box-sizing: border-box }` — 시스템 reset 으로 대체.

### Recommended:
- `.bp-mockup` wrapper 에 mockup 의 body 룰 적용 (font / bg / color / line-height 명시).

---

## 1. scenario-bar (mockup line 468-491)

**mockup**: 3 시나리오 toggle (SharkNinja / 신규 / 빈 케이스) — 사용자가 view 전환.

**라이브**: 없음.

**판정**: mockup 자체 데모용. 실제 케이스 ↔ 시나리오 매핑 불가 (실 데이터 1개). **추가 X** (의도적).

---

## 2. status-strip (mockup line 24-47, HTML 없음 — strip은 위쪽 sticky bar)

**mockup HTML**: 없음 (CSS 만 있고 HTML body 안 status-strip element 안 박혀있음). mockup body 첫 element 가 `.case-header`.

**라이브**: `CaseStatusStripMockup` 박혀있음 (mockup CSS `.status-strip` 사용).

**판정**: 우리 라이브가 mockup CSS 활용해서 status-strip 박았지만 mockup HTML 자체엔 없음. ⚠️ 라이브가 mockup 보다 더 박힘 (의도적 — 실용성).

---

## 3. case-header (mockup line 512-530)

| sub-element | mockup | 라이브 (CaseHeaderMockup) | 상태 |
|---|---|---|---|
| `.brand-name` | "SharkNinja" | brand prop | ✅ |
| `.meta-pills` ready | meta-pill.ready | ✅ | ✅ |
| `.meta-pill` 국가 | "🇺🇸 US" | flagOf + country | ✅ |
| `.meta-pill` 채널 | "TT Shop" | channel prop | ✅ |
| `.meta-pill` 매출 tier | "매출 tier: ★★★★" | revenueTier prop | ✅ |
| `.actions .rev-tier` | "💰 매출 tier 수정 ▾" | CaseHeader actionsOnly → RevenueTierPicker | ✅ (mockup 형식 약간 다름) |
| `.actions .region-toggle` | US 전체 / SEA / MENA | RegionScopeToggle | ⚠️ 형식 다름 (mockup `.region-toggle button.active` vs 우리 react 자체) |
| `.actions .danger` 삭제 | "🗑 케이스 삭제" | DeleteCaseButton | ⚠️ 디자인 다름 |
| ⬇ 인플 CSV | mockup 없음 | 우리 actions 에 추가 | ⚠️ 라이브가 더 |

---

## 4. KPI strip (mockup line 532-540, 6 KPI)

| KPI | mockup | 라이브 (KpiStripMockup) | 상태 |
|---|---|---|---|
| 총 영상 | 1,934 + breakdown TK · IG · YT | totalVideos + videoBreakdown | ✅ |
| 총 인플 풀 | 650명 + 메가/마이크로 | totalCreators + creatorBreakdown | ✅ |
| 총 view | 486M + YT 91% / IG 8% | totalViews + viewBreakdown | ✅ |
| TT Shop GMV (30d) | $1.2M ▲ 285% vs 4월 | ttShopGmv30d + gmvTrend | ⚠️ 우리는 trend 텍스트만, ▲ class 적용 안 됨 |
| Meta 광고 | 179 + brand 156 · partner 23 | metaAds + metaBreakdown | ✅ |
| 분석 비용 | $5.04 + Apify $4.1 + Anthropic $0.94 | costEstimate + costBreakdown | ✅ |

**차이**: TT Shop GMV trend 가 `.ks-trend.up/.dn` class 활용 안 됨. ⚠️ 색 표시 X.

---

## 5. 데이터 채널 (mockup line 542-559)

| 카드 | mockup | 라이브 (DataChannelsMockup) | 상태 |
|---|---|---|---|
| TikTok 영상 | 1,234 영상 · 22.1M views + Exolyt CSV 5/27 | stat + sub | ✅ |
| TT Shop | 8 제품 · $1.2M GMV + store URL · Helium10 | stat + sub | ✅ |
| Meta 광고 | 179 광고 · 16 partnership + 하이브리드 $1.43 | stat + sub | ✅ |
| Instagram | 450 posts · 87 authors + Phase 4c | stat + sub | ✅ |
| YouTube | 250 영상 · 163 채널 + Phase 4d | stat + sub | ✅ |
| Amazon (off) | "사용안함" | active=false | ✅ |
| Shopee (off) | "사용안함" | active=false | ✅ |
| **"+ 채널 추가"** | 회색 카드 | ✅ 추가됨 (방금 push) | ✅ |

**서브 표시 데이터**: page.tsx 의 `channelStats` 매핑이 mockup 의 sub 정보 (Exolyt 5/27 / 22.1M views 등) 만큼 풍부하지 않음. 단순 숫자만.

⚠️ **개선 필요**: channelStats 가 mockup 처럼 풍부한 sub-text (수집 source / 날짜 / 추가 metric) 노출.

---

## 6. Phase progress (mockup line 561-581)

| 측면 | mockup | 라이브 (PhaseProgressMockup) | 상태 |
|---|---|---|---|
| details + summary | "🔧 Phase 진행 상태 (15 phase · cache cascade · 펼치기)" | "🔧 Phase 진행 상태 (N/14 · cache cascade · 펼치기)" | ⚠️ mockup 15 vs 우리 14 (Phase 4a.5 누락) |
| .pp-grid | grid | grid | ✅ |
| .pp-item.ok | 13개 (Phase 1.5 ~ 4d) | done=true 14개 | ✅ |
| .pp-item.skip | Phase 5 ⏭ WIP (수동만) | skip | ✅ |
| .pp-rerun 버튼 | 모든 phase 에 "재실행" | **우리 없음** | ⚠️ trigger 기능은 옛 PhaseProgressToggle 이 별도 처리 (mockup 1:1 X) |

**개선 필요**:
- Phase 4a.5 (Storage) 항목 추가
- .pp-rerun 버튼 박기 (옛 PhaseProgressToggle 와 통합)

---

## 7. G 종합 인사이트 (mockup line 583-624)

| 측면 | mockup | 라이브 (InsightCardMockup) | 상태 |
|---|---|---|---|
| .ic-label | "🎯 SECTION G · 종합 인사이트" | ✅ | ✅ |
| .ic-title | "SharkNinja = micro-army × ..." | title prop | ✅ |
| .ic-tagline | "한 인플당 1-2건만 amplify..." | tagline prop | ✅ |
| .ic-meta | "주력 언어: 영어 78% · 스페인어 9% · UK 6%" | metaLine prop | ⚠️ page.tsx 에서 metaLine 값 안 박힘 (옛 CaseInsightCard 에 없는 필드) |
| .axis-grid 5 | 제품/인플/콘텐츠/채널/시즈널리티 | axisCards prop (axis: enum) | ✅ |
| .insight-row 2-col | 핵심 발견 / cross-platform | ✅ | ✅ |
| .related-cases | "🔗 비교 가능 케이스" + 4 링크 | relatedCases prop **빈 배열** | ⚠️ 데이터 없음 (page.tsx 에서 `relatedCases={[]}` ) |

**개선 필요**:
- `metaLine` 박기 (예: phase5.languages 기반)
- `relatedCases` 매핑 (같은 country 다른 brand 케이스 SQL)

---

## 8. A 콘텐츠 활동 (mockup line 626-752)

| 측면 | mockup | 라이브 (SectionAMockup) | 상태 |
|---|---|---|---|
| .section-h subtitle | "★ 월간 인플 티어 · 광고 비중 · BSR 통합 트렌드 (호버 시 디테일)" | ✅ | ✅ |
| 채널 toggle | 4 button (전체/TK/IG/YT) | ✅ | ✅ |
| 5 KPI | 총영상/paid%/organic%/gifted%/총view | ✅ (gifted "—" — FTC 미수집) | ✅ |
| 차트 헤더 | "월간 인플 · 광고 · BSR 통합 트렌드 (12개월)" | ✅ | ✅ |
| 절대/비중 toggle | 2 button | ✅ | ✅ |
| 4 toggle | 인플 티어 stack / 광고 line / BSR line / ★ 영상 수 line | ✅ | ✅ |
| stack-bar 12 | 12 막대 × 7 sub-tier | ✅ (12개월 grid 빈 막대 채움 — fix됨) | ✅ |
| sb-label | 월명 + 영상 수 | ✅ (overflow:hidden 제거 — fix됨) | ✅ |
| SVG overlay 3 line | 영상 수 cyan / 광고 점선 / BSR 점선 | ✅ | ✅ |
| SVG overlay 변곡점 marker | 5월 cyan + red circle | ✅ (호버 또는 마지막 month — fix됨) | ✅ |
| 호버 tooltip | 풍부 (vs 이전 +N% / 변곡점 / BSR 동조) | ✅ (방금 풍부화) | ✅ |
| .trend-legend | 7 tier + 3 line 라벨 | ✅ | ✅ |
| 인사이트 callout | "💡 볼륨 ↔ BSR 상관: ..." | ✅ (phase5.bsr_inflections 있을 때) | ✅ |
| 1인당 영상 분포 | 5 row (1편 ~ 20+편) | CreatorActivityModule (이전 코드 — 다른 디자인) | ⚠️ **mockup .dist-row class 안 씀 — 디자인 다름** |
| ★ long-tail 72% footnote | mockup line 750 | ✅ | ✅ |

**개선 필요**:
- **1인당 영상 분포**: CreatorActivityModule 자체 디자인 사용 중 — mockup `.dist-row + .dist-bar + .dist-fill` 형식으로 재작성 필요.

---

## 9. B 인플루언서 풀 (mockup line 754-843)

| 측면 | mockup | 라이브 (SectionBMockup) | 상태 |
|---|---|---|---|
| .section-h subtitle | ✅ | ✅ | ✅ |
| 채널 toggle | 4 button (전체/TK/IG/YT) | ✅ (active state) | ⚠️ filter 실제 동작 X (visual prototype) |
| 월 select | "전체 기간 (12개월)" + 월 option | ✅ | ⚠️ filter 실제 동작 X |
| 2-col 그리드 | 1fr 1.5fr | ✅ | ✅ |
| 좌측 티어 분포 | .tier-row × 5 (Mega ~ Nano) | TIERS_ORDER 7 (Mega ~ Unknown) | ⚠️ mockup 5 vs 라이브 7 row |
| cross-channel matrix | .matrix-table 4 row | ✅ (xcTop 4) | ✅ |
| 우측 Top 작성자 | 5 row (셀럽 + 비셀럽) | ✅ topCreators.slice(0, 10) | ⚠️ mockup 5 vs 라이브 10 |
| ch-pill | TK4 / IG8 / YT12 형식 | ✅ | ✅ |
| Shop creator section | border-top dashed + 2-col | ✅ | ✅ |
| Top GMV 5명 | 핸들/GMV/영상/GPM | Lifetime GMV / 브랜드 협업 (GPM 삭제) | ⚠️ mockup 컬럼 다름 |
| .histogram GMV 분포 | 10 hg-bar + 5 hg-label | shopGmvDistribution.buckets (보통 5) | ⚠️ mockup 10 vs 라이브 5 |
| details "▶ 원본 raw" | mockup line 839 | ✅ (방금 추가) | ✅ |

**개선 필요**:
- 티어 분포 mockup 5 (Mega/Macro/Mid/Micro/Nano) 만 — Sub-nano/Unknown 0이면 hide?
- Top 작성자 5명만 표시 (mockup line 800)
- Histogram bar 수 10 (mockup line 831)

---

## 10. C 콘텐츠 포맷 (mockup line 845-1023)

| 측면 | mockup | 라이브 (SectionCMockup) | 상태 |
|---|---|---|---|
| sub-tabs 4 | 통합클러스터 / USP / heatmap / paid·organic | ✅ | ✅ |
| 통합 클러스터 panel | | | |
| 채널 필터 | 4 button (전 채널/TK/IG/YT) | ✅ (state but filter X) | ⚠️ filter 미동작 |
| .unified-cluster row | 5 cluster | metas (DB 데이터 그대로) | ✅ |
| uc-rank | 1~5 | ✅ | ✅ |
| uc-name | mockup 짧은 한글 | ✅ | ✅ |
| uc-channels TK/IG/YT pill | ✅ | ✅ (clusterChannelBreakdown) | ✅ |
| uc-desc | "리스트 포맷 — save rate 압도적" | m.description | ✅ |
| **uc-metrics** | "avg views 1.8M · save 4.2% · paid 18% · 메가 인플 12명" | child_clusters name 만 | ⚠️ **avg views / save rate / paid % 데이터 없음** |
| USP panel | | | |
| usp-keyword chips | 11 chips | uspKws.slice(0, 24) | ⚠️ mockup 11 vs 라이브 24 |
| ★ link in bio / code NINJA20 highlight | 노란 배경 chips | **우리 없음** | ⚠️ CTA 키워드 highlight 미구현 |
| usp-detail ud-vid | 영상 list 3개 + "+ 84개 더보기" | ✅ (방금 추가) | ✅ |
| heatmap panel | | | |
| measure select | 영상 수/view/paid/GMV 기여 | 3 옵션 (count/view/paid_pct) | ⚠️ mockup 의 "GMV 기여" 없음 |
| .heatmap grid | 5 cluster × 12 month | ✅ (cluster × month — 방금 변경) | ✅ |
| paid/seeded/organic panel | | | |
| .dist-row 3 (ad/seeded/organic) | mockup 3 row | 2 row (ad/organic) — seeded 제거 | ⚠️ seeded 항목 mockup 에 있음 |

**개선 필요**:
- **uc-metrics 데이터**: child cluster avg_views + median_collect_rate_pct + paid 비율 phase4b 에서 채워야
- USP CTA 키워드 highlight (link in bio / NINJA20 등 노란 배경)
- heatmap measure 에 "GMV 기여" 옵션 (Kalodata 매핑)
- paid 분류 panel 에 seeded 추가 (시딩 데이터 source 없음 → "—" placeholder)

---

## 11. D 매출 & BSR (mockup line 1025-1283)

| 측면 | mockup | 라이브 (SectionDMockup) | 상태 |
|---|---|---|---|
| .section-h subtitle | ✅ | ✅ | ✅ |
| 채널 toggle (TT Shop / Amazon) | TT Shop active | caseChannel 따라 active (fix됨) | ✅ |
| 기간 toggle (7/14/30) | 30 active | 30 only active | ⚠️ 7/14 disabled (데이터 없음) |
| SKU selector banner | 9 SKU button (gradient yellow) | ✅ (sku.length 동적) | ✅ |
| 현재 선택 info | "전체 8 SKU · 30일 GMV $1.2M · 159,149 단위" | ✅ | ✅ |
| SKU 헬스 3 카드 | 매출 집중도 + 카테고리 + 신상 비중 | ✅ (SkuHealthCards) | ✅ |
| .sh-bar Pareto segments | Top1/Top2/Top3 + 기타 | ✅ | ✅ |
| 히어로 SKU × 메가 영상 | 3 hero-card + hero-vid 3-5개 | ✅ | ✅ |
| hero-vid-meta | "2.4M · TK" 형식 | ✅ | ✅ |
| sub-tabs 6 | SKU 표 / 카테고리 ranking / Creator×SKU / Affiliate / 영상매출 / Live | ✅ | ✅ |
| SKU 매출 표 | 8 column (제품/카테고리/출시/GMV/판매/가격/spark/동반영상) | 5 column (제품/ASIN/GMV/판매/BSR) | ⚠️ **mockup 컬럼 더 풍부** (카테고리/출시/가격/spark/동반영상 누락) |
| Slushi Max GMV 시계열 | mockup line 1163-1173 (svg + 변곡점 marker) | **우리 없음** | ⚠️ SKU 선택 시 GMV 시계열 차트 누락 |
| 카테고리 ranking 시계열 | KPI 4 + svg line + top10 한계선 + 5/15 #1 마커 | "—" placeholder | ⚠️ 데이터 미수집 (Kalodata Live commerce ranking 필요) |
| Creator × SKU matrix | 5 row × 4 product + 합계 | ✅ (Kalodata 데이터) | ✅ |
| Affiliate code conversion | KPI 4 + 테이블 5 row | "—" placeholder | ⚠️ 데이터 미수집 |
| 영상별 매출 (Kalodata) | KPI 4 + 테이블 4 row | ✅ (Kalodata) | ✅ |
| Live 매출 (Kalodata) | KPI 4 + 테이블 3 row | ✅ (Kalodata) | ✅ |

**개선 필요**:
- SKU 매출 표 컬럼 확장: 카테고리 / 출시일 / 가격 / spark line / 동반 영상 수
- SKU 선택 시 GMV 시계열 차트 (mockup line 1163-1173)
- 카테고리 ranking 시계열 — Kalodata Live commerce ranking 별도 수집
- Affiliate code conversion — 광고 영상에서 promo code 추출 별도 파이프

---

## 12. E Meta 광고 + Partnership (mockup line 1285-1351)

| 측면 | mockup | 라이브 (SectionEMockup) | 상태 |
|---|---|---|---|
| .section-h subtitle | ✅ | ✅ | ✅ |
| 5 KPI strip | 총광고/brand/partnership/landing→Amazon/분석 비용 | ✅ | ✅ |
| ad-toolbar 필터 | 검색 input + 3 select + 3 체크박스 | ✅ | ✅ |
| ad-grid | 4 카드 | ✅ (showCount=8) | ✅ |
| ad-card sub-elements | thumb + badges + page + partner + date + body | ✅ | ✅ |
| .load-more 버튼 | "+ 152개 광고 더보기" | ✅ | ✅ |
| landing 분포 | .dist-row 4 (Amazon/DTC/IG/기타) | ✅ | ✅ |
| 광고 format 분포 | .dist-row 3 (VIDEO/IMAGE/CAROUSEL) | ✅ | ✅ |
| 파트너 인플 16명 테이블 | 6 column (썸네일/이름/팔로워/광고/다른채널/활동기간) | 5 column (썸네일/이름/광고/active/기간) | ⚠️ **mockup 의 팔로워 / 다른 채널 활동 컬럼 누락** |

**개선 필요**:
- partner_creators 에 follower_count + 다른 채널 활동 (cross-channel) 매핑 추가

---

## 13. footer dev (mockup line 1354-1364)

| 측면 | mockup | 라이브 (CaseDevFooter) | 상태 |
|---|---|---|---|
| details + summary | "⚙️ DEV / QA 액션 (펼치기)" | ✅ | ✅ |
| .dev-btn 5 | status toggle / key_stats dump / last_error / cost / phase raw | DevTestActions 자체 디자인 | ⚠️ mockup .dev-btn class 미사용. button 디자인 다름. |
| dev 메시지 | "평소엔 접힘 · 개발/QA 액션만" | 없음 | ⚠️ |

---

## 14. 좌측 sticky TOC (mockup line 493-508)

| 측면 | mockup | 라이브 (CaseSideTOC) | 상태 |
|---|---|---|---|
| .toc class | ✅ | ✅ (방금 적용) | ✅ |
| .toc-h 그룹 헤더 | "목차" / "DEV" | "TOP" / "분석" / "DEV" | ⚠️ 그룹 라벨 약간 다름 |
| 목차 항목 11 | ✅ | 10 (대시보드 / KPI 등) | ⚠️ 약간 차이 |
| .toc a.active highlight | ✅ | ✅ | ✅ |

---

## 종합 점수

| 섹션 | mockup 일치도 | 데이터 충실도 |
|---|---|---|
| status-strip | 100% | ✅ |
| case-header | 90% (region-toggle / actions 디자인 차이) | ✅ |
| KPI strip | 95% (trend 색 미적용) | ✅ |
| 데이터 채널 | 95% (sub-text 풍부도) | ⚠️ |
| Phase progress | 80% (.pp-rerun 버튼 없음) | ✅ |
| G 인사이트 | 85% (metaLine / relatedCases 누락) | ⚠️ |
| A 콘텐츠 활동 | 95% (1인당 분포 디자인 차이) | ✅ |
| B 인플루언서 풀 | 90% (티어 row 수 / Top 작성자 수 / GPM 컬럼 차이) | ✅ |
| C 콘텐츠 포맷 | 80% (uc-metrics / CTA highlight / seeded 누락) | ⚠️ |
| D 매출 & BSR | 85% (SKU 표 컬럼 / GMV 시계열 / ranking / Affiliate 미수집) | ⚠️ |
| E Meta 광고 | 90% (partner 컬럼 일부 누락) | ✅ |
| footer dev | 80% (.dev-btn 디자인) | ✅ |
| 좌측 TOC | 95% (그룹 라벨 차이) | ✅ |

**전체 평균: ~90% mockup 일치**

---

## 우선순위 fix (impact 큰 순)

### High (visual 큰 차이)
1. **A 1인당 영상 분포** — CreatorActivityModule → mockup `.dist-row` 디자인
2. **C uc-metrics** — child cluster avg_views / save rate / paid % 데이터 채움 (backend)
3. **D SKU 매출 표 컬럼** — 카테고리/출시일/가격/spark/동반영상 추가
4. **B Top 작성자 5명** + 티어 분포 5 row (mockup match)
5. **KPI strip TT Shop GMV trend ▲ 색** — `.ks-trend.up` class 적용

### Medium (디자인 / 정보 풍부도)
6. **데이터 채널 sub-text 풍부화** (Exolyt 날짜 / 22.1M views 등 mockup 형식)
7. **G 인사이트 metaLine + relatedCases** 매핑
8. **Phase progress .pp-rerun 버튼** + Phase 4a.5 항목 추가
9. **C USP CTA 키워드 highlight** (link in bio / NINJA20 등 노란 배경)
10. **E partner_creators 팔로워 + 다른 채널 활동 컬럼** 추가
11. **footer .dev-btn** mockup 디자인

### Low (데이터 미수집 — 별도 파이프)
12. **D 카테고리 ranking 시계열** — Kalodata Live commerce ranking 수집
13. **D Affiliate code conversion** — 광고 영상 promo code 추출
14. **D SKU GMV 시계열 차트** (mockup line 1163-1173)
15. **C heatmap GMV 기여 measure** — Kalodata 영상매출 매핑
16. **C paid/seeded/organic 분류 안 seeded** — 시딩 분류 데이터 source

### Cosmetic
17. **TOC 그룹 라벨** (목차/DEV → TOP/분석/DEV — 사용자 의도 확인)
18. **case-header region-toggle 디자인** — mockup `.region-toggle button.active` 적용

---

## 데이터 흐름 mockup vs 라이브 차이

### 데이터 sparse 케이스 (Anua/Skin1004) — visual 약함 원인:
- phase5.bsr_inflections 없음 → A 인사이트 callout 안 보임
- phase4b_sku high confidence 매칭 부족 → 히어로 영상 매칭 0
- Kalodata 데이터 없음 (Anua) → D Kalodata panel "—"
- phase4a.brand_meta_pages 비어있음 (Anua) → E 빈 panel

= 진짜 mockup 처럼 풍부하게 보이려면 case 자체에 모든 채널 데이터 적재 + 외부 (Kalodata) 데이터 수집.

### 백엔드 fix push 완료 (이번 session):
- phase35 Apify clockworks 실패 throw → skipped_reason
- phase5 heatmap schema cluster × month
- cluster member channel breakdown (frontend SQL)
- phase4b_clusters try/catch
- phase4b_sample TikTok URL filter (YouTube 차지 버그)

### 진행 중 / 미완:
- SharkNinja TikTok contents.uploaded_at NULL (Exolyt CSV 적재 누락) — 진짜 data fix 필요
