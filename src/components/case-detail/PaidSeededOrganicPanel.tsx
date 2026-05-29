import type { Phase2Stats } from "@/lib/inngest/types";

/**
 * PaidSeededOrganicPanel — mockup line 1015-1022 1:1.
 *
 * 전 채널 콘텐츠 FTC 자동 분류:
 *   - ad (paid_signal=ad / promoted): 분홍
 *   - seeded (gifted / sample): 노랑
 *   - organic: 녹색
 *
 * 데이터: phase2.monthly_video_counts.paid/organic 합산.
 * 채널별 ad 비중 line (TK / IG / YT): phase2.monthly_by_channel 합산.
 *
 * NOTE: seeded(gifted) 구분은 phase2 raw에 없어 현재 paid 안 포함.
 *       데이터 모델 확장 시 분리 가능. 지금은 paid + organic 만 표시.
 */
export function PaidSeededOrganicPanel({ phase2 }: { phase2: Phase2Stats }) {
  const totalPaid = phase2.monthly_video_counts.reduce((s, m) => s + m.paid, 0);
  const totalOrganic = phase2.monthly_video_counts.reduce(
    (s, m) => s + m.organic,
    0,
  );
  const totalAll = totalPaid + totalOrganic;

  if (totalAll === 0) {
    return (
      <div
        style={{
          padding: 16,
          background: "var(--color-g25)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--color-g500)",
        }}
      >
        분류 가능한 콘텐츠 없음. Phase 2 분석 후 표시됩니다.
      </div>
    );
  }

  const adPct = Math.round((totalPaid / totalAll) * 100);
  const organicPct = Math.round((totalOrganic / totalAll) * 100);

  // 채널별 ad 비중 — monthly_by_channel 합산 (있을 때만)
  const ch = phase2.monthly_by_channel;
  const chSums = (rows?: typeof phase2.monthly_video_counts) => {
    if (!rows) return { paid: 0, total: 0 };
    let paid = 0;
    let total = 0;
    for (const r of rows) {
      paid += r.paid;
      total += r.total;
    }
    return { paid, total };
  };
  const tk = chSums(ch?.tk ?? phase2.monthly_video_counts);
  const ig = chSums(ch?.ig);
  const yt = chSums(ch?.yt);

  const channelLine = [
    tk.total > 0 ? `TK ${Math.round((tk.paid / tk.total) * 100)}%` : null,
    ig.total > 0 ? `IG ${Math.round((ig.paid / ig.total) * 100)}%` : null,
    yt.total > 0 ? `YT ${Math.round((yt.paid / yt.total) * 100)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-g500)", marginBottom: 10 }}>
        전 채널 콘텐츠 FTC 자동 분류 (paid_signal · is_ad / promoted 기반)
      </div>

      <Row
        color="#ec4899"
        label="ad"
        count={totalPaid}
        pct={adPct}
        max={totalAll}
      />
      <Row
        color="#10b981"
        label="organic"
        count={totalOrganic}
        pct={organicPct}
        max={totalAll}
      />

      {channelLine && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--color-g500)",
          }}
        >
          채널별 ad 비중: {channelLine}
        </div>
      )}
    </div>
  );
}

function Row({
  color,
  label,
  count,
  pct,
  max,
}: {
  color: string;
  label: string;
  count: number;
  pct: number;
  max: number;
}) {
  const widthPct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 60px 50px",
        gap: 10,
        alignItems: "center",
        fontSize: 11,
        padding: "6px 0",
      }}
    >
      <span style={{ color }}>● {label}</span>
      <div
        style={{
          height: 14,
          background: "var(--color-g50)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: "100%",
            background: color,
          }}
        />
      </div>
      <span
        style={{
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
        }}
      >
        {count.toLocaleString()}
      </span>
      <span
        style={{
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          color: "var(--color-g500)",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
