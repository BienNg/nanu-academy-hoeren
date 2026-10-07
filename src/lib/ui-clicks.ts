/** Named controls a learner tap can count. Button text is never stored. */
export const UI_CLICK_LABELS = {
  "nav.learn": "Học",
  "nav.quests": "Nhiệm vụ",
  "nav.duel": "Đấu",
  "nav.leaderboard": "Xếp hạng",
  "nav.badges": "Huy hiệu",
} as const;

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

export type UiClickRange = "today" | "7d" | "all";

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

/** Rows older than this day are dropped on the next flush. */
export function uiClickCutoffDay(now = Date.now()): string {
  return shiftCalendarDay(vietnamCalendarDay(now), -UI_CLICK_KEEP_DAYS);
}

/** Inclusive Vietnam days for the admin range. `null` is the retained history. */
export function uiClickRangeDays(
  range: UiClickRange,
  now = Date.now(),
): { from: string; to: string } | null {
  if (range === "all") return null;
  const today = vietnamCalendarDay(now);
  return {
    from: range === "today" ? today : shiftCalendarDay(today, -6),
    to: today,
  };
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

/** Count one tap. The network send waits until the buffer fills, 30s pass, or the tab hides. */
export function trackUiClick(target: UiClickTarget, now = Date.now()): void {
  pendingClicks = addUiClick(pendingClicks, target, now);
  armUiClickFlush();
}
