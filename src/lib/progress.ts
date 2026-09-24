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

/**
 * Finished work on one UTC day. The admin dashboard reads this for "today".
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
  /** Per UTC day (`YYYY-MM-DD`). Older days are dropped on save. */
  activity?: Record<string, DayActivity>;
  /** Recent app-open periods. Capped at 60 visits or 90 days. */
  visits?: Visit[];
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
  const visits = normalizeVisits(parsed?.visits);

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
      ...(activity ? { activity } : {}),
      ...(visits.length > 0 ? { visits } : {}),
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
  const visits = mergeVisits(a.visits, b.visits);

  return applyVisitRetention(
    {
      interview,
      learn,
      videos,
      streakDays: lastPracticeDate
        ? streakEndingOn(new Set(practiceDates), lastPracticeDate)
        : 0,
      ...(lastPracticeDate ? { lastPracticeDate } : {}),
      ...(practiceDates.length ? { practiceDates } : {}),
      ...(activity ? { activity } : {}),
      ...(visits.length > 0 ? { visits } : {}),
    },
    new Date(),
  );
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
): { progress: StoredProgress; visitId: string } {
  const key = textId(lessonKey);
  if (!key) return { progress, visitId: preferredId || "" };
  const opened = openVisit(progress, now, preferredId);
  const visit = bumpExerciseLesson(opened.visit, key, (lesson) => {
    lesson.completed += 1;
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
