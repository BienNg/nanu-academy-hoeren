"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { BadgeUnlockSheet, markBadgesSeenRemote } from "@/components/BadgeParts";
import { DuelChallengeIntro, requestChallengeShowdown } from "@/components/DuelChallengeIntro";
import { badgeCheckDue, clearBadgeBoardCache, markBadgeCheck } from "@/lib/badge-unseen";
import { readFreshBadges, type FreshBadge } from "@/lib/badges";
import { readIncomingChallenges, type IncomingChallenge } from "@/lib/duels";
import {
  clearQuestBoardCache,
  publishQuestBadge,
  readQuestBadge,
  rememberQuestBoard,
  subscribeQuestBadge,
} from "@/lib/quest-badge";
import { questZoneHeaders, readQuestBoard } from "@/lib/quests";
import { flushTrackedClicks, trackUiClick, type UiClickTarget } from "@/lib/ui-clicks";

const ITEMS = [
  { href: "/", label: "Học", icon: "/nav/learn.svg", target: "nav.learn" },
  { href: "/quests", label: "Nhiệm vụ", icon: "/nav/quests.svg", target: "nav.quests" },
  { href: "/duel", label: "Đấu", icon: "/nav/duel.svg", target: "nav.duel" },
  { href: "/leaderboard", label: "Xếp hạng", icon: "/nav/ranking.svg", target: "nav.leaderboard" },
  { href: "/badges", label: "Huy hiệu", icon: "/nav/badges.svg", target: "nav.badges" },
  { href: "/account", label: "Hồ sơ", icon: "/nav/profile.svg", target: "nav.profile" },
] as const satisfies readonly { href: string; label: string; icon: string; target: UiClickTarget }[];

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

const NAV_FRESH_MS = 60_000;

let questsCheckedAt = 0;
let questsInflight = false;
let duelsCheckedAt = 0;
let duelBadgeSnapshot: IncomingChallenge[] | null = null;
let duelBadgeRequest: Promise<IncomingChallenge[] | null> | null = null;

/** One duel-badge read, shared by a nav that remounts while it is still running. */
function requestDuelBadge(force: boolean): Promise<IncomingChallenge[] | null> | "fresh" {
  if (duelBadgeRequest) return duelBadgeRequest;
  if (!force && !navCheckDue(duelsCheckedAt)) return "fresh";
  const started = Date.now();
  duelsCheckedAt = started;
  duelBadgeRequest = fetch("/api/duels?badge=1")
    .then((response) => {
      if (!response.ok) throw new Error("duels");
      return response.json();
    })
    .then((data: unknown) => {
      if (!data || typeof data !== "object") throw new Error("duels");
      const next = readIncomingChallenges(data);
      duelBadgeSnapshot = next;
      writeDuelTab((data as { available?: unknown }).available !== false);
      return next;
    })
    .catch(() => {
      if (duelsCheckedAt === started) duelsCheckedAt = 0;
      duelBadgeSnapshot = [];
      return null;
    })
    .finally(() => {
      duelBadgeRequest = null;
    });
  return duelBadgeRequest;
}

function navCheckDue(checkedAt: number, now = Date.now()): boolean {
  return checkedAt === 0 || now - checkedAt >= NAV_FRESH_MS;
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
      const badges = readFreshBadges(data);
      if (badges.length > 0) clearBadgeBoardCache();
      return badges;
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

  useEffect(() => {
    flushTrackedClicks();
  }, [livePath]);
  const pathname = pendingPath ?? livePath;
  const [challenges, setChallenges] = useState<IncomingChallenge[]>([]);
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

  useLayoutEffect(() => {
    if (duelBadgeSnapshot) setChallenges(duelBadgeSnapshot);
  }, []);

  useEffect(() => {
    // The quests screen publishes its own count, so it needs no second request.
    // Other screens keep that count for a minute. Focusing the tab asks again.
    if (pathname.startsWith("/quests")) return;
    const load = (force: boolean) => {
      if (questsInflight) return;
      if (!force && !navCheckDue(questsCheckedAt)) return;
      const started = Date.now();
      questsCheckedAt = started;
      questsInflight = true;
      void fetch("/api/quests", { headers: questZoneHeaders() })
        .then((response) => {
          if (!response.ok) throw new Error("quests");
          return response.json();
        })
        .then((data: unknown) => {
          const board = readQuestBoard(data);
          if (!board) {
            publishQuestBadge(0);
            return;
          }
          publishQuestBadge(board.quests.filter((quest) => !quest.done).length);
          // A claim in this request changed the board. The quests tab should load it again.
          if (board.update) clearQuestBoardCache();
          else rememberQuestBoard({ ...board, update: null });
        })
        .catch(() => {
          if (questsCheckedAt === started) questsCheckedAt = 0;
        })
        .finally(() => {
          questsInflight = false;
        });
    };
    load(false);
    const onFocus = () => load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const load = (force: boolean) => {
      const result = requestDuelBadge(force);
      if (result === "fresh") {
        if (duelBadgeSnapshot) setChallenges(duelBadgeSnapshot);
        return;
      }
      void result.then((next) => {
        if (cancelled) return;
        setChallenges(next ?? []);
      });
    };
    load(false);
    const onFocus = () => load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return (
    <>
      <AnimatePresence>
        {freshBadges.length > 0 && !pathname.startsWith("/badges") ? (
          <BadgeUnlockSheet key="badge-unlock" badges={freshBadges} onDone={finishBadges} />
        ) : null}
      </AnimatePresence>
      <DuelChallengeIntro challenges={challenges} blocked={freshBadges.length > 0} />
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dae2fd] bg-white/95 pb-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-lg items-end justify-around px-1 py-1.5 sm:px-2">
          {ITEMS.filter((item) => item.href !== "/duel" || duelTab || pathname.startsWith("/duel")).map((item) => {
            const active = isCurrent(pathname, item.href);
            const badge =
              item.href === "/duel" ? challenges.length : item.href === "/quests" ? questsLeft : 0;
            const badgeNote =
              item.href === "/quests" ? "nhiệm vụ chưa xong" : "lời thách đấu chưa chơi";
            const label = badge > 0 ? `${item.label}, ${badge} ${badgeNote}` : item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                onClick={() => {
                  // The Đấu page records the open, with whether start was available.
                  if (item.target === "nav.duel") {
                    if (challenges.length > 0) requestChallengeShowdown();
                    return;
                  }
                  trackUiClick(item.target);
                }}
                className={`flex min-w-0 flex-col items-center gap-px rounded-2xl border-2 px-0.5 py-1 sm:px-2 ${
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
                  className={`whitespace-nowrap font-label-sm text-[11px] font-semibold leading-4 tracking-[0.01em] sm:text-[12px] ${
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
