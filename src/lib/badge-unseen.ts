import type { BadgeBoardView } from "@/lib/badges";

/**
 * When the bottom nav last asked for new badges. Checking counts every stat,
 * so it runs at most once per BADGE_CHECK_EVERY_MS per tab session.
 */

const KEY = "nanu-badge-checked-at";
export const BADGE_CHECK_EVERY_MS = 45_000;

/** How long a badges board can be shown again without another request. */
const BOARD_FRESH_MS = 30_000;

let boardCache: { board: BadgeBoardView; at: number } | null = null;

/** The last badges board from this tab, and whether it is still inside the fresh window. */
export function cachedBadgeBoard(now = Date.now()): { board: BadgeBoardView; fresh: boolean } | null {
  if (typeof window === "undefined" || !boardCache) return null;
  return { board: boardCache.board, fresh: now - boardCache.at < BOARD_FRESH_MS };
}

export function rememberBadgeBoard(board: BadgeBoardView, now = Date.now()): void {
  if (typeof window === "undefined") return;
  boardCache = { board, at: now };
}

export function clearBadgeBoardCache(): void {
  boardCache = null;
}

export function badgeCheckDue(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return !Number.isFinite(at) || now - at >= BADGE_CHECK_EVERY_MS;
  } catch {
    return true;
  }
}

export function markBadgeCheck(now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Storage can be blocked. The nav then checks on every page.
  }
}
