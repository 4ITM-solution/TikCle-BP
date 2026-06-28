# 버그 리포트 — Phase 4c.5 IG 팔로워 enrich (2026-06-26)

## 🐛 고친 버그 (1건, 실질적)

**증상:** 인플(IG author) 많은 케이스에서 분석이 죽거나 Apify 비용이 중복으로 빠질 수 있음.

**원인:**
- Phase 4c.5 = "ig_authors 중 팔로워 비어있는 사람들 프로필을 Apify로 긁어 채우기"
- 이 단계가 비-durable 스크래퍼(`runIgProfileScraper`)를 `step.run` 안에서 호출
- 그 스크래퍼의 **폴링 최대 대기 = 20분** (`MAX_POLL_MINUTES`)
- 그런데 **Vercel maxDuration = 800초(13분 20초)** → 13분 넘으면 함수 강제 종료
- 인플 수백 명 → 스크랩 13분 초과 → 함수 죽음 → Inngest 재시도 → **새 Apify run 시작(중복 과금)** → 반복 위험
- 같은 phase4c의 다른 스크래퍼(hashtag/owned/tagged)는 이미 durable로 고쳐졌는데 **이것만 누락**

**수정 (3파일):**
1. `src/lib/apify/instagram-profile-scraper.ts` — `runIgProfileScraper`에 `durable?` 옵션 추가, 있으면 `runApifyActorDurable` 사용
2. `src/lib/inngest/aggregators/phase4c-ig-monitor.ts` — `enrichIgAuthorFollowers`에 `step?` 받아서 durable로 전달
3. `src/lib/inngest/functions/run-analysis.ts` — phase4c.5를 `step.run` 언랩 + step 전달 (durable step 중첩 불가)

**durable 방식이 왜 안전한가:** start(시작)를 memoize → 재시도해도 새 run 안 만듦(중복 과금 X). 대기는 `step.sleep`(30초씩 끊어 기다림) → 함수 실행시간 소비 안 함 → 20분 걸려도 Vercel 안 죽음. 서버 액션(수동 "팔로워 박기")은 step 없으니 기존 비-durable 그대로(사용자 트리거라 무관).

**검증:** `npx tsc --noEmit` 통과.

---

## ⚠️ 참고 — 버그 아님 (효율 이슈)

phase4c를 `step.run`에서 언랩한 구조상, 후속 phase가 재실행될 때 phase4c의 DB 저장(ig_posts upsert · recomputeIgAuthors)이 **멱등 재실행**됨.

- **멱등(idempotent)** = 몇 번 실행해도 결과 동일. upsert(덮어쓰기)라 여러 번 돌아도 데이터 안 망가짐.
- → **정합성 문제 없음**, 단지 큰 케이스에서 DB 쓰기 중복(낭비). 고치려면 save 부분만 별도 step으로 분리 필요(선택).

---

## ✅ 의심했다가 정상 확인 (버그 아님)
- `instagram-tagged-scraper` actor ID — 슬러그가 같은 액터(zTSjdcGqjg6KEIBlt)로 resolve (토큰 실검증)
- IG 해시태그 config 키 `ig_brand_hashtags` write/read 일치
- `yt_brand_keywords` phase4d-yt-monitor가 소비
- Kalodata video_gmv 폴백 · KR 협찬 패턴 · country 필터(누수 수정) — 의도대로
