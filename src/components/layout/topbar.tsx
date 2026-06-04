"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/cases", label: "Browse" },
  { href: "/diagnose", label: "진단서" },
  { href: "/cases/new", label: "+ New Case", primary: true },
  { href: "/settings/seeding-pricing", label: "시딩 단가" },
  { href: "/settings/exchange-rates", label: "환율 설정" },
];

export function Topbar() {
  const pathname = usePathname();
  const matched = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "/") ||
    (href === "/cases" && (pathname.startsWith("/brands/") || pathname.startsWith("/cases/")));

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 px-5 bg-white border-b"
      style={{ borderColor: "var(--color-g100)", height: 56 }}
    >
      <div className="w-40">
        <div className="text-[15px] font-extrabold tracking-tight">TikCle BP</div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wider mt-px"
          style={{ color: "var(--color-g400)" }}
        >
          Internal
        </div>
      </div>
      <nav className="flex items-center gap-2">
        {navItems.map((it) => {
          const active = matched(it.href);
          if (it.primary) {
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  background: "#ec4899",
                  color: "white",
                  padding: "8px 16px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {it.label}
              </Link>
            );
          }
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? "#111827" : "#6b7280",
                background: active ? "var(--color-g50)" : "transparent",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div
        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: "var(--color-g200)" }}
      >
        SH
      </div>
    </header>
  );
}
