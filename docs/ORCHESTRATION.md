---
status: canonical
owner: tikcle-bp
updated: 2026-07-07
source: ORCH 세션 (멀티 세션 오케스트레이션 관제 문서 — tikcle-core docs/sales/ORCHESTRATION.md 체계 이식)
---

# TikCle BP 오케스트레이션 관제 문서

이 문서 하나로 "누가(어느 세션이) 무엇을 하고 있고, 다음 지시를 어떻게 주는지"를 파악한다.
**분해 → 배차(TODO.md) → 세션 실행 → ORCH 실측 검증 → 머지·기록. DB apply와 위험 작업은 ORCH 게이트.**

## 운영 구조

- **ORCH (오케스트레이터 세션)**: 작업 분해 / TODO.md 배차 / 산출물 직접 검증(build·DB실측) / 머지·기록 / **마이그레이션 apply·배포·삭제·비용성 배치 게이트**. 직접 구현은 소규모·운영 배치(웨이브 트리거)만.
- **상주 세션(워커)**: 역할별 별도 Claude Code 세션, 사용자가 직접 띄우고 대화. TODO.md에서 자기 레인 작업을 잡아 산출물(브랜치 커밋+보고 md)로 제출.
- 프로덕션 Supabase(`dxjodlxkynjirldpumxr`)는 워커 **SELECT만 허용**. write·마이그레이션·Inngest 트리거는 ORCH.
- 설계 정본: `docs/BP_재설계_v2.md` (+ `docs/spec/` 01~06). 규칙: spec/06 R1~R12.

## 상주 세션 체제

| 세션 | 모델 | 역할 |
|---|---|---|
| ORCH | (이 창, Fable) | 배차·검증·머지·apply/배포 게이트·보드 관리·운영 배치 |
| BE | opus | 파이프라인·뷰·마이그레이션 **코드** 전담 (apply는 ORCH) |
| FE | sonnet | 화면/컴포넌트 전담 (DB 변경 금지). **구현 착수 조건 = 프로토타입 확정** — docs/design/PROTOTYPE_PROTOCOL.md 필수 준수, 확정본 1:1 구현(재해석·축소 금지) |
| QA | sonnet | **데이터 대사** — 케이스 샘플링→REST 실경로 추적→원인층(원천/적재/뷰/화면) 판정. 수정 안 함, 보고만 |
| CODEX | codex CLI | **세컨드 오피니언** — 기존 문서·구현과 독립적인 새 관점 분석(아키텍처 재감사·대안 설계·리뷰). 구현 금지, 보고서만. 기존 결론과 중복되는 지적은 제외하고 신규 발견만 |

배차판 = **`TODO.md`** (repo 루트). 세션은 완료 보고, ORCH가 검증·머지·보드 갱신.

## 세션 발사 프롬프트 (사용자용)

새 터미널 → `cd ~/티클/TikCle-BP && claude` → 모델 선택 후:

**BE (루프 모드 — 2026-07-07 개정):**
```
너는 BE 상주 세션이다. docs/ORCHESTRATION.md 와 TODO.md 를 읽어라.
루프 모드로 일한다: TODO.md BE 레인에 미완(⬜/🔴) 작업이 남아있는 한, 우선순위(🔴 먼저)순으로
연속해서 잡아라 — 작업 사이에 사람에게 묻지 마라. 매 작업: git fetch origin && git merge origin/main
→ 구현 → tsc → 로컬 커밋 → TODO.md 해당 행 갱신(🔄/✅+해시) 후 커밋. 반려(🔴 반려)가 있으면 최우선.
레인이 비었다고 판단하기 전에 반드시 `git fetch origin && git show origin/main:TODO.md`로 최신 보드를 재확인하라 (자기 브랜치 보드는 낡을 수 있음 — 2026-07-08 실사고). 그래도 비면 "레인 비었음 — 대기"라고 보고하고 멈춰라.
공통 가드레일 준수: 자기 워크트리, push·배포·마이그레이션 적용·프로덕션 write·유료 API 금지.
```

**QA (루프 모드):**
```
너는 QA 상주 세션이다. docs/ORCHESTRATION.md 와 TODO.md 를 읽어라.
루프 모드: QA 레인의 미완 작업을 연속으로 잡아라. 프로덕션 DB는 SELECT만.
수정하지 말고 원인층 판정 보고서(docs/ws/QA_*.md)로 제출 + TODO.md 갱신. 레인이 비면 대기 보고.
```

**FE (루프 모드):**
```
너는 FE 상주 세션이다. docs/ORCHESTRATION.md 와 TODO.md 를 읽고 FE 레인을 잡아라.
지시서는 docs/ws/WS4_지시서.md (확정판) — 대원칙: 리디자인 금지, 현행 화면에 추가만.
우선순위 A→C→B, 항목 단위 커밋(번호 포함). 자기 워크트리, push·apply·프로덕션 write 금지.
실화면 QA(스크린샷) 없이 완료 보고 금지.
```

**CODEX (루프 모드):**
```
codex 실행 후: 너는 CODEX 상주 세션(세컨드 오피니언)이다. ~/티클/TikCle-BP 의
docs/ORCHESTRATION.md 와 TODO.md 를 읽고 CODEX 레인의 미완 작업을 연속으로 잡아라.
역할은 분석·리뷰·대안 제시 — 구현·수정 금지, 산출물은 docs/ws/CX_*.md 보고서.
기존 문서(BP_재설계_v2의 P/G 목록, spec/06 R규칙, QA 보고서)와 중복되는 지적은 빼고
"새로 발견한 것"만 담아라. 파일 읽기는 자유, 프로덕션 DB는 조회도 하지 마라(레포 코드만).
```

> 워커의 TODO.md 갱신은 자기 브랜치에 커밋 — ORCH가 검증 시 main 보드에 반영한다 (보드 충돌 방지).

## 공통 가드레일 (모든 워커 세션)

- **repo 루트 체크아웃(`~/티클/TikCle-BP`)은 ORCH 전용.** 워커는 자기 워크트리에서만:
  `git -C ~/티클/TikCle-BP worktree add .claude/worktrees/<레인명> -b <브랜치> origin/main`
  (기존 배정 워크트리가 TODO.md에 명시돼 있으면 그걸 사용. 종료·머지 후 정리는 ORCH)
- push·Vercel 배포·Supabase 마이그레이션 적용·`case/*` Inngest 이벤트 발행 금지 (전부 ORCH 게이트)
- 케이스 데이터 삭제 코드 금지. 삭제성 작업은 R12(dry-run+백업+명시 목록) 설계까지만
- 유료 API(Anthropic·Apify) 직접 호출 금지 — 테스트 필요하면 ORCH에 요청
- tsc 통과 없이 완료 보고 금지

## 문서 지도

| 문서 | 용도 |
|---|---|
| `docs/BP_재설계_v2.md` ⭐ | 설계 정본 — 제품 정의(§1.0)·Q1~Q7·문제 P/G·WS 정의·진행 로그(§6) |
| `docs/spec/01~06` | 데이터·파이프라인·화면·아웃풋·프로토콜·재발방지 명세 |
| `TODO.md` | **배차판** — 레인별 작업·상태 |
| `docs/ORCHESTRATION.md` (이 문서) | 세션 관제·가드레일 |
| `docs/BP_로드맵_6개월.md` | 단계 계획 (오늘 스프린트 포함) |
| `docs/ws/파일럿_리프레시_SharkNinja.md` | 파일럿 D1~D5 결정 설계 |
| `docs/ws/*_지시서.md / *_REPORT.md` | 트랙별 지시·보고 |
| `docs/gtm-assets/` | GTM 발행 소재 (tikcle-letter 스킬·플레이북 기획 md) |
