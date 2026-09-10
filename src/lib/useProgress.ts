"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "nanu-horen-progress";

/** Only real interview content available in MVP. */
export const CONTINUE_BERUF_SLUG = "restaurantfachkraft";

export type InterviewProgress = {
  /** 0-based index of the next clip to practice. */
  currentClipIndex: number;
  /** Clip ids already completed in this profession session track. */
  completedClipIds: string[];
};

export type StoredProgress = {
  interview: Record<string, InterviewProgress>;
  /** Day streak for header display; defaults when unset. */
  streakDays: number;
};

export type ContinueLearning = {
  berufSlug: typeof CONTINUE_BERUF_SLUG;
  href: `/interview/${typeof CONTINUE_BERUF_SLUG}`;
  currentClipIndex: number;
  completedCount: number;
  totalClips: number;
  percent: number;
};

const DEFAULT_PROGRESS: StoredProgress = {
  interview: {
    [CONTINUE_BERUF_SLUG]: {
      currentClipIndex: 0,
      completedClipIds: [],
    },
  },
  streakDays: 0,
};

function isInterviewProgress(value: unknown): value is InterviewProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.currentClipIndex === "number" &&
    Array.isArray(record.completedClipIds)
  );
}

function parseProgress(raw: string | null): StoredProgress {
  if (!raw) return DEFAULT_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    const interview: Record<string, InterviewProgress> = {
      ...DEFAULT_PROGRESS.interview,
    };
    if (parsed.interview && typeof parsed.interview === "object") {
      for (const [slug, entry] of Object.entries(parsed.interview)) {
        if (isInterviewProgress(entry)) {
          interview[slug] = {
            currentClipIndex: Math.max(0, entry.currentClipIndex),
            completedClipIds: entry.completedClipIds.filter(
              (id): id is string => typeof id === "string",
            ),
          };
        }
      }
    }
    return {
      interview,
      streakDays:
        typeof parsed.streakDays === "number" && parsed.streakDays >= 0
          ? parsed.streakDays
          : DEFAULT_PROGRESS.streakDays,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function readProgressSnapshot(): StoredProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  return parseProgress(window.localStorage.getItem(STORAGE_KEY));
}

function subscribeProgress(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("nanu-horen-progress", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("nanu-horen-progress", onStoreChange);
  };
}

function writeProgress(progress: StoredProgress): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

function toContinueLearning(
  progress: StoredProgress,
  totalClips: number,
): ContinueLearning {
  const entry =
    progress.interview[CONTINUE_BERUF_SLUG] ??
    DEFAULT_PROGRESS.interview[CONTINUE_BERUF_SLUG]!;
  const safeTotal = Math.max(0, totalClips);
  const completedCount = entry.completedClipIds.length;
  const percent =
    safeTotal === 0
      ? 0
      : Math.min(100, Math.round((completedCount / safeTotal) * 100));

  return {
    berufSlug: CONTINUE_BERUF_SLUG,
    href: `/interview/${CONTINUE_BERUF_SLUG}`,
    currentClipIndex: entry.currentClipIndex,
    completedCount,
    totalClips: safeTotal,
    percent,
  };
}

/**
 * localStorage-backed learning progress. Continue-learning always targets
 * Restaurantfachkraft — the only profession with real content today.
 */
export function useProgress(totalClips: number) {
  const progress = useSyncExternalStore(
    subscribeProgress,
    readProgressSnapshot,
    () => DEFAULT_PROGRESS,
  );

  const persist = useCallback((next: StoredProgress) => {
    writeProgress(next);
  }, []);

  const continueLearning = toContinueLearning(progress, totalClips);

  return {
    progress,
    continueLearning,
    streakDays: progress.streakDays,
    setStreakDays: (streakDays: number) => {
      persist({ ...progress, streakDays });
    },
  };
}
