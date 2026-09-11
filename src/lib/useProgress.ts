"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  CONTINUE_BERUF_SLUG,
  DEFAULT_PROGRESS,
  STORAGE_KEY,
  clearStoredProgress,
  markClipCompleted,
  markLearnClipCompleted,
  resetBerufProgress,
  resetLearnProgress,
  mergeProgress,
  migrateLegacyProgress,
  normalizeProgress,
  parseProgress,
  toBerufProgress,
  toContinueLearning,
  type BerufProgressSummary,
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

/**
 * Unified localStorage + cloud-synced learning progress (requires login).
 * Pass `totalsBySlug` so continue-learning and per-beruf cards get correct totals.
 */
export function useProgress(totalsBySlug: Record<string, number> = EMPTY_TOTALS) {
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

  const continueLearning = toContinueLearning(progress, totalsBySlug);

  const progressFor = useCallback(
    (berufSlug: string): BerufProgressSummary =>
      toBerufProgress(progress, berufSlug, totalsBySlug[berufSlug] ?? 0),
    [progress, totalsBySlug],
  );

  return {
    progress,
    continueLearning,
    progressFor,
    streakDays: progress.streakDays,
    markClipDone,
    markLearnClipDone,
    resetProgress,
    resetLearnProgress: resetLearnProgressFn,
    setStreakDays: (streakDays: number) => {
      persist({ ...progress, streakDays }, true);
    },
    completedClipIdsFor: (berufSlug: string) =>
      progress.interview[berufSlug]?.completedClipIds ?? [],
    completedLearnClipIdsFor: (chapterSlug: string) =>
      progress.learn[chapterSlug]?.completedClipIds ?? [],
  };
}

export { CONTINUE_BERUF_SLUG };
