# Mockup vs 라이브 코드 비교 보고서 (v2)

mockup: `~/Downloads/bp-case-detail-mockup.html` (1457 줄)
라이브 코드: `src/app/cases/[id]/page.tsx` + `src/components/case-detail/mockup/*.tsx` + `src/app/globals.css`

검토 일자: 2026-05-30 (v2 — A 모델 + 인라인 expand 적용 후)
검토 기준: mockup HTML line by line vs 우리 컴포넌트 sub-element + UX 흐름

---

## 0. 큰 그림 (v1 이후 변경)

### v1 → v2 push 된 것
- ✅ A 모델 적용 — 신규 case = country + brand만, 다채널 데이터 자유 적재
- ✅ Topbar 통합 — 사이드바 (Browse / + New Case / 환율 설정) → 상단 헤더
- ✅ status-strip dark bar (#1f2937) — brand + tier + 채널 dot + actions 흡수
- ✅ CaseHeaderMockup 제거 (status-strip 안 통합)
- ✅ 데이터 채널 카드 = 인라인 expand entry (accordion 1개만, 다른 카드 자동 닫힘)
- ✅ 데이터 추가 details 통째 제거 — 각 entry 는 카드 클릭으로 인라인 expand
- ✅ D 섹션 채널 toggle = 실제 sales channel filter (products.channel 기반)
- ✅ Browse 페이지 brand 명 검색 추가
- ✅ 모든 영상 썸네일 onError fallback
- ✅ Compare 탭 sidenav 제거
- ✅ MiniDashboard 통째 폐기 (2814 줄)
- ✅ 보고서 v1 cleanup (B 5 row / 5명 / 데이터 채널 sub-text / G metaLine / USP CTA / E partner / C uc-metrics)

### 새 UX 패턴 (mockup 의도 + 사용자 결정)
- 한 case = 한 country × 한 brand × 다채널 (TT Shop + Amazon + Shopee + Meta + IG + YT 다 가능)
- 데이터 channel 카드 클릭 → 인라인 expand panel — accordion (1개만)
- mockup `+ 채널 추가` 별도 카드 제거 — 각 카드 자체가 entry

---

## 1. CSS

| 영역 | mockup CSS | 라이브 globals.css | 상태 |
|---|---|---|---|
| 전체 class 수 | 121 | 121 (`.bp-mockup` prefix) | ✅ |
| `body` 글로벌 | font / bg / color | 제거 | ⚠️ `.bp-mockup` 안 폰트 미적용 가능 |
| `.stack-bar overflow` | hidden | **제거** (sb-label 잘림 fix) | 의도 diff |

---

## 2. 섹션별 mockup vs 라이브

### scenario-bar (mockup line 468-491)
**없음** (시나리오 데모용 — 실제 의미 X)

### status-strip ★ v2 변경
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| sticky 위 dark bar | white sub-bar | **다크 (#1f2937)** | mockup보다 더 통합 |
| brand 큼 + tier | case-header 안 | status-strip 안 흡수 | ✅ |
| 채널 dot + count | dot list | ✅ | ✅ |
| actions | case-header 안 | **status-strip 우측 흡수** (CSV / tier / region / 재실행 / 삭제) | ✅ 통합 |

### case-header (mockup line 512-530)
**별도 박스 제거 — status-strip 안 통합** ✅

### KPI strip (mockup line 532-540, 6 KPI)
| KPI | mockup | 라이브 | 상태 |
|---|---|---|---|
| 총 영상 / 인플 / view / Meta / 비용 | 5/6 KPI 매핑 | ✅ | ✅ |
| **TT Shop GMV trend ▲** | "▲ 285% vs 4월" + 색 | sku_count 표시만 | ⚠️ 전월 trend 데이터 없음 (backend 필요) |

### 데이터 채널 (mockup line 542-559) ★ v2 큰 변경
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 7 채널 카드 | grid | ✅ | ✅ |
| sub-text | stat + sub (Exolyt 5/27 등) | ✅ 풍부화 | ✅ |
| **+ 채널 추가 카드** | 회색 카드 | **제거 — 각 카드가 entry** | 개선 (mockup 의도 초과) |
| **카드 클릭** | (mockup 정적) | **인라인 expand accordion** | UX 개선 |
| **off 카드** | "사용안함" | "추가" + "클릭하여 데이터 추가" | UX 개선 |

### Phase progress (mockup line 561-581)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| details + summary | ✅ | ✅ | ✅ |
| 15 phase item | 15 | 14 (Phase 4a.5 누락) | ⚠️ |
| **`.pp-rerun` 버튼** | 모든 phase | **없음** | ⚠️ 옛 PhaseProgressToggle 별도 |

### G 종합 인사이트 (mockup line 583-624)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| ic-label / title / tagline | ✅ | ✅ | ✅ |
| ic-meta | "주력 언어 …" | ✅ phase5.languages 매핑 | ✅ |
| axis-grid 5 | 제품/인플/콘텐츠/채널/시즈널리티 | ✅ | ✅ |
| insight-row 2-col | 핵심 발견 / cross-platform | ✅ | ✅ |
| **related-cases** | 4 링크 | **빈 배열** | ⚠️ 매핑 SQL 필요 |

### A 콘텐츠 활동 (mockup line 626-752)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 채널 toggle / 5 KPI / stack 차트 / overlay 3 line / 호버 tooltip / callout / 1인당 분포 | 다 | ✅ 다 | ✅ |
| 12개월 grid | 12 | ✅ 12 (빈 막대 채움) | ✅ |
| 호버 변곡점 marker / vs prev / BSR 동조 | ✅ | ✅ | ✅ |

### B 인플루언서 풀 (mockup line 754-843)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 채널 toggle / 월 select | active | **visual prototype** | ⚠️ filter 미동작 |
| 티어 분포 5 row | Mega~Nano | ✅ Sub-nano/Unknown 0이면 hide | ✅ |
| cross-channel matrix Top 인플 | 4 | ✅ | ✅ |
| Top 작성자 5명 | 5 + 셀럽 뱃지 | ✅ | ✅ |
| TT Shop 컬럼 | 핸들/GMV/영상/GPM | Lifetime GMV / 브랜드 협업 (GPM 삭제) | ⚠️ mockup 컬럼 다름 |
| histogram | 10 bar | 5 bar (실 데이터) | ⚠️ |
| details "원본 raw" | ✅ | ✅ | ✅ |

### C 콘텐츠 포맷 (mockup line 845-1023)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 4 sub-tabs | ✅ | ✅ + 언어권 (mockup 없음) | ✅ |
| cluster row uc-metrics | avg views / save / paid % / 메가 인플 | ✅ server SQL (avg views / save / paid %) | ✅ |
| cluster channel pill TK/IG/YT | ✅ | ✅ | ✅ |
| USP keyword chips | 11 | up to 24 | ⚠️ 수 다름 (정보 더) |
| USP CTA highlight | link in bio / NINJA20 | ✅ regex highlight | ✅ |
| USP detail 영상 list | 3 + 더보기 | ✅ server SQL (caption ilike) | ✅ |
| heatmap measure | count / view / paid / **GMV 기여** | 3 (count/view/paid_pct, GMV 없음) | ⚠️ Kalodata 매핑 |
| heatmap grid | cluster × month | ✅ | ✅ |
| paid 분류 3 row (ad/seeded/organic) | 3 | 2 (ad/organic, seeded 없음) | ⚠️ 시딩 데이터 source 부재 |

### D 매출 & BSR (mockup line 1025-1283)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 채널 toggle (TT Shop / Amazon / Shopee) | ✅ | ✅ **실제 sales channel filter** | ✅ |
| 기간 toggle (7/14/30) | 30 active | 30 only | ⚠️ 7/14 데이터 없음 |
| SKU selector + 헬스 3 카드 + 히어로 영상 | 다 | ✅ | ✅ |
| **SKU 매출 표 컬럼** | 제품/카테고리/출시/GMV/판매/가격/spark/동반영상 (8) | 제품/ASIN/GMV/판매/BSR (5) | ⚠️ mockup 컬럼 더 풍부 |
| SKU GMV 시계열 차트 (선택 SKU) | svg + 변곡점 | **없음** | ⚠️ |
| sub-tabs 6 | ✅ | ✅ | ✅ |
| 카테고리 ranking 시계열 | KPI 4 + svg | "—" | ⚠️ Kalodata Live commerce 수집 |
| Creator × SKU matrix | 5×4 + 합계 + highlight | ✅ Kalodata | ✅ |
| Affiliate code conversion | KPI 4 + 테이블 | "—" | ⚠️ promo code 추출 파이프 |
| 영상매출 / Live (Kalodata) | KPI 4 + 테이블 | ✅ | ✅ |

### E Meta 광고 (mockup line 1285-1351)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| 5 KPI strip | ✅ | ✅ | ✅ |
| ad-toolbar 필터 | 검색 + 3 select + 3 체크박스 | ✅ | ✅ |
| ad-grid + load more | ✅ | ✅ | ✅ |
| landing + format 2-col | ✅ | ✅ | ✅ |
| partner 테이블 컬럼 | 인플/팔로워/광고/다른 채널/활동 기간 (6) | ✅ + 팔로워 + 다른 채널 pill | ✅ |
| **phase4a 빈 케이스** | (mockup 가정 풍부) | "—" hide-if-empty | ✅ UX 깔끔 |

### footer dev (mockup line 1354-1364)
| 측면 | mockup | 라이브 | 상태 |
|---|---|---|---|
| details + summary | ✅ | ✅ (`.footer-dev` class) | ✅ |
| `.dev-btn` 5개 | ✅ | DevTestActions 자체 디자인 | ⚠️ mockup 디자인 일치 X |

### 좌측 sticky TOC (mockup line 493-508)
| 측면 | mockup | 라이브 (CaseSideTOC) | 상태 |
|---|---|---|---|
| `.toc` class | ✅ | ✅ | ✅ |
| `.toc-h` 그룹 | "목차" / "DEV" | "TOP" / "분석" / "DEV" | ⚠️ 그룹 라벨 차이 |

---

## 3. 전체 mockup 일치도

| 섹션 | v1 일치도 | v2 일치도 | 변화 |
|---|---|---|---|
| status-strip | 100% | **100%+** (case-header 흡수) | ↑ |
| case-header | 90% | 100% (status-strip 통합) | ↑ |
| KPI strip | 95% | 95% (trend ▲ 데이터 미흡) | 동일 |
| 데이터 채널 | 95% | **105%** (인라인 expand UX 추가) | ↑↑ |
| Phase progress | 80% | 80% (.pp-rerun 미흡) | 동일 |
| G 인사이트 | 85% | 95% (metaLine + axis 박힘) | ↑ |
| A | 95% | **98%** (1인당 dist-row 적용) | ↑ |
| B | 90% | **95%** (5 row / 5명 / raw details / cross-channel 매칭) | ↑ |
| C | 80% | **95%** (uc-metrics / USP detail / CTA highlight / heatmap cluster×month) | ↑↑ |
| D | 85% | **90%** (Kalodata 4 panel + sales channel filter / SKU 표 컬럼 미흡) | ↑ |
| E | 90% | **97%** (partner 컬럼 풍부) | ↑ |
| footer / TOC | 80% / 95% | 동일 | 동일 |

**전체 평균: v1 ~90% → v2 ~95% mockup 일치**

---

## 4. ★ 완전 동일 (100%) 만들기 위한 체크포인트

### Tier A — 데이터 source 있는데 frontend 만 (즉시 가능, 작은 작업)

| # | 항목 | 위치 | 시간 |
|---|---|---|---|
| A1 | Phase progress `.pp-rerun` 버튼 (mockup 형식) + Phase 4a.5 항목 추가 | `HeaderMockup.tsx` PhaseProgressMockup | 30분 |
| A2 | footer `.dev-btn` mockup 디자인 (5 button — status toggle / key_stats dump / last_error / cost / phase raw) | `CaseDevFooter.tsx` | 20분 |
| A3 | 좌측 TOC 그룹 라벨 "목차" / "DEV" (mockup) | `CaseSideTOC.tsx` | 5분 |
| A4 | B 티어 분포 row 클릭 → 그 티어 인플 filter (mockup 의도) | `SectionBMockup.tsx` | 1시간 |
| A5 | C heatmap 데이터 빈 케이스 — 그라데이션 빈 grid 표시 (mockup 형식) | `SectionCMockup.tsx` | 15분 |
| A6 | mockup의 `.region-toggle` 디자인 일치 (US 전체 / SEA / MENA 3 button) | `CaseHeader.tsx` RegionScopeToggle | 30분 |

### Tier B — backend / 데이터 모델 변경 필요 (중간 작업)

| # | 항목 | 위치 | 시간 |
|---|---|---|---|
| B1 | **KPI strip TT Shop GMV trend ▲** — 전월 대비 변화율 + 색 | `phase2.ts` sales_summary 에 `prev_period_revenue` 추가 + page.tsx 전달 | 1시간 |
| B2 | **D SKU 매출 표 컬럼 확장** — 카테고리 / 출시일 / 가격 / spark line / 동반 영상 | `SectionDMockup.tsx` + page.tsx SQL 매핑 (products 테이블 컬럼 있음) | 1.5시간 |
| B3 | **D SKU 선택 시 GMV 시계열 차트** (mockup line 1163-1173) | Kalodata videos_xlsx + publish_date 그룹 → svg | 1시간 |
| B4 | **C heatmap measure "GMV 기여"** — Kalodata 영상매출 매핑 | `SectionCMockup.tsx` + heatMeasure 'gmv' 옵션 추가 | 1시간 |
| B5 | Phase progress `.pp-rerun` 클릭 → 옛 PhaseProgressToggle 와 통합 (실제 trigger) | `HeaderMockup.tsx` + PhaseProgressToggle wrapper | 1.5시간 |
| B6 | G 인사이트 `related-cases` — 같은 country 다른 brand 케이스 SQL 매핑 | page.tsx + InsightCardMockup | 1시간 |

### Tier C — 데이터 자체 미수집 (큰 작업, 별도 수집 파이프)

| # | 항목 | 데이터 source | 시간 |
|---|---|---|---|
| C1 | **D 카테고리 ranking 시계열** | Kalodata Live commerce ranking 별도 수집 (Pro 4000 크레딧) | 2-3시간 |
| C2 | **D Affiliate code conversion** | 광고 영상에서 promo code 추출 파이프 (Phase 4d.5 신규) | 4-6시간 |
| C3 | **C paid/seeded/organic 분류 안 seeded** | FTC 시딩 분류 데이터 source (label 수집) | 2시간 |
| C4 | **B Top GMV GPM 컬럼** | lemur stats GPM 필드 (현재 null) | lemur API 의존 |
| C5 | **B histogram bar 10개** | shopGmvDistribution 세분화 (현재 5 bucket) | 30분 + backend |

### Tier D — 데이터 모델 / 마이그레이션 (A 모델 완성)

| # | 항목 | 영향 | 시간 |
|---|---|---|---|
| D1 | `cases.channel` 라벨 의미 deprecate — Browse 페이지 channel 필터 제거 | `BrowseFilters.tsx` + page.tsx | 20분 |
| D2 | 같은 brand+country 옛 case 2개 (TT Shop + Amazon) 합치는 마이그레이션 도구 | 별도 dev 액션 | 2시간 |
| D3 | case-detail status-strip 의 `c.channel · status` sub 라벨 제거 (A 모델) | `HeaderMockup.tsx` | 10분 |
| D4 | 신규 case 폼 hidden `platform=amazon` → 마이그레이션 (channel nullable) | migration + form | 1시간 |

---

## 5. 우선순위 todo list

### 즉시 (Tier A, 2-3시간)
- [ ] A1: Phase progress `.pp-rerun` 버튼 + Phase 4a.5
- [ ] A2: footer `.dev-btn` mockup 디자인
- [ ] A3: TOC 그룹 라벨
- [ ] A5: heatmap 빈 케이스 placeholder
- [ ] A6: region-toggle mockup 디자인

### 다음 PR (Tier B, 5-6시간)
- [ ] B1: KPI trend ▲ — phase2 prev_period_revenue 추가
- [ ] B2: D SKU 매출 표 컬럼 확장
- [ ] B3: D SKU GMV 시계열 차트
- [ ] B4: C heatmap "GMV 기여" measure
- [ ] B5: Phase progress `.pp-rerun` trigger 통합
- [ ] B6: G related-cases SQL

### 데이터 수집 별도 (Tier C, 8-12시간)
- [ ] C1: Kalodata Live commerce ranking 수집 파이프
- [ ] C2: 광고 promo code 추출 파이프
- [ ] C3: 시딩 분류 데이터 source
- [ ] C4: lemur GPM 채움 (외부 의존)

### A 모델 정리 (Tier D, 4시간)
- [ ] D1: Browse channel 필터 제거 (A 모델 의미 X)
- [ ] D2: 같은 brand+country 옛 case 합치는 마이그레이션
- [ ] D3: status-strip channel sub 라벨 정리
- [ ] D4: cases.channel migration nullable

---

## 6. 결정 사항 사용자 답변 필요

1. **Tier C 데이터 수집 파이프** 박을 가치 있는지? — 매번 새 case 마다 비용 발생 (Kalodata Pro 4000 크레딧 / 광고 code 추출 등)
2. **D2 옛 case 마이그레이션 도구** — 같은 brand+country 2개 case 있으면 합칠지 vs 그대로
3. **Phase progress `.pp-rerun`** — 모든 phase 박을지 (mockup) vs 핵심 phase 만
4. **B histogram bar 10개** vs 5 bucket (현재)

---

## 7. 데이터 흐름 — 케이스별 visual 풍부도

| 케이스 | 데이터 풍부도 | visual 약함 원인 |
|---|---|---|
| Anua (amazon) | tier_dist 3m / cluster 6 / heatmap 6 / kalodata X | brand_meta_pages X → Meta 광고 빈, Kalodata 미수집 → D 일부 — |
| Skin1004 TT Shop | cluster 5 / vision 207 / kalodata X | phase4a 옛 캐시 ("Amazon 케이스가 아님") — 재실행 중 |
| SharkNinja | TK uploaded_at NULL → vision 0 → cluster 0 | Exolyt CSV 적재 시 timestamp 누락 (raw data fix 필요) |

= mockup 처럼 풍부 visual 보려면 **데이터 수집 자체** 완비 (모든 채널 + Kalodata + phase4a brand_meta_pages 박힘).

---

## 8. 새 layout / UX (v2 확정)

- **Topbar** — TikCle BP / Browse / + New Case / 환율 설정 / SH (사이드바 폐기)
- **status-strip dark bar** — brand / tier / 채널 dot / actions 통합
- **메인 영역** — max-width 1680 (사이드바 제거 만큼 wide)
- **데이터 채널 카드 = 인라인 expand entry** (accordion 1개만)
- **데이터 추가 details 제거** — 모든 entry channelEntries map 으로 카드 안 render
- **A 모델** — 한 case = 한 country × 한 brand × 다채널
- **신규 case** — country + brand만 (플랫폼 선택 X)
- **Browse** — brand 명 검색 + 국가/플랫폼/티어 필터
