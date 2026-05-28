"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptIgConfigLearned,
  runIgPostlearn,
} from "@/app/cases/[id]/ig-prep-actions";
import type { IgConfig } from "@/lib/inngest/aggregators/phase4c-ig-monitor";

export type IgPostlearnDiff = {
  new_author_seeds: string[];
  new_celeb_handles: string[];
  new_brand_hashtags: string[];
  new_paid_keywords: string[];
};

/**
 * IG Postlearn 박스 — 1차 phase4c 끝난 후 자동 학습 trigger.
 *
 * 흐름:
 *   1. phase4c 1차 완료 (ig_posts/ig_authors 박힘) → 박스 활성화
 *   2. "Postlearn 시작" → 자동 학습 (max_likes top / paid celeb / paid % top hashtag)
 *   3. diff preview (신규 author_seeds/celeb_handles/brand_hashtags/paid_keywords)
 *   4. Accept → ig_config merge → phase4c 2차 trigger
 */
export function IgPostlearnBox({
  case_id,
  hasPhase4c,
  learnedConfig,
  diff,
}: {
  case_id: string;
  hasPhase4c: boolean;
  learnedConfig: IgConfig | null;
  diff: IgPostlearnDiff | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function handleRun() {
    setMsg(null);
    start(async () => {
      try {
        const r = await runIgPostlearn(case_id);
        if (r.ok) {
          const d = r.result.diff;
          const totalNew =
            d.new_author_seeds.length +
            d.new_celeb_handles.length +
            d.new_brand_hashtags.length +
            d.new_paid_keywords.length;
          setMsg({
            type: "ok",
            text: `Postlearn 완료. 신규 발견 ${totalNew}건 (author ${d.new_author_seeds.length} / celeb ${d.new_celeb_handles.length} / hashtag ${d.new_brand_hashtags.length} / paid keyword ${d.new_paid_keywords.length})`,
          });
          router.refresh();
        } else {
          setMsg({ type: "err", text: r.error });
        }
      } catch (e) {
        setMsg({
          type: "err",
          text: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  function handleAccept() {
    if (
      !confirm(
        "학습된 ig_config를 적용할까요? (이후 Phase 4c 재실행하면 새 author/celeb까지 수집)",
      )
    ) {
      return;
    }
    setMsg(null);
    start(async () => {
      try {
        const r = await acceptIgConfigLearned(case_id);
        if (r.ok) {
          setMsg({
            type: "ok",
            text: "ig_config 업데이트됨. Phase 4c 재실행 누르면 2차 수집 동작.",
          });
          router.refresh();
        } else {
          setMsg({ type: "err", text: r.error });
        }
      } catch (e) {
        setMsg({
          type: "err",
          text: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 20,
        borderRadius: 8,
        border: "1px dashed var(--color-border, #d1d5db)",
        background: "var(--color-bg-soft, #f9fafb)",
        opacity: hasPhase4c ? 1 : 0.5,
      }}
    >
      <h3 style={{ fontSize: 16, margin: "0 0 4px 0" }}>
        🎓 IG Postlearn (1차 phase4c 결과 자동 학습)
      </h3>
      <p
        style={{
          margin: "0 0 12px 0",
          fontSize: 12,
          color: "var(--color-text-muted, #6b7280)",
        }}
      >
        Phase 4c 1차 수집 결과에서 max_likes top author / 1M+ views paid 셀럽 / paid % 80%+
        hashtag를 자동 추출 → ig_author_seeds / ig_celeb_handles / ig_brand_hashtags /
        ig_paid_keywords에 자동 추가. 그 다음 Phase 4c 재실행하면 완전한 풀 수집.
      </p>

      {!hasPhase4c && (
        <div
          style={{
            padding: 8,
            background: "var(--color-warning-bg, #fef3c7)",
            color: "var(--color-warning, #92400e)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          ⚠️ Phase 4c 1차 수집 먼저 완료해야 postlearn 가능
        </div>
      )}

      {hasPhase4c && !learnedConfig && (
        <button
          type="button"
          onClick={handleRun}
          disabled={pending}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid var(--color-primary, #3b82f6)",
            background: "var(--color-primary, #3b82f6)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: pending ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "학습 중..." : "🎓 Postlearn 시작"}
        </button>
      )}

      {learnedConfig && diff && (
        <div>
          <div
            style={{
              padding: 12,
              border: "1px solid var(--color-border-soft, #e5e7eb)",
              borderRadius: 6,
              background: "var(--color-surface, #fff)",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              📋 신규 발견 (기존 ig_config에 없던 것)
            </div>
            <DiffRow
              label="ig_author_seeds (+)"
              value={diff.new_author_seeds}
            />
            <DiffRow
              label="ig_celeb_handles (+)"
              value={diff.new_celeb_handles}
            />
            <DiffRow
              label="ig_brand_hashtags (+)"
              value={diff.new_brand_hashtags}
            />
            <DiffRow
              label="ig_paid_keywords (+)"
              value={diff.new_paid_keywords}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleAccept}
              disabled={pending}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid var(--color-success, #059669)",
                background: "var(--color-success, #059669)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {pending ? "적용 중..." : "✅ Accept (ig_config 업데이트)"}
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={pending}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
                background: "transparent",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              다시 학습
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
            background:
              msg.type === "ok"
                ? "var(--color-success-bg, #d1fae5)"
                : "var(--color-error-bg, #fee2e2)",
            color:
              msg.type === "ok"
                ? "var(--color-success, #065f46)"
                : "var(--color-error, #991b1b)",
          }}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}

function DiffRow({ label, value }: { label: string; value: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 11,
        padding: "4px 0",
        alignItems: "flex-start",
      }}
    >
      <span
        style={{
          minWidth: 180,
          color: "var(--color-text-muted, #6b7280)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>
        {value.length === 0 ? (
          <span style={{ color: "var(--color-text-muted)" }}>(신규 0개)</span>
        ) : (
          <>
            <span style={{ color: "var(--color-success, #059669)", fontWeight: 600 }}>
              +{value.length}
            </span>{" "}
            {value.slice(0, 15).join(", ")}
            {value.length > 15 && (
              <span style={{ color: "var(--color-text-muted)" }}>
                {" "}
                ... +{value.length - 15}개
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
