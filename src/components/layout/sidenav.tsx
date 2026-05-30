"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Compare 탭 제거 — Browse 안 비교 기능과 사실상 동일 (어차피 Browse 로 리다이렉트). 사용자 의도 따름.
const items = [
  { href: "/cases", label: "Browse", icon: "🏠" },
  { href: "/settings/exchange-rates", label: "환율 설정", icon: "$" },
];

export function Sidenav() {
  const pathname = usePathname();

  // 가장 긴 prefix 매칭이 우선 (/cases/compare가 /cases와 동시 active 안 되게).
  // 또 /cases는 /cases/[id], /brands/[id]에서도 active 표시 (Browse 흐름 동일 contex).
  const matchedHref = (() => {
    const candidates = items.filter(
      (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
    );
    candidates.sort((a, b) => b.href.length - a.href.length);
    if (candidates[0]) return candidates[0].href;
    if (pathname.startsWith("/brands/") || pathname.startsWith("/cases/")) {
      return "/cases";
    }
    return null;
  })();

  return (
    <nav
      className="px-3.5 py-5 bg-white border-r overflow-y-auto"
      style={{ borderColor: "var(--color-g100)" }}
    >
      {items.map((item) => {
        const active = matchedHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded text-[13px] font-medium mb-0.5 transition-colors"
            style={
              active
                ? { background: "var(--color-ink)", color: "white", fontWeight: 600 }
                : { color: "var(--color-g600)" }
            }
          >
            <span className="text-sm w-[18px] text-center">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      <Link
        href="/cases/new"
        className="block text-center mt-2 px-3.5 py-2.5 rounded font-bold text-[13px] text-white"
        style={{ background: "var(--color-accent)" }}
      >
        + New Case
      </Link>
    </nav>
  );
}
