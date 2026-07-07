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

**재작업(반려 대응, 2e7f0de)**: 실검증(542e7625)에서 `case_video_analyses_pass3_meta_id_fkey`
위반. `clearCaseClusters`가 content_clusters를 지우기 전에 `resetPassLabels`로
pass3_meta_id(FK 참조)를 먼저 null 처리하도록 순서 재배치. tsc 통과.

---

## BE-5 — interpret-cluster step 출력 상한 초과 fix ✅

근거: 케이스 3be66bbd `interpret-cluster` phase_runs error "step output size is greater than
the limit"(Inngest step output 캡 >4MB) 실측.

### 진단 (ORCH 추정과 다름 — pass1 아님)
SELECT 실측:
- `fetch-inputs` 반환(videos 163개, 전부 TikTok, vision_tags 포함) = **84KB** → 상한과 무관.
- 단일 pass1 스텝(163<400) → 후보 페이로드도 소형.
- **진짜 원인**: `read-key-stats` 스텝이 `readKeyStats`(= key_stats 전체)를 반환. 3be66bbd의
  key_stats는 **6.96MB**:

  | 키 | 크기 |
  |---|---|
  | kalodata_creators_xlsx | 3.97 MB |
  | kalodata_videos_xlsx | 2.65 MB |
  | tt_shop_us_affiliates | 169 KB |
  | phase4b_sample | 48 KB |
  | phase4b_sku | 40 KB |
  | (나머지) | ~0.1 MB |

  → 스텝 출력 6.96MB > 4MB 상한에서 opcode validation 실패.

### 수정
- interpret-cluster의 `read-key-stats` 스텝을 **필요 필드(phase4b_clusters)만 반환**하도록 슬림화
  (6.96MB → ~4KB). 반환 페이로드 크기를 `logger.info`로 기록(완료 기준).
- **동일 패턴 7개 phase 확장**(같은 결함): 각자 캐시 판정에 쓰는 단일 필드만 반환.
  | phase | 반환 필드 |
  |---|---|
  | interpret-asr | phase4b_asr |
  | interpret-sku | phase4b_sku |
  | interpret-tag | phase4b_vision |
  | collect-meta | phase4a |
  | collect-ttshop | phase1_5 |
  | collect-ig | phase4c |
  | collect-yt | phase4d |
  - 각 phase는 `existing.<단일필드>`만 소비함을 grep으로 확인(wholesale 사용 없음) → 무해.

### 근본 원인 (별건, WS5 §4 / migration 020)
key_stats에 `kalodata_*_xlsx`·`tt_shop_us_*` 원본 스냅샷이 적재되어 6.9MB로 비대. 이를
`cases.uploads`로 이전하면 read-key-stats 슬림화 없이도 해소됨. 본 fix는 즉시 방어(모든 phase),
비대 청소는 020에서.

tsc: ✅ 통과. 3be66bbd 실검증(force 재실행)은 ORCH.

변경 파일: `interpret-cluster.ts`(+로그) · `interpret-asr/sku/tag.ts` · `collect-meta/ttshop/ig/yt.ts`.

---

## BE-6 — 영상 태깅 재현성 fix ✅ (코드 / 재게이트 실측은 ORCH)

근거: 게이트 실측(2026-07-07) Sonnet 자기일치 56%, cta_type 27%. WS9 §3.6 연계. Haiku 재도전의 선결.

### 원인
`vision-tagger.ts` SYSTEM_PROMPT가 라벨을 느슨하게 정의("pick from these **or similar** tokens"),
다중 후보 시 tie-break 부재 → 같은 영상도 실행마다 다른 값. 특히:
- **cta_type(27%)**: 한 영상에 CTA 여러 개(follow+shop+save)일 때 매번 다른 것 선택, "or similar"로 자유토큰.
- **purchase_intent**: high/mid 경계 모호.
- **products_visible**: 자유 명사구("blue serum bottle" vs "serum") → 표현 흔들림.

### 수정 (프롬프트 결정성 + 코드 정규화)
1. 프롬프트 전면 개정:
   - 모든 라벨 CLOSED enum, "or similar"·자유토큰 금지. vibe 금지, evidence-only.
   - 단일 선택(content_angle·body_format·visual_style): **EXACTLY ONE, dominant, tie-break=목록 EARLIEST**.
   - hook_tags: 목록 내에서만, 0-3개 강한 순, 없으면 [].
   - **cta_type**: explicit CTA만(암시 금지), 여러 개면 우선순위 `shop_link > save > follow > tag_friend > share > comment > watch_more`, 없으면 null.
   - **purchase_intent**: 조건 충족 최상위 티어(high=쇼핑 푸시/가격·할인·긴급, mid=시연·리뷰 무푸시, low=부수적·무제품).
   - **products_visible**: 제네릭 카테고리 명사만(브랜드·색·포장어 금지), 소문자·단수, 중복제거, max 3, 두드러진 순.
2. 코드 정규화(모델 표면 흔들림 제거): `normalizeCta`(소문자·트림·null표기 처리), `normalizeProducts`(소문자·트림·공백정규화·중복제거·max3).
3. 게이트에 **자기일치 모드** 추가: `--self`면 baseline 대신 같은 모델로 **2회 재태깅→run1 vs run2** 비교. `npm run gate:self`(= `BP_TAGGING_MODEL=claude-sonnet-4-6 … --self`).

변경 파일: `src/lib/anthropic/vision-tagger.ts`, `scripts/gate-tagging-model.ts`, `package.json`.

### 재게이트 (ORCH — 유료 Anthropic API, 워커 직접 호출 금지)
```
npm run gate:self -- --videos 40     # Sonnet run1 vs run2 자기일치, 목표 필드별·종합 ≥85%
```
- 표본 40건 × 2콜 = ~80 vision 호출(캡 $1). cta_type·purchase_intent·products_visible 개선 확인.
- ≥85% 미달 필드가 남으면 해당 라벨 정의 추가 조임 → 재게이트 반복.
- 통과 시 WS9 §3.6 Haiku 재도전(동일 프롬프트로 Sonnet baseline vs Haiku) 진행.

tsc: ✅ 통과.
