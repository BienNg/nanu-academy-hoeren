"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Học", icon: "school" },
  { href: "/duel", label: "Đấu", icon: "swords" },
  { href: "/leaderboard", label: "Xếp hạng", icon: "leaderboard" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/learn");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dae2fd] bg-white/95 pb-safe shadow-[0_-4px_0_0_rgba(218,226,253,0.65)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active = isCurrent(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-transform active:translate-y-0.5 ${
                active ? "text-[#0284c7]" : "text-[#6e7881]"
              }`}
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full ${
                  active ? "bg-[#e0f2fe]" : ""
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              </span>
              <span className={`text-[11px] leading-none ${active ? "font-extrabold" : "font-semibold"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
