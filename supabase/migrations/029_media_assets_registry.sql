-- 029_media_assets_registry.sql
-- 소재(파일 내용) 단위 저장 레지스트리 — content-addressed 업로드의 인덱스.
--
-- 배경 — storage path를 ad_archive_id 기준으로 잡아서, 메타가 같은 영상을 광고 건마다
-- 다른 ad_archive_id로 노출할 때마다 동일 바이트가 물리 복제됐다.
-- (Anua: 25.1MB 영상 1개가 13개 사본. 최근 30일 유입 18.77GB 중 6.13GB(33%)가 중복)
-- 2026-08-25에 중복 5,707개 12.57GB를 수동 정리했지만 크롤러가 그대로면 재발한다.
--
-- 이 테이블이 "이 md5는 이미 어디에 올라가 있다"의 단일 출처다.
-- 업로더(src/lib/storage/asset-downloader.ts)는 버퍼 md5로 여기를 먼저 조회하고,
-- 히트하면 업로드를 생략한 채 기존 storage_path의 public URL을 돌려준다.
--
-- ⚠️ 이 마이그레이션은 파일을 지우거나 옮기지 않는다. 기존 경로는 전부 그대로 살아있다.
--    보존기간(retention) 로직도 없다 (정책 미정).

create table if not exists media_assets (
  hash          text primary key,          -- 파일 내용 md5 (hex 32자)
  storage_path  text not null,             -- case-assets 버킷 내 object name
  mime          text,
  bytes         bigint,
  first_seen_at timestamptz default now()
);

comment on table media_assets is
  '소재 파일 내용(md5) → storage 경로 레지스트리. 같은 바이트를 두 번 올리지 않기 위한 인덱스.';
comment on column media_assets.hash is
  '파일 내용 md5 hex 32자. 업로더가 버퍼에서 직접 계산한다 (S3 eTag가 아님 — 멀티파트는 md5가 아니라서).';
comment on column media_assets.storage_path is
  'case-assets 버킷 안의 object name. 신규 업로드는 by-hash/{md5}.{ext}, 백필분은 옛 ad_archive_id 경로.';

-- 경로 → 해시 역방향 조회용. 크롤러가 "이미 저장된 옛 경로 파일"의 해시를 알아낼 때 쓴다.
create index if not exists media_assets_storage_path_idx on media_assets (storage_path);

alter table media_assets enable row level security;

-- meta_ads / tracked_brand_ads 와 같은 정책 (앱은 anon + service role 양쪽에서 접근).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'media_assets'
      and policyname = 'anon_all_media_assets'
  ) then
    create policy anon_all_media_assets on media_assets
      for all to anon using (true) with check (true);
  end if;
end $$;

-- ─── 백필 ────────────────────────────────────────────────────────────────────
-- storage.objects.metadata->>'eTag' 는 단일 파트 업로드에서 내용 md5와 같다.
-- 멀티파트 업로드는 '{md5-of-md5s}-{part수}' 형태라 내용 md5가 아니므로 제외한다.
--   (적용 시점 실측: 전체 18,559개 중 32자 hex 18,270개 / 멀티파트 289개 = 6.1GB)
-- 제외된 289개는 레지스트리에 없으므로, 그 바이트가 다시 들어오면 by-hash/ 로 한 번
-- 업로드된 뒤부터 dedupe 된다. 기존 파일은 그대로 보존된다.
--
-- 같은 hash가 여럿이면 name 최솟값 1개만 (distinct on + order by).
insert into media_assets (hash, storage_path, mime, bytes, first_seen_at)
select distinct on (s.etag) s.etag, s.name, s.mime, s.bytes, s.created_at
from (
  select trim(both '"' from coalesce(o.metadata->>'eTag', '')) as etag,
         o.name,
         o.metadata->>'mimetype'                              as mime,
         nullif(o.metadata->>'size', '')::bigint              as bytes,
         coalesce(o.created_at, now())                        as created_at
  from storage.objects o
  where o.bucket_id = 'case-assets'
) s
where s.etag ~ '^[0-9a-f]{32}$'
order by s.etag, s.name
on conflict (hash) do nothing;

-- 적용 후 확인:
--   select count(*) from media_assets;
--   -- 백필에서 빠진 멀티파트 객체 수
--   select count(*) from storage.objects
--    where bucket_id='case-assets'
--      and trim(both '"' from coalesce(metadata->>'eTag','')) !~ '^[0-9a-f]{32}$';
