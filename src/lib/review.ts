/**
 * Spaced repetition ("Ôn tập") for listening clips, as Leitner boxes.
 * A clip heard right on the first try moves up one box and comes back later;
 * a miss sends it back to box 0 (tomorrow). Due dates fall on the start of a
 * Vietnam calendar day, so everything due "today" is due from midnight on.
 * No imports so the node tests can compile this file on its own.
 */

/** Days until the next review, by box. The last box is the longest wait. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60, 120] as const;
export const REVIEW_MAX_BOX = REVIEW_INTERVAL_DAYS.length - 1;
/** Clips in one review session. Each clip is one dictation card. */
export const REVIEW_DECK_SIZE = 10;
export const REVIEW_XP_PER_CLIP = 3;
export const REVIEW_DECK_MAX_XP = 15;
/** Review sessions that pay XP per Vietnam day. Later ones still move boxes. */
export const REVIEW_PAID_DECKS_PER_DAY = 3;
/** Same floor as listening XP: faster than this per clip is not listening. */
export const REVIEW_MIN_MS_PER_CLIP = 2000;

export const REVIEW_SCHEMA_HINT =
  "Run supabase/review_items.sql once in the Supabase SQL editor.";

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export type ReviewGrade = "good" | "again";

export type ReviewState = {
  box: number;
  /** ISO timestamp. */
  dueAt: string;
  lastReviewedAt: string | null;
  reviews: number;
  lapses: number;
};

export type ReviewOutcome = {
  lessonKey: string;
  clipId: string;
  missed: boolean;
};

export type ReviewHistoryRow = ReviewOutcome & {
  /** ISO timestamp. */
  createdAt: string;
};

export type ReviewSummary = {
  /** False when the review tables are not set up or the store is off. */
  ready: boolean;
  due: number;
  /** Clips that have a review schedule at all. */
  total: number;
};

export type DueReviewItem = {
  lessonKey: string;
  clipId: string;
  dueAt: string;
  lapses: number;
};

export function isReviewSchemaMissing(message: string): boolean {
  return (
    /review_items|review_xp_awards/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export function reviewKey(lessonKey: string, clipId: string): string {
  return `${lessonKey}\u0000${clipId}`;
}

/** Level slug of a `level/lektion` key, e.g. `a1-1` for `a1-1/lektion-4`. */
export function reviewLevelSlug(lessonKey: string): string {
  const slash = lessonKey.indexOf("/");
  return slash === -1 ? lessonKey : lessonKey.slice(0, slash);
}

/** Midnight in Asia/Ho_Chi_Minh, `days` Vietnam days after the day of `now`. */
export function reviewDueAt(box: number, now: Date): string {
  const safeBox = Math.min(Math.max(0, Math.floor(box)), REVIEW_MAX_BOX);
  const days = REVIEW_INTERVAL_DAYS[safeBox] ?? 1;
  const dayStart = Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  return new Date(dayStart + days * DAY_MS).toISOString();
}

export function isReviewDue(state: Pick<ReviewState, "dueAt">, now: Date): boolean {
  const due = Date.parse(state.dueAt);
  return Number.isFinite(due) && due <= now.getTime();
}

export function reviewGrade(result: { missed: boolean }): ReviewGrade {
  return result.missed ? "again" : "good";
}

/**
 * The next state after one answer.
 * - A miss always goes back to box 0 (tomorrow). A miss on a known clip is a lapse.
 * - A right answer on a new clip starts in box 1.
 * - A right answer on a due clip moves up one box.
 * - A right answer before the clip is due (a lesson replay) changes nothing
 *   except the last-seen time, so replays cannot skip boxes.
 */
export function nextReviewState(
  previous: ReviewState | null,
  grade: ReviewGrade,
  now: Date,
): ReviewState {
  const reviewedAt = now.toISOString();
  if (grade === "again") {
    return {
      box: 0,
      dueAt: reviewDueAt(0, now),
      lastReviewedAt: reviewedAt,
      reviews: (previous?.reviews ?? 0) + 1,
      lapses: (previous?.lapses ?? 0) + (previous ? 1 : 0),
    };
  }
  if (previous && !isReviewDue(previous, now)) {
    return { ...previous, lastReviewedAt: reviewedAt };
  }
  const box = previous ? Math.min(previous.box + 1, REVIEW_MAX_BOX) : 1;
  return {
    box,
    dueAt: reviewDueAt(box, now),
    lastReviewedAt: reviewedAt,
    reviews: (previous?.reviews ?? 0) + 1,
    lapses: previous?.lapses ?? 0,
  };
}

/**
 * Applies a batch of answers given at `now` on top of the known states.
 * A clip answered twice in one batch keeps its worst answer.
 */
export function applyReviewOutcomes(
  known: ReadonlyMap<string, ReviewState>,
  outcomes: readonly ReviewOutcome[],
  now: Date,
): Map<string, ReviewState> {
  const worst = new Map<string, ReviewOutcome>();
  for (const outcome of outcomes) {
    const key = reviewKey(outcome.lessonKey, outcome.clipId);
    const current = worst.get(key);
    if (!current || (outcome.missed && !current.missed)) worst.set(key, outcome);
  }
  const next = new Map<string, ReviewState>();
  for (const [key, outcome] of worst) {
    next.set(key, nextReviewState(known.get(key) ?? null, reviewGrade(outcome), now));
  }
  return next;
}

/** Rebuilds review states from past clip results, oldest first. Used once per learner. */
export function replayReviewHistory(rows: readonly ReviewHistoryRow[]): Map<string, ReviewState> {
  const ordered = rows
    .map((row, index) => ({ row, index, at: Date.parse(row.createdAt) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  const states = new Map<string, ReviewState>();
  for (const { row, at } of ordered) {
    const key = reviewKey(row.lessonKey, row.clipId);
    states.set(key, nextReviewState(states.get(key) ?? null, reviewGrade(row), new Date(at)));
  }
  return states;
}

/**
 * Due clips for one session: most overdue first, then the ones missed most.
 * `isKnown` drops clips that no longer exist or sit in a locked level.
 */
export function pickReviewItems(
  items: readonly DueReviewItem[],
  isKnown: (item: DueReviewItem) => boolean,
  now: Date,
  limit = REVIEW_DECK_SIZE,
): DueReviewItem[] {
  return items
    .filter((item) => isReviewDue(item, now) && isKnown(item))
    .sort(
      (a, b) =>
        Date.parse(a.dueAt) - Date.parse(b.dueAt) ||
        b.lapses - a.lapses ||
        a.lessonKey.localeCompare(b.lessonKey) ||
        a.clipId.localeCompare(b.clipId),
    )
    .slice(0, Math.max(0, limit));
}

export type ReviewXpDecision = {
  xp: number;
  kind: "new" | "rejected" | "capped";
};

/** XP for one finished review session. `paidToday` counts earlier paid sessions today. */
export function decideReviewXp(input: {
  clipCount: number;
  elapsedMs: number;
  paidToday: number;
}): ReviewXpDecision {
  if (input.clipCount <= 0) return { xp: 0, kind: "rejected" };
  if (input.elapsedMs < input.clipCount * REVIEW_MIN_MS_PER_CLIP) {
    return { xp: 0, kind: "rejected" };
  }
  if (input.paidToday >= REVIEW_PAID_DECKS_PER_DAY) return { xp: 0, kind: "capped" };
  return {
    xp: Math.min(REVIEW_DECK_MAX_XP, input.clipCount * REVIEW_XP_PER_CLIP),
    kind: "new",
  };
}

export type ReviewSubmit = {
  id: string;
  elapsedMs: number;
  clips: ReviewOutcome[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LESSON_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ELAPSED_MS = 6 * 60 * 60 * 1000;

function isClipId(value: string): boolean {
  return value.length >= 1 && value.length <= 180 && !/[\u0000-\u001f\u007f/\\]/.test(value);
}

/** A finished review session the browser may submit. Null when the body is not one. */
export function parseReviewSubmit(value: unknown): ReviewSubmit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID.test(record.id)) return null;
  const elapsedMs = record.elapsedMs;
  if (
    typeof elapsedMs !== "number" ||
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > MAX_ELAPSED_MS
  ) {
    return null;
  }
  if (
    !Array.isArray(record.clips) ||
    record.clips.length < 1 ||
    record.clips.length > REVIEW_DECK_SIZE
  ) {
    return null;
  }
  const seen = new Set<string>();
  const clips: ReviewOutcome[] = [];
  for (const item of record.clips) {
    if (!item || typeof item !== "object") return null;
    const clip = item as Record<string, unknown>;
    if (typeof clip.lessonKey !== "string" || !LESSON_KEY.test(clip.lessonKey)) return null;
    if (typeof clip.clipId !== "string" || !isClipId(clip.clipId)) return null;
    if (clip.missed !== true && clip.missed !== false) return null;
    const key = reviewKey(clip.lessonKey, clip.clipId);
    if (seen.has(key)) return null;
    seen.add(key);
    clips.push({ lessonKey: clip.lessonKey, clipId: clip.clipId, missed: clip.missed });
  }
  return { id: record.id, elapsedMs, clips };
}
