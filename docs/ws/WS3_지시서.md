# WS3 지시서 — 모델 티어링 + dedup + 광고 태깅 확장

> 실행 세션용. 시작하면 이 문서와 `docs/BP_재설계_v2.md` 전체(특히 §1.2 Q5·Q6, §3.4, §4 WS3)를 먼저 읽을 것.

## 공통 규칙 (모든 WS 동일)
- 브랜치 `ws-3-model-tiering`에서 작업, 논리 단위 로컬 커밋. **push·배포·Supabase 마이그레이션 적용 금지** (오케스트레이터가 함).
- 케이스 데이터를 삭제하는 코드 금지. 유료 API 실호출은 아래 "품질 게이트" 항목의 소량 검증만 허용.
- 완료 시 `docs/ws/WS3_REPORT.md`에 보고서 작성 (변경 파일, 결정 사항, 사람이 확인할 것) + `docs/BP_재설계_v2.md` §6에 한 줄 로그.
- WS2가 main에 머지돼 있음: 파이프라인은 `src/lib/inngest/functions/phases/*` (interpret-tag, interpret-cluster가 이번 작업의 소비자).

## 작업 항목

### 1. 모델 티어링 (§3.4 표 그대로)
- `src/lib/anthropic/vision-tagger.ts`: 영상/광고 태깅(닫힌 라벨 분류)을 `claude-haiku-4-5-20251001`로 전환. 모델명은 env override 가능하게 (`BP_TAGGING_MODEL` fallback Haiku).
- `src/lib/anthropic/clusterer.ts`: pass1(후보 추출)만 Haiku, pass2/3은 Sonnet 유지.
- `src/lib/anthropic/sku-matcher.ts`: Sonnet 유지 (변경 없음).
- `src/lib/cost-estimate.ts` 비용 추정 갱신.

### 2. 품질 게이트
- `scripts/gate-tagging-model.ts`: 기존에 Sonnet으로 태깅된 `case_video_analyses`/`meta_ads.ad_intel`에서 샘플 30개 뽑아 Haiku로 재태깅 → 필드별 일치율 표 출력. 실행 비용 ~$0.5 이내. **이 스크립트 실행까지가 이 세션의 몫** (일치율 ≥90% 판정은 보고서에 기록, 최종 승인은 오케스트레이터).
- 실행에 필요한 env는 `.env.local` 참조 (없으면 보고서에 "미실행 — env 필요"로 기록하고 스크립트만 완성).

### 3. dedup (§3.4)
- 태깅 입력 해시(caption+cover url 등 실제 입력 기준) 컬럼/맵을 도입해 동일 입력 재태깅 방지. 스키마 변경 필요하면 `supabase/migrations/018_*.sql`로 작성만 (적용은 오케스트레이터).
- WS1에서 이미 `vision_tags non-null skip`은 들어감 — 이건 "같은 영상 재실행" 방지고, 이번 것은 "다른 행이지만 같은 입력" 방지.

### 4. 광고 태깅 확장 (Q6 — §1.2)
`ad_intel` 태깅 스키마에 추가:
- `source_channel`: 이 소재의 원본이 어디인가 — `instagram` | `tiktok` | `brand_original` | `unknown`. 판별 근거: 파트너십 광고 여부(IG 연동), 영상 워터마크/UI 흔적(TikTok 로고·캡션 스타일), 세로/가로 비율 등. Vision 프롬프트에 판별 기준 명시.
- `banner_style`: 2차 가공 시 배너/텍스트 오버레이 방식 — `none` | `top_banner` | `bottom_banner` | `caption_overlay` | `frame` | `other`.
- 기존 태깅된 행 재태깅은 하지 말 것 (신규 필드는 null 허용, 백필은 오케스트레이터가 별도 결정).

### 5. 최장 운영 광고 랭킹 (Q6)
- 뷰 `v_case_ad_runtime`: meta_ads의 start_date/end_date(진행 중이면 오늘)로 운영일수 계산, 케이스별 랭킹 + ad_intel 필드 노출. `supabase/migrations/018_*.sql`에 포함.

## 완료 기준
- tsc 통과, 게이트 스크립트 완성(+가능하면 실행 결과), migration 018 작성, REPORT 작성.
