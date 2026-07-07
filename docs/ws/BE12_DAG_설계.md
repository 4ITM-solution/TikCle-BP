---
status: approved-design
owner: ORCH (Fable, 2026-07-07) — 구현은 BE-12
---

# BE-12 — phase 의존 DAG 설계 (ORCH 승인 확정본)

> CX1-F2: 단독 phase 재실행이 downstream을 자동 무효화하지 않아 stale 데이터가 남는 문제.
> 이 문서가 "어디까지 자동 동반하는가"의 확정 답이다. BE는 이대로 구현만 하면 된다.

## 확정 DAG

```
collect-ttshop ──┐
collect-meta ────┤→ interpret-tag ─→ interpret-cluster ─→ interpret-sku ─→ serve-stats
collect-ig ──────┤   (meta 광고분)
collect-yt ──────┘   (cluster는 IG/YT 캡션도 입력)
enrich-creators ───────────────────────(티어만 — 해석 무관)──────────────→ serve-stats
enrich-ig-profiles ────────────────────(동일)────────────────────────────→ serve-stats
```

downstream 매핑 (코드 상수로):
| 재실행 phase | 자동 동반 (순차) |
|---|---|
| collect-ttshop | interpret-sku → serve-stats |
| collect-meta | interpret-tag(광고분, no-force=null만) → serve-stats |
| collect-ig / collect-yt | interpret-cluster(force) → interpret-sku(force) → serve-stats |
| enrich-creators / enrich-ig-profiles | serve-stats |
| interpret-asr | interpret-tag(no-force) → interpret-cluster(force) → interpret-sku(force) → serve-stats |
| interpret-tag | interpret-cluster(force) → interpret-sku(force) → serve-stats |
| interpret-cluster | interpret-sku(force) → serve-stats |
| interpret-sku | serve-stats |
| serve-stats | — |

## 설계 결정 (근거 포함)

1. **기본값 = 동반 실행.** `case/phase.requested`에 `cascade?: boolean` 추가, **기본 true**. UI 재실행 버튼은 그대로 두되 서버가 downstream을 자동 enqueue. "이 phase만" 필요(디버그)할 때만 `cascade:false`. 근거: R11 위반이 반복 실사고(오늘만 2회 소급 조치) — 안전한 쪽이 기본값이어야 함.
2. **동반 시 force 규칙은 표의 괄호대로.** tag는 no-force(멱등 — null만 채움, 재과금 방지 R3/R4), cluster·sku는 force(입력이 바뀌었으므로 재계산이 목적), serve-stats는 항상 fresh라 무관.
3. **구현 위치 = shared.ts에 `PHASE_DOWNSTREAM` 상수 + 각 phase 함수 말미 공통 헬퍼** `enqueueDownstream(phase, case_id, cascade)`. orchestrator 경유가 아니라 phase 함수가 자기 완료 시 다음 이벤트를 발행 (orchestrator는 전체 분석 전용 유지 — 이중 구현 금지).
4. **budget 가드와 상호작용**: cascade로 발행된 phase도 assertBudget을 그대로 탄다 — 캡 초과 시 거기서 멈추는 게 정상 동작.
5. **부분 실패**: 동반 체인 중 하나가 실패하면 그 지점에서 멈춤(기존 onFailure 경로) — 이후 재실행 시 같은 지점부터 cascade 재개.
6. **spec/02 갱신 동반**: §3 계약표에 downstream 열 추가, §7 체크리스트에 "PHASE_DOWNSTREAM 등록" 항목 추가.

## 완료 기준
tsc + 소형 케이스 1개로 `interpret-tag force+cascade` 발사 → phase_runs에 tag→cluster→sku→serve-stats 4개가 순차 completed 찍히는 것 (검증은 ORCH).
