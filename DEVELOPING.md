# 개발 가이드

이 문서는 TikCle BP를 **수정/확장하려는 개발자**를 위한 가이드입니다. 사용자 가이드는 [README.md](./README.md) 참고.

## 목차

0. [현재 진행 상황 (다음 세션 시 먼저 읽기)](#현재-진행-상황-다음-세션-시-먼저-읽기)
1. [기술 스택](#기술-스택)
2. [로컬 셋업](#로컬-셋업)
3. [프로젝트 구조](#프로젝트-구조)
4. [핵심 아키텍처](#핵심-아키텍처)
5. [Inngest 오케스트레이션](#inngest-오케스트레이션)
6. [각 Phase 상세](#각-phase-상세)
7. [데이터 모델](#데이터-모델)
8. [외부 API 통합](#외부-api-통합)
9. [Storage 패턴](#storage-패턴)
10. [배포 워크플로우](#배포-워크플로우)
11. [Common dev tasks](#common-dev-tasks)
12. [DB 마이그레이션](#db-마이그레이션)
13. [디버그 SQL](#디버그-sql)
14. [트러블슈팅](#트러블슈팅)

---

## 현재 진행 상황 (다음 세션 시 먼저 읽기)

> **갱신 시점**: 2026-05-04 저녁 (옵션 H 권역 모델 + Browse + 브랜드 페이지 + Class 분류 + 히어로 SKU×메가영상 박힘. NOONI 재분석 진행 중)

### 진행 중/완료 케이스

| Brand | Country | Channel | case_id | 비고 |
|---|---|---|---|---|
| **EQQUALBERRY** | US | Amazon | `5f106fc6-4461-4d5c-a0c9-ef19bf2bcb56` | 5/3 완주. 옵션 H 적용 후도 단일이라 영향 없음 |
| **Lepique** | (재생성 대기) | — | — | 5/4 통째 삭제. 권역 case (MENA) 전제로 사용자 새로 만들 예정 |
| **Lefilleo** | MENA (Hybrid) | Amazon | `e7d4e2ad-6f17-4146-9db8-c3424de9cc0c` | 5/4 분석 완주 (sanitize 강화 후). last_error 자동 클리어 적용 |
| **NOONI** | US | Amazon | `5967da7d-175a-447a-a6de-2919b90a6971` | 5/4 통째 정리 (Dr.Reju-All 영상 섞여있어 재분석). phase2 재실행 대기 |

### 5/4 박힌 큰 변화 (Browse + 권역 + 통화 + 브랜드)

**1. 옵션 H — 권역(Hybrid) country 모델** ([countries.ts](src/lib/case-detail/countries.ts), [migration 010](supabase/migrations/010_marketplace_country_on_sales.sql))
- `case.country = "MENA" / "LATAM_ES"`인 권역 case: 시딩(contents/meta_ads) 통합, 매출(products/case_product_sales/sales_snapshot) 국가별 sub-breakdown
- 자식 테이블에 `country` 컬럼 추가 + products unique를 `(case_id, country, asin)`로 변경 (동일 ASIN SA/AE 분리)
- new case form 드롭다운: 단일 / 권역 통합 (Hybrid) / SEA 국가별 / MENA·LATAM_ES 안 단일 5개 그룹
- AmazonSalesSection: 권역 case면 `marketplace_country` select 노출

**2. 통화 / 환율 시스템** ([migration 009](supabase/migrations/009_currency_and_exchange_rates.sql), [exchange-rates.ts](src/lib/case-detail/exchange-rates.ts), [exchange-rates-server.ts](src/lib/case-detail/exchange-rates-server.ts))
- `case_product_sales.currency`, `sales_snapshot.currency` 컬럼 추가 (default 'USD')
- `app_settings(key text PK, value jsonb)` 테이블 + `exchange_rates` row 1개에 모든 환율 보관
- `/settings/exchange-rates` 페이지에서 환율 수정 가능 (form 저장 → app_settings update)
- 표시: `formatLocalAndUsd(amount, currency, rates)` — `SAR 5,625 ($1,500)` 식
- KRW=1500/USD 기본값 (사용자 지정), 다른 통화도 default
- ⚠ exchange-rates client-safe / server fetch 분리 (server-only sentinel) — Vercel build fail 방지

**3. Browse 페이지 (`/cases`)** ([page.tsx](src/app/cases/page.tsx), [BrowseFilters.tsx](src/components/case-detail/BrowseFilters.tsx))
- `/`이 `/cases`로 redirect라 사실상 홈
- 필터 native select 3개: 국가 / 플랫폼 / 티어
- 국가 select는 case 생성 form과 동일 그룹 구조 (단일 + 권역 + SEA + MENA·LATAM_ES 안 단일)
- 티어: `Tier 1 (1b+) / Tier 2 (100m-1b) / Tier 3 (<100m)` — `cases.revenue_tier` ([migration 011](supabase/migrations/011_cases_revenue_tier.sql)) 사용자가 case별 직접 박는 태그
- case detail 헤더에 [RevenueTierPicker](src/components/case-detail/RevenueTierPicker.tsx)로 inline 편집

**4. 브랜드 페이지 (`/brands/[id]`)** ([page.tsx](src/app/brands/[id]/page.tsx))
- 브랜드 헤더 + "분석된 케이스" 카드 그리드 (각 카드: country/channel · 메타 chip · KPI 4개 매출/콘텐츠/인플/SKU)
- 권역 합산 카드 — 같은 region에 case 2개+ 있으면 USD 환산 합계 + 콘텐츠/인플 SUM
- Browse row의 brand 텍스트 → /brands/[id], case detail breadcrumb도 업데이트

**5. Sidenav** ([sidenav.tsx](src/components/layout/sidenav.tsx))
- `🏠 Browse` / `⚖ Compare` / `$ 환율 설정` 3개 항목
- active 매칭은 가장 긴 prefix 우선 (Compare가 /cases와 동시 active 안 됨)

**6. Class A/B/C 분류** ([creator-class.ts](src/lib/case-detail/creator-class.ts))
- 영상 수 기반: A (50+) / B (30~49) / C (10~29)
- phase2 aggregator threshold 20 → 10 (Class C 풀 포함)
- TopCreatorsList row에 색깔 배지 (A 그린 / B 블루 / C 회색)

**7. 히어로 SKU × 메가 영상** ([HeroSkuMegaVideos.tsx](src/components/case-detail/HeroSkuMegaVideos.tsx))
- 매출 Top 3 SKU + 매칭된 메가 영상 (views ≥ 1M, confidence='high', matched_skus 포함)
- views desc 최대 6개. phase4b_sku.displayed_videos reverse mapping
- Section D의 SkuSalesModule 아래 위치

**8. 운영성 보조**
- [AutoRefresh.tsx](src/components/case-detail/AutoRefresh.tsx) — 분석 진행 중 5초 polling
- [loading.tsx](src/app/cases/[id]/loading.tsx) — case detail 진입 시 즉시 스켈레톤
- mark-ready 시점에 `last_error` 자동 클리어
- AmazonSalesSection "↶ 최근 업로드 롤백" 버튼 (가장 최근 captured_at ±2초 batch 삭제)

### 5/4 발견 + fix된 버그 (`bp_bugs.md` #16~26)

| # | 한 줄 |
|---|---|
| 16 | Inngest JCS Missing surrogate (sanitizeDeep + Buffer round-trip) ✅ |
| 17 | Vercel build fail (exchange-rates client/server 분리) ✅ |
| 18 | NOONI Dr.Reju-All 영상 섞임 (ETL 단계) ⚠ 운영 룰 |
| 19 | phase37 stats 카운트 누락 (DB 박힘 ≠ stats) 📋 미해결 |
| 20 | phase2 BSR fetch Supabase 1000 row limit ✅ |
| 21 | Vision cover_url 만료 ⚠ 자연 만료 |
| 22 | Helium10 csv 컬럼명 변형 (Monthly vs ASIN Sales) ✅ |
| 23 | TOC sticky scroll 미작동 ✅ |
| 24 | Meta 광고 권역 코드 fetch fail ✅ |
| 25 | products 동일 ASIN SA/AE unique 충돌 ✅ |
| 26 | last_error 잔존 ✅ |

### 데이터 정합 검증 끝난 것 (B-1~B-5 + Vision/Cluster/SKU 모두 ✓)

| 검증 | 결과 |
|---|---|
| exolyt 4,829 contents | ✓ |
| 7 ASIN sales / BSR 시계열 | ✓ |
| **B-3** Phase 3 `tier_dist_by_month` | ✓ |
| **B-2** Phase 2 `top_videos` | ✓ |
| **B-5** Phase 4a DTC 분류 (자사몰 128건) | ✓ |
| **B-4** Phase 5 `bsr_inflections` (21개 marker) | ✓ |
| **B-1** Phase 5 franc-min 언어 detect | ✓ 89% (4291/4825). 영어 67%/스페인어 7% |
| **Phase 4b.3 Vision** | ✓ 213/213 tagged ($1.5) |
| **Phase 4b.4 cluster** | ✓ Pass1 26 → Pass2 14 → Pass3 6 메타 |
| **Phase 4b.5 SKU** | ✓ 17/18 영상 매칭 |
| **Heatmap** | ✓ 151 영상 in heatmap (sub-nano 43 + unknown 2 = 45 빠짐, 의도된 디자인) |

### 다음 세션 즉시 시작할 폴리시 (사용자 컨펌 받음, 2026-05-03 기준 — 모두 5/3에 박힘)

mockup [biodance_case_detail.html](../brain/bp-playbook/frontend-mockup/biodance_case_detail.html) 비교 후 사용자가 명시적으로 추가 요청한 4개 (✅ commit `37aa472`):

1. **Top creator에 outlier 추가** — 현재 `video_count >= 20` 기준만. mockup의 Q2 "Organic Top 3 (TTS 미등록 슈퍼 viral)"처럼 **단일 viral outlier** (예: jooshica 13.7M, video_count=1) 별도 카테고리로 표시 필요.
   - 후보 기준: `views >= mega_threshold` (1M+) **AND** `video_count < 20`
   - Phase 2의 `top_creators` 옆에 별도 list 추가 (또는 `top_creators` 안 outlier 플래그)

2. **Meta 광고 라이브러리 썸네일 짤림** — 현재 [MetaAdsBrowser](src/components/case-detail/MetaAdsBrowser.tsx)의 AdCard `aspect-ratio: 9/16` + `objectFit: cover`로 잘림. mockup `ad-board` 디자인은 다 보였음. card 사이즈 또는 objectFit 조정.

3. **우측 사이드바 TOC** — mockup의 `<aside class="side-toc">` 패턴. A/B/C/D/E 섹션 점프 sticky sidebar.

4. **맨 위 PhaseProgress 토글로** — 현재 항상 펼쳐져있어서 화면 차지 큼. 디폴트 닫힘 + "분석 단계 ▼" 버튼으로 펼치게.

### 후속 polish (mockup 비교 시 발견됨, 사용자 컨펌 필요)

mockup 대비 추가로 빠진 것 (사용자가 위 4개 외 진행 의향 보일 때):

🔴 **핵심 (가설 부합에 결정적)**:
- 함정·한계 섹션 (자동화 분석 인용 시 함께 읽을 8개 항목 정리)
- 가설 (사람 작성) 섹션 — "왜 작동했는가" 사람 입력 자리. 메소드론 7-9 ("자동 초안 X")
- Class A~E 정밀 분류 (현재 is_shop_creator boolean만)
- 각 phase 한 줄 결론 (자동 생성)

🟡 **중요**:
- 시즈널리티 이벤트 매트릭스 (Prime Day / BFCM / Sephora 런칭 등 × 참여 수준 × 결과)
- 브랜드 고유 트리거 입력 자리 (TTS 런칭일 / paid collab 시작 등)
- Advertiser Type 분류 (본사 / 유통 / 인플 — 현재 boolean만)
- 캠페인 group + 광고 보드 (예: "Sephora 런칭 11건" grouping)
- 3사 비교 표 (case detail 안에 mini)
- 경쟁사 공유 affiliate 풀 (다른 케이스의 인플과 교집합)
- 메가 viral 발행 시점 ↔ 매출 라인 직접 매칭 (현재 BSR ↔ 콘텐츠만)
- 히어로 집중도 분석 ("히어로 1개 88% 집중" 같은 자동 해석)

🟢 **마이너 polish**:
- 오버뷰 9Q 카드 (한눈 요약)
- Cluster 대표 영상 iframe (top creators는 있는데 cluster는 placeholder)
- ISO 639-3 → ISO 639-1 매핑 확장 (마이너 언어가 대문자 코드로 표시)

### 다음 세션 즉시 진행 순서

1. **현재 진행 상황 섹션** + `/Users/sanghui/티클/bp_bugs.md` 읽기 (#16~26 5/4 추가분)
2. NOONI 새 case (`5967da7d-175a-447a-a6de-2919b90a6971`) 재분석 끝났는지 확인 — phase2 reset 상태로 사용자가 재실행 대기
3. 5/4 박힌 12 commits 확인:
   - `4f65f39` compare 페이지 통합
   - `0fbb717` (revert됨) 한 줄 결론 자동
   - `b5969de` phase2 누락 fallback
   - `3c931d3` TOC sticky / 인플 2단 / Meta 영상
   - `0e36987` Shop 딱지 제거 + grid 갈아엎기
   - `5a396a9` TOC sticky 표준 패턴
   - `df6de9e` main 진짜 scroll 컨테이너
   - `bb2211b` country 권역 코드 (옵션 A 시점, 후 수정됨)
   - `c7bd445` DEVELOPING 신규 기능 후보
   - `4a26dfa` 옵션 D 단일 국가 (또 후 수정됨)
   - `737ae14` 통화 컬럼 + 환율 settings
   - `81e851d` 옵션 H — 시딩 통합 + 매출 by-country (현재 패턴)
   - `9522ca8` Helium10 컬럼 alias
   - `fb556c8` 분석 진행 중 자동 갱신
   - `d83380a` Browse + revenue_tier
   - `8bfe94b` exchange-rates client/server 분리
   - `caf89e5` last_error 자동 클리어
   - `e30df82` case detail loading.tsx
   - `2ea2090` /brands/[id]
   - `6f4c313` Hybrid 라벨 제거
   - `9fef314` Sidenav Compare
   - `2d1ad9e` Class A/B/C
   - `9d27d10` 매출 롤백 버튼
   - `ca4cda6` phase2 BSR limit fix
   - `ba82c83` 히어로 SKU × 메가 영상
   - `068a4b0` HeroSkuMegaVideos onError 제거 (RSC issue)
4. 사용자가 다음 우선순위로 박을지 결정:
   - 🔴 phase37 stats fix (DB 직조회 또는 finalize logic 변경)
   - 🔴 Class A~E lemur GMV 호출 (역대 판매 검증 — 메소드론)
   - 🟡 함정·한계 / 가설 / 한 줄 결론
   - 🟡 시즈널리티 이벤트 매트릭스 / 브랜드 페이지 룰베이스 매칭

### 신규 기능 후보 (사용자 요청, 시점 미정)

#### 브랜드 단위 권역별 요약 리포트 (2026-05-04 사용자 요청)

> 브랜드를 클릭했을 때 그 브랜드의 모든 케이스를 권역별로 정리한 한 장 요약 카드 그리드.

**현재 상태**:
- cases 리스트에는 케이스 row만 보이고 브랜드 단위 진입점 없음
- 같은 브랜드의 다른 권역 케이스를 보려면 cases 리스트에서 직접 검색해야 함

**요구사항**:
- `/brands/[id]` 또는 `/cases?brand=X` 진입점 추가 (BrandAutocomplete 또는 cases row의 brand 텍스트 클릭)
- 그 브랜드의 모든 case 조회 → 권역별 카드 1장씩 (US / KR / JP / EU / LATAM_ES / LATAM_BR / SEA / MENA)
- 카드 KPI: 매출 / 영상 수 / Top tier 인플 / 마지막 분석일 등 핵심 요약
- 카드 클릭 시 해당 case detail로 이동
- 권역 케이스가 없으면 카드 dim 처리 + "케이스 만들기" CTA

**관련 운영 룰 (2026-05-04 결정 — 옵션 H, 옵션 D 후 다시 진화)**:
- **단일 국가 case** (US/KR/JP/EU/BR/SG/TH/MY/ID/PH/VN 등): 시딩+매출 모두 단일 (옵션 D 그대로)
- **권역 case** (MENA/LATAM_ES): case.country=권역 코드. **시딩 통합 + 매출 by-country 분리** (옵션 H)
  - contents/meta_ads.country = 권역 코드 (= case.country, 통합 fetch)
  - products/case_product_sales/sales_snapshot.country = 진짜 국가 코드 (SA/AE/MX/...)
  - products unique = (case_id, country, asin) — 동일 ASIN이 SA/AE 양쪽 박혀도 OK
- 권역 안 단일 분석 원할 때는 그 country 단일 case 별도 (e.g., MENA 안 SA 단일)
- 권역 view는 이 페이지에서 처리:
  - cases 리스트의 region 그룹 헤더 (TODO)
  - 브랜드 페이지의 권역 카드 ([brands/[id]/page.tsx](src/app/brands/[id]/page.tsx) — 5/4 박힘)
  - /cases/compare에서 N개 묶어 보기 (이미 됨)
  - case detail 안에서 by_country sub-breakdown (sales_summary.by_country, KpiStrip + SkuSalesModule)

**권역 리포트 합산 룰 (구현 시)**:
- SUM: 매출, 영상 수, 광고 건수
- UNION (중복 제거): top creators, 메타 클러스터, USP 키워드
- AVG / 가중평균: ER, 저장률 같은 비율 지표
- 권역 안 case 1개면 그 case = 권역 분석 (합산 X)
- 2개+면 권역 리포트 활성, 0개면 "케이스 없음" 안내

### 이번 세션 코드 변경 (5/2-3 push, main에 모두 반영)

| commit | 내용 |
|---|---|
| `df89360` | Amazon sales dropzone 적재 후 사라지던 UI 버그 수정 |
| `73a98fc` | BSR upload 같은 날짜 중복 ON CONFLICT dedup |
| `d50fc68` | BSR 업로드 ASIN mismatch 검증 + 재업로드 UX |
| `65487cd` | upload 후 stale UI 해결 (`router.refresh()`) |
| `1b314ab` | hasBsr 계산 Supabase 1000 row limit 우회 (head count query) |
| `373a732` | Vision 코드 base64 → URL source (이슈 진단용. 잔고가 진짜 원인이라 검증 미완) |
| `ca8fd59` | Vision failure_reasons 캡처 (디버그) |
| `336c1da` | Vision api_key_preview stats 노출 (디버그) |
| **`9ed0380`** | **B-3** Phase 3 `tier_dist_by_month` + UI month dropdown |
| **`dc36044`** | **B-2** TopCreator `top_videos` (top 3 영상 lazy iframe expand) |
| **`07c327b`** | **B-5** Meta 광고 DTC 분류 + 월별 필터 + 더보기 browser |
| **`8c15f20`** | **B-4** BSR x축 month tick + 급등 marker + 동반 콘텐츠 |
| `46a2f54` | docs: 이 "현재 진행 상황" 섹션 추가 |
| `2234ac6` | phase 3.5 fix (tier_dist_by_month 덮어쓰기 방지) + BSR SKU dropdown + Meta 광고 본사만 디폴트 + 랜딩 필터 |
| `eb508d1` | Meta 광고 LandingBreakdown 카드 복구 + BSR 단일점 SKU circle 처리 |
| **`74b1240`** | **B-1** Phase 5 franc-min 언어 detect (caption 기반 폴백) |
| `b089e15` | docs: DEVELOPING.md 진행 상황 섹션 갱신 |
| `97402a7` | UTF-16 surrogate pair sanitize (clusterer/sku-matcher/vision-tagger) — Anthropic JSON serialize fail 방지 |
| `2c4ca6f` | Inngest fail 시 case status 자동 'ready' reset + key_stats.last_error + UI alert |

(굵게: 슬랙 9 항목 vs 실제 구현 gap 메우는 변경 5개)

### 참고 파일

- **버그 누적 리포트**: `/Users/sanghui/티클/bp_bugs.md` (15건). 모든 발견 버그 + 원인 + 적용된 fix 정리. 신규 발견 시 #16부터 추가.
- **mockup 참고**: `/Users/sanghui/티클/brain/bp-playbook/frontend-mockup/biodance_case_detail.html` — 사용자가 상상한 시딩 a-to-z dashboard 원본. 9 Q + 함정 + 가설 섹션 구조.
- **변환 스크립트**: 다운로드 폴더 Helium10 sales-30d.csv → SellerSprite 형식 변환 1회용 코드는 chat 세션 안에. 다음 사용자도 비슷한 변환 필요하면 `parsers/helium10-trendster.ts`로 정식 통합 후보 (버그 #3 참고).

---

## 기술 스택

| 레이어 | 사용 |
|---|---|
| Framework | **Next.js 15** App Router + React 19 + TypeScript (strict) |
| Styling | **Tailwind CSS 4** (CSS-first config, design tokens in `globals.css`) |
| DB | **Supabase** (project `dxjodlxkynjirldpumxr`, PostgreSQL 16) |
| 백그라운드 작업 | **Inngest 3** (이벤트 기반 phase 오케스트레이션, 자동 retry, step 체크포인팅) |
| 외부 API | **Apify** (clockworks · lemur · pro100chok · curious_coder/facebook-ads), **Anthropic** Claude Sonnet 4.6 |
| CSV 파싱 | papaparse |
| 호스팅 | **Vercel** (Pro plan, Fluid Compute 활성화 필수) |
| 인플 외부 DB | Supabase 별도 project `dynqedcbmanvyfdlruni` (read-only) |

---

## 로컬 셋업

### 사전 요구사항
- Node.js 20+
- npm
- Supabase project 접근 권한 (4ITM-solution 멤버)

### 설치

```bash
git clone https://github.com/4ITM-solution/TikCle-BP.git
cd TikCle-BP
npm install
```

### 환경변수

`.env.local` 생성 (`.env.example` 참고):

```bash
# Supabase 메인 (cases / contents / sales)
NEXT_PUBLIC_SUPABASE_URL=https://dxjodlxkynjirldpumxr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<공유 secret store에서>
SUPABASE_SERVICE_ROLE_KEY=<Supabase dashboard → Settings → API>

# Supabase 인플 외부 DB (fans 룩업 전용, read-only)
INFLUENCER_DB_URL=https://dynqedcbmanvyfdlruni.supabase.co
INFLUENCER_DB_ANON_KEY=<공유 secret store에서>

# 외부 API
APIFY_TOKEN=<Apify console → Settings → Integrations>
ANTHROPIC_API_KEY=<console.anthropic.com>

# Inngest (로컬에선 빈 값 OK — dev mode 자동 등록)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

### 실행 (터미널 2개 필요)

```bash
# 터미널 1: Next.js dev server
npm run dev
# → http://localhost:3000

# 터미널 2: Inngest dev server (선택, 없어도 작동하지만 UI 못 봄)
npx inngest-cli@latest dev
# → http://localhost:8288 (runs 모니터링)
```

### 자주 쓰는 명령

```bash
npm run dev        # dev server
npm run build      # production 빌드 테스트
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript 검사 (CI에서도 동일)
```

---

## 프로젝트 구조

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 루트 레이아웃 (topbar + sidenav)
│   ├── globals.css               # 디자인 토큰
│   ├── cases/
│   │   ├── page.tsx              # 케이스 리스트
│   │   ├── new/
│   │   │   ├── page.tsx          # 케이스 생성 폼
│   │   │   └── actions.ts        # createCase server action
│   │   └── [id]/
│   │       ├── page.tsx          # 케이스 상세 (server component)
│   │       └── upload-actions.ts # CSV 업로드 + 분석 트리거 server actions
│   └── api/
│       └── inngest/route.ts      # Inngest 함수 등록 endpoint
│
├── components/
│   ├── case-create/              # 케이스 생성 폼 컴포넌트
│   ├── case-detail/              # 케이스 상세 UI
│   │   ├── MiniDashboard.tsx     # 분석 결과 대시보드 (A~E 섹션)
│   │   ├── PhaseProgress.tsx     # Phase 진행 패널 (재실행 버튼)
│   │   ├── ExolytSection.tsx     # exolyt 업로드 (Storage 경유)
│   │   ├── AmazonSalesSection.tsx
│   │   ├── BsrSection.tsx
│   │   ├── StartAnalysisButton.tsx
│   │   ├── DeleteCaseButton.tsx
│   │   ├── MetaClusterCard.tsx   # 메타 클러스터 카드 (펼치기)
│   │   └── UploadDropzone.tsx
│   └── layout/                   # Topbar / Sidenav
│
└── lib/
    ├── supabase/                 # Supabase 클라이언트 (browser/server) + types
    ├── inngest/
    │   ├── client.ts             # Inngest client + PhaseKey 정의
    │   ├── types.ts              # 모든 Phase stats 타입 + KeyStats
    │   ├── functions/
    │   │   └── run-analysis.ts   # 메인 오케스트레이터 (모든 phase 순차 실행)
    │   ├── aggregators/          # phase별 비즈니스 로직
    │   │   ├── phase1-5-shop.ts
    │   │   ├── phase2.ts
    │   │   ├── phase3.ts
    │   │   ├── phase3-5-fans.ts
    │   │   ├── phase3-7-shop-creator.ts
    │   │   ├── phase4a.ts
    │   │   ├── phase4b-sample.ts
    │   │   ├── phase4b-asr.ts
    │   │   ├── phase4b-vision.ts
    │   │   ├── phase4b-clusters.ts
    │   │   ├── phase4b-sku.ts
    │   │   └── phase5-position.ts
    │   └── supabase.ts           # Inngest 함수용 service role 클라이언트
    ├── apify/                    # actor 호출 래퍼
    │   ├── clockworks-tiktok.ts  # ASR 수집 + fans
    │   ├── lemur-shop-creators.ts
    │   ├── tiktok-shop-scraper.ts # pro100chok
    │   └── meta-ads.ts           # curious_coder/facebook-ads
    ├── anthropic/
    │   ├── vision-tagger.ts      # Phase 4b.3
    │   ├── clusterer.ts          # Phase 4b.4 (3-pass)
    │   └── sku-matcher.ts        # Phase 4b.5
    ├── parsers/                  # CSV 파서
    │   ├── exolyt.ts
    │   ├── amazon-sales.ts
    │   └── bsr.ts
    ├── influencer-db/lookup.ts   # 외부 인플 DB 룩업
    ├── storage/asset-downloader.ts # FB CDN 영상 → Supabase Storage
    └── cost-estimate.ts          # 분석 시작 전 비용 추정
```

---

## 핵심 아키텍처

### 1. 케이스 라이프사이클

```
[케이스 생성] cases.status='draft'
        ↓
[CSV 업로드] contents/products/case_product_sales 채워짐
        ↓
[분석 시작 클릭] startAnalysis server action
   → cases.status='running'
   → inngest.send("case/start.analysis", {case_id})
        ↓
[Inngest 함수 실행] runAnalysis (run-analysis.ts)
   → Phase 1.5 → 2 → 3 → 3.5 → 3.7 → 4a → 4a.5 → 4b.1~5 → 5
   → 각 phase 결과를 cases.key_stats jsonb에 누적 저장
        ↓
[완료] cases.status='ready'
        ↓
[페이지 새로고침] MiniDashboard 표시 (key_stats 기반 렌더)
```

### 2. 데이터 흐름

```
Browser
  ↓ (FormData 또는 Storage 직접 업로드)
Supabase Storage (case-assets bucket)
  ↓ (Server Action read)
Server Action → CSV 파싱 → DB 테이블에 insert
  ↓
contents / products / case_product_sales / sales_snapshot
  ↓ (분석 시작)
Inngest event → runAnalysis 함수
  ↓ 각 step.run 마다 외부 API + DB read/write
key_stats jsonb 컬럼에 phase별 결과 누적
  ↓
페이지 SSR (server component) → MiniDashboard 렌더
```

### 3. 결과 저장 — `cases.key_stats` JSON

모든 분석 결과는 `cases.key_stats` (jsonb)에 저장됩니다. 구조는 [src/lib/inngest/types.ts의 `KeyStats`](./src/lib/inngest/types.ts):

```ts
type KeyStats = {
  phase1_5?: Phase15Stats;
  phase2?: Phase2Stats;
  phase3?: Phase3Stats;
  phase35?: Phase35Stats;
  phase37?: Phase37Stats;
  phase4a?: Phase4aStats;
  phase4b_sample?: Phase4bSampleStats;
  phase4b_asr?: Phase4bAsrStats;
  phase4b_vision?: Phase4bVisionStats;
  phase4b_clusters?: Phase4bClusterStats;
  phase4b_sku?: Phase4bSkuStats;
  phase5?: Phase5Stats;
};
```

### 4. 디자인 토큰

`src/app/globals.css`에 CSS 변수로 정의. Tailwind class보다 직접 `var(--color-xxx)` inline style을 더 많이 씁니다 (mockup과 1:1 일치 위해).

```css
--color-ink: #161616;
--color-accent: #c7543c;     /* 메인 브랜드 빨강 */
--color-pos: #2e7d3e;        /* 초록 (성공) */
--color-info: #2f6391;       /* 파랑 (정보) */
--color-warn: #c2722c;       /* 주황 (경고) */
--color-g25, g50, g100, ..., g600;  /* 회색 단계 */
--color-accent-soft, info-soft, ...; /* 배경용 옅은 톤 */
```

---

## Inngest 오케스트레이션

### 핵심 개념

- **함수**: `runAnalysis` 한 개가 모든 phase를 순차 실행 ([run-analysis.ts](./src/lib/inngest/functions/run-analysis.ts))
- **트리거 이벤트**: `case/start.analysis`
- **Step**: `step.run("step-id", async () => {...})` 단위로 체크포인팅. 한 step 실패 시 그 지점부터만 재시도.
- **Step IDs**: 같은 run 안에서 unique해야 함. 동적 loop는 인덱스 포함 (`phase-3-7-batch-${i}`).

### 캐시 + Cascade 패턴

각 phase는 다음 패턴을 따름:

```ts
// 1. 결과 변수 선언
let phaseN: PhaseNStats;

// 2. 캐시 hit 조건 (이전 결과가 있고, force 아니고, 의존 phase가 새로 안 돌았으면 캐시)
const cacheHit =
  existing.phaseN &&
  !force("phaseN") &&
  !upstreamPhaseHasNewData;

if (cacheHit) {
  phaseN = existing.phaseN!;
} else {
  // 3. 실제 실행 (step.run으로 wrap)
  phaseN = await step.run(`phase-N-execute`, async () => {
    return await runPhaseN(supabase, case_id, ...);
  });
}

// 4. 새로 돌렸는지 추적 (cascade 판단용)
const phaseNNew = !existing.phaseN || force("phaseN") || upstreamHasNewData;
const phaseNHasData = phaseNNew && !phaseN.skipped_reason;  // skip은 cascade 안 시킴

// 5. 새로 돌았으면 DB save
if (phaseNNew) {
  await step.run(`phase-N-save`, async () => {
    const newStats: KeyStats = {
      ...existing,
      // 모든 이전 phase 결과 명시 포함 (orchestrator 한 run 동안 변수에 보관된 것들)
      phase1_5,
      phase2: phase2Effective,
      phase3: phase3Final,
      phase35,
      phase37,
      // ...
      phaseN,  // 이번 phase 추가
    };
    await supabase.from("cases").update({ key_stats: newStats }).eq("id", case_id);
  });
}
```

### ⚠️ Save 시 주의 — `...existing` 함정

`existing`은 run 시작 시 한 번 읽어서 stale. 후속 phase save가 `...existing` 스프레드 후 일부 phase만 override 하면, 직전 phase가 새로 저장한 값이 **stale existing 값으로 덮어쓰일 위험** 있음.

**해결**: 모든 save 블록에 이전 phase 변수들을 명시적으로 포함시켜야 함. 새 phase 추가 시 모든 save 블록에 추가하는 것 잊지 말 것.

### Cascade 의존 관계

```
phase1_5 (HasData) ─────────────┐
                                 ↓
                              phase2 (refilter for tiktok_shop)
                                 ↓
                              phase3
                                 ↓
                              phase35
                                 ↓
                              phase37 (HasData) ──→ phase4b_sample
                                                       ↓
                                                    phase4b_asr
                                                       ↓
                                                    phase4b_vision
                                                       ↓
                                                    phase4b_clusters
                                                       ↓
                                                    phase4b_sku
                                                       ↓
                                                    phase5
```

**`HasData` vs `New`**: `phaseNew = true`인데 `skipped_reason`이 있으면 `HasData = false`. cascade는 `HasData` 기준 (skip된 phase는 다운스트림 trigger 안 함).

### Vercel 함수 타임아웃 대응 — Batch + Async 패턴

Vercel Pro의 함수 타임아웃은 기본 300s, **Fluid Compute 활성화 시 800s**. 그보다 긴 외부 API 호출은 다음 패턴으로 쪼개야 함.

#### B 패턴 (batch) — Phase 3.5, 3.7, 4b.2

큰 작업(N개 처리)을 작은 batch로 쪼개서 각 batch를 별도 step.run으로:

```ts
// orchestrator
const setup = await step.run("phase-X-setup", () => fetchSetup(...));
const BATCH_SIZE = 100;
const batches = chunk(setup.candidates, BATCH_SIZE);
const batchResults: BatchResult[] = [];
for (let i = 0; i < batches.length; i++) {
  const r = await step.run(`phase-X-batch-${i}`, () =>
    processBatch(batches[i])
  );
  batchResults.push(r);
}
const result = await step.run("phase-X-finalize", () =>
  aggregateResults(setup, batchResults)
);
```

aggregator 파일은 `fetchSetup`, `processBatch`, `aggregate`, `legacy single-call entrypoint` 4개를 export.

#### A 패턴 (async) — Phase 1.5

외부 actor 자체가 길게 도는 경우 (pro100chok actor가 ~20분) 동기 호출은 불가능. Apify의 async API로 변경:

```ts
// 1. 시작
const { runId, datasetId } = await step.run("kickoff", () =>
  apify.runs.create(...)
);
// 2. 폴링 (step.sleep는 Vercel 함수 종료시키고 깨어날 때 새 invocation)
let status = "RUNNING";
for (let attempt = 1; attempt <= 60; attempt++) {
  await step.sleep(`wait-${attempt}`, "30s");
  const s = await step.run(`poll-${attempt}`, () =>
    apify.runs.get(runId)
  );
  if (s.status === "SUCCEEDED" || s.status === "FAILED") {
    status = s.status; break;
  }
}
// 3. dataset fetch
const items = await step.run("fetch", () =>
  apify.dataset.items(datasetId)
);
// 4. 처리
const result = await step.run("process", () =>
  processItems(items)
);
```

---

## 각 Phase 상세

### Phase 1.5 — TikTok Shop 자동 수집

**파일**: [phase1-5-shop.ts](./src/lib/inngest/aggregators/phase1-5-shop.ts) + [tiktok-shop-scraper.ts](./src/lib/apify/tiktok-shop-scraper.ts)

**입력**: `cases.tiktok_shop_store_url` (예: `https://www.tiktok.com/shop/store/nooni/7495586169586223348`)

**처리**:
1. `kickoffTikTokShopScrape` — pro100chok actor에 POST `/v2/acts/.../runs`로 비동기 시작
   - input 형식 (사용자 검증됨):
     ```json
     {"scrapeType": "store", "storeUrls": [...], "region": "us",
      "proxyConfiguration": {"useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"]},
      "maxItems": 1000, ...}
     ```
2. `pollActorRun` — 30초마다 status 체크 (max 60번 = 30분 cap)
3. `fetchActorDataset` — 완료되면 dataset items 조회
4. `processPhase15Products`:
   - `mapShopRawItems` — type="store"는 metadata, type="store_product"가 실제 제품
   - 기존 `products` + `case_product_sales` 삭제 (재실행 시 stale 방지)
   - 새 products insert
   - `case_product_sales` insert (`period_start: null` = 누적 매출 표시)

**응답 매핑** (다양한 actor 응답 형식 대응):
- 제품명: `title` ?? `name` ?? `productName`
- 가격: `currentPrice` (문자열 "15") ?? `price` ?? `sale_price`
- 판매량: `salesVolume` ?? `soldCount` ?? `total_sold`
- URL: `productUrl` ?? `product_url` ?? `url`
- 이미지: `imageUrls[0]` (배열) ?? `image_url` 단일

### Phase 2 — SQL 집계

**파일**: [phase2.ts](./src/lib/inngest/aggregators/phase2.ts)

**입력**: `contents` (brand+country 스코프), `products`, `case_product_sales`, `sales_snapshot` (BSR), `influencers`

**처리**:
1. 모든 contents 페이지네이션으로 fetch
2. **tiktok_shop인 경우** `is_tiktok_shop_creator=true` 인플의 contents만 필터 (`shopCreatorOnly` 옵션)
3. 월별 영상 수 (paid/organic 구분 — `is_ad` 컬럼)
4. 1인당 영상 분포 (1, 2-4, 5-9, 10-19, 20-49, 50+ 버킷)
5. Top 작성자 (20+ 영상 작성자, max 50명, follower count enrichment)
6. SKU 매출 + BSR (Amazon: 30일 매출 + 일별 BSR / TikTok Shop: 누적 매출, BSR 없음)

**필터링 동작**: 동일 함수가 일반 호출/필터 호출 둘 다 지원 (`opts.shopCreatorOnly`).

### Phase 3 — 인플 fans 룩업

**파일**: [phase3.ts](./src/lib/inngest/aggregators/phase3.ts) + [influencer-db/lookup.ts](./src/lib/influencer-db/lookup.ts)

**처리**:
1. brand+country 스코프 모든 contents에서 unique influencer_id 추출
2. `influencers` 테이블에서 fans 정보 없는 핸들만 추출
3. 외부 인플 DB (`dynqedcbmanvyfdlruni`)에 핸들 단위 룩업 → fans + is_tiktok_shop_creator 회수
4. `influencers` 업데이트 (`fans_source: "influencer_db_tt"`)
5. 티어 분포 + Phase 2의 top_creators에 follower_count 보강

**티어 분류** ([classifyTier](./src/lib/inngest/aggregators/phase3.ts)):
```
Mega   ≥ 1M
Macro  ≥ 500K
Mid    ≥ 100K
Micro  ≥ 10K
Nano   ≥ 1K
Sub-nano  0~999
Unknown   외부 DB 매칭 실패 (fans 미상)
```

DB enum은 mega/macro/mid/micro/nano만 있어서 sub-nano와 unknown은 `tier=NULL`로 저장.

### Phase 3.5 — clockworks 폴백

**파일**: [phase3-5-fans.ts](./src/lib/inngest/aggregators/phase3-5-fans.ts)

Phase 3에서 외부 DB로 못 채운 인플의 fans를 clockworks 호출로 보강.

**Batch 패턴**:
1. `fetchPhase35Setup` — unknown 인플 + 영상 1개 URL씩 매핑
2. `processPhase35Batch` (200 URL/batch) — clockworks 호출 → fans + tier 업데이트
3. `finalizePhase35` — Phase 3 stats 재계산 + top_creators 다시 enrich

### Phase 3.7 — Shop Creator 판별 (lemur)

**파일**: [phase3-7-shop-creator.ts](./src/lib/inngest/aggregators/phase3-7-shop-creator.ts) + [lemur-shop-creators.ts](./src/lib/apify/lemur-shop-creators.ts)

**TikTok Shop 채널 전용**. `is_tiktok_shop_creator IS NULL`인 인플만 후보. lemur actor는 **Shop creator만 결과 반환**하므로 응답 존재 = is_shop_creator=true (boolean 필드 없음).

**Batch 패턴** (100 handle/batch). lemur는 `username` 단수형 입력 — actor가 한 번에 한 핸들만 처리. 내부에서 `CONCURRENCY=8`로 병렬 호출.

### Phase 4a — Meta 광고

**파일**: [phase4a.ts](./src/lib/inngest/aggregators/phase4a.ts) + [meta-ads.ts](./src/lib/apify/meta-ads.ts)

**Amazon 채널 전용**. `brand_keyword` (콤마 구분 검색어) + `brand_meta_pages` (광고주 페이지 URL) → curious_coder/facebook-ads-library-scraper 호출.

**핵심 매핑 노하우**:
- `collation_id` 기준으로 광고 dedup (ad_archive_id가 같은 광고가 여러 page에 떠도 같은 collation_id면 1개)
- DCO/CAROUSEL 광고는 `snapshot.cards[]`에 실제 콘텐츠 (videos[]/images[]가 비어있음)
- 본문에 `{{product.brand}}` 같은 미렌더 placeholder 있으면 cleanBodyText로 제거
- landing 분류: instagram / amazon / tiktok_shop / facebook / other / none. "other"는 `unwrapFbRedirect`로 실제 도메인 추출 + 빈도 집계

### Phase 4a.5 — 광고 자산 Storage 저장

**파일**: orchestrator 안에서 inline 처리

FB CDN URL은 `oh=signature&oe=hex_unix_timestamp` 형태로 24-48h 만료. ads_preview의 영상/썸네일을 Supabase Storage `case-assets` bucket에 영구 저장 → 만료 회피.

### Phase 4b.1 — 분석 샘플 선정

**파일**: [phase4b-sample.ts](./src/lib/inngest/aggregators/phase4b-sample.ts)

**규칙**:
- 최근 90일 영상만 (`uploaded_at >= cutoffDate`)
- 티어별 조회수 top 50 (Mega + Macro + Mid + Micro + Nano + Sub-nano + Unknown)
- 추가: 뷰 10K+ 중 save_rate (collect_count/views) top 30 (위와 dedup)
- 결과 약 280-300영상 (SAMPLE_SIZE 추정 300)
- **TikTok Shop 케이스**: `is_tiktok_shop_creator=true` 인플의 contents만 후보로 줄임

`sample_content_ids`는 다음 phase (4b.2 ASR / 4b.3 Vision / 4b.4 Cluster)의 입력.

### Phase 4b.2 — ASR 수집

**파일**: [phase4b-asr.ts](./src/lib/inngest/aggregators/phase4b-asr.ts) + [clockworks-tiktok.ts](./src/lib/apify/clockworks-tiktok.ts)

샘플 영상 URL을 clockworks에 보내 ASR 자막 + cover 이미지 + author 메타 회수.

**Batch 패턴** (50 URL/batch).

**부수효과**: clockworks 응답의 `authorMeta.fans`로 인플 fans 채움 (Phase 3에서 못 받은 것).

**저장**:
- `case_video_analyses.asr_text`
- `case_video_analyses.cover_url`
- `case_video_analyses.video_download_url` (만료성 — Phase 4b.5에서 사용 가능)

### Phase 4b.3 — Vision 태깅

**파일**: [phase4b-vision.ts](./src/lib/inngest/aggregators/phase4b-vision.ts) + [vision-tagger.ts](./src/lib/anthropic/vision-tagger.ts)

샘플 각 영상의 cover 이미지 + 캡션 + ASR을 Sonnet에 보내 구조화된 태그 회수:

```ts
type VisionTags = {
  hook_tags: string[];        // shock_value, question, ...
  content_angle: string;      // tutorial, review, lifestyle, ...
  body_format: string;        // list, demonstration, narrative, ...
  overlay_text: string | null;
  cta_type: string | null;
  purchase_intent: "high" | "mid" | "low";
  visual_style: string;       // ugc, polished_branded, vlog, ...
  products_visible: string[];
};
```

System prompt는 ephemeral cache 사용 (반복 호출 시 90% 비용 절감).

저장 위치: `case_video_analyses.vision_tags` (jsonb).

**Concurrency**: 5 (`VISION_CONCURRENCY`).

### Phase 4b.4 — 3-pass 클러스터링

**파일**: [phase4b-clusters.ts](./src/lib/inngest/aggregators/phase4b-clusters.ts) + [clusterer.ts](./src/lib/anthropic/clusterer.ts)

3단계 LLM 클러스터링:
1. **Pass 1** — 80영상씩 batch로 Sonnet에 보내 후보 클러스터 4-10개 발견 (member ≥3)
2. **Pass 2** — Pass 1 후보들을 통합/병합 → 5-15개 validated cluster (`merged_from: [int]` 인덱스만 출력해 토큰 절약)
3. **Pass 3** — validated를 4-8개 메타 그룹으로 묶음

**디버깅 필드**: `pass1_debug`, `pass2_debug`에 raw cluster 수, parse 실패, drop 사유 등 저장 (UI ClusterEmptyFallback에서 표시).

DB 저장: `content_clusters` (메타 + 자식) + `content_cluster_members` (영상-클러스터 연결).

### Phase 4b.5 — SKU 매칭

**파일**: [phase4b-sku.ts](./src/lib/inngest/aggregators/phase4b-sku.ts) + [sku-matcher.ts](./src/lib/anthropic/sku-matcher.ts)

화면 노출 영상에 한해서만 SKU 매칭 (전체 300영상이 아님 → 비용 절감):
- 샘플 preview top 12
- 메타 클러스터별 top 3 representative

이 영상들의 caption + ASR + cover + vision_tags + 제품 카탈로그 → Sonnet에 매칭 요청. 제품 카탈로그는 ephemeral cache (한 케이스 안에서 재사용).

저장: `case_video_analyses.matched_sku_ids` (text[]).

### Phase 5 — 포지셔닝 분석

**파일**: [phase5-position.ts](./src/lib/inngest/aggregators/phase5-position.ts)

3개 모듈:
1. **티어×메타 히트맵** — `case_video_analyses.pass3_meta_id` × `influencers.tier` cross-tab. tier row 안에서 views% 정규화. Mega/Macro/Mid/Micro/Nano만 표시 (sub-nano/unknown 제외).
2. **언어 분포** — `contents.language` 빈도 (brand+country 스코프). 매핑된 한글 라벨 (영어, 한국어 등).
3. **USP 키워드** — 캡션 빈도 분석 (LLM 안 씀):
   - 1-3 word n-gram 추출
   - 영어 + 한국어 stopword 제외
   - 브랜드명 제외
   - count >= 5 + 길이 ≥2자
   - bigram이 frequent하면 그 안의 unigram dedup

---

## 데이터 모델

핵심 테이블 (자세한 스키마는 [bp_v2/db](../bp_v2/db)의 마이그레이션 SQL):

### cases
```
id (uuid, PK)
brand_id (uuid, FK)
country (text)
channel (text: 'amazon' | 'tiktok_shop')
status (text: 'draft' | 'running' | 'ready' | 'error')
brand_keyword (text)
brand_meta_pages (text[])
tiktok_shop_store_url (text)
options (jsonb) — { exolyt_reused: bool, ... }
key_stats (jsonb) — 모든 phase 결과 누적
created_at, updated_at, analyzed_at
```

### brands
```
id (uuid, PK)
name (text, UNIQUE)
```

### contents
```
id (uuid, PK)
brand_id, country, influencer_id, product_id (FKs)
url (text, UNIQUE) — exolyt 업로드 시 dedup 키
caption, hashtags, sentiment, language (text)
views, likes, comments, shares, collect_count (int)
engagement_rate (numeric)
duration_ms (int)
is_ad (bool) — paid 광고 영상 여부
uploaded_at (timestamptz)
captured_at (timestamptz)
```

### influencers
```
id (uuid, PK)
platform (text: 'tiktok')
external_id (text) — TikTok user_id 또는 임시 handle
handle (text)
follower_count (int)
fans_source (text: 'influencer_db_tt' | 'apify_clockworks' | 'manual')
tier (text enum: mega/macro/mid/micro/nano)
is_tiktok_shop_creator (bool | null)
shop_creator_class (text)
tiktok_shop_checked_at (timestamptz)
```

### products
```
id (uuid, PK)
case_id (uuid, FK) — case-scoped
brand_id (uuid, FK)
name (text)
asin (text) — Amazon
external_product_id (text) — TikTok Shop product id
product_url, image_url, category, price, channel, platform
```

### case_product_sales
```
case_id, product_id (FKs)
units_30d, revenue_30d (numeric)
period_start, period_end (date)  -- period_start NULL = 누적 (TikTok Shop)
source (text: 'csv' | 'tiktok_shop_scraper')
```

### sales_snapshot (BSR 시계열, Amazon 전용)
```
brand_id, product_id (FKs)
channel (text)
bsr (int)
new_price (numeric)
collected_at (timestamptz)
```

### case_video_analyses (Phase 4b 결과)
```
case_id, content_id (FKs, UNIQUE 합)
asr_text (text)
cover_url (text) — TikTok CDN URL (만료성)
video_download_url (text) — clockworks 응답에서 추출 (만료성)
vision_tags (jsonb)
matched_sku_ids (text[])
pass1_label, pass2_label (text) — 클러스터 1차/2차 결과
pass3_meta_id (uuid, FK content_clusters) — 메타 그룹
analyzed_at (timestamptz)
```

### content_clusters (Phase 4b.4 결과)
```
id (uuid, PK)
case_id (uuid, FK)
name (text), description, hook_pattern, body_pattern
is_meta (bool) — true면 메타, false면 자식
parent_cluster_id (uuid, self FK)
member_count (int)
display_order (int)
```

### content_cluster_members
```
cluster_id, content_id (FKs)
rank_in_cluster (int)
```

### case_video_assets (Phase 4a.5 / 4b.5 다운로드 자산)
```
case_id, content_id (FKs)
video_storage_path, cover_storage_path, thumb_storage_path (text)
downloaded_at (timestamptz)
```

---

## 외부 API 통합

### Apify — 4개 actor 사용

| Actor | 사용처 | 입력 형식 | 비용 |
|---|---|---|---|
| `clockworks/tiktok-scraper` | Phase 3.5, 4b.2 | `{postURLs: [...], shouldDownloadVideos: false}` | $0.0017/result |
| `lemur/tiktok-shop-creators` | Phase 3.7 | `{username: "handle"}` (단수!) | $0.005/check |
| `pro100chok/tiktok-shop-scraper` | Phase 1.5 | `{scrapeType: "store", storeUrls: [...], region: "us", proxyConfiguration: {...}}` | 정액 $20/월 |
| `curious_coder/facebook-ads-library-scraper` | Phase 4a | `{searchURLs/pageURLs/maxAds: 1000, ...}` | $0.00075/ad |

**호출 패턴**:
- 짧게 끝나는 것: `run-sync-get-dataset-items` 동기 API
- 긴 것 (pro100chok): async API (`/v2/acts/.../runs` POST → poll → fetch dataset)

각 actor wrapper에 `debug_first_item_keys` + `debug_first_item_sample`을 결과에 포함시켜 응답 형식 변화 시 SQL로 직접 진단 가능하게 함.

### Anthropic — Sonnet 4.6

- Model: `claude-sonnet-4-6`
- SDK: `@anthropic-ai/sdk` 0.91+
- Image input (cover 이미지 fetch + base64) for Phase 4b.3
- Prompt caching: system prompt + 큰 카탈로그를 `cache_control: ephemeral`로 마킹 → 반복 호출 시 90% 비용 절감
- 가격: $3/M input, $0.30/M cached read, $3.75/M cache write, $15/M output

### Supabase — 외부 인플 DB

`dynqedcbmanvyfdlruni.supabase.co` (read-only). [influencer_db_tt 테이블](./src/lib/influencer-db/lookup.ts)에 TikTok 인플 정보 (handle → fans, is_shop_creator) 저장돼있음. anon key로 select만.

---

## Storage 패턴

### `case-assets` 버킷 (public read, anon write 허용)

용도:
- **Phase 4a.5**: Meta 광고 영상/썸네일 영구 보관 (`{case_id}/meta-ads/{ad_id}/video.mp4`)
- **CSV 업로드**: 큰 exolyt CSV는 브라우저 → Storage 직접 업로드 (`{case_id}/uploads/exolyt-{timestamp}.csv`) → server action이 다운로드 → 파싱 → 임시 파일 삭제. **Vercel 4.5MB body 한도 우회용**.

### TikTok CDN 우회

TikTok cover/video URL은 Referer + UA 검사. 다운로드할 때 헤더 추가:
```ts
{
  Referer: "https://www.tiktok.com/",
  "User-Agent": "Mozilla/5.0 (Macintosh; ...) Chrome/120.0.0.0 Safari/537.36",
}
```

[asset-downloader.ts](./src/lib/storage/asset-downloader.ts)의 `downloadAndStore` 함수가 옵션 헤더 받아 처리.

---

## 배포 워크플로우

### 환경

| 환경 | URL | 트리거 |
|---|---|---|
| Production | `https://tikcle-bp.vercel.app` | `main` 브랜치 push |
| Preview | `https://tikcle-bp-git-<branch>-...vercel.app` | PR 또는 다른 브랜치 push |
| Local | `http://localhost:3000` | `npm run dev` |

### Vercel 설정 핵심

- **Plan**: Pro
- **Fluid Compute**: **활성화 필수** (Settings → Functions). 이거 켜야 [vercel.json](./vercel.json)의 `maxDuration: 800` 적용됨. 안 켜면 300s capped.
- **Deployment Protection**: 인증 안 쓰는 동안 비활성. 외부 통합 (Inngest 등) bypass token으로 통과.
- **환경변수**: Inngest 통합으로 `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` 자동 주입. 나머지 `.env.local`과 동일하게 설정.

### Inngest 설정

- **Vercel 통합 사용**: Inngest dashboard → Apps → Vercel integration. push 마다 자동 sync, branch별 환경 분리.
- **Production 환경 키**: 통합으로 자동 추가됨. 수동 설정 시 [vercel env vars](https://vercel.com/4itm-solutions-projects/tikcle-bp/settings/environment-variables) 참고.

### 일반적인 PR 흐름

```bash
git checkout -b my-feature
# 코드 수정
git add . && git commit -m "feat: ..."
git push origin my-feature

# GitHub에서 PR 생성
# Vercel이 자동으로 preview deployment URL 생성 → PR 코멘트에 표시
# 리뷰어가 preview URL로 동작 확인
# main 머지 → 자동 production deploy
```

⚠️ **DB 마이그레이션**: production DB와 dev DB는 **같은 instance**입니다 (Supabase project 1개). 마이그레이션은 모든 환경에 즉시 영향. 신중히.

---

## Common dev tasks

### 새 Phase 추가

1. `src/lib/inngest/types.ts`에 `PhaseNStats` 타입 + `KeyStats`에 슬롯 추가
2. `src/lib/inngest/client.ts`에 `PhaseKey` 유니온에 `"phaseN"` 추가
3. `src/lib/inngest/aggregators/phaseN.ts` 생성 — 다음 함수 export:
   - `runPhaseN(supabase, case_id, ...)` (legacy single call)
   - 길면 `fetchPhaseNSetup`, `processPhaseNBatch`, `finalizePhaseN` 분리
4. `run-analysis.ts`의 적절한 위치에 phase 추가:
   - 이전 phase 결과 받음
   - 캐시 hit 체크 + cascade 룰 (어떤 phase가 newData면 트리거)
   - step.run으로 wrap (긴 작업이면 batch 패턴)
   - save 블록에 `phaseN` 명시 추가 + **이후 모든 save 블록에도 추가**
5. `cost-estimate.ts`에 비용 항목 추가
6. `PhaseProgress.tsx`의 PHASES 배열에 row 추가 + `isDone` switch case 추가
7. `MiniDashboard.tsx`에 결과 렌더링 모듈 추가 (필요 시)
8. `page.tsx`의 `phaseN` prop 통과
9. `tsc --noEmit`로 타입 체크 → 커밋 → PR

### 외부 actor 응답 형식 변화 대응

각 wrapper의 `mapItem` 함수에서 다양한 필드명 fallback 처리. 새 형식 발견 시:

1. `key_stats->'phaseN'->'debug_first_item_keys'` SQL로 실제 응답 키 확인
2. `key_stats->'phaseN'->'debug_first_item_sample'` JSON 샘플 보고 매핑 추가
3. `mapItem`에 새 변형 추가:
   ```ts
   const name = (r.title ?? r.name ?? r.NEW_FIELD) as string | undefined;
   ```

### LLM 프롬프트 수정

`src/lib/anthropic/`의 각 파일 상단에 `SYSTEM_PROMPT` 정의. 수정 시:
- 기존 결과 형식 (JSON schema) 유지 — 안 그러면 매핑 실패
- 출력 토큰 cap (`max_tokens`) 충분히 — Pass 1은 5000으로 늘려둠 (이전 버그)
- ephemeral cache 마킹 유지 (`cache_control: { type: "ephemeral" }`) — 안 그러면 비용 폭증

수정 후 NOONI 같은 기존 케이스에서 force re-run으로 검증.

### Phase 진행 중 timeout 발생

[Inngest dashboard](https://app.inngest.com)에서 어느 step에서 timeout인지 확인 → 그 step.run의 작업이 800s 넘으면 batch로 쪼갬:

```ts
// before
const result = await step.run("phase-X", () => doEverything(...));

// after — orchestrator로 끌어올림
const setup = await step.run("phase-X-setup", () => fetchSetup(...));
const batches = chunk(setup.items, BATCH_SIZE);
const batchResults = [];
for (let i = 0; i < batches.length; i++) {
  batchResults.push(
    await step.run(`phase-X-batch-${i}`, () => processBatch(batches[i]))
  );
}
const result = await step.run("phase-X-finalize", () => aggregate(batchResults));
```

aggregator 파일도 setup/processBatch/finalize/legacy 4개로 export하는 형태로 리팩토링.

### 새 CSV 파서 추가

1. `src/lib/parsers/<name>.ts` 생성 — papaparse 사용, 결과를 통일된 형태로 반환:
   ```ts
   { rows, errors, totalLines, skippedXxx, detectedHeaders }
   ```
2. `upload-actions.ts`에 server action 추가:
   - 작은 파일 (< 4MB): FormData로 받음
   - 큰 파일: Storage 경유 패턴 (`uploadXxxFromStorage(case_id, storagePath)`)
3. 컴포넌트에서 호출 (UploadDropzone 재사용 가능)

---

## 백필 스크립트

### Shop Creator GMV 백필 (`backfill:gmv`)

`scripts/backfill-shop-creator-gmv.ts` — 옛 phase37(commit 0995b1b 이전)에서 박힌 Shop creator 중 `lifetime_gmv_usd IS NULL`인 인플의 GMV/GPM/post_rate/brand_collabs/range를 lemur로 backfill.

```bash
# .env.local에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN 박혀있어야
npm run backfill:gmv -- <case_id>           # 그 case scope의 인플만
npm run backfill:gmv                         # 전체 Shop creator
npm run backfill:gmv -- <case_id> --dry-run  # 비용 추정만
```

비용: 대상 인플 × $0.005. dry-run으로 먼저 비용 확인 권장.

대상 조건:
- `is_tiktok_shop_creator = true`
- `lifetime_gmv_usd IS NULL` (이미 채워진 인플 skip)

batch 50명씩 lemur 호출. update 시 `shop_creator_class`도 새로 박힘 (옛 character(1) 제약으로 fail했던 것까지 정정).

---

## DB 마이그레이션

`/Users/suna/Desktop/claude/bp_v2/db/`에 SQL 파일 위치 (현재 1~8). 새 마이그레이션 추가:

1. `00X_<name>.sql` 파일 생성 — `IF NOT EXISTS` 패턴 사용:
   ```sql
   ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar text;
   ```
2. 로컬 dev DB에서 테스트 ([Supabase Studio SQL Editor](https://supabase.com/dashboard/project/dxjodlxkynjirldpumxr/sql))
3. **타입 재생성** (Supabase CLI 필요):
   ```bash
   npx supabase login
   npm run db:types
   ```
   → `src/lib/supabase/types.gen.ts` 갱신. 또는 수동으로 `types.ts`에 새 컬럼 추가.
4. 마이그레이션 SQL 커밋 + 코드 변경 같이 PR

⚠️ **Production DB**가 dev와 같은 instance라 production 영향 즉시. 호환되지 않는 변경 (DROP COLUMN 등)은 신중히, 가능하면 deprecation 단계 거치기.

현재 마이그레이션:
- `001_refactor.sql` — 핵심 스키마 (brands 통합, 새 테이블)
- `002_sales_period_and_cache.sql` — 매출 period + 캐시 컬럼
- `003_channel_enum.sql` — channel enum 'amazon'/'tiktok_shop'
- `004_products_unique.sql` — 유니크 인덱스 → 제약
- `005_disable_rls_new_tables.sql` — RLS 비활성 (인증 미사용)
- `006_storage_bucket.sql` — case-assets 버킷
- `007_video_cover_url.sql` — case_video_analyses.cover_url
- `008_video_download_url.sql` — case_video_analyses.video_download_url

---

## 디버그 SQL

[Supabase Studio SQL Editor](https://supabase.com/dashboard/project/dxjodlxkynjirldpumxr/sql)에서 실행.

### 케이스 종합 상태

```sql
select 
  c.id, b.name as brand, c.country, c.channel, c.status,
  c.key_stats->'phase1_5'->'total_products' as products,
  c.key_stats->'phase2'->'total_contents' as contents,
  c.key_stats->'phase3'->'total_creators' as creators,
  c.key_stats->'phase37'->'total_shop_creators' as shop_creators,
  c.key_stats->'phase4b_clusters'->'pass3_meta' as meta_count,
  c.key_stats->'phase4b_sku'->'total_matched' as sku_matched,
  c.analyzed_at
from cases c
join brands b on b.id = c.brand_id
order by c.updated_at desc limit 20;
```

### 특정 케이스 phase별 skipped_reason

```sql
select 
  jsonb_object_keys(key_stats) as phase,
  key_stats->jsonb_object_keys(key_stats)->'skipped_reason' as skip
from cases where id = '<case_id>';
```

### Phase 4b 클러스터 디버그

```sql
select
  key_stats->'phase4b_clusters'->'skipped_reason' as skip,
  key_stats->'phase4b_clusters'->'pass1_debug' as p1_debug,
  key_stats->'phase4b_clusters'->'pass2_debug' as p2_debug
from cases where id = '<case_id>';
```

### 외부 actor 응답 형식 진단

```sql
select 
  key_stats->'phase37'->'debug_first_item_keys' as lemur_keys,
  key_stats->'phase37'->'debug_first_item_sample' as lemur_sample,
  key_stats->'phase1_5'->'debug_first_item_keys' as p15_keys,
  key_stats->'phase1_5'->'debug_first_item_sample' as p15_sample
from cases where id = '<case_id>';
```

### case의 인플 분포

```sql
select 
  count(*) filter (where is_tiktok_shop_creator = true) as shop,
  count(*) filter (where is_tiktok_shop_creator = false) as non_shop,
  count(*) filter (where is_tiktok_shop_creator is null) as unknown,
  count(*) filter (where follower_count is null) as no_fans,
  count(*) as total
from influencers
where id in (
  select distinct influencer_id from contents
  where brand_id = (select brand_id from cases where id = '<case_id>')
    and country = (select country from cases where id = '<case_id>')
    and influencer_id is not null
);
```

### 케이스 강제 reset (phase 다 다시 돌리기)

```sql
-- 특정 phase만 지움
update cases set key_stats = key_stats - 'phase4b_clusters'
where id = '<case_id>';

-- 모든 인플 shop creator 마킹 reset (Phase 3.7 재실행 위해)
update influencers
set is_tiktok_shop_creator = null, tiktok_shop_checked_at = null
where id in (
  select distinct influencer_id from contents
  where brand_id = (select brand_id from cases where id = '<case_id>')
    and country = (select country from cases where id = '<case_id>')
);
```

---

## 트러블슈팅

### `FUNCTION_INVOCATION_TIMEOUT` (Vercel)

**원인**: 한 step.run이 함수 한도 (Fluid Compute on: 800s, off: 300s) 초과.

**진단**: Inngest dashboard에서 실패한 run의 어느 step에서 timeout인지 확인.

**해결**:
1. Vercel project Settings → Functions → Fluid Compute **활성화** 확인
2. 그래도 800s 넘으면 그 phase를 batch 또는 async 패턴으로 리팩토링 ([Common dev tasks](#common-dev-tasks) 참고)

### `FUNCTION_PAYLOAD_TOO_LARGE` (Vercel)

**원인**: Server Action body > 4.5MB. CSV 업로드 시 흔함.

**해결**: Supabase Storage 직접 업로드 패턴 사용. 예: [ExolytSection](./src/components/case-detail/ExolytSection.tsx) 참고.

### Inngest sync 안 됨 (Apps에 안 뜸)

1. Vercel Deployment Protection 설정 확인 → Inngest integration 페이지에서 Bypass token 입력했는지
2. 수동 sync 시도: Inngest dashboard → Apps → Sync new app → URL: `https://tikcle-bp.vercel.app/api/inngest`

### LLM 응답 파싱 실패 (cluster 결과 0개 등)

1. SQL로 `pass1_debug` / `pass2_debug` 확인
2. `parse_failures > 0`이면 → max_tokens 부족. clusterer.ts에서 해당 pass의 max_tokens 늘리기
3. `dropped_id_mismatch` 큼 → LLM이 다른 ID 형식 반환. clusterer.ts의 `resolveLlmId`에 새 형식 추가

### Apify actor 0개 결과

1. Apify console ([console.apify.com/runs](https://console.apify.com/runs))에서 우리 호출 run 확인
2. SQL로 `debug_request_body` 확인 — 우리가 실제로 보낸 input 형식
3. 직접 Apify console에서 같은 input으로 manual run → 결과 비교
4. 차이 있으면 actor wrapper의 input 형식 수정

### 새 케이스 만들 때 "이미 동일 케이스 존재" 에러

DB unique constraint: `(brand_id, country, channel)` 조합. 같은 조건의 케이스 있으면 새로 못 만듦. 기존 케이스 삭제하거나 다른 country/channel로.

---

## 도움 요청

- **GitHub Issues**: [github.com/4ITM-solution/TikCle-BP/issues](https://github.com/4ITM-solution/TikCle-BP/issues)
- **Apify 문제**: [Apify Discord](https://discord.com/invite/jyEM2PRvMU)
- **Inngest 문제**: [Inngest Discord](https://www.inngest.com/discord)
