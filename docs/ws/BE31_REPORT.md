# BE-31 REPORT — 조합 데이터 계층 (combo-queries)

산출물: `src/lib/case-detail/combo-queries.ts` (5함수 + 공용 멤버 로더). 유료 호출 0, 집계 저장 없음(라이브).

## 게이트 반려(2026-07-26) 대응 — 정정 완료
반려 사유: (1) REPORT의 "재클러스터링돼 기준 내러티브 소멸" 주장은 **사실 아님** — 같은 run_tag(80a29967)에
**L1층 19개(is_meta=false) + 메타층 8개(is_meta=true) 공존**. (2) 기준값(rx/rev)은 **L1층 산출값**인데
초판은 메타층(8개)으로 집계했음.

**수정 3종 반영:**
1. `narrativePerf`·`sparkByNarrative`에 `clusterLevel` 옵션(`'l1'`|`'meta'`, **기본 `'l1'`**).
2. 클러스터 로딩을 `content_clusters` DB authoritative(ORCH SQL 기준)로 전환 — L1 19개가 기준 단위.
3. 메타층은 `clusterLevel:'meta'` 롤업 뷰로 유지(8행).
4. **반응률 공식 확정**: TK 영상별 `(댓글/뷰×1만)`의 **평균**(IG 고뷰·저댓글이라 집계 희석 → TK-only).

## 함수
1. `narrativePerf(caseId, {period?, clusterLevel?})` — {편수·측정가능 편수·반응률·샵GMV·GPM·채널별 편수}
2. `creatorProfile(caseId, handle)` — {영상수·최고뷰·반응률·풀 내 백분위·스파크 편수·활동기간·채널·메타매칭(파트너십 확정+BE-30 후보)}
3. `eventWindow(caseId, eventId)` — 전(2주)/중/후 {시딩·Top영상·신규광고·활성광고·BSR 최고}
4. `inflectionTopVideos(caseId, month, sortBy)` — 변곡점 월 Top3, 6지표
5. `sparkByNarrative(caseId, {period?, clusterLevel?})` — 내러티브별 is_ad 비중·편수

공용 `loadNarrativeMembers`: page.tsx `clusterBundle`·`kdMap` 추출·재사용 + engagement(likes/comments/shares)
확장 + `content_cluster_members` range 페이지네이션(1000행 캡 회피). 멤버는 L1·메타 identity 동시 보유.

## 반응률 NULL 규칙 (BE-23 선반영)
`normEng`: -1(IG 미제공)·null 정규화. `isMeasurable`: likes·comments·shares 셋 다 없으면 미측정.

## 기준값 대사표 (Kundal US 092f9ef8, L1층, 실측 2026-07-26)

| 항목 | 기준값 | 함수 출력(L1) | 판정 |
|---|---|---|---|
| L1 내러티브 수 | 19 | **19** | ✅ |
| 「리스트·큐레이션 저장 유도형」 편수 | 84 | **84** | ✅ |
| — 반응률(rx) | **115.9** | **115.9** | ✅ **정확 일치** |
| — 샵GMV | **$170** | **$170** | ✅ **정확 일치** |
| 「퍼스널 스토리 토킹헤드 UGC 리뷰형」 편수 | 199 | **199** | ✅ |
| — 반응률(rx) | **17.5** | **17.4** | ✅ (반올림 0.1) |
| — 샵GMV | **$17,910** | **$17,910** | ✅ **정확 일치** |
| 측정가능/총 contents(케이스 스코프) | 2,852 / 3,158 | 2,852 / 3,158 | ✅ (전부-NULL 306=100% Kalodata) |

**반응률 = TK 영상별 (댓글/뷰×1만) 평균.** 리스트=115.9(정확)·퍼스널=17.4(기준 17.5, 중간 반올림 0.1 차).

## 5함수 무오류 실행 (실 Kundal US)
narrativePerf(L1 19행)·sparkByNarrative(L1)·inflectionTopVideos(6지표)·creatorProfile(백분위·파트너십·BE-30 후보)·eventWindow(전/중/후 시딩·광고·BSR) 전부 무오류.

## 금지 준수
집계 저장 없음(라이브) · 삭제 코드 없음 · 유료 호출 없음. BE-21/22/29/30 결과는 "있으면 조인, 없으면 공백".
