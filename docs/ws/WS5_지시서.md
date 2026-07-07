# WS5 지시서 — E2E 검증 + 구조 청소 + 운영 가드

> 실행 세션용. 시작하면 이 문서와 `docs/BP_재설계_v2.md`(§4 WS5), `docs/spec/README.md` 순서(01→02→06), `docs/ws/DATA_감사_2026-07-07.md`를 먼저 읽을 것.
> **선행 조건: WS4 머지·배포 후 시작** (읽기 경로가 뷰로 전환된 상태에서 청소해야 이중 작업이 없다). WS3은 무관.

## 공통 규칙
- 브랜치 `ws-5-cleanup`에서 작업, 논리 단위 로컬 커밋. **push·배포·Supabase 마이그레이션 적용 금지.**
- 케이스 데이터를 삭제하는 코드 금지. 삭제성 마이그레이션(drop 등)은 R12 준수: dry-run 리포트 + 백업 테이블 생성문 포함, 명시적 대상 목록만.
- 완료 시 `docs/ws/WS5_REPORT.md` 보고서 + 설계 문서 §6 로그 한 줄.

## 작업 항목

### 1. 운영 가드 3종 (spec/06 열린 항목 — 최우선)
- **실패 알림**: phase_runs가 `failed`로 기록될 때 슬랙 웹훅 발송 (케이스명·phase·error 요약·재실행 curl). 웹훅 URL은 env `SLACK_PIPELINE_WEBHOOK` (없으면 조용히 skip — 로컬 개발 배려).
- **비용 가드**: phase 시작 전 `phase_runs.cost_usd` 합산 체크 — 케이스당 상한(기본 $25)·월간 상한(기본 $300, env로 조정) 초과 시 phase를 `failed`(사유: budget_exceeded)로 기록하고 중단. 상한은 app 설정 테이블이 아닌 env 우선 (죽은 app_settings 부활 금지).
- **API 잔고 소진 감지**: Anthropic 400 "credit balance is too low"를 별도 error 코드(`credit_exhausted`)로 분류해 알림 메시지에 명시 (2026-07-07 실제 발생 — 웨이브 8건 연쇄 실패).

### 2. interpret-cluster "validated 0" 잔재 처리 (2026-07-07 발견)
- 현상: Pass 2 검증 0개면 `interpret-cluster.ts` 조기 종료 → run_tag swap 미발생 → 옛 미스정렬 클러스터 잔존 (실측 4케이스: 542e7625·ec60ffba·a6000e91·f724e382).
- 수정: **force 재실행이면서 validated 0인 경우, legacy(run_tag null 또는 이전 tag) 클러스터를 삭제**하고 "클러스터 없음" 상태로 정직하게 비움 (U2: 결론 못 만드는 블록은 "데이터 없음"). force 아닌 자연 실행에서는 현행 유지 (기존 결과 보존).
- ⚠️ 사용자 최종 컨펌 후 반영 — REPORT에 수정 전 dry-run(영향 케이스 목록) 첨부.

### 3. F2 팔로워 공백 — 조건부 enrich (DATA_감사 §2)
- enrich-creators에 조건 추가: fans null인 크리에이터 중 **케이스 내 영상 3개 이상**만 Clockworks/Lemur 조회 (전수 대비 ~10% 비용으로 티어 unknown 대부분 해소).
- enrich-ig-profiles도 동일 조건 (ig_authors followers null × 포스트 3+).
- 기존 캐시와 충돌 없게: 대상 산출 쿼리를 phase 함수 안에서 계산, force 무관 멱등.

### 4. 구조 청소 (migration 020 — R12 준수)
- **죽은 테이블 drop** (01 §3, 전부 0행 실측): sales_monthly, internal_notes, campaign_executions, pipeline_runs, viral_bsr_impacts, viral_clusters, case_rejections, case_video_assets, app_settings, seeding_packages. **promotion_events는 제외** (WS4 완결성 ⑥축이 시드 예정).
- drop 전 각 테이블 `select count(*)` dry-run 결과를 마이그레이션 주석에 박기. 0행 아닌 테이블이 하나라도 있으면 drop에서 제외하고 REPORT에 보고.
- **RLS 정리**: 전 테이블 RLS enable + anon-all 정책 통일 (advisor 경고 소거 — 내부 도구 전제 유지, 01 §3 보안 특이사항).
- **status enum 통일**: `completed` 4케이스 → `ready` UPDATE (게이트는 R8대로 데이터 존재로 판단하므로 안전).
- **bsr 컬럼 이원화 제거** (01 §7-6) + BSR 변곡점 case_insights 이관 (spec/03 A섹션 예고분).
- cases.options 비대 정리: ig_config_suggested·ig_prep_debug 등 디버그 키 제거 스크립트 (백업 후).
- key_stats의 kalodata_*·tt_shop_us_*·phase1_5 원본 스냅샷 → `cases.uploads`로 이전 (01 §5 예고분).

### 5. 조용한 데이터 손실 코드 검증 (spec/06 §열린항목 4)
- `deleteCase`: 삭제 범위 검증 — contents가 brand 공유인데 케이스 삭제 시 지워지는지 코드 추적, 지워지면 fix.
- `uploadBsr`: delete-후-재삽입 패턴이 실패 시 데이터 소실로 이어지는지 검증, 트랜잭션 또는 upsert로 교체.
- 유사 패턴 전수 grep (delete 후 insert하는 업로드 액션 전부) → 표로 REPORT에.

### 6. 도구 위생
- `supabase gen types` 재생성 + package.json 스크립트로 자동화 (migration 017 이후 손 관리 상태).
- scripts/ 안의 일회성 검증 스크립트 정리 (남길 것: verify-*.sql).

### 7. E2E 리포트 (설계 문서 §4 완료 기준)
- ready 케이스 1개 + 신규 소형 케이스 1개로 전체 파이프라인 완주 → **v1 대비 비용·안정성 표** (phase_runs.cost_usd 실측 vs 구 runAnalysis 추정, 실패·재시도 횟수).
- ⚠️ 신규 완주는 Anthropic 크레딧 필요 — 잔고 확인 후. 미충전이면 기존 phase_runs 데이터로 표 작성하고 신규 완주는 보류 표기.

## 완료 기준
- tsc 통과, migration 020 작성(적용은 오케스트레이터), 가드 3종 동작 증빙(웹훅 mock 로그·budget 초과 시뮬레이션).
- REPORT에: drop dry-run 표 · validated-0 영향 케이스 표 · 조용한 손실 패턴 전수 표 · v1 대비 비용표.
