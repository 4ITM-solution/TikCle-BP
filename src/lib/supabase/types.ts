/**
 * Supabase 데이터베이스 타입.
 *
 * 정확한 타입은 `npm run db:types` 로 자동 생성하면 `types.gen.ts` 가 만들어집니다.
 * 그 전까지는 핵심 테이블만 손으로 정의해 둡니다.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CaseStatus =
  | "draft"
  | "data_ready"
  | "running"
  | "ready"
  | "failed"
  | "queued"
  | "completed"
  | "archived";

export type Platform = "AMAZON" | "TIKTOK_SHOP";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      brands: {
        Row: {
          id: string;
          name: string;
          country: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      brand_view_trends: {
        Row: {
          id: string;
          brand_id: string;
          country: string | null;
          week_start: string;
          total_views: number;
          total_videos: number;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          country?: string | null;
          week_start: string;
          total_views: number;
          total_videos: number;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          country?: string | null;
          week_start?: string;
          total_views?: number;
          total_videos?: number;
          source?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_view_trends_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };

      cases: {
        Row: {
          id: string;
          brand_id: string;
          country: string;
          channel: string;
          status: CaseStatus;
          revenue_tier: string | null;
          brand_keyword: string | null;
          brand_meta_pages: string[] | null;
          tiktok_shop_store_url: string | null;
          ig_config: Json | null;
          yt_config: Json | null;
          key_stats: Json | null;
          options: Json | null;
          analyzed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          country: string;
          channel: string;
          status?: CaseStatus;
          revenue_tier?: string | null;
          brand_keyword?: string | null;
          brand_meta_pages?: string[] | null;
          tiktok_shop_store_url?: string | null;
          ig_config?: Json | null;
          yt_config?: Json | null;
          key_stats?: Json | null;
          options?: Json | null;
          analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          country?: string;
          channel?: string;
          status?: CaseStatus;
          revenue_tier?: string | null;
          brand_keyword?: string | null;
          brand_meta_pages?: string[] | null;
          tiktok_shop_store_url?: string | null;
          ig_config?: Json | null;
          yt_config?: Json | null;
          key_stats?: Json | null;
          options?: Json | null;
          analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cases_brand_id_fkey";
            columns: ["brand_id"];
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };

      products: {
        Row: {
          id: string;
          case_id: string | null;
          brand_id: string;
          country: string | null;
          name: string;
          asin: string | null;
          external_product_id: string | null;
          product_url: string | null;
          platform: string | null;
          channel: string;
          price: number | null;
          category: string | null;
          subcategory: string | null;
          launch_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          case_id?: string | null;
          brand_id: string;
          country?: string | null;
          name: string;
          asin?: string | null;
          external_product_id?: string | null;
          product_url?: string | null;
          platform?: string | null;
          channel: string;
          price?: number | null;
          category?: string | null;
          subcategory?: string | null;
          launch_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string | null;
          brand_id?: string;
          country?: string | null;
          name?: string;
          asin?: string | null;
          external_product_id?: string | null;
          product_url?: string | null;
          platform?: string | null;
          channel?: string;
          price?: number | null;
          category?: string | null;
          subcategory?: string | null;
          launch_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      contents: {
        Row: {
          id: string;
          brand_id: string;
          country: string | null;
          product_id: string | null;
          influencer_id: string | null;
          url: string;
          uploaded_at: string | null;
          is_ad: boolean;
          views: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          collect_count: number | null;
          caption: string | null;
          hashtags: string | null;
          engagement_rate: number | null;
          duration_ms: number | null;
          sentiment: string | null;
          language: string | null;
          captured_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          country?: string | null;
          product_id?: string | null;
          influencer_id?: string | null;
          url: string;
          uploaded_at?: string | null;
          is_ad?: boolean;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          collect_count?: number | null;
          caption?: string | null;
          hashtags?: string | null;
          engagement_rate?: number | null;
          duration_ms?: number | null;
          sentiment?: string | null;
          language?: string | null;
          captured_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          country?: string | null;
          product_id?: string | null;
          influencer_id?: string | null;
          url?: string;
          uploaded_at?: string | null;
          is_ad?: boolean;
          views?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          collect_count?: number | null;
          caption?: string | null;
          hashtags?: string | null;
          engagement_rate?: number | null;
          duration_ms?: number | null;
          sentiment?: string | null;
          language?: string | null;
          captured_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      case_product_sales: {
        Row: {
          id: string;
          case_id: string;
          product_id: string;
          country: string | null;
          units_30d: number | null;
          revenue_30d: number | null;
          price: number | null;
          currency: string;
          period_start: string | null;
          period_end: string | null;
          source: string | null;
          captured_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          product_id: string;
          country?: string | null;
          units_30d?: number | null;
          revenue_30d?: number | null;
          price?: number | null;
          currency?: string;
          period_start?: string | null;
          period_end?: string | null;
          source?: string | null;
          captured_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          product_id?: string;
          country?: string | null;
          units_30d?: number | null;
          revenue_30d?: number | null;
          price?: number | null;
          currency?: string;
          period_start?: string | null;
          period_end?: string | null;
          source?: string | null;
          captured_at?: string;
        };
        Relationships: [];
      };

      sales_snapshot: {
        Row: {
          id: string;
          brand_id: string;
          product_id: string;
          country: string | null;
          channel: string;
          units_sold: number | null;
          revenue: number | null;
          bsr: number | null;
          subcategory_bsr: number | null;
          new_price: number | null;
          list_price: number | null;
          currency: string;
          source: string | null;
          collected_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          product_id: string;
          country?: string | null;
          channel: string;
          units_sold?: number | null;
          revenue?: number | null;
          bsr?: number | null;
          subcategory_bsr?: number | null;
          new_price?: number | null;
          list_price?: number | null;
          currency?: string;
          source?: string | null;
          collected_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          product_id?: string;
          country?: string | null;
          channel?: string;
          units_sold?: number | null;
          revenue?: number | null;
          bsr?: number | null;
          subcategory_bsr?: number | null;
          new_price?: number | null;
          list_price?: number | null;
          currency?: string;
          source?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      app_settings: {
        Row: {
          key: string;
          value: unknown;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: unknown;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: unknown;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };

      influencers: {
        Row: {
          id: string;
          platform: string;
          external_id: string;
          handle: string;
          tier: string | null;
          follower_count: number | null;
          fans_source: string | null;
          is_tiktok_shop_creator: boolean | null;
          tiktok_shop_checked_at: string | null;
          shop_creator_class: string | null;
          shop_creator_gmv_range: string | null;
          lifetime_gmv_usd: number | null;
          gpm_usd: number | null;
          post_rate: number | null;
          total_brand_collabs: number | null;
          top_brands: unknown | null;
          bio: string | null;
          region: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform: string;
          external_id: string;
          handle: string;
          tier?: string | null;
          follower_count?: number | null;
          fans_source?: string | null;
          is_tiktok_shop_creator?: boolean | null;
          tiktok_shop_checked_at?: string | null;
          shop_creator_class?: string | null;
          shop_creator_gmv_range?: string | null;
          lifetime_gmv_usd?: number | null;
          gpm_usd?: number | null;
          post_rate?: number | null;
          total_brand_collabs?: number | null;
          top_brands?: unknown | null;
          bio?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          external_id?: string;
          handle?: string;
          tier?: string | null;
          follower_count?: number | null;
          fans_source?: string | null;
          is_tiktok_shop_creator?: boolean | null;
          tiktok_shop_checked_at?: string | null;
          shop_creator_class?: string | null;
          shop_creator_gmv_range?: string | null;
          lifetime_gmv_usd?: number | null;
          gpm_usd?: number | null;
          post_rate?: number | null;
          total_brand_collabs?: number | null;
          top_brands?: unknown | null;
          bio?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      pipeline_runs: {
        Row: {
          id: string;
          case_id: string;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          current_phase: number | null;
          options: Json | null;
          cost_estimate: number | null;
          cost_actual: number | null;
          phase_logs: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          current_phase?: number | null;
          options?: Json | null;
          cost_estimate?: number | null;
          cost_actual?: number | null;
          phase_logs?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          current_phase?: number | null;
          options?: Json | null;
          cost_estimate?: number | null;
          cost_actual?: number | null;
          phase_logs?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      meta_ads: {
        Row: {
          id: string;
          case_id: string;
          ad_archive_id: string | null;
          page_name: string | null;
          page_id: string | null;
          format: string | null;
          start_date: string | null;
          end_date: string | null;
          is_active: boolean | null;
          body_text: string | null;
          title: string | null;
          cta_type: string | null;
          cta_text: string | null;
          link_url: string | null;
          thumbnail_url: string | null;
          video_url: string | null;
          is_brand_official: boolean | null;
          creator_page_name: string | null;
          partner_page_name: string | null;
          partner_page_id: string | null;
          snapshot: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          ad_archive_id?: string | null;
          page_name?: string | null;
          page_id?: string | null;
          format?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean | null;
          body_text?: string | null;
          title?: string | null;
          cta_type?: string | null;
          cta_text?: string | null;
          link_url?: string | null;
          thumbnail_url?: string | null;
          video_url?: string | null;
          is_brand_official?: boolean | null;
          creator_page_name?: string | null;
          partner_page_name?: string | null;
          partner_page_id?: string | null;
          snapshot?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          ad_archive_id?: string | null;
          page_name?: string | null;
          page_id?: string | null;
          format?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_active?: boolean | null;
          body_text?: string | null;
          title?: string | null;
          cta_type?: string | null;
          cta_text?: string | null;
          link_url?: string | null;
          thumbnail_url?: string | null;
          video_url?: string | null;
          is_brand_official?: boolean | null;
          creator_page_name?: string | null;
          partner_page_name?: string | null;
          partner_page_id?: string | null;
          snapshot?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      content_clusters: {
        Row: {
          id: string;
          case_id: string;
          name: string;
          description: string | null;
          hook_pattern: string | null;
          body_pattern: string | null;
          is_meta: boolean | null;
          parent_cluster_id: string | null;
          member_count: number | null;
          avg_views: number | null;
          median_collect_rate_pct: number | null;
          display_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          name: string;
          description?: string | null;
          hook_pattern?: string | null;
          body_pattern?: string | null;
          is_meta?: boolean | null;
          parent_cluster_id?: string | null;
          member_count?: number | null;
          avg_views?: number | null;
          median_collect_rate_pct?: number | null;
          display_order?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          name?: string;
          description?: string | null;
          hook_pattern?: string | null;
          body_pattern?: string | null;
          is_meta?: boolean | null;
          parent_cluster_id?: string | null;
          member_count?: number | null;
          avg_views?: number | null;
          median_collect_rate_pct?: number | null;
          display_order?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      content_cluster_members: {
        Row: {
          cluster_id: string;
          content_id: string;
          rank_in_cluster: number | null;
        };
        Insert: {
          cluster_id: string;
          content_id: string;
          rank_in_cluster?: number | null;
        };
        Update: {
          cluster_id?: string;
          content_id?: string;
          rank_in_cluster?: number | null;
        };
        Relationships: [];
      };

      case_video_analyses: {
        Row: {
          id: string;
          case_id: string;
          content_id: string;
          asr_text: string | null;
          cover_url: string | null;
          video_download_url: string | null;
          vision_tags: Json | null;
          matched_sku_ids: string[] | null;
          pass1_label: string | null;
          pass2_label: string | null;
          pass3_meta_id: string | null;
          analyzed_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          content_id: string;
          asr_text?: string | null;
          cover_url?: string | null;
          video_download_url?: string | null;
          vision_tags?: Json | null;
          matched_sku_ids?: string[] | null;
          pass1_label?: string | null;
          pass2_label?: string | null;
          pass3_meta_id?: string | null;
          analyzed_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          content_id?: string;
          asr_text?: string | null;
          cover_url?: string | null;
          video_download_url?: string | null;
          vision_tags?: Json | null;
          matched_sku_ids?: string[] | null;
          pass1_label?: string | null;
          pass2_label?: string | null;
          pass3_meta_id?: string | null;
          analyzed_at?: string;
        };
        Relationships: [];
      };

      case_video_assets: {
        Row: {
          id: string;
          case_id: string;
          content_id: string;
          video_storage_path: string | null;
          cover_storage_path: string | null;
          thumb_storage_path: string | null;
          downloaded_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          content_id: string;
          video_storage_path?: string | null;
          cover_storage_path?: string | null;
          thumb_storage_path?: string | null;
          downloaded_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          content_id?: string;
          video_storage_path?: string | null;
          cover_storage_path?: string | null;
          thumb_storage_path?: string | null;
          downloaded_at?: string;
        };
        Relationships: [];
      };

      ig_posts: {
        Row: {
          id: string;
          case_id: string;
          ig_id: string;
          short_code: string;
          url: string;
          owner_username: string;
          owner_full_name: string | null;
          owner_id: string | null;
          type: string | null;
          caption: string | null;
          hashtags: string[] | null;
          mentions: string[] | null;
          likes_count: number | null;
          comments_count: number | null;
          video_play_count: number | null;
          video_view_count: number | null;
          video_duration: number | null;
          posted_at: string | null;
          display_url: string | null;
          video_url: string | null;
          source: string;
          brand_matched: boolean;
          paid_signal: string | null;
          sponsorship_status: string | null;
          apify_run_id: string | null;
          raw: Json | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          ig_id: string;
          short_code: string;
          url: string;
          owner_username: string;
          owner_full_name?: string | null;
          owner_id?: string | null;
          type?: string | null;
          caption?: string | null;
          hashtags?: string[] | null;
          mentions?: string[] | null;
          likes_count?: number | null;
          comments_count?: number | null;
          video_play_count?: number | null;
          video_view_count?: number | null;
          video_duration?: number | null;
          posted_at?: string | null;
          display_url?: string | null;
          video_url?: string | null;
          source: string;
          brand_matched?: boolean;
          paid_signal?: string | null;
          sponsorship_status?: string | null;
          apify_run_id?: string | null;
          raw?: Json | null;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          ig_id?: string;
          short_code?: string;
          url?: string;
          owner_username?: string;
          owner_full_name?: string | null;
          owner_id?: string | null;
          type?: string | null;
          caption?: string | null;
          hashtags?: string[] | null;
          mentions?: string[] | null;
          likes_count?: number | null;
          comments_count?: number | null;
          video_play_count?: number | null;
          video_view_count?: number | null;
          video_duration?: number | null;
          posted_at?: string | null;
          display_url?: string | null;
          video_url?: string | null;
          source?: string;
          brand_matched?: boolean;
          paid_signal?: string | null;
          sponsorship_status?: string | null;
          apify_run_id?: string | null;
          raw?: Json | null;
          fetched_at?: string;
        };
        Relationships: [];
      };

      ig_authors: {
        Row: {
          id: string;
          case_id: string;
          username: string;
          full_name: string | null;
          owner_id: string | null;
          total_posts: number;
          brand_matched_posts: number;
          paid_posts: number;
          max_likes: number | null;
          max_views: number | null;
          total_likes: number | null;
          followers: number | null;
          followers_source: string | null;
          tier: string | null;
          first_seen_at: string | null;
          last_seen_at: string | null;
          computed_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          username: string;
          full_name?: string | null;
          owner_id?: string | null;
          total_posts?: number;
          brand_matched_posts?: number;
          paid_posts?: number;
          max_likes?: number | null;
          max_views?: number | null;
          total_likes?: number | null;
          followers?: number | null;
          followers_source?: string | null;
          tier?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          computed_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          username?: string;
          full_name?: string | null;
          owner_id?: string | null;
          total_posts?: number;
          brand_matched_posts?: number;
          paid_posts?: number;
          max_likes?: number | null;
          max_views?: number | null;
          total_likes?: number | null;
          followers?: number | null;
          followers_source?: string | null;
          tier?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          computed_at?: string;
        };
        Relationships: [];
      };

      ig_runs: {
        Row: {
          id: string;
          case_id: string;
          source: string;
          actor_id: string;
          apify_run_id: string;
          dataset_id: string | null;
          input: Json;
          status: string | null;
          items_count: number | null;
          cost_estimate_usd: number | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          case_id: string;
          source: string;
          actor_id: string;
          apify_run_id: string;
          dataset_id?: string | null;
          input: Json;
          status?: string | null;
          items_count?: number | null;
          cost_estimate_usd?: number | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          case_id?: string;
          source?: string;
          actor_id?: string;
          apify_run_id?: string;
          dataset_id?: string | null;
          input?: Json;
          status?: string | null;
          items_count?: number | null;
          cost_estimate_usd?: number | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };

      yt_videos: {
        Row: {
          id: string;
          case_id: string;
          yt_id: string;
          url: string;
          type: string | null;
          channel_name: string | null;
          channel_id: string | null;
          channel_url: string | null;
          subscriber_count: number | null;
          title: string | null;
          description: string | null;
          hashtags: string[] | null;
          view_count: number | null;
          like_count: number | null;
          comment_count: number | null;
          duration_seconds: number | null;
          uploaded_at: string | null;
          thumbnail_url: string | null;
          source: string;
          brand_matched: boolean;
          paid_signal: string | null;
          monetization_status: string | null;
          is_short: boolean | null;
          apify_run_id: string | null;
          raw: Json | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          yt_id: string;
          url: string;
          type?: string | null;
          channel_name?: string | null;
          channel_id?: string | null;
          channel_url?: string | null;
          subscriber_count?: number | null;
          title?: string | null;
          description?: string | null;
          hashtags?: string[] | null;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          duration_seconds?: number | null;
          uploaded_at?: string | null;
          thumbnail_url?: string | null;
          source: string;
          brand_matched?: boolean;
          paid_signal?: string | null;
          monetization_status?: string | null;
          is_short?: boolean | null;
          apify_run_id?: string | null;
          raw?: Json | null;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          yt_id?: string;
          url?: string;
          type?: string | null;
          channel_name?: string | null;
          channel_id?: string | null;
          channel_url?: string | null;
          subscriber_count?: number | null;
          title?: string | null;
          description?: string | null;
          hashtags?: string[] | null;
          view_count?: number | null;
          like_count?: number | null;
          comment_count?: number | null;
          duration_seconds?: number | null;
          uploaded_at?: string | null;
          thumbnail_url?: string | null;
          source?: string;
          brand_matched?: boolean;
          paid_signal?: string | null;
          monetization_status?: string | null;
          is_short?: boolean | null;
          apify_run_id?: string | null;
          raw?: Json | null;
          fetched_at?: string;
        };
        Relationships: [];
      };

      yt_channels: {
        Row: {
          id: string;
          case_id: string;
          channel_name: string;
          channel_id: string | null;
          channel_url: string | null;
          subscriber_count: number | null;
          total_videos: number;
          brand_matched_videos: number;
          paid_videos: number;
          shorts_count: number;
          longform_count: number;
          max_views: number | null;
          total_views: number | null;
          tier: string | null;
          first_seen_at: string | null;
          last_seen_at: string | null;
          computed_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          channel_name: string;
          channel_id?: string | null;
          channel_url?: string | null;
          subscriber_count?: number | null;
          total_videos?: number;
          brand_matched_videos?: number;
          paid_videos?: number;
          shorts_count?: number;
          longform_count?: number;
          max_views?: number | null;
          total_views?: number | null;
          tier?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          computed_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          channel_name?: string;
          channel_id?: string | null;
          channel_url?: string | null;
          subscriber_count?: number | null;
          total_videos?: number;
          brand_matched_videos?: number;
          paid_videos?: number;
          shorts_count?: number;
          longform_count?: number;
          max_views?: number | null;
          total_views?: number | null;
          tier?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          computed_at?: string;
        };
        Relationships: [];
      };

      yt_runs: {
        Row: {
          id: string;
          case_id: string;
          source: string;
          actor_id: string;
          apify_run_id: string;
          dataset_id: string | null;
          input: Json;
          status: string | null;
          items_count: number | null;
          cost_estimate_usd: number | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          case_id: string;
          source: string;
          actor_id: string;
          apify_run_id: string;
          dataset_id?: string | null;
          input: Json;
          status?: string | null;
          items_count?: number | null;
          cost_estimate_usd?: number | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          case_id?: string;
          source?: string;
          actor_id?: string;
          apify_run_id?: string;
          dataset_id?: string | null;
          input?: Json;
          status?: string | null;
          items_count?: number | null;
          cost_estimate_usd?: number | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
