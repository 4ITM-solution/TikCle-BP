import Papa from "papaparse";
import { isoToDate, stripBom, toNum } from "./utils";

export type ExolytRow = {
  username: string;
  url: string;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collect_count: number | null;
  engagement_rate: number | null;
  uploaded_at: string | null; // YYYY-MM-DD
  duration_ms: number | null;
  is_ad: boolean;
  hashtags: string | null;
  sentiment: string | null;
};

/**
 * exolyt 1년 콘텐츠 CSV 파서.
 */
export function parseExolyt(raw: string): {
  rows: ExolytRow[];
  errors: string[];
  totalLines: number;
  skippedNoUsername: number;
  skippedNoUrl: number;
  duplicateUrls: number;
  detectedHeaders: string[];
} {
  const csv = stripBom(raw);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = parsed.errors.map(
    (e) => `[row ${e.row}] ${e.message}`,
  );
  const detectedHeaders = parsed.data[0] ? Object.keys(parsed.data[0]) : [];

  const rows: ExolytRow[] = [];
  const seenUrls = new Set<string>();
  let skippedNoUsername = 0;
  let skippedNoUrl = 0;
  let duplicateUrls = 0;

  for (const r of parsed.data) {
    if (!r.username) {
      skippedNoUsername += 1;
      continue;
    }
    if (!r.url) {
      skippedNoUrl += 1;
      continue;
    }
    const url = r.url.trim();
    if (seenUrls.has(url)) {
      duplicateUrls += 1;
      // 그래도 push (마지막 본 row 기준 dedupe는 upload-actions에서 함)
    } else {
      seenUrls.add(url);
    }

    rows.push({
      username: r.username.trim(),
      url,
      caption: r.title?.trim() || null,
      views: toNum(r.views),
      likes: toNum(r.likes),
      comments: toNum(r.comments),
      shares: toNum(r.shares),
      collect_count: toNum(r.favourited),
      engagement_rate: toNum(r["engagement_rate_%"]),
      uploaded_at: isoToDate(r.uploaded ?? r.video_upload_date),
      duration_ms: toNum(r.duration_ms),
      is_ad: r.promoted?.trim().toUpperCase() === "PROMOTED",
      hashtags: r.hashtags?.trim() || null,
      sentiment: r.sentiment?.trim() || null,
    });
  }

  return {
    rows,
    errors,
    totalLines: parsed.data.length,
    skippedNoUsername,
    skippedNoUrl,
    duplicateUrls,
    detectedHeaders,
  };
}
