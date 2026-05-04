import Link from "next/link";
import { fetchExchangeRates } from "@/lib/case-detail/exchange-rates-server";
import { ExchangeRatesForm } from "./ExchangeRatesForm";

export const dynamic = "force-dynamic";

const CURRENCIES: { code: string; label: string }[] = [
  { code: "KRW", label: "Korean Won" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "EUR", label: "Euro" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "AED", label: "UAE Dirham" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "THB", label: "Thai Baht" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "IDR", label: "Indonesian Rupiah" },
  { code: "PHP", label: "Philippine Peso" },
  { code: "VND", label: "Vietnamese Dong" },
];

export default async function ExchangeRatesPage() {
  const rates = await fetchExchangeRates();
  return (
    <div style={{ padding: "24px 32px", maxWidth: 880 }}>
      <nav
        style={{
          fontSize: 11,
          color: "var(--color-g500)",
          marginBottom: 8,
          fontFamily: "var(--font-mono)",
        }}
      >
        <Link href="/cases" style={{ color: "var(--color-g500)" }}>My Cases</Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span>환율 설정</span>
      </nav>

      <h1 className="page-title">환율 설정</h1>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-g500)",
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        값 = "1 unit of {"{currency}"} = X USD" (USD 환산 multiplier).
        예: KRW 0.000667 = 1 KRW = $0.000667 = 1 USD가 1500 KRW.
        <br />
        환율 변경 시 모든 케이스 페이지의 매출/단가 USD 환산이 즉시 갱신됨. USD는 항상 1로 고정.
      </p>

      <ExchangeRatesForm currencies={CURRENCIES} initial={rates} />
    </div>
  );
}
