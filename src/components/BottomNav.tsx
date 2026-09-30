"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const ITEMS = [
  { href: "/", label: "Học", icon: "school" },
  { href: "/duel", label: "Đấu", icon: "swords" },
  { href: "/leaderboard", label: "Xếp hạng", icon: "leaderboard" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/learn");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DUEL_TAB_KEY = "nanu-duel-tab";
const DUEL_TAB_EVENT = "nanu-duel-tab-change";

/**
 * Whether the Duel tab shows. Remembered for the tab session, so a learner
 * without a class does not see it flash in on every page before the badge
 * request answers.
 */
function readDuelTab(): boolean {
  try {
    return sessionStorage.getItem(DUEL_TAB_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function writeDuelTab(available: boolean): void {
  try {
    sessionStorage.setItem(DUEL_TAB_KEY, available ? "shown" : "hidden");
  } catch {
    // Storage can be blocked. The tab then stays on its default.
  }
  window.dispatchEvent(new Event(DUEL_TAB_EVENT));
}

function subscribeDuelTab(onChange: () => void): () => void {
  window.addEventListener(DUEL_TAB_EVENT, onChange);
  return () => window.removeEventListener(DUEL_TAB_EVENT, onChange);
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const [challenges, setChallenges] = useState(0);
  const duelTab = useSyncExternalStore(subscribeDuelTab, readDuelTab, () => true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch("/api/duels?badge=1")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (cancelled || !data || typeof data !== "object") return;
          const count = (data as { count?: unknown }).count;
          setChallenges(typeof count === "number" && count > 0 ? count : 0);
          writeDuelTab((data as { available?: unknown }).available !== false);
        })
        .catch(() => {
          if (!cancelled) setChallenges(0);
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dae2fd] bg-white/95 pb-safe shadow-[0_-4px_0_0_rgba(218,226,253,0.65)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-md items-stretch justify-around px-2">
        {ITEMS.filter((item) => item.href !== "/duel" || duelTab || pathname.startsWith("/duel")).map((item) => {
          const active = isCurrent(pathname, item.href);
          const badge = item.href === "/duel" ? challenges : 0;
          const label = badge > 0 ? `${item.label}, ${badge} lời thách đấu chưa chơi` : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl transition-transform active:translate-y-0.5 ${
                active ? "text-[#0284c7]" : "text-[#6e7881]"
              }`}
            >
              <span
                className={`relative flex h-8 w-14 items-center justify-center rounded-full ${
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
                {badge > 0 ? (
                  <span className="absolute top-0 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[10px] font-extrabold leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
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
