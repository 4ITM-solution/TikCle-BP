"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptYtConfigSuggested,
  runYtPrep,
} from "@/app/cases/[id]/yt-prep-actions";
import type { YtConfig } from "@/lib/inngest/aggregators/phase4d-yt-monitor";

export type YtPrepDebug = {
  seed_channel: string;
  seed_video_count: number;
  hashtag_freq_top: Array<{ tag: string; count: number; matches_brand: boolean }>;
  brand_slug_used: string;
  brand_name: string | null;
};

export function YtPrepBox({
  case_id,
  hasYtConfig,
  suggestedConfig,
  debug,
}: {
  case_id: string;
  hasYtConfig: boolean;
  suggestedConfig: YtConfig | null;
  debug: YtPrepDebug | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [seed, setSeed] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function handleRun() {
    if (!seed.trim()) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await runYtPrep(case_id, seed.trim());
        if (r.ok) {
          setMsg({ type: "ok", text: "자동 발굴 완료. 결과 검토 후 Accept" });
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
    const warning = hasYtConfig
      ? "⚠️ 기존 yt_config를 덮어씁니다. 적용할까요?"
      : "추천된 yt_config를 적용할까요?";
    if (!confirm(warning)) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await acceptYtConfigSuggested(case_id);
        if (r.ok) {
          setMsg({ type: "ok", text: "yt_config 적용됨. PhaseProgress의 Phase 4d 재실행 누르면 동작." });
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
    }}>
      <h3 style={{ fontSize: 16, margin: "0 0 4px 0" }}>
        🪄 YouTube Brand Monitoring 자동 발굴
        {hasYtConfig && (
          <span style={{
            fontSize: 11, marginLeft: 8, padding: "2px 6px", borderRadius: 4,
            background: "var(--color-info-bg, #dbeafe)",
            color: "var(--color-info, #1e40af)",
          }}>
            기존 yt_config 있음
          </span>
        )}
      </h3>
      <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "var(--color-text-muted, #6b7280)" }}>
        브랜드 YouTube 채널 URL 박으면 시스템이 자동으로 brand keyword · regex · paid 키워드 발굴.
        (~$0.07, ~1분. Shorts/long-form 분리, monetizationStatus 잡힘)
      </p>

      {!suggestedConfig && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="YouTube 채널 URL (예: https://www.youtube.com/@ninjakitchen)"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={pending}
            style={{
              flex: 1, padding: "8px 12px",
              border: "1px solid var(--color-border, #d1d5db)",
              borderRadius: 6, fontSize: 13,
            }}
          />
          <button
            type="button" onClick={handleRun} disabled={pending || !seed.trim()}
            style={{
              padding: "8px 16px", borderRadius: 6,
              border: "1px solid var(--color-primary, #3b82f6)",
              background: "var(--color-primary, #3b82f6)",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            {pending ? "발굴 중..." : "🪄 자동 발굴 시작"}
          </button>
        </div>
      )}

      {suggestedConfig && debug && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            marginBottom: 12, padding: 12,
            border: "1px solid var(--color-border-soft, #e5e7eb)",
            borderRadius: 6, background: "var(--color-surface, #fff)",
          }}>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <strong>📦 추천된 yt_config</strong>
              <span style={{ marginLeft: 8, color: "var(--color-text-muted)", fontSize: 11 }}>
                seed {debug.seed_channel} · {debug.seed_video_count} videos 분석
              </span>
            </div>
            <ConfigRow label="yt_owned_channels" value={suggestedConfig.yt_owned_channels ?? []} mono />
            <ConfigRow label="yt_brand_keywords" value={suggestedConfig.yt_brand_keywords ?? []} />
            <ConfigRow label="yt_brand_regex" value={suggestedConfig.yt_brand_regex ?? []} mono />
            <ConfigRow
              label="yt_paid_keywords"
              value={(suggestedConfig.yt_paid_keywords ?? []).slice(0, 12)}
              suffix={(suggestedConfig.yt_paid_keywords ?? []).length > 12
                ? `... +${(suggestedConfig.yt_paid_keywords ?? []).length - 12}개`
                : ""}
            />
          </div>

          <details style={{ marginBottom: 12, fontSize: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 4 }}>
              🔍 발굴 근거 (hashtag 빈도)
            </summary>
            <div style={{ marginTop: 8 }}>
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
          </details>

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
              {pending ? "적용 중..." : "✅ Accept (yt_config 적용)"}
            </button>
            <button
              type="button" onClick={() => setSeed("")} disabled={pending}
              style={{
                padding: "8px 16px", borderRadius: 6,
                border: "1px solid var(--color-border, #d1d5db)",
                background: "transparent", fontSize: 13, cursor: "pointer",
              }}
            >
              다시 발굴
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

function ConfigRow({
  label, value, mono, suffix,
}: {
  label: string; value: string[]; mono?: boolean; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, padding: "4px 0", alignItems: "flex-start" }}>
      <span style={{ minWidth: 160, color: "var(--color-text-muted, #6b7280)", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ flex: 1, fontFamily: mono ? "ui-monospace, monospace" : "inherit", lineHeight: 1.5 }}>
        {value.length === 0 ? (
          <span style={{ color: "var(--color-text-muted)" }}>(빈 배열)</span>
        ) : (
          value.join(", ")
        )}
        {suffix && <span style={{ color: "var(--color-text-muted)" }}> {suffix}</span>}
      </span>
    </div>
  );
}
