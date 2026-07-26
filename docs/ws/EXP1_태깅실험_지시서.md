---
status: directive
lane: BE (하네스 제작) → ORCH (유료 실행·판정)
task: BE-28 / O-8
updated: 2026-07-25
---

# EXP-1 — 태깅 통합 실험: 모델 × 입력 깊이 6조합 동시 대조

## 목적 (사용자 확정 2026-07-25 "실험할 걸 한 번에 모아서")
결정 4개를 한 판으로: ①현행 태깅(1프레임 Sonnet)의 필드별 정확도 ②Haiku 합격 여부(신 CLOSED enum 문제지) ③3프레임 개선폭 ④최종 권장 조합+비용표.

## 표본 (쿤달 US — 기존 L1 태깅 502건 완료 케이스)
- 영상 50편 층화: 매출연결(kalodata 매칭) 10 · 조회상위 15 · 저장율/댓글율 이상치 10 · 무작위 15
- 광고 30건 (Storage 재호스트 썸네일 필수 — R9: fbcdn 만료 URL 금지)

## 조합 6가지 (같은 표본에 전부)
[Sonnet, Haiku] × [1프레임(커버, 현행) · 3프레임(앞/중/끝) · 딥(ffmpeg 장면전환 컷 키프레임 6~10 + ASR)]
- 프롬프트는 현행 vision-tagger(BE-6 개정판) 그대로 — 입력 이미지 수만 다름
- 딥 파이프라인: 영상 다운로드 → ffmpeg 컷 감지 → 키프레임 추출 (구 bp-video-analyst 검증 방식, §3.6)
- Haiku는 `BP_TAGGING_MODEL=claude-haiku-4-5-20251001` env 전환 (코드 수정 불필요)

## 판정 기준 (준정답 = Sonnet 딥)
- 필드별 일치율 매트릭스: content_angle · hook_tags · overlay_text · products_visible · content_format · (광고) origin_class
- Haiku 합격선: 자기일치 ≥85% AND Sonnet 동입력 대비 핵심필드 열화 ≤10%p (O-7 기준 승계)
- 3프레임 채택선: 1프레임 대비 앵글/포맷/제품 정확도 +10%p 이상
- 산출물: `docs/ws/EXP1_결과.md` — 6조합 × 필드 매트릭스 + 조합별 단가 실측 + 권장안

## 비용·안전
- 상한 $10 (예상 $4~5). API 호출 스크립트는 dry-run 카운트 출력 후 ORCH가 실행.
- 딥 태깅 50편 결과는 case_video_analyses에 저장(부산물 실데이터 — 멱등 upsert, 기존 태깅 덮지 말고 별도 컬럼/run_tag).
- **[U-9 확정 반영] 다운로드한 영상 파일은 Storage 보관** (video_storage_path 기록) — 주요 영상 보관 정책의 시작점. 삭제 금지.

## BE 산출물 (하네스)
`scripts/exp1-tagging-matrix.ts` — 표본 추출(층화 쿼리) + 프레임 준비(1/3/딥) + 6조합 호출 + 일치율 리포트 생성. tsc 통과 + dry-run(호출 0회 모드)까지. **실행은 ORCH.**
