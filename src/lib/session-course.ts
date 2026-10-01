import type { CefrLevel, LevelChapterMeta } from "@/lib/levels";

/**
 * What Study and Practice sessions need to know about the lesson they run,
 * so CEFR Lektionen and Leben-in-Deutschland scenes share one session UI.
 */
export type SessionCourse = {
  /** Key into local progress (`progress.learn`). */
  progressKey: string;
  /** `group/lesson` key sent with runs and XP. */
  lessonKey: string;
  /** Lesson overview. Back link and where a finished part returns to. */
  pathHref: string;
  /** Header title, e.g. "A1.1 - Lektion 3". */
  title: string;
  /** Part-complete screen: "A1.1" · "Lektion 3". */
  groupLabel: string;
  lessonLabel: string;
  /** Exit label after the last part when another lesson follows. */
  nextLessonLabel: string;
  /** Exit label after the last part of the last lesson. */
  finishLabel: string;
};

export function levelSessionCourse(level: CefrLevel, chapter: LevelChapterMeta): SessionCourse {
  return {
    progressKey: chapter.slug,
    lessonKey: `${level.slug}/${chapter.slug}`,
    pathHref: `/learn/${level.slug}?lektion=${encodeURIComponent(chapter.slug)}`,
    title: `${level.level} - ${chapter.label}`,
    groupLabel: level.level,
    lessonLabel: chapter.label,
    nextLessonLabel: "Lektion tiếp theo",
    finishLabel: "Về trình độ",
  };
}

/** A Leben-in-Deutschland scene inside its workplace. */
export function livingSessionCourse(
  workplace: { slug: string; label: string },
  scene: { id: string; label: string; lessonKey: string; progressKey: string },
): SessionCourse {
  return {
    progressKey: scene.progressKey,
    lessonKey: scene.lessonKey,
    pathHref: `/living/${workplace.slug}?lektion=${encodeURIComponent(scene.id)}`,
    title: `${workplace.label} - ${scene.label}`,
    groupLabel: workplace.label,
    lessonLabel: scene.label,
    nextLessonLabel: "Tình huống tiếp theo",
    finishLabel: `Về ${workplace.label}`,
  };
}
