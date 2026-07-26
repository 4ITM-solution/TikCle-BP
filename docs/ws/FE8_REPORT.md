---
status: in-progress report
lane: FE
task: FE-8 케이스 상세 v12 1:1 구현
updated: 2026-07-26
branch: ws-fe8-case-v12 (워크트리 .claude/worktrees/ws-fe8)
---

# FE-8 진행 보고 — 케이스 상세 v12

> 정본: docs/design/prototype/bp-case-proto-v12.html · 데이터계약: docs/design/프로토_데이터계약.md
> 대원칙 준수: 프로토 재해석·축소 금지, 공백은 계약표 "실패/공백 표시" 그대로. tsc 전 커밋 통과.
> 검증·머지·배포는 ORCH.

## 스테이지 상태

| Stage | 내용 | 상태 | 커밋 | QA |
|---|---|---|---|---|
| 1 | 헤더 5줄→2줄 통합 | ✅ | 6f2e016 | medicube 실화면 — 2줄(다크 스트립+유틸 행), 게이지·dot 행 삭제 확인 |
| 2 | 데이터·분석 콘솔 통합(3겹→1) | ✅ | a26e75a | 콘솔 접힘/펼침, 채널7+11단계 패널 동거, 콘솔 에러 0 |
| 8 | 표준 영상 카드 컴포넌트 | ✅(컴포넌트) | 4d8767b | VideoCard.tsx 생성·tsc. **각 지점 교체는 해당 섹션 스테이지에서** |
| 7 | E Meta 광고 v12 정렬 | ✅ | 7f52b8d | KPI 6열·브릿지 안내·교집합 매칭근거 열. 원본후보 배지=BE-30 없어 미표시(계약 준수) |
| 6 | D 매출·SKU 재구성 | 🔄 part1 | 5a9109e | 통합 표 상시(DOM tableBeforeTabs=true)·v12 탭7(TT샵분해)·ttdecomp panel. medicube 실화면 확인 |
| 3–5 | A / B / C | ⛔ BE-31 대기 | — | combo-queries.ts 선행 필요 |

## 완료 스테이지 상세

### Stage 1 — 헤더 (hdr 1:1)
- `CaseStatusStripMockup`: 채널 dot 행 삭제, country·status·분석일 다크 스트립 인라인, tier/채택배지 텍스트 v12 정렬
- `page.tsx`: 완결성 게이지 행 삭제(채택 배지·툴팁 흡수), 분석기간+최신성+스냅샷을 유틸 행 1개로

### Stage 2 — 콘솔 (dataChannels 1:1)
- `DataChannelsMockup`: 상시 펼침 섹션 → 기본 접힘 `<details>` 콘솔(summary 요약줄) + phaseSlot로 분석단계 접합
- `page.tsx`: 상단 PhaseProgressMockup·PhaseRunsPanel 독립 렌더 + 에러영역 PhaseProgressToggle(3겹) 삭제 → 콘솔 한 곳

### Stage 8 — 표준 영상 카드 (vidCard 1:1)
- `VideoCard.tsx`: 세로 클릭로드 iframe + 6지표(조회·좋아요·댓글·저장·저장율·댓글율), NULL→"—", 율=값/조회

### Stage 7 — E
- KPI grid 5→6열(6번째 카드 orphan 해소), landing 브릿지 안내(BE-21 전 "버튼 확인 전"), 교집합 매칭근거 열(BE-30 전 "2차 가공(후보)")

### Stage 6 part1 — D
- SKU 매출 표: 탭에서 분리 → 통합 표 상시(SKU 필터·채널 토글 위)
- 탭 v12 순서/라벨 7종 + TT샵 분해(ttdecomp) 신설, 기존 'sku' 탭 제거
- ttdecomp: liveVideoStats 라이브/영상/상품카드 GMV 분해 + 크리에이터 포맷

## 잔여 작업

### Stage 6 part2 (D 마무리 — 데이터 리스크로 분리)
- **브랜드 매출 3카드 채널비교**(TT샵/Amazon/합산) top 추가 — 정확한 per-channel GMV 필드 확정 필요(하드코딩 시 $0/NaN 리스크로 보류)
- **VideoCard 영상지점 교체**(hero SKU 대표영상·BSR 변곡점 영상)
- Kalodata 매출 분해 top 블록 → ttdecomp 완전 이관(현재 TT샵+Kalodata 케이스에서 top·tab 중복 소지 — Amazon-only는 무영향)

### Stage 3–5 (A/B/C) — BE-31 `combo-queries.ts` 선행 대기
- A: [월간 트렌드|이벤트 윈도우] 탭·변곡점 표(기간 Top3)·이벤트 등록 폼
- B: 결론+요약 통합·TT샵 흡수·월 select 삭제·크리에이터 드로어(백분위·스파크편수·메타 사용)
- C: 탭 6개(내러티브·키메시지·월별·티어교차·태그×매출·광고집행)·표본 라벨 1곳
- + VideoCard 각 섹션 영상지점 교체(Stage 8 완결)

## 검증 메모
- 실화면 QA: medicube(Amazon US) — 헤더 2줄·콘솔 통합·D 통합표/탭7종·G 크로스채널 정상, 콘솔 에러 0
- 페이지는 window가 아닌 `.overflow-y-auto` 컨테이너 스크롤 — QA 시 scrollIntoView/컨테이너 scrollTop 사용
- TT샵 있는 케이스(Foodology) 전면 재QA는 Stage 6 part2 후 + BE-31 후 QA-4에서

## 커밋 (ws-fe8-case-v12)
S1 6f2e016 · S2 a26e75a · S8 4d8767b · S7 7f52b8d · S6p1 5a9109e

---

## A/B/C 구현 (2026-07-26 저녁, BE-31 완료 후)

BE-31 combo-queries.ts(narrativePerf·sparkByNarrative·inflectionTopVideos·creatorProfile·eventWindow) 완료로 Stage 3~5 착수·구현.

| Stage | 내용 | 커밋 | 검증 |
|---|---|---|---|
| 3(A) p1 | 이벤트 윈도우 탭 (eventWindow 전/중/후 프리페치) + EventWindowPanel | 37a6176 | tsc |
| 3(A) p2 | 변곡점 표(행 클릭→기간 대표영상, inflectionTopVideos 온디맨드) + InflectionTable + VideoCard | 8472d5a | tsc |
| 4(B) | 크리에이터 드로어(creatorProfile: 백분위·스파크편수·메타사용) + CreatorDrawer | fe46edf | tsc |
| 5(C) | 내러티브 성과 탭(narrativePerf+sparkByNarrative: 반응률·GPM·GMV·광고집행 병치) | 6a91928 | tsc |

- combo-actions.ts: fetchInflectionVideos·fetchCreatorProfile 서버 액션(온디맨드)
- 신규 컴포넌트: EventWindowPanel·InflectionTable·CreatorDrawer (모두 VideoCard/BE-31 타입 재사용)
- 전 커밋 tsc 통과. medicube SSR 200 · combo-query 서버콜 런타임 에러 0 확인.

### A/B/C 잔여 (폴리시/BE 대기)
- 키 메시지 탭(C): BE-22 미완 → 보류
- A 차트 실측 스케일 미세조정, B 월 select 삭제·명단 10/50 정밀화: 폴리시
- **실화면 클릭 QA(이벤트 탭 토글·변곡점 행 확장·드로어·내러티브 탭)**: 브라우저 확장 연결 끊겨 이번엔 tsc+SSR까지만. QA-4에서 blockwise 대사

### 커밋
S3(A) 37a6176·8472d5a · S4(B) fe46edf · S5(C) 6a91928

### A/B/C 실화면 QA (medicube US, 2026-07-26 브라우저 재연결 후)
- **A**: KPI 2개(광고 집행 비중/광고 미집행, ORGANIC·GIFTED 제거 확인) · 이벤트 윈도우 탭(미등록 빈 상태 정상) · 변곡점 표 5행, 1행 확장→VideoCard 3개(조회 2.8M·좋아요 47K·댓글 769·저장 —·댓글율 0.03%, NULL "—" 정상) ✓
- **B**: 👤 클릭→크리에이터 드로어(백분위·반응률·스파크 편수·메타 사용 파트너십/원본후보) ✓
- **C**: 내러티브 성과 탭 35 클러스터 — 반응률·GPM·매출·광고집행(spark join)·채널 병치, 측정불가/무GMV는 "—" ✓
- 콘솔 에러 0 · A KPI QA fix(010763a)
