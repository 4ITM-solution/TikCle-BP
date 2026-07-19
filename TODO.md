# TODO — 배차판 (2026-07-07)

> 운영 규칙: `docs/ORCHESTRATION.md`. 워커는 자기 레인 최상단 작업을 잡고, 시작 시 상태를 🔄, 완료 시 ✅+커밋해시로 갱신 후 보고. 검증·머지·보드 확정은 ORCH.

## BE 레인 (워크트리: `.claude/worktrees/ws-5`, 브랜치 `ws-5-pipeline` — 이어받기)

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| BE-1 | 게이트 스크립트 R9 수정 | ✅ a3c1a41 — 재게이트 2회 실전 사용으로 검증 완료 | spec/06 R9 | 완료 |
| BE-2 | ✅ 2e7f0de (재작업) — `clearCaseClusters`에서 content_clusters 삭제 **전** `resetPassLabels`로 pass3_meta_id FK 끊음(순서 재배치). tsc 통과. 재검증은 ORCH(4케이스 force) | WS5_지시서 §2 | 수정 후 tsc, 재검증은 ORCH(4케이스 force) |
| BE-3 | ✅ f8e87c8 — `020_ws5_structural_cleanup.sql`(적용 금지). **grep+dry-run이 spec 반증**: sales_monthly=650·viral_bsr_impacts=742·app_settings=1(라이브)·seeding_packages=13(라이브) → drop 제외. DROP은 0행 6개(internal_notes·campaign_executions·pipeline_runs·viral_clusters·case_rejections·case_video_assets)+0행 가드. status completed→ready(4). RLS 전테이블 통일 DO블록. R12 체크리스트+dry-run 블록 주석. 코드 delist(case-actions·upload-actions). tsc 통과. apply·db:types는 ORCH | WS5_지시서 §4, spec/01 §3 | 파일 + dry-run 쿼리 블록 |
| BE-5 | ✅ 31d35e3 — 원인은 pass1 아님: **`read-key-stats` 스텝이 key_stats 전체(3be66bbd 6.96MB, kalodata_*_xlsx 4+2.6MB)를 반환** → Inngest step output >4MB 초과. interpret-cluster + 동일 패턴 7개 phase(interpret-asr/sku/tag, collect-meta/ttshop/ig/yt)의 read-key-stats를 캐시 판정에 쓰는 단일 필드만 반환하도록 슬림화. 페이로드 크기 로그 추가. 근본청소(xlsx→cases.uploads)는 WS5 §4/020. tsc 통과. 3be66bbd 검증은 ORCH | phase_runs error 실측 2026-07-07 | tsc + 반환 페이로드 크기 로그 |
| BE-6 | ✅ 1b8abd4 — **ORCH 재게이트 실측: 자기일치 96.5% (목표 85% 초과 통과)**. vision-tagger 프롬프트 전면 개정: 모든 라벨 CLOSED enum·"or similar" 제거, EXACTLY ONE+dominant+earliest tie-break, cta_type 우선순위(shop_link>save>…)·explicit-only·null 규칙, purchase_intent 티어 조건, products_visible 제네릭명사·소문자·중복제거·max3. 코드 정규화(normalizeCta/normalizeProducts) 추가. gate에 `--self`(run1 vs run2 자기일치) 모드 + `npm run gate:self`. **재게이트 실측은 ORCH(유료 API): `npm run gate:self -- --videos 40`, 목표 ≥85%** | 게이트 실측 2026-07-07, WS9 §3.6 연계 | 재게이트 자기일치 표 |
| BE-7 | ✅ 146b3e0 (QA-2 F1 후속, 신규 정의) — mark-ready 완결성 게이트: orchestrate-analysis.ts가 예외없이 끝나면 무조건 ready로 올리던 것을 수정. 전 채널 실데이터 0건(contents 브랜드+국가·meta_ads·ig_posts·yt_videos·products 실테이블 count)이면 `status='data_ready'`(기존 enum, FE status-pill 존재)로 표기 + key_stats.completeness 기록. tsc 통과. ⚠️ run-analysis onFailure의 force-ready는 별건 플래그(보고서). 소급 재판정은 ORCH | QA_케이스위생 F1 | tsc + 게이트 코드 |
| BE-8 | ✅ 146b3e0 (QA-2 F5 후속, 신규 정의) — `021_cases_channel_not_null.sql`(적용 금지): channel NULL 3건(biodance·torriden·equalberry US, config 신호 전무) → 'other' 백필 + 잔존 NULL 가드 + `ALTER … SET NOT NULL`. dry-run 블록 포함. apply는 ORCH | QA_케이스위생 F5 | 파일 + dry-run |
| BE-9 | ✅ 판정: **파서 결함 아님**(수정 불필요) — SharkNinja 81/221 UTM 있으나 utm_campaign=캠페인택소노미(Brand_Awareness_NinjaKitchen_Espresso), utm_term=`{{ad.id}}` 미렌더 매크로 → 핸들 미포함이라 null이 정상. 진짜 크리에이터는 `creator_page_name`에 43/221 존재(PlantYou·Eatwitzo…). **권고: Q7은 inferred_creator_handle 단독 말고 creator_page_name 우선**(FE/QA). 상세 WS5_REPORT BE-9 | QA_파일럿_매트릭스.md §1 Q7·§5-2 | 판정 보고+필요시 fix |
| BE-10 | ✅ 9bf6a57 [CX1-F1] startAnalysis 이벤트 발행 실패 성공 위장 fix — inngest.send catch에서 status를 직전 값으로 원복 + last_error='event_dispatch_failed: …' + `ok:false` 반환(직전 status는 update 전에 캡처). tsc 통과. 실패 시뮬 트레이스 WS5_REPORT BE-10 | CX_파이프라인_재감사 F1 | tsc + 실패 시뮬 |
| BE-11 | ✅ d5367f1 [CX1-F4·F5] fail-open 2건 — ①비용 가드(shared.ts): sumPaged 쿼리에러 throw로 표면화 + 조회 실패 시 fail-closed(emergency cap $5 정책, BudgetExceededError `budget_guard_unavailable`), dev는 `BP_BUDGET_FAILOPEN=1` 통과. ②vision dedup(phase4b-vision.ts): fetchReusableVisionTags error throw → 배치 실패로 Inngest 재시도(전량 재태깅 과금 차단). tsc 통과. ⚠️ phase4a-intel fetchReusableAdIntel도 동일 패턴(보고서 플래그) | CX 재감사 F4·F5 | tsc |
| BE-12 | ✅ [CX1-F2] phase 의존 DAG — 설계 확정본 그대로. `PHASE_DOWNSTREAM` 상수 + `enqueueDownstream`(체인 threading — collect-meta는 tag→serve-stats로 cluster/sku 건너뜀) in shared.ts, `case/phase.requested`에 cascade/cascade_chain 필드, 오케스트레이터 invoke는 cascade:false(이중실행 차단), 10개 phase 실작업 성공 return 직전 hook(serve-stats 종단 제외, interpret-tag는 partial 보류). spec/02 §3.1+§7 갱신. tsc 통과. **라이브 cascade 검증 통과**(08cc: sku→serve-stats 자동 동반 실측, 2026-07-08) | BE12_DAG_설계.md | tsc + 소형 케이스 cascade 검증(ORCH) |

| BE-13 | [BE-11 후속] phase4a-intel `fetchReusableAdIntel` 동일 fail-open 패턴 수정 — 광고 dedup 조회 에러도 throw로 표면화 (BE-11의 vision 쪽과 동일 처리) | ⬜ | WS5_REPORT BE-11 플래그 | tsc |
| BE-14 | Helium10 Sales History(일별 판매 추정) 적재 파서 — Amazon 케이스 기간 정확 매출 시계열. 새 업로드 포맷+파서+period 필터 연동 | ⏸ 사용자 보류(2026-07-19 "일단 아니야") — 승인 시 착수 | 기간 필터 v1(54acafc 이후) 논의 | 파서+tsc+실적재 1케이스 |
| BE-15 | 기간 필터 IG/YT 확장 — ig_posts/yt_videos 게시일 조인으로 IG/YT 명단도 period_scope 반영 (v1은 TK·광고·클러스터·BSR만) | ⬜ | period-filter.ts v1 주석 | tsc + 실화면 |

## QA 레인

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| QA-1 | SharkNinja 파일럿 대사 — Q1~Q7+확장질문 5개 화면·뷰·원천 3층 실측, 질문 응답력 매트릭스(D1) | ✅ 4c93d32 (검증 대기 — ORCH) | docs/ws/파일럿_리프레시_SharkNinja.md D1 | docs/ws/QA_파일럿_매트릭스.md |
| QA-2 | 케이스 위생 전수조사 | ✅ 3c9b049 — ORCH 검증·머지 완료. 45/87 어긋남, 근본원인 F1(ready 게이트 부재). 후속: BE-7·8, U-4 | DATA_감사 F3 | docs/ws/QA_케이스위생_전수조사.md |

## CODEX 레인 (세컨드 오피니언 — 구현 금지, 보고서만)

| # | 작업 | 상태 | 산출물 |
|---|---|---|---|
| CX-1 | 파이프라인 재감사 | ✅ 신규 발견 6건(F1~F6) — 전부 비중복 확인, BE-10~12 배차 변환 | docs/ws/CX_파이프라인_재감사.md |
| CX-2 | Q계약 비판 검토 | ✅ 계약 v2(9문항) 제안 — 채택 여부는 U-6 사용자 결정 | docs/ws/CX_질문계약_리뷰.md |

## FE 레인

| # | 작업 | 상태 | 근거 | 완료 기준 |
|---|---|---|---|---|

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| FE-2 | 케이스 상세 프로토 v8 확정 시 **1:1 구현** (재해석·축소 금지) — 개선 13건 + 전역 기간 필터 UI. 정본: docs/design/prototype/bp-case-proto-v8.html + 아티팩트 f30052b0 | ⏸ 사용자 프로토 검수 대기 | PROTOTYPE_PROTOCOL.md §5 | 프로토 대비 블록 diff 0 |
| FE-1 | **현행 화면 유지 + 갭 17항목 결선** — 우선순위 A(기능7)→C(UX6)→B(신뢰7), 리디자인 금지. migration 019 작성 포함 | ✅ 브랜치 `ws-4b-screens` — 17항목 전부 항목별 커밋(A1~A7·C1~C6·B1~B7) + REPORT(6e2ebc9). tsc 전부 통과. 실화면 QA 3케이스(medicube·Foodology·Nature Republic) 스크린샷 확인 — 크래시·콘솔에러 없음, 019 미적용 그레이스풀 폴백 확인. **검증·머지는 ORCH.** ⚠️ ORCH 조치: ①migration 019 apply+A1백필+재QA ②로컬 main 쓰레기 커밋 48faa29 정리(git reset --hard 70cffac) | docs/ws/WS4_지시서.md 확정판 | 항목별 커밋 + 실화면 QA 3케이스 |

## ORCH 직영 (운영 배치·게이트)

| # | 작업 | 상태 |
|---|---|---|
| O-1 | 파일럿 P3 체인 (SharkNinja tag→cluster→sku→stats) | ✅ 완주 (2026-07-07) — QA-1 착수 가능 |
| O-2 | F1 클러스터 잔재 청소 | ✅ **종결 — legacy 0행** (1,992→0, 2026-07-07 밤) |
| O-3 | BE-1 검증 → 재게이트 → Haiku 재판정 | ✅ **판정: 티어링 전면 보류, Sonnet 유지** — 영상: Haiku가 핵심필드(앵글 43%·훅 26%·제품 7%)에서 베이스라인(60/56/32%) 대비 붕괴. 광고: origin_class 80→50%. 재도전은 BE-6 후 |
| O-4 | BE 산출물 게이트 | ✅ 전부 머지·배포 + **migration 020/021 프로덕션 적용·검증**(테이블 6 drop·RLS 전체·status 통일·channel NOT NULL) |
| O-6 | FE-1 배포 후 재-QA — 019 실데이터로 3케이스 재확인(샵 토글·히트맵·교집합 블록 실렌더) + draft 케이스로 위저드 확인 | ⬜ |
| O-5 | 파일럿 D1~D5 종합 | ✅ 파일럿 문서 §결정 기록 — 무차별 재실행 NO. F8 미실행 collect 백필은 **철회(2026-07-07 사용자)** — 케이스를 실제로 쓸 때 + BE 트리거 원인 규명 후 케이스 단위로만 |

## 결정 대기 (사용자)

| # | 결정 | 근거 |
|---|---|---|
| U-3 | 슬랙 웹훅 URL → 파이프라인 실패 알림 실전화 | 가드 배포됨 |

---

### 백로그 (당장 배차 안 함)
- [Terez 789건 유실 — 규명 완료 2026-07-07] 판정: **구 delete-후-reinsert(P4) + 중도 사망(P1) 콤보의 유산.** 5/6 수집(ks에 789 기록) 후 어느 시점 재실행이 delete까지 하고 죽음 — ks는 옛 숫자 유지, 테이블 0행, phase_runs 이전 시대라 무추적. 동일 브랜드 중복 케이스(ac13f661)도 발견 — 머지 후보. **재발 방지는 WS1 upsert로 이미 구조적 완료.** 조치: 케이스 사용 시 재수집($0.75) + ks 유령 숫자는 WS4b 뷰 전환 시 자연 소멸
- [BE-4] Keepa API 인입 phase — **D4 확정: 수동 유지**(사용자, 비용). 수동이 병목 되면 재상신 — 설계 근거는 D4 리서치 요약 그대로 보존
- [계약 v2] Q0·Q6~Q8 구현은 WS6~8 착수 시 (지금은 계약 문서만 개정됨)
- [CX1-F6] syncCaseBpBrands 실패 관측성 — WS8(진단-매칭) 연결 시점에 승격
- [QA-2 F8] 미실행 collect 백필 — 케이스 사용 시점 + 트리거 원인 규명 후 케이스 단위

### 참고: D4 자동 인입 리서치 요약 (2026-07-07)

| 소스 | API | 월 비용 | 판정 |
|---|---|---|---|
| Keepa | ✅ 공식 (토큰제) | €49~ (최저 티어면 충분) | **즉시 도입 추천** — BSR·가격 히스토리 완전 대체 |
| Helium10 | ❌ 공개 API 없음 | — | 대안 **Jungle Scout API** ($29~199, sales_estimates 엔드포인트) — 1회 캘리브레이션 후 대체 |
| Exolyt | ⚠️ 엔터프라이즈 문의 | Essentials $400/월(CSV credits 포함) | 보류 — 영업 문의. 단기는 수동 유지 |
| Kalodata | ⚠️ Enterprise 전용 Open API | 미확인 | 문의 1순위(검증된 GMV 소스). 대안 EchoTik은 정확도 교차검증 필수 |
