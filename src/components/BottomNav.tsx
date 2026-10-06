"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BadgeUnlockSheet, markBadgesSeenRemote } from "@/components/BadgeParts";
import { badgeCheckDue, markBadgeCheck } from "@/lib/badge-unseen";
import { readFreshBadges, type FreshBadge } from "@/lib/badges";
import { publishQuestBadge, readQuestBadge, subscribeQuestBadge } from "@/lib/quest-badge";
import { questZoneHeaders } from "@/lib/quests";

const ITEMS = [
  { href: "/", label: "Học", icon: "/nav/learn.svg", pad: "px-3 sm:px-4" },
  { href: "/quests", label: "Nhiệm vụ", icon: "/nav/quests.svg", pad: "px-1.5 sm:px-2.5" },
  { href: "/duel", label: "Đấu", icon: "/nav/duel.svg", pad: "px-3 sm:px-4" },
  { href: "/leaderboard", label: "Xếp hạng", icon: "/nav/ranking.svg", pad: "px-1.5 sm:px-2.5" },
  { href: "/badges", label: "Huy hiệu", icon: "/nav/badges.svg", pad: "px-1.5 sm:px-2.5" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/learn");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const DUEL_TAB_KEY = "nanu-duel-tab";
const DUEL_TAB_EVENT = "nanu-duel-tab-change";

let pendingNavPath: string | null = null;
const pendingNavListeners = new Set<() => void>();

/** The tab the learner just clicked, until that route actually opens. */
export function publishPendingNav(path: string | null): void {
  pendingNavPath = path;
  pendingNavListeners.forEach((listener) => listener());
}

function subscribePendingNav(onChange: () => void): () => void {
  pendingNavListeners.add(onChange);
  return () => pendingNavListeners.delete(onChange);
}

function readPendingNav(): string | null {
  return pendingNavPath;
}

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

let freshBadgesRequest: Promise<FreshBadge[]> | null = null;

/**
 * Unseen badges, or null when the last check is recent. A check already on
 * its way is shared, so a remounted nav still gets its answer.
 */
function requestFreshBadges(): Promise<FreshBadge[]> | null {
  if (freshBadgesRequest) return freshBadgesRequest;
  if (!badgeCheckDue()) return null;
  freshBadgesRequest = fetch("/api/badges?unseen=1")
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => {
      markBadgeCheck();
      return readFreshBadges(data);
    })
    // No popup this time. The next check finds the same unlocks.
    .catch(() => [])
    .finally(() => {
      freshBadgesRequest = null;
    });
  return freshBadgesRequest;
}

export function BottomNav() {
  const livePath = usePathname() ?? "/";
  const pendingPath = useSyncExternalStore(subscribePendingNav, readPendingNav, () => null);
  const pathname = pendingPath ?? livePath;
  const [challenges, setChallenges] = useState(0);
  const duelTab = useSyncExternalStore(subscribeDuelTab, readDuelTab, () => true);
  const questsLeft = useSyncExternalStore(subscribeQuestBadge, readQuestBadge, () => 0);
  const [freshBadges, setFreshBadges] = useState<FreshBadge[]>([]);

  useEffect(() => {
    // The badges screen shows its own unlocks.
    if (pathname.startsWith("/badges")) return;
    const request = requestFreshBadges();
    if (!request) return;
    let cancelled = false;
    void request.then((badges) => {
      if (!cancelled) setFreshBadges(badges);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const finishBadges = useCallback((ids: string[]) => {
    setFreshBadges([]);
    markBadgesSeenRemote(ids);
  }, []);

  useEffect(() => {
    // The quests screen publishes its own count, so it needs no second request.
    if (pathname.startsWith("/quests")) return;
    let cancelled = false;
    const load = () => {
      void fetch("/api/quests", { headers: questZoneHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (cancelled || !data || typeof data !== "object") return;
          const board = data as { ready?: unknown; quests?: unknown };
          if (board.ready !== true || !Array.isArray(board.quests)) {
            publishQuestBadge(0);
            return;
          }
          publishQuestBadge(
            board.quests.filter((quest) => !(quest as { done?: unknown }).done).length,
          );
        })
        .catch(() => {
          // The tab still works. The badge appears after the next check.
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

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
    <>
      <AnimatePresence>
        {freshBadges.length > 0 && !pathname.startsWith("/badges") ? (
          <BadgeUnlockSheet key="badge-unlock" badges={freshBadges} onDone={finishBadges} />
        ) : null}
      </AnimatePresence>
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dae2fd] bg-white/95 pb-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-around px-1 py-1.5 sm:px-3">
          {ITEMS.filter((item) => item.href !== "/duel" || duelTab || pathname.startsWith("/duel")).map((item) => {
            const active = isCurrent(pathname, item.href);
            const badge =
              item.href === "/duel" ? challenges : item.href === "/quests" ? questsLeft : 0;
            const badgeNote =
              item.href === "/quests" ? "nhiệm vụ chưa xong" : "lời thách đấu chưa chơi";
            const label = badge > 0 ? `${item.label}, ${badge} ${badgeNote}` : item.label;
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
                  className={`whitespace-nowrap font-label-sm text-[12px] font-semibold leading-4 tracking-[0.02em] ${
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
    </>
  );
}
