# FE-1 (WS4b) 보고서 — 현행 화면 유지 + 갭 17항목 결선

> 브랜치: `ws-4b-screens` (워크트리 `.claude/worktrees/ws-4b`). 항목 단위 커밋(A1~A7, C1~C6, B1~B7).
> 대원칙 준수: **리디자인 금지, 현행 화면에 추가만.** 기존 레이아웃·토글·차트 구조 미변경.
> migration `019_ws4b_screen_views.sql` 작성 (적용 금지 — ORCH 게이트).
> tsc 전 항목 통과. 실화면 QA: ready 3케이스(medicube·Foodology·Nature Republic) 스크린샷 확인.

## 갭 17개 해소 매핑

### A. 기능 부재
| # | 해소 위치 | 방식 | QA |
|---|---|---|---|
| A1 | migration 019 + `SectionAMockup` 채널 토글 | `contents.is_shop_content` 컬럼(019)+partial index+프록시 백필, `v_case_monthly`에 `tiktok_shop` UNION(비파괴 오버레이). page.tsx liveTk 집계에 샵 월별 분리(019 미적용 시 컬럼 폴백). A섹션 '틱톡샵' 토글은 샵 콘텐츠 있을 때만 노출 | 채널 토글 렌더 확인. 샵 토글은 019 적용+백필 후 노출(현재 미적용) |
| A2 | migration 019 `v_case_angle_tier_month` + `SectionCMockup` 신규 탭 '티어×앵글×월' | 멤버→리프→메타 앵글, TK content 티어(bp_tier), 월별 히트맵(기존 `.heatmap` 패턴 재사용) + 표본 라벨 | 탭 렌더 확인. 019 미적용이라 "데이터 없음" 그레이스풀 폴백 표시 ✓ |
| A3 | migration 019 `v_case_seeding_ad_overlap` + `SectionEMockup` 블록 | `creator_page_name`(1순위)·`inferred_creator_handle`(보조) norm_handle → `v_unified_creators` 조인 (BE-9 판정 반영) | 블록 렌더 확인. 무매칭/미적용 사유 명시 빈 상태 표시 ✓ (medicube) |
| A4 | `page.tsx` `crossChannelRows` (코드만) | `v_unified_creators`(017 live)로 채널 소속 잡고 allTkCreators/allIgCreators/ytTopChannels+crossPlatformMatches 로 카운트 join. ≥2채널만. sharedMatrix + G 인사이트 양쪽 교체 | medicube cross-channel matrix에 IG+YT 조합(medicube_global IG13·YT5) 표시 ✓ |
| A5 | `completeness.ts` + `HeaderMockup` 배지 + `CasesListWithCompare` 컬럼 | 6축 완결성 간이 판정(채택/보류/폐기). 헤더 '채택 N/6' 배지 + 목록 요약 컬럼(JSON 경로 스칼라만 select) | 목록·3케이스 헤더 배지 확인 ✓ (medicube 5/6, Foodology 5/6 등) |
| A6 | migration 019 promotion_events 시드 + `SectionAMockup` 📅 마커 | US 프리셋(Prime Day·Big Deal Days·Black Friday·Cyber Monday 2023~2025, 사실/달력 확정만) idempotent. 이벤트 월 라벨에 📅 + 툴팁 | 마커 코드 검증. 019 시드 적용 후 US 프리셋 노출 |
| A7 | migration 019 `v_case_content_gmv_tags` + `SectionCMockup` 신규 탭 '태그×GMV' | matched_sku_ids→case_product_sales 매출 × hook_tags 태그별 집계 + 표본 부족 경고(B9) | 탭 렌더 확인. 019 미적용 빈 상태 폴백 ✓ |

### C. UX
| # | 해소 위치 | 방식 | QA |
|---|---|---|---|
| C1 | `section-conclusions.ts` + `SectionConclusion` (G/A/B/C/D/E) | 서버 조립(템플릿+수치, LLM 아님). 근거 부족 시 회색 "데이터 없음" | 💡 결론 라인 확인 ✓ (medicube G/A/B/C/D 전부, Foodology/NR G) |
| C2 | `TikTokEmbed` + `SectionAMockup` 변곡점 | ws-4a 이식+클릭 로드(lazy). 변곡점 '동반 viral' 링크→인라인 임베드. 클러스터·top작성자·D는 현행 이미 임베드(유지) | 임베드 컴포넌트 렌더 확인 |
| C3 | `SectionAMockup` 변곡점 timeline | 요약 콜아웃(topInflection) 먼저, 상세 timeline `<details>` 접기. A·D 중복→D 주(主) 명시 | "✨변곡점 상세 timeline 펼치기 · 상세는 D 섹션과 동일" 접힘 확인 ✓ (medicube) |
| C4 | `intake-checklist.ts` + `IntakeWizard` (draft 화면) | channel×country 재료 체크리스트(Exolyt/Helium/Keepa/Kalodata/Shopdora)+출처·예상소요·✓실적재 + 자동수집 배너 | draft 케이스에서 확인 필요(ready 3케이스엔 미노출 — draft 전용) |
| C5 | `PhaseRunsPanel` + `requestPhaseRerun` | phase_runs 직결 신 11-phase 사용자 라벨(코드 노출 금지, U3)+상태·비용·partial·재실행. cascade는 BE-12 후 | "분석 단계 진행 상태 (11단계)·완료 N/11" 패널 확인 ✓ (3케이스) |
| C6 | migration 019 `v_case_ig_country_signal` + `SectionBMockup` IG 토글 | 캡션 비라틴 문자로 글로벌 혼입 근사(LLM 금지). 'US 근사' 토글 + 'N% 제외' + 'ⓘ 언어 기반 추정' | IG 채널 뷰에서 확인(019 적용 후 데이터). 토글 코드 검증 |

### B. 신뢰 라벨
| # | 해소 위치 | 방식 | QA |
|---|---|---|---|
| B1 | `CompletenessGauge` (헤더) | 6축 pill(커머스=파랑/모니터링=초록) + 커머스 ready vs 모니터링 ready 별도 배지(F7). status 독립(F1) | 3케이스 헤더 게이지 확인 ✓. medicube=모니터링 only, Foodology/NR=커머스+모니터링 (케이스별 정확 구분) |
| B2 | `page.tsx` D섹션 상단 배지 | SKU/products 있으나 case_product_sales 0행이면 '매출 미업로드' 경고(F2). 완결성 커머스 축은 이미 실매출 기준 | medicube(products 8·매출0)에 배지 표시 ✓, Foodology(실매출 $536K)엔 미표시 ✓ (정확 판별) |
| B3 | `SectionCMockup` 헤더 상시 라벨 | "표본 N건(태깅 완료)/전체 M건 (%)" 상시. A2·A7 탭 개별 라벨과 이중 안전 | "🔬 표본 270건/전체 291건 (93%)" 확인 ✓ (medicube) |
| B4 | `FreshnessBadge` (헤더+E섹션) | source별 경과일(30일 fresh/90일 주의/이상 stale). E섹션 '광고 데이터 N일 경과' 필수 | 헤더 TikTok/광고/IG/YT 배지 확인 ✓ (medicube TikTok 107일 red·광고 9일 green) |
| B5 | 라벨 교체 + 헤더 캐시 배지 | 'paid'→'광고 집행(스파크애즈)'(A·C, G1). '🗄 캐시 스냅샷·분석 {date}' 배지 | "광고 집행 비중(스파크애즈) 19%" + 캐시 배지 확인 ✓ |
| B6 | `SectionEMockup` 생존편향 라벨 | 운영·활동 기간 '관측 시작일 이후 기준'(G3). 이전 집행분 미포함 경고 | E섹션 라벨 코드 검증(E 상단) |
| B7 | `page.tsx` `viewMonthlyByChannel` | Section A 월별 IG/YT/샵을 `v_case_monthly`(WS1 live 뷰)로 교체(캐시 stale 해소). 무데이터 폴백 | 뷰 조회 override 동작 확인. 정밀 전후 비교는 아래 참고 |

## 미해소 / 조건부 항목
- **A1 샵 토글, A2·A3·A6·A7·C6 실데이터**: migration 019(뷰·컬럼·시드) **미적용** 상태라 화면은 그레이스풀 빈 상태/폴백으로 렌더됨(크래시 없음 — QA 확인). ORCH가 019 apply 후 자동 활성. 재-QA 권장.
- **C4 적재 위저드**: draft 케이스 전용이라 ready 3케이스 스크린샷엔 미노출. draft 케이스로 별도 확인 필요.
- **B7 전후 수치 비교**: `v_case_monthly`(tk/ig/yt)는 017 live 뷰라 즉시 동작하나, 정밀 "캐시 vs 뷰" 차이 계측은 케이스별 instrumentation 필요 → 019 apply 검증 시 ORCH가 3케이스 수치 대사 권장. 현재는 뷰 우선 override로 stale 구조적 해소만 확정.

## 019 적용 전 안전성 (defensive)
신규 뷰/컬럼 참조는 전부 `safeViewRows`(뷰 미존재→[]) + is_shop_content select 폴백으로 감쌈. QA에서 019 미적용 프로덕션 3케이스가 **크래시·콘솔 에러 없이** 정상 렌더됨을 확인. 019 apply 후 코드 변경 없이 실데이터 채워짐.

## 성능 참고
데이터 풍부 케이스(Foodology 등) 초기 렌더 ~35s. 019 미적용 중 6개 신규 뷰 조회가 관계-미존재로 fail-후-폴백(각 1왕복). 019 apply 후 이 오버헤드 소멸. 추가 최적화 여지: 독립 뷰 fetch 병렬화(현재 순차 await) — 후속 제안.

## 커밋 (ws-4b-screens)
A1 02e56fe · A2 fe1dc5c · A3 e41a132 · A4 d68f9b9 · A5 7e38919 · A6 cec415e · A7 f2e6dc9 ·
C1 a3043f2 · C2 599a36c · C3 653dc57 · C4 73b51dd · C5 3f375d4 · C6 a394ae4 ·
B1 623d049 · B2 954ed21 · B3 f57687a · B4 32845aa · B5 f70d799 · B6 9d02b37 · B7 82b2591

## ⚠ ORCH 조치 필요
1. `019_ws4b_screen_views.sql` 프로덕션 apply(뷰 5·컬럼 1·시드 12행) + A1 백필 검증 + 재-QA.
2. **main 정리**: 세션 중 CWD 이탈로 로컬 main에 쓰레기 커밋 `48faa29`(워크트리 gitlink) 유입. 미푸시·로컬 한정. `git reset --hard 70cffac` 로 제거(안전장치가 워커의 main write를 막아 FE가 직접 못 지움).
