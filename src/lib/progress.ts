/** Shared progress model — localStorage + cloud sync. */

export const STORAGE_KEY = "nanu-horen-progress";
export const LEGACY_PROGRESS_PREFIX = "nanu-progress-";

/** Fallback continue target when no totals / progress are available. */
export const CONTINUE_BERUF_SLUG = "restaurantfachkraft";

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
   * Clip ids completed in the current/last run.
   * Used to resume an unfinished rerun and surface "started" progress.
   */
  runCompletedClipIds: string[];
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

/** Finished runs on one UTC day. The admin dashboard sums these for "today". */
export type DayActivity = {
  studyRuns: number;
  practiceRuns: number;
};

export type StoredProgress = {
  interview: Record<string, InterviewProgress>;
  learn: Record<string, LearnProgress>;
  /** Resume point and watched state, keyed by level/chapter/youtube id. */
  videos: Record<string, LessonVideoProgress>;
  /** Consecutive practice days ending on `lastPracticeDate`. */
  streakDays: number;
  /** ISO date (YYYY-MM-DD, UTC) of last practice day, for streak updates. */
  lastPracticeDate?: string;
  /** UTC calendar days the learner practiced. The streak is derived from this. */
  practiceDates?: string[];
  /** Runs finished per UTC day (`YYYY-MM-DD`). Older days are dropped on save. */
  activity?: Record<string, DayActivity>;
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
    reviewedClipIds?: unknown;
    studyRunCount?: unknown;
    studyCompletedAt?: unknown;
  };

  const studyCompletedAt =
    typeof record.studyCompletedAt === "string" ? record.studyCompletedAt : undefined;

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
      : normalized.completedClipIds,
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

export function normalizeProgress(
  parsed: Partial<StoredProgress> | null | undefined,
): StoredProgress {
  const interview = normalizeTrack(parsed?.interview, DEFAULT_PROGRESS.interview);
  const learn = normalizeLearnTrack(parsed?.learn);
  const videos = normalizeVideos(parsed?.videos);
  const activity = normalizeActivity(parsed?.activity);

  return {
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
    ...(activity ? { activity } : {}),
  };
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

function mergeLearnEntry(
  left: LearnProgress | undefined,
  right: LearnProgress | undefined,
): LearnProgress {
  const mergedBase = mergeEntry(left, right);
  const runCompletedClipIds = Array.from(
    new Set([
      ...(left?.runCompletedClipIds ?? []),
      ...(right?.runCompletedClipIds ?? []),
    ]),
  );
  const reviewedClipIds = Array.from(
    new Set([
      ...(left?.reviewedClipIds ?? []),
      ...(right?.reviewedClipIds ?? []),
    ]),
  );
  const studyStamps = [left?.studyCompletedAt, right?.studyCompletedAt].filter(
    (value): value is string => typeof value === "string",
  );
  return {
    ...mergedBase,
    runCount: Math.max(left?.runCount ?? 0, right?.runCount ?? 0),
    runCompletedClipIds,
    reviewedClipIds,
    studyRunCount: Math.max(left?.studyRunCount ?? 0, right?.studyRunCount ?? 0),
    ...(studyStamps.length > 0
      ? { studyCompletedAt: studyStamps.sort()[0] }
      : {}),
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

  const activity = mergeActivity(a.activity, b.activity);

  return {
    interview,
    learn,
    videos,
    streakDays: lastPracticeDate
      ? streakEndingOn(new Set(practiceDates), lastPracticeDate)
      : 0,
    ...(lastPracticeDate ? { lastPracticeDate } : {}),
    ...(practiceDates.length ? { practiceDates } : {}),
    ...(activity ? { activity } : {}),
  };
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
    positionSeconds: current?.positionSeconds ?? 0,
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

function isoDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
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
    const studyRuns = countField(record.studyRuns);
    const practiceRuns = countField(record.practiceRuns);
    if (studyRuns === 0 && practiceRuns === 0) continue;
    activity[day] = { studyRuns, practiceRuns };
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
    const studyRuns = Math.max(left?.[day]?.studyRuns ?? 0, right?.[day]?.studyRuns ?? 0);
    const practiceRuns = Math.max(
      left?.[day]?.practiceRuns ?? 0,
      right?.[day]?.practiceRuns ?? 0,
    );
    if (studyRuns === 0 && practiceRuns === 0) continue;
    merged[day] = { studyRuns, practiceRuns };
  }
  return normalizeActivity(merged);
}

function dateFromStamp(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function recordDayRun(
  progress: StoredProgress,
  field: keyof DayActivity,
  now: Date,
): StoredProgress {
  const day = todayIsoDate(now);
  const current = progress.activity?.[day];
  const nextDay: DayActivity = {
    studyRuns: current?.studyRuns ?? 0,
    practiceRuns: current?.practiceRuns ?? 0,
  };
  nextDay[field] += 1;
  return {
    ...progress,
    activity: {
      ...progress.activity,
      [day]: nextDay,
    },
  };
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

/** UTC days this snapshot records as practice, including activity timestamps. */
export function collectPracticeDates(progress: StoredProgress): string[] {
  const dates = new Set<string>();
  const add = (value: string | undefined) => {
    const day = isoDay(value);
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
  const recorded = practiceDatesFrom(progress.practiceDates);
  return new Set(recorded.length > 0 ? recorded : collectPracticeDates(progress));
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

/**
 * Days the learner still has credit for. The run counts only when they
 * practiced today or yesterday (UTC).
 */
export function activeStreakDays(
  progress: StoredProgress,
  now = new Date(),
): number {
  const dates = datesForStreak(progress);
  const today = todayIsoDate(now);
  if (dates.has(today)) return streakEndingOn(dates, today);

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = todayIsoDate(yesterday);
  return dates.has(yesterdayIso) ? streakEndingOn(dates, yesterdayIso) : 0;
}

export function bumpStreak(progress: StoredProgress, now = new Date()): StoredProgress {
  const today = todayIsoDate(now);
  const dates = datesForStreak(progress);
  dates.add(today);
  const practiceDates = [...dates].sort();
  const streakDays = streakEndingOn(dates, today);
  if (
    progress.lastPracticeDate === today &&
    progress.streakDays === streakDays &&
    samePracticeDates(progress.practiceDates, practiceDates)
  ) {
    return progress;
  }

  return {
    ...progress,
    practiceDates,
    streakDays,
    lastPracticeDate: today,
  };
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

  return recordDayRun(
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
    dateFromStamp(completedAt),
  );
}

export function markLearnClipReviewed(
  progress: StoredProgress,
  chapterSlug: string,
  clipId: string,
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? emptyLearnProgress();
  if (entry.reviewedClipIds.includes(clipId)) {
    return progress;
  }

  const next: StoredProgress = {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        ...entry,
        reviewedClipIds: [...entry.reviewedClipIds, clipId],
      },
    },
  };

  return bumpStreak(next);
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

/** Remove every locally cached progress key, including legacy per-beruf ones. */
export function clearStoredProgress(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);

  const legacyKeys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(LEGACY_PROGRESS_PREFIX)) {
      legacyKeys.push(key);
    }
  }
  for (const key of legacyKeys) {
    storage.removeItem(key);
  }
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
