---
status: report
owner: QA 상주 세션
updated: 2026-07-07
source: QA-1 (TODO.md) — 파일럿_리프레시_SharkNinja.md D1 "질문 응답력 매트릭스"
---

# QA-1 — SharkNinja US 파일럿 질문 응답력 매트릭스 (D1)

> 대상: SharkNinja US, `95012d4a-c293-4204-816d-03d0ff02d191` (channel=tiktok_shop, status=ready, O-1 P3 리프레시 완주 2026-07-07).
> 프로덕션 DB SELECT-only 실측. **화면(page.tsx 실제 쿼리) → 뷰(v_case_*) → 원천(base table) 3층**으로 각 질문을 추적, 어느 층에서 끊기는지 판정. 수정 없음.

## 0. 이 케이스의 원천 규모 (실측)

| 소스 | 건수 |
|---|---|
| contents (TT, brand+country 스코프) | 10,139 |
| meta_ads | 221 |
| ig_posts | 3,625 |
| yt_videos | 157 (※ DATA_감사 시점 fleet 전체 60행 — 이 케이스의 오늘 리프레시로 대부분 신규 적재) |
| products | 211 (amazon 200 · tiktok_shop 11 — **case.channel=tiktok_shop이지만 SKU 추적의 95%는 Amazon**) |
| case_product_sales | 210 |
| sales_snapshot (BSR) | 4,031 |
| content_clusters / members | 42 / 1,055 |
| case_video_analyses (vision 태깅) | **508** — contents 10,139건 중 **5.0%** |
| kalodata_videos_xlsx (영상별 GMV) | **10건** — contents 10,139건 중 **0.1%** |
| brand_view_trends | 54주 |
| promotion_events (글로벌) | 0 |

---

## 1. Q1~Q7 응답력 판정

| Q | 화면 | 뷰 | 원천 | 판정 | 근거 |
|---|---|---|---|---|---|
| **Q1** 기간×플랫폼×티어 (TT샵 분리 포함) | 렌더됨 | `v_case_monthly`(134행, tiktok/ig/yt 3채널 전부) + `v_case_tier_dist` | contents/ig_posts/yt_videos 충분 | 🟡 **부분** | 기간·플랫폼·티어는 완전 답변 가능. 단 **`contents.is_shop_content` 컬럼 자체가 DB에 없음**(쿼리 에러로 확인) — "TT샵 분리" 요구사항(스펙 🟡 신규 표기와 일치)은 현재 답 불가 |
| **Q2** 반복 협업자 | 렌더됨 | `v_case_creator_stats` 정상 반환(video_count 2~4 다수 확인) | ig/contents 충분 | 🟢 **가능** | |
| **Q3** 앵글 분포+티어×앵글×월 | 클러스터 목록만 렌더 | 교차뷰 `v_case_angle_tier_month` **미존재**(schema cache 없음 — 스펙 "🟡 신규" 그대로) | content_clusters 42 / case_video_analyses **508건(5.0%)** | 🟡 **부분(표본 얇음)** | 앵글 분포 자체(클러스터)는 나오나, 화면이 직접 티어×월 교차를 못함(코드로 매번 재계산 필요). 태깅 표본이 전체의 5%뿐이라 "티어별 앵글 차이"는 통계적 신뢰도 낮음 |
| **Q4** 발행 변화↔BSR·매출·TT샵 GMV | 렌더됨(BsrSection) | 뷰 없음, page.tsx가 sales_snapshot 직접 페이지네이션 조회 | Amazon BSR: sales_snapshot **4,031행 충분** / TT샵 GMV: kalodata_videos_xlsx **10건뿐** | 🟡 **채널 편차 큼** | Amazon 축은 완전 답변 가능. "TT샵 GMV 확장"(스펙 🟡)은 표본 10건으로 사실상 무의미 |
| **Q5** 매출 기여 콘텐츠 특징 | 부분 렌더(SKU별 명시 링크 영상만) | 교차뷰 `v_case_content_gmv_tags` **미존재** | GMV 연결된 영상 **10건 / vision_tags 508건 — 교집합은 이보다 더 작음** | 🔴 **사실상 답 불가** | GMV×vision_tags를 조인해도 母수 자체가 10건. 스펙 G4("추정 위 추정")가 지적한 문제의 실측 근거 |
| **Q6** 최장 운영 광고 특징 | 렌더됨(BsrSection 유사, ad runtime) | `v_case_ad_runtime` 완전 반환 — origin_class·source_channel·banner_style·hook_type·content_format·creator_read·market_read 전부 채워짐 | meta_ads 221건 | 🟢 **가능(가장 완성도 높음)** | 상위 5건 전부 origin_class=brand_produced, source_channel=brand_original — SharkNinja가 브랜드 자체제작 광고 위주임을 시사 |
| **Q7** 시딩∩광고 인플루언서 교집합 | 렌더 안 됨(교집합 UI 없음) | `v_case_seeding_ad_overlap` **미존재** | **meta_ads.inferred_creator_handle: 221건 중 0건 채워짐** | 🔴 **답 불가 (뷰 문제 아니라 원천 문제)** | 뷰를 만들어도 조인 키가 텅 비어 있어 무의미. Q6 결과(브랜드 자체제작 위주)와 일관 — 이 케이스는 크리에이터 연계 광고 자체가 드물 가능성. 단, "파싱이 안 되는지 vs 진짜 없는지" 구분 못 함(원천 raw meta_ads.body_text/link_url 육안 확인 필요, 본 조사 범위 밖) |

---

## 2. 확장 질문 5개

| 질문 | 판정 | 근거 |
|---|---|---|
| 언어 분포 | 🔴 **수집 자체 없음** | `influencers.language`/`influencers.country` **컬럼이 DB에 없음**(쿼리 에러로 확인). 뷰·화면 이전에 원천 스키마 단계에서 끊김 |
| 시즈널리티 | 🟢 **가능(신규 수집 불필요)** | `v_case_monthly`(월별 발행) × `sales_snapshot`(BSR 시계열, 월 단위 집계 가능) 조합으로 기존 테이블만으로 계절성 추적 가능 |
| 크로스채널 인플루언서 | 🟡 **부분 — 뷰는 있는데 화면이 안 씀** | `v_unified_creators`는 tiktok/instagram/youtube 3채널을 norm_handle로 통합 제공(확인됨). 그런데 `page.tsx`의 `crossPlatformAuthors` 로직은 **IG×YT 두 채널만** 비교(코드 확인, `src/lib/case-detail/bp-analytics.ts` 호출부 `igAll`/`ytAll`만 전달) — 이 케이스 콘텐츠의 95%를 차지하는 **TikTok이 크로스채널 매칭에서 빠짐**. 뷰 레이어는 답할 준비가 됐는데 화면 레이어가 활용을 안 하는 전형적 케이스 |
| 본사 시딩(owned 채널) | 🟢 **가능** | `ig_config.ig_owned_usernames`(2개), `yt_config.yt_owned_channels`(1개), `brand_meta_pages`(4개) 전부 설정 확인 + ig_posts 3,625건·yt_videos 157건 실데이터 존재 |
| SKU 집중도 | 🟢 **가능** | `case_product_sales`(210행)에서 직접 계산: **top 3 SKU가 30일 매출의 24.4%** 차지 (전용 뷰 불필요, ad-hoc 계산으로 충분) |

---

## 3. 완결성 6축 게이지 판독 (BP_재설계_v2.md §1.0.2 기준)

| 축 | 판정 | 근거 |
|---|---|---|
| ① 규모 | 🟢 충분 | contents 10,139·meta_ads 221·ig_posts 3,625·yt_videos 157 — 압도적 |
| ② 구성 | 🟢 충분 | v_case_tier_dist 3채널 전 티어 분포 확보 |
| ③ 콘텐츠 | 🟡 부분 | 클러스터(42/1,055)는 있으나 vision 태깅 표본이 5.0%뿐 |
| ④ 성과 | 🟡 부분(채널 편차) | Amazon BSR 충분(4,031행), TT샵 GMV 빈약(10건) |
| ⑤ 광고 접합 | 🟡 부분 | Q6 충분, Q7은 원천 필드(inferred_creator_handle) 자체가 비어 사실상 0 |
| ⑥ 시점 | 🔴 미충족 | promotion_events **전 함대 0행** — 축 자체가 죽어있음(기존 F3/spec 인지 이슈 재확인) |

**종합: 6축 중 완전 충족 2개(①②), 부분 4개(③④⑤), 미충족 1개(⑥).** "규모"와 "구성"은 리프레시로 확실히 강해졌으나, "성과의 TT샵 GMV"·"광고접합의 크리에이터 연계"·"시점"은 원천 자체의 구조적 공백이라 리프레시 강도를 올려도 해소 안 됨 — D4(자동 인입)·D2(적재 정책) 논의에서 별도 취급 필요.

---

## 4. D1 판정 — 기여 없는 수집물 (삭제 후보 재평가)

파일럿 이전 심증(pilot 문서 §D1) 대비 실측 결과:

| 수집물 | 사전 심증 | 실측 판정 |
|---|---|---|
| `brand_view_trends` | "사용처 불명" | **사용처는 있음**(BrandViewTrendsSection 렌더 + 종합 인사이트카드 weeklyViews prop) — 다만 **Q1~Q7·확장질문 어디에도 담당 질문이 배정되지 않음.** 삭제보다는 "브랜드 배경 리스닝 지표"로 역할 재정의 필요(질문 매트릭스엔 편입 안 함) |
| YT (`yt_videos`) | "전 함대 60행 — 유지 여부 SharkNinja가 판정 근거" | **삭제 반대.** Q1(플랫폼 분리)에 직접 기여(v_case_monthly에 youtube 채널 포함 확인) + 본사 시딩 확장질문에도 기여. 문제는 수집 부족이 아니라 **크로스채널 매칭 코드가 TikTok/YT를 안 씀**(§2) — 코드 보완 대상이지 수집 폐기 대상 아님 |
| IG 글로벌 혼입분 | "혼입 우려" | 이번 조사 범위에서 직접 검증 못함 — ig_posts 3,625건이 브랜드 매칭(brand_matched) 필터를 거치는지는 코드상 확인(`.eq("brand_matched", true)` 다수 사용)되어 있어 구조적으로는 안전. 실제 혼입률 정량화는 후속 조사 필요 |
| `kalodata_videos_xlsx` (영상 GMV) | (미언급) | **표본 10건/10,139건(0.1%)로 Q5·Q4(TT샵) 답변력이 사실상 없음.** 유지는 하되, D2/D4에서 "Kalodata 영상 xlsx 커버리지 확대" 자체를 별도 과제로 격상 권고 |
| `promotion_events` | (스펙에 이미 0행 인지) | 재확인: 전 함대 0행 그대로. ⑥시점 축 전체가 이 테이블 부재로 죽어있음 — WS4 시딩 필요(기존 문서 권고와 동일, 신규 아님) |
| `contents.is_shop_content` | (스펙에 신규 예정) | **컬럼 자체 미존재 재확인.** Q1의 TT샵 분리 요구사항 전체가 이 컬럼 부재로 막혀있음 |

---

## 5. 권고 (조치는 ORCH/BE/WS4 판단, QA는 수정하지 않음)

1. **Q5·Q4(TT샵 GMV)** — Kalodata 영상 xlsx 커버리지가 0.1%로는 두 질문의 답변력이 사실상 없음. D2(적재 방식) 논의에서 "Kalodata 복붙→xlsx 전환 강제"가 실제로 커버리지를 얼마나 올리는지 별도 확인 필요.
2. **Q7** — `v_case_seeding_ad_overlap` 뷰를 만들기 전에 `meta_ads.inferred_creator_handle` 파싱 로직이 SharkNinja류(브랜드 자체제작 위주) 케이스에서 원래 낮게 나오는 게 맞는지, 아니면 파싱 결함인지 BE가 raw ad body_text 샘플로 먼저 확인 권고.
3. **크로스채널 인플루언서(확장질문)** — `v_unified_creators`가 이미 3채널 통합 제공하므로, `page.tsx`의 `crossPlatformAuthors`를 IG×YT 2채널에서 TikTok 포함 3채널로 확장하는 건 뷰 신규 작업 없이 코드만으로 가능. FE-1(WS4b) 범위 포함 검토 권고.
4. **`contents.is_shop_content`** — Q1의 TT샵 분리가 스펙에 이미 "신규" 표기돼 있으나, 이번 실측으로 "컬럼 자체가 없다"는 구체적 확인이 됨 — WS4 착수 시 우선순위 근거로 사용 가능.
5. **`brand_view_trends`** — 삭제하지 말고 "브랜드 배경 리스닝"으로 역할을 명시적으로 재정의(질문 매트릭스와 무관함을 문서화)해 향후 "이거 왜 있지" 재조사 반복을 막을 것.
6. **⑥ 시점 축** — `promotion_events` 시딩은 기존 로드맵 항목 그대로, 이번 조사로 재확인만 함(신규 우선순위 아님).
