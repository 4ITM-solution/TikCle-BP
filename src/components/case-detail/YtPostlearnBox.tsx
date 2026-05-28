"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptYtConfigLearned,
  runYtPostlearn,
} from "@/app/cases/[id]/yt-prep-actions";
import type { YtConfig } from "@/lib/inngest/aggregators/phase4d-yt-monitor";

export type YtPostlearnDiff = {
  new_author_seeds: string[];
  new_celeb_handles: string[];
  new_brand_keywords: string[];
  new_paid_keywords: string[];
};

export function YtPostlearnBox({
  case_id,
  hasPhase4d,
  learnedConfig,
  diff,
}: {
  case_id: string;
  hasPhase4d: boolean;
  learnedConfig: YtConfig | null;
  diff: YtPostlearnDiff | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function handleRun() {
    setMsg(null);
    start(async () => {
      try {
        const r = await runYtPostlearn(case_id);
        if (r.ok) {
          const d = r.result.diff;
          const total =
            d.new_author_seeds.length +
            d.new_celeb_handles.length +
            d.new_brand_keywords.length +
            d.new_paid_keywords.length;
          setMsg({
            type: "ok",
            text: `Postlearn 완료. 신규 ${total} (author ${d.new_author_seeds.length} / celeb ${d.new_celeb_handles.length} / keyword ${d.new_brand_keywords.length} / paid_kw ${d.new_paid_keywords.length})`,
          });
          router.refresh();
        } else {
          setMsg({ type: "err", text: r.error });
        }
      } catch (e) {
        setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  function handleAccept() {
    if (!confirm("학습된 yt_config 적용? (이후 Phase 4d 재실행하면 author/celeb까지 수집)")) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await acceptYtConfigLearned(case_id);
        if (r.ok) {
          setMsg({
            type: "ok",
            text: "yt_config 업데이트됨. Phase 4d 재실행 누르면 2차 수집.",
          });
          router.refresh();
        } else {
          setMsg({ type: "err", text: r.error });
        }
      } catch (e) {
        setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <section style={{
      marginTop: 16, padding: 20, borderRadius: 8,
      border: "1px dashed var(--color-border, #d1d5db)",
      background: "var(--color-bg-soft, #f9fafb)",
      opacity: hasPhase4d ? 1 : 0.5,
    }}>
      <h3 style={{ fontSize: 16, margin: "0 0 4px 0" }}>🎓 YT Postlearn (1차 phase4d 결과 자동 학습)</h3>
      <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
        Phase 4d 1차 결과에서 max_views top 채널 / paid + 100K views 셀럽 / paid % 60%+ hashtag
        자동 추출 → yt_author_seeds / yt_celeb_handles / yt_brand_keywords / yt_paid_keywords 자동 추가.
      </p>

      {!hasPhase4d && (
        <div style={{
          padding: 8, background: "var(--color-warning-bg, #fef3c7)",
          color: "var(--color-warning, #92400e)", borderRadius: 6, fontSize: 12,
        }}>
          ⚠️ Phase 4d 1차 수집 먼저 완료해야 postlearn 가능
        </div>
      )}

      {hasPhase4d && !learnedConfig && (
        <button
          type="button" onClick={handleRun} disabled={pending}
          style={{
            padding: "8px 16px", borderRadius: 6,
            border: "1px solid var(--color-primary, #3b82f6)",
            background: "var(--color-primary, #3b82f6)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "학습 중..." : "🎓 Postlearn 시작"}
        </button>
      )}

      {learnedConfig && diff && (
        <div>
          <div style={{
            padding: 12,
            border: "1px solid var(--color-border-soft, #e5e7eb)",
            borderRadius: 6, background: "var(--color-surface, #fff)",
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              📋 신규 발견 (기존 yt_config에 없던 것)
            </div>
            <DiffRow label="yt_author_seeds (+)" value={diff.new_author_seeds} mono />
            <DiffRow label="yt_celeb_handles (+)" value={diff.new_celeb_handles} mono />
            <DiffRow label="yt_brand_keywords (+)" value={diff.new_brand_keywords} />
            <DiffRow label="yt_paid_keywords (+)" value={diff.new_paid_keywords} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button" onClick={handleAccept} disabled={pending}
              style={{
                padding: "8px 16px", borderRadius: 6,
                border: "1px solid var(--color-success, #059669)",
                background: "var(--color-success, #059669)",
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {pending ? "적용 중..." : "✅ Accept (yt_config 업데이트)"}
            </button>
            <button
              type="button" onClick={handleRun} disabled={pending}
              style={{
                padding: "8px 16px", borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
                background: "transparent", fontSize: 13, cursor: "pointer",
              }}
            >
              다시 학습
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{
          marginTop: 12, padding: 8, borderRadius: 6, fontSize: 12,
          background: msg.type === "ok" ? "var(--color-success-bg, #d1fae5)" : "var(--color-error-bg, #fee2e2)",
          color: msg.type === "ok" ? "var(--color-success, #065f46)" : "var(--color-error, #991b1b)",
        }}>
          {msg.text}
        </div>
      )}
    </section>
  );
}

function DiffRow({ label, value, mono }: { label: string; value: string[]; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, padding: "4px 0", alignItems: "flex-start" }}>
      <span style={{ minWidth: 180, color: "var(--color-text-muted, #6b7280)", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{
        flex: 1, lineHeight: 1.5,
        fontFamily: mono ? "ui-monospace, monospace" : "inherit",
      }}>
        {value.length === 0 ? (
          <span style={{ color: "var(--color-text-muted)" }}>(신규 0개)</span>
        ) : (
          <>
            <span style={{ color: "var(--color-success, #059669)", fontWeight: 600 }}>+{value.length}</span>{" "}
            {value.slice(0, 8).join(", ")}
            {value.length > 8 && (
              <span style={{ color: "var(--color-text-muted)" }}> ... +{value.length - 8}개</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
