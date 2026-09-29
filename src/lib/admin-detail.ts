import type {
  AdminInterviewErase,
  AdminLearnErase,
  AdminProgressClear,
  LearnProgress,
  StoredProgress,
  Visit,
  VisitSummary,
} from "@/lib/progress";
import {
  daysBetweenUtc,
  describeVisitSignal,
  formatActiveDuration,
  lessonVideoStatus,
  completedStudyPartCount,
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
    (entry.runClipOrder?.length ?? 0) > 0 ||
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
  const listeningStruggling =
    clipTotal > 0 && runCount >= STRUGGLE_RUNS && listeningStatus !== "completed";
  const studyParts = completedStudyPartCount(lesson.clips, [...reviewedIds]);
  const studyDone =
    studyCompletedOnce ||
    (studyParts.total > 0 && studyParts.done >= studyParts.total);
  const studyStatus: LessonStatus =
    clipTotal === 0
      ? "not-started"
      : studyDone
        ? "completed"
        : studyParts.done > 0
          ? "in-progress"
          : "not-started";
  const studyNote =
    studyRunCount > 0
      ? `${studyRunCount} study ${studyRunCount === 1 ? "run" : "runs"}`
      : null;
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
                  percent: studyDone ? 100 : percentOf(studyParts.done, studyParts.total),
                  progressLabel: studyDone ? "" : `${studyParts.done}/${studyParts.total}`,
                  note: studyNote,
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

export type AdminLevelPathPerson = {
  userId: string;
  displayName: string;
  image: string | null;
  className: string | null;
};

export type AdminLevelPathMember = AdminLevelPathPerson & {
  /** This student's projection of the level, or undefined when it is missing. */
  course: AdminCourseDetail | undefined;
};

export type AdminLevelPathNode = {
  id: string;
  icon: string;
  label: string;
  /** Students whose current node this is. */
  here: AdminLevelPathPerson[];
};

export type AdminLevelPathLesson = {
  id: string;
  label: string;
  nodes: AdminLevelPathNode[];
};

export type AdminLevelPath = {
  slug: string;
  label: string;
  /** Students with access who have started this level. */
  studentCount: number;
  lessons: AdminLevelPathLesson[];
  /** Students with nothing left to do in this level. */
  finished: AdminLevelPathPerson[];
};

type LevelNodeTemplate = {
  id: string;
  icon: string;
  label: string;
  kind: "video" | "activity";
};

/**
 * The trail the learner level overview draws: every video of a Lektion, then
 * Study, then Listening. Built from the catalog so every student is placed on
 * the same nodes regardless of what they have touched.
 */
function levelNodeTemplates(lesson: AdminCatalogLesson): LevelNodeTemplate[] {
  const videos = lesson.videos.map((video) => ({
    id: video.id,
    icon: "smart_display",
    label: video.title,
    kind: "video" as const,
  }));
  if (lesson.clips.length === 0) return videos;
  return [
    ...videos,
    ...(lesson.learnKey
      ? [
          {
            id: `${lesson.id}-study`,
            icon: "menu_book",
            label: "Study",
            kind: "activity" as const,
          },
        ]
      : []),
    {
      id: `${lesson.id}-listening`,
      icon: "headphones",
      label: "Listening",
      kind: "activity" as const,
    },
  ];
}

function nodeFinished(
  lesson: AdminLessonDetail | undefined,
  node: LevelNodeTemplate,
): boolean {
  if (!lesson) return false;
  if (node.kind === "video") {
    return lesson.videos.find((video) => video.id === node.id)?.status === "watched";
  }
  return (
    lesson.activities.find((activity) => activity.id === node.id)?.status === "completed"
  );
}

/**
 * The level overview trail with every student parked on the first node they
 * have not finished yet.
 */
export function buildLevelPath(
  courses: readonly AdminCatalogCourse[],
  levelSlug: string,
  members: readonly AdminLevelPathMember[],
): AdminLevelPath | null {
  const catalog = courses.find((course) => course.id === levelSlug);
  if (!catalog) return null;

  const started = members.filter((member) => member.course?.started);
  const lessons: AdminLevelPathLesson[] = catalog.lessons.map((lesson) => ({
    id: lesson.id,
    label: lesson.label,
    nodes: levelNodeTemplates(lesson).map((node) => ({
      id: node.id,
      icon: node.icon,
      label: node.label,
      here: [],
    })),
  }));
  const finished: AdminLevelPathPerson[] = [];

  for (const member of started) {
    const person: AdminLevelPathPerson = {
      userId: member.userId,
      displayName: member.displayName,
      image: member.image,
      className: member.className,
    };
    let placed = false;

    catalog.lessons.forEach((lesson, lessonIndex) => {
      const detail = member.course?.lessons.find((entry) => entry.id === lesson.id);
      levelNodeTemplates(lesson).forEach((node, nodeIndex) => {
        const target = lessons[lessonIndex]!.nodes[nodeIndex]!;
        if (nodeFinished(detail, node) || placed) return;
        target.here.push(person);
        placed = true;
      });
    });

    if (!placed) finished.push(person);
  }

  const studentCount = started.length;

  return {
    slug: catalog.id,
    label: catalog.label,
    studentCount,
    lessons,
    finished,
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

export function describeCatalogLesson(
  catalog: readonly AdminCatalogCourse[],
  lessonKey: string,
): { course: string; lesson: string } | null {
  for (const course of catalog) {
    for (const lesson of course.lessons) {
      if (lesson.videoKeyPrefix === lessonKey) {
        return { course: course.label, lesson: lesson.label };
      }
    }
  }
  return null;
}

export function describeCatalogClip(
  catalog: readonly AdminCatalogCourse[],
  lessonKey: string,
  clipId: string,
): { course: string; lesson: string; prompt: string } {
  for (const course of catalog) {
    for (const lesson of course.lessons) {
      if (lesson.videoKeyPrefix !== lessonKey) continue;
      const prompt = (lesson.clips.find((clip) => clip.id === clipId)?.prompt ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        course: course.label,
        lesson: lesson.label,
        prompt: prompt || clipId,
      };
    }
  }
  return { course: lessonKey, lesson: "", prompt: clipId };
}

export type StudentProgressPart = "study" | "listening" | { videoId: string };

/** What an admin is deleting from one student's stored progress. */
export type StudentProgressTarget =
  | { scope: "all" }
  | { scope: "course"; courseId: string }
  | { scope: "lesson"; courseId: string; lessonId: string }
  | { scope: "part"; courseId: string; lessonId: string; part: StudentProgressPart };

export type ProgressHistoryWipe = {
  /** Listening-run lesson keys, or every run this student has stored. */
  runs: "all" | string[];
  /** Studied-clip lesson keys, or every clip this student has stored. */
  studied: "all" | string[];
  /** Study-XP lesson keys, or every study award this student has stored. */
  studyXp: "all" | string[];
};

type ProgressEraseSlice = {
  learn: AdminLearnErase[];
  videoKeys: string[];
  videoPrefixes: string[];
  interview: AdminInterviewErase[];
  visitLessons: string[];
  visitStudy: boolean;
  visitListening: boolean;
  visitVideo: boolean;
  runs: string[];
  studied: string[];
  studyXp: string[];
};

function emptyEraseSlice(): ProgressEraseSlice {
  return {
    learn: [],
    videoKeys: [],
    videoPrefixes: [],
    interview: [],
    visitLessons: [],
    visitStudy: false,
    visitListening: false,
    visitVideo: false,
    runs: [],
    studied: [],
    studyXp: [],
  };
}

function pushUnique(list: string[], value: string | undefined): void {
  if (!value || list.includes(value)) return;
  list.push(value);
}

function addLearnErase(
  slice: ProgressEraseSlice,
  key: string | undefined,
  clipIds: readonly string[],
  study: boolean,
  listening: boolean,
): void {
  if (!key || (!study && !listening)) return;
  const existing = slice.learn.find((entry) => entry.key === key);
  if (!existing) {
    slice.learn.push({ key, clipIds: [...clipIds], study, listening });
    return;
  }
  for (const id of clipIds) {
    if (!existing.clipIds.includes(id)) existing.clipIds.push(id);
  }
  existing.study = existing.study || study;
  existing.listening = existing.listening || listening;
}

function addLessonErase(
  slice: ProgressEraseSlice,
  lesson: AdminCatalogLesson,
  part: "all" | StudentProgressPart,
): void {
  const clipIds = lesson.clips.map((clip) => clip.id);
  const visitKey = lesson.videoKeyPrefix;
  const study = part === "all" || part === "study";
  const listening = part === "all" || part === "listening";
  const video = part === "all" || typeof part === "object";

  if (lesson.learnKey && (study || listening) && clipIds.length > 0) {
    addLearnErase(slice, lesson.learnKey, clipIds, study, listening);
    if (study) {
      pushUnique(slice.studied, visitKey);
      pushUnique(slice.studyXp, visitKey);
    }
    if (listening) {
      pushUnique(slice.runs, visitKey);
      pushUnique(slice.studied, visitKey);
    }
  }

  if (lesson.interviewSlug && listening) {
    const existing = slice.interview.find((entry) => entry.slug === lesson.interviewSlug);
    if (!existing) {
      slice.interview.push({ slug: lesson.interviewSlug, clipIds: [...clipIds] });
    } else if (existing.clipIds) {
      for (const id of clipIds) {
        if (!existing.clipIds.includes(id)) existing.clipIds.push(id);
      }
    }
  }

  if (video && lesson.videoKeyPrefix) {
    if (part === "all") {
      pushUnique(slice.videoPrefixes, `${lesson.videoKeyPrefix}/`);
    } else if (typeof part === "object") {
      const known = lesson.videos.some((entry) => entry.id === part.videoId);
      if (known) pushUnique(slice.videoKeys, `${lesson.videoKeyPrefix}/${part.videoId}`);
    }
  }

  if (!visitKey) return;
  if (study && lesson.learnKey) {
    slice.visitStudy = true;
    pushUnique(slice.visitLessons, visitKey);
  }
  if (listening && lesson.learnKey) {
    slice.visitListening = true;
    pushUnique(slice.visitLessons, visitKey);
  }
  if (video && (part === "all" || slice.videoKeys.length > 0)) {
    slice.visitVideo = true;
  }
}

function sliceToClear(
  slice: ProgressEraseSlice,
  id: string,
  at: string,
): AdminProgressClear | null {
  const clear: AdminProgressClear = {
    id,
    at,
    scope: "scoped",
    ...(slice.learn.length ? { learn: slice.learn } : {}),
    ...(slice.videoKeys.length ? { videoKeys: slice.videoKeys } : {}),
    ...(slice.videoPrefixes.length ? { videoPrefixes: slice.videoPrefixes } : {}),
    ...(slice.interview.length ? { interview: slice.interview } : {}),
    ...(slice.visitLessons.length ? { visitLessons: slice.visitLessons } : {}),
    ...(slice.visitStudy ? { visitStudy: true } : {}),
    ...(slice.visitListening ? { visitListening: true } : {}),
    ...(slice.visitVideo ? { visitVideo: true } : {}),
  };
  if (
    !clear.learn &&
    !clear.videoKeys &&
    !clear.videoPrefixes &&
    !clear.interview &&
    !clear.visitLessons
  ) {
    return null;
  }
  return clear;
}

function findCatalogLesson(
  catalog: readonly AdminCatalogCourse[],
  courseId: string,
  lessonId: string,
): { course: AdminCatalogCourse; lesson: AdminCatalogLesson } | null {
  const course = catalog.find((entry) => entry.id === courseId);
  const lesson = course?.lessons.find((entry) => entry.id === lessonId);
  if (!course || !lesson) return null;
  return { course, lesson };
}

/**
 * The stored deletion for one admin target, plus which listening-run and
 * studied-clip rows to remove. Returns null when the target is not in the catalog.
 */
export function studentProgressClear(
  catalog: readonly AdminCatalogCourse[],
  target: StudentProgressTarget,
  id: string,
  at: string,
): { clear: AdminProgressClear; history: ProgressHistoryWipe } | null {
  if (target.scope === "all") {
    return {
      clear: { id, at, scope: "all" },
      history: { runs: "all", studied: "all", studyXp: "all" },
    };
  }

  if (target.scope === "course") {
    const course = catalog.find((entry) => entry.id === target.courseId);
    if (!course) return null;
    if (course.kind === "ausbildung") {
      const slug = course.lessons.find((lesson) => lesson.interviewSlug)?.interviewSlug ?? course.id;
      return {
        clear: {
          id,
          at,
          scope: "scoped",
          interview: [{ slug, clipIds: null }],
          visitLessons: [`interview/${slug}`],
          visitStudy: true,
          visitListening: true,
        },
        history: { runs: [], studied: [], studyXp: [] },
      };
    }
    const slice = emptyEraseSlice();
    for (const lesson of course.lessons) addLessonErase(slice, lesson, "all");
    const clear = sliceToClear(slice, id, at);
    if (!clear) return null;
    return {
      clear,
      history: { runs: slice.runs, studied: slice.studied, studyXp: slice.studyXp },
    };
  }

  const found =
    target.scope === "lesson" || target.scope === "part"
      ? findCatalogLesson(catalog, target.courseId, target.lessonId)
      : null;
  if (!found) return null;

  if (target.scope === "lesson") {
    if (found.course.kind === "ausbildung" && found.lesson.interviewSlug) {
      return {
        clear: {
          id,
          at,
          scope: "scoped",
          interview: [
            {
              slug: found.lesson.interviewSlug,
              clipIds: found.lesson.clips.map((clip) => clip.id),
            },
          ],
        },
        history: { runs: [], studied: [], studyXp: [] },
      };
    }
    const slice = emptyEraseSlice();
    addLessonErase(slice, found.lesson, "all");
    const clear = sliceToClear(slice, id, at);
    if (!clear) return null;
    return {
      clear,
      history: { runs: slice.runs, studied: slice.studied, studyXp: slice.studyXp },
    };
  }

  const part = target.part;
  if (typeof part === "object") {
    const videoId = part.videoId;
    const known = found.lesson.videos.some((video) => video.id === videoId);
    if (!known || !found.lesson.videoKeyPrefix) return null;
  } else if (part === "study" && !found.lesson.learnKey) {
    return null;
  } else if (part === "listening" && found.lesson.clips.length === 0) {
    return null;
  }

  if (found.course.kind === "ausbildung" && part === "listening" && found.lesson.interviewSlug) {
    return {
      clear: {
        id,
        at,
        scope: "scoped",
        interview: [
          {
            slug: found.lesson.interviewSlug,
            clipIds: found.lesson.clips.map((clip) => clip.id),
          },
        ],
      },
      history: { runs: [], studied: [], studyXp: [] },
    };
  }

  const slice = emptyEraseSlice();
  addLessonErase(slice, found.lesson, part);
  const clear = sliceToClear(slice, id, at);
  if (!clear) return null;
  return {
    clear,
    history: { runs: slice.runs, studied: slice.studied, studyXp: slice.studyXp },
  };
}
