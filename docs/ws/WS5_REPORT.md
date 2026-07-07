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
