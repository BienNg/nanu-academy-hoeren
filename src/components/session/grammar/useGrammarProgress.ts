"use client";

import { grammarLessonDone, grammarPartStorageKey, type GrammarNodeLayout } from "@/lib/grammar-node";
import { useRef } from "react";
import type { SessionCourse } from "@/lib/session-course";
import { useProgress } from "@/lib/useProgress";

/** The Lektion's grammar nodes and whether it also has clip nodes. */
export type LessonGrammar = {
  layouts: GrammarNodeLayout[];
  hasClips: boolean;
};

/**
 * Saves finished grammar parts. The part that finishes the last grammar node
 * of a Lektion without clips also completes the Lektion. A Lektion with clips
 * is completed by its last clip practice part, as before.
 */
export function useGrammarProgress(course: SessionCourse, lesson: LessonGrammar) {
  const { commitGrammarPartDone, learnGrammarPartKeysFor, learnChapterCompleted, streakDays } = useProgress();
  const doneKeys = learnGrammarPartKeysFor(course.progressKey);

  const finishPart = (topicId: string, partKey: string, exercises: number) => {
    const key = grammarPartStorageKey(topicId, partKey);
    const grammarDone = grammarLessonDone(lesson.layouts, doneKeys, key);
    const lessonComplete = grammarDone && (!lesson.hasClips || learnChapterCompleted(course.progressKey));
    commitGrammarPartDone(course.progressKey, key, course.lessonKey, exercises, lessonComplete);
  };

  return { finishPart, streakDays };
}

/** True once this visit opened a grammar node whose parts were already finished. */
export function useGrammarReplay(course: SessionCourse, storageKeys: readonly string[]) {
  const { learnGrammarPartKeysFor, progressReady } = useProgress();
  const doneKeys = learnGrammarPartKeysFor(course.progressKey);
  const replaying = useRef<boolean | null>(null);
  if (progressReady && replaying.current === null) {
    const have = new Set(doneKeys);
    replaying.current = storageKeys.length > 0 && storageKeys.every((key) => have.has(key));
  }
  return replaying.current === true;
}
