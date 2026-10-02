/** Shared progress model — localStorage + cloud sync. */

import { maxClipsPerPracticePart, MAX_PRACTICE_CARDS } from "./practice-deck";
import type { OrderSourceClip } from "./sentence-order";

export const STORAGE_KEY = "nanu-horen-progress";
export const LEGACY_PROGRESS_PREFIX = "nanu-progress-";

/** Fallback continue target when no totals / progress are available. */
export const CONTINUE_BERUF_SLUG = "restaurantfachkraft";

const GRANT_EMAIL_MAX = 254;

/** Lowercased email used as the key for a grant made before sign-up. */
export function normalizeGrantEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > GRANT_EMAIL_MAX) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

/**
 * Courses to store when a pre-unlock is claimed at sign-in.
 * A new account, or one returning after deletion, takes the grant as-is.
 * An account that already exists keeps its courses and gains the new ones.
 */
export function levelAccessAfterPreUnlock(
  current: readonly string[],
  pending: readonly string[],
  replace: boolean,
): string[] {
  if (replace) {
    const slugs: string[] = [];
    for (const slug of pending) {
      if (!slugs.includes(slug)) slugs.push(slug);
    }
    return slugs;
  }
  const merged = [...current];
  for (const slug of pending) {
    if (!merged.includes(slug)) merged.push(slug);
  }
  return merged;
}

export type InterviewProgress = {
  /**
   * 0-based catalog position of the next unseen clip.
   * Kept in sync with `completedClipIds.length` so resume UI stays accurate
   * even when the practice queue is reshuffled.
   */
  currentClipIndex: number;
  /** Clip ids already answered correctly — skipped when the student continues. */
  completedClipIds: string[];
  /**
   * ISO timestamp of the first full pass through the catalog. Once set it is
   * never cleared: the chapter stays marked as completed and every later visit
   * is a review session in random order.
   */
  completedAt?: string;
};

export type LearnProgress = InterviewProgress & {
  /** Number of fully completed runs for this Lektion (first pass + replays). */
  runCount: number;
  /**
   * Clip ids completed in the current run.
   * Written only when a whole listening part finishes, so a session that
   * ends mid-part resumes at the start of that part.
   */
  runCompletedClipIds: string[];
  /**
   * Clip ids in the order of the current randomized run.
   * Absent on the ordered first pass, and cleared when a run finishes.
   */
  runClipOrder?: string[];
  /** Clip ids the student has already reviewed in the current study pass. */
  reviewedClipIds: string[];
  /** Number of fully completed study passes (first pass + replays). */
  studyRunCount: number;
  /**
   * ISO timestamp of the first full study pass. Once set it is never cleared,
   * so Study stays completed even after the student starts another pass.
   */
  studyCompletedAt?: string;
};

function emptyLearnProgress(): LearnProgress {
  return {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: 0,
    runCompletedClipIds: [],
    reviewedClipIds: [],
    studyRunCount: 0,
  };
}

export type LessonVideoProgress = {
  /** Seconds to resume from. */
  positionSeconds: number;
  /** ISO timestamp of the last position or watched-state write. Newer wins on merge. */
  updatedAt: string;
  /** Set when the learner marks the video watched. Cleared when they undo it. */
  watchedAt?: string;
};

export type LessonVideoStatus = "not-started" | "in-progress" | "watched";

/**
 * Finished work on one UTC day. The admin dashboard places timestamped events on Vietnam days; this bucket stays the UTC date it was saved under.
 * Clip, exercise, video, and active-time totals are filled from visits and
 * kept when a visit ages out, so the student card and the overview share them.
 */
export type DayActivity = {
  studyRuns: number;
  practiceRuns: number;
  clips?: number;
  exercises?: number;
  videoSeconds?: number;
  activeSeconds?: number;
};

/** One study clip reviewed during a visit. */
export type VisitClip = {
  lessonKey: string;
  clipId: string;
};

/** Playback accumulated while the YouTube player was actually playing. */
export type VisitVideo = {
  key: string;
  title: string;
  seconds: number;
  leftAtSeconds: number;
  watched: boolean;
  durationSeconds?: number;
};

/** Correct dictation answers and finished listening runs, per lesson. */
export type VisitExerciseLesson = {
  lessonKey: string;
  completed: number;
  fullRuns: number;
};

/**
 * One period the app was open and visible. Patched in place by heartbeats.
 * History starts when this ships: nothing here is rebuilt from older snapshots.
 */
export type Visit = {
  id: string;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  lessons: string[];
  clips: VisitClip[];
  exercisesCompleted: number;
  listeningRuns: number;
  videos: VisitVideo[];
  exerciseLessons?: VisitExerciseLesson[];
  wrongAttempts?: number;
};

/**
 * One admin deletion. Stored on the progress document so a device that still
 * has the old snapshot cannot merge it back. A clear is applied while either
 * side has not acknowledged it; later work on that scope is kept.
 */
export type AdminLearnErase = {
  key: string;
  clipIds: string[];
  study: boolean;
  listening: boolean;
};

export type AdminInterviewErase = {
  slug: string;
  /** null removes the whole Ausbildung track. */
  clipIds: string[] | null;
};

export type AdminProgressClear = {
  id: string;
  at: string;
  scope: "all" | "scoped";
  learn?: AdminLearnErase[];
  videoKeys?: string[];
  /** Prefixes end with `/` so `lektion-1` does not match `lektion-10`. */
  videoPrefixes?: string[];
  interview?: AdminInterviewErase[];
  /** Visit keys: `a1-1/lektion-4` or `interview/koch`. */
  visitLessons?: string[];
  visitStudy?: boolean;
  visitListening?: boolean;
  visitVideo?: boolean;
};

export type StoredProgress = {
  interview: Record<string, InterviewProgress>;
  learn: Record<string, LearnProgress>;
  /** Resume point and watched state, keyed by level/chapter/youtube id. */
  videos: Record<string, LessonVideoProgress>;
  /** Consecutive practice days ending on `lastPracticeDate`. */
  streakDays: number;
  /** ISO date (YYYY-MM-DD, local calendar) of the last practice day. */
  lastPracticeDate?: string;
  /** Local calendar days the learner practiced. The streak is derived from this. */
  practiceDates?: string[];
  /** IANA zone used to name those days, so the server uses the same calendar. */
  streakTimeZone?: string;
  /** Per UTC day (`YYYY-MM-DD`). Older days are dropped on save. */
  activity?: Record<string, DayActivity>;
  /** Recent app-open periods. Capped at 60 visits or 90 days. */
  visits?: Visit[];
  /** Admin deletions. The learner app cannot add or remove these. */
  adminClears?: AdminProgressClear[];
  /** Clear ids already applied on this snapshot. */
  adminClearAck?: string[];
};

export type BerufProgressSummary = {
  berufSlug: string;
  href: `/interview/${string}`;
  currentClipIndex: number;
  completedCount: number;
  totalClips: number;
  percent: number;
};

export type ContinueLearning = BerufProgressSummary;

export type ContinueLevelCatalogChapter = {
  slug: string;
  label: string;
  clipCount: number;
  videoIds: string[];
};

export type ContinueLevelCatalogEntry = {
  level: string;
  slug: string;
  chapters: ContinueLevelCatalogChapter[];
};

export type ContinueLevelLearning = {
  levelSlug: string;
  levelLabel: string;
  chapterSlug: string;
  chapterLabel: string;
  href: `/learn/${string}/${string}`;
  currentChapterIndex: number;
  totalChapters: number;
  completedChapters: number;
  percent: number;
};

export const DEFAULT_PROGRESS: StoredProgress = {
  interview: {
    [CONTINUE_BERUF_SLUG]: {
      currentClipIndex: 0,
      completedClipIds: [],
    },
  },
  learn: {},
  videos: {},
  streakDays: 0,
};

export function isInterviewProgress(value: unknown): value is InterviewProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.currentClipIndex === "number" &&
    Array.isArray(record.completedClipIds)
  );
}

function normalizeEntry(entry: InterviewProgress): InterviewProgress {
  const normalized: InterviewProgress = {
    currentClipIndex: Math.max(0, entry.currentClipIndex),
    completedClipIds: entry.completedClipIds.filter(
      (id): id is string => typeof id === "string",
    ),
  };
  if (typeof entry.completedAt === "string") {
    normalized.completedAt = entry.completedAt;
  }
  return normalized;
}

function normalizeLearnEntry(entry: InterviewProgress): LearnProgress {
  const normalized = normalizeEntry(entry);
  const record = entry as InterviewProgress & {
    runCount?: unknown;
    runCompletedClipIds?: unknown;
    runClipOrder?: unknown;
    reviewedClipIds?: unknown;
    studyRunCount?: unknown;
    studyCompletedAt?: unknown;
  };

  const studyCompletedAt =
    typeof record.studyCompletedAt === "string" ? record.studyCompletedAt : undefined;
  const runClipOrder = Array.isArray(record.runClipOrder)
    ? record.runClipOrder.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  return {
    ...normalized,
    runCount:
      typeof record.runCount === "number" && record.runCount >= 0
        ? Math.floor(record.runCount)
        : normalized.completedAt
          ? 1
          : 0,
    runCompletedClipIds: Array.isArray(record.runCompletedClipIds)
      ? record.runCompletedClipIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    ...(runClipOrder.length > 0 ? { runClipOrder } : {}),
    reviewedClipIds: Array.isArray(record.reviewedClipIds)
      ? record.reviewedClipIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    studyRunCount:
      typeof record.studyRunCount === "number" && record.studyRunCount >= 0
        ? Math.floor(record.studyRunCount)
        : studyCompletedAt
          ? 1
          : 0,
    ...(studyCompletedAt ? { studyCompletedAt } : {}),
  };
}

function normalizeTrack(
  parsed: unknown,
  defaults: Record<string, InterviewProgress>,
): Record<string, InterviewProgress> {
  const track: Record<string, InterviewProgress> = structuredClone(defaults);
  if (parsed && typeof parsed === "object") {
    for (const [slug, entry] of Object.entries(parsed)) {
      if (isInterviewProgress(entry)) {
        track[slug] = normalizeEntry(entry);
      }
    }
  }
  return track;
}

function normalizeLearnTrack(
  parsed: unknown,
): Record<string, LearnProgress> {
  const track: Record<string, LearnProgress> = {};
  if (parsed && typeof parsed === "object") {
    for (const [slug, entry] of Object.entries(parsed)) {
      if (isInterviewProgress(entry)) {
        track[slug] = normalizeLearnEntry(entry);
      }
    }
  }
  return track;
}

function normalizeVideoEntry(value: unknown): LessonVideoProgress | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const position = record.positionSeconds;
  const positionSeconds =
    typeof position === "number" && Number.isFinite(position)
      ? Math.min(86_400, Math.max(0, position))
      : 0;
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  const entry: LessonVideoProgress = { positionSeconds, updatedAt };
  if (typeof record.watchedAt === "string" && record.watchedAt.length > 0) {
    entry.watchedAt = record.watchedAt;
  }
  if (!entry.watchedAt && positionSeconds === 0 && updatedAt.length === 0) {
    return null;
  }
  return entry;
}

function normalizeVideos(parsed: unknown): Record<string, LessonVideoProgress> {
  const videos: Record<string, LessonVideoProgress> = {};
  if (!parsed || typeof parsed !== "object") return videos;
  for (const [key, entry] of Object.entries(parsed)) {
    if (!key) continue;
    const normalized = normalizeVideoEntry(entry);
    if (normalized) videos[key] = normalized;
  }
  return videos;
}

export function parseProgress(raw: string | null): StoredProgress {
  if (!raw) return structuredClone(DEFAULT_PROGRESS);
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return normalizeProgress(parsed);
  } catch {
    return structuredClone(DEFAULT_PROGRESS);
  }
}

const CLEAR_KEEP = 40;
const CLEAR_ID = /^[A-Za-z0-9-]{8,80}$/;

function clearText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text;
}

function clearIdList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    const id = clearText(item, 180);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

function normalizeOneClear(value: unknown): AdminProgressClear | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = clearText(record.id, 80);
  const at = clearText(record.at, 40);
  if (!CLEAR_ID.test(id) || Number.isNaN(Date.parse(at))) return null;
  if (record.scope === "all") return { id, at, scope: "all" };
  if (record.scope !== "scoped") return null;

  const learn: AdminLearnErase[] = [];
  if (Array.isArray(record.learn)) {
    for (const item of record.learn) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const key = clearText(entry.key, 120);
      if (!key) continue;
      learn.push({
        key,
        clipIds: clearIdList(entry.clipIds, 400),
        study: entry.study === true,
        listening: entry.listening === true,
      });
      if (learn.length >= 80) break;
    }
  }

  const interview: AdminInterviewErase[] = [];
  if (Array.isArray(record.interview)) {
    for (const item of record.interview) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const slug = clearText(entry.slug, 80);
      if (!slug) continue;
      interview.push({
        slug,
        clipIds: entry.clipIds === null ? null : clearIdList(entry.clipIds, 400),
      });
      if (interview.length >= 20) break;
    }
  }

  const videoKeys = clearIdList(record.videoKeys, 80);
  const videoPrefixes = clearIdList(record.videoPrefixes, 40).filter((prefix) => prefix.endsWith("/"));
  const visitLessons = clearIdList(record.visitLessons, 80);
  const clear: AdminProgressClear = {
    id,
    at,
    scope: "scoped",
    ...(learn.length ? { learn } : {}),
    ...(videoKeys.length ? { videoKeys } : {}),
    ...(videoPrefixes.length ? { videoPrefixes } : {}),
    ...(interview.length ? { interview } : {}),
    ...(visitLessons.length ? { visitLessons } : {}),
    ...(record.visitStudy === true ? { visitStudy: true } : {}),
    ...(record.visitListening === true ? { visitListening: true } : {}),
    ...(record.visitVideo === true ? { visitVideo: true } : {}),
  };
  if (
    !clear.learn &&
    !clear.videoKeys &&
    !clear.videoPrefixes &&
    !clear.interview &&
    !clear.visitLessons
  ) {
    return null;
  }
  return clear;
}

function normalizeAdminClears(value: unknown): AdminProgressClear[] {
  if (!Array.isArray(value)) return [];
  const clears: AdminProgressClear[] = [];
  for (const item of value) {
    const clear = normalizeOneClear(item);
    if (!clear || clears.some((entry) => entry.id === clear.id)) continue;
    clears.push(clear);
  }
  return clears.slice(-CLEAR_KEEP);
}

function normalizeAdminClearAck(value: unknown, clears: readonly AdminProgressClear[]): string[] {
  if (!Array.isArray(value) || clears.length === 0) return [];
  const ids = new Set(clears.map((clear) => clear.id));
  const ack: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !ids.has(item) || ack.includes(item)) continue;
    ack.push(item);
  }
  return ack;
}

export function normalizeProgress(
  parsed: Partial<StoredProgress> | null | undefined,
): StoredProgress {
  const interview = normalizeTrack(parsed?.interview, DEFAULT_PROGRESS.interview);
  const learn = normalizeLearnTrack(parsed?.learn);
  const videos = normalizeVideos(parsed?.videos);
  const activity = normalizeActivity(parsed?.activity);
  const visits = normalizeVisits(parsed?.visits);
  const adminClears = normalizeAdminClears(parsed?.adminClears);
  const adminClearAck = normalizeAdminClearAck(parsed?.adminClearAck, adminClears);

  return applyVisitRetention(
    {
      interview,
      learn,
      videos,
      streakDays:
        typeof parsed?.streakDays === "number" && parsed.streakDays >= 0
          ? parsed.streakDays
          : DEFAULT_PROGRESS.streakDays,
      lastPracticeDate:
        typeof parsed?.lastPracticeDate === "string"
          ? parsed.lastPracticeDate
          : undefined,
      ...(practiceDatesFrom(parsed?.practiceDates).length
        ? { practiceDates: practiceDatesFrom(parsed?.practiceDates) }
        : {}),
      ...(validTimeZone(parsed?.streakTimeZone)
        ? { streakTimeZone: validTimeZone(parsed?.streakTimeZone) }
        : {}),
      ...(activity ? { activity } : {}),
      ...(visits.length > 0 ? { visits } : {}),
      ...(adminClears.length ? { adminClears } : {}),
      ...(adminClearAck.length ? { adminClearAck } : {}),
    },
    new Date(),
  );
}

function mergeEntry(
  left: InterviewProgress | undefined,
  right: InterviewProgress | undefined,
): InterviewProgress {
  const completedClipIds = Array.from(
    new Set([
      ...(left?.completedClipIds ?? []),
      ...(right?.completedClipIds ?? []),
    ]),
  );
  const merged: InterviewProgress = {
    currentClipIndex: Math.max(
      left?.currentClipIndex ?? 0,
      right?.currentClipIndex ?? 0,
      completedClipIds.length,
    ),
    completedClipIds,
  };

  // Completion is permanent, so the earliest timestamp from either side wins.
  const timestamps = [left?.completedAt, right?.completedAt].filter(
    (value): value is string => typeof value === "string",
  );
  if (timestamps.length > 0) {
    merged.completedAt = timestamps.sort()[0];
  }

  return merged;
}

function mergeTrack(
  a: Record<string, InterviewProgress> | undefined,
  b: Record<string, InterviewProgress> | undefined,
): Record<string, InterviewProgress> {
  const slugs = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const track: Record<string, InterviewProgress> = {};
  for (const slug of slugs) {
    track[slug] = mergeEntry(a?.[slug], b?.[slug]);
  }
  return track;
}

function unionIds(left: readonly string[], right: readonly string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}

type RunCursor = { order: string[]; done: string[] };

/** Completed ids count only inside the stored shuffle. Ids with no order are not a cursor. */
function runCursor(entry: LearnProgress | undefined): RunCursor {
  const order = entry?.runClipOrder ?? [];
  if (order.length === 0) return { order: [], done: [] };
  const done = new Set(entry?.runCompletedClipIds ?? []);
  return { order: [...order], done: order.filter((id) => done.has(id)) };
}

function sameRunOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * One shuffle plus the parts finished inside it.
 * A higher run count owns the cursor. Equal counts keep an in-progress
 * shuffle, and do not fold another snapshot's finished-pass ids into it.
 */
function mergeRunCursors(
  left: LearnProgress | undefined,
  right: LearnProgress | undefined,
  leftCount: number,
  rightCount: number,
): RunCursor {
  if (leftCount !== rightCount) {
    const ahead = leftCount > rightCount ? left : right;
    const cursor = runCursor(ahead);
    if (cursor.order.length === 0) return { order: [], done: [] };
    return cursor;
  }

  const a = runCursor(left);
  const b = runCursor(right);
  if (a.order.length === 0) return b;
  if (b.order.length === 0) return a;
  if (sameRunOrder(a.order, b.order)) {
    const done = new Set([...a.done, ...b.done]);
    return { order: a.order, done: a.order.filter((id) => done.has(id)) };
  }

  const aComplete = a.done.length === a.order.length;
  const bComplete = b.done.length === b.order.length;
  if (aComplete !== bComplete) return aComplete ? b : a;
  return a.done.length >= b.done.length ? a : b;
}

function mergeLearnEntry(
  left: LearnProgress | undefined,
  right: LearnProgress | undefined,
): LearnProgress {
  const mergedBase = mergeEntry(left, right);
  const reviewedClipIds = unionIds(
    left?.reviewedClipIds ?? [],
    right?.reviewedClipIds ?? [],
  );
  const studyStamps = [left?.studyCompletedAt, right?.studyCompletedAt].filter(
    (value): value is string => typeof value === "string",
  );
  const leftCount = left?.runCount ?? 0;
  const rightCount = right?.runCount ?? 0;
  const runCount = Math.max(leftCount, rightCount);
  const cursor = mergeRunCursors(left, right, leftCount, rightCount);
  const runCompletedClipIds = cursor.done;
  const runClipOrder = cursor.order.length > 0 ? cursor.order : undefined;

  return {
    ...mergedBase,
    currentClipIndex: runCompletedClipIds.length,
    runCount,
    runCompletedClipIds,
    reviewedClipIds,
    studyRunCount: Math.max(left?.studyRunCount ?? 0, right?.studyRunCount ?? 0),
    ...(studyStamps.length > 0
      ? { studyCompletedAt: studyStamps.sort()[0] }
      : {}),
    ...(runClipOrder && runClipOrder.length > 0 ? { runClipOrder } : {}),
  };
}

function mergeLearnTrack(
  a: Record<string, LearnProgress> | undefined,
  b: Record<string, LearnProgress> | undefined,
): Record<string, LearnProgress> {
  const slugs = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const track: Record<string, LearnProgress> = {};
  for (const slug of slugs) {
    track[slug] = mergeLearnEntry(a?.[slug], b?.[slug]);
  }
  return track;
}

function mergeVideoEntry(
  left: LessonVideoProgress | undefined,
  right: LessonVideoProgress | undefined,
): LessonVideoProgress | undefined {
  if (!left) return right;
  if (!right) return left;
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt > right.updatedAt ? left : right;
  }

  const watchedAt = [left.watchedAt, right.watchedAt]
    .filter((value): value is string => typeof value === "string")
    .sort()[0];
  return {
    positionSeconds: Math.max(left.positionSeconds, right.positionSeconds),
    updatedAt: left.updatedAt,
    ...(watchedAt ? { watchedAt } : {}),
  };
}

function mergeVideos(
  a: Record<string, LessonVideoProgress> | undefined,
  b: Record<string, LessonVideoProgress> | undefined,
): Record<string, LessonVideoProgress> {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const videos: Record<string, LessonVideoProgress> = {};
  for (const key of keys) {
    const merged = mergeVideoEntry(a?.[key], b?.[key]);
    if (merged) videos[key] = merged;
  }
  return videos;
}

/** Merge two progress snapshots — union of completions, keep farthest index. */
export function mergeProgress(
  a: StoredProgress,
  b: StoredProgress,
): StoredProgress {
  const interview = mergeTrack(a.interview, b.interview);
  const learn = mergeLearnTrack(a.learn, b.learn);
  const videos = mergeVideos(a.videos, b.videos);

  const practiceDates = [
    ...new Set([...collectPracticeDates(a), ...collectPracticeDates(b)]),
  ].sort();
  const lastPracticeDate = practiceDates.at(-1);
  const streakTimeZone = mergedStreakTimeZone(a, b);

  const activity = mergeActivity(a.activity, b.activity);
  const visits = mergeVisits(a.visits, b.visits);

  const merged = applyVisitRetention(
    {
      interview,
      learn,
      videos,
      streakDays: lastPracticeDate
        ? streakEndingOn(new Set(practiceDates), lastPracticeDate)
        : 0,
      ...(lastPracticeDate ? { lastPracticeDate } : {}),
      ...(practiceDates.length ? { practiceDates } : {}),
      ...(streakTimeZone ? { streakTimeZone } : {}),
      ...(activity ? { activity } : {}),
      ...(visits.length > 0 ? { visits } : {}),
    },
    new Date(),
  );

  const clears = unionAdminClears(a.adminClears, b.adminClears);
  if (clears.length === 0) return merged;

  const ackA = new Set(a.adminClearAck ?? []);
  const ackB = new Set(b.adminClearAck ?? []);
  const pending = clears.filter((clear) => !ackA.has(clear.id) || !ackB.has(clear.id));
  const ordered = [
    ...pending.filter((clear) => clear.scope === "all"),
    ...pending.filter((clear) => clear.scope !== "all"),
  ];
  let next = merged;
  for (const clear of ordered) next = applyAdminProgressClear(next, clear);
  return normalizeProgress({
    ...next,
    adminClears: clears,
    adminClearAck: clears.map((clear) => clear.id),
  });
}

function unionAdminClears(
  left: readonly AdminProgressClear[] | undefined,
  right: readonly AdminProgressClear[] | undefined,
): AdminProgressClear[] {
  const clears: AdminProgressClear[] = [];
  for (const clear of [...(left ?? []), ...(right ?? [])]) {
    if (clears.some((entry) => entry.id === clear.id)) continue;
    clears.push(clear);
  }
  return clears.slice(-CLEAR_KEEP);
}

function withoutIds(ids: readonly string[], drop: ReadonlySet<string>): string[] {
  return ids.filter((id) => !drop.has(id));
}

function learnSliceIsEmpty(entry: LearnProgress): boolean {
  return (
    entry.completedClipIds.length === 0 &&
    entry.runCompletedClipIds.length === 0 &&
    (entry.runClipOrder?.length ?? 0) === 0 &&
    entry.reviewedClipIds.length === 0 &&
    entry.runCount === 0 &&
    entry.studyRunCount === 0 &&
    !entry.completedAt &&
    !entry.studyCompletedAt
  );
}

function eraseLearnSlice(progress: StoredProgress, slice: AdminLearnErase): StoredProgress {
  const current = progress.learn[slice.key];
  if (!current || (!slice.study && !slice.listening) || slice.clipIds.length === 0) return progress;
  const drop = new Set(slice.clipIds);
  const nextEntry: LearnProgress = { ...current };
  if (slice.listening) {
    nextEntry.completedClipIds = withoutIds(current.completedClipIds, drop);
    nextEntry.runCompletedClipIds = withoutIds(current.runCompletedClipIds, drop);
    const order = current.runClipOrder ? withoutIds(current.runClipOrder, drop) : [];
    if (order.length > 0) nextEntry.runClipOrder = order;
    else delete nextEntry.runClipOrder;
    delete nextEntry.completedAt;
    nextEntry.runCount = 0;
    nextEntry.currentClipIndex = nextEntry.runCompletedClipIds.length;
  }
  if (slice.study) {
    nextEntry.reviewedClipIds = withoutIds(current.reviewedClipIds, drop);
    delete nextEntry.studyCompletedAt;
    nextEntry.studyRunCount = 0;
  }
  const learn = { ...progress.learn };
  if (learnSliceIsEmpty(nextEntry)) delete learn[slice.key];
  else learn[slice.key] = nextEntry;
  return { ...progress, learn };
}

function eraseInterviewSlice(
  progress: StoredProgress,
  slice: AdminInterviewErase,
): StoredProgress {
  const interview = { ...progress.interview };
  if (slice.clipIds === null) {
    delete interview[slice.slug];
    return { ...progress, interview };
  }
  const current = interview[slice.slug];
  if (!current || slice.clipIds.length === 0) return progress;
  const drop = new Set(slice.clipIds);
  const completedClipIds = withoutIds(current.completedClipIds, drop);
  if (completedClipIds.length === 0) {
    delete interview[slice.slug];
    return { ...progress, interview };
  }
  interview[slice.slug] = {
    currentClipIndex: completedClipIds.length,
    completedClipIds,
  };
  return { ...progress, interview };
}

function videoMatchesClear(key: string, clear: AdminProgressClear): boolean {
  if (clear.videoKeys?.includes(key)) return true;
  return clear.videoPrefixes?.some((prefix) => key.startsWith(prefix)) ?? false;
}

function eraseVideos(progress: StoredProgress, clear: AdminProgressClear): StoredProgress {
  if (!clear.videoKeys?.length && !clear.videoPrefixes?.length) return progress;
  const videos: Record<string, LessonVideoProgress> = {};
  for (const [key, entry] of Object.entries(progress.videos)) {
    if (!videoMatchesClear(key, clear)) videos[key] = entry;
  }
  return { ...progress, videos };
}

function uniqueVisitKeys(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function stripVisit(visit: Visit, clear: AdminProgressClear): Visit {
  const lessons = new Set(clear.visitLessons ?? []);
  const clips =
    clear.visitStudy && lessons.size > 0
      ? visit.clips.filter((clip) => !lessons.has(clip.lessonKey))
      : visit.clips;
  const videos = clear.visitVideo
    ? visit.videos.filter((video) => !videoMatchesClear(video.key, clear))
    : visit.videos;
  const exerciseLessons =
    clear.visitListening && lessons.size > 0
      ? (visit.exerciseLessons ?? []).filter((lesson) => !lessons.has(lesson.lessonKey))
      : (visit.exerciseLessons ?? []);
  const next: Visit = {
    ...visit,
    clips,
    videos,
    lessons: uniqueVisitKeys([
      ...clips.map((clip) => clip.lessonKey),
      ...exerciseLessons.map((lesson) => lesson.lessonKey),
      ...videos
        .map((video) => lessonKeyFromVideo(video.key))
        .filter((key): key is string => Boolean(key)),
    ]),
    exercisesCompleted: exerciseLessons.reduce((sum, lesson) => sum + lesson.completed, 0),
    listeningRuns: exerciseLessons.reduce((sum, lesson) => sum + lesson.fullRuns, 0),
  };
  if (exerciseLessons.length > 0) next.exerciseLessons = exerciseLessons;
  else delete next.exerciseLessons;
  return next;
}

function eraseVisits(progress: StoredProgress, clear: AdminProgressClear): StoredProgress {
  if (!progress.visits?.length) return progress;
  if (!clear.visitStudy && !clear.visitListening && !clear.visitVideo) return progress;
  return {
    ...progress,
    visits: progress.visits.map((visit) => stripVisit(visit, clear)),
  };
}

function applyAdminProgressClear(
  progress: StoredProgress,
  clear: AdminProgressClear,
): StoredProgress {
  if (clear.scope === "all") return structuredClone(DEFAULT_PROGRESS);
  let next = progress;
  for (const slice of clear.learn ?? []) next = eraseLearnSlice(next, slice);
  for (const slice of clear.interview ?? []) next = eraseInterviewSlice(next, slice);
  next = eraseVideos(next, clear);
  next = eraseVisits(next, clear);
  return next;
}

/** Apply one admin deletion and remember it so a later sync cannot restore it. */
export function commitAdminProgressClear(
  progress: StoredProgress,
  clear: AdminProgressClear,
): StoredProgress {
  const normalized = normalizeOneClear(clear);
  if (!normalized) return progress;
  const clears = unionAdminClears(
    (progress.adminClears ?? []).filter((entry) => entry.id !== normalized.id),
    [normalized],
  );
  const applied = applyAdminProgressClear(progress, normalized);
  const adminClearAck = (progress.adminClearAck ?? []).filter(
    (id) => id !== normalized.id && clears.some((entry) => entry.id === id),
  );
  return normalizeProgress({
    ...applied,
    adminClears: clears,
    ...(adminClearAck.length > 0 ? { adminClearAck } : {}),
  });
}

/**
 * Learner uploads keep whatever deletions the server already stored.
 * A device cannot invent a clear, and it cannot drop one.
 */
export function progressKeepingServerClears(
  incoming: StoredProgress,
  existing: StoredProgress,
): StoredProgress {
  if (!existing.adminClears?.length) {
    if (!incoming.adminClears?.length && !incoming.adminClearAck?.length) return incoming;
    const next: StoredProgress = { ...incoming };
    delete next.adminClears;
    delete next.adminClearAck;
    return next;
  }
  return { ...incoming, adminClears: existing.adminClears };
}

export function lessonVideoProgressKey(
  levelSlug: string,
  chapterSlug: string,
  videoId: string,
): string {
  return `${levelSlug}/${chapterSlug}/${videoId}`;
}

export function lessonVideoStatus(
  entry: LessonVideoProgress | undefined,
): LessonVideoStatus {
  if (entry?.watchedAt) return "watched";
  if ((entry?.positionSeconds ?? 0) >= 1) return "in-progress";
  return "not-started";
}

export function saveLessonVideoPosition(
  progress: StoredProgress,
  key: string,
  positionSeconds: number,
  options?: { now?: string; force?: boolean },
): StoredProgress {
  if (!key) return progress;
  const now = options?.now ?? new Date().toISOString();
  const seconds = Math.min(86_400, Math.max(0, positionSeconds));
  const current = progress.videos[key];
  if (
    !options?.force &&
    current &&
    Math.abs(current.positionSeconds - seconds) < 0.8
  ) {
    return progress;
  }

  return {
    ...progress,
    videos: {
      ...progress.videos,
      [key]: {
        positionSeconds: seconds,
        updatedAt: now,
        ...(current?.watchedAt ? { watchedAt: current.watchedAt } : {}),
      },
    },
  };
}

export function setLessonVideoWatched(
  progress: StoredProgress,
  key: string,
  watched: boolean,
  now = new Date().toISOString(),
): StoredProgress {
  if (!key) return progress;
  const current = progress.videos[key];
  const nextEntry: LessonVideoProgress = {
    positionSeconds: watched ? 0 : (current?.positionSeconds ?? 0),
    updatedAt: now,
  };
  if (watched) nextEntry.watchedAt = now;

  return {
    ...progress,
    videos: {
      ...progress.videos,
      [key]: nextEntry,
    },
  };
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** IANA zone, or undefined when `value` is missing or not a real timezone. */
export function validTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) return undefined;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

function deviceTimeZone(): string | undefined {
  try {
    return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return undefined;
  }
}

/**
 * Calendar day (`YYYY-MM-DD`) in `timeZone`, or on this device when omitted.
 * The streak uses this so the day changes at local midnight.
 */
export function localCalendarDay(now = new Date(), timeZone?: string): string {
  const zone = validTimeZone(timeZone);
  if (!zone) return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return formatYmd(year, month, day);
}

function mergedStreakTimeZone(a: StoredProgress, b: StoredProgress): string | undefined {
  const zoneA = validTimeZone(a.streakTimeZone);
  const zoneB = validTimeZone(b.streakTimeZone);
  if (zoneA && zoneB) {
    return (b.lastPracticeDate ?? "") >= (a.lastPracticeDate ?? "") ? zoneB : zoneA;
  }
  return zoneB ?? zoneA;
}

function isoDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

/** Date-only values stay as written. Timestamps use `timeZone`, or UTC when unset. */
function practiceDayKey(value: string | undefined, timeZone: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  if (!timeZone || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return localCalendarDay(date, timeZone);
}

const ACTIVITY_KEEP_DAYS = 120;

function countField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(1_000_000, Math.floor(value))
    : 0;
}

function activityCutoff(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - ACTIVITY_KEEP_DAYS);
  return todayIsoDate(cutoff);
}

type DayCounts = {
  studyRuns: number;
  practiceRuns: number;
  clips: number;
  exercises: number;
  videoSeconds: number;
  activeSeconds: number;
};

function readDay(entry: DayActivity | undefined): DayCounts {
  return {
    studyRuns: entry?.studyRuns ?? 0,
    practiceRuns: entry?.practiceRuns ?? 0,
    clips: entry?.clips ?? 0,
    exercises: entry?.exercises ?? 0,
    videoSeconds: entry?.videoSeconds ?? 0,
    activeSeconds: entry?.activeSeconds ?? 0,
  };
}

function packDay(counts: DayCounts): DayActivity | null {
  if (
    counts.studyRuns === 0 &&
    counts.practiceRuns === 0 &&
    counts.clips === 0 &&
    counts.exercises === 0 &&
    counts.videoSeconds === 0 &&
    counts.activeSeconds === 0
  ) {
    return null;
  }
  const day: DayActivity = {
    studyRuns: counts.studyRuns,
    practiceRuns: counts.practiceRuns,
  };
  if (counts.clips > 0) day.clips = counts.clips;
  if (counts.exercises > 0) day.exercises = counts.exercises;
  if (counts.videoSeconds > 0) day.videoSeconds = counts.videoSeconds;
  if (counts.activeSeconds > 0) day.activeSeconds = counts.activeSeconds;
  return day;
}

function normalizeActivity(
  value: unknown,
  now = new Date(),
): Record<string, DayActivity> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const cutoff = activityCutoff(now);
  const activity: Record<string, DayActivity> = {};
  for (const [day, entry] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < cutoff) continue;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const packed = packDay({
      studyRuns: countField(record.studyRuns),
      practiceRuns: countField(record.practiceRuns),
      clips: countField(record.clips),
      exercises: countField(record.exercises),
      videoSeconds: countField(record.videoSeconds),
      activeSeconds: countField(record.activeSeconds),
    });
    if (packed) activity[day] = packed;
  }
  return Object.keys(activity).length > 0 ? activity : undefined;
}

function mergeActivity(
  left: Record<string, DayActivity> | undefined,
  right: Record<string, DayActivity> | undefined,
): Record<string, DayActivity> | undefined {
  const days = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  const merged: Record<string, DayActivity> = {};
  for (const day of days) {
    const a = readDay(left?.[day]);
    const b = readDay(right?.[day]);
    const packed = packDay({
      studyRuns: Math.max(a.studyRuns, b.studyRuns),
      practiceRuns: Math.max(a.practiceRuns, b.practiceRuns),
      clips: Math.max(a.clips, b.clips),
      exercises: Math.max(a.exercises, b.exercises),
      videoSeconds: Math.max(a.videoSeconds, b.videoSeconds),
      activeSeconds: Math.max(a.activeSeconds, b.activeSeconds),
    });
    if (packed) merged[day] = packed;
  }
  return normalizeActivity(merged);
}

function dateFromStamp(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function recordDayRun(
  progress: StoredProgress,
  field: "studyRuns" | "practiceRuns",
  now: Date,
): StoredProgress {
  const day = todayIsoDate(now);
  const current = readDay(progress.activity?.[day]);
  current[field] += 1;
  const packed = packDay(current);
  return {
    ...progress,
    activity: {
      ...progress.activity,
      ...(packed ? { [day]: packed } : {}),
    },
  };
}

/** A return after this gap starts a new visit. Hidden time is not included. */
export const VISIT_IDLE_MS = 15 * 60 * 1000;
export const VISIT_KEEP_COUNT = 60;
export const VISIT_KEEP_DAYS = 90;
/** A currentTime jump larger than this is a seek, not watch time. */
export const VIDEO_PLAYED_JUMP_SECONDS = 2;

const VISIT_LIST_CAP = {
  lessons: 24,
  clips: 240,
  videos: 40,
  exerciseLessons: 24,
};

export type VisitRange = "today" | "7d" | "all";

export type VisitSummary = {
  activeSeconds: number;
  visitCount: number;
  clipCount: number;
  exercisesCompleted: number;
  listeningRuns: number;
  videoSeconds: number;
  videosWatched: number;
};

function textId(value: unknown, max = 160): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function uniqueTexts(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function lessonKeyFromVideo(key: string): string | null {
  const parts = key.split("/");
  if (parts.length < 3 || !parts[0] || !parts[1]) return null;
  return `${parts[0]}/${parts[1]}`;
}

function roundSeconds(value: number): number {
  return Math.round(value);
}

function normalizeVisitClip(value: unknown): VisitClip | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lessonKey = textId(record.lessonKey);
  const clipId = textId(record.clipId);
  if (!lessonKey || !clipId) return null;
  return { lessonKey, clipId };
}

function normalizeVisitVideo(value: unknown): VisitVideo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const key = textId(record.key);
  if (!key) return null;
  const seconds = positiveSeconds(record.seconds, 1_000_000);
  const leftAtSeconds = positiveSeconds(record.leftAtSeconds);
  const durationSeconds = positiveSeconds(record.durationSeconds);
  const video: VisitVideo = {
    key,
    title: textId(record.title, 200) || key,
    seconds,
    leftAtSeconds,
    watched: record.watched === true,
  };
  if (durationSeconds > 0) video.durationSeconds = durationSeconds;
  if (!video.watched && video.seconds === 0 && video.leftAtSeconds === 0) return null;
  return video;
}

function positiveSeconds(value: unknown, max = 86_400): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, value);
}

function normalizeExerciseLesson(value: unknown): VisitExerciseLesson | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lessonKey = textId(record.lessonKey);
  if (!lessonKey) return null;
  const completed = countField(record.completed);
  const fullRuns = countField(record.fullRuns);
  if (completed === 0 && fullRuns === 0) return null;
  return { lessonKey, completed, fullRuns };
}

function stampIso(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return fallback;
  return new Date(time).toISOString();
}

function withVisitTotals(visit: Visit): Visit {
  const exerciseLessons = visit.exerciseLessons ?? [];
  const fromLessons = exerciseLessons.reduce((sum, lesson) => sum + lesson.completed, 0);
  const fromRuns = exerciseLessons.reduce((sum, lesson) => sum + lesson.fullRuns, 0);
  const lessonKeys = uniqueTexts(
    [
      ...visit.lessons,
      ...visit.clips.map((clip) => clip.lessonKey),
      ...exerciseLessons.map((lesson) => lesson.lessonKey),
      ...visit.videos
        .map((video) => lessonKeyFromVideo(video.key))
        .filter((key): key is string => Boolean(key)),
    ],
    VISIT_LIST_CAP.lessons,
  );
  const next: Visit = {
    ...visit,
    lessons: lessonKeys,
    exercisesCompleted: Math.max(visit.exercisesCompleted, fromLessons),
    listeningRuns: Math.max(visit.listeningRuns, fromRuns),
  };
  if (exerciseLessons.length > 0) next.exerciseLessons = exerciseLessons;
  else delete next.exerciseLessons;
  if (!next.wrongAttempts) delete next.wrongAttempts;
  return next;
}

function normalizeVisit(value: unknown): Visit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = textId(record.id, 80);
  if (!id) return null;
  const startedAt = stampIso(record.startedAt, "");
  if (!startedAt) return null;
  const endedAt = stampIso(record.endedAt, startedAt);
  const clips: VisitClip[] = [];
  const seenClips = new Set<string>();
  if (Array.isArray(record.clips)) {
    for (const entry of record.clips) {
      const clip = normalizeVisitClip(entry);
      if (!clip) continue;
      const key = `${clip.lessonKey}/${clip.clipId}`;
      if (seenClips.has(key)) continue;
      seenClips.add(key);
      clips.push(clip);
      if (clips.length >= VISIT_LIST_CAP.clips) break;
    }
  }
  const videos: VisitVideo[] = [];
  const seenVideos = new Set<string>();
  if (Array.isArray(record.videos)) {
    for (const entry of record.videos) {
      const video = normalizeVisitVideo(entry);
      if (!video || seenVideos.has(video.key)) continue;
      seenVideos.add(video.key);
      videos.push(video);
      if (videos.length >= VISIT_LIST_CAP.videos) break;
    }
  }
  const exerciseLessons: VisitExerciseLesson[] = [];
  const seenLessons = new Set<string>();
  if (Array.isArray(record.exerciseLessons)) {
    for (const entry of record.exerciseLessons) {
      const lesson = normalizeExerciseLesson(entry);
      if (!lesson || seenLessons.has(lesson.lessonKey)) continue;
      seenLessons.add(lesson.lessonKey);
      exerciseLessons.push(lesson);
      if (exerciseLessons.length >= VISIT_LIST_CAP.exerciseLessons) break;
    }
  }
  const wrongAttempts = countField(record.wrongAttempts);
  return withVisitTotals({
    id,
    startedAt,
    endedAt: endedAt < startedAt ? startedAt : endedAt,
    activeSeconds: roundSeconds(positiveSeconds(record.activeSeconds, 1_000_000)),
    lessons: Array.isArray(record.lessons)
      ? uniqueTexts(
          record.lessons.filter((item): item is string => typeof item === "string"),
          VISIT_LIST_CAP.lessons,
        )
      : [],
    clips,
    exercisesCompleted: countField(record.exercisesCompleted),
    listeningRuns: countField(record.listeningRuns),
    videos,
    ...(exerciseLessons.length > 0 ? { exerciseLessons } : {}),
    ...(wrongAttempts > 0 ? { wrongAttempts } : {}),
  });
}

function normalizeVisits(value: unknown): Visit[] {
  if (!Array.isArray(value)) return [];
  const visits: Visit[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const visit = normalizeVisit(entry);
    if (!visit || seen.has(visit.id)) continue;
    seen.add(visit.id);
    visits.push(visit);
  }
  return visits;
}

function mergeExerciseLessons(
  left: readonly VisitExerciseLesson[] | undefined,
  right: readonly VisitExerciseLesson[] | undefined,
): VisitExerciseLesson[] {
  const byKey = new Map<string, VisitExerciseLesson>();
  for (const lesson of [...(left ?? []), ...(right ?? [])]) {
    const existing = byKey.get(lesson.lessonKey);
    if (!existing) {
      byKey.set(lesson.lessonKey, { ...lesson });
      continue;
    }
    existing.completed = Math.max(existing.completed, lesson.completed);
    existing.fullRuns = Math.max(existing.fullRuns, lesson.fullRuns);
  }
  return [...byKey.values()].slice(0, VISIT_LIST_CAP.exerciseLessons);
}

function mergeVisitVideos(
  left: readonly VisitVideo[],
  right: readonly VisitVideo[],
  newerIsLeft: boolean,
): VisitVideo[] {
  const byKey = new Map<string, VisitVideo>();
  const primary = newerIsLeft ? left : right;
  const secondary = newerIsLeft ? right : left;
  for (const video of secondary) byKey.set(video.key, { ...video });
  for (const video of primary) {
    const other = byKey.get(video.key);
    if (!other) {
      byKey.set(video.key, { ...video });
      continue;
    }
    const duration = Math.max(video.durationSeconds ?? 0, other.durationSeconds ?? 0);
    const merged: VisitVideo = {
      key: video.key,
      title: video.title || other.title,
      seconds: Math.max(video.seconds, other.seconds),
      leftAtSeconds: video.leftAtSeconds,
      watched: video.watched || other.watched,
    };
    if (duration > 0) merged.durationSeconds = duration;
    byKey.set(video.key, merged);
  }
  return [...byKey.values()].slice(0, VISIT_LIST_CAP.videos);
}

function mergeVisit(left: Visit, right: Visit): Visit {
  const newerIsLeft = left.endedAt >= right.endedAt;
  const clips: VisitClip[] = [];
  const seen = new Set<string>();
  for (const clip of [...left.clips, ...right.clips]) {
    const key = `${clip.lessonKey}/${clip.clipId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clips.push(clip);
    if (clips.length >= VISIT_LIST_CAP.clips) break;
  }
  const wrongAttempts = Math.max(left.wrongAttempts ?? 0, right.wrongAttempts ?? 0);
  return withVisitTotals({
    id: left.id,
    startedAt: left.startedAt <= right.startedAt ? left.startedAt : right.startedAt,
    endedAt: newerIsLeft ? left.endedAt : right.endedAt,
    activeSeconds: Math.max(left.activeSeconds, right.activeSeconds),
    lessons: uniqueTexts([...left.lessons, ...right.lessons], VISIT_LIST_CAP.lessons),
    clips,
    exercisesCompleted: Math.max(left.exercisesCompleted, right.exercisesCompleted),
    listeningRuns: Math.max(left.listeningRuns, right.listeningRuns),
    videos: mergeVisitVideos(left.videos, right.videos, newerIsLeft),
    exerciseLessons: mergeExerciseLessons(left.exerciseLessons, right.exerciseLessons),
    ...(wrongAttempts > 0 ? { wrongAttempts } : {}),
  });
}

function mergeVisits(left: readonly Visit[] | undefined, right: readonly Visit[] | undefined): Visit[] {
  const byId = new Map<string, Visit>();
  for (const visit of left ?? []) byId.set(visit.id, visit);
  for (const visit of right ?? []) {
    const existing = byId.get(visit.id);
    byId.set(visit.id, existing ? mergeVisit(existing, visit) : visit);
  }
  return [...byId.values()];
}

function visitDay(visit: Visit): string | null {
  return isoDay(visit.startedAt);
}

function raiseActivityFromVisits(
  activity: Record<string, DayActivity> | undefined,
  visits: readonly Visit[],
  now: Date,
): Record<string, DayActivity> | undefined {
  const buckets = new Map<
    string,
    { clips: Set<string>; exercises: number; videoSeconds: number; activeSeconds: number }
  >();
  for (const visit of visits) {
    const day = visitDay(visit);
    if (!day) continue;
    const bucket = buckets.get(day) ?? {
      clips: new Set<string>(),
      exercises: 0,
      videoSeconds: 0,
      activeSeconds: 0,
    };
    for (const clip of visit.clips) bucket.clips.add(`${clip.lessonKey}/${clip.clipId}`);
    bucket.exercises += visit.exercisesCompleted;
    bucket.videoSeconds += visit.videos.reduce((sum, video) => sum + video.seconds, 0);
    bucket.activeSeconds += visit.activeSeconds;
    buckets.set(day, bucket);
  }

  const next: Record<string, DayActivity> = { ...(activity ?? {}) };
  for (const [day, bucket] of buckets) {
    const current = readDay(next[day]);
    const packed = packDay({
      studyRuns: current.studyRuns,
      practiceRuns: current.practiceRuns,
      clips: Math.max(current.clips, bucket.clips.size),
      exercises: Math.max(current.exercises, bucket.exercises),
      videoSeconds: Math.max(current.videoSeconds, roundSeconds(bucket.videoSeconds)),
      activeSeconds: Math.max(current.activeSeconds, roundSeconds(bucket.activeSeconds)),
    });
    if (packed) next[day] = packed;
  }
  return normalizeActivity(next, now);
}

function retainVisits(visits: readonly Visit[], now: Date): Visit[] {
  const cutoff = now.getTime() - VISIT_KEEP_DAYS * 86_400_000;
  const fresh = visits.filter((visit) => {
    const started = Date.parse(visit.startedAt);
    return !Number.isNaN(started) && started >= cutoff;
  });
  fresh.sort((left, right) => (left.startedAt < right.startedAt ? 1 : left.startedAt > right.startedAt ? -1 : 0));
  return fresh.slice(0, VISIT_KEEP_COUNT);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function applyVisitRetention(progress: StoredProgress, now: Date): StoredProgress {
  const all = progress.visits ?? [];
  const activity = raiseActivityFromVisits(progress.activity, all, now);
  const kept = retainVisits(all, now);
  const next: StoredProgress = {
    ...progress,
    ...(activity ? { activity } : {}),
  };
  if (!activity) delete next.activity;
  if (kept.length > 0) next.visits = kept;
  else delete next.visits;
  if (sameJson(progress.visits, next.visits) && sameJson(progress.activity, next.activity)) {
    return progress;
  }
  return next;
}

function replaceVisit(visits: readonly Visit[], visit: Visit): Visit[] {
  const index = visits.findIndex((entry) => entry.id === visit.id);
  if (index < 0) return [...visits, visit];
  const next = visits.slice();
  next[index] = visit;
  return next;
}

export function createVisitId(now = new Date()): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  return `v-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankVisit(id: string, now: Date): Visit {
  const stamp = now.toISOString();
  return {
    id,
    startedAt: stamp,
    endedAt: stamp,
    activeSeconds: 0,
    lessons: [],
    clips: [],
    exercisesCompleted: 0,
    listeningRuns: 0,
    videos: [],
  };
}

/**
 * Continue `preferredId` when its last activity is within 15 minutes.
 * Otherwise start a new visit. Visible seconds are added only when continuing;
 * the idle gap itself is not watch time.
 */
export function touchVisit(
  progress: StoredProgress,
  now: Date,
  options: { preferredId?: string | null; visibleSeconds?: number },
): { progress: StoredProgress; visitId: string } {
  const preferredId = options.preferredId || null;
  const visibleSeconds = Math.max(0, options.visibleSeconds ?? 0);
  const existing = preferredId
    ? progress.visits?.find((visit) => visit.id === preferredId)
    : undefined;
  const endedMs = existing ? Date.parse(existing.endedAt) : Number.NaN;
  const gapMs = existing && !Number.isNaN(endedMs) ? now.getTime() - endedMs : Number.POSITIVE_INFINITY;

  if (!existing || gapMs > VISIT_IDLE_MS) {
    const visitId = !existing && preferredId ? preferredId : createVisitId(now);
    const next = applyVisitRetention(
      { ...progress, visits: [...(progress.visits ?? []), blankVisit(visitId, now)] },
      now,
    );
    return { progress: next, visitId };
  }

  const add = roundSeconds(Math.min(visibleSeconds, Math.max(0, gapMs / 1000)));
  if (add <= 0) return { progress, visitId: existing.id };

  const updated: Visit = {
    ...existing,
    endedAt: now.toISOString(),
    activeSeconds: existing.activeSeconds + add,
  };
  return {
    visitId: existing.id,
    progress: applyVisitRetention(
      { ...progress, visits: replaceVisit(progress.visits ?? [], updated) },
      now,
    ),
  };
}

function openVisit(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
): { progress: StoredProgress; visitId: string; visit: Visit } {
  const opened = touchVisit(progress, now, { preferredId, visibleSeconds: 0 });
  const visit = opened.progress.visits?.find((entry) => entry.id === opened.visitId);
  if (visit) return { ...opened, visit };
  const created = blankVisit(opened.visitId, now);
  return {
    visitId: opened.visitId,
    visit: created,
    progress: applyVisitRetention(
      { ...opened.progress, visits: [...(opened.progress.visits ?? []), created] },
      now,
    ),
  };
}

function commitVisit(
  progress: StoredProgress,
  visit: Visit,
  now: Date,
): StoredProgress {
  return applyVisitRetention(
    { ...progress, visits: replaceVisit(progress.visits ?? [], withVisitTotals(visit)) },
    now,
  );
}

export function recordVisitClip(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
  lessonKey: string,
  clipId: string,
): { progress: StoredProgress; visitId: string } {
  const key = textId(lessonKey);
  const id = textId(clipId);
  if (!key || !id) return { progress, visitId: preferredId || "" };
  const opened = openVisit(progress, now, preferredId);
  if (opened.visit.clips.some((clip) => clip.lessonKey === key && clip.clipId === id)) {
    return { progress: opened.progress, visitId: opened.visitId };
  }
  const clips = [...opened.visit.clips, { lessonKey: key, clipId: id }].slice(0, VISIT_LIST_CAP.clips);
  return {
    visitId: opened.visitId,
    progress: commitVisit(opened.progress, { ...opened.visit, clips, lessons: [...opened.visit.lessons, key] }, now),
  };
}

function bumpExerciseLesson(
  visit: Visit,
  lessonKey: string,
  update: (lesson: VisitExerciseLesson) => void,
): Visit {
  const lessons = (visit.exerciseLessons ?? []).slice();
  const index = lessons.findIndex((lesson) => lesson.lessonKey === lessonKey);
  const current: VisitExerciseLesson = lessons[index]
    ? { ...lessons[index] }
    : { lessonKey, completed: 0, fullRuns: 0 };
  update(current);
  if (index >= 0) lessons[index] = current;
  else lessons.push(current);
  return {
    ...visit,
    exerciseLessons: lessons.slice(0, VISIT_LIST_CAP.exerciseLessons),
    lessons: [...visit.lessons, lessonKey],
  };
}

export function recordVisitExercise(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
  lessonKey: string,
  count = 1,
): { progress: StoredProgress; visitId: string } {
  const key = textId(lessonKey);
  const amount = countField(count);
  if (!key || amount === 0) return { progress, visitId: preferredId || "" };
  const opened = openVisit(progress, now, preferredId);
  const visit = bumpExerciseLesson(opened.visit, key, (lesson) => {
    lesson.completed += amount;
  });
  return { visitId: opened.visitId, progress: commitVisit(opened.progress, visit, now) };
}

export function recordVisitListeningRun(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
  lessonKey: string,
): { progress: StoredProgress; visitId: string } {
  const key = textId(lessonKey);
  if (!key) return { progress, visitId: preferredId || "" };
  const opened = openVisit(progress, now, preferredId);
  const visit = bumpExerciseLesson(opened.visit, key, (lesson) => {
    lesson.fullRuns += 1;
  });
  return { visitId: opened.visitId, progress: commitVisit(opened.progress, visit, now) };
}

export function recordVisitWrongAttempt(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
): { progress: StoredProgress; visitId: string } {
  const opened = openVisit(progress, now, preferredId);
  const visit: Visit = {
    ...opened.visit,
    wrongAttempts: (opened.visit.wrongAttempts ?? 0) + 1,
  };
  return { visitId: opened.visitId, progress: commitVisit(opened.progress, visit, now) };
}

export function recordVisitVideo(
  progress: StoredProgress,
  now: Date,
  preferredId: string | null,
  update: {
    key: string;
    title?: string;
    addSeconds?: number;
    leftAtSeconds?: number;
    durationSeconds?: number;
    watched?: boolean;
  },
): { progress: StoredProgress; visitId: string } {
  const key = textId(update.key);
  if (!key) return { progress, visitId: preferredId || "" };
  const addSeconds = positiveSeconds(update.addSeconds, 1_000_000);
  const watched = update.watched === true;
  const opened = openVisit(progress, now, preferredId);
  const videos = opened.visit.videos.slice();
  const index = videos.findIndex((video) => video.key === key);
  const current = index >= 0 ? videos[index] : undefined;
  if (!current && addSeconds <= 0 && !watched) {
    return { progress: opened.progress, visitId: opened.visitId };
  }
  const duration = Math.max(current?.durationSeconds ?? 0, positiveSeconds(update.durationSeconds));
  const nextVideo: VisitVideo = {
    key,
    title: textId(update.title, 200) || current?.title || key,
    seconds: (current?.seconds ?? 0) + addSeconds,
    leftAtSeconds:
      typeof update.leftAtSeconds === "number" && Number.isFinite(update.leftAtSeconds)
        ? Math.min(86_400, Math.max(0, update.leftAtSeconds))
        : (current?.leftAtSeconds ?? 0),
    watched: Boolean(current?.watched || watched),
  };
  if (duration > 0) nextVideo.durationSeconds = duration;
  if (
    current &&
    current.seconds === nextVideo.seconds &&
    current.leftAtSeconds === nextVideo.leftAtSeconds &&
    current.watched === nextVideo.watched &&
    current.durationSeconds === nextVideo.durationSeconds &&
    current.title === nextVideo.title
  ) {
    return { progress: opened.progress, visitId: opened.visitId };
  }
  if (index >= 0) videos[index] = nextVideo;
  else videos.push(nextVideo);
  return {
    visitId: opened.visitId,
    progress: commitVisit(
      opened.progress,
      { ...opened.visit, videos: videos.slice(0, VISIT_LIST_CAP.videos) },
      now,
    ),
  };
}

/**
 * Seconds of real playback between two player samples.
 * A jump backward, or forward by more than about 2 seconds, is a seek.
 */
export function videoPlayedSeconds(previous: number | null, next: number): number {
  if (previous == null || !Number.isFinite(previous) || !Number.isFinite(next)) return 0;
  const delta = next - previous;
  if (delta <= 0 || delta > VIDEO_PLAYED_JUMP_SECONDS) return 0;
  return delta;
}

export function formatActiveDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe < 1) return "0 min";
  if (safe < 30) return "under 1 min";
  const minutes = Math.round(safe / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

const VISIT_ORDINALS: Record<number, string> = {
  3: "third",
  4: "fourth",
  5: "fifth",
  6: "sixth",
  7: "seventh",
  8: "eighth",
  9: "ninth",
  10: "tenth",
};

function visitOrdinal(count: number): string {
  const word = VISIT_ORDINALS[count];
  if (word) return word;
  const mod100 = count % 100;
  const mod10 = count % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : mod10 === 1
        ? "st"
        : mod10 === 2
          ? "nd"
          : mod10 === 3
            ? "rd"
            : "th";
  return `${count}${suffix}`;
}

export function daysBetweenUtc(earlierIso: string, laterIso: string): number {
  const earlier = Date.parse(`${earlierIso.slice(0, 10)}T00:00:00.000Z`);
  const later = Date.parse(`${laterIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(earlier) || Number.isNaN(later)) return 0;
  return Math.round((later - earlier) / 86_400_000);
}

/** At most one teacher-facing signal, in the order the product lists them. */
export function describeVisitSignal(input: {
  daysSincePrevious: number | null;
  unfinishedLessonVisits: number | null;
  abandonedVideo: { playedSeconds: number; durationSeconds: number } | null;
}): string | null {
  if (input.daysSincePrevious != null && input.daysSincePrevious >= 7) {
    const days = input.daysSincePrevious;
    return `Back after ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (input.unfinishedLessonVisits != null && input.unfinishedLessonVisits >= 3) {
    return `Same Lektion, ${visitOrdinal(input.unfinishedLessonVisits)} visit, still not finished`;
  }
  const video = input.abandonedVideo;
  if (video && video.durationSeconds > video.playedSeconds) {
    const played = Math.round(video.playedSeconds / 60);
    const total = Math.round(video.durationSeconds / 60);
    if (played >= 1 && total > played) {
      return `Played ${played} min of a ${total} min video and left`;
    }
  }
  return null;
}

function visitRangeBounds(
  range: VisitRange,
  now: Date,
): { startMs: number; endMs: number } | null {
  if (range === "all") return null;
  const todayStart = Date.parse(`${todayIsoDate(now)}T00:00:00.000Z`);
  if (range === "today") return { startMs: todayStart, endMs: todayStart + 86_400_000 };
  return { startMs: todayStart - 6 * 86_400_000, endMs: todayStart + 86_400_000 };
}

function visitOverlaps(visit: Visit, bounds: { startMs: number; endMs: number } | null): boolean {
  if (!bounds) return true;
  const started = Date.parse(visit.startedAt);
  const ended = Date.parse(visit.endedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) return false;
  return ended >= bounds.startMs && started < bounds.endMs;
}

function dayInBounds(day: string, bounds: { startMs: number; endMs: number } | null): boolean {
  if (!bounds) return true;
  const time = Date.parse(`${day}T12:00:00.000Z`);
  return !Number.isNaN(time) && time >= bounds.startMs && time < bounds.endMs;
}

function hasVisitEra(day: DayActivity): boolean {
  return (
    (day.clips ?? 0) > 0 ||
    (day.exercises ?? 0) > 0 ||
    (day.videoSeconds ?? 0) > 0 ||
    (day.activeSeconds ?? 0) > 0
  );
}

export function selectVisits(
  progress: StoredProgress,
  range: VisitRange,
  now = new Date(),
): Visit[] {
  const bounds = visitRangeBounds(range, now);
  return (progress.visits ?? [])
    .filter((visit) => visitOverlaps(visit, bounds))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/** Range totals from retained visits, plus daily totals for visits that aged out. */
export function summarizeVisits(
  progress: StoredProgress,
  range: VisitRange,
  now = new Date(),
): VisitSummary {
  const bounds = visitRangeBounds(range, now);
  const visits = selectVisits(progress, range, now);
  const clips = new Set<string>();
  const watched = new Set<string>();
  let exercisesCompleted = 0;
  let listeningRuns = 0;
  let videoSeconds = 0;
  let activeSeconds = 0;
  const coveredDays = new Set<string>();

  for (const visit of visits) {
    const day = visitDay(visit);
    if (day) coveredDays.add(day);
    for (const clip of visit.clips) clips.add(`${clip.lessonKey}/${clip.clipId}`);
    exercisesCompleted += visit.exercisesCompleted;
    listeningRuns += visit.listeningRuns;
    activeSeconds += visit.activeSeconds;
    for (const video of visit.videos) {
      videoSeconds += video.seconds;
      if (video.watched) watched.add(video.key);
    }
  }

  for (const [day, entry] of Object.entries(progress.activity ?? {})) {
    if (coveredDays.has(day) || !dayInBounds(day, bounds) || !hasVisitEra(entry)) continue;
    clipsAdd(clips, entry.clips ?? 0);
    exercisesCompleted += entry.exercises ?? 0;
    videoSeconds += entry.videoSeconds ?? 0;
    activeSeconds += entry.activeSeconds ?? 0;
    listeningRuns += entry.practiceRuns ?? 0;
  }

  return {
    activeSeconds,
    visitCount: visits.length,
    clipCount: clips.size,
    exercisesCompleted,
    listeningRuns,
    videoSeconds,
    videosWatched: watched.size,
  };
}

function clipsAdd(clips: Set<string>, count: number): void {
  for (let index = 0; index < count; index += 1) {
    clips.add(`rolled:${clips.size}:${index}`);
  }
}

function practiceDatesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (day): day is string =>
          typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day),
      ),
    ),
  ].sort();
}

function previousIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Local calendar days this snapshot records as practice, including study clips and passes. */
export function collectPracticeDates(progress: StoredProgress): string[] {
  const dates = new Set<string>();
  const zone = validTimeZone(progress.streakTimeZone);
  const add = (value: string | undefined) => {
    const day = practiceDayKey(value, zone);
    if (day) dates.add(day);
  };

  add(progress.lastPracticeDate);
  for (const day of progress.practiceDates ?? []) add(day);
  for (const entry of Object.values(progress.learn)) {
    add(entry.completedAt);
    add(entry.studyCompletedAt);
  }
  for (const entry of Object.values(progress.interview)) {
    add(entry.completedAt);
  }
  for (const entry of Object.values(progress.videos)) {
    add(entry.updatedAt);
    add(entry.watchedAt);
  }

  return [...dates].sort();
}

function datesForStreak(progress: StoredProgress): Set<string> {
  return new Set(collectPracticeDates(progress));
}

/** Consecutive practice days ending on `end` (inclusive). */
function streakEndingOn(dates: ReadonlySet<string>, end: string): number {
  let count = 0;
  let cursor: string | null = end;
  while (cursor && dates.has(cursor)) {
    count += 1;
    cursor = previousIsoDate(cursor);
  }
  return count;
}

function samePracticeDates(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return left.every((day, index) => day === right[index]);
}

function streakZone(progress: StoredProgress): string | undefined {
  return validTimeZone(progress.streakTimeZone) ?? deviceTimeZone();
}

/**
 * Days the learner still has credit for. The run counts only when they
 * practiced today or yesterday on their local calendar.
 */
export function activeStreakDays(
  progress: StoredProgress,
  now = new Date(),
): number {
  const dates = datesForStreak(progress);
  const today = localCalendarDay(now, streakZone(progress));
  if (dates.has(today)) return streakEndingOn(dates, today);

  const yesterdayIso = previousIsoDate(today);
  return dates.has(yesterdayIso) ? streakEndingOn(dates, yesterdayIso) : 0;
}

export function bumpStreak(progress: StoredProgress, now = new Date()): StoredProgress {
  const timeZone = deviceTimeZone();
  const today = localCalendarDay(now, timeZone);
  const dates = datesForStreak(timeZone ? { ...progress, streakTimeZone: timeZone } : progress);
  dates.add(today);
  const practiceDates = [...dates].sort();
  const streakDays = streakEndingOn(dates, today);
  if (
    progress.lastPracticeDate === today &&
    progress.streakDays === streakDays &&
    progress.streakTimeZone === timeZone &&
    samePracticeDates(progress.practiceDates, practiceDates)
  ) {
    return progress;
  }

  return {
    ...progress,
    practiceDates,
    streakDays,
    lastPracticeDate: today,
    ...(timeZone ? { streakTimeZone: timeZone } : {}),
  };
}

/**
 * The one-step jump worth a celebration: today just became a practice day
 * and the active run grew by exactly one (including a restart from 0).
 */
export function streakCelebrationStep(
  before: StoredProgress,
  after: StoredProgress,
  now = new Date(),
): { from: number; to: number } | null {
  const today = localCalendarDay(now, streakZone(after));
  if (after.lastPracticeDate !== today || before.lastPracticeDate === today) return null;
  const from = activeStreakDays(before, now);
  const to = activeStreakDays(after, now);
  if (to !== from + 1) return null;
  return { from, to };
}

export function markClipCompleted(
  progress: StoredProgress,
  berufSlug: string,
  clipId: string,
): StoredProgress {
  const entry = progress.interview[berufSlug] ?? {
    currentClipIndex: 0,
    completedClipIds: [],
  };
  const completedClipIds = entry.completedClipIds.includes(clipId)
    ? entry.completedClipIds
    : [...entry.completedClipIds, clipId];

  const next: StoredProgress = {
    ...progress,
    interview: {
      ...progress.interview,
      [berufSlug]: {
        ...entry,
        currentClipIndex: completedClipIds.length,
        completedClipIds,
      },
    },
  };

  return bumpStreak(next);
}

export function markLearnClipCompleted(
  progress: StoredProgress,
  chapterSlug: string,
  clipId: string,
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  const completedClipIds = entry.completedClipIds.includes(clipId)
    ? entry.completedClipIds
    : [...entry.completedClipIds, clipId];
  const runCompletedClipIds = entry.runCompletedClipIds.includes(clipId)
    ? entry.runCompletedClipIds
    : [...entry.runCompletedClipIds, clipId];

  const next: StoredProgress = {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        ...entry,
        currentClipIndex: runCompletedClipIds.length,
        completedClipIds,
        runCompletedClipIds,
      },
    },
  };

  return bumpStreak(next);
}

function withLearnEntry(
  progress: StoredProgress,
  chapterSlug: string,
  entry: LearnProgress,
): StoredProgress {
  return {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: entry,
    },
  };
}

function withoutRunCursor(entry: LearnProgress): LearnProgress {
  const next: LearnProgress = {
    currentClipIndex: 0,
    completedClipIds: entry.completedClipIds,
    runCount: entry.runCount,
    runCompletedClipIds: [],
    reviewedClipIds: entry.reviewedClipIds,
    studyRunCount: entry.studyRunCount,
  };
  if (entry.completedAt) next.completedAt = entry.completedAt;
  if (entry.studyCompletedAt) next.studyCompletedAt = entry.studyCompletedAt;
  return next;
}

/**
 * Remember the shuffled order for a review run.
 * Replacing the order starts that run over, so a new shuffle cannot skip clips.
 */
export function setLearnRunOrder(
  progress: StoredProgress,
  chapterSlug: string,
  order: readonly string[],
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  const current = entry.runClipOrder ?? [];
  if (
    current.length === order.length &&
    current.every((id, index) => id === order[index])
  ) {
    return progress;
  }

  return withLearnEntry(progress, chapterSlug, {
    ...entry,
    runClipOrder: [...order],
    runCompletedClipIds: [],
    currentClipIndex: 0,
  });
}

/**
 * Store one finished listening part. Individual clips are not saved until the
 * part ends. `finishRun` records the full pass and clears the run cursor.
 */
export function commitLearnPart(
  progress: StoredProgress,
  chapterSlug: string,
  clipIds: readonly string[],
  options?: { now?: Date; finishRun?: boolean },
): StoredProgress {
  const now = options?.now ?? new Date();
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  const completedClipIds = unionIds(entry.completedClipIds, clipIds);
  const runCompletedClipIds = unionIds(entry.runCompletedClipIds, clipIds);
  let next = bumpStreak(
    withLearnEntry(progress, chapterSlug, {
      ...entry,
      currentClipIndex: runCompletedClipIds.length,
      completedClipIds,
      runCompletedClipIds,
    }),
    now,
  );

  if (!options?.finishRun) return next;

  next = markLearnChapterCompleted(next, chapterSlug, now.toISOString());
  next = incrementLearnRunCount(next, chapterSlug, now);
  const finished = next.learn[chapterSlug] ?? emptyLearnProgress();
  return withLearnEntry(next, chapterSlug, withoutRunCursor(finished));
}

/**
 * Stamp a chapter as completed the first time the student finishes every clip.
 * Later calls are ignored so the original completion date is kept.
 */
export function markLearnChapterCompleted(
  progress: StoredProgress,
  chapterSlug: string,
  completedAt = new Date().toISOString(),
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  if (entry.completedAt) {
    return progress;
  }

  return {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        ...entry,
        completedAt: entry.completedAt ?? completedAt,
      },
    },
  };
}

export function incrementLearnRunCount(
  progress: StoredProgress,
  chapterSlug: string,
  now = new Date(),
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();

  return recordDayRun(
    {
      ...progress,
      learn: {
        ...progress.learn,
        [chapterSlug]: {
          ...entry,
          runCount: entry.runCount + 1,
        },
      },
    },
    "practiceRuns",
    now,
  );
}

/**
 * Count one finished study pass and stamp the chapter the first time.
 * Later passes keep the original completion date.
 */
export function incrementStudyRunCount(
  progress: StoredProgress,
  chapterSlug: string,
  completedAt = new Date().toISOString(),
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();

  const completedOn = dateFromStamp(completedAt);
  return bumpStreak(
    recordDayRun(
      {
        ...progress,
        learn: {
          ...progress.learn,
          [chapterSlug]: {
            ...entry,
            studyRunCount: entry.studyRunCount + 1,
            studyCompletedAt: entry.studyCompletedAt ?? completedAt,
          },
        },
      },
      "studyRuns",
      completedOn,
    ),
    completedOn,
  );
}

export function markLearnClipReviewed(
  progress: StoredProgress,
  chapterSlug: string,
  clipId: string,
  now = new Date(),
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  const next = entry.reviewedClipIds.includes(clipId)
    ? progress
    : withLearnEntry(progress, chapterSlug, {
        ...entry,
        reviewedClipIds: [...entry.reviewedClipIds, clipId],
      });

  return bumpStreak(next, now);
}

/** Save every clip in a study part at once. An unfinished part is not written. */
export function commitStudyPart(
  progress: StoredProgress,
  chapterSlug: string,
  clipIds: readonly string[],
  now = new Date(),
): StoredProgress {
  if (clipIds.length === 0) return progress;
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  return bumpStreak(
    withLearnEntry(progress, chapterSlug, {
      ...entry,
      reviewedClipIds: unionIds(entry.reviewedClipIds, clipIds),
    }),
    now,
  );
}

/**
 * Drop reviews that sit in an unfinished study part.
 * A finished lesson is left as stored, including an empty replay.
 */
export function settleStudyReviewedClips(
  progress: StoredProgress,
  chapterSlug: string,
  clips: readonly { id: string }[],
): StoredProgress {
  const entry = progress.learn[chapterSlug];
  if (!entry || isStudyChapterCompleted(progress, chapterSlug)) return progress;
  const kept = settledStudyReviewedIds(clips, entry.reviewedClipIds);
  if (sameIdSet(kept, entry.reviewedClipIds)) return progress;
  return withLearnEntry(progress, chapterSlug, {
    ...entry,
    reviewedClipIds: kept,
  });
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  return right.every((id) => seen.has(id));
}

/** Drop reviews for one study part. Hearing progress and other parts stay. */
export function clearReviewedClips(
  progress: StoredProgress,
  chapterSlug: string,
  clipIds: readonly string[],
): StoredProgress {
  const entry = progress.learn[chapterSlug];
  if (!entry || clipIds.length === 0) return progress;
  const drop = new Set(clipIds);
  return withLearnEntry(progress, chapterSlug, {
    ...entry,
    reviewedClipIds: entry.reviewedClipIds.filter((id) => !drop.has(id)),
  });
}

/** Clears study / flashcard reviews. Hearing-exercise progress is kept. */
export function resetLearnStudyProgress(
  progress: StoredProgress,
  chapterSlug: string,
): StoredProgress {
  const entry = progress.learn[chapterSlug];
  if (!entry) return progress;

  return {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        ...entry,
        reviewedClipIds: [],
      },
    },
  };
}

export function learnReviewedClipIds(
  progress: StoredProgress,
  chapterSlug: string,
): string[] {
  return progress.learn[chapterSlug]?.reviewedClipIds ?? [];
}

/** First clip the student has not reviewed yet, in catalog order. */
export function firstUnreviewedIndex<T extends { id: string }>(
  clips: readonly T[],
  reviewedClipIds: readonly string[],
): number {
  const done = new Set(reviewedClipIds);
  const index = clips.findIndex((clip) => !done.has(clip.id));
  return index === -1 ? clips.length : index;
}

export function isLearnChapterCompleted(
  progress: StoredProgress,
  chapterSlug: string,
): boolean {
  return Boolean(progress.learn[chapterSlug]?.completedAt);
}

export function resetBerufProgress(
  progress: StoredProgress,
  berufSlug: string,
): StoredProgress {
  const next: StoredProgress = {
    ...progress,
    interview: {
      ...progress.interview,
      [berufSlug]: {
        currentClipIndex: 0,
        completedClipIds: [],
      },
    },
  };

  return next;
}

/** Clears clip progress but keeps the permanent completion stamp. */
export function resetLearnProgress(
  progress: StoredProgress,
  chapterSlug: string,
): StoredProgress {
  const existing = progress.learn[chapterSlug];
  const completedAt = existing?.completedAt;
  const next: StoredProgress = {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        currentClipIndex: 0,
        completedClipIds: existing?.completedClipIds ?? [],
        runCompletedClipIds: [],
        runCount: existing?.runCount ?? 0,
        reviewedClipIds: existing?.reviewedClipIds ?? [],
        studyRunCount: existing?.studyRunCount ?? 0,
        ...(completedAt ? { completedAt } : {}),
        ...(existing?.studyCompletedAt
          ? { studyCompletedAt: existing.studyCompletedAt }
          : {}),
      },
    },
  };

  return next;
}

export function learnRunCount(
  progress: StoredProgress,
  chapterSlug: string,
): number {
  return progress.learn[chapterSlug]?.runCount ?? 0;
}

export function learnStudyRunCount(
  progress: StoredProgress,
  chapterSlug: string,
): number {
  return progress.learn[chapterSlug]?.studyRunCount ?? 0;
}

/** True after the student has finished every study card at least once. */
export function isStudyChapterCompleted(
  progress: StoredProgress,
  chapterSlug: string,
): boolean {
  const entry = progress.learn[chapterSlug];
  return Boolean(entry?.studyCompletedAt) || (entry?.studyRunCount ?? 0) > 0;
}

export type StudyUnlockChapter = {
  slug: string;
  clipCount: number;
};

export type StudyUnlockLevel = {
  slug: string;
  chapters: readonly StudyUnlockChapter[];
};

/**
 * Study session for the earliest unlocked lesson the learner can open.
 * A lesson with clips stays locked until every earlier lesson with clips is
 * complete. An unfinished study pass wins over a finished one.
 */
export function firstUnlockedStudyHref(
  progress: StoredProgress,
  levels: readonly StudyUnlockLevel[],
  unlockedLevelSlugs: readonly string[],
): `/learn/${string}/${string}/study` | null {
  const granted = new Set(unlockedLevelSlugs);
  let firstOpen: `/learn/${string}/${string}/study` | null = null;
  for (const level of levels) {
    if (!granted.has(level.slug)) continue;
    const chapters = level.chapters;
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index];
      if (!chapter || chapter.clipCount <= 0) continue;
      const blocked = chapters
        .slice(0, index)
        .some(
          (previous) =>
            previous.clipCount > 0 && !isLearnChapterCompleted(progress, previous.slug),
        );
      if (blocked) continue;
      const href = `/learn/${level.slug}/${chapter.slug}/study` as const;
      if (!isStudyChapterCompleted(progress, chapter.slug)) return href;
      if (!firstOpen) firstOpen = href;
    }
  }
  return firstOpen;
}

export function learnRunCompletedClipIds(
  progress: StoredProgress,
  chapterSlug: string,
): string[] {
  return progress.learn[chapterSlug]?.runCompletedClipIds ?? [];
}

export function learnProgressKey(levelSlug: string, chapterSlug: string): string {
  return `${levelSlug}/${chapterSlug}`;
}

function shuffleItems<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = current as T;
  }
  return shuffled;
}

/** Clips the student has not yet answered correctly, in a fresh random order. */
export function practiceQueue<T extends { id: string }>(
  clips: readonly T[],
  completedClipIds: readonly string[],
): T[] {
  const done = new Set(completedClipIds);
  return shuffleItems(clips.filter((clip) => !done.has(clip.id)));
}

/**
 * Clip order for a Lektion session.
 * First pass: catalog order from the JSON file, resuming past finished clips.
 * Review (chapter already completed once): the whole chapter, freshly shuffled.
 */
export function learnQueue<T extends { id: string }>(
  clips: readonly T[],
  completedClipIds: readonly string[],
  review: boolean,
): T[] {
  const done = new Set(completedClipIds);
  if (review) {
    return shuffleItems(clips.filter((clip) => !done.has(clip.id)));
  }
  return clips.filter((clip) => !done.has(clip.id));
}

function asOrderClip(clip: {
  id: string;
  script?: string;
  translationVi?: string;
  sentenceOrder?: boolean;
  answer?: string;
  replies?: OrderSourceClip["replies"];
  imageUrl?: string;
}): OrderSourceClip {
  return {
    id: clip.id,
    script: clip.script ?? "",
    ...(clip.translationVi !== undefined ? { translationVi: clip.translationVi } : {}),
    ...(clip.sentenceOrder !== undefined ? { sentenceOrder: clip.sentenceOrder } : {}),
    ...(clip.answer !== undefined ? { answer: clip.answer } : {}),
    ...(clip.replies !== undefined ? { replies: clip.replies } : {}),
    ...(clip.imageUrl !== undefined ? { imageUrl: clip.imageUrl } : {}),
  };
}

/** Fewest clips one practice part may hold. A shorter lesson stays one part. */
export const MIN_PRACTICE_CLIPS = 6;

/**
 * Largest clip count a part may have.
 * When the card cap already allows the clip minimum, that cap is the bound.
 * When 6 clips already pass 20 cards, the bound is the minimum: a part grows
 * no further, because more clips would only add cards.
 */
function partClipBound(maxPerPart: number, minPerPart: number): number {
  const max = Math.max(1, maxPerPart);
  const min = Math.max(1, minPerPart);
  return max >= min ? max : min;
}

/**
 * Part count and the size of each part.
 * An even split is used when every part can stay inside the bound and still
 * reach the clip minimum. Otherwise parts are filled to the bound and a
 * shorter tail is left as the last part, instead of spreading those clips
 * onto earlier parts.
 */
function partLayout(
  total: number,
  maxPerPart: number,
  minPerPart: number,
): { count: number; size: (partNumber: number) => number } {
  if (total <= 0) return { count: 0, size: () => 0 };
  const min = Math.max(1, minPerPart);
  const bound = partClipBound(maxPerPart, minPerPart);
  if (total <= bound) return { count: 1, size: () => total };

  const evenCount = Math.ceil(total / bound);
  const smallest = Math.floor(total / evenCount);
  if (smallest >= min) {
    const base = Math.floor(total / evenCount);
    const extra = total % evenCount;
    return {
      count: evenCount,
      size: (partNumber) => base + (partNumber - 1 < extra ? 1 : 0),
    };
  }

  const full = Math.floor(total / bound);
  const remainder = total % bound;
  if (remainder === 0) return { count: full, size: () => bound };
  return {
    count: full + 1,
    size: (partNumber) => (partNumber <= full ? bound : remainder),
  };
}

/**
 * How many parts a lesson becomes.
 * Parts stay within the card cap when that still leaves at least
 * `minPerPart` clips. When the card cap is below that minimum, parts are
 * exactly the minimum, plus a shorter tail.
 */
export function listeningPartCount(
  totalQuestions: number,
  maxPerPart: number = MAX_PRACTICE_CARDS,
  minPerPart: number = MIN_PRACTICE_CLIPS,
): number {
  return partLayout(totalQuestions, maxPerPart, minPerPart).count;
}

/**
 * Clip ids that belong to work the learner already finished.
 * A finished lesson includes every current clip. A finished prefix includes
 * clips inserted into that prefix. Clips after the last finished id stay new.
 * An empty finished list on a finished study lesson is a replay in progress
 * and is left empty so "Xem lại" is not filled back in.
 */
export function withFinishedCatalogClips(
  clipIds: readonly string[],
  finishedIds: readonly string[],
  unitFinished: boolean,
  options?: { keepEmptyReplay?: boolean },
): readonly string[] {
  if (options?.keepEmptyReplay && unitFinished && finishedIds.length === 0) {
    return finishedIds;
  }
  if (clipIds.length === 0) return finishedIds;
  const inside = unitFinished
    ? clipIds
    : finishedPrefix(clipIds, finishedIds);
  if (inside.length === 0) return finishedIds;
  const have = new Set(finishedIds);
  if (inside.every((id) => have.has(id))) return finishedIds;
  return unionIds(finishedIds, inside);
}

function finishedPrefix(
  clipIds: readonly string[],
  finishedIds: readonly string[],
): readonly string[] {
  const done = new Set(finishedIds);
  let lastFinished = -1;
  for (let index = 0; index < clipIds.length; index += 1) {
    const id = clipIds[index];
    if (id && done.has(id)) lastFinished = index;
  }
  if (lastFinished < 0) return [];
  return clipIds.slice(0, lastFinished + 1);
}

export type LessonClipCatalog = {
  chapterSlug: string;
  clipIds: readonly string[];
};

/**
 * Mark clips added to a finished lesson, or inserted into an already finished
 * stretch of one, as completed and studied. Appended clips in an unfinished
 * lesson stay unfinished.
 */
export function absorbAddedLessonClips(
  progress: StoredProgress,
  lessons: readonly LessonClipCatalog[],
): StoredProgress {
  let next = progress;
  for (const lesson of lessons) {
    if (lesson.clipIds.length === 0) continue;
    const entry = next.learn[lesson.chapterSlug];
    if (!entry) continue;
    const completedClipIds = withFinishedCatalogClips(
      lesson.clipIds,
      entry.completedClipIds,
      Boolean(entry.completedAt),
    );
    const studyFinished = isStudyChapterCompleted(next, lesson.chapterSlug);
    const reviewedClipIds = withFinishedCatalogClips(
      lesson.clipIds,
      entry.reviewedClipIds,
      studyFinished,
      { keepEmptyReplay: true },
    );
    if (
      completedClipIds === entry.completedClipIds &&
      reviewedClipIds === entry.reviewedClipIds
    ) {
      continue;
    }
    next = withLearnEntry(next, lesson.chapterSlug, {
      ...entry,
      completedClipIds: [...completedClipIds],
      reviewedClipIds: [...reviewedClipIds],
      currentClipIndex: completedClipIds.length,
    });
  }
  return next;
}

/**
 * Keep an in-progress review when the only catalog change is clips already
 * marked finished. Returns null when the stored order should be replaced.
 */
export function preservedReviewOrder(
  clipIds: readonly string[],
  storedOrder: readonly string[] | null | undefined,
  completedIds: readonly string[],
): string[] | null {
  if (!storedOrder || storedOrder.length === 0) return null;
  const catalog = new Set(clipIds);
  const seen = new Set<string>();
  for (const id of storedOrder) {
    if (!catalog.has(id) || seen.has(id)) return null;
    seen.add(id);
  }
  const added = clipIds.filter((id) => !seen.has(id));
  if (added.length === 0) return null;
  const done = new Set(completedIds);
  if (!added.every((id) => done.has(id))) return null;
  return [...storedOrder];
}

/**
 * Split clips into contiguous parts.
 * A lesson that fits in the card cap is one part. Practice parts aim for at
 * most 20 cards and at least 6 clips. When 6 clips already pass 20 cards,
 * each part is 6 clips and the leftover tail stays short. Those leftover
 * clips are not spread onto earlier parts, which is what turned a 6-clip
 * part into 8.
 * Pass `maxPerPart` to reuse the parent lesson's cap for a finished prefix
 * or an open suffix, so a lighter stretch is not dealt as a longer run.
 * Pass `minPerPart` of 1 for study, which has no clip minimum.
 */
export function splitListeningParts<
  T extends {
    id: string;
    script?: string;
    translationVi?: string;
    sentenceOrder?: boolean;
  },
>(clips: readonly T[], maxPerPart?: number, minPerPart: number = MIN_PRACTICE_CLIPS): T[][] {
  if (clips.length === 0) return [];
  const max = Math.max(
    1,
    maxPerPart ?? maxClipsPerPracticePart(clips.map(asOrderClip)),
  );
  const layout = partLayout(clips.length, max, minPerPart);
  if (layout.count <= 1) return [clips.slice()];

  const parts: T[][] = [];
  let index = 0;
  for (let part = 1; part <= layout.count; part += 1) {
    const size = layout.size(part);
    parts.push(clips.slice(index, index + size));
    index += size;
  }
  return parts;
}

/**
 * First-pass parts still left to play. Finished clips stay in earlier parts
 * and are not dealt again when later clips are added.
 */
export function openListeningParts<
  T extends {
    id: string;
    script?: string;
    translationVi?: string;
    sentenceOrder?: boolean;
  },
>(
  clips: readonly T[],
  completedIds: readonly string[],
): { parts: T[][]; partNumber: number; partCount: number } {
  const maxPerPart = maxClipsPerPracticePart(clips.map(asOrderClip));
  const done = new Set(completedIds);
  const firstOpen = clips.findIndex((clip) => !done.has(clip.id));
  if (firstOpen < 0) {
    const parts = splitListeningParts(clips, maxPerPart);
    return { parts, partNumber: 1, partCount: parts.length };
  }
  const prefix = clips.slice(0, firstOpen);
  const suffix = clips.slice(firstOpen);
  const prefixParts = prefix.length > 0 ? splitListeningParts(prefix, maxPerPart) : [];
  const suffixParts = splitListeningParts(suffix, maxPerPart);
  return {
    parts: suffixParts,
    partNumber: prefixParts.length + 1,
    partCount: prefixParts.length + suffixParts.length,
  };
}

/**
 * Clip count for one part. Review runs shuffle first, so the ids change and
 * the size does not. `maxPerPart` must be the lesson's card cap; without it,
 * each clip is treated as one card.
 */
export function listeningPartSize(
  totalClips: number,
  partNumber: number,
  partCount: number,
  maxPerPart: number = MAX_PRACTICE_CARDS,
  minPerPart: number = MIN_PRACTICE_CLIPS,
): number | null {
  if (totalClips <= 0 || partNumber < 1 || partCount < 1) return null;
  const layout = partLayout(totalClips, maxPerPart, minPerPart);
  if (layout.count !== partCount || partNumber > layout.count) return null;
  return layout.size(partNumber);
}

/** Most clips one study node may hold. Parts stay as even as that cap allows. */
export const MAX_STUDY_CLIPS = 12;

export function studyPartCount(totalClips: number): number {
  return listeningPartCount(totalClips, MAX_STUDY_CLIPS, 1);
}

/** Even contiguous study parts. A lesson that already fits is one part. */
export function splitStudyParts<T extends { id: string }>(clips: readonly T[]): T[][] {
  return splitListeningParts(clips, MAX_STUDY_CLIPS, 1);
}

export function studyPartSize(
  totalClips: number,
  partNumber: number,
  partCount: number,
): number | null {
  return listeningPartSize(totalClips, partNumber, partCount, MAX_STUDY_CLIPS, 1);
}

/** 1-based part to play. One past the last part when every part is already finished. */
export function firstIncompleteStudyPart<T extends { id: string }>(
  parts: readonly (readonly T[])[],
  reviewedIds: readonly string[],
): number {
  if (parts.length === 0) return 1;
  const done = new Set(reviewedIds);
  const index = parts.findIndex((part) => part.some((clip) => !done.has(clip.id)));
  return index < 0 ? parts.length + 1 : index + 1;
}

/**
 * Reviews that belong to finished study parts.
 * Counting stops at the first unfinished part, so a part left in the middle
 * does not count and its clips are dropped.
 */
export function settledStudyReviewedIds<T extends { id: string }>(
  clips: readonly T[],
  reviewedIds: readonly string[],
): string[] {
  const done = new Set(reviewedIds);
  const kept: string[] = [];
  for (const part of splitStudyParts(clips)) {
    if (part.length === 0 || !part.every((clip) => done.has(clip.id))) break;
    for (const clip of part) kept.push(clip.id);
  }
  return kept;
}

export type NextPart = {
  partNumber: number;
  partCount: number;
  /** Clips the learner will see if they start now. */
  clips: { id: string; script?: string }[];
  /** A later pass of a lesson that was already finished once. */
  rerun: boolean;
  /** The stored pass is complete, so starting clears it and begins at part 1. */
  freshReplay: boolean;
};

/**
 * The study part a tap would open.
 * A finished lesson offers part 1 of a new pass. A pass already underway
 * offers the first part that still has an unreviewed clip.
 */
export function nextStudyPart<T extends { id: string; script?: string }>(
  clips: readonly T[],
  reviewedIds: readonly string[],
  studyRunCount: number,
): NextPart | null {
  const parts = splitStudyParts(clips);
  if (parts.length === 0) return null;
  const finished = studyRunCount > 0;
  const replaying = finished && reviewedIds.length === 0;
  const settled = finished ? reviewedIds : settledStudyReviewedIds(clips, reviewedIds);
  const open = replaying ? 1 : firstIncompleteStudyPart(parts, settled);
  const freshReplay = finished && !replaying && open > parts.length;
  const partNumber = freshReplay ? 1 : Math.min(open, parts.length);
  const part = parts[partNumber - 1] ?? [];
  return {
    partNumber,
    partCount: parts.length,
    clips: part.map((clip) => ({ id: clip.id, script: clip.script })),
    rerun: finished,
    freshReplay,
  };
}

/**
 * The listening part a tap would open.
 * The first pass follows catalog order. A later pass follows the stored
 * shuffle, or part 1 of a new shuffle when that pass is not underway.
 */
export function nextListeningPart<
  T extends {
    id: string;
    script?: string;
    translationVi?: string;
    sentenceOrder?: boolean;
  },
>(
  clips: readonly T[],
  completedIds: readonly string[],
  runCount: number,
  runOrder: readonly string[] | null | undefined,
  runCompletedIds: readonly string[],
): NextPart | null {
  if (clips.length === 0) return null;
  if (runCount <= 0) {
    const open = openListeningParts(clips, completedIds);
    const part = open.parts[0] ?? [];
    return {
      partNumber: open.partNumber,
      partCount: open.partCount,
      clips: part.map((clip) => ({ id: clip.id, script: clip.script })),
      rerun: false,
      freshReplay: false,
    };
  }

  if (!runOrder || !sameClipOrderSet(clips, runOrder)) {
    const parts = splitListeningParts(clips);
    const part = parts[0] ?? [];
    return {
      partNumber: 1,
      partCount: parts.length,
      clips: part.map((clip) => ({ id: clip.id, script: clip.script })),
      rerun: true,
      freshReplay: true,
    };
  }

  const ordered = clipsInStoredOrder(clips, runOrder);
  const parts = splitListeningParts(ordered);
  const index = firstIncompletePartIndex(parts, runCompletedIds);
  if (index < 0) {
    const fresh = splitListeningParts(clips);
    const part = fresh[0] ?? [];
    return {
      partNumber: 1,
      partCount: fresh.length,
      clips: part.map((clip) => ({ id: clip.id, script: clip.script })),
      rerun: true,
      freshReplay: true,
    };
  }
  const part = parts[index] ?? [];
  return {
    partNumber: index + 1,
    partCount: parts.length,
    clips: part.map((clip) => ({ id: clip.id, script: clip.script })),
    rerun: true,
    freshReplay: false,
  };
}

export function completedStudyPartCount<T extends { id: string }>(
  clips: readonly T[],
  reviewedIds: readonly string[],
): { done: number; total: number } {
  const parts = splitStudyParts(clips);
  if (parts.length === 0) return { done: 0, total: 0 };
  const open = firstIncompleteStudyPart(parts, settledStudyReviewedIds(clips, reviewedIds));
  return { done: Math.min(open, parts.length + 1) - 1, total: parts.length };
}

export function studyActivityId(
  lessonId: string,
  partNumber: number,
  partCount: number,
): string {
  return partCount <= 1 ? `${lessonId}-study` : `${lessonId}-study-${partNumber}`;
}

/** Part number on a study trail id, or null when the id is not a study node. */
export function studyPartNumberFromActivityId(id: string): number | null {
  const numbered = /-study-(\d+)$/.exec(id);
  if (numbered) {
    const part = Number(numbered[1]);
    return part >= 1 ? part : null;
  }
  return id.endsWith("-study") ? 1 : null;
}

export function isStudyActivityId(id: string): boolean {
  return studyPartNumberFromActivityId(id) != null;
}

/** True when `order` is a permutation of the current catalog. */
export function sameClipOrderSet<T extends { id: string }>(
  clips: readonly T[],
  order: readonly string[] | undefined | null,
): boolean {
  if (!order || order.length !== clips.length || clips.length === 0) return false;
  const ids = new Set(clips.map((clip) => clip.id));
  if (ids.size !== clips.length) return false;
  const seen = new Set<string>();
  for (const id of order) {
    if (!ids.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === clips.length;
}

export function clipsInStoredOrder<T extends { id: string }>(
  clips: readonly T[],
  order: readonly string[],
): T[] {
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  return order.flatMap((id) => {
    const clip = byId.get(id);
    return clip ? [clip] : [];
  });
}

/**
 * Pull the clip at `index` out and place it again later in the queue.
 * The cursor stays put, so the next clip slides into the current slot.
 * A clip with nothing after it stays where it is.
 */
export function requeueMissedClip<T>(
  clips: readonly T[],
  index: number,
  random: () => number = Math.random,
): T[] {
  if (index < 0 || index >= clips.length) return [...clips];
  const missed = clips[index] as T;
  const next = [...clips.slice(0, index), ...clips.slice(index + 1)];
  const earliest = Math.min(index + 1, next.length);
  const latest = next.length;
  const start = Math.min(earliest, latest);
  const span = latest - start + 1;
  const offset = Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
  next.splice(start + offset, 0, missed);
  return next;
}

/** Index of the first part that still has an unfinished clip, or -1. */
export function firstIncompletePartIndex<T extends { id: string }>(
  parts: readonly (readonly T[])[],
  completedIds: readonly string[],
): number {
  const done = new Set(completedIds);
  return parts.findIndex((part) => part.some((clip) => !done.has(clip.id)));
}

/** Finished parts at the start of the run. A partial part does not count. */
export function completedPartCount<T extends { id: string }>(
  parts: readonly (readonly T[])[],
  completedIds: readonly string[],
): number {
  const index = firstIncompletePartIndex(parts, completedIds);
  return index === -1 ? parts.length : index;
}

/** Completed ids that still exist in the current catalog. */
export function catalogCompletedCount<T extends { id: string }>(
  clips: readonly T[],
  completedClipIds: readonly string[],
): number {
  const catalog = new Set(clips.map((clip) => clip.id));
  return completedClipIds.filter((id) => catalog.has(id)).length;
}

/** Progress summary for a single Ausbildung slug. */
export function toBerufProgress(
  progress: StoredProgress,
  berufSlug: string,
  totalClips: number,
): BerufProgressSummary {
  const entry = progress.interview[berufSlug] ?? {
    currentClipIndex: 0,
    completedClipIds: [],
  };
  const safeTotal = Math.max(0, totalClips);
  const completedCount = entry.completedClipIds.length;
  const percent =
    safeTotal === 0
      ? 0
      : Math.min(100, Math.round((completedCount / safeTotal) * 100));

  return {
    berufSlug,
    href: `/interview/${berufSlug}`,
    currentClipIndex: completedCount,
    completedCount,
    totalClips: safeTotal,
    percent,
  };
}

/**
 * Pick the beruf to surface as "continue learning".
 * Prefers an in-progress (incomplete) track with the most completions;
 * otherwise the furthest along; otherwise the first available slug.
 */
export function toContinueLearning(
  progress: StoredProgress,
  totalsBySlug: Record<string, number> = {},
): ContinueLearning {
  const slugs = Object.keys(totalsBySlug);
  const fallbackSlug = slugs[0] ?? CONTINUE_BERUF_SLUG;
  const candidates = (slugs.length > 0 ? slugs : [CONTINUE_BERUF_SLUG]).map(
    (slug) => toBerufProgress(progress, slug, totalsBySlug[slug] ?? 0),
  );

  const inProgress = candidates
    .filter((c) => c.completedCount > 0 && c.percent < 100)
    .sort((a, b) => b.completedCount - a.completedCount);
  if (inProgress[0]) return inProgress[0];

  const started = candidates
    .filter((c) => c.completedCount > 0)
    .sort((a, b) => b.completedCount - a.completedCount);
  if (started[0]) return started[0];

  return (
    candidates[0] ??
    toBerufProgress(progress, fallbackSlug, totalsBySlug[fallbackSlug] ?? 0)
  );
}

function hasChapterContent(chapter: ContinueLevelCatalogChapter): boolean {
  return chapter.clipCount > 0 || chapter.videoIds.length > 0;
}

function hasLearnActivity(entry: LearnProgress | undefined): boolean {
  if (!entry) return false;
  return Boolean(
    entry.completedAt ||
      entry.studyCompletedAt ||
      entry.runCount > 0 ||
      entry.studyRunCount > 0 ||
      entry.completedClipIds.length > 0 ||
      entry.runCompletedClipIds.length > 0 ||
      (entry.runClipOrder?.length ?? 0) > 0 ||
      entry.reviewedClipIds.length > 0 ||
      entry.currentClipIndex > 0,
  );
}

function isChapterComplete(
  progress: StoredProgress,
  levelSlug: string,
  chapter: ContinueLevelCatalogChapter,
): boolean {
  if (chapter.clipCount > 0) {
    return isLearnChapterCompleted(progress, chapter.slug);
  }
  if (chapter.videoIds.length === 0) return false;
  return chapter.videoIds.every((videoId) => {
    const key = lessonVideoProgressKey(levelSlug, chapter.slug, videoId);
    return lessonVideoStatus(progress.videos[key]) === "watched";
  });
}

function isChapterStarted(
  progress: StoredProgress,
  levelSlug: string,
  chapter: ContinueLevelCatalogChapter,
): boolean {
  if (!hasChapterContent(chapter)) return false;
  const videoStarted = chapter.videoIds.some((videoId) => {
    const key = lessonVideoProgressKey(levelSlug, chapter.slug, videoId);
    return lessonVideoStatus(progress.videos[key]) !== "not-started";
  });
  if (videoStarted) return true;
  return chapter.clipCount > 0 && hasLearnActivity(progress.learn[chapter.slug]);
}

function isLevelStarted(
  progress: StoredProgress,
  level: ContinueLevelCatalogEntry,
): boolean {
  return level.chapters.some((chapter) =>
    isChapterStarted(progress, level.slug, chapter),
  );
}

/**
 * CEFR level to open when the learner hits Học.
 * The highest catalog level they have started and still have access to.
 * A finished level still counts. With nothing started, the earliest unlocked
 * level. Null when none of the unlocked slugs are in the catalog.
 */
export function landingLevelSlug(
  progress: StoredProgress,
  catalog: readonly ContinueLevelCatalogEntry[],
  unlockedSlugs: readonly string[],
): string | null {
  const allowed = new Set(unlockedSlugs);
  const open = catalog.filter((level) => allowed.has(level.slug));
  const started = [...open].reverse().find((level) => isLevelStarted(progress, level));
  return started?.slug ?? open[0]?.slug ?? null;
}

function interviewCourseStarted(progress: StoredProgress, slug: string): boolean {
  const entry = progress.interview[slug];
  if (!entry) return false;
  return (
    entry.currentClipIndex > 0 ||
    entry.completedClipIds.length > 0 ||
    Boolean(entry.completedAt)
  );
}

/**
 * Interview job to open when the learner has no CEFR course.
 * The last catalog job they have started, otherwise the first one.
 */
export function landingInterviewSlug(
  progress: StoredProgress,
  slugs: readonly string[],
): string | null {
  const started = [...slugs].reverse().find((slug) => interviewCourseStarted(progress, slug));
  return started ?? slugs[0] ?? null;
}

/**
 * Resume target on Home: the first unfinished Lektion of the latest CEFR
 * level the student has actually started. Returns null when nothing is in
 * progress (so Home does not fall back to Ausbildung).
 */
export function toContinueLevelLearning(
  progress: StoredProgress,
  catalog: readonly ContinueLevelCatalogEntry[],
): ContinueLevelLearning | null {
  const latestStarted = [...catalog]
    .reverse()
    .find((level) => isLevelStarted(progress, level));
  if (!latestStarted) return null;

  const contentChapters = latestStarted.chapters.filter(hasChapterContent);
  if (contentChapters.length === 0) return null;

  const completedChapters = contentChapters.filter((chapter) =>
    isChapterComplete(progress, latestStarted.slug, chapter),
  ).length;
  const resumeIndex = contentChapters.findIndex(
    (chapter) => !isChapterComplete(progress, latestStarted.slug, chapter),
  );
  if (resumeIndex < 0) return null;

  const chapter = contentChapters[resumeIndex];
  if (!chapter) return null;

  const percent =
    contentChapters.length === 0
      ? 0
      : Math.min(
          100,
          Math.round((completedChapters / contentChapters.length) * 100),
        );

  return {
    levelSlug: latestStarted.slug,
    levelLabel: latestStarted.level,
    chapterSlug: chapter.slug,
    chapterLabel: chapter.label,
    href: `/learn/${latestStarted.slug}/${chapter.slug}`,
    currentChapterIndex: resumeIndex,
    totalChapters: contentChapters.length,
    completedChapters,
    percent,
  };
}

/** Local progress for one signed-in user. Never the shared legacy key. */
export function progressStorageKey(userId: string): string {
  return `${STORAGE_KEY}:${encodeURIComponent(userId)}`;
}

/**
 * A sign-in newer than this does not merge the device cache into the cloud.
 * The previous account's browser cache must not be uploaded as this account.
 */
export const FRESH_SIGN_IN_MS = 15 * 60 * 1000;

/** Cloud wins for a new sign-in. An older session may merge its own device cache. */
export function shouldReplaceLocalWithCloud(
  authAtSeconds: number | undefined,
  nowMs = Date.now(),
): boolean {
  if (typeof authAtSeconds !== "number" || !Number.isFinite(authAtSeconds)) {
    return true;
  }
  return nowMs - authAtSeconds * 1000 < FRESH_SIGN_IN_MS;
}

export const SIGN_IN_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
export const SIGN_IN_KEEP_COUNT = 120;

/** Set before Google sign-in and before each progress sync, then read on the server. */
export const SIGN_IN_DEVICE_COOKIE = "nanu-signin-device";

export type SignInDevice = "mobile" | "tablet" | "desktop";

export type SignInRecord = {
  at: string;
  device: SignInDevice | null;
  browser: string | null;
  location: string | null;
};

export type SignInContext = {
  device: SignInDevice | null;
  browser: string | null;
  location: string | null;
};

const SIGN_IN_DEVICES = new Set<SignInDevice>(["mobile", "tablet", "desktop"]);

export function signInDeviceLabel(device: SignInDevice): string {
  if (device === "mobile") return "Mobile";
  if (device === "tablet") return "Tablet";
  return "Desktop";
}

/** One line for the admin sign-in list. Null when this login predates the extra fields. */
export function signInSummary(entry: SignInRecord): string | null {
  const parts = [
    entry.device ? signInDeviceLabel(entry.device) : null,
    entry.browser,
    entry.location,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function signInDeviceCookie(device: SignInDevice, secure = false): string {
  const base = `${SIGN_IN_DEVICE_COOKIE}=${device}; Path=/; Max-Age=600; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

export function parseSignInDevice(value: string | null | undefined): SignInDevice | null {
  const device = value?.trim().toLowerCase();
  if (device === "mobile" || device === "tablet" || device === "desktop") return device;
  return null;
}

/**
 * Phone, tablet, or desktop from the browser that started sign-in.
 * iPadOS reports a desktop User-Agent, so a touch-point count from the
 * account page is what marks that iPad as a tablet.
 */
export function classifySignInDevice(input: {
  userAgent?: string | null;
  maxTouchPoints?: number | null;
  mobileClientHint?: boolean | null;
}): SignInDevice | null {
  const ua = input.userAgent?.trim() ?? "";
  const touch = input.maxTouchPoints ?? 0;
  if (!ua && input.mobileClientHint == null && touch <= 1) return null;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (touch > 1 && /Macintosh/i.test(ua)) return "tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (input.mobileClientHint === true) return "mobile";
  if (/Mobi|iPhone|iPod|Windows Phone|BlackBerry/i.test(ua)) return "mobile";
  if (/Android/i.test(ua)) return "mobile";
  if (!ua) return input.mobileClientHint === false ? "desktop" : null;
  return "desktop";
}

/** A short browser name. Empty when the User-Agent is missing. */
export function browserFromUserAgent(userAgent: string | null | undefined): string | null {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return null;
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/CriOS\/|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

export function deviceFromCookieHeader(cookieHeader: string | null | undefined): SignInDevice | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SIGN_IN_DEVICE_COOKIE) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return parseSignInDevice(decodeURIComponent(raw));
    } catch {
      return parseSignInDevice(raw);
    }
  }
  return null;
}

type HeaderReader = { get(name: string): string | null };

function cleanSignInText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  let text = value.trim();
  try {
    text = decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    text = value.trim();
  }
  text = text.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

/** City and country from the hosting platform's request headers. Not a street address. */
export function locationFromHeaders(headerList: HeaderReader): string | null {
  const city = cleanSignInText(headerList.get("x-vercel-ip-city"), 60);
  const country = cleanSignInText(headerList.get("x-vercel-ip-country"), 2)?.toUpperCase() ?? null;
  const countryCode = country && /^[A-Z]{2}$/.test(country) ? country : null;
  if (city && countryCode) return `${city}, ${countryCode}`;
  if (city) return city;
  return countryCode;
}

export function signInContextFromHeaders(headerList: HeaderReader): SignInContext {
  const userAgent = headerList.get("user-agent");
  const hinted = deviceFromCookieHeader(headerList.get("cookie"));
  const mobileHint = headerList.get("sec-ch-ua-mobile");
  const mobileClientHint = mobileHint === "?1" ? true : mobileHint === "?0" ? false : null;
  return {
    device:
      hinted ??
      classifySignInDevice({
        userAgent,
        mobileClientHint,
      }),
    browser: browserFromUserAgent(userAgent),
    location: locationFromHeaders(headerList),
  };
}

function signInInstant(value: string, cutoff: number): string | null {
  const time = Date.parse(value);
  if (Number.isNaN(time) || time < cutoff) return null;
  return new Date(time).toISOString();
}

function signInRecordFromUnknown(value: unknown, cutoff: number): SignInRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== "string") return null;
  const at = signInInstant(row.at, cutoff);
  if (!at) return null;
  const device =
    typeof row.device === "string" && SIGN_IN_DEVICES.has(row.device as SignInDevice)
      ? (row.device as SignInDevice)
      : null;
  const browser = cleanSignInText(typeof row.browser === "string" ? row.browser : null, 40);
  const location = cleanSignInText(typeof row.location === "string" ? row.location : null, 80);
  return { at, device, browser, location };
}

function signInStamps(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return [];
  const inner =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  if (!inner) return [];
  return inner.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

/**
 * Google sign-ins from the last 90 days, oldest first.
 * Timestamp-only rows stay in the list with empty device, browser, and location.
 * A structured row with the same instant replaces that placeholder.
 */
export function readSignInRecords(
  log: unknown,
  stamps: unknown,
  now = Date.now(),
): SignInRecord[] {
  const cutoff = now - SIGN_IN_KEEP_MS;
  const byAt = new Map<string, SignInRecord>();
  for (const stamp of signInStamps(stamps)) {
    const at = signInInstant(stamp, cutoff);
    if (!at || byAt.has(at)) continue;
    byAt.set(at, { at, device: null, browser: null, location: null });
  }
  const entries = Array.isArray(log) ? log : [];
  for (const item of entries) {
    const record = signInRecordFromUnknown(item, cutoff);
    if (record) byAt.set(record.at, record);
  }
  return [...byAt.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-SIGN_IN_KEEP_COUNT);
}

export function trimSignInStamps(values: readonly string[], now = Date.now()): string[] {
  return readSignInRecords(null, values, now).map((entry) => entry.at);
}

/** Structured log only. Older timestamp-only sign-ins stay on `sign_ins`. */
export function nextSignInLog(
  existing: unknown,
  entry: SignInRecord,
  now = Date.now(),
): SignInRecord[] {
  const prior = Array.isArray(existing) ? existing : [];
  return readSignInRecords([...prior, entry], [], now);
}

export type AppUseRecord = SignInRecord & {
  /** Last time this visit was still open. A later request inside the idle gap updates this. */
  seenAt: string;
};

/** One row per visit. Refresh `seenAt` while they keep using the app, instead of adding a row. */
export const APP_USE_REFRESH_MS = 5 * 60 * 1000;
export const APP_USE_KEEP_COUNT = 300;

function appUseFromUnknown(value: unknown, cutoff: number): AppUseRecord | null {
  const base = signInRecordFromUnknown(value, cutoff);
  if (!base || !value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).seenAt;
  const seenAt = typeof raw === "string" ? signInInstant(raw, 0) : null;
  return { ...base, seenAt: seenAt ?? base.at };
}

function sameAppUseContext(a: SignInRecord, b: SignInRecord): boolean {
  return a.device === b.device && a.browser === b.browser && a.location === b.location;
}

/** App opens from the last 90 days, oldest first. Not Google sign-ins. */
export function readAppUseRecords(log: unknown, now = Date.now()): AppUseRecord[] {
  const cutoff = now - SIGN_IN_KEEP_MS;
  if (!Array.isArray(log)) return [];
  const records: AppUseRecord[] = [];
  for (const item of log) {
    const record = appUseFromUnknown(item, cutoff);
    if (record) records.push(record);
  }
  return records.sort((a, b) => a.at.localeCompare(b.at)).slice(-APP_USE_KEEP_COUNT);
}

/**
 * Continue the latest visit when the device, browser, and city match and they
 * were here within the last 15 minutes. Otherwise start a new visit.
 */
export function nextAppUseLog(
  existing: unknown,
  entry: SignInRecord,
  now = Date.now(),
): { records: AppUseRecord[]; changed: boolean } {
  const records = readAppUseRecords(existing, now);
  const incoming: AppUseRecord = { ...entry, seenAt: entry.at };
  const last = records[records.length - 1];
  if (last && sameAppUseContext(last, incoming)) {
    const seenMs = Date.parse(last.seenAt);
    if (!Number.isNaN(seenMs) && now - seenMs < VISIT_IDLE_MS) {
      if (now - seenMs < APP_USE_REFRESH_MS) return { records, changed: false };
      const refreshed = records.slice(0, -1);
      refreshed.push({ ...last, seenAt: incoming.at });
      return { records: refreshed, changed: true };
    }
  }
  return {
    records: [...records, incoming].slice(-APP_USE_KEEP_COUNT),
    changed: true,
  };
}

/** Chapter completion timestamps. A copied account keeps the original stamps. */
export function completedChapterStamps(progress: StoredProgress): string[] {
  const stamps: string[] = [];
  for (const [slug, entry] of Object.entries(progress.learn)) {
    if (!entry) continue;
    if (entry.completedAt) stamps.push(`learn:${slug}:${entry.completedAt}`);
    if (entry.studyCompletedAt) stamps.push(`study:${slug}:${entry.studyCompletedAt}`);
  }
  stamps.sort();
  return stamps;
}

/** True when `incoming` still contains every completion stamp from `other`. */
export function containsAccountStamps(
  incoming: StoredProgress,
  other: StoredProgress,
): boolean {
  const source = completedChapterStamps(other);
  if (source.length === 0) return false;
  const stamps = new Set(completedChapterStamps(incoming));
  return source.every((stamp) => stamps.has(stamp));
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function removeKeys(storage: Storage, keys: readonly string[]): void {
  for (const key of keys) storage.removeItem(key);
}

function removeLegacyBerufKeys(storage: Storage): void {
  removeKeys(
    storage,
    storageKeys(storage).filter((key) => key.startsWith(LEGACY_PROGRESS_PREFIX)),
  );
}

/**
 * Read progress stored for `userId` only.
 * The old shared key is deleted and never copied, so the next account on this
 * browser cannot inherit it. Cloud sync restores a returning account.
 */
export function bindStoredProgress(
  storage: Storage,
  userId: string,
): StoredProgress {
  const scopedRaw = storage.getItem(progressStorageKey(userId));
  if (storage.getItem(STORAGE_KEY) != null) storage.removeItem(STORAGE_KEY);
  removeLegacyBerufKeys(storage);
  return parseProgress(scopedRaw);
}

/** Remove every locally cached progress key, including per-user and legacy ones. */
export function clearStoredProgress(storage: Storage): void {
  removeKeys(
    storage,
    storageKeys(storage).filter(
      (key) =>
        key === STORAGE_KEY ||
        key.startsWith(`${STORAGE_KEY}:`) ||
        key.startsWith(LEGACY_PROGRESS_PREFIX),
    ),
  );
}

/** Pull legacy per-beruf keys into the unified store once. */
export function migrateLegacyProgress(
  progress: StoredProgress,
  readItem: (key: string) => string | null,
  removeItem: (key: string) => void,
): StoredProgress {
  if (typeof window === "undefined") return progress;

  let next = progress;
  const keysToRemove: string[] = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(LEGACY_PROGRESS_PREFIX)) continue;
    const slug = key.slice(LEGACY_PROGRESS_PREFIX.length);
    if (!slug) continue;
    try {
      const raw = readItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const ids = parsed.filter((id): id is string => typeof id === "string");
      if (ids.length === 0) {
        keysToRemove.push(key);
        continue;
      }
      const existing = next.interview[slug] ?? {
        currentClipIndex: 0,
        completedClipIds: [],
      };
      next = {
        ...next,
        interview: {
          ...next.interview,
          [slug]: {
            currentClipIndex: Math.max(
              existing.currentClipIndex,
              ids.length,
            ),
            completedClipIds: Array.from(
              new Set([...existing.completedClipIds, ...ids]),
            ),
          },
        },
      };
      keysToRemove.push(key);
    } catch {
      // ignore corrupt legacy entries
    }
  }

  for (const key of keysToRemove) {
    removeItem(key);
  }

  return next;
}
