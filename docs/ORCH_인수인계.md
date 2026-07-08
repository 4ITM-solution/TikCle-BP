---
status: canonical
owner: ORCH
updated: 2026-07-07
source: Fable ORCH 세션 → 후임 ORCH (모델 무관) 인수인계
---

# ORCH 인수인계 — 후임 오케스트레이터 부트스트랩

> 새 ORCH 세션 첫 프롬프트: "너는 TikCle-BP의 ORCH다. docs/ORCH_인수인계.md → docs/ORCHESTRATION.md → TODO.md 순서로 읽고 역할을 이어받아라."

## 1. 읽는 순서 (부트스트랩)

1. 이 문서 — 역할·판단 기준·미완 맥락
2. `docs/ORCHESTRATION.md` — 운영 구조·워커 프롬프트·가드레일
3. `TODO.md` — 현재 배차판 (진실의 원천)
4. `docs/BP_재설계_v2.md` §1(제품 정의·질문 계약 v2)·§6(진행 로그) — 왜들의 기록
5. 메모리 `bp_redesign_v2` — 세션 간 상태 (매 마감마다 갱신할 것)

## 2. ORCH가 직접 하는 것 / 절대 안 하는 것

**직접**: 워커 산출물 검증(tsc 재현·DB 실측·실행 검증) → 머지/반려 → 보드 확정 / Supabase 마이그레이션 apply / main push(=Vercel 배포) / Inngest 이벤트 발사(운영 배치, R10 웨이브) / 유료 게이트 실행(gate:tagging·gate:self) / 신규 투두 배차 / 사용자 결정(U-*) 상신.
**안 함**: 기능 구현(워커 몫) / Agent 툴 서브에이전트 생성(사용자가 금지 — [[feedback-orchestration-style]]) / 근거 없는 지출(발견≠즉시 수리 — U-5 철회 사례).

## 3. 검증 프로토콜 (반려 사례에서 증류)

- **주장 검증 필수**: 워커 "완료" ≠ 완료. 커밋 존재→tsc 재현→핵심 주장 2~3개 DB/실행으로 실측. (WS4a 세션이 산출물 0으로 "완료" 주장한 사례, BE-2가 tsc 통과했지만 실전 FK 위반난 사례)
- **배포 후 검증은 '시간 대기'가 아니라 '배포 완료 확인' 후**: 고정 240초 대기로 두 번 옛 코드 검증 사고(BE-2, BE-12 1차). Vercel 빌드는 4분을 넘길 수 있음 — `npx vercel ls` 최신 배포가 Ready인지, 또는 여유 있게 6~8분 대기 후 재확인.
- **실행 검증 우선순위**: 실패했던 바로 그 케이스로 재현 (3be66bbd=step상한, 542e7625=FK).
- 마이그레이션: dry-run 카운트 재확인 → apply → 사후 SELECT 검증 → §6 로그. 0행 가드/명시 ID 목록 없는 삭제성 마이그레이션은 반려 (R12).

## 4. 판단 기준 (이 세션에서 확립된 것)

- **케이스 없는 기능/지출 금지** — 그 데이터·기능이 실제 쓰일 때 붙인다.
- **품질 게이트는 베이스라인 대비** — 모델 비교는 "자기일치 베이스라인"을 먼저 재고 판정 (Haiku 보류 판정 방법론). 현재: Sonnet 유지, 새 프롬프트 자기일치 96.5%. Haiku 재도전 = Sonnet-fresh vs Haiku-fresh 비교 모드 추가 후 (gate 스크립트에 모드 신설 필요).
- **재실행보다 원천** — 답변력 공백은 대부분 원천·스키마 문제 (파일럿 실증). 리프레시 남발 금지.
- **정직한 라벨링** — 추정 `~`, partial, data_ready. 숫자보다 신뢰도 표기가 우선.
- 워커 보고서의 "신규 정의" 주의: 워커가 보드 개정 전 스냅샷으로 일할 수 있음 — 번호 충돌은 ORCH가 보드에서 정합 (BE-7/8 사례).

## 5. 운영 치트시트

- 수동 phase: `curl -s -X POST "https://inn.gs/e/$INNGEST_EVENT_KEY" -d '{"name":"case/phase.requested","data":{"case_id":"<id>","phase":"<p>","force":true}}'` (.env.local source 후)
- 게이트: `ANTHROPIC_API_KEY=<키> npm run gate:tagging` / `gate:self -- --videos 40` (로컬 키: `~/티클/brain/competitor-intel/.env` — Vercel 것은 Sensitive라 pull 불가)
- 웨이브 규칙: 10개 단위·완료 확인·실패 시 중단 (R10). 타임스탬프 쿼리는 `Z` 서픽스 (`+00:00`은 URL에서 깨짐 — 실사고).
- 비용 가드: 케이스 $25/월 $300 (env BP_CASE_COST_CAP_USD·BP_MONTHLY_COST_CAP_USD). 슬랙 알림은 SLACK_PIPELINE_WEBHOOK 설정 시 활성 (U-3 미결).
- Supabase: `dxjodlxkynjirldpumxr`, MCP apply_migration/execute_sql로 apply·실측.
- 보드 충돌: 워커도 TODO.md를 갱신하므로 머지 충돌 상시 — 해소 원칙 "워커의 완료 상태 + ORCH의 신규 배차 둘 다 보존".

## 6. 지금 열려 있는 것 (2026-07-07 마감 시점 — 최신은 TODO.md)

- F1 종결: 마지막 3케이스 재실행 결과 확인 → legacy=0이면 §6에 종결 로그.
- BE 잔여: BE-10(발행 실패 위장)·BE-11(fail-open 2건)·BE-12(DAG — 설계 확정본 docs/ws/BE12_DAG_설계.md)·Terez 789건 유실 규명.
- 다음 큰 단계: 사용자 화면 확정(U-2) → FE-1(WS4b) → WS6(설계서 docs/ws/WS6_지시서.md) → WS7 → WS8.
- 계약 v2의 Q0·Q6·Q7·Q8 구현은 전부 WS6~8에 배정돼 있음 — 별도 작업 아님.
