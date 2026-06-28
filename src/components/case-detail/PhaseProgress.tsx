"use client";

import { useState, useTransition } from "react";
import { startAnalysis } from "@/app/cases/[id]/upload-actions";
import type { PhaseKey } from "@/lib/inngest/client";
import type { KeyStats } from "@/lib/inngest/types";

export type PhaseDef = {
  key: PhaseKey;
  label: string;
  cost: string;
  costColor: "free" | "low" | "mid";
};

export const PHASES: PhaseDef[] = [
  {
    key: "phase1_5",
    label: "Phase 1.5 — TikTok Shop 수집",
    cost: "정액제 ($20/월)",
    costColor: "free",
  },
  { key: "phase2", label: "Phase 2 — SQL 집계", cost: "무료", costColor: "free" },
  {
    key: "phase3",
    label: "Phase 3 — 인플 fans 룩업",
    cost: "무료",
    costColor: "free",
  },
  {
    key: "phase35",
    label: "Phase 3.5 — clockworks 폴백",
    cost: "최대 ~$8.50",
    costColor: "mid",
  },
  {
    key: "phase37",
    label: "Phase 3.7 — Shop Creator 판별",
    cost: "최대 ~$2.50",
    costColor: "low",
  },
  {
    key: "phase4a",
    label: "Phase 4a — Meta 광고",
    cost: "$0.75 cap",
    costColor: "mid",
  },
  {
    key: "phase4a_assets",
    label: "Phase 4a.5 — 광고 자산 다운로드",
    cost: "무료",
    costColor: "free",
  },
  {
    key: "phase4b_sample",
    label: "Phase 4b.1 — 분석 샘플",
    cost: "무료",
    costColor: "free",
  },
  {
    key: "phase4b_asr",
    label: "Phase 4b.2 — ASR 수집",
    cost: "$0.51",
    costColor: "low",
  },
  {
    key: "phase4b_vision",
    label: "Phase 4b.3 — Vision 태깅",
    cost: "~$3.50",
    costColor: "mid",
  },
  {
    key: "phase4b_clusters",
    label: "Phase 4b.4 — 3-pass 클러스터링",
    cost: "~$0.60",
    costColor: "low",
  },
  {
    key: "phase4b_sku",
    label: "Phase 4b.5 — SKU 매칭",
    cost: "~$0.40",
    costColor: "low",
  },
  {
    key: "phase5",
    label: "Phase 5 — 포지셔닝 분석",
    cost: "무료",
    costColor: "free",
  },
  {
    key: "phase4c",
    label: "Phase 4c — IG Brand Monitoring (BP)",
    cost: "최대 ~$6.50",
    costColor: "mid",
  },
  {
    key: "phase4d",
    label: "Phase 4d — YouTube Brand Monitoring (BP)",
    cost: "최대 ~$4.00",
    costColor: "mid",
  },
];

export function isPhaseDone(
  key: PhaseKey,
  keyStats: KeyStats,
): { done: boolean; computed_at?: string } {
  switch (key) {
    case "phase1_5":
      return {
        done: !!keyStats.phase1_5,
        computed_at: keyStats.phase1_5?.computed_at,
      };
    case "phase2":
      return {
        done: !!keyStats.phase2,
        computed_at: keyStats.phase2?.computed_at,
      };
    case "phase3":
      return {
        done: !!keyStats.phase3,
        computed_at: keyStats.phase3?.computed_at,
      };
    case "phase35":
      return {
        done: !!keyStats.phase35,
        computed_at: keyStats.phase35?.computed_at,
      };
    case "phase37":
      return {
        done: !!keyStats.phase37,
        computed_at: keyStats.phase37?.computed_at,
      };
    case "phase4a":
      return {
        done: !!keyStats.phase4a,
        computed_at: keyStats.phase4a?.computed_at,
      };
    case "phase4a_assets":
      // 광고 미리보기에 storage URL이 들어있으면 자산 다운로드된 것
      return {
        done:
          !!keyStats.phase4a &&
          keyStats.phase4a.ads_preview.length > 0 &&
          keyStats.phase4a.ads_preview.some(
            (a) =>
              (a.thumbnail_url ?? "").includes("supabase") ||
              (a.video_url ?? "").includes("supabase"),
          ),
        computed_at: keyStats.phase4a?.computed_at,
      };
    case "phase4a_intel":
      // ad_intel은 meta_ads 테이블에 적재되므로 key_stats엔 별도 플래그 없음.
      // phase4a 완료 시 함께 돈 것으로 간주.
      return {
        done: !!keyStats.phase4a,
        computed_at: keyStats.phase4a?.computed_at,
      };
    case "phase4b_sample":
      return {
        done: !!keyStats.phase4b_sample,
        computed_at: keyStats.phase4b_sample?.computed_at,
      };
    case "phase4b_asr":
      return {
        done: !!keyStats.phase4b_asr,
        computed_at: keyStats.phase4b_asr?.computed_at,
      };
    case "phase4b_vision":
      return {
        done: !!keyStats.phase4b_vision,
        computed_at: keyStats.phase4b_vision?.computed_at,
      };
    case "phase4b_clusters":
      return {
        done: !!keyStats.phase4b_clusters,
        computed_at: keyStats.phase4b_clusters?.computed_at,
      };
    case "phase4b_sku":
      return {
        done: !!keyStats.phase4b_sku,
        computed_at: keyStats.phase4b_sku?.computed_at,
      };
    case "phase5":
      return {
        done: !!keyStats.phase5,
        computed_at: keyStats.phase5?.computed_at,
      };
    case "phase4c":
      return {
        done: !!keyStats.phase4c,
        computed_at: keyStats.phase4c?.computed_at,
      };
    case "phase4d":
      return {
        done: !!keyStats.phase4d,
        computed_at: keyStats.phase4d?.computed_at,
      };
  }
}

export function PhaseProgress({
  case_id,
  keyStats,
}: {
  case_id: string;
  keyStats: KeyStats;
}) {
  const [pending, start] = useTransition();
  const [pendingPhase, setPendingPhase] = useState<PhaseKey | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const isDone = (k: PhaseKey) => isPhaseDone(k, keyStats);

  function rerun(phase: PhaseKey) {
    setPendingPhase(phase);
    setMsg(null);
    start(async () => {
      // 단독 phase 재실행 — autoForce 끔. 그렇지 않으면 다른 skipped phase까지 같이 force돼서
      // 의도치 않은 clockworks 호출/fail 부작용 발생.
      const r = await startAnalysis(case_id, [phase], { skipAutoForce: true });
      setPendingPhase(null);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  function rerunMissing() {
    setPendingPhase(null);
    setMsg(null);
    start(async () => {
      const r = await startAnalysis(case_id);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
    });
  }

  return (
    <div className="section-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>분석 단계 진행</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-g400)",
              fontFamily: "var(--font-mono)",
            }}
          >
            완료된 phase는 skip · 개별 재실행하면 그것만 강제 갱신
          </div>
        </div>
        <button
          type="button"
          onClick={rerunMissing}
          disabled={pending}
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "6px 12px" }}
        >
          {pending && pendingPhase === null ? "..." : "누락분만 채우기"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PHASES.map((p) => {
          const status = isDone(p.key);
          const isPending = pendingPhase === p.key && pending;
          return (
            <div
              key={p.key}
              style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 10px",
                background: "var(--color-g25)",
                borderRadius: 5,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: status.done
                    ? "var(--color-pos)"
                    : "var(--color-g300)",
                  textAlign: "center",
                }}
              >
                {status.done ? "✓" : "○"}
              </span>
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 9,
                  background:
                    p.costColor === "free"
                      ? "var(--color-pos-soft)"
                      : p.costColor === "low"
                        ? "var(--color-info-soft)"
                        : "var(--color-warn-soft)",
                  color:
                    p.costColor === "free"
                      ? "var(--color-pos)"
                      : p.costColor === "low"
                        ? "var(--color-info)"
                        : "var(--color-warn)",
                  fontWeight: 700,
                }}
              >
                {p.cost}
              </span>
              <button
                type="button"
                onClick={() => rerun(p.key)}
                disabled={pending}
                style={{
                  fontSize: 10,
                  padding: "4px 10px",
                  border: "1px solid var(--color-g200)",
                  borderRadius: 4,
                  background: "white",
                  cursor: pending ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  color: "var(--color-g600)",
                }}
                title={
                  status.done
                    ? `완료: ${status.computed_at ?? "?"} · 재실행하면 강제 갱신`
                    : "실행"
                }
              >
                {isPending ? "..." : status.done ? "재실행" : "실행"}
              </button>
            </div>
          );
        })}
      </div>

      {msg && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color:
              msg.type === "ok" ? "var(--color-pos)" : "var(--color-accent)",
            fontWeight: 600,
          }}
        >
          {msg.type === "ok" ? "✓ " : "✕ "}
          {msg.text}
        </div>
      )}
    </div>
  );
}
