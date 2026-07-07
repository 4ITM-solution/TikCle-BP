# TODO — 배차판 (2026-07-07)

> 운영 규칙: `docs/ORCHESTRATION.md`. 워커는 자기 레인 최상단 작업을 잡고, 시작 시 상태를 🔄, 완료 시 ✅+커밋해시로 갱신 후 보고. 검증·머지·보드 확정은 ORCH.

## BE 레인 (워크트리: `.claude/worktrees/ws-5`, 브랜치 `ws-5-pipeline` — 이어받기)

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| BE-1 | ~~게이트 스크립트 수정 (커버 재호스트 이미지 사용 + 유효 표본 30+·실패율 경고·캡 $1)~~ | ✅ a3c1a41 (검증 대기 — ORCH) | spec/06 R9, WS3_REPORT §3 | tsc + ORCH 재게이트 실행 |
| BE-2 | ✅ 2e7f0de (재작업) — `clearCaseClusters`에서 content_clusters 삭제 **전** `resetPassLabels`로 pass3_meta_id FK 끊음(순서 재배치). tsc 통과. 재검증은 ORCH(4케이스 force) | WS5_지시서 §2 | 수정 후 tsc, 재검증은 ORCH(4케이스 force) |
| BE-3 | ✅ f8e87c8 — `020_ws5_structural_cleanup.sql`(적용 금지). **grep+dry-run이 spec 반증**: sales_monthly=650·viral_bsr_impacts=742·app_settings=1(라이브)·seeding_packages=13(라이브) → drop 제외. DROP은 0행 6개(internal_notes·campaign_executions·pipeline_runs·viral_clusters·case_rejections·case_video_assets)+0행 가드. status completed→ready(4). RLS 전테이블 통일 DO블록. R12 체크리스트+dry-run 블록 주석. 코드 delist(case-actions·upload-actions). tsc 통과. apply·db:types는 ORCH | WS5_지시서 §4, spec/01 §3 | 파일 + dry-run 쿼리 블록 |
| BE-5 | ✅ 31d35e3 — 원인은 pass1 아님: **`read-key-stats` 스텝이 key_stats 전체(3be66bbd 6.96MB, kalodata_*_xlsx 4+2.6MB)를 반환** → Inngest step output >4MB 초과. interpret-cluster + 동일 패턴 7개 phase(interpret-asr/sku/tag, collect-meta/ttshop/ig/yt)의 read-key-stats를 캐시 판정에 쓰는 단일 필드만 반환하도록 슬림화. 페이로드 크기 로그 추가. 근본청소(xlsx→cases.uploads)는 WS5 §4/020. tsc 통과. 3be66bbd 검증은 ORCH | phase_runs error 실측 2026-07-07 | tsc + 반환 페이로드 크기 로그 |
| BE-6 | ✅ 1b8abd4 (코드) — vision-tagger 프롬프트 전면 개정: 모든 라벨 CLOSED enum·"or similar" 제거, EXACTLY ONE+dominant+earliest tie-break, cta_type 우선순위(shop_link>save>…)·explicit-only·null 규칙, purchase_intent 티어 조건, products_visible 제네릭명사·소문자·중복제거·max3. 코드 정규화(normalizeCta/normalizeProducts) 추가. gate에 `--self`(run1 vs run2 자기일치) 모드 + `npm run gate:self`. **재게이트 실측은 ORCH(유료 API): `npm run gate:self -- --videos 40`, 목표 ≥85%** | 게이트 실측 2026-07-07, WS9 §3.6 연계 | 재게이트 자기일치 표 |
| BE-9 | [QA-1 Q7] meta_ads.inferred_creator_handle 파싱 검증 — SharkNinja 221건 중 0건. raw body_text/link_url 샘플 20건 육안 대조로 "파싱 결함 vs 진짜 브랜드 자체제작" 판정. 결함이면 파서 수정 | ⬜ | QA_파일럿_매트릭스.md §1 Q7·§5-2 | 판정 보고+필요시 fix |
| BE-4 | Keepa API 인입 phase 설계·구현 (`collect-bsr`) — uploadBsr 대체, sales_snapshot upsert 재사용, spec/02 §7 체크리스트 준수. env `KEEPA_API_KEY` | ⬜ (D4 결정 후 착수 가능) | D4 리서치 결과(TODO 하단), spec/02 §7 | tsc + 명세 행 추가 |

## QA 레인

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| QA-1 | SharkNinja 파일럿 대사 — Q1~Q7+확장질문 5개 화면·뷰·원천 3층 실측, 질문 응답력 매트릭스(D1) | ✅ 4c93d32 (검증 대기 — ORCH) | docs/ws/파일럿_리프레시_SharkNinja.md D1 | docs/ws/QA_파일럿_매트릭스.md |
| QA-2 | 케이스 위생 전수조사 | ✅ 3c9b049 — ORCH 검증·머지 완료. 45/87 어긋남, 근본원인 F1(ready 게이트 부재). 후속: BE-7·8, U-4 | DATA_감사 F3 | docs/ws/QA_케이스위생_전수조사.md |

## CODEX 레인 (세컨드 오피니언 — 구현 금지, 보고서만)

| # | 작업 | 상태 | 산출물 |
|---|---|---|---|
| CX-1 | 파이프라인 전면 재감사 (신선한 눈) — src/lib/inngest/ 전체를 기존 결론(BP_재설계_v2 P1~P10·G1~G8, spec/06 R1~R12, QA_케이스위생 F1~F8)과 **중복되지 않는** 신규 리스크·설계 냄새 관점으로. 특히: 동시성/레이스, 멱등성 구멍, 비용 누수, 에러 삼킴(silent catch) | ⬜ | docs/ws/CX_파이프라인_재감사.md |
| CX-2 | Q1~Q7 산출물 계약 자체에 대한 비판적 검토 — "이 7개 질문이 §1.0 제품 정의(온전한 케이스 참조 체계)를 정말 커버하나? 빠진 질문·불필요한 질문은?" 설계 문서 §1 기준 | ⬜ | docs/ws/CX_질문계약_리뷰.md |

## FE 레인 (사용자 화면 기획 확정 대기 — 가동 보류)

| # | 작업 | 상태 |
|---|---|---|
| FE-1 | WS4b 결선 (확정 화면 기준) — docs/ws/WS4_지시서.md + [QA-2 F2] salesDone이 SKU 존재만 체크(매출 0이어도 완료 표시) → 완결성 게이지에 매출 축 분리 반영 | ⬜ 보류 |

## ORCH 직영 (운영 배치·게이트)

| # | 작업 | 상태 |
|---|---|---|
| O-1 | 파일럿 P3 체인 (SharkNinja tag→cluster→sku→stats) | ✅ 완주 (2026-07-07) — QA-1 착수 가능 |
| O-2 | F1 잔여 웨이브 | 🔄 W1 처리 중·W2~3 자동 발송 예정 (러너 버그 수정 후 재개) |
| O-3 | BE-1 검증 → 재게이트 → Haiku 재판정 | ✅ **판정: 티어링 전면 보류, Sonnet 유지** — 영상: Haiku가 핵심필드(앵글 43%·훅 26%·제품 7%)에서 베이스라인(60/56/32%) 대비 붕괴. 광고: origin_class 80→50%. 재도전은 BE-6 후 |
| O-4 | BE-2·3 검증→머지→apply→배포 | ⬜ |
| O-5 | 파일럿 D1~D5 종합 | ✅ 파일럿 문서 §결정 기록 — 무차별 재실행 NO. F8 미실행 collect 백필은 **철회(2026-07-07 사용자)** — 케이스를 실제로 쓸 때 + BE 트리거 원인 규명 후 케이스 단위로만 |

## 결정 대기 (사용자)

| # | 결정 | 근거 |
|---|---|---|
| U-1 | D4 자동 인입 구독: **Keepa €49/월 + Jungle Scout API $29~49/월 ≈ 월 $85~110으로 수동 4종 중 2종(Keepa·Helium10) 자동화.** Exolyt·Kalodata는 엔터프라이즈 문의 필요 (영업 컨택은 사용자 몫) | 리서치 2026-07-07 (아래 요약) |
| U-2 | 화면 기획 확정본 → FE 레인 가동 | — |
| U-3 | 슬랙 웹훅 URL → 파이프라인 실패 알림 실전화 | 가드 배포됨 |

---

### 참고: D4 자동 인입 리서치 요약 (2026-07-07)

| 소스 | API | 월 비용 | 판정 |
|---|---|---|---|
| Keepa | ✅ 공식 (토큰제) | €49~ (최저 티어면 충분) | **즉시 도입 추천** — BSR·가격 히스토리 완전 대체 |
| Helium10 | ❌ 공개 API 없음 | — | 대안 **Jungle Scout API** ($29~199, sales_estimates 엔드포인트) — 1회 캘리브레이션 후 대체 |
| Exolyt | ⚠️ 엔터프라이즈 문의 | Essentials $400/월(CSV credits 포함) | 보류 — 영업 문의. 단기는 수동 유지 |
| Kalodata | ⚠️ Enterprise 전용 Open API | 미확인 | 문의 1순위(검증된 GMV 소스). 대안 EchoTik은 정확도 교차검증 필수 |
