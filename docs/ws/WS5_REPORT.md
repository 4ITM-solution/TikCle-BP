# WS5 REPORT (진행분)

> 세션: BE 상주. 브랜치 `ws-5-pipeline`. push·배포·apply·프로덕션 write 금지 준수(SELECT dry-run만 실행).

---

## BE-2 — interpret-cluster "validated 0" legacy 잔재 처리 ✅ (사용자 컨펌 대기)

근거: WS5 지시서 §2 · TODO BE-2 · spec/06 R8·R12 · U2(결론 못 만드는 블록은 "데이터 없음").

### 버그 원인
`interpret-cluster.ts`는 Pass 2 `validated.length === 0`(및 입력·후보·메타 0)일 때 조기
`finish(emptyClusterStats())`로 종료한다. 클러스터 저장은 `saveClusterResults`의 **run_tag
swap**(신규 insert 성공 후 `deleteClustersExcept`로 구버전 삭제) 안에서만 일어나므로,
조기 종료 경로에선 swap이 발생하지 않아 **run_tag=null 옛 클러스터가 그대로 잔존**한다.
→ DB엔 옛 미스정렬 클러스터, 화면 C 섹션은 옛것을 계속 노출(또는 member 0 토글).

### 수정
- 신규 `finishEmpty(stats)` 경로: **force 재실행 && 새 클러스터 0**일 때만
  `clearCaseClusters(case_id)`로 members→clusters 삭제 + pass 라벨 리셋 → "데이터 없음"으로
  정직하게 비움. 삭제한 cluster id 목록을 `stats.legacy_cleared`(감사 로그, R12 명시 목록)에 기록.
- **자연(비-force) 실행은 기존 결과 보존** — 삭제하지 않음(호출부에서 force 게이트).
- **ANTHROPIC_API_KEY 미설정** 조기 종료는 clear 대상 제외 — 환경 실패는 "진짜 클러스터
  없음"이 아니라 기존 데이터를 지우면 안 됨.
- 적용 범위: 입력 0 / 후보 0 / validated 0 / meta 0 — 4개 빈 경로 모두 `finishEmpty` 경유
  (실측은 validated 0이지만 동일 잔재 버그가 전 빈 경로에 존재).

변경 파일:
- `src/lib/inngest/functions/phases/interpret-cluster.ts` — `finishEmpty` + 4개 빈 경로 라우팅.
- `src/lib/inngest/aggregators/phase4b-clusters.ts` — `clearCaseClusters`(삭제) · `previewCaseClusters`(SELECT-only dry-run) export.
- `src/lib/inngest/types.ts` — `Phase4bClusterStats.legacy_cleared?`.
- `scripts/dry-run-legacy-clusters.ts` + `npm run dryrun:clusters` — R12 dry-run 리포터.

tsc: ✅ 통과.

### dry-run — 삭제 영향 4케이스 (SELECT only, `npm run dryrun:clusters`, 2026-07-07)

프로젝트 dxjodlxkynjirldpumxr. **삭제 대상 = case의 content_clusters + content_cluster_members
전량**(전부 run_tag=null 레거시). "멤버 N개"는 실제 content_cluster_members row 수.

| case_id | status | 클러스터 | 멤버(실 row) | 비고 |
|---|---|---|---|---|
| 542e7625-11ba-4f6c-ba5e-e523b9b5cc8d | ready | 29 | 954 | ⚠️ member 실존 대량 — 삭제 신중 |
| ec60ffba-b715-432a-aded-8f90559fb841 | draft | 21 | 104 | META 6개 member_count=0(껍데기) |
| a6000e91-85e2-4046-b21c-197ea7c92880 | completed | 16 | 50 | META 5개 껍데기 |
| f724e382-9a65-4558-8a32-41439aa821a4 | completed | 6 | **0** | META row.member_count 159/343/… 인데 실 member row 0 (C 토글 0 확정 상태) |
| **합계** | | **72** | **1108** | |

관찰: 4케이스 전부 run_tag=null. 정상 swap을 못 거친 잔재가 맞음. f724e382는 META만 남고
member row가 0 → 화면이 "클러스터는 보이는데 내용 없음"으로 깨져 있던 케이스.

### ⚠️ 반영 전 확인 필요 (ORCH·사용자)
1. **트리거 조건**: 이 삭제는 `force=true` 재실행에서 **새 클러스터가 0개일 때만** 발생.
   force 재실행이 정상적으로 validated>0을 내면 기존 `deleteClustersExcept`가 처리(변화 없음).
2. **542e7625(ready, 954 member) 리스크**: force 재실행이 LLM 플레이크로 일시 validated 0을
   내면 실멤버 954개가 지워짐. 완화: 함수 `retries:3`. 그래도 ORCH가 이 케이스는 재실행 전
   입력(vision_tags/caption) 실존 여부를 먼저 확인 후 진행 권장.
3. 삭제는 파생 데이터(클러스터)만 — 원천 케이스 데이터(contents/analyses) 불변. R12의 원천
   삭제 대상 아님. 그래도 명시 ID 목록은 위 dry-run에 전량 기록됨.

### 후속 (ORCH 게이트)
- 검증→머지→(원하면) 대상 케이스 `force` 재발행으로 실청소 → dry-run과 사후 대조.
- 설계문서 §6 진행 로그 1줄 기록은 ORCH 머지 시.

**재작업(반려 대응, 2e7f0de)**: 실검증(542e7625)에서 `case_video_analyses_pass3_meta_id_fkey`
위반. `clearCaseClusters`가 content_clusters를 지우기 전에 `resetPassLabels`로
pass3_meta_id(FK 참조)를 먼저 null 처리하도록 순서 재배치. tsc 통과.

---

## BE-5 — interpret-cluster step 출력 상한 초과 fix ✅

근거: 케이스 3be66bbd `interpret-cluster` phase_runs error "step output size is greater than
the limit"(Inngest step output 캡 >4MB) 실측.

### 진단 (ORCH 추정과 다름 — pass1 아님)
SELECT 실측:
- `fetch-inputs` 반환(videos 163개, 전부 TikTok, vision_tags 포함) = **84KB** → 상한과 무관.
- 단일 pass1 스텝(163<400) → 후보 페이로드도 소형.
- **진짜 원인**: `read-key-stats` 스텝이 `readKeyStats`(= key_stats 전체)를 반환. 3be66bbd의
  key_stats는 **6.96MB**:

  | 키 | 크기 |
  |---|---|
  | kalodata_creators_xlsx | 3.97 MB |
  | kalodata_videos_xlsx | 2.65 MB |
  | tt_shop_us_affiliates | 169 KB |
  | phase4b_sample | 48 KB |
  | phase4b_sku | 40 KB |
  | (나머지) | ~0.1 MB |

  → 스텝 출력 6.96MB > 4MB 상한에서 opcode validation 실패.

### 수정
- interpret-cluster의 `read-key-stats` 스텝을 **필요 필드(phase4b_clusters)만 반환**하도록 슬림화
  (6.96MB → ~4KB). 반환 페이로드 크기를 `logger.info`로 기록(완료 기준).
- **동일 패턴 7개 phase 확장**(같은 결함): 각자 캐시 판정에 쓰는 단일 필드만 반환.
  | phase | 반환 필드 |
  |---|---|
  | interpret-asr | phase4b_asr |
  | interpret-sku | phase4b_sku |
  | interpret-tag | phase4b_vision |
  | collect-meta | phase4a |
  | collect-ttshop | phase1_5 |
  | collect-ig | phase4c |
  | collect-yt | phase4d |
  - 각 phase는 `existing.<단일필드>`만 소비함을 grep으로 확인(wholesale 사용 없음) → 무해.

### 근본 원인 (별건, WS5 §4 / migration 020)
key_stats에 `kalodata_*_xlsx`·`tt_shop_us_*` 원본 스냅샷이 적재되어 6.9MB로 비대. 이를
`cases.uploads`로 이전하면 read-key-stats 슬림화 없이도 해소됨. 본 fix는 즉시 방어(모든 phase),
비대 청소는 020에서.

tsc: ✅ 통과. 3be66bbd 실검증(force 재실행)은 ORCH.

변경 파일: `interpret-cluster.ts`(+로그) · `interpret-asr/sku/tag.ts` · `collect-meta/ttshop/ig/yt.ts`.

---

## BE-6 — 영상 태깅 재현성 fix ✅ (코드 / 재게이트 실측은 ORCH)

근거: 게이트 실측(2026-07-07) Sonnet 자기일치 56%, cta_type 27%. WS9 §3.6 연계. Haiku 재도전의 선결.

### 원인
`vision-tagger.ts` SYSTEM_PROMPT가 라벨을 느슨하게 정의("pick from these **or similar** tokens"),
다중 후보 시 tie-break 부재 → 같은 영상도 실행마다 다른 값. 특히:
- **cta_type(27%)**: 한 영상에 CTA 여러 개(follow+shop+save)일 때 매번 다른 것 선택, "or similar"로 자유토큰.
- **purchase_intent**: high/mid 경계 모호.
- **products_visible**: 자유 명사구("blue serum bottle" vs "serum") → 표현 흔들림.

### 수정 (프롬프트 결정성 + 코드 정규화)
1. 프롬프트 전면 개정:
   - 모든 라벨 CLOSED enum, "or similar"·자유토큰 금지. vibe 금지, evidence-only.
   - 단일 선택(content_angle·body_format·visual_style): **EXACTLY ONE, dominant, tie-break=목록 EARLIEST**.
   - hook_tags: 목록 내에서만, 0-3개 강한 순, 없으면 [].
   - **cta_type**: explicit CTA만(암시 금지), 여러 개면 우선순위 `shop_link > save > follow > tag_friend > share > comment > watch_more`, 없으면 null.
   - **purchase_intent**: 조건 충족 최상위 티어(high=쇼핑 푸시/가격·할인·긴급, mid=시연·리뷰 무푸시, low=부수적·무제품).
   - **products_visible**: 제네릭 카테고리 명사만(브랜드·색·포장어 금지), 소문자·단수, 중복제거, max 3, 두드러진 순.
2. 코드 정규화(모델 표면 흔들림 제거): `normalizeCta`(소문자·트림·null표기 처리), `normalizeProducts`(소문자·트림·공백정규화·중복제거·max3).
3. 게이트에 **자기일치 모드** 추가: `--self`면 baseline 대신 같은 모델로 **2회 재태깅→run1 vs run2** 비교. `npm run gate:self`(= `BP_TAGGING_MODEL=claude-sonnet-4-6 … --self`).

변경 파일: `src/lib/anthropic/vision-tagger.ts`, `scripts/gate-tagging-model.ts`, `package.json`.

### 재게이트 (ORCH — 유료 Anthropic API, 워커 직접 호출 금지)
```
npm run gate:self -- --videos 40     # Sonnet run1 vs run2 자기일치, 목표 필드별·종합 ≥85%
```
- 표본 40건 × 2콜 = ~80 vision 호출(캡 $1). cta_type·purchase_intent·products_visible 개선 확인.
- ≥85% 미달 필드가 남으면 해당 라벨 정의 추가 조임 → 재게이트 반복.
- 통과 시 WS9 §3.6 Haiku 재도전(동일 프롬프트로 Sonnet baseline vs Haiku) 진행.

tsc: ✅ 통과.

---

## BE-3 — migration 020 구조 청소 (작성만, 적용 금지) ✅

근거: WS5 §4 · spec/01 §3 · R12. 파일: `supabase/migrations/020_ws5_structural_cleanup.sql`.

### grep+dry-run 선행이 spec 가정을 반증 (R12의 핵심 가치)
spec/01 §3은 대상 10개를 "전부 0행"으로 기재했으나 2026-07-07 프로덕션 실측(SELECT):

| 테이블 | 실측 행 | 코드 참조 | 판정 |
|---|---|---|---|
| internal_notes | 0 | 없음 | **DROP** |
| campaign_executions | 0 | 없음 | **DROP** |
| pipeline_runs | 0 | 병합/리셋 목록만 | **DROP** (delist) |
| viral_clusters | 0 | 병합 목록만 | **DROP** (delist) |
| case_rejections | 0 | 병합 목록만 | **DROP** (delist) |
| case_video_assets | 0 | 병합/리셋 목록만 | **DROP** (delist) |
| sales_monthly | **650** | 없음 | ⚠️ 제외 (spec 0행 반증 — 원인 조사) |
| viral_bsr_impacts | **742** | 병합 목록 | ⚠️ 제외 (BSR 변곡점 이관은 별건) |
| app_settings | **1** | settings/diagnose pricing·exchange **라이브** | ⚠️ 제외 |
| seeding_packages | **13** | settings/packages **라이브 CRUD** | ⚠️ 제외 |
| promotion_events | 54 | — | 제외(설계상 유지) |

→ **비어있다던 4개가 실제로 데이터/라이브 코드 보유.** 무비판 drop 시 sales_monthly 650·
viral_bsr_impacts 742행 소실 + settings/diagnose 페이지 런타임 파손. grep 없이 진행했으면
#47류 재발. spec/01 §3의 "전부 0행" 문장은 정정 필요(ORCH).

### 마이그레이션 내용
1. **DROP 6개**(위 0행) — 적용 시점 `count(*)` 0행 가드(DO 블록, 0행 아니면 RAISE 중단).
2. **status 통일**: `completed`(4) → `ready` (R8: 게이트는 데이터 존재로 판단).
3. **RLS 통일**: 전 public 테이블 RLS enable + 멱등 `anon_all_<table>` 정책(DO 루프) — advisor
   "RLS disabled" 경고 소거. service_role은 RLS 우회라 파이프라인 무영향.
4. **R12 체크리스트 + 적용 전 dry-run 쿼리 블록** 주석 포함. drop 대상 전부 0행이라 백업 무의미.

### 동반 코드 delist (drop 안전화)
drop 대상이 case 병합/리셋 목록에 있어 그대로 두면 apply 후 런타임 에러 → 제거:
- `case-actions.ts` 병합 목록: case_rejections·case_video_assets·pipeline_runs·viral_clusters 제거(viral_bsr_impacts 유지).
- `upload-actions.ts` 리셋 목록: case_video_assets·pipeline_runs 제거.

### ⚠️ 적용 순서 (ORCH)
(1) delist 코드 배포 → (2) 020 apply → (3) `npm run db:types` 재생성. 순서 어기면 배포된
구코드가 drop된 테이블 조회로 에러. tsc: ✅ 통과.

### 미이관 (WS5 §4 잔여 — 별도 항목 권고)
bsr 컬럼 이원화 제거·BSR 변곡점 case_insights 이관·cases.options 디버그키·key_stats
xlsx→cases.uploads(BE-5 근본청소)는 본 020 범위 밖. 데이터 이동/백업 동반이라 별도 마이그레이션.

---

## BE-7 — mark-ready 완결성 게이트 ✅ (QA-2 F1 후속, 신규 정의)

근거: QA_케이스위생 F1(근본원인). 보드에 BE-7 행이 없어 QA-2 F1 권고에서 정의.

### 원인
`orchestrate-analysis.ts` `mark-ready`가 **파이프라인이 예외 없이 리턴하기만 하면** 무조건
`status='ready'`. 각 phase 실수집 건수 미검사 → "빈 입력 → 빈 파이프라인 → ready"(F5 등
45/87 어긋남의 공통 뿌리). "ready"가 "의미 있게 끝남"이 아니라 "안 죽고 리턴"만 보증.

### 수정
- mark-ready에 완결성 게이트: 실테이블 직접 count(`countCaseData`) — contents(브랜드+국가
  스코프)·meta_ads·ig_posts·yt_videos·products. 하나라도 >0이면 `ready`, 전부 0이면
  **`data_ready`**(이미 존재하는 enum, `globals.css`에 status-pill 스타일 존재 → FE 표기 가능).
- `key_stats.completeness = { has_data, counts, checked_at }` 기록(감사·화면 근거).
- key_stats 캐시 대신 실테이블 count 사용 이유: F3(캐시 789 vs 테이블 0)처럼 캐시가 어긋남.

변경 파일: `src/lib/inngest/functions/orchestrate-analysis.ts`. tsc ✅.

### ⚠️ 별건 플래그 (ORCH 판단)
- `run-analysis.ts` onFailure가 **오케스트레이터 실패 시에도** `status='ready'`로 밀어냄
  (stuck 방지 목적). 실패를 ready로 위장 → `failed`로 바꾸는 게 정직하나, 재시도/resume
  흐름과 상호작용 미검증이라 본 커밋서 제외. **권고: onFailure → `status='failed'`**.
- 소급 재판정: 기존 ready 케이스에 게이트 소급 적용(재-mark 또는 배치 UPDATE)은 ORCH.
- FE: 케이스 목록 필터가 `data_ready`를 적절히 포함/구분하는지 확인 권고.

---

## BE-8 — cases.channel NOT NULL 제약 ✅ (QA-2 F5 후속, 신규 정의)

근거: QA_케이스위생 F5. 파일: `supabase/migrations/021_cases_channel_not_null.sql`(적용 금지).

### 원인
`cases.channel`은 앱 타입상 필수인데 DB NOT NULL 제약이 없어 NULL 유입. 배치 생성 결함으로
channel=NULL 3건(biodance·torriden·equalberry, 전부 US, config 신호 전무 — QA-2 F5 빈 케이스).

### 마이그레이션
1. NULL 3건(명시 id) → `'other'`(기존 값, 추론 불가한 빈 케이스라 미분류로) 백필.
2. 잔존 NULL 가드(목록 밖 NULL 있으면 RAISE — 맹목 백필 금지).
3. `ALTER TABLE cases ALTER COLUMN channel SET NOT NULL` (향후 유입 차단).
4. dry-run 블록 주석 포함. ORCH가 3건 삭제(R12) 선호 시 백필 대신 삭제 후 SET NOT NULL 가능.

실측 channel 분포(2026-07-07): amazon=62, tiktok_shop=25, shopee=2, other=1, NULL=3. apply는 ORCH.

---

## BE-9 — meta_ads.inferred_creator_handle 파싱 검증 ✅ (판정: 파서 결함 아님, 수정 불필요)

근거: QA_파일럿_매트릭스 Q7 — SharkNinja(Ninja Kitchen US, `95012d4a`) 221건 중
inferred_creator_handle 0건. raw link_url UTM 전수 실측(SELECT).

### 실측
- 221건: link_url 없음 2, `utm_term|utm_campaign` 있음 **81**, 파서 성공 0.
- `utm_campaign` 표본: 전부 `Brand_<Awareness|Traffic>_NinjaKitchen_<Product>_<Product>`
  (예: `Brand_Awareness_NinjaKitchen_Espresso_Espresso`) — **캠페인 택소노미(목적·제품)**, 핸들·날짜토큰 없음.
- `utm_term` 표본: 전부 `{{ad.id}}` — **렌더 안 된 Meta 매크로 플레이스홀더**(리터럴 문자열).

### 판정 — **파서 결함 아님**
`parseCreatorFromUtm`은 Kiero식(`BRAND_MKT_PRODUCT_<handle>_<YYMMDD>`) 휴리스틱. SharkNinja는
UTM에 크리에이터 핸들을 애초에 넣지 않음(캠페인 코드만) → null 반환이 **정상**. `{{ad.id}}`도
토큰 1개라 안전 통과(오탐 없음). 파서 수정 불필요.

### 진짜 신호는 딴 데 있음 (Q7 소비 수정 권고 — FE/QA)
SharkNinja의 실제 시딩 크리에이터는 **`creator_page_name`에 43/221건 존재**
(PlantYou·Eatwitzo·theeverythingdad·The Vagle Family …). 즉 이 브랜드의 Q7("누가 시딩했나")은
UTM 파생 `inferred_creator_handle`이 아니라 `creator_page_name`/`partner_page_name`으로
답해야 함. → **QA_파일럿_매트릭스 Q7 항목: inferred_creator_handle 단독 의존 → creator_page_name
우선으로 정정 권고.** BE 코드 변경 없음.
