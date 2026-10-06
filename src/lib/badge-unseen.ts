/**
 * When the bottom nav last asked for new badges. Checking counts every stat,
 * so it runs at most once per BADGE_CHECK_EVERY_MS per tab session.
 */

const KEY = "nanu-badge-checked-at";
export const BADGE_CHECK_EVERY_MS = 45_000;

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
