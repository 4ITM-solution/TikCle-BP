# FE-1 (WS4b) 지시서 — 현행 화면 유지 + 갭 17항목 결선 (확정판 2026-07-08)

> **대원칙 (사용자 확정): 리디자인 금지. 지금 배포된 화면이 기준이고, 아래 항목을 "추가"만 한다.**
> 레이아웃·기존 토글·기존 차트 구조는 건드리지 않는다. 우선순위 **A(기능) → C(UX) → B(신뢰)** — 사용자 확정 순서. 각 그룹 안에서는 표 순서대로.
> 근거: 갭 분석(ORCH 2026-07-08, QA_파일럿_매트릭스·QA_케이스위생 실측 기반). 이전 rev(목업 v4 기반 재설계)는 폐기.
> 가드레일: ORCHESTRATION.md 공통 규칙. 스키마 변경은 migration 019 작성만(적용 ORCH).

## A. 기능 부재 (먼저)

| # | 작업 | 재료 (이미 있음/만들 것) |
|---|---|---|
| A1 | **TT샵 영상 분리** — `contents.is_shop_content` 컬럼(migration 019) + Kalodata 영상 xlsx 업로드 시 url 매칭 플래그 + 기존 데이터 백필 SQL + A섹션 월별 차트에 tiktok_shop 채널 분리 | v_case_monthly 확장 |
| A2 | **티어×앵글×월 교차** — `v_case_angle_tier_month` 뷰(019) + C섹션에 히트맵 블록(형태는 현행 시즈널리티 heatmap 패턴 재사용 — 새 UI 패턴 발명 금지) | cluster_members × v_unified_creators |
| A3 | **시딩∩광고 블록** — `v_case_seeding_ad_overlap` 뷰(019): **meta_ads.creator_page_name(1순위) + inferred_creator_handle(보조)** × v_unified_creators.norm_handle. E섹션에 블록 추가 | BE-9 판정 반영 |
| A4 | **크로스채널 인플 3채널화** — page.tsx `crossPlatformAuthors`를 IG×YT → v_unified_creators 기반 TK 포함 3채널로 교체 (뷰 신규 작업 없음 — 코드만) | QA-1 §2 |
| A5 | **Q0 채택 배지 + 대표 케이스** — 케이스 헤더에 채택/보류/폐기 배지. 판정은 간이 버전(완결성 존재 카운트 + data_ready 여부)으로 먼저, WS6 정식 판정으로 나중에 교체. 목록 화면에 완결성 게이지 요약 컬럼 | WS6 §2와 인터페이스만 맞춤 |
| A6 | **프로모션 캘린더** — promotion_events 시드(미국 프라임데이·블프 등 — 사실 확인된 날짜만, 추정 금지) + A섹션 차트에 이벤트 마커 | WS6 §1과 공유 |
| A7 | GMV×태그 조인 뷰 `v_case_content_gmv_tags`(019) — 화면 블록은 표본 수 표시와 함께 (SharkNinja류는 10건뿐 — B9 라벨 규칙 적용) | Q3·Q4 렌즈 |

## C. UX (다음)

| # | 작업 |
|---|---|
| C1 | **섹션 상단 1줄 결론** — 각 섹션(G/A/B/C/D/E) 최상단에 데이터에서 조립한 결론 한 문장 (서버 계산, LLM 아님 — 템플릿+수치). 결론 못 만들면 회색 "데이터 없음" |
| C2 | **영상 인라인 임베드** — 클러스터 예시·top 작성자·변곡점 전후 (TikTok embed v2, WS4a rev2 목업의 TikTokEmbed 컴포넌트 재사용 가능 — ws-4a-screens 브랜치) |
| C3 | **BSR 변곡점 한 문장 우선** — "★ 3/12 순위 급등 ← 직전 2주 나노 영상 47개" 서술 먼저, 상세 접기. 문장 못 만드는 변곡점은 숨김. A·D 중복은 D로 일원화 |
| C4 | **적재 위저드** — 케이스 country×channel 기반 수동 재료 체크리스트(출처 링크·예상 소요·업로드 즉시 "n행 적재됨") + 자동 수집 시작 배너 (WS4a rev2의 /mockup/intake 구현 이식 가능) |
| C5 | **PhaseProgress phase_runs 직결** — 신 11 phase × {상태·비용·partial 잔여·재실행 버튼(cascade 기본 — BE-12 배포 후)}. 사용자 언어 라벨(코드 노출 금지), 라벨 매핑은 WS4a REPORT §4-1 초안 재사용 |
| C6 | IG 국가 근사 필터 — ig_posts.country_signal 휴리스틱(019) + 집계 토글 + "글로벌 혼입 추정 N% 제외" 라벨 (LLM 금지) |

## B. 신뢰 라벨 (마지막 — 구현은 제일 쌈)

| # | 작업 |
|---|---|
| B1 | **완결성 게이지 헤더** — 6축 충족 표시 (판정 SQL은 WS6 §1 기준, 간이 버전 먼저 가능). "커머스 ready vs 모니터링 ready" 구분 표시 (QA F7) |
| B2 | **salesDone 수정** — products만이 아니라 case_product_sales 실존재로 판정 + "매출 미업로드" 배지 (QA F2) |
| B3 | **표본 크기 라벨** — Vision 기반 블록(C섹션 전체)에 "표본 N건/전체 M건" 상시 표기 |
| B4 | **freshness 배지** — source별 최신성(간이: max created_at/collected_at). 헤더 + 광고 섹션 필수 ("광고 데이터 N일 경과") |
| B5 | **추정 표기** — 추정치 `~` 접두, 캐시/라이브 배지, 스냅샷 날짜. "paid" 라벨 전면 "광고 집행(스파크애즈)" 교체 (G1) |
| B6 | **광고 생존편향 라벨** — 운영일수 랭킹에 "관측 시작일 이후 기준" (G3) |
| B7 | **읽기 경로 뷰 전환** — 섹션 A/B의 key_stats 참조를 WS1 뷰 + 019 뷰로 교체 (캐시 stale 근본 해소). ready 케이스 3개 전환 전후 수치 비교를 REPORT에 |

## 검증·완료 기준
- tsc + migration 019 작성 + **실화면 QA**: ready 케이스 3개 스크린샷 (diff만으로 완료 처리 금지).
- REPORT에 "갭 17개 각각 어느 화면 어디서 해소됐는지" 표 + 미해소 항목과 사유.
- 항목 단위 커밋 (A1, A2… 커밋 메시지에 번호) — ORCH가 그룹 단위로 검증·머지.
