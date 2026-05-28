-- 014_yt_brand_monitor.sql
-- 2026-05-28
-- 목적: YouTube 브랜드 모니터링 (Phase 4d) — IG와 같은 패턴 + 차별
--   IG는 reel 중심, YouTube는 long-form + Shorts + 검색 keyword.
--   특히 monetization status / sponsorship 라벨이 IG보다 잘 노출 (YouTube API).
--
-- 4-소스 (IG와 유사 + YT 특화):
--   1. apify/streamers~youtube-scraper × searchQueries (brand keyword 검색)
--   2. apify/streamers~youtube-scraper × startUrls (owned + author seed 채널 deep dive)
--   3. (선택) hashtag 검색 — YT는 hashtag 약함
--
-- 한계 (시스템 가드):
--   - YT는 keyword search alg이 personalized + 영문권 위주
--   - 셀럽 long-form은 channel ID 직접 박는 게 정확 (author_seeds)
--   - sponsorship 라벨은 monetizationStatus 필드 + caption 매칭 hybrid

-- 1. cases.yt_config jsonb
ALTER TABLE cases ADD COLUMN IF NOT EXISTS yt_config jsonb;

COMMENT ON COLUMN cases.yt_config IS
  'YouTube 브랜드 모니터링 구성 (Phase 4d). owned_channels/brand_keywords/regex/author_seeds/celeb_handles/paid_keywords/max_videos/max_shorts';

-- 2. yt_videos
CREATE TABLE IF NOT EXISTS yt_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  yt_id text NOT NULL,
  url text NOT NULL,
  type text,
  channel_name text,
  channel_id text,
  channel_url text,
  subscriber_count bigint,
  title text,
  description text,
  hashtags text[],
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  duration_seconds numeric,
  uploaded_at timestamptz,
  thumbnail_url text,
  source text NOT NULL,
  brand_matched boolean DEFAULT false,
  paid_signal text,
  monetization_status text,
  is_short boolean,
  apify_run_id text,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, yt_id)
);

CREATE INDEX IF NOT EXISTS yt_videos_case_id_idx ON yt_videos (case_id);
CREATE INDEX IF NOT EXISTS yt_videos_case_channel_idx ON yt_videos (case_id, channel_name);
CREATE INDEX IF NOT EXISTS yt_videos_case_brand_matched_idx
  ON yt_videos (case_id, brand_matched) WHERE brand_matched = true;
CREATE INDEX IF NOT EXISTS yt_videos_case_paid_idx
  ON yt_videos (case_id, paid_signal) WHERE paid_signal IS NOT NULL;
CREATE INDEX IF NOT EXISTS yt_videos_case_views_idx
  ON yt_videos (case_id, view_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS yt_videos_case_type_idx ON yt_videos (case_id, type);

-- 3. yt_channels
CREATE TABLE IF NOT EXISTS yt_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  channel_name text NOT NULL,
  channel_id text,
  channel_url text,
  subscriber_count bigint,
  total_videos integer NOT NULL DEFAULT 0,
  brand_matched_videos integer NOT NULL DEFAULT 0,
  paid_videos integer NOT NULL DEFAULT 0,
  shorts_count integer NOT NULL DEFAULT 0,
  longform_count integer NOT NULL DEFAULT 0,
  max_views bigint,
  total_views bigint,
  tier text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, channel_name)
);

CREATE INDEX IF NOT EXISTS yt_channels_case_id_idx ON yt_channels (case_id);
CREATE INDEX IF NOT EXISTS yt_channels_case_tier_idx ON yt_channels (case_id, tier);

-- 4. yt_runs
CREATE TABLE IF NOT EXISTS yt_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source text NOT NULL,
  actor_id text NOT NULL,
  apify_run_id text NOT NULL,
  dataset_id text,
  input jsonb NOT NULL,
  status text,
  items_count integer,
  cost_estimate_usd numeric(10, 4),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (case_id, apify_run_id)
);

CREATE INDEX IF NOT EXISTS yt_runs_case_id_idx ON yt_runs (case_id);

-- 5. RLS 정책 (012 함정 안 반복!)
CREATE POLICY "anon read yt_videos" ON yt_videos FOR SELECT TO anon USING (true);
CREATE POLICY "anon write yt_videos" ON yt_videos FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon read yt_channels" ON yt_channels FOR SELECT TO anon USING (true);
CREATE POLICY "anon write yt_channels" ON yt_channels FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon read yt_runs" ON yt_runs FOR SELECT TO anon USING (true);
CREATE POLICY "anon write yt_runs" ON yt_runs FOR ALL TO anon USING (true) WITH CHECK (true);
