# BP 재설계 v2 — 구조 재설계 설계 문서

작성: 2026-07-07 · 근거: 코드 전수 탐색 (run-analysis.ts, aggregators/*, supabase/migrations/*, cases/[id]/page.tsx) + `IG_파이프라인_수술_플랜.md` + `데이터_구조_설명.md`
범위: **구조 재설계** (phase별 함수 분리 + key_stats 이원화 제거 + 멱등 upsert + 모델 티어링). 채널별 테이블 리모델링(ig_posts/yt_videos 통합)은 범위 외 — 뷰로 통합.

---

## 0. 설계 원칙

1. **산출물 역방향 설계.** 각 섹션이 답할 질문(§1)이 계약이고, 파이프라인은 그 답을 만드는 최저 비용 수단이어야 한다. 답에 기여하지 않는 스크랩/LLM 호출은 삭제 대상.
2. **집계는 저장하지 않는다.** SQL로 즉시 계산 가능한 것(월별 카운트, 티어 분포, top N)은 뷰/쿼리로. LLM·외부 API 산출물(태깅, 클러스터, 팔로워 수)만 테이블에 저장. → "캐시 stale" 문제 자체가 소멸.
3. **모든 쓰기는 멱등(upsert).** 재실행이 데이터를 파괴하거나(delete-reinsert), 누적시키거나(insert-only), 유료 결과를 날리면 안 된다.
4. **유료 호출은 1회만.** 같은 입력에 대한 LLM/스크랩 결과는 natural key로 보존하고 재실행 시 skip.
5. **phase 하나 = 함수 하나.** 실패는 그 phase에서 격리, 재실행도 그 phase만. force_phases 해킹 제거.
6. **배포 프로세스는 수술 플랜 원칙 유지**: 1 fix = 1 배포 = 1 케이스 검증.

---

## 1. 산출물 계약 (변경 없음 — 수술 플랜 Part 2 상속)

> 최상위 질문: **"이 브랜드는 인플루언서 시딩으로 어떻게 성공했는가? 따라 하려면 뭘 베껴야 하는가?"**

| 섹션 | 질문 | 필요한 canonical 데이터 |
|---|---|---|
| A 타임라인 | *언제* 터졌나 | contents/ig_posts/yt_videos 월별 + tier + sales_snapshot(BSR) |
| B 인플 풀 | *누구*를 썼나 | 크리에이터 × {tier, 채널 교집합, 반복협업, 언어, shop GMV} |
| C 포맷 | *무엇*을 찍었나 | content_clusters + vision_tags + USP + paid 분류 |
| D 매출 | 그래서 *팔렸나* | case_product_sales + sales_snapshot + creator×SKU |
| E 광고 | *유료*는 어떻게 | meta_ads 3분류 + 랜딩 + partnership + promo code |
| G 종합 | 뭘 베낄까 | 위 전부의 top 값 (뷰 조합) |

각 phase의 존재 이유는 이 표의 셀 하나를 채우는 것. 셀에 없는 산출물을 만드는 phase 로직은 제거한다.

---

## 2. 현재 구조의 확정 문제 (탐색 결과 요약)

| # | 문제 | 위치 | 결과 |
|---|---|---|---|
| P1 | 15개 phase가 1,386줄 단일 Inngest 함수, retries=1 | run-analysis.ts:84-1386 | 한 phase 실패 = 전체 런 사망, "뭐 하나 돌리면 뻑" |
| P2 | 4b.4 클러스터링이 단일 step으로 Vercel 800s 경계 | phase4b-clusters.ts | 큰 케이스 타임아웃 단골 |
| P3 | key_stats(캐시) vs 테이블(canonical) 이원화, 무효화 조건 불완전 | 전 섹션 | "데이터 넣었는데 안 나옴", force 땜질 |
| P4 | meta_ads delete-후-reinsert → Vision 결과(ad_intel)까지 소실 | phase4a.ts:81 | 재실행마다 Vision 재과금 |
| P5 | Vision 배치가 "remaining=0까지 루프" (최대 15~40회) | phase4a-intel, phase4b-vision | 레이트리밋 시 루프 중단 → 미태깅 영구 잔존 |
| P6 | phase2가 TT Shop US 케이스에서 무조건 2회 실행 | run-analysis.ts:624-654 | 낭비 (집계라 무료지만 시간·복잡도) |
| P7 | 태깅·클러스터 전부 Sonnet, dedup 없음 | vision-tagger.ts, clusterer.ts | Vision류 케이스당 최대 ~$22 |
| P8 | status가 phase 단위 추적 안 됨 | cases.status만 | 어디서 죽었는지 안 보임, 부분 재실행 불가 |
| P9 | country/currency/bsr 3중 denormalize | 010/009 migration | 권역 케이스 join 미스, 어긋난 수치 |
| P10 | 크로스플랫폼 크리에이터가 문자열 normalize 즉석 매칭 | page.tsx | B/G 섹션 매칭 누락 |

---

## 3. 목표 아키텍처

### 3.1 파이프라인: 스테이지 4단 + phase별 독립 함수

```
                    case/collect.requested (orchestrator가 fan-out)
       ┌──────────────┬──────────────┬──────────────┐
S1 수집 │ collect-ttshop│ collect-meta │ collect-ig   │ collect-yt     ← 전부 병렬·독립
       │ (구 1.5)      │ (구 4a+4a.5) │ (구 4c)      │ (구 4d)
       └──────┬───────┴──────┬───────┴──────┬───────┘
S2 보강  enrich-creators (구 3+3.5+3.7 통합) · enrich-ig-profiles (구 4c.5)
       └──────┬───────┘
S3 해석  interpret-asr (4b.2) → interpret-tag (4a.6+4b.3 통합) → interpret-cluster (4b.4, pass별 step) → interpret-sku (4b.5)
       └──────┬───────┘
S4 서빙  (함수 없음) — SQL 뷰가 라이브 계산. phase2·phase5 대부분 폐지, bsr_inflections만 소형 함수로 잔존
```

- **orchestrator는 얇게**: `case/start.analysis` 수신 → phase_runs 행 생성 → `step.invoke()`로 각 phase 함수 호출 (스테이지 내 병렬, 스테이지 간 순차). 각 phase 함수는 자체 800s 예산·retries 3·자체 onFailure를 가짐.
- **모든 phase 함수는 단독 호출 가능**: `case/phase.requested {case_id, phase}` 이벤트로 개별 재실행. force_phases 파라미터 삭제.
- **4b.4 분할**: pass1(배치 N개 step) → pass2(1 step) → pass3(1 step) → save(1 step). P2 해소.
- **Vision 배치 루프 제거**: 시작 시 미태깅 count 조회 → `ceil(count/batch)`개 step을 열거 실행. step별 실패는 Inngest 재시도가 처리. 완료 후에도 remaining>0이면 phase_runs에 `partial` 마킹 (루프 ❌). P5 해소.
- **스크랩→소비 순서 문제(수술 플랜 뿌리①)는 구조적으로 소멸**: 수집(S1)이 항상 해석(S3)보다 먼저고, 집계(S4)는 뷰라 순서 자체가 없음.

### 3.2 데이터: key_stats 이원화 제거

| 지금 key_stats에 있는 것 | 이후 |
|---|---|
| phase2 (월별·creator·sales 집계) | **삭제 → SQL 뷰** `v_case_monthly`, `v_case_creators`, `v_case_sales_summary` |
| phase3 tier 분포 | **삭제 → 뷰** (influencers/ig_authors/yt_channels 라이브) |
| phase4b_clusters (방어저장 캐시) | **삭제** — content_clusters 테이블이 유일 소스 (이미 그렇게 읽는 중) |
| phase5 usp_keywords / 언어분포 | **삭제 → 뷰 또는 서버 계산** (caption 기반, 무료) |
| phase5 bsr_inflections | 유지하되 → `case_insights` 테이블 행으로 (LLM/알고리즘 산출물이므로 저장 대상) |
| kalodata_* , tt_shop_us_*, phase1_5 스냅샷 | 유지 — **수동 업로드 원본**이므로. 단 `cases.uploads` (새 JSONB 컬럼)로 이전해 성격 분리 |
| last_error, 디버그류 | **삭제 → phase_runs로** |

새 테이블/뷰:

```sql
-- phase 단위 추적 (P8 해소, UI PhaseProgress의 소스)
create table phase_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  phase text not null,              -- 'collect-ig', 'interpret-cluster', ...
  status text not null,             -- queued | running | completed | partial | failed
  started_at timestamptz, finished_at timestamptz,
  error text, cost_usd numeric default 0,
  stats jsonb default '{}',         -- 건수 등 소형 메타만 (집계 결과 저장 금지)
  unique (case_id, phase)           -- 최신 상태만, 이력은 pipeline_runs 유지
);

-- 크로스플랫폼 크리에이터 통합 (P10 해소, 리모델링 없이)
create view v_unified_creators as
  select case_id, norm_handle, 'tiktok' as channel, follower_count, ... from influencers ...
  union all select ..., 'instagram', followers, ... from ig_authors
  union all select ..., 'youtube', subscriber_count, ... from yt_channels;
```

denormalize 정리(P9): `case_product_sales.bsr` 폐기(sales_snapshot 단일 소스), currency는 sales_snapshot 우선, country join은 cases 기준으로 정정.

### 3.3 멱등성 (P4, 재실행 = 항상 안전)

| 테이블 | natural key | 쓰기 규칙 |
|---|---|---|
| meta_ads | ad_archive_id | **upsert**, `ad_intel`·`inferred_creator_handle`은 non-null 보존 (재태깅 금지) |
| case_video_analyses | content_id | upsert, vision_tags non-null이면 skip (= 유료 결과 1회) |
| content_clusters/members | case_id+run 단위 | pass3 save에서 트랜잭션적 swap (신규 insert → 성공 시 구버전 delete) |
| contents | url | 현행 유지 (이미 멱등) |
| influencers | platform+handle | `*_updated_at` 기준 최신만 덮어쓰기, phase 간 필드 소유권 분리 (fans는 enrich-creators만, shop 여부는 lemur만) |

### 3.4 모델 티어링 (P7 — "산출물 기준 최저 비용")

원칙: **닫힌 라벨 분류 = Haiku, 개방형 통합·명명 = Sonnet.** 전환 시 반드시 품질 게이트(동일 샘플 30개 Sonnet vs Haiku 비교, 일치율 ≥90%면 확정) 통과 후 배포.

| 작업 | 현재 | 이후 | 근거 |
|---|---|---|---|
| 4b.3 영상 포맷/훅 태깅 | Sonnet | **Haiku 4.5** (게이트 통과 시) | enum 분류. 케이스 최대 $9.6 → ~$1 |
| 4a.6 광고 크리에이티브 태깅 | Sonnet | **Haiku 4.5** | 동일. $12 → ~$1.2 |
| 4b.4 pass1 후보 추출 | Sonnet | **Haiku 4.5** | 후보 나열만, pass2가 검증 |
| 4b.4 pass2/3 통합·명명 | Sonnet | Sonnet 유지 | 개방형 판단, 호출 소수 |
| 4b.5 SKU 매칭 (~30건) | Sonnet | Sonnet 유지 | 소량, 정확도 우선 |
| 추가 | — | caption 해시 dedup (동일 캡션+커버는 1회 태깅) + 3.3의 재태깅 금지 | 중복 지불 제거 |

예상 효과: LLM 비용 케이스당 최대 ~$22 → **~$4**. 스크랩 비용(~$20)은 유지하되 3.3 멱등성으로 재실행 중복 과금 0.

### 3.5 UI 읽기 경로

- 섹션 A/B/G: key_stats 참조 전부 → 뷰/라이브 쿼리로 교체 (A 추이·B 풀은 이미 라이브 — 잔여분만).
- 섹션 C: content_clusters 단일 소스 확정 (key_stats 폴백 제거).
- PhaseProgress: pipeline_runs 추측 → phase_runs 직결. phase별 상태·비용·에러·`partial` 잔여건 표시 + 개별 재실행 버튼이 `case/phase.requested` 발행.
- `status='ready'` 게이트 완화: S1 완료 시점부터 섹션 렌더 (데이터 있는 만큼 보여줌), 미완 phase는 섹션 내 배지.

---

## 4. 마이그레이션 전략 (기존 케이스 데이터 보존)

빅뱅 ❌. 각 워크스트림이 독립 배포 가능하고, 이전 단계 없이도 현행 동작 유지.

```
WS1 데이터 계층 (저위험, 파이프라인 무변경)
    phase_runs 테이블 + v_* 뷰 생성 + upsert 전환(meta_ads·video_analyses·clusters)
    → 검증: 기존 케이스 1개 phase4a 재실행 시 ad_intel 보존되는지

WS2 파이프라인 분해 (핵심)
    per-phase Inngest 함수 + orchestrator + 4b.4 분할 + Vision 루프 제거
    구 runAnalysis는 새 orchestrator 호출 shim으로 유지 → 검증 후 삭제
    → 검증: 대형 케이스(6769b0bb급) 1회 완주, phase_runs 전 phase completed

WS3 모델 티어링 + dedup (WS2와 병렬 가능)
    Haiku 전환 + 품질 게이트 스크립트 + caption 해시 dedup
    → 검증: 샘플 30개 일치율 리포트 + 비용 로그 비교

WS4 UI 읽기 경로 (WS1 뷰 의존)
    key_stats 참조 제거 + PhaseProgress→phase_runs + ready 게이트 완화
    → 검증: 기존 ready 케이스 3개 화면 diff (숫자 동일해야 함)

WS5 E2E 검증 + 구조 청소
    실케이스 1개 처음부터 재분석 → 비용/시간/섹션 완성도 v1 대비 리포트
    key_stats 파생 필드 삭제 마이그레이션 + 구 코드 제거
```

의존성: WS1 → WS2 → WS4 → WS5. WS3은 WS1 이후 아무 때나.

---

## 5. 오케스트레이션 계획 (멀티 세션)

각 WS = 독립 Claude 세션(에이전트) 1개. 공통 규칙:

- 이 문서(`docs/BP_재설계_v2.md`)가 유일한 설계 기준. 완료 시 본 문서 §6 진행 로그에 결과 추가.
- 코드 작성까지만. **Supabase 마이그레이션 적용·Vercel 배포는 사람(또는 메인 세션)이 1건씩** — 수술 플랜 안전 프로세스 준수.
- 케이스 데이터를 삭제하는 코드 금지. 검증은 지정된 테스트 케이스 1개로만.

| WS | 산출물 | 완료 기준 |
|---|---|---|
| WS1 | migration SQL + upsert 패치 | 마이그레이션 dry-run 통과 + phase4a 재실행 ad_intel 보존 |
| WS2 | `src/lib/inngest/functions/phases/*.ts` + orchestrator | 대형 케이스 완주, 개별 phase 재실행 동작 |
| WS3 | 모델 스위치 + 게이트 스크립트 + dedup | 일치율 ≥90% 리포트, 비용 로그 |
| WS4 | UI diff 패치 | ready 케이스 3개 수치 동일 |
| WS5 | E2E 리포트 + 청소 PR | v1 대비 비용·안정성 표 |

## 6. 진행 로그

- 2026-07-07: 문서 작성 (v2 초안).
- 2026-07-07: WS1 코드 완료 (worktree agent-ac4cddd9) — migration 017(phase_runs·cases.uploads·meta_ads unique·content_clusters.run_tag·bp_tier()+뷰 4개: v_unified_creators/v_case_monthly/v_case_creator_stats/v_case_tier_dist) + upsert 전환(phase4a meta_ads upsert·phase4b-vision 재태깅 skip·phase4b-clusters run_tag swap) + scripts/verify-ws1-views.sql. 마이그레이션 적용·배포는 미실행 (사람이 1건씩).
- 2026-07-07: WS1 프로덕션 적용 — migration 017 Supabase 적용(중복 meta_ads 1,927행 정리·ad_intel 861건 보존 확인·뷰 4개 정상), main push→Vercel 배포. 잔여 검증: 배포 완료 후 케이스 1개 phase4a 재실행으로 upsert 동작 확인.
- 2026-07-07: WS2 코드 완료 (worktree agent-ac3ec669) — per-phase 함수 11개(`functions/phases/*`, `case/phase.requested`+if 필터, retries 3, phase_runs 추적) + orchestrator(`case/analysis.orchestrate`, S1 병렬→S2→S3 순차→S4 serve-stats, 채널 구성 기반 skip 마킹) + 구 runAnalysis shim화(force_phases→스테이지 매핑) + interpret-cluster pass별 step 분할(pass1 400영상/step) + Vision 배치 루프 제거(count 기반 열거, 잔여>0 → partial) + PhaseProgress 개별 재실행이 `case/phase.requested` 발행으로 교체(서버액션만, UI는 WS4). tsc 통과. 배포·검증 미실행.
