"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  QUESTIONS,
  type DiagnoseAnswers,
  type Question,
} from "@/lib/diagnose/questionnaire";
import type {
  BudgetScenario,
  DiagnoseMatchResult,
  Prescription,
  ScoredCase,
} from "@/lib/diagnose/match";
import { tierKo } from "@/lib/diagnose/match";
import { runDiagnose } from "./actions";

// 결과 산출에 꼭 필요한 핵심 문항 (이게 비면 제출 막음)
const REQUIRED = ["q1", "q2", "q3", "q4", "q13"];

export default function DiagnosePage() {
  const [answers, setAnswers] = useState<DiagnoseAnswers>({});
  const [result, setResult] = useState<DiagnoseMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const missing = useMemo(
    () => REQUIRED.filter((id) => !answers[id] || (answers[id] as string).length === 0),
    [answers],
  );

  function setSingle(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function toggleMulti(id: string, value: string) {
    setAnswers((a) => {
      const cur = (a[id] as string[]) ?? [];
      return {
        ...a,
        [id]: cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur, value],
      };
    });
  }
  function setText(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function toggleRank(id: string, value: string, maxRank: number) {
    setAnswers((a) => {
      const cur = (a[id] as string[]) ?? [];
      if (cur.includes(value)) {
        return { ...a, [id]: cur.filter((v) => v !== value) };
      }
      if (cur.length >= maxRank) return a; // 최대치면 무시
      return { ...a, [id]: [...cur, value] };
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runDiagnose(answers);
        setResult(r);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "진단 실패");
      }
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const q of QUESTIONS) {
      if (!map.has(q.group)) map.set(q.group, []);
      map.get(q.group)!.push(q);
    }
    return [...map.entries()];
  }, []);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <nav
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
        }}
      >
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>
          My Cases
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>진단서</span>
      </nav>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 className="page-title">진단서</h1>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-g400)",
            fontFamily: "var(--font-mono)",
          }}
        >
          답변 → 베스트 BP 매칭 → 예산별 실행 시나리오
        </span>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 16px",
            background: "var(--color-accent-soft)",
            border: "1px solid var(--color-accent)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--color-accent)",
          }}
        >
          {error}
        </div>
      )}

      {result ? (
        <ResultView
          result={result}
          onReset={() => {
            setResult(null);
            window.scrollTo({ top: 0 });
          }}
        />
      ) : (
        <FormView
          groups={groups}
          answers={answers}
          setSingle={setSingle}
          toggleMulti={toggleMulti}
          toggleRank={toggleRank}
          setText={setText}
          missing={missing}
          pending={pending}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

// =============================================================================
// 폼
// =============================================================================

function FormView({
  groups,
  answers,
  setSingle,
  toggleMulti,
  toggleRank,
  setText,
  missing,
  pending,
  onSubmit,
}: {
  groups: [string, Question[]][];
  answers: DiagnoseAnswers;
  setSingle: (id: string, v: string) => void;
  toggleMulti: (id: string, v: string) => void;
  toggleRank: (id: string, v: string, maxRank: number) => void;
  setText: (id: string, v: string) => void;
  missing: string[];
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      {groups.map(([group, qs]) => (
        <section
          key={group}
          style={{
            marginBottom: 14,
            padding: "18px 20px",
            background: "white",
            border: "1px solid var(--color-g100)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-g400)",
              marginBottom: 14,
            }}
          >
            {group}
          </div>
          {qs.map((q) => (
            <QuestionRow
              key={q.id}
              q={q}
              answers={answers}
              setSingle={setSingle}
              toggleMulti={toggleMulti}
              toggleRank={toggleRank}
              setText={setText}
            />
          ))}
        </section>
      ))}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "linear-gradient(transparent, white 30%)",
          paddingTop: 16,
          paddingBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button
          onClick={onSubmit}
          disabled={missing.length > 0 || pending}
          style={{
            background: missing.length > 0 ? "var(--color-g200)" : "#ec4899",
            color: "white",
            padding: "12px 28px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            cursor: missing.length > 0 || pending ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "매칭 중…" : "진단하고 베스트 BP 보기"}
        </button>
        {missing.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--color-g400)" }}>
            필수 문항 {missing.length}개 남음 (카테고리·국가·채널·매출·예산)
          </span>
        )}
      </div>
    </div>
  );
}

function QuestionRow({
  q,
  answers,
  setSingle,
  toggleMulti,
  toggleRank,
  setText,
}: {
  q: Question;
  answers: DiagnoseAnswers;
  setSingle: (id: string, v: string) => void;
  toggleMulti: (id: string, v: string) => void;
  toggleRank: (id: string, v: string, maxRank: number) => void;
  setText: (id: string, v: string) => void;
}) {
  const cur = answers[q.id];
  const isRequired = REQUIRED.includes(q.id);
  const rankList = (cur as string[]) ?? [];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
        <span style={{ color: "var(--color-g400)", marginRight: 6, fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {q.id.toUpperCase()}
        </span>
        {q.prompt}
        {isRequired && <span style={{ color: "#ec4899", marginLeft: 4 }}>*</span>}
      </div>
      {q.hint && (
        <div style={{ fontSize: 11.5, color: "var(--color-g400)", marginBottom: 8 }}>
          {q.hint}
        </div>
      )}

      {q.type === "text" ? (
        <input
          className="field-input"
          value={(cur as string) ?? ""}
          placeholder={q.placeholder}
          onChange={(e) => setText(q.id, e.target.value)}
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "9px 12px",
            border: "1px solid var(--color-g200)",
            borderRadius: 7,
            fontSize: 13,
          }}
        />
      ) : q.type === "rank" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {q.options?.map((opt) => {
            const rank = rankList.indexOf(opt.value); // -1 = 미선택
            const selected = rank >= 0;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleRank(q.id, opt.value, q.maxRank ?? 3)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: selected ? 700 : 500,
                  border: selected
                    ? "1.5px solid #ec4899"
                    : "1px solid var(--color-g200)",
                  background: selected ? "var(--color-accent-soft)" : "white",
                  color: selected ? "#be185d" : "var(--color-g600)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    marginRight: 6,
                    fontSize: 10,
                    fontWeight: 800,
                    background: selected ? "#ec4899" : "var(--color-g100)",
                    color: selected ? "white" : "var(--color-g400)",
                  }}
                >
                  {selected ? rank + 1 : ""}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {q.options?.map((opt) => {
            const selected =
              q.type === "multi"
                ? ((cur as string[]) ?? []).includes(opt.value)
                : cur === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  q.type === "multi"
                    ? toggleMulti(q.id, opt.value)
                    : setSingle(q.id, opt.value)
                }
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: selected ? 700 : 500,
                  border: selected
                    ? "1.5px solid #ec4899"
                    : "1px solid var(--color-g200)",
                  background: selected ? "var(--color-accent-soft)" : "white",
                  color: selected ? "#be185d" : "var(--color-g600)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {q.type === "multi" && (
                  <span style={{ marginRight: 6 }}>{selected ? "✓" : "+"}</span>
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 결과 — 1) 베스트 BP 매칭  2) 예산별 실행 시나리오
// =============================================================================

function ResultView({
  result,
  onReset,
}: {
  result: DiagnoseMatchResult;
  onReset: () => void;
}) {
  const top = result.topMatches[0] ?? null;
  const rest = result.topMatches.slice(1);

  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--color-g400)" }}>
            진단 프로필
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {result.profileLine}
          </div>
        </div>
        <button
          onClick={onReset}
          style={{
            padding: "8px 16px",
            border: "1px solid var(--color-g200)",
            background: "white",
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← 다시 진단
        </button>
      </div>

      {/* 1) 가장 가까운 BP */}
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
        🎯 가장 가까운 BP
      </div>
      {top ? (
        <Link
          href={`/cases/${top.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            style={{
              border: "2px solid #ec4899",
              background: "var(--color-accent-soft)",
              borderRadius: 12,
              padding: "18px 20px",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{top.brand}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-g500)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {top.country} · {channelKo(top.channel)}
              </div>
              <div style={{ flex: 1 }} />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#be185d",
                }}
              >
                fit {top.score.toFixed(0)}점
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-g600)", marginTop: 8 }}>
              월 약 <b>{top.monthlyContents}개</b> 시딩 · 30일 매출{" "}
              {fmtUsd(top.rev30dUsd)}
              {top.creators != null && <> · 누적 인플 {top.creators.toLocaleString()}명</>}
            </div>
            {top.tierMixLabel && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-g400)",
                  marginTop: 5,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {top.tierMixLabel}
              </div>
            )}
            {top.reasons.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {top.reasons.map((r) => (
                  <span
                    key={r}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-pos)",
                      background: "var(--color-pos-soft)",
                      padding: "3px 9px",
                      borderRadius: 999,
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#be185d", marginTop: 12, fontWeight: 700 }}>
              이 케이스 열기 →
            </div>
          </div>
        </Link>
      ) : (
        <div style={{ fontSize: 13, color: "var(--color-g400)", marginBottom: 14 }}>
          매칭되는 케이스가 없습니다.
        </div>
      )}

      {rest.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: "var(--color-g400)", marginBottom: 8 }}>
            다음으로 가까운 BP
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 26 }}>
            {rest.map((c) => (
              <CaseRow key={c.id} c={c} />
            ))}
          </div>
        </>
      )}

      {/* 2) BP → 처방(상품) */}
      {result.prescription && <PrescriptionCard rx={result.prescription} />}

      {/* 3) 예산별 실행 시나리오 */}
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
        💰 예산별 실행 규모
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-g400)", marginBottom: 12 }}>
        위 처방(믹스)을 예산에 맞춰 몇 개 실행할 수 있는지 — 믹스 단가로 환산.
        {result.seedingBudgetKrw != null && (
          <>
            {" "}입력 기준 월 실 시딩예산 ≈{" "}
            <b style={{ color: "var(--color-g600)" }}>
              {fmtKrw(result.seedingBudgetKrw)}
            </b>
            .
          </>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 26,
        }}
      >
        {result.budgetScenarios.map((s) => (
          <BudgetScenarioCard key={s.id} s={s} />
        ))}
      </div>

      {/* 벤치마크 히트 */}
      {result.benchmarkHits.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
            📌 입력한 벤치마크 브랜드 — 라이브러리에 있음
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.benchmarkHits.map((c) => (
              <CaseRow key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BudgetScenarioCard({ s }: { s: BudgetScenario }) {
  return (
    <div
      style={{
        border: s.selected ? "2px solid #ec4899" : "1px solid var(--color-g100)",
        borderRadius: 12,
        background: s.selected ? "var(--color-accent-soft)" : "white",
        padding: "16px 16px 18px",
        position: "relative",
      }}
    >
      {s.selected && (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: 14,
            background: "#ec4899",
            color: "white",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          선택하신 예산
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800 }}>{s.label}</div>

      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10, color: "var(--color-ink)" }}>
        월 {s.affordableMonthly.toLocaleString()}개
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-g400)", marginLeft: 4 }}>
          시딩 가능
        </span>
      </div>

      {s.tierBreakdown.length > 0 ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {s.tierBreakdown.map((t) => (
            <div
              key={t.tier}
              style={{ fontSize: 11.5, color: "var(--color-g600)", display: "flex", justifyContent: "space-between" }}
            >
              <span>{tierKo(t.tier)}</span>
              <b>{t.count.toLocaleString()}명</b>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--color-g400)", marginTop: 10 }}>
          이 예산으론 처방 믹스 1건도 어려움 (단가↑)
        </div>
      )}
    </div>
  );
}

function PrescriptionCard({ rx }: { rx: Prescription }) {
  return (
    <div
      style={{
        border: "1px solid var(--color-g100)",
        borderRadius: 12,
        background: "white",
        padding: "18px 20px",
        marginBottom: 22,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
        🧪 이 BP가 한 방식 = 처방
      </div>
      <div style={{ fontSize: 10.5, color: "var(--color-g400)", marginBottom: 12 }}>
        {rx.basedOn}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#be185d",
            background: "var(--color-accent-soft)",
            padding: "4px 12px",
            borderRadius: 8,
          }}
        >
          {rx.headline}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--color-g600)" }}>{rx.summary}</span>
      </div>

      {/* 광고비중(유가/무가) + 앵글 — 이번 핵심 신호 */}
      <div style={{ marginTop: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--color-g400)", fontWeight: 600 }}>
            {rx.paidSignalLabel}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: rx.adRatio >= 0.5 ? "#be185d" : "var(--color-g700)" }}>
            {Math.round(rx.adRatio * 100)}%
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-g400)", marginLeft: 5 }}>
              {rx.isTTShop
                ? "어필리에이트 포함"
                : rx.adRatio >= 0.5
                  ? "유가 중심"
                  : rx.adRatio <= 0.25
                    ? "무가 중심"
                    : "혼합"}
            </span>
          </div>
        </div>
        {rx.angleLabel && (
          <div>
            <div style={{ fontSize: 10, color: "var(--color-g400)", fontWeight: 600 }}>
              앵글 (보조)
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-g700)" }}>
              {rx.angleLabel}
            </div>
          </div>
        )}
      </div>

      {/* 티어 믹스 막대 */}
      <div style={{ marginTop: 14, display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}>
        {rx.tiers.map((t) => (
          <div
            key={t.tier}
            title={`${tierKo(t.tier)} ${Math.round(t.share * 100)}%`}
            style={{ width: `${t.share * 100}%`, background: tierColor(t.tier) }}
          />
        ))}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {rx.tiers.slice(0, 4).map((t) => (
          <span key={t.tier} style={{ fontSize: 10.5, color: "var(--color-g500)" }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: tierColor(t.tier),
                marginRight: 4,
              }}
            />
            {tierKo(t.tier)} {Math.round(t.share * 100)}%
          </span>
        ))}
      </div>

      <ul style={{ marginTop: 14, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
        {rx.bullets.map((b, i) => (
          <li key={i} style={{ fontSize: 12, color: "var(--color-g600)", lineHeight: 1.5 }}>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function tierColor(t: string): string {
  const m: Record<string, string> = {
    mega: "#be185d",
    macro: "#ec4899",
    mid: "#f9a8d4",
    micro: "#a5b4fc",
    nano: "#7dd3fc",
    "sub-nano": "#bae6fd",
    unknown: "#e5e7eb",
  };
  return m[t] ?? "#e5e7eb";
}

function CaseRow({ c }: { c: ScoredCase }) {
  return (
    <Link
      href={`/cases/${c.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "11px 14px",
          border: "1px solid var(--color-g100)",
          borderRadius: 9,
          background: "white",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {c.brand}{" "}
            <span style={{ fontSize: 10.5, color: "var(--color-g400)", fontFamily: "var(--font-mono)" }}>
              {c.country} · {channelKo(c.channel)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-g500)", marginTop: 3 }}>
            월 약 {c.monthlyContents}개 시딩 · 30일 {fmtUsd(c.rev30dUsd)}
            {c.reasons.length > 0 && (
              <span style={{ color: "var(--color-pos)", marginLeft: 8 }}>
                {c.reasons.join(" · ")}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-g400)",
            minWidth: 44,
            textAlign: "right",
          }}
        >
          {c.score.toFixed(0)}점
        </div>
      </div>
    </Link>
  );
}

function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtKrw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${Math.round(n).toLocaleString()}원`;
}

function channelKo(v: string): string {
  const m: Record<string, string> = {
    amazon: "아마존",
    tiktok_shop: "틱톡샵",
    shopee: "쇼피",
    other: "기타",
  };
  return m[v] ?? v;
}
