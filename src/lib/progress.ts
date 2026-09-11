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
};

export type StoredProgress = {
  interview: Record<string, InterviewProgress>;
  learn: Record<string, LearnProgress>;
  /** Day streak for header display; defaults when unset. */
  streakDays: number;
  /** ISO date (YYYY-MM-DD) of last practice day, for streak updates. */
  lastPracticeDate?: string;
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

export const DEFAULT_PROGRESS: StoredProgress = {
  interview: {
    [CONTINUE_BERUF_SLUG]: {
      currentClipIndex: 0,
      completedClipIds: [],
    },
  },
  learn: {},
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
  };

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

  return {
    interview,
    learn,
    streakDays:
      typeof parsed?.streakDays === "number" && parsed.streakDays >= 0
        ? parsed.streakDays
        : DEFAULT_PROGRESS.streakDays,
    lastPracticeDate:
      typeof parsed?.lastPracticeDate === "string"
        ? parsed.lastPracticeDate
        : undefined,
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
  return {
    ...mergedBase,
    runCount: Math.max(left?.runCount ?? 0, right?.runCount ?? 0),
    runCompletedClipIds,
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

/** Merge two progress snapshots — union of completions, keep farthest index. */
export function mergeProgress(
  a: StoredProgress,
  b: StoredProgress,
): StoredProgress {
  const interview = mergeTrack(a.interview, b.interview);
  const learn = mergeLearnTrack(a.learn, b.learn);

  const aDate = a.lastPracticeDate ?? "";
  const bDate = b.lastPracticeDate ?? "";
  const lastPracticeDate =
    aDate >= bDate ? a.lastPracticeDate : b.lastPracticeDate;

  return {
    interview,
    learn,
    streakDays: Math.max(a.streakDays, b.streakDays),
    lastPracticeDate,
  };
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Days the learner still has credit for. A stored streak only counts if they
 * practiced today or yesterday (UTC, same clock as `bumpStreak`).
 */
export function activeStreakDays(
  progress: StoredProgress,
  now = new Date(),
): number {
  if (progress.streakDays <= 0) return 0;
  const last = progress.lastPracticeDate;
  if (!last) return progress.streakDays;

  const today = todayIsoDate(now);
  if (last === today) return progress.streakDays;

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return last === todayIsoDate(yesterday) ? progress.streakDays : 0;
}

export function bumpStreak(progress: StoredProgress, now = new Date()): StoredProgress {
  const today = todayIsoDate(now);
  if (progress.lastPracticeDate === today) {
    return progress;
  }

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = todayIsoDate(yesterday);
  const streakDays =
    progress.lastPracticeDate === yesterdayIso ? progress.streakDays + 1 : 1;

  return {
    ...progress,
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
  const entry = progress.learn[chapterSlug] ?? {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: 0,
    runCompletedClipIds: [],
  };
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
  const entry = progress.learn[chapterSlug] ?? {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: 0,
    runCompletedClipIds: [],
  };
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
): StoredProgress {
  const entry = progress.learn[chapterSlug] ?? {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: 0,
    runCompletedClipIds: [],
  };

  return {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        ...entry,
        runCount: entry.runCount + 1,
      },
    },
  };
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
  const completedAt = progress.learn[chapterSlug]?.completedAt;
  const completedClipIds = progress.learn[chapterSlug]?.completedClipIds ?? [];
  const runCount = progress.learn[chapterSlug]?.runCount ?? 0;
  const next: StoredProgress = {
    ...progress,
    learn: {
      ...progress.learn,
      [chapterSlug]: {
        currentClipIndex: 0,
        completedClipIds,
        runCompletedClipIds: [],
        runCount,
        ...(completedAt ? { completedAt } : {}),
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
