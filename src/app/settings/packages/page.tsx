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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 10, marginTop: 10 }}>
        <div>
          <label style={labelStyle}>가격(원, 정렬용)</label>
          <input name="price_krw" defaultValue={pkg?.price_krw?.toLocaleString() ?? ""} inputMode="numeric" style={{ ...inputStyle, fontFamily: "var(--font-mono)", textAlign: "right" }} />
        </div>
        <div>
          <label style={labelStyle}>제안 상황 (메모)</label>
          <input name="target_situation" defaultValue={pkg?.target_situation ?? ""} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>노출순서</label>
          <input name="sort_order" defaultValue={pkg?.sort_order ?? 0} inputMode="numeric" style={{ ...inputStyle, textAlign: "right" }} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={labelStyle}>포함 / 구성</label>
        <textarea name="includes" defaultValue={pkg?.includes ?? ""} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
    </>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--color-g100)",
  borderRadius: 10,
  padding: "16px 18px",
  marginBottom: 12,
};
const btnPrimary: React.CSSProperties = {
  background: "#ec4899", color: "white", padding: "8px 18px",
  borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "white", color: "var(--color-g500)", padding: "8px 14px",
  borderRadius: 7, fontSize: 12.5, fontWeight: 600,
  border: "1px solid var(--color-g200)", cursor: "pointer",
};

export default async function PackagesPage() {
  const supabase = await createServer();
  const { data } = await supabase
    .from("seeding_packages")
    .select("*")
    .order("sort_order", { ascending: true });
  const packages = (data ?? []) as SeedingPackage[];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 920 }}>
      <nav style={{ fontSize: 11, color: "var(--color-g500)", marginBottom: 8, fontFamily: "var(--font-mono)" }}>
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>My Cases</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>상품 (패키지)</span>
      </nav>

      <h1 className="page-title">상품 (패키지)</h1>
      <p style={{ fontSize: 12, color: "var(--color-g500)", lineHeight: 1.6, marginBottom: 18 }}>
        우리가 파는 시딩 패키지를 등록·관리합니다. 진단 결과의 처방에 맞춰 제안할 상품 카탈로그.
        <br />
        (티어별 시딩 단가는 <Link href="/settings/seeding-pricing" style={{ textDecoration: "underline" }}>시딩 단가</Link>에서 별도 관리)
      </p>

      {/* 기존 상품들 */}
      {packages.map((pkg) => (
        <form key={pkg.id} action={updatePackage} style={cardStyle}>
          <input type="hidden" name="id" value={pkg.id} />
          <PackageFields pkg={pkg} />
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="submit" style={btnPrimary}>저장</button>
            <button type="submit" formAction={deletePackage} style={{ ...btnGhost, color: "var(--color-accent)" }}>
              삭제
            </button>
          </div>
        </form>
      ))}

      {/* 새 상품 추가 */}
      <form action={createPackage} style={{ ...cardStyle, borderStyle: "dashed", borderColor: "var(--color-g200)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 12, color: "var(--color-g600)" }}>
          + 새 상품 추가
        </div>
        <PackageFields />
        <div style={{ marginTop: 12 }}>
          <button type="submit" style={btnPrimary}>추가</button>
        </div>
      </form>
    </div>
  );
}
