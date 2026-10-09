import type { QuestBoardView } from "@/lib/quests";

/** Unfinished quests today, shared between the bottom nav and the quests screen. */

const KEY = "nanu-quest-badge";
const EVENT = "nanu-quest-badge-change";

/** How long a quest board can be shown again without another request. */
const BOARD_FRESH_MS = 30_000;

let boardCache: { board: QuestBoardView; at: number } | null = null;

/** The last quest board from this tab, and whether it is still inside the fresh window. */
export function cachedQuestBoard(now = Date.now()): { board: QuestBoardView; fresh: boolean } | null {
  if (typeof window === "undefined" || !boardCache) return null;
  return { board: boardCache.board, fresh: now - boardCache.at < BOARD_FRESH_MS };
}

export function rememberQuestBoard(board: QuestBoardView, now = Date.now()): void {
  if (typeof window === "undefined") return;
  boardCache = { board, at: now };
}

export function clearQuestBoardCache(): void {
  boardCache = null;
}

export function readQuestBadge(): number {
  try {
    const count = Number(sessionStorage.getItem(KEY));
    return Number.isInteger(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export function publishQuestBadge(count: number): void {
  try {
    sessionStorage.setItem(KEY, String(Math.max(0, Math.floor(count))));
  } catch {
    // Storage can be blocked. The badge then only updates on the next fetch.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeQuestBadge(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
