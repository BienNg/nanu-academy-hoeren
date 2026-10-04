/** Unfinished quests today, shared between the bottom nav and the quests screen. */

const KEY = "nanu-quest-badge";
const EVENT = "nanu-quest-badge-change";

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
