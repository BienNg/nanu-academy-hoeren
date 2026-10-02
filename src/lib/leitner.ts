/**
 * Leitner boxes for the "Ôn tập" tab. Every practised level clip sits in a
 * box 0-6, and the box decides how many days pass before it is due again.
 * Days are Vietnam calendar days, so everything due today is ready at midnight.
 * No imports so the node tests can compile this file on its own.
 */

/**
 * Days until a clip in box N is due again.
 * Misses return tomorrow. Each success about doubles the wait, and a mastered
 * clip still comes back every month so review stays part of the course.
 */
export const BOX_INTERVAL_DAYS = [1, 2, 4, 7, 14, 21, 30] as const;

export const TOP_BOX = BOX_INTERVAL_DAYS.length - 1;

/** Due clips dealt in one review round. Each becomes two cards. */
export const REVIEW_ROUND_CLIPS = 10;

/** Reviewable sentences needed before the box chart unlocks. */
export const REVIEW_UNLOCK_CLIPS = 10;

export const LEITNER_SCHEMA_HINT =
  "Review boxes are not being stored yet. Run supabase/leitner.sql once in the Supabase SQL editor.";

export type BoxState = {
  box: number;
  /** `YYYY-MM-DD` in Asia/Ho_Chi_Minh. */
  dueOn: string;
  lapses: number;
};

/** One graded clip, from a practice part or a review round. */
export type ClipEvent = {
  lessonKey: string;
  clipId: string;
  /** Any card of the clip was wrong at least once. */
  missed: boolean;
  /** ISO timestamp. */
  at: string;
  /** Tie-break for clips saved together, e.g. the clip's place in its part. */
  order?: number;
};

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Vietnam calendar day of a moment. Vietnam has no daylight saving time. */
export function vietnamDay(date: Date): string {
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  if (!DAY_KEY.test(day)) throw new Error(`Not a day key: "${day}"`);
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function isDue(state: BoxState, today: string): boolean {
  return state.dueOn <= today;
}

/**
 * The four rules.
 * New clip: right first try → box 1, missed → box 0.
 * Any miss on a clip that already has a box → box 0 and one more lapse, due or not.
 * Right on a due clip → one box up (box 6 stays at 6).
 * Right before the due day → nothing changes.
 */
export function applyAnswer(state: BoxState | null, missed: boolean, today: string): BoxState {
  if (!state) {
    const box = missed ? 0 : 1;
    return { box, dueOn: addDays(today, BOX_INTERVAL_DAYS[box]), lapses: 0 };
  }
  if (missed) {
    return { box: 0, dueOn: addDays(today, BOX_INTERVAL_DAYS[0]), lapses: state.lapses + 1 };
  }
  if (!isDue(state, today)) return state;
  const box = Math.min(state.box + 1, TOP_BOX);
  return { box, dueOn: addDays(today, BOX_INTERVAL_DAYS[box]), lapses: state.lapses };
}

export function boxKey(lessonKey: string, clipId: string): string {
  return `${lessonKey}\t${clipId}`;
}

/** Oldest first. Clips saved in the same moment keep their saved order. */
export function sortEvents<E extends ClipEvent>(events: readonly E[]): E[] {
  return [...events].sort((left, right) => {
    const time = Date.parse(left.at) - Date.parse(right.at);
    if (time !== 0) return time;
    return (left.order ?? 0) - (right.order ?? 0);
  });
}

/** Every clip's box after replaying its whole history through the rules. */
export function replayEvents(events: readonly ClipEvent[]): Map<string, BoxState> {
  const boxes = new Map<string, BoxState>();
  for (const event of sortEvents(events)) {
    const key = boxKey(event.lessonKey, event.clipId);
    const today = vietnamDay(new Date(event.at));
    boxes.set(key, applyAnswer(boxes.get(key) ?? null, event.missed, today));
  }
  return boxes;
}

/** Review order: most lapses first, then the lowest box, then the longest overdue. */
export function compareReviewPriority(left: BoxState, right: BoxState): number {
  if (left.lapses !== right.lapses) return right.lapses - left.lapses;
  if (left.box !== right.box) return left.box - right.box;
  if (left.dueOn !== right.dueOn) return left.dueOn < right.dueOn ? -1 : 1;
  return 0;
}

/** "1 ngày", "2 tuần", "1 tháng". The labels follow the box table. */
export function intervalLabel(days: number): string {
  if (days >= 30 && days % 30 === 0) return `${days / 30} tháng`;
  if (days >= 7 && days % 7 === 0) return `${days / 7} tuần`;
  return `${days} ngày`;
}
