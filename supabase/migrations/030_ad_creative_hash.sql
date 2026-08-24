-- 030_ad_creative_hash.sql
-- 광고 행에 "이 광고가 쓴 소재의 md5" 를 박는다 → 소재 1개 ↔ 광고 N건 집계.
--
-- 메타는 같은 영상을 광고 건마다 다른 ad_archive_id로 노출한다. ad_archive_id로는
-- "같은 소재를 몇 개 광고로 돌렸나 / 소재 기준 총 활성기간" 을 못 센다.
-- 029의 media_assets.hash 를 광고 행에 실어두면 그 집계가 group by 한 줄이 된다.
--
-- ⚠️ 광고 레코드는 지우지 않는다. 광고 건수 자체가 지표다. 컬럼만 추가한다.
--
-- 값 규칙: 영상 광고면 영상 md5, 영상이 없으면 썸네일 md5 (coalesce(video, thumb)).
--          크롤러(scrape-tracked-brand.ts / phase4a.ts)도 같은 규칙으로 채운다.

alter table meta_ads          add column if not exists ad_creative_hash text;
alter table tracked_brand_ads add column if not exists ad_creative_hash text;

comment on column meta_ads.ad_creative_hash is
  '소재 파일 md5 (media_assets.hash). 영상 우선, 없으면 썸네일. 소재 단위 집계 키.';
comment on column tracked_brand_ads.ad_creative_hash is
  '소재 파일 md5 (media_assets.hash). 영상 우선, 없으면 썸네일. 소재 단위 집계 키.';

create index if not exists meta_ads_ad_creative_hash_idx
  on meta_ads (ad_creative_hash);
create index if not exists tracked_brand_ads_ad_creative_hash_idx
  on tracked_brand_ads (ad_creative_hash);

-- ─── 기존 행 백필 ────────────────────────────────────────────────────────────
-- video_url / thumbnail_url 이 이미 case-assets public URL 이면 그 object name 을 뽑아
-- storage.objects 의 eTag 와 직접 조인한다. 재다운로드 없음.
--
-- ⚠️ media_assets.storage_path 로 조인하면 안 된다 — 029는 같은 hash 당 경로를 1개만
--    (name 최솟값) 담는데, 광고 URL이 그 중 다른 사본을 가리키면 통째로 안 잡힌다
--    (실측 34행). 원본 eTag를 보면 사본이든 정본이든 같은 해시로 맞아떨어진다.
-- 멀티파트로 올라간 객체는 eTag가 내용 md5가 아니라 제외된다 → NULL 유지.

update meta_ads a
set ad_creative_hash = coalesce(vo.md5, to_.md5)
from (
  select id,
         nullif(split_part(split_part(video_url,     '?', 1), '/object/public/case-assets/', 2), '') as vpath,
         nullif(split_part(split_part(thumbnail_url, '?', 1), '/object/public/case-assets/', 2), '') as tpath
  from meta_ads
  where ad_creative_hash is null
    and (video_url like '%/object/public/case-assets/%'
      or thumbnail_url like '%/object/public/case-assets/%')
) m
left join lateral (
  select trim(both '"' from coalesce(o.metadata->>'eTag', '')) as md5
  from storage.objects o
  where o.bucket_id = 'case-assets' and o.name = m.vpath
    and trim(both '"' from coalesce(o.metadata->>'eTag', '')) ~ '^[0-9a-f]{32}$'
) vo on true
left join lateral (
  select trim(both '"' from coalesce(o.metadata->>'eTag', '')) as md5
  from storage.objects o
  where o.bucket_id = 'case-assets' and o.name = m.tpath
    and trim(both '"' from coalesce(o.metadata->>'eTag', '')) ~ '^[0-9a-f]{32}$'
) to_ on true
where a.id = m.id
  and coalesce(vo.md5, to_.md5) is not null;

update tracked_brand_ads a
set ad_creative_hash = coalesce(vo.md5, to_.md5)
from (
  select id,
         nullif(split_part(split_part(video_url,     '?', 1), '/object/public/case-assets/', 2), '') as vpath,
         nullif(split_part(split_part(thumbnail_url, '?', 1), '/object/public/case-assets/', 2), '') as tpath
  from tracked_brand_ads
  where ad_creative_hash is null
    and (video_url like '%/object/public/case-assets/%'
      or thumbnail_url like '%/object/public/case-assets/%')
) m
left join lateral (
  select trim(both '"' from coalesce(o.metadata->>'eTag', '')) as md5
  from storage.objects o
  where o.bucket_id = 'case-assets' and o.name = m.vpath
    and trim(both '"' from coalesce(o.metadata->>'eTag', '')) ~ '^[0-9a-f]{32}$'
) vo on true
left join lateral (
  select trim(both '"' from coalesce(o.metadata->>'eTag', '')) as md5
  from storage.objects o
  where o.bucket_id = 'case-assets' and o.name = m.tpath
    and trim(both '"' from coalesce(o.metadata->>'eTag', '')) ~ '^[0-9a-f]{32}$'
) to_ on true
where a.id = m.id
  and coalesce(vo.md5, to_.md5) is not null;

-- 적용 후 확인 — 소재 1개에 광고 N건이 잡히는지:
--   select ad_creative_hash, count(*)
--     from tracked_brand_ads
--    where ad_creative_hash is not null
--    group by 1 having count(*) > 1
--    order by 2 desc;
