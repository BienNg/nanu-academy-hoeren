"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  CONTINUE_BERUF_SLUG,
  DEFAULT_PROGRESS,
  activeStreakDays,
  bumpStreak,
  streakCelebrationStep,
  bindStoredProgress,
  classifySignInDevice,
  clearStoredProgress,
  signInDeviceCookie,
  progressStorageKey,
  shouldReplaceLocalWithCloud,
  absorbAddedLessonClips,
  commitLearnPart,
  dropStreakForUnfinishedSession,
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
  commitStudyPart,
  settleStudyReviewedClips,
  resetBerufProgress,
  resetLearnProgress,
  resetLearnStudyProgress,
  clearReviewedClips,
  mergeProgress,
  migrateLegacyProgress,
  normalizeProgress,
  parseProgress,
  recordVisitClip,
  recordVisitExercise,
  recordVisitLeftSession,
  recordVisitListeningRun,
  recordVisitVideo,
  recordVisitWrongAttempt,
  saveLessonVideoPosition,
  setLearnRunOrder,
  setLessonVideoWatched,
  toBerufProgress,
  toContinueLearning,
  toContinueLevelLearning,
  touchVisit,
  VISIT_IDLE_MS,
  type BerufProgressSummary,
  type ContinueLevelCatalogEntry,
  type LessonVideoProgress,
  type StoredProgress,
} from "@/lib/progress";

/** Cached so useSyncExternalStore gets a stable reference when data is unchanged. */
let cachedSnapshot: StoredProgress = DEFAULT_PROGRESS;
let cachedSerialized = JSON.stringify(DEFAULT_PROGRESS);
/**
 * localStorage string (and key) that `cachedSnapshot` was last parsed from.
 * React calls getSnapshot on every render of every consumer; when the stored
 * string is unchanged we skip the parse + normalize + stringify round trip.
 * Normalizing also prunes visits by the current date, so re-run it at least
 * once a minute even when nothing was written.
 */
let cachedRaw: string | null = null;
let cachedRawKey: string | null = null;
let cachedRawAt = 0;
const SNAPSHOT_REPARSE_MS = 60_000;

function invalidateRawSnapshot(): void {
  cachedRaw = null;
  cachedRawKey = null;
  cachedRawAt = 0;
}

/** Signed-in user whose local snapshot may be read or written. */
let activeUserId: string | null = null;
/** Bumps whenever the signed-in user changes so an in-flight sync cannot land late. */
let syncGeneration = 0;
/** Account that just logged out. Ignore re-binds until that session is gone. */
let logoutHoldUserId: string | null = null;
let cloudPushSuppressed = false;
let syncedUserId: string | null = null;
let migratedUserId: string | null = null;

function readProgressSnapshot(): StoredProgress {
  if (typeof window === "undefined" || !activeUserId) return DEFAULT_PROGRESS;
  const key = progressStorageKey(activeUserId);
  const raw = window.localStorage.getItem(key);
  const now = Date.now();
  if (
    raw !== null &&
    raw === cachedRaw &&
    key === cachedRawKey &&
    now - cachedRawAt < SNAPSHOT_REPARSE_MS
  ) {
    return cachedSnapshot;
  }
  const progress = parseProgress(raw);
  const serialized = JSON.stringify(progress);
  cachedRaw = raw;
  cachedRawKey = key;
  cachedRawAt = now;
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
    if (event.key === null) {
      onStoreChange();
      return;
    }
    if (activeUserId && event.key === progressStorageKey(activeUserId)) {
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
  if (typeof window === "undefined" || !activeUserId || cloudPushSuppressed) return;
  const serialized = JSON.stringify(progress);
  cachedSerialized = serialized;
  cachedSnapshot = progress;
  invalidateRawSnapshot();
  window.localStorage.setItem(progressStorageKey(activeUserId), serialized);
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

function resetProgressMemory(): void {
  activeUserId = null;
  cachedSnapshot = DEFAULT_PROGRESS;
  cachedSerialized = JSON.stringify(DEFAULT_PROGRESS);
  invalidateRawSnapshot();
  lastCloudSerialized = null;
}

/**
 * Drop this browser's copy of every account's progress.
 * Cloud progress is left as-is. Call this before sign-out so the next login
 * cannot merge the previous account into a new one.
 */
export function discardDeviceProgress(): void {
  if (typeof window === "undefined") return;
  logoutHoldUserId = activeUserId ?? logoutHoldUserId;
  cloudPushSuppressed = true;
  syncGeneration += 1;
  syncedUserId = null;
  migratedUserId = null;
  if (visitCloudTimer !== null) {
    window.clearTimeout(visitCloudTimer);
    visitCloudTimer = null;
  }
  visitCleanup?.();
  visitTracking = false;
  visitCleanup = null;
  lastVisibleTick = 0;
  try {
    window.sessionStorage.removeItem(VISIT_ID_KEY);
  } catch {
    // Session storage can be blocked. The progress cache is still cleared.
  }
  clearStoredProgress(window.localStorage);
  resetProgressMemory();
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

function bindProgressUser(userId: string): void {
  if (logoutHoldUserId === userId) return;
  if (activeUserId === userId) {
    bindStoredProgress(window.localStorage, userId);
    return;
  }

  logoutHoldUserId = null;
  cloudPushSuppressed = false;
  syncGeneration += 1;
  revocationHandled = false;
  activeUserId = userId;
  lastCloudSerialized = null;
  lastVisibleTick = 0;
  try {
    window.sessionStorage.removeItem(VISIT_ID_KEY);
  } catch {
    // A missing visit id starts a new visit for this account.
  }
  const progress = bindStoredProgress(window.localStorage, userId);
  cachedSerialized = JSON.stringify(progress);
  cachedSnapshot = progress;
  invalidateRawSnapshot();
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

function detachProgressUser(): void {
  logoutHoldUserId = null;
  if (activeUserId === null && cachedSnapshot === DEFAULT_PROGRESS) return;
  syncGeneration += 1;
  resetProgressMemory();
  window.dispatchEvent(new Event("nanu-horen-progress"));
}

let revocationHandled = false;

/** An admin deleted this account: drop on-device progress and sign out. */
function handleRevokedAccount(): void {
  if (revocationHandled || typeof window === "undefined") return;
  revocationHandled = true;
  discardDeviceProgress();
  void signOut({ callbackUrl: "/account" });
}

const VISIT_ID_KEY = "nanu-horen-visit-id";
/** Local visit clock. The full progress document uploads on hide, and once per visit while the tab stays open. */
const VISIT_TICK_MS = 60_000;

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

function progressSyncIsCurrent(userId: string, generation: number): boolean {
  return !cloudPushSuppressed && activeUserId === userId && syncGeneration === generation;
}

/** Lets the progress request classify tablets, including iPad desktop user agents. */
export function rememberClientDevice(): void {
  const device = classifySignInDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  if (!device) return;
  document.cookie = signInDeviceCookie(device, window.location.protocol === "https:");
}

async function pushCloudProgress(progress: StoredProgress): Promise<void> {
  rememberClientDevice();
  if (cloudPushSuppressed || !activeUserId) return;
  const userId = activeUserId;
  const generation = syncGeneration;
  // Refuse a snapshot captured for a previous account. Callers that race a
  // sign-out or account switch no longer upload that account's progress.
  if (JSON.stringify(readProgressSnapshot()) !== JSON.stringify(progress)) return;
  lastCloudSerialized = JSON.stringify(progress);
  try {
    const response = await fetch("/api/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
    if (!progressSyncIsCurrent(userId, generation)) return;
    if (!progressSyncIsCurrent(userId, generation)) return;
    if (response.status === 410) {
      handleRevokedAccount();
      return;
    }
    if (!response.ok) return;
    const data = (await response.json()) as { progress?: unknown };
    if (!progressSyncIsCurrent(userId, generation) || data.progress == null) return;
    // A newer local write happened while this request was in flight.
    if (JSON.stringify(readProgressSnapshot()) !== JSON.stringify(progress)) return;
    const saved = normalizeProgress(data.progress as Partial<StoredProgress>);
    if (JSON.stringify(saved) === JSON.stringify(progress)) return;
    writeProgress(saved);
    lastCloudSerialized = JSON.stringify(saved);
  } catch (error) {
    console.error("Failed to sync progress to cloud", error);
  }
}

function queueVisitCloudSync(): void {
  if (
    typeof window === "undefined" ||
    cloudPushSuppressed ||
    !activeUserId ||
    visitCloudTimer !== null
  ) {
    return;
  }
  visitCloudTimer = window.setTimeout(() => {
    visitCloudTimer = null;
    const snapshot = readProgressSnapshot();
    if (JSON.stringify(snapshot) === lastCloudSerialized) return;
    void pushCloudProgress(snapshot);
  }, VISIT_IDLE_MS);
}

function flushVisitCloudSync(): void {
  if (typeof window === "undefined" || cloudPushSuppressed || !activeUserId) return;
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

  const timer = window.setInterval(onVisitTick, VISIT_TICK_MS);
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
  userId: string,
  generation: number,
  replaceLocal: boolean,
): Promise<void> {
  rememberClientDevice();
  try {
    const response = await fetch("/api/progress");
    if (!progressSyncIsCurrent(userId, generation)) return;
    if (response.status === 410) {
      handleRevokedAccount();
      return;
    }
    if (response.status === 401 || !response.ok) return;
    const data = (await response.json()) as {
      progress?: unknown;
      configured?: boolean;
    };
    if (!progressSyncIsCurrent(userId, generation)) return;
    if (data.configured === false || data.progress == null) return;
    const remote = normalizeProgress(
      data.progress as Partial<StoredProgress> | null,
    );
    // A fresh sign-in keeps the cloud document. Merging here would upload the
    // previous account's device cache that this browser has not cleared yet.
    const next = replaceLocal
      ? remote
      : mergeProgress(readProgressSnapshot(), remote);
    if (!progressSyncIsCurrent(userId, generation)) return;
    writeProgress(next);
    if (!replaceLocal && JSON.stringify(next) !== JSON.stringify(remote)) {
      await pushCloudProgress(next);
    } else {
      lastCloudSerialized = JSON.stringify(next);
    }
  } catch (error) {
    console.error("Failed to load cloud progress", error);
  }
}

function getServerSnapshot(): StoredProgress {
  return DEFAULT_PROGRESS;
}

const EMPTY_RUN_ORDER: readonly string[] = [];
const EMPTY_TOTALS: Record<string, number> = {};
const EMPTY_LEVEL_CATALOG: ContinueLevelCatalogEntry[] = [];

export type StreakCelebration = { from: number; to: number };

let queuedCelebration: StreakCelebration | null = null;
let visibleCelebration: StreakCelebration | null = null;
const celebrationListeners = new Set<() => void>();

function streakCelebratedKey(userId: string): string {
  return `nanu-streak-celebrated:${userId}`;
}

function notifyCelebration(): void {
  for (const listener of celebrationListeners) listener();
}

/**
 * Remember today's increase without showing it. The flame waits for the
 * finished run. A later reload stays quiet.
 */
function noteStreakIncrease(before: StoredProgress, after: StoredProgress): void {
  if (typeof window === "undefined" || !activeUserId) return;
  const step = streakCelebrationStep(before, after);
  if (!step) return;
  const key = streakCelebratedKey(activeUserId);
  const today = after.lastPracticeDate;
  if (!today) return;
  try {
    if (window.localStorage.getItem(key) === today) return;
    window.localStorage.setItem(key, today);
  } catch {
    return;
  }
  if (visibleCelebration) return;
  queuedCelebration = step;
  notifyCelebration();
}

/** Show a queued flame. No-op when this run did not raise the streak. */
export function revealStreakCelebration(): void {
  if (visibleCelebration || !queuedCelebration) return;
  visibleCelebration = queuedCelebration;
  queuedCelebration = null;
  notifyCelebration();
}

/** The step waiting for a finished run, without showing it. */
export function readQueuedStreakCelebration(): StreakCelebration | null {
  return queuedCelebration;
}

/** Hands the queued step to a screen that shows the flame itself. */
export function takeStreakCelebration(): StreakCelebration | null {
  const step = queuedCelebration;
  if (!step) return null;
  queuedCelebration = null;
  notifyCelebration();
  return step;
}

export function dismissStreakCelebration(): void {
  if (!visibleCelebration) return;
  visibleCelebration = null;
  notifyCelebration();
}

export function subscribeStreakCelebration(onStoreChange: () => void): () => void {
  celebrationListeners.add(onStoreChange);
  return () => {
    celebrationListeners.delete(onStoreChange);
  };
}

export function readStreakCelebration(): StreakCelebration | null {
  return visibleCelebration;
}

export function useStreakCelebrationPending(): boolean {
  const celebration = useSyncExternalStore(
    subscribeStreakCelebration,
    readStreakCelebration,
    () => null,
  );
  return celebration != null;
}

/**
 * Unified localStorage + cloud-synced learning progress (requires login).
 * Pass `totalsBySlug` so continue-learning and per-beruf cards get correct totals.
 */
export function useProgress(
  totalsBySlug: Record<string, number> = EMPTY_TOTALS,
  levelCatalog: readonly ContinueLevelCatalogEntry[] = EMPTY_LEVEL_CATALOG,
) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const authAt = session?.user?.authAt;
  const progress = useSyncExternalStore(
    subscribeProgress,
    readProgressSnapshot,
    getServerSnapshot,
  );

  useLayoutEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated" && userId) {
      bindProgressUser(userId);
      return;
    }
    detachProgressUser();
  }, [authAt, status, userId]);

  useEffect(() => {
    if (status !== "authenticated" || !userId || activeUserId !== userId) return;
    if (migratedUserId === userId) return;
    migratedUserId = userId;
    runLegacyMigrationOnce();
  }, [status, userId]);

  useEffect(() => {
    if (status !== "authenticated" || !userId) {
      if (status === "unauthenticated") syncedUserId = null;
      return;
    }
    if (activeUserId !== userId || syncedUserId === userId) return;
    syncedUserId = userId;
    void pullAndMergeCloudProgress(
      userId,
      syncGeneration,
      shouldReplaceLocalWithCloud(authAt),
    );
  }, [authAt, status, userId]);

  const persist = useCallback(
    (next: StoredProgress, syncCloud: boolean) => {
      noteStreakIncrease(readProgressSnapshot(), next);
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

  const absorbLessonClips = useCallback(
    (chapterSlug: string, clipIds: readonly string[]) => {
      const current = readProgressSnapshot();
      const next = absorbAddedLessonClips(current, [{ chapterSlug, clipIds }]);
      if (next === current) return;
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

  const setLearnRunOrderFn = useCallback(
    (chapterSlug: string, order: readonly string[]) => {
      const current = readProgressSnapshot();
      const next = setLearnRunOrder(current, chapterSlug, order);
      if (next === current) return;
      persist(next, true);
    },
    [persist],
  );

  const commitLearnListeningPart = useCallback(
    (
      chapterSlug: string,
      clipIds: readonly string[],
      lessonKey: string,
      finishRun: boolean,
    ) => {
      const now = new Date();
      const current = readProgressSnapshot();
      let next = commitLearnPart(current, chapterSlug, clipIds, { now, finishRun });
      const exercised = recordVisitExercise(
        next,
        now,
        readVisitId(),
        lessonKey,
        clipIds.length,
      );
      let visitId = exercised.visitId;
      next = exercised.progress;
      if (finishRun) {
        const recorded = recordVisitListeningRun(next, now, visitId, lessonKey);
        visitId = recorded.visitId;
        next = recorded.progress;
      }
      if (visitId) writeVisitId(visitId);
      if (next === current) return;
      persist(next, true);
    },
    [persist],
  );

  const dropUnfinishedSessionStreak = useCallback(
    (chapterSlug: string) => {
      const current = readProgressSnapshot();
      const next = dropStreakForUnfinishedSession(current, chapterSlug);
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
      const reviewed = markLearnClipReviewed(current, chapterSlug, clipId, now);
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

  const recordLeftSession = useCallback(
    (session: {
      lessonKey: string;
      kind: "study" | "practice";
      partNumber: number;
      partCount: number;
      clipsDone: number;
      clipCount: number;
      startedAt: string;
    }) => {
      const now = new Date();
      const current = readProgressSnapshot();
      const recorded = recordVisitLeftSession(current, now, readVisitId(), session);
      if (recorded.visitId) writeVisitId(recorded.visitId);
      if (recorded.progress === current) return;
      persist(recorded.progress, true);
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

  const clearStudyClipReviews = useCallback(
    (chapterSlug: string, clipIds: readonly string[]) => {
      const next = clearReviewedClips(readProgressSnapshot(), chapterSlug, clipIds);
      persist(next, true);
    },
    [persist],
  );

  const commitStudyPartDone = useCallback(
    (chapterSlug: string, clipIds: readonly string[], lessonKey: string, finishRun: boolean) => {
      const now = new Date();
      let next = commitStudyPart(readProgressSnapshot(), chapterSlug, clipIds, now);
      if (finishRun) next = incrementStudyRunCount(next, chapterSlug, now.toISOString());
      let visitId = readVisitId();
      for (const clipId of clipIds) {
        const recorded = recordVisitClip(next, now, visitId, lessonKey, clipId);
        visitId = recorded.visitId;
        next = recorded.progress;
      }
      if (visitId) writeVisitId(visitId);
      persist(next, true);
    },
    [persist],
  );

  const settleStudyReviews = useCallback(
    (chapterSlug: string, clips: readonly { id: string }[]) => {
      const current = readProgressSnapshot();
      const next = settleStudyReviewedClips(current, chapterSlug, clips);
      if (next === current) return;
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

  const recordPracticeDay = useCallback(() => {
    const current = readProgressSnapshot();
    const next = bumpStreak(current);
    if (next === current) return;
    persist(next, true);
  }, [persist]);

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

  const progressReady = status === "authenticated" && activeUserId === userId;

  return {
    progress,
    progressReady,
    continueLearning,
    continueLevel,
    progressFor,
    streakDays: activeStreakDays(progress),
    recordPracticeDay,
    markClipDone,
    markLearnClipDone,
    absorbLessonClips,
    markLearnChapterDone,
    setLearnRunOrder: setLearnRunOrderFn,
    commitLearnListeningPart,
    dropUnfinishedSessionStreak,
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
    learnRunClipOrderFor: (chapterSlug: string) =>
      progress.learn[chapterSlug]?.runClipOrder ?? EMPTY_RUN_ORDER,
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
    recordLeftSession,
    markLearnClipReviewed: markLearnClipReviewedFn,
    resetLearnStudyProgress: resetLearnStudyProgressFn,
    clearStudyClipReviews,
    commitStudyPartDone,
    settleStudyReviews,
    reviewedLearnClipIdsFor: (chapterSlug: string) =>
      learnReviewedClipIds(progress, chapterSlug),
    lessonVideoProgressFor: (key: string): LessonVideoProgress | undefined =>
      progress.videos[key],
    saveVideoPosition,
    setVideoWatched,
  };
}

export { CONTINUE_BERUF_SLUG };
