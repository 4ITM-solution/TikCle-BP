# Mockup vs 라이브 코드 비교 보고서 (v3)

mockup: `~/Downloads/bp-case-detail-mockup.html` (1457 줄)
라이브 코드: `src/app/cases/[id]/page.tsx` + `src/components/case-detail/mockup/*.tsx` + `src/app/globals.css`

검토 일자: 2026-06-01 (v3 — A 모델 + Phase 4c.5 + 옛 MD 기능 전체 복원 후)

---

## 0. 큰 그림 (v2 → v3)

### v3 새 변경 (2026-06-01 push 16+ commit)

- ✅ **A 모델 마이그레이션 완료** — 신규 case 폼에서 platform 선택 제거, 한 case 다채널 자유 적재
- ✅ **mergeCases server action** — 같은 brand+country 옛 case 2개 합치기 dev 도구 (12 brand+country 쌍 마이그 가능)
- ✅ **데이터 채널 자동 detect** — case.data_channels 빈 array 여도 phase 결과 + products.channel 보고 자동 active
- ✅ **데이터 수집 기간** sub 라벨 (`📅 2025-08-01 ~ 2026-05-26`)
- ✅ **expand panel 적재 후 가이드** — 영향 phase + 무료/유료 분리 버튼 + 비용 표시
- ✅ **옛 MD 4 기능 전체 복원** — BsrTrendChart / 티어×앵글 히트맵 / Kalodata 매출 분해 / TK+IG+YT 통합 인플
- ✅ **변곡점 timeline + ★ marker** (Amazon BSR inflection)
- ✅ **B 인플 평가 3축** — 정렬 토글 + 분포 카드 (영상수/조회수/매출)
- ✅ **B 채널별 tier 분포** — channelMode 따라 source (TK phase3 / IG ig_authors.followers / YT yt_channels.subscriber_count)
- ✅ **Meta 광고 3분류** — 본사 / 유통 retailer (31 키워드) / 인플
- ✅ **🏢 본사 시딩 라벨** (owned account 매칭)
- ✅ **광고 promo code regex 추출**
- ✅ **C 시딩 분류 regex** (#gifted/#pr/#partner) + C heatmap GMV measure
- ✅ **C cluster row top 영상** link (옛 MD 기능)
- ✅ **Kalodata Category Ranking** 적재 + svg + KPI 4
- ✅ **G related-cases SQL** — 같은 country ready case 4개
- ✅ **Phase 4c.5 — IG profile scraper** (신규 actor — Apify `apify/instagram-profile-scraper`)
  - follower / bio / external_url / verified / linked_handles (cross-channel mapping) 박힘
  - 비용 ~$0.005/username

### v3 일치도

**전체 평균: v2 ~95% → v3 ~100%+ (mockup 보다 더 풍부)**

mockup 에 없지만 추가 박은 것:
- 티어 × 앵글 히트맵 / BSR 상승 시점 / Kalodata 매출 분해 / TK+IG+YT 통합 인플
- 변곡점 timeline 카드 (자동 detect)
- IG profile scraper Phase 4c.5
- 데이터 채널 자동 detect + 수집 기간 sub
- expand panel 적재 후 가이드 + 무료/유료 분리

---

## 1. 섹션별 mockup vs 라이브 (v3 기준)

| 섹션 | 일치도 | 비고 |
|---|---|---|
| 좌측 sticky TOC | 100% | "목차" / "DEV" 라벨 일치 |
| status-strip | 100%+ | mockup 의 case-header 흡수 (다크 bar 한 줄 통합) |
| KPI strip 6 KPI | 100% | trend ▲ phase2.prev_period_revenue 박힘, IG/YT authors 합산 |
| 데이터 채널 grid | 105% | 카드 인라인 expand accordion + 적재 후 가이드 (mockup 의도 초과) |
| Phase progress | 100% | 15 phase + ↻ 인라인 버튼 + 비용 분리 |
| G 인사이트 | 100% | axisCards / keyFindings / TK+IG+YT 통합 인플 / related-cases |
| A 콘텐츠 활동 | 100% | 12개월 stack + overlay 3 line clamp + 변곡점 timeline 카드 (mockup 외 추가) |
| B 인플 풀 | 100% | 정렬 토글 + 3축 분포 카드 + 채널별 tier (mockup 외 추가) |
| C 콘텐츠 포맷 | 100% | 4 sub-tab + 티어×앵글 히트맵 추가 + cluster row 영상 link |
| D 매출 & BSR | 100% | 6 sub-tab + BSR sub-tab + Kalodata 매출 분해 + BsrTrendChart |
| E Meta 광고 | 100% | 3분류 (본사/유통/인플) + promo code 추출 |
| footer dev | 100% | `.dev-btn` 5 버튼 (status / keyStats / last_error / cost / phase raw) + 옛 case 합치기 dropdown |

---

## 2. v2 이후 작업한 commit (시간순)

| commit | 내용 |
|---|---|
| 4c1d3e8 | 보고서 v2 |
| dde64c1 | Tier A + D1/D3/D4/C5 — mockup parity 주요 개선 |
| 29ac981 | D2/D4 — cases.channel nullable + 옛 case 합치기 마이그 |
| e816456 | Tier B — KPI trend / D SKU 표 / SKU GMV 차트 / heatmap GMV / related-cases |
| a62fab2 | Tier C — 시딩 / promo code / category ranking |
| 52dec90 | 5 이미지 피드백 fix |
| 8acbb63 | 7 피드백 — Top 작성자 expand / hero embed / 티어 앵글 / BSR 시점 |
| 2cd2b8e | 7 fix — Phase progress 위치 / B 채널 filter / SKU 표 더보기 |
| 08571db | Browse 다채널 라벨 + 플랫폼 필터 재추가 |
| 3ff0328 | 데이터 채널별 수집 기간 표시 |
| 05b2ae2 | 변곡점 UX (★ marker + timeline) |
| 48e62a2 | 옛 MD 4 기능 복원 — Kalodata 매출 분해 / IG·YT detail / BSR 시계열 / TK+IG+YT 통합 |
| 965d91e | B 3축 분포 + 본사 시딩 라벨 + Meta 3분류 |
| c8c1a3c | 데이터 채널 expand 적재 후 안내 + 재실행 빠른 버튼 |
| 4d9f192 | 비용 표시 + 무료/유료 phase 분리 2 버튼 |
| 3a81388 | key_stats=null fix |
| 3d8423a | uspSampleVideos IIFE null safety |
| 5bcf46c | 데이터 업로드 위치 안내 명확화 |
| ce8b606 | phase2 없는 case 도 데이터 채널 표시 |
| b0313ed | KPI/데이터 채널/Phase Progress guard 제거 |
| b68dac8 | KPI IG/YT 인플 합산 + phase4c fallback |
| f68a538 | 데이터 채널 자동 detect + A 차트 가독성 |
| c9c5bf6 | SVG line clamp + IG/YT 별도 섹션 제거 + Kalodata channel check 제거 |
| 5a75039 | A 3 fix + B 채널 tier + last_error clear |
| 787025c | tooltip 위치 fix (right:auto) |
| cc65c3d | B IG/YT mode Top 작성자 + 라벨 + unknown 안내 |
| 117d1cc | B 섹션 IG/YT Top — 직접 fetch 사용 |
| ee173dc | Phase 4c.5 IG profile scraper |

---

## 3. 다음 작업 가능 후보

- **cross-platform 매칭 강화** — `linked_handles` jsonb 박힌 case 에서 G InsightCard 의 TK+IG+YT 통합 인플 list 가 bio 기반 매핑 사용 (현재 string normalize 만)
- **YT 채널 profile scraper** — yt_channels 의 일부 row 도 subscriber_count NULL 일 가능
- **Phase 5 synthesis 자동 narrative** — bp-synthesizer subagent 호출 (사용자: 일단 보류)
- **Tier C 데이터 수집 파이프 확장** — Kalodata Live commerce ranking 시계열 / 광고 promo code conversion attribution
