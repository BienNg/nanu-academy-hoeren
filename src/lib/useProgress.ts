"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  CONTINUE_BERUF_SLUG,
  DEFAULT_PROGRESS,
  activeStreakDays,
  STORAGE_KEY,
  clearStoredProgress,
  incrementLearnRunCount,
  incrementStudyRunCount,
  isLearnChapterCompleted,
  isStudyChapterCompleted,
  learnStudyRunCount,
  learnReviewedClipIds,
  learnRunCompletedClipIds,
  learnRunCount,
  markClipCompleted,
  markLearnChapterCompleted,
  markLearnClipCompleted,
  markLearnClipReviewed,
  resetBerufProgress,
  resetLearnProgress,
  resetLearnStudyProgress,
  mergeProgress,
  migrateLegacyProgress,
  normalizeProgress,
  parseProgress,
  saveLessonVideoPosition,
  setLessonVideoWatched,
  toBerufProgress,
  toContinueLearning,
  toContinueLevelLearning,
  type BerufProgressSummary,
  type ContinueLevelCatalogEntry,
  type LessonVideoProgress,
  type StoredProgress,
} from "@/lib/progress";

/** Cached so useSyncExternalStore gets a stable reference when data is unchanged. */
let cachedSnapshot: StoredProgress = DEFAULT_PROGRESS;
let cachedSerialized = JSON.stringify(DEFAULT_PROGRESS);

function readProgressSnapshot(): StoredProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  const progress = parseProgress(window.localStorage.getItem(STORAGE_KEY));
  const serialized = JSON.stringify(progress);
  if (serialized === cachedSerialized) {
    return cachedSnapshot;
  }
  cachedSerialized = serialized;
  cachedSnapshot = progress;
  return cachedSnapshot;
}

function runLegacyMigrationOnce(): void {
  if (typeof window === "undefined") return;
  const before = readProgressSnapshot();
  const migrated = migrateLegacyProgress(
    before,
    (key) => window.localStorage.getItem(key),
    (key) => window.localStorage.removeItem(key),
  );
  if (JSON.stringify(migrated) !== JSON.stringify(before)) {
    writeProgress(migrated);
  }
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
  const serialized = JSON.stringify(progress);
  cachedSerialized = serialized;
  cachedSnapshot = progress;
  window.localStorage.setItem(STORAGE_KEY, serialized);
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

let revocationHandled = false;

/** An admin deleted this account: drop on-device progress and sign out. */
function handleRevokedAccount(): void {
  if (revocationHandled || typeof window === "undefined") return;
  revocationHandled = true;

  clearStoredProgress(window.localStorage);
  cachedSnapshot = DEFAULT_PROGRESS;
  cachedSerialized = JSON.stringify(DEFAULT_PROGRESS);
  window.dispatchEvent(new Event("nanu-horen-progress"));
  void signOut({ callbackUrl: "/account" });
}

async function pushCloudProgress(progress: StoredProgress): Promise<void> {
  try {
    const response = await fetch("/api/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
    if (response.status === 410) {
      handleRevokedAccount();
    }
  } catch (error) {
    console.error("Failed to sync progress to cloud", error);
  }
}

async function pullAndMergeCloudProgress(
  local: StoredProgress,
): Promise<StoredProgress> {
  try {
    const response = await fetch("/api/progress");
    if (response.status === 410) {
      handleRevokedAccount();
      return DEFAULT_PROGRESS;
    }
    if (response.status === 401) return local;
    if (!response.ok) return local;
    const data = (await response.json()) as {
      progress?: unknown;
      configured?: boolean;
    };
    if (data.configured === false || data.progress == null) {
      return local;
    }
    const remote = normalizeProgress(
      data.progress as Partial<StoredProgress> | null,
    );
    const merged = mergeProgress(local, remote);
    writeProgress(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      await pushCloudProgress(merged);
    }
    return merged;
  } catch (error) {
    console.error("Failed to load cloud progress", error);
    return local;
  }
}

function getServerSnapshot(): StoredProgress {
  return DEFAULT_PROGRESS;
}

const EMPTY_TOTALS: Record<string, number> = {};
const EMPTY_LEVEL_CATALOG: ContinueLevelCatalogEntry[] = [];

/**
 * Unified localStorage + cloud-synced learning progress (requires login).
 * Pass `totalsBySlug` so continue-learning and per-beruf cards get correct totals.
 */
export function useProgress(
  totalsBySlug: Record<string, number> = EMPTY_TOTALS,
  levelCatalog: readonly ContinueLevelCatalogEntry[] = EMPTY_LEVEL_CATALOG,
) {
  const { status } = useSession();
  const progress = useSyncExternalStore(
    subscribeProgress,
    readProgressSnapshot,
    getServerSnapshot,
  );
  const syncStarted = useRef(false);
  const migrated = useRef(false);

  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    runLegacyMigrationOnce();
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || syncStarted.current) return;
    syncStarted.current = true;
    void pullAndMergeCloudProgress(readProgressSnapshot());
  }, [status]);

  const persist = useCallback(
    (next: StoredProgress, syncCloud: boolean) => {
      writeProgress(next);
      if (syncCloud && status === "authenticated") {
        void pushCloudProgress(next);
      }
    },
    [status],
  );

  const cloudSyncTimer = useRef<number | null>(null);

  const flushCloudSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (cloudSyncTimer.current !== null) {
      window.clearTimeout(cloudSyncTimer.current);
      cloudSyncTimer.current = null;
    }
    if (status === "authenticated") {
      void pushCloudProgress(readProgressSnapshot());
    }
  }, [status]);

  const queueCloudSync = useCallback(() => {
    if (typeof window === "undefined" || status !== "authenticated") return;
    if (cloudSyncTimer.current !== null) {
      window.clearTimeout(cloudSyncTimer.current);
    }
    cloudSyncTimer.current = window.setTimeout(() => {
      cloudSyncTimer.current = null;
      void pushCloudProgress(readProgressSnapshot());
    }, 1200);
  }, [status]);

  useEffect(() => {
    const flushIfPending = () => {
      if (cloudSyncTimer.current === null) return;
      window.clearTimeout(cloudSyncTimer.current);
      cloudSyncTimer.current = null;
      void pushCloudProgress(readProgressSnapshot());
    };
    window.addEventListener("pagehide", flushIfPending);
    return () => {
      window.removeEventListener("pagehide", flushIfPending);
      flushIfPending();
    };
  }, []);

  const markClipDone = useCallback(
    (berufSlug: string, clipId: string) => {
      const next = markClipCompleted(readProgressSnapshot(), berufSlug, clipId);
      persist(next, true);
    },
    [persist],
  );

  const markLearnClipDone = useCallback(
    (chapterSlug: string, clipId: string) => {
      const next = markLearnClipCompleted(readProgressSnapshot(), chapterSlug, clipId);
      persist(next, true);
    },
    [persist],
  );

  const markLearnChapterDone = useCallback(
    (chapterSlug: string) => {
      const current = readProgressSnapshot();
      const next = markLearnChapterCompleted(current, chapterSlug);
      if (next === current) return;
      persist(next, true);
    },
    [persist],
  );

  const incrementLearnRunDoneCount = useCallback(
    (chapterSlug: string) => {
      const next = incrementLearnRunCount(readProgressSnapshot(), chapterSlug);
      persist(next, true);
    },
    [persist],
  );

  const incrementStudyRunDoneCount = useCallback(
    (chapterSlug: string) => {
      const next = incrementStudyRunCount(readProgressSnapshot(), chapterSlug);
      persist(next, true);
    },
    [persist],
  );

  const resetProgress = useCallback(
    (berufSlug: string) => {
      const next = resetBerufProgress(readProgressSnapshot(), berufSlug);
      persist(next, true);
    },
    [persist],
  );

  const resetLearnProgressFn = useCallback(
    (chapterSlug: string) => {
      const next = resetLearnProgress(readProgressSnapshot(), chapterSlug);
      persist(next, true);
    },
    [persist],
  );

  const markLearnClipReviewedFn = useCallback(
    (chapterSlug: string, clipId: string) => {
      const next = markLearnClipReviewed(readProgressSnapshot(), chapterSlug, clipId);
      persist(next, true);
    },
    [persist],
  );

  const resetLearnStudyProgressFn = useCallback(
    (chapterSlug: string) => {
      const next = resetLearnStudyProgress(readProgressSnapshot(), chapterSlug);
      persist(next, true);
    },
    [persist],
  );

  const saveVideoPosition = useCallback(
    (key: string, positionSeconds: number, force = false) => {
      const current = readProgressSnapshot();
      const next = saveLessonVideoPosition(current, key, positionSeconds, {
        force,
      });
      if (next === current) return;
      persist(next, false);
      queueCloudSync();
    },
    [persist, queueCloudSync],
  );

  const setVideoWatched = useCallback(
    (key: string, watched: boolean) => {
      const next = setLessonVideoWatched(readProgressSnapshot(), key, watched);
      persist(next, false);
      flushCloudSync();
    },
    [persist, flushCloudSync],
  );

  const continueLearning = toContinueLearning(progress, totalsBySlug);
  const continueLevel = toContinueLevelLearning(progress, levelCatalog);

  const progressFor = useCallback(
    (berufSlug: string): BerufProgressSummary =>
      toBerufProgress(progress, berufSlug, totalsBySlug[berufSlug] ?? 0),
    [progress, totalsBySlug],
  );

  return {
    progress,
    continueLearning,
    continueLevel,
    progressFor,
    streakDays: activeStreakDays(progress),
    markClipDone,
    markLearnClipDone,
    markLearnChapterDone,
    resetProgress,
    resetLearnProgress: resetLearnProgressFn,
    setStreakDays: (streakDays: number) => {
      persist({ ...progress, streakDays }, true);
    },
    completedClipIdsFor: (berufSlug: string) =>
      progress.interview[berufSlug]?.completedClipIds ?? [],
    completedLearnClipIdsFor: (chapterSlug: string) =>
      progress.learn[chapterSlug]?.completedClipIds ?? [],
    completedLearnRunClipIdsFor: (chapterSlug: string) =>
      learnRunCompletedClipIds(progress, chapterSlug),
    learnRunCountFor: (chapterSlug: string) => learnRunCount(progress, chapterSlug),
    learnStudyRunCountFor: (chapterSlug: string) =>
      learnStudyRunCount(progress, chapterSlug),
    learnChapterCompleted: (chapterSlug: string) =>
      isLearnChapterCompleted(progress, chapterSlug),
    learnStudyCompleted: (chapterSlug: string) =>
      isStudyChapterCompleted(progress, chapterSlug),
    incrementLearnRunDoneCount,
    incrementStudyRunDoneCount,
    markLearnClipReviewed: markLearnClipReviewedFn,
    resetLearnStudyProgress: resetLearnStudyProgressFn,
    reviewedLearnClipIdsFor: (chapterSlug: string) =>
      learnReviewedClipIds(progress, chapterSlug),
    lessonVideoProgressFor: (key: string): LessonVideoProgress | undefined =>
      progress.videos[key],
    saveVideoPosition,
    setVideoWatched,
  };
}

export { CONTINUE_BERUF_SLUG };
