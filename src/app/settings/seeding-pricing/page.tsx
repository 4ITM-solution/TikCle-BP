import Link from "next/link";
import { fetchSeedingPricing } from "@/lib/diagnose/pricing-server";
import { SeedingPricingForm } from "./SeedingPricingForm";

export const dynamic = "force-dynamic";

export default async function SeedingPricingPage() {
  const pricing = await fetchSeedingPricing();
  return (
    <div style={{ padding: "24px 32px", maxWidth: 720 }}>
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
        <span>시딩 단가</span>
      </nav>

      <h1 className="page-title">시딩 단가 (상품)</h1>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-g500)",
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        티어별 인플 시딩 콘텐츠 1건당 단가(원). 진단서의 <b>예산별 실행 규모</b>가
        이 단가로 계산됩니다 (시딩예산 ÷ 처방 믹스 단가 = 월 실행 가능 개수).
        <br />
        여기서 수정하면 배포 없이 즉시 반영됩니다.
      </p>

      <SeedingPricingForm initial={pricing} />
    </div>
  );
}
