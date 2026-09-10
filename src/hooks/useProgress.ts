"use client";

import { useState, useCallback } from "react";

export function useProgress(berufSlug: string) {
  const [completedClips, setCompletedClips] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(`nanu-progress-${berufSlug}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load progress", e);
    }
    return new Set();
  });

  // Mark a clip as done
  const markClipDone = useCallback((clipId: string) => {
    setCompletedClips((prev) => {
      const next = new Set(prev);
      next.add(clipId);
      try {
        localStorage.setItem(`nanu-progress-${berufSlug}`, JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error("Failed to save progress", e);
      }
      return next;
    });
  }, [berufSlug]);

  return {
    completedClips,
    markClipDone,
  };
}
