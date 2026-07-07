---
status: report
owner: QA 상주 세션
updated: 2026-07-07
source: QA-2 (TODO.md) — "ready인데 빈 케이스 전수 목록, status vs 실데이터 어긋남 전수 조사"
---

# QA-2 — 케이스 위생 전수 조사 (status vs 실데이터)

> 프로덕션 DB(dxjodlxkynjirldpumxr) SELECT-only 조사. **수정 없음, 판정·권고만.**
> REST 실경로: `src/app/cases/[id]/page.tsx` (케이스 상세 화면이 실제로 읽는 쿼리)를 기준으로 화면 도달 여부까지 확인.
> 스코프: `status in (ready, completed, data_ready)` 87케이스 (2026-07-07 기준. DATA_감사 문서의 "82 ready+4 completed=86"에서 몇 시간 새 +1 변동 — Tirtir US가 그 사이 running→ready로 복구된 것으로 확인, 아래 F3).

## 0. 방법

- anon key(RLS "anon-all" 정책, 문서 §스코프 규칙 그대로)로 REST(PostgREST) 직접 조회. 쓰기 API 호출 없음.
- 케이스 87개 × contents(brand+country 스코프)·products·case_product_sales·ig_posts/authors·yt_videos/channels·meta_ads·content_clusters·case_video_analyses·phase_runs를 전량 페이지네이션 조회 후 케이스별 실측 카운트로 재구성.
- 화면 로직(`page.tsx`)의 `exolytDone`/`salesDone`/`igDone`/`ytDone`/`metaDone`/`ownedChannelDone` 판정식을 그대로 재현해 "설정은 됐는데 실데이터가 0"인 케이스를 골라냄.
- 45/87 케이스(52%)에서 ≥1개 어긋남 발견. 태그별 건수:

| 태그 | 건수 | 의미 |
|---|---|---|
| contents_present_no_vision_tags | 27 | TT 영상은 있는데 Vision 태깅 0 |
| contents_present_no_clusters | 25 | TT 영상은 있는데 클러스터 0 |
| meta_configured_but_empty | 17 | 브랜드키워드/페이지 설정됐는데 meta_ads 0 |
| contents_empty | 9 | TT 영상 자체가 0 (브랜드+국가 스코프) |
| products_empty | 9 | SKU 카탈로그 자체가 0 |
| ig_configured_but_empty | 7 | ig_config 설정됐는데 ig_posts 0 |
| sales_empty_despite_products | 5 | SKU는 있는데 매출행 0 |

**주의(신뢰도 캐치): phase_runs 카운트는 원인 판정 신호로 단독 사용 불가.** 어긋남 없는 "건강한" 케이스도 41/87(47%)이 phase_runs=0 — migration 017 이후 신설 테이블이라 그 이전 실행 이력이 소급 기록 안 된 것으로 추정. 아래 F1·F7은 phase_runs가 아니라 `cases.key_stats`(phase 캐시) vs 실테이블 직접 대조로 판정함.

---

## 1. 핵심 발견 (원인층 판정, 우선순위순)

### 🔴 F1. [근본원인] "ready" 승격에 데이터 완결성 게이트가 아예 없음 — 원인층: **적재/오케스트레이션**

`src/lib/inngest/functions/orchestrate-analysis.ts:279-295` `mark-ready` 스텝:
```ts
await step.run("mark-ready", async () => {
  ...
  await supabase.from("cases").update({ status: "ready", analyzed_at: ..., key_stats: ks }).eq("id", case_id);
});
```
파이프라인이 **예외 없이 끝나기만 하면** 무조건 `status='ready'`로 바꾼다. 각 phase가 실제로 몇 건을 수집했는지는 전혀 검사하지 않는다. 게다가 `src/lib/inngest/functions/run-analysis.ts:44-58`의 `onFailure` 핸들러는 **오케스트레이터 자체가 실패해도** "running에 stuck 방지" 목적으로 `status: "ready"`로 밀어버린다.

→ 이것이 아래 F3~F7 대부분 증상의 공통 뿌리다. "ready"는 "분석이 의미 있게 끝났다"가 아니라 "파이프라인이 안 죽고 리턴했다"만 보증한다.

### 🔴 F2. `salesDone` 게이트가 이름과 다르게 매출이 아니라 SKU 존재만 검사 — 원인층: **화면(코드 로직)**

`src/app/cases/[id]/page.tsx:936-945`:
```ts
const salesDone =
  c.channel === "amazon"
    ? skuRows.length > 0          // ← case_product_sales 존재 여부 무관, products만 체크
    : ...
```
`skuRows`는 `products` 테이블을 그대로 map한 것이라 `case_product_sales`(실매출)가 0행이어도 `products`만 있으면 `salesDone=true`가 된다. 실측 결과 **5케이스**(medicube US, Dr. Althea US, Anua US, CKD guaranteed US, SimplyVital US)가 SKU는 1~8개 있는데 매출 행이 0개인 채로 ready/completed. Amazon 채널의 "매출 분석 완료" 표시를 믿을 수 없다는 뜻.

### 🔴 F3. Terez & Honor(US, `44770b8b`) — key_stats엔 광고 789건 있는데 실테이블(`meta_ads`)은 0행 — 원인층: **적재 유실 (뷰/화면 도달 실패)**

`cases.key_stats.phase4a`에 `total_ads:789, active_ads:216, cost_actual_usd:0.75`, 실제 영상/썸네일 URL까지 박힌 상세 캐시가 남아있음(2026-05-06 계산). 그런데 화면이 실제로 읽는 `meta_ads` 테이블은 **0행**(직접 count 쿼리로 재확인). 돈까지 쓰고($0.75) 수집한 789건의 광고 분석 결과가 화면에서 완전히 사라진 상태 — key_stats 캐시에만 남고 정규 테이블 upsert가 유실됐거나, 이후 테이블만 비워지고 캐시가 안 지워진 것. 비교군: 같은 목록의 Drunk Elephant(US)는 `phase4a.skipped_reason:"결과 0건"`로 **진짜** 0건이라 정상 케이스 — 이런 대조가 없으면 놓치기 쉬운 유형.

### 🟡 F4. Tirtir US(`25a99e35`) — F3(DATA_감사) 문서가 언급한 "24h+ stuck→ready 복구" 케이스, 데이터는 여전히 전무 — 원인층: **운영(수동 상태 전환, 검증 없음)**

`updated_at=2026-07-06T17:41`, `last_error` 없음(F1의 자동 onFailure 경로가 아니라 수동 UPDATE로 추정), `phase_runs=0`, contents/products/sales/ig/yt 전부 0, meta 설정도 없음(`metaCfg=false`). TODO.md QA-2 항목이 예시로 든 "Tirtir US 류"가 바로 이 케이스로 확인됨 — stuck job을 "ready"로 되돌리는 운영 작업이 데이터 실체 확인 없이 상태값만 바꾼 사례.

### 🟡 F5. channel=NULL 3케이스(biodance/Torriden/Equalberry, 전부 US) — 원인층: **원천(브랜드 데이터 전무) + 케이스 생성 결함**

3케이스 모두 `created_at=2026-06-29T10:18:13`(초 단위까지 동일 — 배치 생성) & `channel` 컬럼이 **NULL**(`cases.channel`은 앱 타입상 NOT NULL enum인데 실제로 null 허용됨 — 스키마 제약 부재 가능성, BE 확인 필요). `key_stats.phase2~phase5`가 전부 정상 완주했지만 `total_contents:0, total_seeded:0, total_creators:0` 등 전 항목 0으로 채워짐(phase5는 `skipped_reason:"메타 클러스터 없음"`). F1의 게이트 부재로 인해 "빈 입력 → 빈 파이프라인 → ready"가 그대로 통과된 전형적 사례. 브랜드 자체에 어느 국가로도 TT 콘텐츠가 전혀 없음(§F6에서 확인).

### 🟡 F6. 브랜드+국가 스코프 미스매치 — 5케이스가 "형제 케이스"의 국가 태그로만 콘텐츠 보유 — 원인층: **원천(해당 국가분 미수집)**

`contents`는 브랜드+국가 스코프(케이스 직속 FK 아님, spec/01 §1). `contents_empty` 9케이스 중 6곳은 브랜드 전체를 뒤져보면 **다른 국가 태그로는 데이터가 존재**:

| 케이스 | 자기 국가 실측 0 | 브랜드가 실제로 데이터 가진 국가 |
|---|---|---|
| Tirtir US | 0 | PL (556건) — Tirtir PL 케이스(`25deff54`) 존재 |
| Celimax US | 0 | LATAM (1000+건) |
| Haruharu wonder GB | 0 | EU (1000+건) |
| Dr. for hair KR | 0 | US (326건) |
| Aromatica KR | 0 | US (1000+건) |

→ 시스템 버그 아님(설계대로 브랜드+국가 스코프 조인). 다만 **이 케이스들 자신의 국가분은 한 번도 수집된 적이 없는데 status=ready**라는 뜻 — F1 게이트 부재의 또 다른 증상. Torriden US·Unove KR·Equalberry US(나머지 3케이스)는 브랜드 전체에 어느 국가로도 콘텐츠가 전혀 없음(순수 원천 부재).

### 🟢 F7. 대형/유명 브랜드가 owned-channel 경로로 ready 승격 → 커머스(SKU/매출) 섹션이 통째로 빔 — 원인층: **설계 갭(제품 정의)**

`ready = (commerceReady || ownedChannelDone) && ...`(page.tsx:955) 구조상 IG/YT/Meta 중 하나만 설정돼 있어도 "ready" 승격 조건을 만족한다. 실측 결과 Poppi(US)·Dyson(US)·Seoul beauty club(US)·Deoproce(PH)·Skin1004(PL) — **콘텐츠 1,200~9,900건, Meta/IG 데이터도 풍부한 대형 케이스들**이 `products=0`(Amazon SKU/매출 없음)인 채로 ready. "ready" 라벨이 "브랜드 모니터링 완료"와 "커머스 매출 분석 완료"를 구분 안 해서 생기는 혼선 — F3(DATA_감사)가 언급한 "완결성 게이지(WS4)"가 정확히 이 문제를 겨냥한 것으로 보임. 버그라기보다 화면에 완결성 신호가 없는 제품 갭.

### ⚪ F8. IG/Meta 설정만 되고 수집 자체가 안 도는 케이스 다수 — 원인층: **원천/트리거 (미실행, 판정 근거 약함)**

`ig_configured_but_empty` 7케이스 전부 `key_stats.phase4c`가 **키 자체가 없음**("MISSING" — 실행된 적 없음, 실패해서 없는 게 아니라 애초에 안 돎). `meta_configured_but_empty` 17케이스 중 15곳도 `phase4a` 키 자체가 없음(F3의 Terez & Honor, Drunk Elephant 2곳만 실행 이력 있음). ig_config/brand_meta_pages는 사용자가 명시적으로 입력한 값이라 "설정 의도"는 확실한데, 그에 대응하는 collect-ig(phase4c)/collect-meta(phase4a) 트리거가 한 번도 안 돎. **다만 phase_runs 신뢰도 캐치(§0)와 같은 이유로 "언제부터 안 돌았는지" 시점 확정은 어려움** — BE가 트리거 조건(예: 케이스 생성 이후 별도 버튼/이벤트 필요 여부)을 직접 확인 권장.

---

## 2. 전수 목록 (45케이스, 브랜드순)

| 브랜드 | 국가 | 채널 | 상태 | case_id | 태그 |
|---|---|---|---|---|---|
| Anua | ID | tiktok_shop | ready | cbf090f2 | contents_present_no_clusters, contents_present_no_vision_tags |
| Anua | MY | tiktok_shop | ready | 0238f6b0 | contents_present_no_clusters, contents_present_no_vision_tags |
| Anua | TH | tiktok_shop | ready | b4f326a3 | contents_present_no_clusters, contents_present_no_vision_tags |
| Anua | US | amazon | ready | 90bc3317 | sales_empty_despite_products (F2) |
| Arencia | GB | amazon | ready | 0184f21c | ig_configured_but_empty, meta_configured_but_empty (F8), contents_present_no_clusters/vision |
| Aromatica | KR | amazon | ready | a7ce6a0f | contents_empty, products_empty (F6 — 실데이터는 US 케이스에) |
| Beauty of Joseon | GB | amazon | ready | fb3ded9a | contents_present_no_clusters/vision |
| Beauty of Joseon | ID | tiktok_shop | ready | 63ada76e | contents_present_no_clusters/vision |
| Beauty of Joseon | MY | tiktok_shop | ready | 8e1aa849 | contents_present_no_clusters/vision |
| Beauty of Joseon | PL | amazon | ready | 1dec31f4 | meta_configured_but_empty (F8), contents_present_no_clusters/vision |
| Beauty of Joseon | TH | tiktok_shop | ready | c8914da9 | contents_present_no_clusters/vision |
| CKD guaranteed | US | amazon | completed | a6000e91 | sales_empty_despite_products (F2) |
| Celimax | US | amazon | ready | 7d082bcf | contents_empty (F6 — 실데이터는 LATAM 태그) |
| Deoproce | PH | amazon | ready | 503e34ac | products_empty (F7), ig/meta_configured_but_empty (F8) |
| Dr. Althea | GB | amazon | ready | 9a03a2f3 | ig/meta_configured_but_empty (F8), no_clusters/vision |
| Dr. Althea | US | amazon | completed | c31e5a68 | sales_empty_despite_products (F2) |
| Dr. Dennis Gross | US | amazon | ready | 114e9e95 | meta_configured_but_empty (F8), no_clusters/vision |
| Dr. for hair | KR | amazon | ready | 085c6294 | contents_empty, products_empty (F6 — 실데이터는 US 태그) |
| Drunk Elephant | US | amazon | ready | 542e7625 | meta_configured_but_empty (실행됨, 진짜 0건 — 정상) |
| Dyson | US | amazon | ready | 95f367ea | products_empty (F7 — 대형 케이스) |
| Equalberry | US | **NULL** | ready | 918b749e | contents_empty (F5) |
| Erborian | FR | amazon | ready | b7cf9e5f | meta_configured_but_empty (F8), no_clusters/vision |
| Hanni Smooth | US | amazon | ready | c5b68976 | ig/meta_configured_but_empty (F8), no_clusters/vision |
| Haruharu wonder | GB | amazon | ready | b8a98d68 | contents_empty (F6 — EU 태그), ig/meta_configured_but_empty |
| Illiyoon | US | amazon | ready | 8d5802a5 | contents_present_no_clusters/vision |
| Kundal | GB | amazon | ready | 668276e6 | contents_present_no_clusters/vision |
| Kundal | US | amazon | ready | 092f9ef8 | ig/meta_configured_but_empty (F8), no_clusters/vision |
| Lepique | MENA | amazon | ready | 26466599 | contents_present_no_clusters |
| Menokin | US | amazon | ready | 6ffcc0d2 | meta_configured_but_empty (F8), no_clusters/vision |
| Poppi | US | amazon | ready | 6ee2a076 | products_empty (F7 — 대형 케이스) |
| Saltair | US | amazon | ready | bdc0e972 | meta_configured_but_empty (F8), no_clusters/vision |
| Seoul beauty club | US | amazon | ready | bf73e541 | products_empty (F7) |
| SimplyVital | US | amazon | completed | f724e382 | sales_empty_despite_products (F2) |
| Skin1004 | PL | amazon | ready | b43161f9 | products_empty (F7), meta_configured_but_empty (F8) |
| Skintific | US | amazon | ready | 0f27d509 | meta_configured_but_empty (F8), no_clusters/vision |
| Summer Fridays | US | amazon | ready | 1055d5a3 | ig/meta_configured_but_empty (F8), no_clusters/vision |
| Terez & Honor | US | amazon | ready | 44770b8b | meta_configured_but_empty — **F3 (적재 유실, 789건 캐시 있음)** |
| Tirtir | PL | amazon | ready | 25deff54 | meta_configured_but_empty (F8), no_clusters/vision |
| Tirtir | US | amazon | ready | 25a99e35 | contents_empty, products_empty — **F4 (수동 unstick)** |
| Tocobo | LATAM | amazon | ready | d94d6fd5 | contents_present_no_clusters |
| Torriden | US | **NULL** | ready | ed5623cd | contents_empty (F5) |
| Unove | KR | amazon | ready | 3dc22dda | contents_empty, products_empty (F6 — 브랜드 자체에 콘텐츠 없음) |
| biodance | KR | other | completed | 83fcd709 | contents_present_no_vision_tags |
| biodance | US | **NULL** | ready | 3bd04219 | contents_empty (F5) |
| medicube | US | amazon | ready | 11821fa3 | sales_empty_despite_products (F2) |

`contents_present_no_clusters`/`contents_present_no_vision_tags` 25~27건은 **BE-1/BE-2(TODO.md, F1 클러스터 잔재 재실행)로 이미 트래킹 중인 이슈와 상당 부분 겹칠 가능성 높음** — 별도 신규 이슈로 취급하지 말고 BE-2 완료 후 재조사 권고.

---

## 3. 권고 (조치는 ORCH/BE 판단, QA는 수정하지 않음)

1. **F1(근본원인)** — `orchestrate-analysis.ts` mark-ready 스텝에 최소 완결성 체크(예: 모든 채널이 0건이면 `status='data_ready'`나 별도 라벨로) 도입 검토. BE 판단 필요.
2. **F2** — `salesDone` 이름과 실제 동작(SKU 존재만 체크) 불일치. 최소한 화면에 "매출 미업로드" 배지라도 필요. BE-1/WS4 완결성 게이지 범위에 포함 권고.
3. **F3** — Terez & Honor 789건 유실은 **재수집 없이 먼저 원인 규명 필요**(phase4a → meta_ads upsert 코드 경로 확인). 유료 API 재호출 전 원인 파악 우선.
4. **F4** — Tirtir US는 데이터가 전무하므로 재분석(`case/start.analysis`) 대상으로 큐잉 권고. 향후 stuck-job 수동 복구 시 데이터 실측 체크리스트 추가 제안.
5. **F5** — channel=NULL 3케이스는 브랜드 자체에 TT 콘텐츠가 없어 재분석해도 결과가 같을 가능성 높음 — 케이스 생성 경위(배치 생성 로그) 확인 후 폐기 또는 데이터 재확보 여부 결정 필요.
6. **F6** — Tirtir US/Celimax US/Haruharu wonder GB/Dr. for hair KR/Aromatica KR: 국가별 콘텐츠 업로드가 실제로 필요한지(중복 케이스 정리 대상인지) 케이스 생성 의도 확인 필요.
7. **F7** — WS4 완결성 게이지에서 "커머스 vs 브랜드 모니터링" 두 종류의 ready를 구분 표시하면 해소.
8. **F8** — phase_runs가 migration 017 이전 이력을 못 담아 신뢰도가 낮음(§0). BE가 collect-ig/collect-meta 트리거 조건을 직접 확인 권고 — QA 조사만으로는 "왜 안 돌았는지" 확정 불가.
