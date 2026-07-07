# WS3 REPORT — 모델 티어링 + dedup + 광고 태깅 확장

브랜치: `ws-3-model-tiering` · 작성 2026-07-07 · 설계 기준 `docs/BP_재설계_v2.md` §3.4 / §1.2 Q6 / §4 WS3
상태: **코드 완료 · tsc 통과.** push·배포·마이그레이션 적용·백필 미실행 (오케스트레이터 몫).

---

## 1. 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lib/anthropic/pricing.ts` **(신규)** | 태깅 모델 티어링 설정 + 모델별 단가. `TAGGING_MODEL`(기본 `claude-haiku-4-5-20251001`, `BP_TAGGING_MODEL` override) · `SONNET_MODEL` · `calcCost`/`calcTaggingCost`(모델명으로 Haiku/Sonnet 단가 자동 선택) |
| `src/lib/anthropic/dedup.ts` **(신규)** | 태깅 입력 해시 유틸. `stableUrlKey`(서명 쿼리 제거) · `tagInputHash`(sha256) |
| `src/lib/anthropic/vision-tagger.ts` | 영상 태깅 모델 → `TAGGING_MODEL`(Haiku). `calcVisionCost`는 `calcTaggingCost`로 위임(모델 단가 자동) |
| `src/lib/anthropic/ad-creative-tagger.ts` | 광고 태깅 모델 → `TAGGING_MODEL`(Haiku). **AdIntel에 `source_channel`·`banner_style` 추가**(Q6) + 프롬프트에 판별 기준·enum 명시 + 파서 정규화 |
| `src/lib/anthropic/clusterer.ts` | pass1 → Haiku(`PASS1_MODEL`), pass2/3 → Sonnet(`PASS23_MODEL`). `callAnthropicJson`에 model 파라미터. `calcClusterCost(pass1Usage, pass23Usage)` — pass별 단가 분리 |
| `src/lib/inngest/aggregators/phase4b-clusters.ts` | usage를 pass1/pass2·3 두 누산기로 분리(`usagePass1`/`usagePass23`). `ClusterSaveInput`·`emptyClusterStats`·`saveClusterResults` 갱신 |
| `src/lib/inngest/functions/phases/interpret-cluster.ts` | 동일하게 usage 2-누산기로 분리 |
| `src/lib/inngest/aggregators/phase4b-vision.ts` | **dedup**: 입력 해시 계산 → 기존 결과 재사용(케이스 무관) + 배치 내 동일 해시 1회 호출. upsert에 `tag_input_hash` 기록. `Phase4bVisionBatchResult.reused`·`Phase4bVisionStats.total_reused` |
| `src/lib/inngest/aggregators/phase4a-intel.ts` | 광고도 동일 dedup. `Phase4aVisionBatchStats.vision_reused`. `fetchReusableAdIntel`/`adInputHash` |
| `src/lib/inngest/functions/phases/interpret-tag.ts` | reused 카운트 로깅/stats 반영(ad_reused·video_reused) |
| `src/lib/inngest/types.ts` | `Phase4bVisionStats.total_reused?` |
| `src/lib/cost-estimate.ts` | Vision $0.012→$0.004(Haiku) · Cluster $0.6→$0.3 · preview 라벨(Sonnet→Haiku) |
| `scripts/gate-tagging-model.ts` **(신규)** | 품질 게이트 (아래 §3) |
| `package.json` | `gate:tagging` 스크립트 |
| `supabase/migrations/018_ws3_tagging_dedup_runtime.sql` **(신규)** | `tag_input_hash` 컬럼 2개 + partial index + `v_case_ad_runtime` 뷰 |

---

## 2. 모델 티어링 (§3.4 표 그대로)

| 작업 | 이전 | 이후 | 파일 |
|---|---|---|---|
| 4b.3 영상 포맷/훅 태깅 | Sonnet | **Haiku 4.5** | vision-tagger.ts |
| 4a.6 광고 크리에이티브 태깅 | Sonnet | **Haiku 4.5** | ad-creative-tagger.ts |
| 4b.4 pass1 후보 추출 | Sonnet | **Haiku 4.5** | clusterer.ts |
| 4b.4 pass2/3 통합·명명 | Sonnet | Sonnet 유지 | clusterer.ts |
| 4b.5 SKU 매칭 | Sonnet | **변경 없음** | sku-matcher.ts (미변경) |

- 모델명 env override: `BP_TAGGING_MODEL`(fallback Haiku). 단가는 모델명에 `haiku` 포함 여부로 자동 판정 → override해도 비용 로그 정합.
- 클러스터 비용은 pass1(Haiku)·pass2/3(Sonnet) usage를 분리 누산해 각 단가로 합산(단일 Sonnet 계산이던 것 교정).
- Haiku 4.5 단가: input $1/M · output $5/M · cache read $0.10/M · cache write $1.25/M (claude-api skill 확인).

## 3. 품질 게이트 — **미실행 (env 필요)**

`scripts/gate-tagging-model.ts` (`npm run gate:tagging`):
- 기존 Sonnet 태깅된 `case_video_analyses.vision_tags`/`meta_ads.ad_intel`에서 샘플(기본 영상 20 + 광고 10)을 Haiku로 재태깅 → 필드별 일치율(scalar 정확일치, 배열 Jaccard) 표 + 종합 + 실측비용 출력. **읽기 전용**(DB 미기록). 비용 하드 캡 $0.5.
- Supabase 연결·샘플 조회·비교 로직은 검증 완료(스크립트가 Supabase env 해석·조회 경로까지 정상 진입).
- **`.env.local`의 `ANTHROPIC_API_KEY`가 비어 있어 실호출 미실행** (진행 로그의 "Anthropic 크레딧 소진/충전 대기"와 일치). 충전 후 `npm run gate:tagging` 실행 → 일치율 ≥90% 확인이 Haiku 전환 최종 게이트.
- 판정: **필드별·종합 일치율 ≥90%면 확정** (보고서 기록 몫까지가 이 세션, 최종 승인은 오케스트레이터).

## 4. dedup (§3)

- **원리**: WS1의 "vision_tags/ad_intel non-null이면 skip"은 *같은 행 재실행* 방지. 이번 것은 *다른 행(다른 content_id/ad_archive_id, 다른 케이스)이지만 실제 입력이 동일*한 경우 재태깅=중복 과금 방지.
- **해시 키**: 영상 = `sha256(stableUrlKey(cover)+caption+asr)`, 광고 = `sha256(stableUrlKey(thumbnail)+body_text)`. `stableUrlKey`가 만료성 서명 쿼리를 떼어 같은 이미지가 항상 같은 키.
- **동작**: (1) 배치 시작 시 동일 해시로 이미 태깅된 행을 케이스 무관 조회 → LLM 없이 결과 복사. (2) 배치 내 동일 해시는 대표 1건만 호출 후 나머지에 공유. 모든 쓰기에 `tag_input_hash` 기록(다음 재사용 위함).
- **최대 수혜**: 동일 브랜드·국가의 케이스 2개가 같은 영상 풀 공유 시 두 번째 케이스는 재태깅 0. `phase_runs.stats`/vision stats에 `reused` 노출.
- PostgREST 1000행/in() 한도(R2)는 300개 청크 조회로 회피.

## 5. 광고 태깅 확장 (Q6 — §1.2)

- `ad_intel`에 `source_channel`(`instagram`|`tiktok`|`brand_original`|`unknown`) + `banner_style`(`none`|`top_banner`|`bottom_banner`|`caption_overlay`|`frame`|`other`) 추가. Vision 프롬프트에 판별 기준(파트너십/워터마크/UI/비율, 배너 위치) 명시.
- **기존 태깅 행 재태깅 안 함** — 신규 필드는 두 값 다 null. 백필은 오케스트레이터 별도 결정(지시서 §4).
- **최장 운영 광고 랭킹** 뷰 `v_case_ad_runtime` (§5, migration 018): meta_ads start/end_date(진행 중이면 오늘)로 `runtime_days` 계산 + 케이스별 `runtime_rank` + ad_intel 필드(신규 2개 포함) 노출. start/end_date는 `YYYY-MM-DD` 문자열 적재(apify/meta-ads.ts) → `::text::date` 캐스트로 date/text 컬럼 모두 안전.

---

## 6. 배포 전 사람이 확인할 것 (오케스트레이터)

1. **마이그레이션 018 적용** (Supabase). 검증: `select count(*) from case_video_analyses;` 후 컬럼 추가 확인, `select * from v_case_ad_runtime limit 5;` 뷰 정상 여부. **뷰 전제 확인**: `select start_date, end_date from meta_ads where start_date is not null limit 5;` — `YYYY-MM-DD` 형태 맞는지(다른 포맷이면 `::date` 캐스트 실패). 감사 결과 apify가 항상 `YYYY-MM-DD`로 정규화하므로 정상 예상.
2. **types 재생성**: 018 적용 후 `npm run db:types` (tag_input_hash·뷰 반영). 현재 코드는 untyped/캐스트 우회라 미재생성이어도 동작하지만, R5/자가검토#2 권고대로 재생성 권장.
3. **품질 게이트 실행**: Anthropic 크레딧 충전 후 `npm run gate:tagging` → 필드별·종합 일치율 ≥90% 확인. **미달 시 Haiku 전환 보류**(모델 상수만 `claude-sonnet-4-6`로 되돌리면 즉시 롤백 — pricing.ts `TAGGING_MODEL` 또는 `BP_TAGGING_MODEL` env). 게이트는 배포 전 필수.
4. **배포 후 검증**: 케이스 1개 `interpret-tag` 재실행 → phase_runs.stats에 `ad_reused`/`video_reused` 노출·비용 하락 확인. 동일 브랜드 2번째 케이스에서 reused>0 기대.
5. **신규 필드 백필 정책 결정**: source_channel·banner_style·v_case_ad_runtime 활용은 WS4(화면). 기존 광고 재태깅 여부는 비용 대비 판단.

## 7. 결정/해석 사항 (지시서에 없어 판단한 것)

- **광고 태깅도 Haiku 전환**: 지시서 §1은 "vision-tagger.ts"만 명시하나 §3.4 표는 4a.6 광고 태깅도 Haiku 대상 → `ad-creative-tagger.ts`도 함께 전환(BP_TAGGING_MODEL 공통).
- **cost-estimate 수치**: Vision $0.004(=Sonnet $0.012 × ~1/3, §3.4 "~$1" 근거), Cluster $0.3(pass1 Haiku화). 정밀치 아닌 사전 추정값.
- **dedup 재사용은 케이스 무관 전역 조회**: 최대 절감(브랜드 다케이스 공유 풀)을 위해 case_id 스코프 없이 해시로 조회. 유료 결과 불멸(R3) 원칙과 정합(기존 non-null만 참조·복사, 파괴 없음).
- **reused 카운트 노출**: 절감 가시화 위해 stats에 추가(스키마 변경 아님, phase_runs.stats jsonb).
