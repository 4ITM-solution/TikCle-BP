# WS6 지시서 — L3 합성: 케이스 선별·정규화·core_factor·플레이북 (계약 v2의 Q0·Q6·Q7·Q8 구현)

> 설계 확정: ORCH(Fable, 2026-07-07). 실행 세션은 이 문서 + `BP_재설계_v2.md` §1(계약 v2)·§1.0.2(완결성 6축) + `docs/ws/QA_파일럿_매트릭스.md`(실측 기반)를 읽고 시작.
> 선행: FE-1(WS4b) 머지 후 권장 — 단 §1·§2(뷰·필드)는 독립이라 먼저 착수 가능.
> 공통 가드레일: ORCHESTRATION.md 그대로 (자기 워크트리·apply/push 금지).

## 이 WS가 답하게 만드는 질문
- **Q0** 이 케이스는 어느 필터에서 채택/보류/폐기인가 → §2
- **Q6** 최소 성공 조건(core_factor)은 무엇인가 → §3
- **Q7** 같은 필터의 대표 케이스 top N은 → §4
- **Q8** 이 답은 얼마나 최신인가 → §5
- L3: "폴란드에서 성과 내는 핵심은?" → §6

## §1. 완결성 점수 뷰 `v_case_completeness` (migration 022)

6축 각각을 **데이터 존재 SQL로 0/0.5/1 판정** (R8: enum이 아니라 데이터로):
| 축 | 1.0 | 0.5 | 0 |
|---|---|---|---|
| ①규모 | contents(브랜드+국가) ≥300 | ≥30 | 미만 |
| ②구성 | v_case_tier_dist에 unknown 제외 티어 ≥3종 | ≥1종 | 없음 |
| ③콘텐츠 | content_clusters ≥3 && vision 태깅 ≥100 | 클러스터만 | 없음 |
| ④성과 | sales_snapshot ≥90행 or kalodata 영상GMV ≥50건 | 매출행 존재 | 없음 |
| ⑤광고접합 | meta_ads ≥20 && ad_intel 태깅 ≥50% | meta_ads 존재 | 없음 |
| ⑥시점 | promotion_events에 케이스 기간 겹침 이벤트 존재 | (글로벌 캘린더만) | 캘린더 없음 |
- 출력: 축별 점수 + `completeness_score`(합/6) + 근거 카운트 컬럼들.
- ⚠️ 임계값은 파일럿 실측(QA_파일럿_매트릭스 §3) 기준 초안 — REPORT에 "케이스 분포 히스토그램"을 첨부해 ORCH가 조정.
- promotion_events 시드 동반: 미국 프라임데이·블프·연말 등 2025~2026 메가 이벤트 ~20행 (마이그레이션에 INSERT — 사실 확인 필수, 추정 금지).

## §2. Q0 채택 판정 — `case_adoption(case_id, filter)` 판정 함수 (뷰 아님, 서버 함수)

입력: country·channel·budget_band(수동 필드 §3-2)·stage. 출력: `adopt | hold | reject` + 사유 배열.
- adopt: 필터 일치 && completeness_score ≥ 0.7 && core_factor 존재(자동값 포함) && freshness ok(§5)
- hold: 필터 일치 && (score 0.4~0.7 or stale)
- reject: 필터 불일치 or score <0.4 or 빈 케이스(data_ready)
- 사유는 사용자 언어로 ("성과 축 데이터 없음 — Keepa 업로드 필요") — U2/U3 원칙.

## §3. Q6 core_factor

1. `cases.core_factor text` + `core_factor_confirmed_at timestamptz` + `core_factor_candidates jsonb` (migration 022).
2. **자동 생성이 기본** (2026-07-08 사용자 확정 — 사람 개입 불필요): serve-stats 완료 시 core_factor 후보가 없으면 자동 생성(Sonnet 1콜, ~$0.02). 화면에는 "AI 판정" 라벨로 상시 표시. **사람 확정은 WS8(진단-매칭 상품)에 그 케이스가 쓰일 때만** 요구 — 고객에게 나가는 가능/불가 판정의 근거가 될 때만 사인. Q0 게이트도 자동값으로 통과 가능(미확정은 감점 없음, "AI 판정" 라벨만).
3. 초안 프롬프트 입력: Q1~Q5 결과 요약(뷰에서 수치 주입 — LLM이 수치 생성 금지) + BSR 변곡·클러스터 상위. 출력: `core_factor_candidate`·`must_have[]`·`not_transferable[]` (CX-2 F4 스키마).
4. 확정 UI: 후보 표시 → 사람이 수정·확정 → confirmed_at 기록. 미확정이면 Q0에서 hold.

## §4. Q7 대표 케이스 top-N — `v_case_ranking`

같은 (country×channel) 그룹 내 랭킹. 점수 = completeness 0.5 + 성과관측성 0.3(④축 점수) + core_factor 확정 0.2. 동률은 최신 리프레시순. compare 페이지 상단 "이 필터의 대표 케이스" 블록 + 순위 사유 표시(왜 이 순서인지 — CX-2 F2).

## §5. Q8 freshness — `v_case_freshness`

source별 최신성: contents max(created_at)·meta_ads max(created_at)·sales_snapshot max(collected_at)·kalodata(uploads 타임스탬프)·vision 태깅 max. D3 확정 주기 대비 경과율로 배지: `fresh`(주기 내)/`aging`(1~2배)/`stale`(2배+). 케이스 헤더와 브리프(WS7)에 노출 — "광고 데이터 3주 경과 — 주간 주기 초과" 식 문장.

## §6. 정규화 축 + 첫 플레이북

1. compare 페이지에 정규화 축 4종: **진입 N개월차**(케이스 최초 콘텐츠 월 = M0), **예산 티어**(§3-2 수동 필드), **티어 믹스**(v_case_tier_dist 비율), **앵글 시퀀스**(클러스터 등장 순서 by 월).
2. `cases.budget_band text` 수동 필드 (마이그레이션 — QA-2가 revenue_tier 전부 null 확인했으므로 실사용 필드 신설, 목록 화면 필터와 연결).
3. 첫 플레이북: **미국 아마존 케이스 2개+**(닥터리쥬올 포함)를 M0 정렬로 겹쳐 "N개월차에 무엇을" 표 + 공통 패턴 서술 초안(LLM — 수치는 뷰 주입). 산출물 `docs/playbooks/US_amazon_v0.md`.

## 완료 기준
- migration 022 작성(적용은 ORCH) + 뷰 3종 + 판정 함수 + core_factor UI + compare 정규화 축.
- Q0·Q6·Q7·Q8 각각 "어느 화면 어디서 답이 보이나" 표.
- 첫 플레이북 초안 1건 + 지역 질문("미국 아마존 진입 핵심?") 답변 데모 1건.
- 실화면 QA 스크린샷 (WS4a 완료 기준과 동일 규칙 — diff만으로 완료 처리 금지).
