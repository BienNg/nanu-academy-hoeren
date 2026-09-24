import type { LearnProgress, StoredProgress, Visit, VisitSummary } from "@/lib/progress";
import {
  daysBetweenUtc,
  describeVisitSignal,
  formatActiveDuration,
  lessonVideoStatus,
  selectVisits,
  summarizeVisits,
  type VisitRange,
} from "@/lib/progress";

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
  /** Extra stored context, such as how many full listening or study runs. */
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
  /** Every catalog course, including ones this student has not opened. */
  courses: AdminCourseDetail[];
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
    entry.studyRunCount > 0 ||
    Boolean(entry.completedAt) ||
    Boolean(entry.studyCompletedAt)
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

  const runCount = learn?.runCount ?? 0;
  const studyRunCount = learn?.studyRunCount ?? 0;
  const listeningCompletedOnce =
    clipTotal > 0 &&
    (runCount >= 1 || completedCount >= clipTotal || Boolean(learn?.completedAt));
  const listeningStatus: LessonStatus =
    clipTotal === 0
      ? "not-started"
      : listeningCompletedOnce
        ? "completed"
        : completedCount > 0
          ? "in-progress"
          : "not-started";
  const studyCompletedOnce =
    clipTotal > 0 &&
    (studyRunCount >= 1 ||
      reviewedCount >= clipTotal ||
      Boolean(learn?.studyCompletedAt));
  const studyStatus: LessonStatus =
    clipTotal === 0
      ? "not-started"
      : studyCompletedOnce
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
                  percent: studyCompletedOnce ? 100 : percentOf(reviewedCount, clipTotal),
                  progressLabel: studyCompletedOnce ? "" : `${reviewedCount}/${clipTotal}`,
                  note:
                    studyRunCount > 0
                      ? `${studyRunCount} study ${studyRunCount === 1 ? "run" : "runs"}`
                      : null,
                  struggling: false,
                } satisfies AdminActivityCard,
              ]
            : []),
          {
            id: `${lesson.id}-listening`,
            label: "Listening",
            status: listeningStatus,
            percent: listeningCompletedOnce ? 100 : percentOf(completedCount, clipTotal),
            progressLabel: listeningCompletedOnce ? "" : `${completedCount}/${clipTotal}`,
            note:
              runCount > 0
                ? `${runCount} listening ${runCount === 1 ? "run" : "runs"}`
                : null,
            struggling: listeningStruggling,
          },
        ];

  // Calculate if everything inside this lesson is completed
  const allVideosCompleted = videos.length === 0 || videos.every((v) => v.status === "watched");
  const allActivitiesCompleted = activities.length === 0 || activities.every((a) => a.status === "completed");
  const isFullyCompleted = hasItems && allVideosCompleted && allActivitiesCompleted;

  const status: LessonStatus = !hasItems
    ? learn?.completedAt
      ? "completed"
      : "not-started"
    : isFullyCompleted || (cardsComplete && videosComplete && (touched || Boolean(learn?.completedAt)))
      ? "completed"
      : touched
        ? "in-progress"
        : "not-started";
  const lastActivityAt = latestIso([
    learn?.completedAt,
    learn?.studyCompletedAt,
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

  const ordered = [...detailed].sort((left, right) => {
    if (left.kind === right.kind) return 0;
    return left.kind === "cefr" ? -1 : 1;
  });
  const startedCourses = ordered.filter((course) => course.started);
  const notStartedLabels = ordered
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
    courses: ordered,
  };
}

export type AdminVisitRange = VisitRange;

export type AdminVisitDetailGroup = {
  id: string;
  label: string;
  items: string[];
  extraCount: number;
};

export type AdminVisitRow = {
  id: string;
  headline: string;
  lines: string[];
  signal: string | null;
  details: AdminVisitDetailGroup[];
};

export type AdminVisitLog = {
  summary: VisitSummary;
  visits: AdminVisitRow[];
  emptyMessage: string;
};

const VISIT_NAME_CAP = 8;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatVisitHeadline(visit: Visit): string {
  const start = new Date(visit.startedAt);
  const end = new Date(visit.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Visit";
  const clock = (date: Date) =>
    `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  const day = `${WEEKDAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}`;
  const endLabel =
    start.toDateString() === end.toDateString()
      ? clock(end)
      : `${WEEKDAYS[end.getDay()]} ${clock(end)}`;
  return `${day} · ${clock(start)}–${endLabel} · ${formatActiveDuration(visit.activeSeconds)}`;
}

function catalogLesson(
  courses: readonly AdminCatalogCourse[],
  lessonKey: string,
): { lessonLabel: string; lesson: AdminCatalogLesson | null } {
  if (lessonKey.startsWith("interview/")) {
    const slug = lessonKey.slice("interview/".length);
    const course = courses.find((entry) => entry.id === slug);
    return { lessonLabel: course?.shortLabel || lessonKey, lesson: null };
  }
  const [levelSlug, chapterSlug] = lessonKey.split("/");
  const course = courses.find((entry) => entry.id === levelSlug);
  const lesson =
    course?.lessons.find((entry) => entry.learnKey === chapterSlug) ?? null;
  if (!course || !lesson) return { lessonLabel: lessonKey, lesson };
  return { lessonLabel: `${course.shortLabel} · ${lesson.label}`, lesson };
}

function clipTitle(lesson: AdminCatalogLesson | null, clipId: string): string {
  const prompt = lesson?.clips.find((clip) => clip.id === clipId)?.prompt.trim();
  if (!prompt) return clipId;
  return prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
}

function lessonLabels(courses: readonly AdminCatalogCourse[], visit: Visit): string[] {
  const labels: string[] = [];
  for (const lessonKey of visit.lessons) {
    const label = catalogLesson(courses, lessonKey).lessonLabel;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function capItems(items: string[]): { items: string[]; extraCount: number } {
  if (items.length <= VISIT_NAME_CAP) return { items, extraCount: 0 };
  return {
    items: items.slice(0, VISIT_NAME_CAP),
    extraCount: items.length - VISIT_NAME_CAP,
  };
}

function visitDetails(
  courses: readonly AdminCatalogCourse[],
  visit: Visit,
): AdminVisitDetailGroup[] {
  const groups: AdminVisitDetailGroup[] = [];
  if (visit.clips.length > 0) {
    const names = visit.clips.map((clip) => {
      const found = catalogLesson(courses, clip.lessonKey);
      return `${found.lessonLabel} · ${clipTitle(found.lesson, clip.clipId)}`;
    });
    const capped = capItems(names);
    groups.push({ id: "study", label: "Study", ...capped });
  }

  const exerciseLessons = visit.exerciseLessons ?? [];
  if (exerciseLessons.length > 0 || visit.exercisesCompleted > 0 || visit.listeningRuns > 0) {
    const names =
      exerciseLessons.length > 0
        ? exerciseLessons.map((lesson) => {
            const label = catalogLesson(courses, lesson.lessonKey).lessonLabel;
            const parts: string[] = [];
            if (lesson.completed > 0) {
              parts.push(
                `${lesson.completed} ${lesson.completed === 1 ? "exercise" : "exercises"} completed`,
              );
            }
            parts.push(
              lesson.fullRuns > 0
                ? `${lesson.fullRuns} full ${lesson.fullRuns === 1 ? "run" : "runs"} finished`
                : "full run not finished",
            );
            return `${label} · ${parts.join(" · ")}`;
          })
        : lessonLabels(courses, visit).map(
            (label) =>
              `${label} · ${visit.exercisesCompleted} exercises · ${visit.listeningRuns} full runs`,
          );
    const capped = capItems(names);
    groups.push({ id: "listening", label: "Listening", ...capped });
  }

  if (visit.videos.length > 0) {
    const names = visit.videos.map((video) => {
      const played = formatActiveDuration(video.seconds);
      if (video.watched) return `${video.title} · ${played} · watched`;
      return `${video.title} · ${played} · left at ${formatClock(video.leftAtSeconds)}`;
    });
    const capped = capItems(names);
    groups.push({ id: "video", label: "Video", ...capped });
  }

  return groups;
}

function lessonFinished(detail: StudentDetail, lessonKey: string): boolean {
  if (lessonKey.startsWith("interview/")) {
    const course = detail.courses.find(
      (entry) => entry.id === lessonKey.slice("interview/".length),
    );
    return Boolean(course && course.totalLessons > 0 && course.completedLessons >= course.totalLessons);
  }
  const [levelSlug, chapterSlug] = lessonKey.split("/");
  if (!levelSlug || !chapterSlug) return false;
  const course = detail.courses.find((entry) => entry.id === levelSlug);
  const lesson = course?.lessons.find((entry) => entry.id === `${levelSlug}-${chapterSlug}`);
  return lesson?.status === "completed";
}

function abandonedVideo(
  visit: Visit,
): { playedSeconds: number; durationSeconds: number } | null {
  let best: { playedSeconds: number; durationSeconds: number } | null = null;
  for (const video of visit.videos) {
    if (video.watched || !video.durationSeconds || video.durationSeconds < 60) continue;
    if (video.seconds < 30 || video.seconds >= video.durationSeconds - 15) continue;
    const gap = video.durationSeconds - video.seconds;
    if (!best || gap > best.durationSeconds - best.playedSeconds) {
      best = { playedSeconds: video.seconds, durationSeconds: video.durationSeconds };
    }
  }
  return best;
}

function visitCountForLesson(visits: readonly Visit[], lessonKey: string, through: Visit): number {
  return visits.filter((visit) => {
    if (visit.startedAt > through.startedAt) return false;
    return visit.lessons.includes(lessonKey);
  }).length;
}

function emptyVisitMessage(range: AdminVisitRange): string {
  if (range === "today") return "No visits today.";
  if (range === "7d") return "No visits in the last 7 days.";
  return "No visits recorded yet.";
}

export function projectStudentVisits(
  courses: readonly AdminCatalogCourse[],
  progress: StoredProgress,
  range: AdminVisitRange,
  now = new Date(),
): AdminVisitLog {
  const detail = projectStudentDetail(courses, progress);
  const all = [...(progress.visits ?? [])].sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0,
  );
  const visits = selectVisits(progress, range, now).map((visit) => {
    const older = all.find(
      (entry) => entry.id !== visit.id && entry.startedAt < visit.startedAt,
    );
    let unfinishedLessonVisits: number | null = null;
    for (const lessonKey of visit.lessons) {
      if (lessonFinished(detail, lessonKey)) continue;
      const count = visitCountForLesson(all, lessonKey, visit);
      if (count >= 3 && (unfinishedLessonVisits == null || count > unfinishedLessonVisits)) {
        unfinishedLessonVisits = count;
      }
    }
    return {
      id: visit.id,
      headline: formatVisitHeadline(visit),
      lines: visitLines(courses, visit),
      signal: describeVisitSignal({
        daysSincePrevious: older ? daysBetweenUtc(older.endedAt, visit.startedAt) : null,
        unfinishedLessonVisits,
        abandonedVideo: abandonedVideo(visit),
      }),
      details: visitDetails(courses, visit),
    };
  });

  return {
    summary: summarizeVisits(progress, range, now),
    visits,
    emptyMessage: emptyVisitMessage(range),
  };
}

function visitLines(courses: readonly AdminCatalogCourse[], visit: Visit): string[] {
  const clipCount = visit.clips.length;
  const exercises = visit.exercisesCompleted;
  const runs = visit.listeningRuns;
  const videoSeconds = visit.videos.reduce((sum, video) => sum + video.seconds, 0);
  const watched = visit.videos.filter((video) => video.watched);
  const studied =
    clipCount > 0 || exercises > 0 || runs > 0 || videoSeconds >= 1 || watched.length > 0;
  if (!studied) return ["Opened the app, no study"];

  const lines: string[] = [];
  const labels = lessonLabels(courses, visit);
  if (labels.length > 0) lines.push(labels.join(", "));
  if (clipCount > 0) {
    lines.push(`${clipCount} ${clipCount === 1 ? "clip" : "clips"} studied`);
  }
  if (exercises > 0 || runs > 0) {
    const parts: string[] = [];
    if (exercises > 0) {
      parts.push(`${exercises} audio ${exercises === 1 ? "exercise" : "exercises"}`);
    }
    if (runs > 0) parts.push(`${runs} full ${runs === 1 ? "run" : "runs"}`);
    lines.push(parts.join(" · "));
  }
  if (videoSeconds >= 1 || watched.length > 0) {
    let line = `${formatActiveDuration(videoSeconds)} video`;
    if (watched.length === 1) line += ` · "${watched[0]?.title ?? "Video"}" marked watched`;
    else if (watched.length > 1) line += ` · ${watched.length} marked watched`;
    lines.push(line);
  }
  return lines;
}

export type ClassStatsMemberInput = {
  userId: string;
  displayName: string;
  email: string | null;
  lastLoginAt: string | null;
  streakDays: number;
  progress: StoredProgress;
};

export type ClassMemberStat = {
  userId: string;
  displayName: string;
  email: string | null;
  lastLoginAt: string | null;
  streakDays: number;
  coursesStarted: number;
  lessonsCompleted: number;
  listeningRepetitions: number;
  videosWatched: number;
};

export type ClassCourseStat = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "ausbildung" | "cefr";
  studentsStarted: number;
  studentCount: number;
  /** Mean completion across the whole class. Students who have not started count as 0. */
  averagePercent: number;
};

export type ClassStatsSnapshot = {
  studentCount: number;
  activeStreaks: number;
  averageStreak: number;
  coursesStarted: number;
  lessonsCompleted: number;
  listeningRepetitions: number;
  videosWatched: number;
  members: ClassMemberStat[];
  courses: ClassCourseStat[];
};

/** Headline stats for one class, using the same totals as a single student. */
export function buildClassStats(
  members: readonly ClassStatsMemberInput[],
  catalog: readonly AdminCatalogCourse[],
): ClassStatsSnapshot {
  const detailed = members.map((member) => ({
    member,
    detail: projectStudentDetail(catalog, member.progress),
  }));

  const studentCount = detailed.length;
  const activeStreaks = detailed.filter((item) => item.member.streakDays > 0).length;
  const streakSum = detailed.reduce((sum, item) => sum + item.member.streakDays, 0);
  const template = detailed[0]?.detail.courses ?? [];

  const courses: ClassCourseStat[] = template
    .filter((course) => course.totalLessons > 0)
    .map((course) => {
      let studentsStarted = 0;
      let percentSum = 0;
      for (const item of detailed) {
        const match = item.detail.courses.find((entry) => entry.id === course.id);
        if (!match) continue;
        percentSum += match.percent;
        if (match.started) studentsStarted += 1;
      }
      return {
        id: course.id,
        label: course.label,
        shortLabel: course.shortLabel,
        kind: course.kind,
        studentsStarted,
        studentCount,
        averagePercent: studentCount === 0 ? 0 : Math.round(percentSum / studentCount),
      };
    });

  return {
    studentCount,
    activeStreaks,
    averageStreak: studentCount === 0 ? 0 : Math.round(streakSum / studentCount),
    coursesStarted: detailed.reduce((sum, item) => sum + item.detail.coursesStarted, 0),
    lessonsCompleted: detailed.reduce((sum, item) => sum + item.detail.lessonsCompleted, 0),
    listeningRepetitions: detailed.reduce(
      (sum, item) => sum + item.detail.listeningRepetitions,
      0,
    ),
    videosWatched: detailed.reduce((sum, item) => sum + item.detail.videosWatched, 0),
    members: detailed.map(({ member, detail }) => ({
      userId: member.userId,
      displayName: member.displayName,
      email: member.email,
      lastLoginAt: member.lastLoginAt,
      streakDays: member.streakDays,
      coursesStarted: detail.coursesStarted,
      lessonsCompleted: detail.lessonsCompleted,
      listeningRepetitions: detail.listeningRepetitions,
      videosWatched: detail.videosWatched,
    })),
    courses,
  };
}
