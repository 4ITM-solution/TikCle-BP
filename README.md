# TikCle BP — Brand Performance Tool

TikTok 기반 브랜드 콘텐츠 성과를 자동으로 분석하는 내부 툴입니다. Amazon · TikTok Shop 두 채널을 지원하고, 콘텐츠 활동 / 인플루언서 / 매출 / 광고 / 콘텐츠 포맷 클러스터링 / USP 키워드까지 한 번의 분석으로 산출합니다.

- **Production**: [https://tikcle-bp.vercel.app](https://tikcle-bp.vercel.app)
- **GitHub**: [https://github.com/4ITM-solution/TikCle-BP](https://github.com/4ITM-solution/TikCle-BP)
- **Inngest dashboard** (실행 모니터링): [https://app.inngest.com](https://app.inngest.com) — production 환경 선택
- **Supabase** (DB): project `dxjodlxkynjirldpumxr`

개발자라면 → [DEVELOPING.md](./DEVELOPING.md) 참고.

---

## 무엇을 분석하나

한 케이스 = 한 브랜드의 한 country × 한 채널 (예: NOONI · US · Amazon).

분석 결과로 다음을 받습니다:

| 섹션 | 내용 |
|---|---|
| **A. 콘텐츠 활동** | 월별 영상 수 (paid / organic 분리) |
| **B. 인플루언서 활동** | 팔로워 기준 티어 분포 (Mega/Macro/Mid/Micro/Nano), top 작성자 |
| **C. 콘텐츠 포맷 분석** | 4-8개 메타 클러스터 (LLM 자동 발견), 티어×포맷 히트맵, USP 키워드, 언어 분포 |
| **D. 매출 & 랭킹** | SKU별 30일/누적 매출, BSR 추이 (Amazon만) |
| **E. Meta 광고** | 광고 수, 랜딩 분포, 대표 광고 미리보기 (Amazon만) |

---

## 사용 워크플로우

### 1. 케이스 생성

`/cases/new` 페이지 → 입력:

| 필드 | 설명 | 채널별 |
|---|---|---|
| 브랜드명 | 자동으로 브랜드 entity 생성/매칭 | 공통 |
| Country | 국가 코드 (US, KR 등) | 공통 |
| 플랫폼 | `amazon` 또는 `tiktok_shop` | 공통 |
| 브랜드 키워드 | 콤마 구분 (Meta 광고 검색용) | Amazon 옵션 |
| Meta 페이지 URL | 광고주 FB 페이지 (Meta 광고 검색용) | Amazon 옵션 |
| TikTok Shop 스토어 URL | `https://www.tiktok.com/shop/store/<name>/<id>` 형식 | tiktok_shop 필수 |

브랜드 + country + channel 조합이 같은 케이스가 이미 있으면 새로 못 만듭니다 (DB unique 제약). 같은 브랜드 다른 country는 OK.

### 2. 데이터 업로드 (Section 02)

#### exolyt CSV (필수, 모든 채널)
- 1년치 콘텐츠 데이터
- CSV 형식, 첫 컬럼이 `username`, `url` 필수
- 같은 brand + country의 다른 케이스에 데이터 있으면 **재사용 버튼**으로 즉시 가져올 수 있음
- 큰 CSV (15K 행, 5MB+)도 OK — 브라우저에서 Supabase Storage로 직접 업로드됨

#### Amazon 매출 CSV (Amazon만 필수)
- SellerSprite 또는 같은 형식의 30일 매출 데이터
- 첫 컬럼이 ASIN (또는 product URL에서 추출)
- units / revenue / period_end 컬럼 필요

#### Amazon BSR CSV (Amazon만 필수)
- 일별 BSR 시계열
- 파일명에 ASIN 포함 (예: `B0XXXXXX-bsr.csv`)
- 한 SKU당 하나씩 여러 파일 업로드 가능

#### TikTok Shop (자동 수집)
- 별도 업로드 불필요. 분석 시작 시 Phase 1.5에서 pro100chok actor가 스토어 URL → 제품/가격/누적 판매량 자동 수집.

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
