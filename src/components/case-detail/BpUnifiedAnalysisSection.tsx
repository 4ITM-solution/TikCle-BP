import type {
  MonthlyBucket,
  PoolSummary,
  TierBucket,
} from "@/lib/case-detail/bp-analytics";

export type CrossPlatformAuthor = {
  name: string;          // username (IG) 또는 channel_name (YT)
  ig_posts: number;
  ig_paid: number;
  ig_max_likes: number | null;
  yt_videos: number;
  yt_paid: number;
  yt_max_views: number | null;
};

/**
 * BP 통합 분석 섹션 — IG + YouTube 데이터 합쳐서 카테고리 정의자 모델 검증.
 *
 * IG/YT 각 raw 섹션 다음에 박힘. 통합 인사이트만 표시:
 *   1. 통합 풀 summary (IG + YT 합)
 *   2. 통합 티어 분포 (IG/YT 스택 막대)
 *   3. 통합 월별 트렌드 (IG/YT 두 라인)
 *   4. Cross-platform 인플 (IG + YT 둘 다 활동 — 강한 brand affinity 시그널)
 *   5. IG vs YT 비중 (도넛 또는 비교 막대)
 */
export function BpUnifiedAnalysisSection({
  hasIg,
  hasYt,
  igPool,
  ytPool,
  igTier,
  ytTier,
  igMonthly,
  ytMonthly,
  crossPlatform,
}: {
  hasIg: boolean;
  hasYt: boolean;
  igPool: PoolSummary;
  ytPool: PoolSummary;
  igTier: TierBucket[];
  ytTier: TierBucket[];
  igMonthly: MonthlyBucket[];
  ytMonthly: MonthlyBucket[];
  crossPlatform: CrossPlatformAuthor[];
}) {
  if (!hasIg && !hasYt) return null;

  // 통합 합계
  const totalAuthors = igPool.total_authors + ytPool.total_authors;
  const totalPaid = igPool.paid_authors + ytPool.paid_authors;
  const totalOwned = igPool.owned_authors + ytPool.owned_authors;
  const totalRepeat = igPool.repeat_authors + ytPool.repeat_authors;

  return (
    <section
      style={{
        marginTop: 32,
        padding: 24,
        borderRadius: 8,
        border: "1px solid var(--color-border, #e5e7eb)",
        background: "var(--color-surface, #fff)",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 4px 0" }}>
          ⭐ BP 통합 분석 (IG + YouTube)
        </h2>
        <p style={{ margin: 0, color: "var(--color-text-muted, #6b7280)", fontSize: 12 }}>
          카테고리 정의자 모델 종합 — IG{hasIg ? ` ${igPool.total_authors}명` : " ❌"} · YT
          {hasYt ? ` ${ytPool.total_authors}개 채널` : " ❌"} 합쳐 분석.
        </p>
      </header>

      {/* 1. 통합 풀 summary */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>👥 통합 풀 summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <PoolStat
            label="총 인플"
            value={totalAuthors}
            note={`IG ${igPool.total_authors} + YT ${ytPool.total_authors}`}
          />
          <PoolStat
            label="paid 인플"
            value={totalPaid}
            note={`${totalAuthors > 0 ? Math.round((totalPaid / totalAuthors) * 100) : 0}%`}
          />
          <PoolStat
            label="owned 채널"
            value={totalOwned}
            note={`IG ${igPool.owned_authors} + YT ${ytPool.owned_authors}`}
          />
          <PoolStat
            label="repeat (committed)"
            value={totalRepeat}
            note="5+ 영상 반복 게시"
          />
        </div>
      </div>

      {/* 2. 통합 티어 분포 (IG/YT 스택 막대) */}
      {(igTier.length > 0 || ytTier.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 4px 0" }}>
            📊 통합 티어 분포 (IG + YT 스택)
          </h3>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8 }}>
            IG는 max_likes proxy, YT는 subscriber 정확. 같은 티어 라벨이지만 의미 다름.
            <span style={{ marginLeft: 8 }}>
              <span style={{ color: "#3b82f6" }}>■</span> IG
              <span style={{ marginLeft: 8, color: "#dc2626" }}>■</span> YT
            </span>
          </div>
          <StackedTierBars igTier={igTier} ytTier={ytTier} />
        </div>
      )}

      {/* 3. 통합 월별 트렌드 (IG/YT 라인) */}
      {(igMonthly.length > 0 || ytMonthly.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 4px 0" }}>
            📈 월별 트렌드 (IG + YT)
          </h3>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8 }}>
            <span style={{ color: "#3b82f6" }}>■</span> IG posts ·
            <span style={{ marginLeft: 8, color: "#dc2626" }}>■</span> YT videos ·
            <span style={{ marginLeft: 8, color: "#f59e0b" }}>■</span> paid overlay
          </div>
          <DualMonthlyBars igMonthly={igMonthly} ytMonthly={ytMonthly} />
        </div>
      )}

      {/* 4. Cross-platform 인플 (IG + YT 둘 다 활동) */}
      {crossPlatform.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 4px 0" }}>
            🔗 Cross-platform 인플 (IG + YT 모두 활동)
          </h3>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 8 }}>
            같은 이름이 IG와 YT 모두에 잡힌 작성자 — 강한 brand affinity. (이름 부분 일치
            매칭, 100% 정확하지 않음)
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: 6 }}>이름</th>
                <th style={{ padding: 6, textAlign: "right" }}>IG posts</th>
                <th style={{ padding: 6, textAlign: "right" }}>IG paid</th>
                <th style={{ padding: 6, textAlign: "right" }}>IG max likes</th>
                <th style={{ padding: 6, textAlign: "right" }}>YT videos</th>
                <th style={{ padding: 6, textAlign: "right" }}>YT paid</th>
                <th style={{ padding: 6, textAlign: "right" }}>YT max views</th>
              </tr>
            </thead>
            <tbody>
              {crossPlatform.slice(0, 15).map((a) => (
                <tr
                  key={a.name}
                  style={{ borderBottom: "1px solid var(--color-border-soft, #f3f4f6)" }}
                >
                  <td style={{ padding: 6, fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.ig_posts}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.ig_paid}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {a.ig_max_likes != null ? formatNum(a.ig_max_likes) : "—"}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.yt_videos}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>{a.yt_paid}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    {a.yt_max_views != null ? formatNum(a.yt_max_views) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. IG vs YT 비중 (비교 막대) */}
      {hasIg && hasYt && (
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>⚖ IG vs YouTube 비중</h3>
          <PlatformBalance
            igPool={igPool}
            ytPool={ytPool}
            igMonthly={igMonthly}
            ytMonthly={ytMonthly}
          />
        </div>
      )}
    </section>
  );
}

// ─── helpers ───────────────────────────────────────────────

const TIER_COLOR_IG = "#3b82f6";
const TIER_COLOR_YT = "#dc2626";

function PoolStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: 6,
        background: "var(--color-bg-soft, #f9fafb)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-muted, #6b7280)",
          fontWeight: 600,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {note && (
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
          {note}
        </div>
      )}
    </div>
  );
}

function StackedTierBars({
  igTier,
  ytTier,
}: {
  igTier: TierBucket[];
  ytTier: TierBucket[];
}) {
  // 같은 티어 키로 IG/YT 합쳐서 표시
  const tiers: Array<"mega" | "macro" | "mid" | "micro" | "nano" | "unknown"> = [
    "mega",
    "macro",
    "mid",
    "micro",
    "nano",
    "unknown",
  ];
  const igMap = new Map(igTier.map((t) => [t.tier, t]));
  const ytMap = new Map(ytTier.map((t) => [t.tier, t]));

  const max = Math.max(
    ...tiers.map((t) => (igMap.get(t)?.authors ?? 0) + (ytMap.get(t)?.authors ?? 0)),
    1,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tiers.map((t) => {
        const ig = igMap.get(t);
        const yt = ytMap.get(t);
        const igCount = ig?.authors ?? 0;
        const ytCount = yt?.authors ?? 0;
        const total = igCount + ytCount;
        if (total === 0) return null;
        const igWidth = (igCount / max) * 100;
        const ytWidth = (ytCount / max) * 100;
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                minWidth: 64,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "#374151",
              }}
            >
              {t}
            </span>
            <div
              style={{
                flex: 1,
                height: 18,
                background: "var(--color-bg-soft, #f3f4f6)",
                borderRadius: 4,
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div
                style={{
                  width: `${igWidth}%`,
                  height: "100%",
                  background: TIER_COLOR_IG,
                  opacity: 0.85,
                }}
                title={`IG ${igCount}명 (영상 ${ig?.videos ?? 0}, paid ${ig?.paid_videos ?? 0})`}
              />
              <div
                style={{
                  width: `${ytWidth}%`,
                  height: "100%",
                  background: TIER_COLOR_YT,
                  opacity: 0.85,
                }}
                title={`YT ${ytCount}개 (영상 ${yt?.videos ?? 0}, paid ${yt?.paid_videos ?? 0})`}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                minWidth: 130,
                textAlign: "right",
              }}
            >
              <span style={{ color: TIER_COLOR_IG }}>{igCount}</span>{" "}
              <span style={{ color: "#9ca3af" }}>+</span>{" "}
              <span style={{ color: TIER_COLOR_YT }}>{ytCount}</span>
              <span style={{ color: "var(--color-text-muted)" }}> = {total}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DualMonthlyBars({
  igMonthly,
  ytMonthly,
}: {
  igMonthly: MonthlyBucket[];
  ytMonthly: MonthlyBucket[];
}) {
  // 모든 month 합쳐서 정렬
  const allMonths = Array.from(
    new Set([...igMonthly.map((b) => b.month), ...ytMonthly.map((b) => b.month)]),
  ).sort();
  const igMap = new Map(igMonthly.map((b) => [b.month, b]));
  const ytMap = new Map(ytMonthly.map((b) => [b.month, b]));

  const maxVideos = Math.max(
    ...allMonths.map((m) => Math.max(igMap.get(m)?.videos ?? 0, ytMap.get(m)?.videos ?? 0)),
    1,
  );

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110 }}>
      {allMonths.slice(-12).map((m) => {
        const ig = igMap.get(m);
        const yt = ytMap.get(m);
        const igH = ((ig?.videos ?? 0) / maxVideos) * 80;
        const ytH = ((yt?.videos ?? 0) / maxVideos) * 80;
        const igPaidPct = ig && ig.videos > 0 ? (ig.paid / ig.videos) * 100 : 0;
        const ytPaidPct = yt && yt.videos > 0 ? (yt.paid / yt.videos) * 100 : 0;
        return (
          <div
            key={m}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
            title={`${m}: IG ${ig?.videos ?? 0} (paid ${igPaidPct.toFixed(0)}%) · YT ${yt?.videos ?? 0} (paid ${ytPaidPct.toFixed(0)}%)`}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, width: "100%" }}>
              <div
                style={{
                  flex: 1,
                  height: `${igH}px`,
                  background: TIER_COLOR_IG,
                  opacity: 0.8,
                  position: "relative",
                  borderRadius: "2px 2px 0 0",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${igPaidPct}%`,
                    background: "#f59e0b",
                    opacity: 0.85,
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  height: `${ytH}px`,
                  background: TIER_COLOR_YT,
                  opacity: 0.8,
                  position: "relative",
                  borderRadius: "2px 2px 0 0",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${ytPaidPct}%`,
                    background: "#f59e0b",
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
            <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>{m.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PlatformBalance({
  igPool,
  ytPool,
  igMonthly,
  ytMonthly,
}: {
  igPool: PoolSummary;
  ytPool: PoolSummary;
  igMonthly: MonthlyBucket[];
  ytMonthly: MonthlyBucket[];
}) {
  const igVideos = igMonthly.reduce((s, b) => s + b.videos, 0);
  const ytVideos = ytMonthly.reduce((s, b) => s + b.videos, 0);
  const totalVideos = igVideos + ytVideos;
  const igVideoPct = totalVideos > 0 ? (igVideos * 100) / totalVideos : 0;

  const totalAuthors = igPool.total_authors + ytPool.total_authors;
  const igAuthorPct = totalAuthors > 0 ? (igPool.total_authors * 100) / totalAuthors : 0;

  const totalPaid = igPool.paid_authors + ytPool.paid_authors;
  const igPaidPct = totalPaid > 0 ? (igPool.paid_authors * 100) / totalPaid : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      <BalanceRow label="총 영상" igPct={igVideoPct} igAbs={igVideos} ytAbs={ytVideos} />
      <BalanceRow
        label="총 작성자"
        igPct={igAuthorPct}
        igAbs={igPool.total_authors}
        ytAbs={ytPool.total_authors}
      />
      <BalanceRow
        label="paid 작성자"
        igPct={igPaidPct}
        igAbs={igPool.paid_authors}
        ytAbs={ytPool.paid_authors}
      />
    </div>
  );
}

function BalanceRow({
  label,
  igPct,
  igAbs,
  ytAbs,
}: {
  label: string;
  igPct: number;
  igAbs: number;
  ytAbs: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ minWidth: 100, color: "var(--color-text-muted)", fontWeight: 600 }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 22,
          background: "var(--color-bg-soft)",
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${igPct}%`,
            background: TIER_COLOR_IG,
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {igPct >= 10 ? `IG ${igPct.toFixed(0)}%` : ""}
        </div>
        <div
          style={{
            width: `${100 - igPct}%`,
            background: TIER_COLOR_YT,
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {100 - igPct >= 10 ? `YT ${(100 - igPct).toFixed(0)}%` : ""}
        </div>
      </div>
      <span
        style={{
          minWidth: 140,
          fontSize: 11,
          color: "var(--color-text-muted)",
          textAlign: "right",
        }}
      >
        {igAbs.toLocaleString()} / {ytAbs.toLocaleString()}
      </span>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}
