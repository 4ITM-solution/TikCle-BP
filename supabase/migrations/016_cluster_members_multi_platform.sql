-- 016: content_cluster_members 다채널 지원 (TT + IG + YT 통합 클러스터)
--
-- 기존 schema: content_id(uuid NOT NULL) → case_video_analyses.content_id 외래 참조.
-- IG/YT는 ig_posts.ig_id / yt_videos.yt_id 가 text라 들어갈 수 없음.
--
-- 변경:
--   - content_id NULL 허용 (TikTok 외 채널 row)
--   - platform 컬럼 추가 (tiktok / instagram / youtube)
--   - external_ref 컬럼 추가 (IG: ig_id, YT: yt_id; TikTok: NULL)
--
-- TikTok 호환: 기존 row는 platform='tiktok'으로 backfill, content_id 그대로.

ALTER TABLE content_cluster_members
  ALTER COLUMN content_id DROP NOT NULL;

ALTER TABLE content_cluster_members
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'tiktok';

ALTER TABLE content_cluster_members
  ADD COLUMN IF NOT EXISTS external_ref text;

-- 기존 row backfill (DEFAULT가 신규 INSERT에만 적용되므로 UPDATE)
UPDATE content_cluster_members SET platform = 'tiktok' WHERE platform IS NULL;

CREATE INDEX IF NOT EXISTS idx_cluster_members_platform_ref
  ON content_cluster_members(platform, external_ref);

CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster_platform
  ON content_cluster_members(cluster_id, platform);
