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
  recordVisitClip,
  recordVisitExercise,
  recordVisitListeningRun,
  recordVisitVideo,
  recordVisitWrongAttempt,
  saveLessonVideoPosition,
  setLessonVideoWatched,
  toBerufProgress,
  toContinueLearning,
  toContinueLevelLearning,
  touchVisit,
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

const VISIT_ID_KEY = "nanu-horen-visit-id";
const VISIT_SYNC_MS = 60_000;

let visitTracking = false;
let visitCleanup: (() => void) | null = null;
let lastVisibleTick = 0;
let visitCloudTimer: number | null = null;
let lastCloudSerialized: string | null = null;

function readVisitId(): string | null {
  try {
    return window.sessionStorage.getItem(VISIT_ID_KEY);
  } catch {
    return null;
  }
}

function writeVisitId(id: string): void {
  if (!id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VISIT_ID_KEY, id);
  } catch {
    // Session storage can be blocked. The visit still lives in progress.
  }
}

async function pushCloudProgress(progress: StoredProgress): Promise<void> {
  lastCloudSerialized = JSON.stringify(progress);
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

function queueVisitCloudSync(): void {
  if (typeof window === "undefined" || visitCloudTimer !== null) return;
  visitCloudTimer = window.setTimeout(() => {
    visitCloudTimer = null;
    const snapshot = readProgressSnapshot();
    if (JSON.stringify(snapshot) === lastCloudSerialized) return;
    void pushCloudProgress(snapshot);
  }, VISIT_SYNC_MS);
}

function flushVisitCloudSync(): void {
  if (typeof window === "undefined") return;
  if (visitCloudTimer !== null) {
    window.clearTimeout(visitCloudTimer);
    visitCloudTimer = null;
  }
  const snapshot = readProgressSnapshot();
  if (JSON.stringify(snapshot) === lastCloudSerialized) return;
  void pushCloudProgress(snapshot);
}

function applyVisitResult(
  result: { progress: StoredProgress; visitId: string },
  sync: "now" | "heartbeat" | "local",
): void {
  writeVisitId(result.visitId);
  if (result.progress === readProgressSnapshot()) return;
  writeProgress(result.progress);
  if (sync === "now") void pushCloudProgress(result.progress);
  else if (sync === "heartbeat") queueVisitCloudSync();
}

function endVisibleVisit(): void {
  if (typeof window === "undefined") return;
  if (!readVisitId() && lastVisibleTick === 0) return;
  const nowMs = Date.now();
  const elapsed = lastVisibleTick > 0 ? Math.max(0, (nowMs - lastVisibleTick) / 1000) : 0;
  lastVisibleTick = 0;
  applyVisitResult(
    touchVisit(readProgressSnapshot(), new Date(nowMs), {
      preferredId: readVisitId(),
      visibleSeconds: elapsed,
    }),
    "local",
  );
}

function onVisitTick(): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible") return;
  const nowMs = Date.now();
  const elapsed = lastVisibleTick > 0 ? Math.max(0, (nowMs - lastVisibleTick) / 1000) : 0;
  lastVisibleTick = nowMs;
  applyVisitResult(
    touchVisit(readProgressSnapshot(), new Date(nowMs), {
      preferredId: readVisitId(),
      visibleSeconds: elapsed,
    }),
    "heartbeat",
  );
}

function stopVisitTracking(): void {
  endVisibleVisit();
  flushVisitCloudSync();
  visitCleanup?.();
}

/** Heartbeat while a signed-in learner has the tab visible. Safe to call once. */
export function startVisitTracking(): () => void {
  if (typeof window === "undefined") return () => {};
  if (visitTracking) return () => stopVisitTracking();
  visitTracking = true;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      endVisibleVisit();
      flushVisitCloudSync();
      return;
    }
    lastVisibleTick = Date.now();
    onVisitTick();
  };

  const onPageHide = () => {
    endVisibleVisit();
    flushVisitCloudSync();
  };

  if (document.visibilityState === "visible") {
    lastVisibleTick = Date.now();
    onVisitTick();
  }

  const timer = window.setInterval(onVisitTick, VISIT_SYNC_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  visitCleanup = () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    visitTracking = false;
    visitCleanup = null;
  };
  return () => stopVisitTracking();
}

export function useVisitTracking(): void {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") {
      if (visitTracking) stopVisitTracking();
      return;
    }
    return startVisitTracking();
  }, [status]);
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
    const merged = mergeProgress(readProgressSnapshot(), remote);
    writeProgress(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      await pushCloudProgress(merged);
    } else {
      lastCloudSerialized = JSON.stringify(merged);
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
    const flushCloud = () => {
      if (cloudSyncTimer.current !== null) {
        window.clearTimeout(cloudSyncTimer.current);
        cloudSyncTimer.current = null;
      }
      flushVisitCloudSync();
    };
    const flushIfPending = () => {
      endVisibleVisit();
      flushCloud();
    };
    window.addEventListener("pagehide", flushIfPending);
    return () => {
      window.removeEventListener("pagehide", flushIfPending);
      flushCloud();
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
    (chapterSlug: string, lessonKey?: string) => {
      const now = new Date();
      const counted = incrementLearnRunCount(readProgressSnapshot(), chapterSlug, now);
      const recorded = lessonKey
        ? recordVisitListeningRun(counted, now, readVisitId(), lessonKey)
        : { progress: counted, visitId: readVisitId() ?? "" };
      if (recorded.visitId) writeVisitId(recorded.visitId);
      persist(recorded.progress, true);
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
    (chapterSlug: string, clipId: string, lessonKey?: string) => {
      const now = new Date();
      const current = readProgressSnapshot();
      const reviewed = markLearnClipReviewed(current, chapterSlug, clipId);
      const recorded = recordVisitClip(
        reviewed,
        now,
        readVisitId(),
        lessonKey || chapterSlug,
        clipId,
      );
      writeVisitId(recorded.visitId);
      if (recorded.progress === current) return;
      persist(recorded.progress, true);
    },
    [persist],
  );

  const recordExerciseDone = useCallback(
    (lessonKey: string) => {
      const now = new Date();
      const current = readProgressSnapshot();
      const recorded = recordVisitExercise(current, now, readVisitId(), lessonKey);
      writeVisitId(recorded.visitId);
      if (recorded.progress === current) return;
      persist(recorded.progress, true);
    },
    [persist],
  );

  const recordWrongAttempt = useCallback(() => {
    const now = new Date();
    const current = readProgressSnapshot();
    const recorded = recordVisitWrongAttempt(current, now, readVisitId());
    writeVisitId(recorded.visitId);
    if (recorded.progress === current) return;
    persist(recorded.progress, true);
  }, [persist]);

  const resetLearnStudyProgressFn = useCallback(
    (chapterSlug: string) => {
      const next = resetLearnStudyProgress(readProgressSnapshot(), chapterSlug);
      persist(next, true);
    },
    [persist],
  );

  const saveVideoPosition = useCallback(
    (
      key: string,
      positionSeconds: number,
      force = false,
      playback?: {
        addSeconds?: number;
        title?: string;
        durationSeconds?: number;
        watched?: boolean;
      },
    ) => {
      const current = readProgressSnapshot();
      let next = saveLessonVideoPosition(current, key, positionSeconds, { force });
      const played = playback?.addSeconds ?? 0;
      if (playback && (played > 0 || playback.watched)) {
        const now = new Date();
        const recorded = recordVisitVideo(next, now, readVisitId(), {
          key,
          title: playback.title,
          addSeconds: played,
          leftAtSeconds: positionSeconds,
          durationSeconds: playback.durationSeconds,
          watched: playback.watched,
        });
        writeVisitId(recorded.visitId);
        next = recorded.progress;
      }
      if (next === current) return;
      persist(next, false);
      queueCloudSync();
    },
    [persist, queueCloudSync],
  );

  const setVideoWatched = useCallback(
    (
      key: string,
      watched: boolean,
      meta?: { title?: string; positionSeconds?: number; durationSeconds?: number },
    ) => {
      const current = readProgressSnapshot();
      let next = setLessonVideoWatched(current, key, watched);
      if (watched) {
        const now = new Date();
        const recorded = recordVisitVideo(next, now, readVisitId(), {
          key,
          title: meta?.title,
          leftAtSeconds: meta?.positionSeconds,
          durationSeconds: meta?.durationSeconds,
          watched: true,
        });
        writeVisitId(recorded.visitId);
        next = recorded.progress;
      }
      if (next === current) return;
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
    recordExerciseDone,
    recordWrongAttempt,
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
