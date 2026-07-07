# TODO — 배차판 (2026-07-07)

> 운영 규칙: `docs/ORCHESTRATION.md`. 워커는 자기 레인 최상단 작업을 잡고, 시작 시 상태를 🔄, 완료 시 ✅+커밋해시로 갱신 후 보고. 검증·머지·보드 확정은 ORCH.

## BE 레인 (워크트리: `.claude/worktrees/ws-5`, 브랜치 `ws-5-pipeline` — 이어받기)

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| BE-1 | ~~게이트 스크립트 수정 (커버 재호스트 이미지 사용 + 유효 표본 30+·실패율 경고·캡 $1)~~ | ✅ a3c1a41 (검증 대기 — ORCH) | spec/06 R9, WS3_REPORT §3 | tsc + ORCH 재게이트 실행 |
| BE-2 | ✅ 2e7f0de (재작업) — `clearCaseClusters`에서 content_clusters 삭제 **전** `resetPassLabels`로 pass3_meta_id FK 끊음(순서 재배치). tsc 통과. 재검증은 ORCH(4케이스 force) | WS5_지시서 §2 | 수정 후 tsc, 재검증은 ORCH(4케이스 force) |
| BE-3 | migration 020 작성(적용 금지) — 죽은 테이블 drop(promotion_events 제외)·RLS 통일·status 통일·R12 체크리스트 주석. pipeline_runs 참조 코드 grep 선행 | ⬜ | WS5_지시서 §4, spec/01 §3 | 파일 + dry-run 쿼리 블록 |
| BE-5 | ✅ — 원인은 pass1 아님: **`read-key-stats` 스텝이 key_stats 전체(3be66bbd 6.96MB, kalodata_*_xlsx 4+2.6MB)를 반환** → Inngest step output >4MB 초과. interpret-cluster + 동일 패턴 7개 phase(interpret-asr/sku/tag, collect-meta/ttshop/ig/yt)의 read-key-stats를 캐시 판정에 쓰는 단일 필드만 반환하도록 슬림화. 페이로드 크기 로그 추가. 근본청소(xlsx→cases.uploads)는 WS5 §4/020. tsc 통과. 3be66bbd 검증은 ORCH | phase_runs error 실측 2026-07-07 | tsc + 반환 페이로드 크기 로그 |
| BE-6 | 🔴(우선순위 상향 — Haiku 재도전의 선결) 영상 태깅 재현성 fix — Sonnet 자기일치 56%(cta_type 27%) 실측. vision-tagger 프롬프트의 닫힌 라벨 정의를 상호배타적으로 조이고(특히 cta_type·purchase_intent·products_visible), 재게이트로 자기일치 ≥85% 달성 | ⬜ | 게이트 실측 2026-07-07, WS9 §3.6 연계 | 재게이트 자기일치 표 |
| BE-4 | Keepa API 인입 phase 설계·구현 (`collect-bsr`) — uploadBsr 대체, sales_snapshot upsert 재사용, spec/02 §7 체크리스트 준수. env `KEEPA_API_KEY` | ⬜ (D4 결정 후 착수 가능) | D4 리서치 결과(TODO 하단), spec/02 §7 | tsc + 명세 행 추가 |

## QA 레인

| # | 작업 | 상태 | 근거 문서 | 완료 기준 |
|---|---|---|---|---|
| QA-1 | ⭐착수 가능 — SharkNinja 파일럿 대사 — P3 완료됨. Q1~Q7+확장질문 5개를 화면·뷰·원천 3층에서 실측, "질문 응답력 매트릭스"(D1) 작성. 각 답의 기여 테이블 기록, 기여 없는 수집물 목록 | ⬜ | docs/ws/파일럿_리프레시_SharkNinja.md D1 | docs/ws/QA_파일럿_매트릭스.md |
| QA-2 | 케이스 위생 전수조사 | ✅ 3c9b049 — ORCH 검증·머지 완료. 45/87 어긋남, 근본원인 F1(ready 게이트 부재). 후속: BE-7·8, U-4 | DATA_감사 F3 | docs/ws/QA_케이스위생_전수조사.md |

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
| O-5 | 파일럿 D1~D5 종합 → 전 함대 리프레시 GO/NO-GO 상신 | ⬜ (QA-1 후) |

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
