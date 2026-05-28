-- 012_ig_brand_monitor.sql
-- 2026-05-28
-- 목적: Instagram 브랜드 모니터링 (Phase 4c)
--   카테고리 정의자 BP (SharkNinja/Dyson/Medicube/Poppi) 분석을 위해 IG 데이터 도입.
--   TikTok-only 시스템의 가장 큰 gap이었던 셀럽/메가 인플 풀을 IG에서 잡음.
--
-- 4-소스 통합 (검증 완료, 2026-05-28 SharkNinja dry-run에서 결정):
--   1. apify/instagram-hashtag-scraper × brand hashtag (resultsType=posts/reels)
--   2. apify/instagram-post-scraper × owned usernames + 외부 데스크리서치 셀럽 seed
--   3. apify/instagram-scraper search user (brand keyword)
--   4. apify/instagram-reel-scraper × celeb handles (sponsorship 라벨 잡힘)
--
-- 한계 (시스템 설계에 박은 가드):
--   - paid partnership 라벨은 IG가 API에 노출 안 함 → caption regex로 우회 (#ad/Anzeige/광고 등)
--   - hashtag scraper로는 IG 검색 reels 탭 결과 못 잡음 (알고리즘 차이) → author seeding 필수
--   - 시간 깊이 최근 1-3개월 위주 (resultsLimit 한계)

-- ==============================================================
-- 1. cases.ig_config (jsonb) — 케이스별 IG 검색 구성
-- ==============================================================
-- 7-필드 구조:
--   ig_owned_usernames: string[]      — 브랜드 owned 계정 (ninjakitchen, ninjakitchenuk)
--   ig_brand_hashtags: string[]       — 브랜드 해시태그 변형 (NinjaCREAMI, NinjaSwirl, NinjaPartner)
--   ig_brand_regex: string[]          — caption 매칭용 regex (단독 "ninja" 금지)
--   ig_author_seeds: string[]         — 외부 데스크리서치 발견 작성자 (haleyybaylee, ambardriscoll)
--   ig_celeb_handles: string[]        — 셀럽 핸들 (davidbeckham, kevinhart4real)
--   ig_paid_keywords: string[]        — paid 시그널 캡션 키워드 (#ad, paid partnership, 광고)
--   ig_use_reels_type: boolean        — hashtag-scraper resultsType="reels" 사용 여부

ALTER TABLE cases ADD COLUMN IF NOT EXISTS ig_config jsonb;

COMMENT ON COLUMN cases.ig_config IS
  'IG 브랜드 모니터링 구성 (Phase 4c). 7 필드 jsonb: owned/hashtags/regex/author_seeds/celeb_handles/paid_keywords/use_reels_type.';

-- ==============================================================
-- 2. ig_posts — 수집된 IG post/reel 정규화
-- ==============================================================
-- 모든 소스 (hashtag/search/owned/reel) 통합 후 dedup by ig_id.
-- caption regex 매칭 후처리해서 brand_matched flag 박음.

CREATE TABLE IF NOT EXISTS ig_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

  -- IG 식별
  ig_id text NOT NULL,                  -- IG post id (3897780097658293113)
  short_code text NOT NULL,             -- IG shortcode (DYXslj1got5)
  url text NOT NULL,                    -- https://www.instagram.com/p/.../ 또는 /reel/.../

  -- 작성자
  owner_username text NOT NULL,
  owner_full_name text,
  owner_id text,

  -- 콘텐츠
  type text,                            -- "Image" / "Video" / "Sidecar"
  caption text,
  hashtags text[],                      -- IG가 자동 추출
  mentions text[],

  -- engagement
  likes_count bigint,
  comments_count bigint,
  video_play_count bigint,              -- reel/video만
  video_view_count bigint,
  video_duration numeric,

  -- 시간 + 미디어
  posted_at timestamptz,                -- IG timestamp
  display_url text,                     -- 썸네일/이미지
  video_url text,                       -- video URL (만료성)

  -- 분류 (후처리)
  source text NOT NULL,                 -- "hashtag" / "search" / "owned" / "author_seed" / "celeb_reel"
  brand_matched boolean DEFAULT false,  -- caption regex 매칭 결과
  paid_signal text,                     -- 매칭된 paid 키워드 (#ad / paid partnership / NULL)
  sponsorship_status text,              -- reel-scraper의 sponsorshipStatus 필드 (있을 때만)

  -- 메타
  apify_run_id text,                    -- 어느 run에서 왔는지 (디버그)
  raw jsonb,                            -- 원본 (필드 추가/디버그용)
  fetched_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, ig_id)
);

CREATE INDEX IF NOT EXISTS ig_posts_case_id_idx ON ig_posts (case_id);
CREATE INDEX IF NOT EXISTS ig_posts_case_owner_idx ON ig_posts (case_id, owner_username);
CREATE INDEX IF NOT EXISTS ig_posts_case_brand_matched_idx
  ON ig_posts (case_id, brand_matched) WHERE brand_matched = true;
CREATE INDEX IF NOT EXISTS ig_posts_case_paid_idx
  ON ig_posts (case_id, paid_signal) WHERE paid_signal IS NOT NULL;
CREATE INDEX IF NOT EXISTS ig_posts_case_likes_idx
  ON ig_posts (case_id, likes_count DESC NULLS LAST);

COMMENT ON TABLE ig_posts IS
  'IG 수집 post/reel. case당 unique ig_id. source 필드로 어느 소스에서 잡혔는지 추적. brand_matched로 caption regex 매칭 결과 분리.';

-- ==============================================================
-- 3. ig_authors — 작성자 unique 집계 (티어 분류 후처리)
-- ==============================================================
-- ig_posts에서 owner_username 추출 후 fans 룩업 (옵션: instagram-profile-scraper).
-- TikTok influencers 테이블과 분리 — IG 작성자는 별도 식별자.

CREATE TABLE IF NOT EXISTS ig_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

  username text NOT NULL,
  full_name text,
  owner_id text,

  -- ig_posts 기준 집계
  total_posts integer NOT NULL DEFAULT 0,            -- 우리 풀에 잡힌 영상 수
  brand_matched_posts integer NOT NULL DEFAULT 0,    -- brand regex 매칭된 수
  paid_posts integer NOT NULL DEFAULT 0,             -- paid signal 있는 수
  max_likes bigint,
  max_views bigint,
  total_likes bigint,                                -- 합 (engagement 추정)

  -- 팔로워 (룩업 시점에 채움 — Phase 4c.5 optional)
  followers bigint,
  followers_source text,                             -- "profile-scraper" / "manual" / "unknown"

  -- 티어 (followers 기준 분류)
  tier text,                                         -- "mega"/"macro"/"mid"/"micro"/"nano"/"sub_nano"/"unknown"

  -- 첫 출현 / 마지막 출현 (신규/기존 비율 산출용)
  first_seen_at timestamptz,
  last_seen_at timestamptz,

  -- 메타
  computed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, username)
);

CREATE INDEX IF NOT EXISTS ig_authors_case_id_idx ON ig_authors (case_id);
CREATE INDEX IF NOT EXISTS ig_authors_case_tier_idx ON ig_authors (case_id, tier);

COMMENT ON TABLE ig_authors IS
  'IG 작성자 unique. ig_posts 후처리로 채움. followers 룩업은 optional (instagram-profile-scraper).';

-- ==============================================================
-- 4. ig_runs — Apify run 추적 (dedup, 재실행, 비용 추적)
-- ==============================================================
CREATE TABLE IF NOT EXISTS ig_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,

  source text NOT NULL,                 -- "hashtag" / "search" / "owned" / "author_seed" / "celeb_reel"
  actor_id text NOT NULL,               -- "apify~instagram-hashtag-scraper" 등
  apify_run_id text NOT NULL,
  dataset_id text,

  input jsonb NOT NULL,                 -- 호출 input (재현 가능)
  status text,                          -- "SUCCEEDED" / "FAILED" / "TIMED-OUT"
  items_count integer,
  cost_estimate_usd numeric(10, 4),

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,

  UNIQUE (case_id, apify_run_id)
);

CREATE INDEX IF NOT EXISTS ig_runs_case_id_idx ON ig_runs (case_id);

COMMENT ON TABLE ig_runs IS
  'IG Apify run 추적. case당 unique run_id. 재실행/비용/디버그용.';
