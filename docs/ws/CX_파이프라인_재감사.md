---
status: report
owner: CODEX 상주 세션
updated: 2026-07-07
source: CX-1 — repo-only second opinion, no production DB access
---

# CX-1 — 파이프라인 전면 재감사

범위: `src/lib/inngest/`와 분석 진입 서버 액션. 프로덕션 DB 조회 없음. 기존 결론인 BP_재설계_v2 P1~P10/G1~G8, spec/06 R1~R12, `QA_케이스위생_전수조사` F1~F8과 중복되는 지적은 제외했다.

## 제외한 중복

- `ready` 승격에 완결성 게이트가 없는 문제 자체는 QA F1과 중복이므로 재기재하지 않는다.
- `serve-stats` 수동 동반 필요, key_stats 이원화, Vision 루프/재호스트, delete/reinsert, 1000행 한도, 비용/실패/잔고 알림의 부재 자체는 이미 P/G/R/QA/WS 항목에 있으므로 제외한다.

## 신규 발견

### CX1-F1. 분석 시작 이벤트 발행 실패가 성공 응답으로 위장된다

`startAnalysis`는 먼저 `cases.status='running'`과 `last_error` 삭제를 수행한 뒤 `inngest.send({ name: "case/start.analysis" })`를 호출한다. 그런데 send 실패 catch가 `console.warn`만 남기고 계속 진행하며, 함수는 최종적으로 `ok: true`를 반환한다.

- 근거: `src/app/cases/[id]/upload-actions.ts:834-864`
- 영향: Inngest 이벤트가 실제로 큐에 들어가지 않았는데 UI/사용자는 "분석 시작"으로 인식하고, 케이스는 `running`에 남는다. 이 경로는 Inngest 함수의 `onFailure`도 타지 않으므로 phase_runs 실패, Slack 알림, 비용/잔고 분류가 전부 발생하지 않는다.
- 기존 QA F1과 차이: QA F1은 "실행이 끝나거나 실패해도 ready가 됨"이다. 여기서는 "실행 자체가 발행되지 않았는데 running으로 남음"이다.
- 대안: `inngest.send` 실패 시 status를 이전 값으로 되돌리고 `ok:false`를 반환한다. 최소한 `key_stats.last_error`에 `event_dispatch_failed`를 남겨야 한다.

### CX1-F2. 개별 phase 재실행은 후속 의존 phase를 자동으로 무효화하지 않는다

PhaseProgress의 단독 재실행 경로는 `case/phase.requested`를 stage별로 직접 발행하고 즉시 `ok:true`를 반환한다. 이 경로는 `status`를 바꾸지 않고, 의존 후속 phase도 자동 실행하지 않는다.

- 근거: `src/app/cases/[id]/upload-actions.ts:770-792`
- 예: `collect-meta`만 force하면 신규 광고는 적재될 수 있지만 `interpret-tag`의 광고 Vision/UTM, `serve-stats`의 최종 집계는 자동 동반되지 않는다. `interpret-tag`만 force하면 클러스터/sku/serve-stats가 기존 결과를 계속 들고 있을 수 있다.
- 기존 G5/R11과 차이: G5/R11은 "개별 phase 뒤 serve-stats 필요"에 초점이 있다. 여기서는 `collect → interpret → cluster → sku → serve` 전체 의존 DAG가 코드에 없고, 단독 재실행이 구조적으로 stale downstream을 만들 수 있다는 점이다.
- 대안: stage별 downstream map을 명시한다. 단독 재실행 UI는 "이 phase만"과 "의존 후속까지"를 분리하거나, 기본값은 후속 phase 자동 enqueue가 낫다.

### CX1-F3. phase `partial`/`skipped_reason`이 오케스트레이터의 최종 판정에 반영되지 않는다

`interpret-tag`는 잔여 광고/영상 실패가 있으면 phase_runs를 `partial`로 기록한다. 그러나 오케스트레이터는 `step.invoke` 반환값을 검사하지 않고 S3/S4를 계속 진행한 뒤 최종 `ready`로 마킹한다.

- 근거: `src/lib/inngest/functions/phases/interpret-tag.ts`는 partial을 반환하고, `src/lib/inngest/functions/orchestrate-analysis.ts:242-264`는 반환값을 버리며, `src/lib/inngest/functions/orchestrate-analysis.ts:280-298`은 항상 `ready`로 마킹한다.
- 영향: UI가 phase_runs를 직접 보지 않는 한 "부분 성공"이 케이스 레벨에서 보이지 않는다. 특히 비용성 Vision 실패가 downstream cluster/sku 품질 저하로 이어져도 전체 케이스 상태는 정상처럼 보인다.
- 기존 QA F1과 차이: 완결성 게이트 부재의 하위 증상이 아니라, 이미 phase 레벨에 `partial`이라는 더 정교한 상태가 있는데 case 레벨 roll-up에 쓰이지 않는 상태 전파 단절이다.
- 대안: 오케스트레이터가 invoke 결과와 phase_runs 최종 상태를 수집해 `ready_with_partial` 또는 `analysis_state` roll-up을 별도 기록한다. 최소한 `mark-ready` 직전 `failed/partial` phase가 있으면 `key_stats.last_warning`을 유지한다.

### CX1-F4. 비용 가드는 `phase_runs` 조회 실패 시 완전히 fail-open이다

비용 상한 가드는 유료 phase 시작 시 phase_runs의 case/month 합계를 조회한다. 하지만 조회 중 예외가 나면 경고만 남기고 그대로 통과한다.

- 근거: `src/lib/inngest/functions/phases/shared.ts:84-149`
- 영향: phase_runs migration 미적용, RLS/권한 문제, 컬럼명 불일치, 네트워크 오류가 있으면 비용 캡이 비활성화된다. 이 경우 오히려 "가드가 설치되어 있다"는 운영 착시가 생긴다.
- 기존 R/열린항목과 차이: 기존 항목은 비용 상한 가드 부재를 다룬다. 여기서는 가드 추가 후에도 관측 테이블 장애가 곧 비용 무제한 통과로 바뀌는 fail-open 정책의 위험이다.
- 대안: 프로덕션에서는 조회 실패를 `budget_guard_unavailable` 실패로 막고, 로컬/dev에서만 fail-open한다. 또는 최근 phase_runs 합산 실패 시 매우 낮은 emergency cap을 적용한다.

### CX1-F5. Vision dedup 재사용 조회 실패가 조용히 비용 증가로 전환될 수 있다

`fetchReusableVisionTags`는 `case_video_analyses`에서 동일 `tag_input_hash` 결과를 읽어 LLM 호출을 피한다. 그러나 이 조회는 error 필드를 받지 않고 `data ?? []`만 순회한다. 조회 실패 시 reuseMap이 빈 맵이 되어 모든 입력을 새로 태깅한다.

- 근거: `src/lib/inngest/aggregators/phase4b-vision.ts:115-119`, `src/lib/inngest/aggregators/phase4b-vision.ts:340-361`
- 영향: dedup이 비용 절감 장치인데, DB 조회 실패/권한 문제/쿼리 에러가 발생하면 품질 실패가 아니라 추가 과금으로 나타난다. phase 결과에는 "dedup lookup failed"가 남지 않아 비용 증가 원인 추적도 어렵다.
- 기존 R3/P7/WS3와 차이: 기존은 유료 결과 보존과 dedup 부재/도입을 다룬다. 이 항목은 dedup 조회 실패가 hard error가 아니라 silent cost fallback인 점이다.
- 대안: reuse 조회 error를 명시적으로 throw하거나, 최소한 해당 batch를 `partial`로 종료해 재시도하게 한다. 비용 절감용 캐시가 실패하면 새 LLM 호출로 넘어가지 않는 정책이 더 안전하다.

### CX1-F6. 비핵심 sync 실패가 결과 객체에만 남고 운영 신호로 승격되지 않는다

오케스트레이터 말미의 `syncCaseBpBrands` 실패는 `logger.warn` 후 `{ error: true }`를 반환하지만 phase_runs나 case warning에 반영되지 않는다.

- 근거: `src/lib/inngest/functions/orchestrate-analysis.ts:266-278`
- 영향: 이 sync가 "BP 브랜드 이력 → 운영 DB" 연결이라면, 분석은 ready인데 운영/진단 쪽 보조 데이터가 빠지는 비대칭 상태가 생긴다. 지금은 로그를 보지 않으면 누락을 알기 어렵다.
- 중복 여부: 기존 실패 알림 부재는 phase 실패 중심이다. 이 항목은 오케스트레이터 내부 비phase side effect의 silent degradation이다.
- 대안: 비치명적 유지가 맞더라도 `key_stats.warnings[]`나 별도 `integration_runs`에 기록하고 UI/운영 알림에서 "분석은 완료, 운영 sync 실패"로 분리한다.

## 우선순위

1. CX1-F1: 이벤트 발행 실패 성공 위장. 실제 실행 0건인데 사용자는 시작됐다고 믿는다.
2. CX1-F3: partial 상태 roll-up 부재. 이미 있는 상태 정보를 버린다.
3. CX1-F2: 단독 phase 재실행 downstream DAG 부재. 데이터 freshness 사고를 반복시킬 가능성이 높다.
4. CX1-F4/F5: 비용 가드·dedup의 fail-open. 비용 누수 축.
5. CX1-F6: 운영 sync 관측성. 제품 흐름 연결 후 중요도 상승.
