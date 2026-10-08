/** Named controls a learner tap can count. Button text is never stored. */
export const UI_CLICK_LABELS = {
  "nav.learn": "Học",
  "nav.quests": "Nhiệm vụ",
  "nav.duel": "Đấu",
  "nav.leaderboard": "Xếp hạng",
  "nav.badges": "Huy hiệu",
  "duel.ready": "Đấu",
  "duel.locked.study": "Đấu",
  "duel.locked.cap": "Đấu",
  "duel.locked.no_class": "Đấu",
  "duel.locked.no_overlap": "Đấu",
  "duel.locked.off": "Đấu",
  "duel.locked.admin": "Đấu",
  "duel.locked.unavailable": "Đấu",
} as const;

/** Same artwork as the bottom nav, so an admin row reads as that tab. */
export const UI_CLICK_ICONS: Record<UiClickTarget, string> = {
  "nav.learn": "/nav/learn.svg",
  "nav.quests": "/nav/quests.svg",
  "nav.duel": "/nav/duel.svg",
  "nav.leaderboard": "/nav/ranking.svg",
  "nav.badges": "/nav/badges.svg",
  "duel.ready": "/nav/duel.svg",
  "duel.locked.study": "/nav/duel.svg",
  "duel.locked.cap": "/nav/duel.svg",
  "duel.locked.no_class": "/nav/duel.svg",
  "duel.locked.no_overlap": "/nav/duel.svg",
  "duel.locked.off": "/nav/duel.svg",
  "duel.locked.admin": "/nav/duel.svg",
  "duel.locked.unavailable": "/nav/duel.svg",
};

export type UiClickTarget = keyof typeof UI_CLICK_LABELS;

export type UiClickCount = {
  target: UiClickTarget;
  day: string;
  count: number;
};

export type StudentUiClick = {
  target: UiClickTarget;
  label: string;
  count: number;
};

/** One flush: the counts logged together, at the moment they were sent. */
export type UiClickGroup = {
  loggedAt: string;
  clicks: StudentUiClick[];
};

/** Asia/Ho_Chi_Minh is UTC+7 all year. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

export const UI_CLICK_FLUSH_MS = 30_000;
export const UI_CLICK_MAX_TARGETS = 20;
export const UI_CLICK_MAX_COUNT = 50;
export const UI_CLICK_KEEP_DAYS = 90;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isUiClickTarget(value: string): value is UiClickTarget {
  return Object.prototype.hasOwnProperty.call(UI_CLICK_LABELS, value);
}

/** Calendar day in Vietnam for the instant the learner tapped. */
export function vietnamCalendarDay(now = Date.now()): string {
  return new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function shiftCalendarDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Flushes older than this instant are dropped on the next save. */
export function uiClickCutoffIso(now = Date.now()): string {
  return new Date(now - UI_CLICK_KEEP_DAYS * 86_400_000).toISOString();
}

/** A flush stays with the visit that was open, until the next visit or 15 minutes. */
export const UI_CLICK_VISIT_GRACE_MS = 15 * 60 * 1000;

export function uiClickGroupCounts(clicks: readonly UiClickCount[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const click of clicks) {
    counts[click.target] = (counts[click.target] ?? 0) + click.count;
  }
  return counts;
}

export function uiClickGroupFromRow(loggedAt: unknown, counts: unknown): UiClickGroup | null {
  if (typeof loggedAt !== "string" || Number.isNaN(Date.parse(loggedAt))) return null;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null;
  const clicks = summarizeUiClicks(
    Object.entries(counts as Record<string, unknown>).flatMap(([target, count]) =>
      typeof count === "number" ? [{ target, count }] : [],
    ),
  );
  if (clicks.length === 0) return null;
  return { loggedAt, clicks };
}

/**
 * Why the Đấu page did or did not offer a new duel. Stored as the click target,
 * so the visit can say whether start was available.
 */
const DUEL_OPEN_DETAIL: Partial<Record<UiClickTarget, string>> = {
  "duel.ready": "start available",
  "duel.locked.study": "start locked, study more first",
  "duel.locked.cap": "start locked, too many open duels",
  "duel.locked.no_class": "start locked, no class",
  "duel.locked.no_overlap": "start locked, no classmate ready",
  "duel.locked.off": "start locked, duels are off",
  "duel.locked.admin": "start locked, teacher account",
  "duel.locked.unavailable": "start locked, no opponent right now",
};

/** One tab opening, written the way an admin reads a visit. */
export function describeVisitClick(click: StudentUiClick): string {
  const times = click.count === 1 ? "once" : `${click.count} times`;
  const detail = DUEL_OPEN_DETAIL[click.target];
  const state = detail ? `, ${detail}` : "";
  return `Opened the ${click.label} tab ${times}${state}`;
}

export function formatVisitClicks(clicks: readonly StudentUiClick[]): string {
  return clicks.map(describeVisitClick).join(" · ");
}

/**
 * Put each flush on the visit that was open when it was logged. A flush just
 * after the visit's last touch still belongs there, until the next visit starts
 * or 15 minutes pass. Anything later is returned unmatched.
 */
export function placeUiClickGroups(
  visits: readonly { id: string; startedAt: string; endedAt: string }[],
  groups: readonly UiClickGroup[],
): { byVisitId: Map<string, StudentUiClick[]>; unmatched: UiClickGroup[] } {
  const ordered = [...visits].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const totals = new Map<string, Map<UiClickTarget, number>>();
  const unmatched: UiClickGroup[] = [];

  for (const group of groups) {
    const at = Date.parse(group.loggedAt);
    if (Number.isNaN(at)) continue;
    let match: (typeof ordered)[number] | null = null;
    for (const visit of ordered) {
      const start = Date.parse(visit.startedAt);
      if (Number.isNaN(start) || start > at) break;
      match = visit;
    }
    if (!match) {
      unmatched.push(group);
      continue;
    }
    const current = match;
    const start = Date.parse(current.startedAt);
    const end = Date.parse(current.endedAt);
    const closedAt = Number.isNaN(end) ? start : Math.max(end, start);
    const next = ordered.find((visit) => visit.startedAt > current.startedAt);
    const nextStart = next ? Date.parse(next.startedAt) : Number.POSITIVE_INFINITY;
    // The visit stays current until the next one starts. After it has been
    // closed for 15 minutes with no new visit, the flush is listed on its own.
    if (at > closedAt + UI_CLICK_VISIT_GRACE_MS || at >= nextStart) {
      unmatched.push(group);
      continue;
    }
    const bucket = totals.get(current.id) ?? new Map<UiClickTarget, number>();
    for (const click of group.clicks) {
      bucket.set(click.target, (bucket.get(click.target) ?? 0) + click.count);
    }
    totals.set(current.id, bucket);
  }

  const byVisitId = new Map<string, StudentUiClick[]>();
  for (const [id, bucket] of totals) {
    byVisitId.set(
      id,
      summarizeUiClicks([...bucket].map(([target, count]) => ({ target, count }))),
    );
  }
  return { byVisitId, unmatched };
}

export function addUiClick(
  pending: readonly UiClickCount[],
  target: UiClickTarget,
  now = Date.now(),
): UiClickCount[] {
  const day = vietnamCalendarDay(now);
  const next = pending.map((item) => ({ ...item }));
  const found = next.find((item) => item.target === target && item.day === day);
  if (found) found.count += 1;
  else next.push({ target, day, count: 1 });
  return next;
}

export function mergeUiClicks(
  left: readonly UiClickCount[],
  right: readonly UiClickCount[],
): UiClickCount[] {
  const next = left.map((item) => ({ ...item }));
  for (const item of right) {
    const found = next.find((entry) => entry.target === item.target && entry.day === item.day);
    if (found) found.count += item.count;
    else next.push({ ...item });
  }
  return next;
}

/** True when the buffer should be sent now instead of waiting out the timer. */
export function uiClickBufferFull(pending: readonly UiClickCount[]): boolean {
  return (
    pending.length >= UI_CLICK_MAX_TARGETS ||
    pending.some((item) => item.count >= UI_CLICK_MAX_COUNT)
  );
}

/**
 * One flush: at most 20 targets, and at most 50 taps of each.
 * Anything past those caps stays in `rest` for the next send.
 */
export function takeUiClickBatch(pending: readonly UiClickCount[]): {
  batch: UiClickCount[];
  rest: UiClickCount[];
} {
  const batch: UiClickCount[] = [];
  const rest: UiClickCount[] = [];
  for (const item of pending) {
    if (batch.length >= UI_CLICK_MAX_TARGETS) {
      rest.push({ ...item });
      continue;
    }
    const take = Math.min(item.count, UI_CLICK_MAX_COUNT);
    batch.push({ target: item.target, day: item.day, count: take });
    if (item.count > take) rest.push({ target: item.target, day: item.day, count: item.count - take });
  }
  return { batch, rest };
}

function clickList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const clicks = (body as { clicks?: unknown }).clicks;
  return Array.isArray(clicks) ? clicks : [];
}

/**
 * Counts the server will add. Unknown targets, other days, and oversized
 * counts are dropped. Only today and yesterday in Vietnam are accepted, so a
 * flush after midnight still lands on the tap's day.
 */
export function acceptUiClicks(body: unknown, now = Date.now()): UiClickCount[] {
  const today = vietnamCalendarDay(now);
  const yesterday = shiftCalendarDay(today, -1);
  const merged = new Map<string, UiClickCount>();
  for (const item of clickList(body)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const target = record.target;
    const day = record.day;
    const count = record.count;
    if (typeof target !== "string" || !isUiClickTarget(target)) continue;
    if (typeof day !== "string" || !DAY.test(day) || (day !== today && day !== yesterday)) continue;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > UI_CLICK_MAX_COUNT) {
      continue;
    }
    const key = `${day}:${target}`;
    const existing = merged.get(key);
    if (existing) {
      if (existing.count + count > UI_CLICK_MAX_COUNT) continue;
      existing.count += count;
      continue;
    }
    if (merged.size >= UI_CLICK_MAX_TARGETS) continue;
    merged.set(key, { target, day, count });
  }
  return [...merged.values()];
}

export function summarizeUiClicks(
  rows: readonly { target: string; count: number }[],
): StudentUiClick[] {
  const totals = new Map<UiClickTarget, number>();
  for (const row of rows) {
    if (!isUiClickTarget(row.target) || !Number.isInteger(row.count) || row.count <= 0) continue;
    totals.set(row.target, (totals.get(row.target) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([target, count]) => ({ target, label: UI_CLICK_LABELS[target], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

let pendingClicks: UiClickCount[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hooksInstalled = false;
let flushing = false;

function clearFlushTimer(): void {
  if (flushTimer == null) return;
  clearTimeout(flushTimer);
  flushTimer = null;
}

function installUiClickHooks(): void {
  if (hooksInstalled || typeof window === "undefined") return;
  hooksInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUiClicksBeacon();
  });
  window.addEventListener("pagehide", flushUiClicksBeacon);
}

function armUiClickFlush(): void {
  if (typeof window === "undefined") return;
  installUiClickHooks();
  if (uiClickBufferFull(pendingClicks)) {
    void flushUiClicks();
    return;
  }
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUiClicks();
  }, UI_CLICK_FLUSH_MS);
}

function restoreClicks(batch: readonly UiClickCount[]): void {
  pendingClicks = mergeUiClicks(batch, pendingClicks);
  if (pendingClicks.length > 0) armUiClickFlush();
}

/** Send the open buffer. A hidden tab uses sendBeacon so the counts still leave. */
function flushUiClicksBeacon(): void {
  if (pendingClicks.length === 0 || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return;
  }
  const taken = takeUiClickBatch(pendingClicks);
  pendingClicks = taken.rest;
  const body = new Blob([JSON.stringify({ clicks: taken.batch })], { type: "application/json" });
  if (!navigator.sendBeacon("/api/clicks", body)) {
    pendingClicks = mergeUiClicks(taken.batch, pendingClicks);
  }
  if (pendingClicks.length === 0) clearFlushTimer();
  else armUiClickFlush();
}

async function flushUiClicks(): Promise<void> {
  if (flushing || pendingClicks.length === 0 || typeof window === "undefined") return;
  const taken = takeUiClickBatch(pendingClicks);
  pendingClicks = taken.rest;
  if (pendingClicks.length === 0) clearFlushTimer();
  flushing = true;
  try {
    const response = await fetch("/api/clicks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clicks: taken.batch }),
      keepalive: true,
    });
    if (response.status === 401 || response.status === 410) return;
    if (!response.ok) restoreClicks(taken.batch);
  } catch {
    restoreClicks(taken.batch);
  } finally {
    flushing = false;
    if (pendingClicks.length > 0) armUiClickFlush();
  }
}

/** Count one tap. The network send waits until the buffer fills, the page changes, 30s pass, or the tab hides. */
export function trackUiClick(target: UiClickTarget, now = Date.now()): void {
  pendingClicks = addUiClick(pendingClicks, target, now);
  armUiClickFlush();
}

/** The start-button state the Đấu page showed. Matches `duelStartGate` in duels.ts. */
export type DuelStartClick =
  | "available"
  | "study"
  | "cap"
  | "no_class"
  | "no_overlap"
  | "off"
  | "admin"
  | "unavailable";

const DUEL_START_TARGET: Record<DuelStartClick, UiClickTarget> = {
  available: "duel.ready",
  study: "duel.locked.study",
  cap: "duel.locked.cap",
  no_class: "duel.locked.no_class",
  no_overlap: "duel.locked.no_overlap",
  off: "duel.locked.off",
  admin: "duel.locked.admin",
  unavailable: "duel.locked.unavailable",
};

let lastDuelStartSeen: { target: UiClickTarget; at: number } | null = null;

/** Count one opening of the Đấu page, with the start button's state. A strict-mode remount does not count twice. */
export function trackDuelStartSeen(gate: DuelStartClick, now = Date.now()): void {
  const target = DUEL_START_TARGET[gate];
  if (lastDuelStartSeen && lastDuelStartSeen.target === target && now - lastDuelStartSeen.at < 1000) return;
  lastDuelStartSeen = { target, at: now };
  trackUiClick(target, now);
}

/** Send taps already counted. A route change calls this so the visit can show them. */
export function flushTrackedClicks(): void {
  void flushUiClicks();
}
