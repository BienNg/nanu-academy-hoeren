"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const ITEMS = [
  { href: "/", label: "Học", icon: "/nav/learn.svg", pad: "px-4" },
  { href: "/duel", label: "Đấu", icon: "/nav/duel.svg", pad: "px-4" },
  { href: "/quests", label: "Nhiệm vụ", icon: "/nav/quests.svg", pad: "px-2.5" },
  { href: "/leaderboard", label: "Xếp hạng", icon: "/nav/ranking.svg", pad: "px-2.5" },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dae2fd] bg-white/95 pb-safe backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-around px-3 py-1.5">
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
              className={`flex flex-col items-center gap-px rounded-2xl border-2 py-1 ${item.pad} ${
                active ? "border-[#0071E3] bg-[#E3EEFB]" : "border-transparent"
              }`}
            >
              <span className="relative flex h-7 w-7 items-center justify-center">
                <img
                  src={item.icon}
                  alt=""
                  width={28}
                  height={28}
                  className={`h-7 w-7 ${active ? "nav-tab-pop" : ""}`}
                  aria-hidden="true"
                />
                {badge > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[10px] font-extrabold leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span
                className={`font-label-sm text-[12px] font-semibold leading-4 tracking-[0.02em] ${
                  active ? "text-[#0059B5]" : "text-[#6E6E73]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
