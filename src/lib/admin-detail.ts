import type { LearnProgress, StoredProgress } from "@/lib/progress";
import { lessonVideoStatus } from "@/lib/progress";

export type AdminCatalogCard = {
  id: string;
  prompt: string;
};

export type AdminCatalogVideo = {
  id: string;
  title: string;
};

export type AdminCatalogLesson = {
  id: string;
  label: string;
  clips: AdminCatalogCard[];
  videos: AdminCatalogVideo[];
  /** CEFR listening is stored under this chapter slug. */
  learnKey?: string;
  /** `${levelSlug}/${chapterSlug}` for video progress keys. */
  videoKeyPrefix?: string;
  /** Ausbildung track whose completed clip ids apply. */
  interviewSlug?: string;
};

export type AdminCatalogCourse = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "ausbildung" | "cefr";
  lessons: AdminCatalogLesson[];
};

export type LessonStatus = "not-started" | "in-progress" | "completed";

export type AdminActivityCard = {
  id: string;
  label: string;
  status: LessonStatus;
  percent: number;
  /** Items finished out of the items on this card, e.g. "14/19". */
  progressLabel: string;
  /** Extra stored context, such as how many full listening runs. */
  note: string | null;
  struggling: boolean;
};

export type AdminVideoDetail = {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "watched";
  positionSeconds: number;
  updatedAt: string | null;
  watchedAt: string | null;
};

export type AdminLessonDetail = {
  id: string;
  label: string;
  status: LessonStatus;
  completedCount: number;
  totalCount: number;
  percent: number;
  /** Full listening runs of this Lektion. Stored once per lesson, not per card. */
  runCount: number;
  lastActivityAt: string | null;
  /** Several full runs without finishing the lesson. */
  struggling: boolean;
  /** Hub cards on this Lektion. Individual exercises are not listed. */
  activities: AdminActivityCard[];
  videos: AdminVideoDetail[];
};

export type AdminCourseDetail = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "ausbildung" | "cefr";
  started: boolean;
  percent: number;
  completedLessons: number;
  totalLessons: number;
  lessons: AdminLessonDetail[];
};

export type StudentDetail = {
  coursesStarted: number;
  lessonsCompleted: number;
  listeningRepetitions: number;
  videosWatched: number;
  startedCourses: AdminCourseDetail[];
  notStartedLabels: string[];
};

const STRUGGLE_RUNS = 3;

function percentOf(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const stamps = values.filter((value): value is string => Boolean(value));
  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

function learnTouched(entry: LearnProgress | undefined): boolean {
  if (!entry) return false;
  return (
    entry.completedClipIds.length > 0 ||
    entry.runCompletedClipIds.length > 0 ||
    entry.reviewedClipIds.length > 0 ||
    entry.runCount > 0 ||
    Boolean(entry.completedAt)
  );
}

/**
 * Listening progress is stored by Lektion slug, not by level.
 * Attach it to the level whose cards share the most completed ids.
 */
function learnOwnerByKey(
  courses: readonly AdminCatalogCourse[],
  progress: StoredProgress,
): Map<string, string> {
  const owners = new Map<string, string>();
  const candidates = new Map<string, { courseId: string; lesson: AdminCatalogLesson }[]>();

  for (const course of courses) {
    if (course.kind !== "cefr") continue;
    for (const lesson of course.lessons) {
      if (!lesson.learnKey) continue;
      const list = candidates.get(lesson.learnKey) ?? [];
      list.push({ courseId: course.id, lesson });
      candidates.set(lesson.learnKey, list);
    }
  }

  for (const [learnKey, options] of candidates) {
    const entry = progress.learn[learnKey];
    const done = new Set(entry?.completedClipIds ?? []);
    let bestCourse = options[0]?.courseId;
    let bestOverlap = -1;
    for (const option of options) {
      const overlap = option.lesson.clips.filter((card) => done.has(card.id)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCourse = option.courseId;
      }
    }
    if (bestCourse && learnTouched(entry)) {
      owners.set(learnKey, bestCourse);
    }
  }

  return owners;
}

function projectLesson(
  lesson: AdminCatalogLesson,
  progress: StoredProgress,
  showListening: boolean,
  interviewCompletedAt: string | undefined,
): AdminLessonDetail {
  const learn = showListening && lesson.learnKey ? progress.learn[lesson.learnKey] : undefined;
  const passedIds = new Set(
    lesson.interviewSlug
      ? (progress.interview[lesson.interviewSlug]?.completedClipIds ?? [])
      : (learn?.completedClipIds ?? []),
  );
  const reviewedIds = new Set(learn?.reviewedClipIds ?? []);
  const clipTotal = lesson.clips.length;
  const completedCount = lesson.clips.filter((card) => passedIds.has(card.id)).length;
  const reviewedCount = lesson.clips.filter((card) => reviewedIds.has(card.id)).length;
  const videos: AdminVideoDetail[] = lesson.videos.map((video) => {
    const key = lesson.videoKeyPrefix ? `${lesson.videoKeyPrefix}/${video.id}` : "";
    const entry = key ? progress.videos[key] : undefined;
    return {
      id: video.id,
      title: video.title,
      status: lessonVideoStatus(entry),
      positionSeconds: entry?.positionSeconds ?? 0,
      updatedAt: entry?.updatedAt || null,
      watchedAt: entry?.watchedAt ?? null,
    };
  });
  const videoTouched = videos.some((video) => video.status !== "not-started");
  const listeningTouched = Boolean(learn && learnTouched(learn));
  const cardsComplete = clipTotal === 0 || completedCount >= clipTotal;
  const videosComplete =
    videos.length === 0 || videos.every((video) => video.status === "watched");
  const touched = listeningTouched || videoTouched || completedCount > 0 || reviewedCount > 0;
  const hasItems = clipTotal > 0 || videos.length > 0;
  const status: LessonStatus = !hasItems
    ? learn?.completedAt
      ? "completed"
      : "not-started"
    : cardsComplete && videosComplete && (touched || Boolean(learn?.completedAt))
      ? "completed"
      : touched
        ? "in-progress"
        : "not-started";
  const runCount = learn?.runCount ?? 0;
  const listeningStatus: LessonStatus =
    clipTotal === 0
      ? "not-started"
      : completedCount >= clipTotal
        ? "completed"
        : completedCount > 0 || runCount > 0
          ? "in-progress"
          : "not-started";
  const studyStatus: LessonStatus =
    clipTotal === 0
      ? "not-started"
      : reviewedCount >= clipTotal
        ? "completed"
        : reviewedCount > 0
          ? "in-progress"
          : "not-started";
  const listeningStruggling =
    clipTotal > 0 && runCount >= STRUGGLE_RUNS && listeningStatus !== "completed";
  const activities: AdminActivityCard[] =
    clipTotal === 0
      ? []
      : [
          ...(lesson.learnKey
            ? [
                {
                  id: `${lesson.id}-study`,
                  label: "Study",
                  status: studyStatus,
                  percent: percentOf(reviewedCount, clipTotal),
                  progressLabel: `${reviewedCount}/${clipTotal}`,
                  note: null,
                  struggling: false,
                } satisfies AdminActivityCard,
              ]
            : []),
          {
            id: `${lesson.id}-listening`,
            label: "Listening",
            status: listeningStatus,
            percent: percentOf(completedCount, clipTotal),
            progressLabel: `${completedCount}/${clipTotal}`,
            note:
              runCount > 0
                ? `${runCount} listening ${runCount === 1 ? "run" : "runs"}`
                : null,
            struggling: listeningStruggling,
          },
        ];
  const lastActivityAt = latestIso([
    learn?.completedAt,
    status === "completed" ? interviewCompletedAt : null,
    ...videos.map((video) => video.updatedAt),
  ]);

  return {
    id: lesson.id,
    label: lesson.label,
    status,
    completedCount,
    totalCount: clipTotal,
    percent:
      clipTotal > 0
        ? percentOf(completedCount, clipTotal)
        : percentOf(
            videos.filter((video) => video.status === "watched").length,
            videos.length,
          ),
    runCount,
    lastActivityAt,
    struggling: listeningStruggling,
    activities,
    videos,
  };
}

export function projectStudentDetail(
  courses: readonly AdminCatalogCourse[],
  progress: StoredProgress,
): StudentDetail {
  const owners = learnOwnerByKey(courses, progress);
  const detailed: AdminCourseDetail[] = courses.map((course) => {
    const interviewSlug = course.lessons.find((lesson) => lesson.interviewSlug)?.interviewSlug;
    const interviewCompletedAt = interviewSlug
      ? progress.interview[interviewSlug]?.completedAt
      : undefined;
    const lessons = course.lessons.map((lesson) => {
      const showListening =
        course.kind === "ausbildung" ||
        (lesson.learnKey != null && owners.get(lesson.learnKey) === course.id);
      return projectLesson(lesson, progress, showListening, interviewCompletedAt);
    });
    const clipCompleted = lessons.reduce((sum, lesson) => sum + lesson.completedCount, 0);
    const clipTotal = lessons.reduce((sum, lesson) => sum + lesson.totalCount, 0);
    const videoCompleted = lessons.reduce(
      (sum, lesson) =>
        sum + lesson.videos.filter((video) => video.status === "watched").length,
      0,
    );
    const videoTotal = lessons.reduce((sum, lesson) => sum + lesson.videos.length, 0);
    const completedLessons = lessons.filter((lesson) => lesson.status === "completed").length;
    const videoStarted = lessons.some((lesson) =>
      lesson.videos.some((video) => video.status !== "not-started"),
    );
    const listeningOwned = course.lessons.some(
      (lesson) => lesson.learnKey && owners.get(lesson.learnKey) === course.id,
    );
    const started =
      course.kind === "ausbildung"
        ? clipCompleted > 0 || Boolean(interviewCompletedAt)
        : videoStarted || listeningOwned;
    const percent =
      course.kind === "cefr" && !listeningOwned
        ? percentOf(videoCompleted, videoTotal)
        : percentOf(clipCompleted, clipTotal);

    return {
      id: course.id,
      label: course.label,
      shortLabel: course.shortLabel,
      kind: course.kind,
      started,
      percent,
      completedLessons,
      totalLessons: lessons.length,
      lessons,
    };
  });

  const startedCourses = detailed.filter((course) => course.started);
  const notStartedLabels = detailed
    .filter((course) => !course.started)
    .map((course) => course.shortLabel);

  const lessonsCompleted = startedCourses.reduce(
    (sum, course) => sum + course.completedLessons,
    0,
  );
  const listeningRepetitions = Object.values(progress.learn).reduce(
    (sum, entry) => sum + (entry.runCount > 0 ? entry.runCount : 0),
    0,
  );
  const videosWatched = Object.values(progress.videos).filter((entry) => entry.watchedAt).length;

  return {
    coursesStarted: startedCourses.length,
    lessonsCompleted,
    listeningRepetitions,
    videosWatched,
    startedCourses,
    notStartedLabels,
  };
}
