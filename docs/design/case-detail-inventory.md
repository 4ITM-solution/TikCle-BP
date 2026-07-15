---
status: inventory
source: src/app/cases/[id]/page.tsx (3,649줄) + src/components/case-detail/mockup/ 7파일 (6,093줄) 전체 정독
updated: 2026-07-11
---

# 케이스 상세 블록 인벤토리 — 배포판 코드 기준

표기: 순서는 실제 렌더 순서(status=ready 경로). "왜"는 코드 주석·커밋 흔적에서 읽은 배치 이유.

## 0. 페이지 골격 (page.tsx)

| # | 블록 | 형태 | 데이터 | 조건부 렌더 | 왜 이렇게 |
|---|------|------|--------|------------|-----------|
| 0-1 | CaseStatusStripMockup | 다크(#1f2937) sticky strip | brand, adoption 배지(A5: verdict·filledCount/total), revenue_tier ★, 7채널 dot(적재여부)+count, analyzedAt, 우측 actions(CaseHeader actionsOnly) | 항상 | 옛 CaseHeaderMockup을 흡수 — 브랜드·채널 적재 상태·액션을 최상단 한 줄로. 스크롤 중에도 케이스 정체성 유지 |
| 0-2 | CompletenessGauge | 게이지 | computeCompleteness(keyStats, {status, salesExists, hasPromotions}) — 6축 + 커머스/모니터링 ready | 항상 | ★B1(WS4b) Q0 채택판정 — "이 케이스 믿고 쓸 수 있나"를 헤더에서 즉답 |
| 0-3 | 데이터 최신성 배지 행 | FreshnessBadge 나열 + 우측 "🗄 캐시 스냅샷 · 분석일" | dataRanges(TikTok/광고/IG/YT max date) → daysSince | dataRanges에 max 있는 소스 1개 이상 | ★B4+B5(WS4b) — 수치가 분석 시점 스냅샷임을 상시 고지 (신뢰 신호) |
| 0-4 | breadcrumb | nav | Browse / brand(링크) / country·channel | 항상 | 브랜드 페이지 왕복 동선 |
| 0-5 | CaseSideTOC | 좌측 180px 고정 컬럼 | 섹션 앵커(#sec-kpi/#sec-g/#sec-a…#sec-dev) | 항상 (grid 좌측) | 페이지가 길어서(A~E+G) 점프 내비 필수 |
| 0-6 | **draft 분기**: IntakeWizard → DataChannelGrid → StartAnalysisButton | 체크리스트 + 7채널 카드(클릭=입력UI 펼침) + 시작버튼 | buildIntakeChecklist(channel×country 재료), 채널별 업로드 컴포넌트(Exolyt/Amazon/BSR/Shopdora/TTShop 설정+Helium+Affiliate+Kalodata/Meta설정/IG설정/YT설정) | status==="draft" | ★C4 — 채널 gating 제거, "원하는 채널 카드만 눌러 적재"가 유일한 입력구. 시작가능 판정 = (exolyt+sales) OR owned채널(IG/YT/Meta) |
| 0-7 | **running 분기**: AutoRefresh(5s) + 진행중 배너 | 배너 | status | draft·ready 외 | 분석 중 자동 갱신 |
| 0-8 | lastError 배너 | 빨간 박스 | key_stats.last_error{message, at} | ready && last_error | 실패를 숨기지 않고 재실행 경로 안내 |
| 0-9 | PhaseProgressToggle | 토글 | case_id, keyStats | ready | 구 phase 재실행 UI (mockup 밖 컴포넌트) |
| 0-10 | KpiStripMockup | 6 KPI strip | 총영상(TK+IG+YT 합산+breakdown) / 총인플풀(합산) / 총view(top_creators max_views 합=근사) / TT Shop GMV 30d(+prev 대비 ▲▼) / Meta광고(brand·partner) / 분석비용 | ready (phase2 없어도) | 페이지 첫 화면에서 케이스 규모 즉답. view는 "top creator 합산 추정" 정직 라벨 |
| 0-11 | PhaseProgressMockup | details 접힘 + phase별 ↻ 버튼 | PHASES × isPhaseDone(ks), detailForPhase(phase별 수치), startAnalysis(case_id,[phase],{skipAutoForce}) | ready | KPI 바로 다음 (사용자 요청으로 이동). cache cascade — 개별 phase만 유료 재실행 |
| 0-12 | PhaseRunsPanel | 패널 | phase_runs 테이블(phase,status,cost_usd,error,stats,finished_at) | ready | ★C5 — 신 11-phase 상태·비용·partial 직결 |
| 0-13 | DataChannelsMockup | 7채널 카드 grid + accordion | dataChannels(자동 detect: phase 결과 or 설정 or products), channelDetails(stat+수집기간 📅), channelEntries(채널별 업로드/설정 컴포넌트) | ready | ready 후에도 데이터 추가 가능해야 — 카드 클릭=1개 accordion, footer에 "적재 후 영향 phase + 비용 + 무료만/전부 재실행" 버튼 |
| 0-14 | SectionConclusion(G) + InsightCardMockup | 인사이트 카드 | buildSectionConclusions(ks).G, 5축 axis카드(제품=Top2 SKU 비중/인플=티어분포/콘텐츠=메타클러스터/채널=활성수/시즈널리티=peak월), keyFindings 자동조립, cross-platform top10(3채널 union), 주력 언어(phase5.languages), relatedCases(같은 country ready 4개) | ready && axes.length>0 | ★C1 — 섹션별 결론 한 줄 문법. G가 A~E보다 먼저: 요약 먼저, 상세는 아래 |
| 0-15 | "분석 결과 없음" 안내 | 노란 박스 STEP 1~3 | — | ready && !ks.phase2 | 새 케이스가 어디서 막혔는지 스스로 해결 |
| 0-16 | SectionBoundary(A~E) | 에러 격리 wrapper | 섹션 이름 | 각 섹션 | 한 섹션 크래시가 페이지 전체 안 죽이게 |
| 0-17 | 매출 미업로드 배지 | 빨간 배너 | skuRows.length>0 && !caseSalesExists | 해당 시 | ★B2 — products 있어도 case_product_sales 0행이면 매출 신뢰 경고 |
| 0-18 | DevTestActions + CaseDevFooter | 접힘 footer | costEstimate, keyStats raw, mergeCandidates | 항상(footer) | 개발 액션은 맨 아래 격리 |

### page.tsx 서버 데이터 조립 (프로토 픽스처가 흉내내야 할 소스)
- **라이브 재집계로 캐시 stale 보정**: liveTkMonthly/liveTkTotal(contents 전량 페이지네이션, distinct video id), v_case_monthly 뷰(B7), phase2 라이브 패치는 "live가 캐시보다 클 때만" 덮음
- **전체 인플 리스트**: allTkCreators(≥10편 제한 없는 전량 — top_creators preview의 누락 보정), allIgCreators(ig_authors 전량), tkLanguageDist
- **크로스채널**: crossChannelRows = v_unified_creators 기반 3채널(TK+IG/TK+YT 조합 포함, 구 IG∩YT 앵커 폐기) → sharedMatrix로 B·E·G 공용
- **클러스터 채널 재집계**: clusterBundle — cluster_members(platform+external_ref)로 TK/IG/YT 통합 정규화 → 채널 subset별 metrics/topVideos/tier heatmap/GMV/월 heatmap. key_stats 비어도 content_clusters DB 복원(metaClustersEffective)
- **USP 채널별**: TK=phase5 캐시, IG/YT=코퍼스에서 computeUspKeywords 재계산, all=병합. 키워드별 매칭 영상 top3
- **SKU 연계**: skuVideoMap(contents.product_id 명시 링크 + 어필리에이트 GMV를 조회수 비중으로 영상별 분배·합계보존), bsrSkus(sales_snapshot 직접, 월별 min BSR, 40%+ 개선 & 8만위 이내 = inflection + 당월 영상 top3)
- **019 뷰 의존(A2/A3/A6/A7/C6)**: angleTierMonth, seedingAdOverlap, promotionEvents, gmvTags, igCountrySignal — safeViewRows로 미적용 시 조용히 빈 상태
- **monthlyTierByChannel**: TK=phase3 캐시, IG=ig_posts×ig_authors 월별 distinct 작성자, YT=빈값, all=병합 — A 티어 stack·B 월필터가 채널에 반응

## A. 콘텐츠 활동 (SectionAMockup, 775줄)

| # | 블록 | 형태 | 데이터 | 토글·클릭 | 조건부 | 왜 |
|---|------|------|--------|-----------|--------|-----|
| A-1 | 채널 토글 | ch-toggle 버튼 | 전체합산/TikTok/틱톡샵/IG/YT + 각 영상수 | channelMode 전환. n=0 채널 disabled | 틱톡샵 버튼은 tkShopVids>0일 때만 (★A1 add-only) | 케이스마다 채널 조합이 달라 — 없는 채널은 숨기지 않고 disable(존재 인지) |
| A-2 | KPI 5 | kpi-grid | 총영상(모드별)/광고집행비중%(스파크애즈 라벨)+건수/organic%+건수/gifted(-·—)/총view(top합계) | 채널 모드 따라 갱신 | 항상 | gifted는 데이터 없음을 "-"로 정직 표기 (자리는 유지 — 5축 문법) |
| A-3 | 막대 단위 토글 | abs/pct 버튼 | barMode | 절대 영상 수 ↔ 비중(%) | 항상 | 절대량(계절성)과 구성비(티어 믹스) 두 질문 다 답해야 |
| A-4 | **통합 트렌드 차트 (주인공)** | 월별 스택 막대(12개월 grid) + SVG 오버레이 | 막대=티어×월 stack(tierStackByMonth: 채널별 있으면 그것, 없으면 TK phase3 fallback; 티어 없으면 회색 dim). 라인=①★영상수(기본 ON, #1f2937→#06b6d4 dot) ②광고비중(기본 OFF, 주황 점선, 유의미할 때만: nonZero≥2 & max≥2%) ③BSR(기본 OFF→데이터 잡히면 최초 1회 자동 ON, 빨강 점선, min-max 정규화·낮을수록 위) | 토글 4개(tier stack/ad line/bsr line/vc line). 막대 hover → hoverIdx | BSR 버튼: hasAmazon && bsrVals>0만 활성 | **확정: 티어×월 스택이 주인공, 광고·BSR은 보조 라인**. 부분월(이번달)은 라인에서 제외(급락 왜곡 방지). 라인은 상단 밴드[28,158]에 가둠(라벨 침범 방지) |
| A-5 | 프로모션 마커 | 막대 라벨에 📅 + title | promotionEvents(월 버킷, 019 시드 — 사실 확인 날짜만) | hover title에 이벤트명 | promoByMonth에 있는 월만 | ★A6 — 급등이 프로모션 때문인지 시딩 때문인지 즉석 구분. 추정 금지 |
| A-6 | 변곡점 ★ 마커 | SVG ★ + 수직 점선 | phase5.bsr_inflections(date→월 매칭) | — | hasAmazon | BSR 급등 시점을 차트 위에 직접 |
| A-7 | hover 툴팁 | 우측/좌측 자동 전환 박스 | 월·총영상(vs prev %▲▼)·티어별 명수%·광고비중·BSR(변화%)·변곡점 판정(±40% or BSR±50%)·동조 문구 | 막대 hover 시만 (default dot 없음) | hoverIdx≠null | "호버 시 디테일" — 반려 1회차 교훈의 산물 |
| A-8 | 범례 | lg-item 나열 | 티어 7색 + 라인 3종 | — | BSR 범례는 bsrVals>0만 | |
| A-9 | 볼륨↔BSR 상관 콜아웃 | 초록 박스 1줄 | topInflection(개선폭 최대 1건): date, rank before→after, views_ratio | — | hasAmazon && topInflection | ★C3 — 서술 먼저 |
| A-10 | 변곡점 상세 timeline | details 접힘(기본 닫힘) | bsr_inflections(개선폭 상위 15, 날짜순) × top_videos 3 (TikTokEmbed compact 클릭 로드) | summary 클릭 펼침, 임베드 클릭 로드 | hasAmazon && top_videos 있는 inflection 존재 | ★C3 — A·D 중복은 D가 주(主), A는 요약+접힌 상세만 |

## B. 인플루언서 풀 (SectionBMockup, 945줄)

| # | 블록 | 형태 | 데이터 | 토글·클릭 | 조건부 | 왜 |
|---|------|------|--------|-----------|--------|-----|
| B-1 | 풀 요약 + 언어 분포 | 2col 요약 카드 | 티어 구성%(메가~나노↓), 1회성 vs 반복협업%, **상위 10%가 조회 X% 집중**(보라 강조) / TK 언어 top6 바(오디언스 시그널) | — | topCreatorsBase>0; 언어카드는 languageDist>0 | 차트 보기 전 "이 풀의 모양" 한 줄 (Part2 B) |
| B-2 | 채널 토글 + IG US근사 + 월 select | 토글/체크박스/select | 채널별 풀 명수(실제 렌더 리스트 길이로 일원화 — 불일치 버그 fix 흔적), igCountrySignal(비라틴 % — "언어 기반 추정" ⓘ 명시), phase3.tier_dist_by_month 월 목록 | channelMode / igUsApprox / monthFilter | IG·YT는 데이터 없으면 disabled; US근사는 channelMode==='ig'일 때만 | ★C6 — 국가 필터는 근사임을 문법으로 고지 |
| B-3 | 티어 분포 (좌) | tier-row 바 5+2 | tierDist: 월선택 시 monthlyTierByChannel, 채널별 tierDistByChannel, all=합산. Sub-nano/Unknown은 >0일 때만 행 추가 | **행 클릭 = tierFilter → 우측 Top 작성자 필터**(선택 시 노란 하이라이트 + 해제 배너) | unknown≥50%면 "follower 미수집" 경고 배너 | 티어 분포에서 바로 그 티어 인플 명단으로 — 드릴다운 |
| B-4 | cross-channel matrix (좌하) | matrix-table | crossChannelMatrix에서 2+채널 top4, TK/IG/YT 셀 on/off | — | xcTop>0 | 멀티채널 운용 인플을 좌측에 요약 |
| B-5 | Top 작성자 표 (우) | table 6열 | 이름(+🏢본사 owned 배지+⭐셀럽 10M+)/팔로워(TK 기준 라벨)/채널활동 pills/영상/최고조회/Lifetime GMV. 소스: TK=allTkCreators(전량), IG=allIgCreators+igTopAuthors 영상 매핑, YT=ytTopChannels, all=3채널 concat | 정렬 3버튼(videos/views/gmv — 활성 열 노란 배경), **행 클릭 → Top3 영상 iframe 임베드**(TK/IG/YT detectEmbed), 5명↔20명 더보기 | IG/YT 빈 상태 문구 | 표가 아니라 "표+임베드" — 명단에서 바로 콘텐츠 검증 |
| B-6 | 인플 활동 3축 분포 | 3col bucket 바 | 영상수(1회성~20+heavy)/최고조회(<10K~10M+)/GMV($0~$100K+) — 정렬 선택 축 테두리 강조 | sortBy와 연동 강조 | distAll>0 | "많이 올렸냐/터졌냐/팔았냐"를 분포로 — A에서 이관(Part2 A) |
| B-7 | TT Shop Creator GMV | 2col: Top5 표 + 히스토그램 | topGmvCreators(lifetime GMV, 브랜드협업 수), shopGmvDistribution(10 bucket log scale, $0~$500K+) | hg-bar hover title | showShopSection (둘 중 하나 존재) | 시딩 풀의 "커머스 체급" — TT Shop 케이스 핵심 |

## C. 콘텐츠 포맷 분석 (SectionCMockup, 949줄)

| # | 블록 | 형태 | 데이터 | 토글·클릭 | 조건부 | 왜 |
|---|------|------|--------|-----------|--------|-----|
| C-0 | 표본 라벨 | 노란 인라인 배지 | visionSample/totalContents (%) | — | 둘 다 존재 시 | ★B3 — Vision 태깅은 파일럿 표본임을 섹션 전체에 상시 고지 |
| C-1 | sub-tabs 7 | 탭 | 통합클러스터(n)/USP(n)/시즈널리티heatmap/★티어×앵글/★티어×앵글×월/★태그×GMV/광고·시딩·오가닉 | tab 전환 | 항상 | 포맷 분석의 7가지 질문을 탭으로 — 한 화면 과밀 방지 |
| C-2 | 채널 필터 | ch-toggle | 채널별 클러스터 수(clusterChannelBreakdown) | channelFilter — **전 탭 공통 적용** | 채널 클러스터 0이면 disabled | 채널 필터를 탭 밖에 — 탭 바꿔도 유지 |
| C-3 | 통합 클러스터 | unified-cluster 카드 rows | rank/name/TK·IG·YT 멤버수/desc/metrics(avg views·save%·paid%·자식 n) — 선택 채널 slice 재집계 | **카드 클릭 → Top3 영상 iframe** (TK embed, 외부는 ↗) | metas 0이면 "—" | 클러스터=포맷 가설, 영상으로 즉시 검증 |
| C-4 | USP 키워드 | 좌 키워드칩 grid + 우 상세 | uspByChannel[channelFilter] top24 (CTA 패턴은 노란 하이라이트+CTA 라벨), 키워드별 매칭 영상 top3 | **칩 클릭 → 우측에 등장 영상** | 빈 상태 "—" | 인터랙티브 — 키워드가 실제 어떤 영상에서 쓰였는지 |
| C-5 | 시즈널리티 heatmap | cluster×month grid | measure select(영상수/view합산/광고비중/★GMV기여-Kalodata), 셀 강도 7단 색 | measure 전환, 셀 title | 데이터 없으면 **형태 미리보기 placeholder**(회색 12개월 grid + 안내) | 빈 상태도 "채워지면 이런 모양" — 반려 2회차(간소화 금지) 교훈 |
| C-6 | 티어×앵글 | cross-tab grid | tierClusterHeatmap(선택 채널 slice), 행=티어(데이터 있는 것만) | **셀 클릭 → 클러스터 탭으로 점프 + 해당 클러스터 expand** | 매칭 없으면 문구 | 옛 MiniDashboard 기능 복원 — 탭 간 드릴다운 연결 |
| C-7 | 티어×앵글×월 | 티어 선택 → 앵글×월 heatmap | angleTierMonth(019 뷰) + 표본 라벨 | 티어 토글 | 뷰 미적용 시 빈 상태 문구 | ★A2 — "어떤 티어가 언제 어떤 앵글" 3차원 질문 |
| C-8 | 태그×GMV | 초록 바 리스트 top20 | gmvTags(019 뷰): tag/gmv_sum/video_count | — | 없으면 "극소수(파일럿 0.1%)" 문구 | ★A7 — 표본 부족 경고(B9)를 먼저 박고 참고용임을 명시 |
| C-9 | 광고/시딩/오가닉 | dist-row 3 | paid(is_ad)/seeded(regex #gifted·#pr — all에서만 분리)/organic + 채널별 ad% 요약줄 | 채널 필터 반응 | seeded 행은 all만 | FTC 분류 기준(regex)을 각주로 정직 고지 |

## D. 매출 & BSR (SectionDMockup 1,645줄 + SkuHealthCards 347줄)

| # | 블록 | 형태 | 데이터 | 토글·클릭 | 조건부 | 왜 |
|---|------|------|--------|-----------|--------|-----|
| D-0 | 브랜드 매출 기간 select | 📅 select | kalodataBrandPeriods(기간별 KPI, 최장기간=기본 "전체") | brandPeriod 전환 → 아래 분해 박스 갱신 | 기간 2개+ 적재 시 | Kalodata를 여러 기간 붙여넣은 케이스의 시계열 드릴다운 |
| D-1 | "전체 브랜드 기준" 구분 라벨 | 회색 소제목 | — | — | 분해 박스 존재 시 | 아래 채널토글·SKU표와 스코프가 다름을 명시 (혼동 방지) |
| D-2 | 매출 출처 분해 | 3col 바 카드 | Self-Operated/Affiliate(시딩)/Mall $·% + driver 판정(affiliate≥50%→"🔥 시딩 driven") + Active Affiliates | — | kalodataBrandKpi 필드 존재 | BP 핵심 질문 "매출이 시딩에서 오나"를 카드 1개로 판정 |
| D-3 | Live vs Video 분해 | 스택 바 + 포맷별 Top | live/video/productCard GMV %(기간 선택 반영), 크리에이터 포맷 분류(GMV 70%↑ 기준: 라이브전문/영상전문/혼합) + 각 Top5 | — | liveGmv+videoGmv>0 | 커머스 포맷 전략(라이브 driven?) 판정 |
| D-4 | 채널 + 기간 토글 | ch-toggle 2개 | availableSalesChannels(products.channel 분포) — 존재 채널만 활성, 활성 채널에 GMV 표시. 기간은 7/14 disabled·30 active | selectedChannel → SKU 표 filter | 항상 | 멀티채널(TT샵+아마존) 케이스의 매출 스코프 전환. 7/14일은 준비 안 됨을 disabled로 정직 표기 |
| D-5 | SKU 필터 | 중립 chip 필터 (전체 + top8) | skus, 공통 브랜드 접두어 제거한 shortSku | selectedSku → **아래 모든 표·차트 종속 갱신** | 항상 | "SKU 통일 selector" — 섹션 전체가 한 SKU로 좁혀지는 단일 필터 |
| D-6 | SkuHealthCards | 3 KPI 카드 (전체) / 2col 영상 리스트 (개별) | 전체: 매출집중도(top1/2/3 Pareto 세그먼트 바+판정문구)/카테고리 수+분포/신상 매출 비중(1년내·1-3년·3년+ 판정) · 개별 SKU: 뷰Top5 + 매출기여Top5(GMV 우선 정렬, confidence: explicit-link>high>kalodata-fallback) — details 클릭 임베드 | 개별 모드 영상 클릭 → TikTok iframe | sales_summary && sku_sales>0 | SKU 선택 시 카드가 "포트폴리오 건강" → "이 SKU의 영상 증거"로 변신 |
| D-7 | 개별 SKU GMV 시계열 | SVG 라인 | Kalodata 영상매출 publish_date 월별 합산 (제목 fuzzy 매칭) | — | 개별 SKU && 매칭≥1 && 월 2+ | 선택 SKU의 매출 궤적 |
| D-8 | 히어로 SKU × 메가 viral | hero-grid 3 카드 | 매출 Top3 SKU × matchedFor(0차 명시링크→1차 Vision high+500K→2차 Kalodata 제목 양방향 포함 매칭) 영상 3 iframe | 임베드 | selectedSku==="all"만 | "주력 SKU를 민 영상이 뭐냐" — 개별 선택 시 D-6 개별 모드가 대체 |
| D-9 | sub-tabs 7 | 탭 | SKU 매출표(n)/★카테고리 ranking/★Creator×SKU matrix/★Affiliate code/영상별 매출/Live 매출/★BSR 상승시점 | tab 전환 | 항상 | |
| D-10 | SKU 매출 표 | table 9열 | 제품(리스팅 그룹핑 🔗N 합산 배지)/ASIN(링크)/카테고리/출시/가격(meta enrichment 폴백)/30d GMV/판매/BSR/매칭영상 | 5개↔전체 더보기 | tab==="sku" | 같은 제품 여러 리스팅(캠페인)을 정규화 그룹 — 데이터는 보존, 표시만 합산 |
| D-11 | 카테고리 ranking | KPI 4 + SVG 라인 | categoryRanking points: 현재순위/7일평균/시작대비 계단/Top10 진입일 | — | 미적재 시 paste 안내 | Kalodata Category Ranking 시계열 |
| D-12 | Creator×SKU GMV matrix | table (top5 creator × top4 product + 기타/합계) | Kalodata 우선, 없으면 Helium 어필리에이트(skuVideoMap). 행별 최대 셀 노란 강조 | — | 데이터 없으면 안내+타 케이스 hint | "누가 어떤 SKU 잘 팔았나" |
| D-13 | Affiliate code conversion | placeholder | — | — | 항상 (tab) | 결제 attribution 없음을 정직 고지, E 섹션 promo 추출로 안내 |
| D-14 | 영상별 매출 | KPI 3~4 + details 리스트/table | Kalodata: KPI(매출영상/평균GMV/Top1/Top10비중)+top10 표. 폴백: Helium 어필리에이트 분배(파란 안내 배지 명시) — 행 클릭 TikTok 임베드, SKU 배지, 30개↔전체 | details 임베드, 더보기 | tab==="vid" | 폴백 데이터의 계산 방식(조회수 비중 분배·합계 보존)을 사용자에게 고지 |
| D-15 | BSR 상승 시점 | BsrTrendChart + SKU별 로그스케일 라인 SVG + inflection 카드 | bsrSeries(phase2)+bsrSkus(sales_snapshot 직접): 전체=멀티라인+범례(best #), 개별=상승시점 ▼ 마커 + "당시 브랜드 영상" 링크 | selectedSku 연동 | TT샵 SKU 선택 시 "Amazon BSR 없음" 안내 | D가 BSR 상세의 주(主) — A는 요약만 |
| D-16 | Live 매출 | KPI 4 + table | kalodataLives: 총Live/GMV/평균viewer/Live당GMV + top10(날짜/호스트/duration/viewer/GMV) | — | 미적재 안내+hint | |

## E. Meta 광고 + Partnership (SectionEMockup, 629줄)

| # | 블록 | 형태 | 데이터 | 토글·클릭 | 조건부 | 왜 |
|---|------|------|--------|-----------|--------|-----|
| E-0 | 생존편향 라벨 | 노란 배지 | obsStartDate | — | 항상 (섹션 최상단) | ★B6 — "활동 기간은 관측 시작 이후" 편향 상시 고지 |
| E-1 | KPI 6 | kpi-grid 5col | 총광고(+active)/🏢본사(+%)/🛒유통 retailer(샘플 %)/👤인플 partnership(+인플 n)/landing→Amazon %(+DTC)/분석비용 | — | total_ads===0이면 섹션 축약("—"+skip 사유) | 광고 3분류(본사/유통/인플)가 이 섹션의 첫 번째 답 — 유통 광고는 본사 비용 아님 |
| E-2 | 광고 필터 툴바 | 검색 + select 2 + 체크 4 | body/page 검색, landing(분포 select), format, 본사만/active만/유통만/인플만, "n/m 표시" | 필터 조합 | 항상 | |
| E-3 | **광고 카드 grid (1급)** | ad-card (썸네일 이미지 + 배지 + 정보) | thumbnail_url(Storage 재호스트) img, active/🏢본사/🛒유통/👤인플 배지, page_name, ×partnership, 기간, body 90자 — 카드 전체가 FB Ad Library 링크 | 카드 클릭 → 새 탭, **+12개 더보기** | 항상 | **확정: 소재 이미지 카드가 1급** — 광고는 크리에이티브를 봐야 판단 가능 |
| E-4 | landing + format 분포 | dist-row 2col | landings(amazon/dtc/ig/fb/ttshop/기타/없음 — n>0만) + 기타 Top 도메인, formats(video/image/기타) | — | 항상 | 광고 돈이 어디로 흐르나(Amazon vs DTC) |
| E-5 | promo code 추출 | 노란 카드 칩 | body_text regex 2패턴 top6 (code ×n) | — | topCodes>0 | C2 — attribution 없이도 코드 운용 흔적 확보. regex 기준 각주 |
| E-6 | 파트너 인플 표 | table 6열 | partner_creators top5: 썸네일/인플(×partner page)/팔로워/광고 수/다른 채널 활동(TK·IG·YT pills — partnerChannelMap 매칭)/활동 기간 | — | partner_creators>0 | 광고 속 인플이 오가닉에서도 뛰는지 — cross-channel ★ |
| E-7 | 시딩∩광고 교집합 | table 5열 | seedingAdOverlap(019 뷰): 크리에이터/시딩 채널 pill/티어/팔로워/광고 수, top10+더보기 | — | 빈 상태 사유 문구(핸들 미파싱 등) | ★A3 — "시딩으로 발굴→광고로 증폭" 패턴 검출 |

## 공통 문법 (v5까지 무반려 통과분 — 프로토에 그대로)
1. **섹션 결론 한 줄** (SectionConclusion) — G·A~E 각 섹션 최상단
2. **드릴다운 ↗** — 모든 표·카드에서 원본(TikTok/IG/YT/FB Ad Library/Amazon) 새 탭
3. **클릭 → 임베드** — 명단·클러스터·SKU·매출 영상 어디서든 iframe 즉시 검증 (B-5, C-3, D-6/8/14, A-10)
4. **표본/신선도/추정 라벨** — 캐시 스냅샷(B5)·freshness(B4)·표본 %(B3/B9)·생존편향(B6)·"언어 기반 추정"(C6)·"top creator 합산 추정"·폴백 계산방식 고지(D-14)
5. **빈 상태 3종**: 데이터 없음 사유 문구 / 형태 미리보기 placeholder(C-5) / disabled 토글(존재 인지)
6. **정직한 결측**: gifted "-", GMV "—", 7/14일 disabled — 없는 걸 숨기지 않음
7. **더보기 패턴**: 5↔20(B), 8+12(E), 5↔전체(D SKU), 30↔전체(D 영상) — 기본 화면 밀도 억제
