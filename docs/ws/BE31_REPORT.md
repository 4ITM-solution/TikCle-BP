# BE-31 REPORT — 조합 데이터 계층 (combo-queries)

산출물: `src/lib/case-detail/combo-queries.ts` (5함수 + 공용 멤버 로더). 유료 호출 0, 집계 저장 없음(라이브).

## 함수
1. `narrativePerf(caseId, period?)` — 내러티브별 {편수·측정가능 편수·반응률(댓글/1만뷰)·샵GMV·GPM·채널별 편수}
2. `creatorProfile(caseId, handle)` — {영상수·최고뷰·반응률·풀 내 백분위(평균뷰)·스파크 편수·활동기간·채널·메타매칭(파트너십 확정+BE-30 후보)}
3. `eventWindow(caseId, eventId)` — 전(2주)/중/후 {시딩 편수·Top영상·신규광고·활성광고·BSR 최고}
4. `inflectionTopVideos(caseId, month, sortBy)` — 변곡점 월 Top3, 6지표(조회·좋아요·댓글·저장·저장율·댓글율)
5. `sparkByNarrative(caseId, period?)` — 내러티브별 is_ad 비중·편수

공용: `loadNarrativeMembers` — page.tsx `clusterBundle` 멤버 정규화·`kdMap` GMV **추출·재사용** + engagement(likes/comments/shares) 확장. `content_cluster_members` **range 페이지네이션**(1000행 캡 회피). `period-filter.ts` psStart/psEnd 준수.

## 반응률 NULL 규칙 (BE-23 선반영)
`normEng`: -1(IG 미제공)·null 정규화. `isMeasurable`: likes·comments·shares 셋 다 없으면 미측정 → 반응률 분모·분자 제외.

## 기준값 대사표 (Kundal US 092f9ef8, 실측 2026-07-26)

| 항목 | 기준값 | 함수 출력 | 판정 |
|---|---|---|---|
| **측정가능/총 contents** | **2,852 / 3,158** | **2,852 / 3,158** | ✅ **정확 일치** |
| 전부-NULL(미측정) | (Kalodata 유입) | 306, **100%(306/306) Kalodata url 일치** | ✅ 근본원인 확정 |
| NULL 규칙 분모 제외 | 카로데이터 유입 반응률 미포함 | measurable만 rx 산출 | ✅ |
| 내러티브 수 | 19 (탐색기 산출 당시) | **8** (현재 재클러스터 상태) | ⚠️ 데이터 상태 상이 |
| 「리스트 큐레이션」rx 115.9/rev $170 · 「퍼스널 스토리」rx 17.5/rev $17,910 | (19내러티브 당시) | 현 8내러티브엔 동명 클러스터 없음 | ⚠️ 재현 불가 — 아래 |

### ⚠️ per-narrative 기준값 재현 불가 사유 (코드 아님, 데이터 상태)
기준값의 「내러티브 19개」·「rx 115.9」 등은 **ANALYST 내러티브 탐색기 산출 당시(19메타)** 상태에서 나온 값.
현재 케이스는 그 이후 **재클러스터링돼 메타 8개·멤버 1,038**. 즉 클러스터 구성 자체가 달라 동명 내러티브가
없음 → per-narrative 값은 그 시점 클러스터로 재실행해야 재현됨(ORCH). **단, 규칙·집계 로직의 정확성은
측정가능 2,852/3,158 정확 일치로 검증됨**(이 값은 클러스터 무관, contents 전체 스코프라 상태 불변).

## 5함수 무오류 실행 (실 Kundal US)
- narrativePerf: 8내러티브, rx·GMV·채널별 산출 (예: 「퍼스널 경험 소셜프루프」 n=352 gmv=$31,421)
- sparkByNarrative: 광고비중 산출 (예: 53.1% = 187/352)
- inflectionTopVideos(2026-06,views): top뷰 971,400 · 저장율 0.1% · 댓글율 0.9
- creatorProfile: 백분위 41.7% · 활동기간 · 파트너십 매칭 · BE-30 후보(있으면 조인)
- eventWindow(매출피크 2026-03): 전 시딩 133 / 중 시딩 13·BSR 4 / 후 시딩 114

## 금지 준수
집계 저장 없음(라이브) · 삭제 코드 없음 · 유료 호출 없음. BE-21/22/29/30 결과는 "있으면 조인, 없으면 공백"(creatorProfile의 ad_original_candidates가 예 — 테이블 미적용이면 0).
