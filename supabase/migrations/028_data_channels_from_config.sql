-- 028: data_channels를 "케이스에 실제로 박힌 설정" 기준으로 재보정
--
-- 배경 — 015는 "수집된 행이 있으면 채널을 켠다"로 backfill 했다. 그런데
-- orchestrate-analysis가 이 파생 컬럼을 실행 게이트로 썼기 때문에 순환이 생겼다:
--   meta_ads 행 없음 → meta_ads 채널 OFF → collect-meta 스킵 → 행이 안 생김 → 영원히 OFF
-- 게다가 컬럼 DEFAULT가 '[]'인데 게이트는 NULL만 "미설정=전부 허용"으로 봐서,
-- 신규 케이스(= 빈 배열)는 모든 수집이 통째로 스킵됐다.
--
-- 게이트 자체는 코드에서 설정 기준으로 옮겼으므로(orchestrate-analysis.ts) 이 마이그레이션은
-- 기능상 필수는 아니다. UI 채널 표시 정합과, 구버전 코드가 떠 있는 동안의 안전망 목적.
--
-- 성질: 가산 전용(기존 값 제거 없음) · 멱등 · 실제 변하는 행만 UPDATE.

update cases c
set data_channels = t.next
from (
  select
    c2.id,
    (
      select jsonb_agg(distinct ch order by ch)
      from (
        -- 기존 값 보존
        select jsonb_array_elements_text(coalesce(c2.data_channels, '[]'::jsonb)) as ch
        -- 설정 기준
        union all select 'meta_ads'
          where c2.brand_keyword is not null
             or coalesce(array_length(c2.brand_meta_pages, 1), 0) > 0
        union all select 'instagram' where c2.ig_config is not null
        union all select 'youtube'   where c2.yt_config is not null
        union all select 'tt_shop'
          where c2.tiktok_shop_store_url is not null or c2.channel::text = 'tiktok_shop'
        union all select 'amazon'    where c2.channel::text = 'amazon'
        -- 행 기준 (015 규칙 유지)
        union all select 'meta_ads'  where exists (select 1 from meta_ads m  where m.case_id = c2.id)
        union all select 'instagram' where exists (select 1 from ig_posts p  where p.case_id = c2.id)
        union all select 'youtube'   where exists (select 1 from yt_videos y where y.case_id = c2.id)
        union all select 'tiktok_video'
          where exists (select 1 from contents ct where ct.brand_id = c2.brand_id)
      ) s
    ) as next
  from cases c2
) t
where c.id = t.id
  and t.next is not null
  and c.data_channels is distinct from t.next;
