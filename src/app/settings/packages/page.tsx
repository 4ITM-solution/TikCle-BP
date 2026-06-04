import Link from "next/link";
import { createServer } from "@/lib/supabase/server";
import type { SeedingPackage } from "@/lib/diagnose/packages";
import { createPackage, updatePackage, deletePackage } from "./actions";

export const dynamic = "force-dynamic";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--color-g200)",
  borderRadius: 6,
  fontSize: 12.5,
};
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-g400)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 3,
  display: "block",
};

function PackageFields({ pkg }: { pkg?: SeedingPackage }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>상품명 *</label>
          <input name="name" defaultValue={pkg?.name ?? ""} style={inputStyle} required />
        </div>
        <div>
          <label style={labelStyle}>한줄 설명</label>
          <input name="tagline" defaultValue={pkg?.tagline ?? ""} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>가격 표기</label>
          <input name="price_label" defaultValue={pkg?.price_label ?? ""} placeholder="월 1,000만원" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>기간</label>
          <input name="duration" defaultValue={pkg?.duration ?? ""} placeholder="1.5개월" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
        <div>
          <label style={labelStyle}>가격(원, 참고용)</label>
          <input name="price_krw" defaultValue={pkg?.price_krw?.toLocaleString() ?? ""} inputMode="numeric" style={{ ...inputStyle, fontFamily: "var(--font-mono)", textAlign: "right" }} />
        </div>
        <div>
          <label style={labelStyle}>제안 상황 (메모)</label>
          <input name="target_situation" defaultValue={pkg?.target_situation ?? ""} style={inputStyle} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={labelStyle}>포함 / 구성</label>
        <textarea name="includes" defaultValue={pkg?.includes ?? ""} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
        <input type="checkbox" name="active" defaultChecked={pkg?.active ?? true} />
        활성 (active) — 끄면 카탈로그에서 비활성 처리
      </label>
    </>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "#ec4899", color: "white", padding: "8px 18px",
  borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "white", color: "var(--color-accent)", padding: "8px 14px",
  borderRadius: 7, fontSize: 12.5, fontWeight: 600,
  border: "1px solid var(--color-g200)", cursor: "pointer",
};

function Badge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: active ? "var(--color-pos)" : "var(--color-g400)",
        background: active ? "var(--color-pos-soft)" : "var(--color-g50)",
      }}
    >
      {active ? "활성" : "비활성"}
    </span>
  );
}

export default async function PackagesPage() {
  const supabase = await createServer();
  const { data } = await supabase
    .from("seeding_packages")
    .select("*")
    .order("created_at", { ascending: true });
  const packages = (data ?? []) as SeedingPackage[];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 920 }}>
      <style>{`
        details.pkg > summary { list-style: none; cursor: pointer; }
        details.pkg > summary::-webkit-details-marker { display: none; }
        details.pkg[open] > summary .chev { transform: rotate(90deg); }
      `}</style>

      <nav style={{ fontSize: 11, color: "var(--color-g500)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>My Cases</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>상품 (패키지)</span>
      </nav>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="page-title">상품 (패키지)</h1>
        <span style={{ fontSize: 12, color: "var(--color-g400)", fontFamily: "var(--font-mono)" }}>
          {packages.length}개 · 활성 {packages.filter((p) => p.active).length}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-g500)", lineHeight: 1.6, marginBottom: 18 }}>
        우리가 파는 시딩 패키지 카탈로그. 행을 클릭하면 펼쳐서 수정. (티어별 단가는{" "}
        <Link href="/settings/seeding-pricing" style={{ textDecoration: "underline" }}>시딩 단가</Link>에서 관리)
      </p>

      {/* 신규 등록 */}
      <details className="pkg" style={{ marginBottom: 16 }}>
        <summary
          style={{
            padding: "12px 16px",
            border: "1px dashed var(--color-g300)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            color: "#be185d",
            background: "var(--color-accent-soft)",
          }}
        >
          + 새 상품 등록
        </summary>
        <form action={createPackage} style={{ border: "1px solid var(--color-g100)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", background: "white" }}>
          <PackageFields />
          <div style={{ marginTop: 12 }}>
            <button type="submit" style={btnPrimary}>추가</button>
          </div>
        </form>
      </details>

      {/* 리스트 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {packages.map((pkg) => (
          <details key={pkg.id} className="pkg" style={{ border: "1px solid var(--color-g100)", borderRadius: 10, background: "white", opacity: pkg.active ? 1 : 0.6 }}>
            <summary
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 16px",
              }}
            >
              <span className="chev" style={{ fontSize: 11, color: "var(--color-g300)", transition: "transform .15s" }}>▶</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{pkg.name}</span>
              {pkg.tagline && (
                <span style={{ fontSize: 12, color: "var(--color-g400)" }}>{pkg.tagline}</span>
              )}
              <span style={{ flex: 1 }} />
              {pkg.price_label && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-g600)", fontFamily: "var(--font-mono)" }}>
                  {pkg.price_label}
                </span>
              )}
              <Badge active={pkg.active} />
            </summary>
            <form action={updatePackage} style={{ padding: "4px 18px 18px", borderTop: "1px solid var(--color-g50)" }}>
              <input type="hidden" name="id" value={pkg.id} />
              <div style={{ marginTop: 12 }}>
                <PackageFields pkg={pkg} />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button type="submit" style={btnPrimary}>저장</button>
                <button type="submit" formAction={deletePackage} style={btnGhost}>삭제</button>
              </div>
            </form>
          </details>
        ))}
      </div>
    </div>
  );
}
