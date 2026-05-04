"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/cases", label: "My Cases", icon: "★" },
  { href: "/settings/exchange-rates", label: "환율 설정", icon: "$" },
];

export function Sidenav() {
  const pathname = usePathname();

  return (
    <nav
      className="px-3.5 py-5 bg-white border-r overflow-y-auto"
      style={{ borderColor: "var(--color-g100)" }}
    >
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
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
