# TikCle BP — Brand Performance Tool

TikTok / IG / YouTube / Amazon / TikTok Shop / Shopee + Meta 광고를 통합 분석하는 내부 툴입니다. **A 모델 (한 case = 한 country × 한 brand × 다채널)** — 한 케이스 안에 여러 채널 데이터 자유 적재. 콘텐츠 활동 / 인플루언서 풀 / 매출 & BSR / Meta 광고 / 콘텐츠 포맷 클러스터링 / 변곡점 / cross-platform 인플 매칭까지 한 번의 분석으로 산출합니다.

- **Production**: [https://tikcle-bp.vercel.app](https://tikcle-bp.vercel.app)
- **GitHub**: [https://github.com/4ITM-solution/TikCle-BP](https://github.com/4ITM-solution/TikCle-BP)
- **Inngest dashboard** (실행 모니터링): [https://app.inngest.com](https://app.inngest.com) — production 환경 선택
- **Supabase** (DB): project `dxjodlxkynjirldpumxr`

개발자라면 → [DEVELOPING.md](./DEVELOPING.md) 참고.

---

## 무엇을 분석하나

**A 모델**: 한 케이스 = 한 브랜드 × 한 country × **다채널** (예: SKIN1004 · TH 안에 TikTok 영상 + TT Shop + Meta 광고 + IG + YT 모두 적재 가능). 신규 케이스 폼에서 platform 선택 안 받음 — case 만든 후 데이터 채널 카드 클릭으로 채널별 적재.

분석 결과로 다음을 받습니다:

| 섹션 | 내용 |
|---|---|
| **A. 콘텐츠 활동** | 12개월 stack 차트 (티어 분포) + 영상수/광고비중/BSR overlay + 변곡점 timeline 카드 (Amazon BSR inflection) |
| **B. 인플루언서 풀** | 채널별 (TK/IG/YT) tier 분포 + Top 작성자 정렬 3축 (영상수/조회수/매출) + cross-channel matrix + Shop creator GMV |
| **C. 콘텐츠 포맷** | 통합 클러스터 (TK+IG+YT) + USP 키워드 + 시즈널리티 heatmap + 티어 × 앵글 히트맵 + paid/seeded/organic 분류 |
| **D. 매출 & BSR** | 채널 toggle (TT Shop/Amazon/Shopee) + SKU 헬스 + Hero × Mega viral (iframe embed) + Kalodata Self/Affiliate/Mall % 분해 + BsrTrendChart 시계열 + 6 sub-tab |
| **E. Meta 광고** | 3분류 (본사/유통 retailer/인플) + landing 분포 + partnership 인플 cross-channel + promo code regex 추출 |
| **G. 종합 인사이트** | 5축 매핑 (제품/인플/콘텐츠/채널/시즈널리티) + 핵심 발견 + TK+IG+YT 통합 인플 list + related-cases |

---

## 사용 워크플로우

### 1. 케이스 생성

`/cases/new` 페이지 → 입력 (**A 모델 — brand + country 만**):

| 필드 | 설명 |
|---|---|
| 브랜드명 | 자동으로 브랜드 entity 생성/매칭 |
| Country | 국가 코드 (US, KR, TH, ID 등) — SEA 국가 / 권역 코드 (MENA, LATAM_ES) 도 |
| 브랜드 키워드 | 콤마 구분 (Meta 광고 자동 수집용) |
| Meta 페이지 URL | 광고주 FB 페이지 |
| TikTok Shop 스토어 URL | `https://www.tiktok.com/shop/store/<name>/<id>` (US 한정) |

같은 brand+country 케이스 여러 개 가능 (옛 채널별 case 호환). **옛 분리된 case 2개 (TT Shop + Amazon 등) 합치려면** case detail → footer DEV → "🔀 같은 brand+country 옛 case 흡수" dropdown 사용.

### 2. 데이터 업로드 — case detail 의 **📥 데이터 채널** 카드 클릭 → expand panel 안 업로드

A 모델: **신규 case 폼에서 데이터 업로드 안 받음** (brand + country 만). case 만든 후 case detail 페이지 → 데이터 채널 grid 의 각 카드 클릭 → 인라인 expand panel 안 업로드 박스 + footer 가이드 (영향 phase + 비용 분리 버튼).

| 채널 카드 | 업로드 방법 |
|---|---|
| **📹 TikTok 영상** | Exolyt 1년 콘텐츠 CSV + 주간 viral CSV (옵션) — 같은 brand+country 다른 case 에 있으면 재사용 |
| **🛒 TT Shop** | US: 스토어 URL 입력 (Phase 1.5 pro100chok 자동) / SEA: Kalodata 텍스트 paste + LIST_VIDEO/LIST_CREATOR xlsx + Category Ranking TSV |
| **📦 Amazon** | Helium10 매출 CSV (30일) + BSR CSV (ASIN 별) |
| **🛍 Shopee** | Shopdora 텍스트 paste |
| **📢 Meta 광고** | 별도 업로드 X — brand_keyword / brand_meta_pages 박혀있으면 Phase 4a 자동 수집 (Apify curious_coder $0.75 cap) |
| **📷 Instagram** | brand IG 계정 1개만 박으면 자동 발굴 (ig_config) + Phase 4c 영상 수집 + **Phase 4c.5 — IG profile scraper** 박으면 follower / bio / cross-channel handle 자동 추출 (~$0.005/author) |
| **▶ YouTube** | brand YT 채널 1개 박으면 자동 발굴 + Phase 4d (~$4 cap) |

**적재 후 가이드**: 각 expand panel footer 안 노란 box "💡 적재 후 다음 단계" — 영향 phase 자동 매핑 + **🟢 무료 phase 만 재실행 ($0)** / **🔴 모든 phase 재실행 (유료)** 2 버튼 분리. 비용 confirm dialog 후 진행.

### 3. 분석 시작 (Section 03)

- 모든 필수 데이터 준비되면 **분석 시작** 버튼 활성화
- 클릭 → 비용 estimate confirm dialog (예: 최대 ~$15)
- 확인 → Inngest로 이벤트 발송 → 백그라운드 분석 시작
- 케이스 status: `draft` → `running` → `ready`

### 4. 진행 모니터링

`/cases/{id}` 페이지의 **Phase 진행 패널** (status가 `ready`일 때 표시):
- 각 Phase별 ✓ 완료 / ○ 미완 표시
- 개별 Phase **재실행** 버튼 (캐시 무시 강제 재실행)
- "누락분만 채우기" 버튼 (실패한 phase만 재시도)

또는 [Inngest dashboard](https://app.inngest.com) → Production 환경 → Runs 탭에서 step별 실시간 진행.

### 5. 결과 확인

분석 완료 (`status=ready`) 시 자동으로 대시보드 표시:
- KPI strip (4개 핵심 지표)
- A~E 섹션 차례대로
- 메타 클러스터 카드 클릭 → 대표 영상 펼쳐서 SKU 매칭 확인

---

## 분석 파이프라인

| Phase | 역할 | 외부 API | 비용 (per case) | 채널 |
|---|---|---|---|---|
| **1.5** | TikTok Shop 제품/매출 자동 수집 | Apify pro100chok | 정액제 ($20/월 구독) | tiktok_shop |
| **2** | SQL 집계 (월별 영상, 매출, 티어 분포 등) | — | 무료 | 공통 |
| **3** | 외부 인플 DB로 fans 룩업 + 티어 분류 | Supabase 외부 DB | 무료 | 공통 |
| **3.5** | Phase 3에서 못 찾은 unknown 인플 fans 폴백 | Apify clockworks | ~$1-6 | 공통 (옵션) |
| **3.7** | Shop creator 판별 (lemur) | Apify lemur | ~$2-15 | tiktok_shop |
| **4a** | Meta 광고 라이브러리 수집 | Apify curious_coder/facebook-ads | ~$0.75 | amazon |
| **4a.5** | 광고 자산 (영상/썸네일) Storage 보관 | Supabase Storage | 무료 | amazon |
| **4b.1** | 분석 샘플 영상 300개 선정 (티어 top + 저장률 top) | — | 무료 | 공통 |
| **4b.2** | 샘플 영상 ASR 텍스트 + cover 이미지 수집 | Apify clockworks | ~$0.51 | 공통 |
| **4b.3** | Vision 태깅 (hook · angle · format 등) | Anthropic Sonnet (image+text) | ~$3.50 | 공통 |
| **4b.4** | 3-pass LLM 클러스터링 → 메타 포맷 4-8개 | Anthropic Sonnet | ~$0.60 | 공통 |
| **4b.5** | 화면 노출 영상 SKU 매칭 | Anthropic Sonnet | ~$0.40 | 공통 |
| **5** | 티어×포맷 히트맵 + 언어 분포 + USP 키워드 (캡션 빈도) | — | 무료 | 공통 |

**총 예상 비용**:
- Amazon 케이스: ~$5-12 (Phase 4b 위주, 4b.4까지면 ~$5)
- TikTok Shop 케이스: ~$3-25 (3.7 lemur 호출 수에 따라)

---

## 자주 묻는 질문

### Q. 분석이 시간이 오래 걸려요
phase별 길이는 다음 정도:
- Phase 1.5 (pro100chok): 5-20분 (가장 오래 걸림, actor가 TikTok Shop 페이지를 크롤링하는 시간)
- Phase 3.5 (clockworks fans 폴백): 인플 수에 비례, 1000명당 ~5분
- Phase 3.7 (lemur shop creator): 후보 1000명당 ~5분
- Phase 4b.2 (ASR): 샘플 300영상 ~5-10분
- Phase 4b.3 (Vision): 샘플 300영상 ~5-10분
- 나머지는 1분 이내

전체 ~20-60분. Inngest dashboard에서 실시간으로 어느 step에서 시간이 걸리는지 확인 가능.

### Q. 분석이 실패했어요
[Inngest dashboard](https://app.inngest.com) → Production → Runs → 빨간색 run 클릭 → 어느 step에서 실패했는지, 에러 메시지 확인. 보통:
- Apify token 만료 / 잔고 부족
- Anthropic API rate limit
- 외부 API 응답 형식 변화 (드물게)

특정 phase만 다시 돌리고 싶으면 케이스 페이지의 **재실행** 버튼.

### Q. 비용이 갑자기 많이 나와요
큰 케이스 (인플 5,000명+)에서 Phase 3.5/3.7 비용 급증 가능. 분석 시작 전 confirm dialog의 max cost 추정치 확인하세요.

지출 추적: [Apify console](https://console.apify.com) + [Anthropic console](https://console.anthropic.com)에서 사용량 모니터링.

### Q. 이미 만든 케이스를 수정/삭제하고 싶어요
- 케이스 상세 페이지 우상단 **삭제** 버튼 → 케이스 + 관련 데이터 모두 cascade 삭제
- 수정은 별도 UI 없음 — 삭제 후 재생성

### Q. 데이터가 잘못 나온 것 같아요
- DB 직접 조회 → [Supabase Studio](https://supabase.com/dashboard/project/dxjodlxkynjirldpumxr) → SQL Editor
- 자주 쓰는 쿼리 예시는 [DEVELOPING.md - 디버그 SQL](./DEVELOPING.md#디버그-sql) 참고

---

## 팀원 추가하기

새 팀원이 이 툴을 **사용**하려면:
1. Production URL ([tikcle-bp.vercel.app](https://tikcle-bp.vercel.app)) 접속만 하면 OK (현재 인증 없음)

새 팀원이 **개발/수정**하려면:
1. GitHub `4ITM-solution` org 멤버로 추가 → [TikCle-BP repo](https://github.com/4ITM-solution/TikCle-BP) 접근
2. Vercel team `4itm-solutions-projects` 추가 (배포 모니터링용)
3. Supabase project 멤버 추가 (DB 접근)
4. [DEVELOPING.md](./DEVELOPING.md) 따라 로컬 셋업
