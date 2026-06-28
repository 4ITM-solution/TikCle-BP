"use client";

import { useMemo, useState } from "react";
import { addTrackedBrand } from "./actions";

export type CaseOpt = {
  id: string;
  name: string;
  country: string;
  adCount: number;
  hasPageId: boolean;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "1px solid var(--color-g200)",
  borderRadius: 6,
  fontSize: 12.5,
};
const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-g400)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 3,
  display: "block",
};

export function AddBrandForm({ caseOpts }: { caseOpts: CaseOpt[] }) {
  const countries = useMemo(
    () => [...new Set(caseOpts.map((c) => c.country))].sort(),
    [caseOpts],
  );
  const [country, setCountry] = useState<string>(countries[0] ?? "US");
  const filtered = useMemo(
    () => caseOpts.filter((c) => c.country === country),
    [caseOpts, country],
  );

  return (
    <>
      <form
        action={addTrackedBrand}
        style={{
          display: "grid",
          gridTemplateColumns: "0.9fr 2.2fr 1.3fr 0.7fr auto",
          gap: 10,
          alignItems: "end",
          background: "#fff",
          border: "1px solid var(--color-g100)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 8,
        }}
      >
        <div>
          <label style={label}>① 국가</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            style={inputStyle}
          >
            {countries.map((c) => (
              <option key={c} value={c}>
                {c} ({caseOpts.filter((x) => x.country === c).length})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label}>② BP 케이스 *</label>
          <select
            name="case_id"
            style={inputStyle}
            required
            defaultValue=""
            key={country}
          >
            <option value="" disabled>
              — {country} 케이스 선택 ({filtered.length}개) —
            </option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · 광고 {c.adCount}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={label}>page_id 직접입력 (선택)</label>
          <input name="page_id" style={inputStyle} placeholder="숫자 page_id" />
        </div>
        <div>
          <label style={label}>주기(일)</label>
          <input
            name="cadence_days"
            type="number"
            style={inputStyle}
            defaultValue={3}
          />
        </div>
        <button
          type="submit"
          style={{
            background: "#ec4899",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + 추가
        </button>
      </form>
      <p
        style={{
          fontSize: 11,
          color: "var(--color-g400)",
          margin: "0 0 18px",
        }}
      >
        국가 먼저 고르면 그 국가 케이스만 보여요. <b>page_id·keyword·국가는 케이스의
        이미 적재된 meta_ads에서 자동 도출</b>(브랜드 공식 page_id). 직접입력 칸은
        자동 도출이 틀릴 때만 쓰면 됨.
      </p>
    </>
  );
}
