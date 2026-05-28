"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptIgConfigSuggested,
  runIgPrep,
} from "@/app/cases/[id]/ig-prep-actions";
import type { IgConfig } from "@/lib/inngest/aggregators/phase4c-ig-monitor";

export type IgPrepDebug = {
  seed_username: string;
  seed_post_count: number;
  hashtag_freq_top: Array<{ tag: string; count: number; matches_brand: boolean }>;
  mention_freq_top: Array<{ handle: string; count: number; matches_brand: boolean }>;
  brand_slug_used: string;
  brand_name: string | null;
};

/**
 * IG 자동 발굴 박스 — ig_config 없거나 추천 검토 단계인 케이스에 노출.
 *
 * 흐름:
 *   1. 사용자가 seed IG username (예: "ninjakitchen") 입력
 *   2. "자동 발굴 시작" → runIgPrep 호출 → ig_config_suggested 박힘
 *   3. 추천 결과 표시 (hashtag/mention 빈도 + 추천 config preview)
 *   4. "Accept" → cases.ig_config로 commit → phase4c 재실행 가능
 *
 * Server-rendered: page.tsx에서 ig_config_suggested + ig_prep_debug props로 전달.
 */
export function IgPrepBox({
  case_id,
  hasIgConfig,
  suggestedConfig,
  debug,
}: {
  case_id: string;
  hasIgConfig: boolean;
  suggestedConfig: IgConfig | null;
  debug: IgPrepDebug | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [seed, setSeed] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function handleRun() {
    if (!seed.trim()) return;
    setMsg(null);
    start(async () => {
      const r = await runIgPrep(case_id, seed.trim());
      if (r.ok) {
        setMsg({ type: "ok", text: "자동 발굴 완료. 결과 검토 후 Accept" });
        router.refresh();
      } else {
        setMsg({ type: "err", text: r.error });
      }
    });
  }

  function handleAccept() {
    if (!confirm("추천된 ig_config를 적용할까요? (이후 Phase 4c 재실행 가능)")) {
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await acceptIgConfigSuggested(case_id);
      if (r.ok) {
        setMsg({
          type: "ok",
          text: "ig_config 적용됨. PhaseProgress의 Phase 4c 재실행 누르면 동작.",
        });
        router.refresh();
      } else {
        setMsg({ type: "err", text: r.error });
      }
    });
  }

  // 이미 ig_config 박혀있고 suggested 없으면 박스 숨김
  if (hasIgConfig && !suggestedConfig) return null;

  return (
    <section
      style={{
        marginTop: 32,
        padding: 20,
        borderRadius: 8,
        border: "1px dashed var(--color-border, #d1d5db)",
        background: "var(--color-bg-soft, #f9fafb)",
      }}
    >
      <h3 style={{ fontSize: 16, margin: "0 0 4px 0" }}>
        🪄 IG Brand Monitoring 자동 발굴
        {hasIgConfig && (
          <span
            style={{
              fontSize: 11,
              marginLeft: 8,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--color-info-bg, #dbeafe)",
              color: "var(--color-info, #1e40af)",
            }}
          >
            기존 ig_config 있음
          </span>
        )}
      </h3>
      <p
        style={{
          margin: "0 0 12px 0",
          fontSize: 12,
          color: "var(--color-text-muted, #6b7280)",
        }}
      >
        브랜드 IG 계정 1개만 박으면 시스템이 자동으로 brand hashtag · 자매 owned 계정
        · brand regex를 발굴함. (~$0.10, ~1분)
      </p>

      {/* seed input */}
      {!suggestedConfig && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="brand IG username (예: ninjakitchen)"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={pending}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid var(--color-border, #d1d5db)",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleRun}
            disabled={pending || !seed.trim()}
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
            {pending ? "발굴 중..." : "🪄 자동 발굴 시작"}
          </button>
        </div>
      )}

      {/* 추천 결과 preview */}
      {suggestedConfig && debug && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              border: "1px solid var(--color-border-soft, #e5e7eb)",
              borderRadius: 6,
              background: "var(--color-surface, #fff)",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <strong>📦 추천된 ig_config</strong>
              <span
                style={{
                  marginLeft: 8,
                  color: "var(--color-text-muted)",
                  fontSize: 11,
                }}
              >
                seed @{debug.seed_username} · {debug.seed_post_count} posts 분석
              </span>
            </div>
            <ConfigRow
              label="ig_owned_usernames"
              value={suggestedConfig.ig_owned_usernames ?? []}
            />
            <ConfigRow
              label="ig_brand_hashtags"
              value={suggestedConfig.ig_brand_hashtags ?? []}
            />
            <ConfigRow
              label="ig_brand_regex"
              value={suggestedConfig.ig_brand_regex ?? []}
              mono
            />
            <ConfigRow
              label="ig_paid_keywords"
              value={(suggestedConfig.ig_paid_keywords ?? []).slice(0, 12)}
              suffix={
                (suggestedConfig.ig_paid_keywords ?? []).length > 12
                  ? `... +${(suggestedConfig.ig_paid_keywords ?? []).length - 12}개`
                  : ""
              }
            />
          </div>

          {/* hashtag 빈도 debug */}
          <details style={{ marginBottom: 12, fontSize: 12 }}>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              🔍 발굴 근거 (hashtag/mention 빈도 top)
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>
                  Hashtag 빈도 top 15 (brand 매칭 = ✓)
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                  {debug.hashtag_freq_top.slice(0, 15).map((h) => (
                    <li
                      key={h.tag}
                      style={{
                        padding: "2px 0",
                        color: h.matches_brand ? "var(--color-success, #059669)" : "inherit",
                      }}
                    >
                      {h.matches_brand ? "✓ " : "  "}#{h.tag} ({h.count})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>
                  Mention 빈도 top 15 (자매 owned = ✓)
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11 }}>
                  {debug.mention_freq_top.slice(0, 15).map((m) => (
                    <li
                      key={m.handle}
                      style={{
                        padding: "2px 0",
                        color: m.matches_brand ? "var(--color-success, #059669)" : "inherit",
                      }}
                    >
                      {m.matches_brand ? "✓ " : "  "}@{m.handle} ({m.count})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          {/* Accept buttons */}
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
              {pending ? "적용 중..." : "✅ Accept (ig_config 적용)"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSeed("");
                // suggested 삭제하려면 별도 server action 필요 — 일단 다시 발굴로 덮기
              }}
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
              다시 발굴
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

function ConfigRow({
  label,
  value,
  mono,
  suffix,
}: {
  label: string;
  value: string[];
  mono?: boolean;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, padding: "4px 0", alignItems: "flex-start" }}>
      <span
        style={{
          minWidth: 160,
          color: "var(--color-text-muted, #6b7280)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          lineHeight: 1.5,
        }}
      >
        {value.length === 0
          ? <span style={{ color: "var(--color-text-muted)" }}>(빈 배열 — 자동 발굴 안 됨, 수동 보완 필요)</span>
          : value.join(", ")}
        {suffix && <span style={{ color: "var(--color-text-muted)" }}> {suffix}</span>}
      </span>
    </div>
  );
}
