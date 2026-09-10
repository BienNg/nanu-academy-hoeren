"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import {
  CONTINUE_BERUF_SLUG,
  DEFAULT_PROGRESS,
  STORAGE_KEY,
  markClipCompleted,
  mergeProgress,
  migrateLegacyProgress,
  normalizeProgress,
  parseProgress,
  toContinueLearning,
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

async function pushCloudProgress(progress: StoredProgress): Promise<void> {
  try {
    await fetch("/api/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    });
  } catch (error) {
    console.error("Failed to sync progress to cloud", error);
  }
}

async function pullAndMergeCloudProgress(
  local: StoredProgress,
): Promise<StoredProgress> {
  try {
    const response = await fetch("/api/progress");
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

/**
 * Unified localStorage + optional cloud-synced learning progress.
 * Continue-learning always targets Restaurantfachkraft for MVP.
 */
export function useProgress(totalClips = 0) {
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

  const continueLearning = toContinueLearning(progress, totalClips);

  return {
    progress,
    continueLearning,
    streakDays: progress.streakDays,
    markClipDone,
    setStreakDays: (streakDays: number) => {
      persist({ ...progress, streakDays }, true);
    },
    completedClipIdsFor: (berufSlug: string) =>
      progress.interview[berufSlug]?.completedClipIds ?? [],
  };
}

export { CONTINUE_BERUF_SLUG };
