# WS4 지시서 — Q1~Q7 교차 뷰 + UI 읽기 경로 전환

> 실행 세션용. 시작하면 이 문서와 `docs/BP_재설계_v2.md` 전체(특히 §1.2 Q1~Q7, §3.2, §3.5, §4 WS4)를 먼저 읽을 것. `docs/데이터_구조_설명.md`, `docs/IG_파이프라인_수술_플랜.md` Part 2도 참고.

## 공통 규칙
- 브랜치 `ws-4-serving-ui`에서 작업, 논리 단위 로컬 커밋. **push·배포·Supabase 마이그레이션 적용 금지.**
- 케이스 데이터 삭제 코드 금지. 스키마 변경은 `supabase/migrations/019_*.sql` 작성만.
- 완료 시 `docs/ws/WS4_REPORT.md` 보고서 + 설계 문서 §6 로그 한 줄.
- WS1 뷰 4개(v_unified_creators, v_case_monthly, v_case_creator_stats, v_case_tier_dist)는 프로덕션에 이미 존재. WS2 phase 함수·phase_runs도 배포됨.

## 작업 항목

### 1. TT샵 콘텐츠 플래그 (Q1)
- `contents.is_shop_content boolean` 추가 (migration 019).
- Kalodata 영상 xlsx 파서(업로드 액션)가 contents에 url 매칭으로 플래그 세팅 + 기존 데이터 백필 SQL (key_stats.kalodata_videos_xlsx의 url 목록 기준) 포함.
- v_case_monthly에 채널 'tiktok_shop' 분리 (is_shop_content=true는 tiktok에서 빼고 tiktok_shop으로).

### 2. 교차 뷰 3개 (migration 019)
- `v_case_angle_tier_month` (Q3): content_cluster_members × v_unified_creators(tier) × month — 클러스터별·티어별·월별 영상 수/조회수.
- `v_case_content_gmv_tags` (Q5): 영상별 GMV(contents에 매칭된 kalodata 매출) × case_video_analyses.vision_tags — "매출 기여 콘텐츠의 특징" 원료.
- `v_case_seeding_ad_overlap` (Q7): meta_ads.inferred_creator_handle(norm) ∩ v_unified_creators.norm_handle — 시딩과 광고 양쪽에 쓰인 인플 + 해당 광고 운영일수 + 그 인플의 시딩 영상 클러스터.

### 3. UI 읽기 경로 전환 (§3.5)
- 섹션 A/B: key_stats.phase2/phase3 참조를 WS1/이번 뷰로 교체 (이미 라이브인 부분은 유지). A에 TT샵 분리 토글.
- 섹션 B: 반복 협업(video_count≥2) 블록을 v_case_creator_stats 기반으로 항상 노출 (Q2).
- 섹션 C: key_stats.phase4b_clusters 폴백 제거(content_clusters 단일 소스) + 티어×앵글×월 히트맵(월 슬라이더 또는 기간 분할) 추가 (Q3).
- 섹션 E: 최장 운영 광고 랭킹(v_case_ad_runtime — WS3 산출, 머지 전이면 뷰 정의만 가정하고 UI 준비) + source_channel/banner_style 노출 + 시딩∩광고 블록 (Q7).
- PhaseProgress: pipeline_runs 추측 → phase_runs 직결 (phase별 상태·cost_usd·partial 잔여건 + 개별 재실행 버튼 = case/phase.requested 발행 — WS2의 upload-actions.ts 참고).
- `status='ready'` 게이트 완화: S1(수집) 완료 시점부터 섹션 렌더, 미완 phase는 섹션 내 배지.
- **케이스 완결성 게이지** (설계 문서 §1.0.2): 케이스 헤더에 6축(규모/구성/콘텐츠/성과/광고접합/시점) 충족 여부 표시 — 각 축의 판정은 해당 데이터 존재 여부 SQL로 (예: ④성과 = sales_snapshot 또는 kalodata 존재). 케이스 목록에도 게이지 요약 컬럼.

### 4. 검증
- 기존 ready 케이스 3개에 대해 전환 전후 수치 비교 방법을 REPORT에 명시 (뷰 vs key_stats 비교 쿼리 — scripts/verify-ws4.sql).
- 수치가 다르면 원인 규명해서 REPORT에 기록 (뷰가 라이브라 더 정확한 경우 "정상 차이"로 표기).

## 완료 기준
- tsc 통과, migration 019 작성, Q1~Q7 각각 "어느 화면 어느 블록에서 답이 보이는지" 표를 REPORT에 포함.
