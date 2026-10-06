import type {
  AdminInterviewErase,
  AdminLearnErase,
  AdminProgressClear,
  LearnProgress,
  StoredProgress,
  Visit,
  VisitExerciseLesson,
  VisitSummary,
} from "@/lib/progress";
import {
  daysBetweenUtc,
  describeVisitSignal,
  formatActiveDuration,
  lessonVideoStatus,
  completedStudyPartCount,
  lessonNodeActivityId,
  lessonNodeParts,
  lessonPathNodes,
  listeningPartCount,
  selectVisits,
  splitStudyParts,
  summarizeVisits,
  type PracticeNodePart,
  type VisitRange,
} from "@/lib/progress";
import { dayKey, weekKey } from "@/lib/xp";
import { onboardingSkipLine } from "@/lib/onboarding";
import {
  grammarActivityId,
  grammarNodeProgress,
  type GrammarNodeKind,
  type GrammarNodeLayout,
} from "@/lib/grammar-node";

export type AdminCatalogCard = {
  id: string;
  prompt: string;
};

export type AdminCatalogVideo = {
  id: string;
  title: string;
  titleVi: string;
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
  /** Practice cards across every part of this lesson. */
  practiceCards?: number;
  /**
   * CEFR Lektion drawn as alternating Study and Practice nodes of a few parts
   * each. Without it the lesson is one Study and one Practice node.
   */
  pathNodes?: boolean;
  /** Practice cards per practice node, in trail order. */
  nodePracticeCards?: number[];
  /** Practice parts per practice node, cut from that node's cards. */
  practiceNodeParts?: PracticeNodePart[][];
  /** Grammar topics of this Lektion. Each is a study node and a practice node after the clip nodes. */
  grammarNodes?: GrammarNodeLayout[];
};

export type AdminCatalogCourse = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "ausbildung" | "cefr";
  /** Leben-in-Deutschland workplace. Tracked like a CEFR level (study + practice per scene). */
  living?: boolean;
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
  /** Completed parts of this node. The learn path draws one ring segment per part. */
  partsDone: number;
  partCount: number;
  /** Extra stored context, such as how many full listening or study runs. */
  note: string | null;
  struggling: boolean;
  /** This node was unfinished until a jump test marked it done. */
  skipped?: boolean;
};

export type AdminVideoDetail = {
  id: string;
  title: string;
  titleVi: string;
  status: "not-started" | "in-progress" | "watched";
  positionSeconds: number;
  updatedAt: string | null;
  watchedAt: string | null;
  /** The jump test marked this video watched. */
  skipped?: boolean;
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
  /** When a passed jump test completed this Lektion. Null when it was worked through. */
  skippedAt?: string | null;
  /** Hub cards on this Lektion. Individual exercises are not listed. */
  activities: AdminActivityCard[];
  videos: AdminVideoDetail[];
};

export type AdminCourseDetail = {
  id: string;
  label: string;
  shortLabel: string;
  kind: "ausbildung" | "cefr";
  /** Leben-in-Deutschland workplace, granted on its own. */
  living?: boolean;
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
    Boolean(entry.studyCompletedAt) ||
    (entry.grammarPartKeys?.length ?? 0) > 0
  );
}

/**
 * The Lektion's grammar nodes: study then practice per topic. A passed jump
 * marks unfinished ones done, as skipped.
 */
function grammarActivities(lesson: AdminCatalogLesson, learn: LearnProgress | undefined): AdminActivityCard[] {
  const layouts = lesson.grammarNodes ?? [];
  const doneKeys = learn?.grammarPartKeys ?? [];
  return layouts.flatMap((layout) =>
    (["study", "practice"] as const satisfies readonly GrammarNodeKind[]).map((kind) => {
      const node = grammarNodeProgress(layout, kind, doneKeys);
      const partCount = node.partDone.length;
      const skipped = !node.done && Boolean(learn?.skippedAt);
      const done = node.done || skipped;
      const topic = layouts.length > 1 ? ` · ${layout.titleVi}` : "";
      return {
        id: grammarActivityId(lesson.id, kind, layout.topicId),
        label: `${kind === "study" ? "Grammar study" : "Grammar practice"}${topic}`,
        status: done ? "completed" : node.partsDone > 0 ? "in-progress" : "not-started",
        percent: done ? 100 : percentOf(node.partsDone, partCount),
        progressLabel: done ? "" : `${node.partsDone}/${partCount}`,
        partsDone: done ? partCount : node.partsDone,
        partCount,
        note: null,
        struggling: false,
        skipped,
      } satisfies AdminActivityCard;
    }),
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

/** True when this side was already finished before the jump stamped the Lektion. */
function finishedBeforeJump(
  learn: LearnProgress | undefined,
  kind: "study" | "practice",
): boolean {
  if (!learn?.skippedAt) return false;
  if (kind === "study") {
    if (learn.studyCompletedAt && learn.studyCompletedAt !== learn.skippedAt) return true;
    return learn.studyRunCount > 1;
  }
  if (learn.completedAt && learn.completedAt !== learn.skippedAt) return true;
  return learn.runCount > 1;
}

/** The jump wrote the only run, so the meter should not call it a study or practice run. */
function jumpCreatedRun(
  learn: LearnProgress | undefined,
  kind: "study" | "practice",
  runCount: number,
): boolean {
  return Boolean(learn?.skippedAt) && !finishedBeforeJump(learn, kind) && runCount <= 1;
}

function runNote(count: number, kind: "study" | "practice", show: boolean): string | null {
  if (!show || count <= 0) return null;
  const noun = kind === "study" ? "study" : "practice";
  return `${count} ${noun} ${count === 1 ? "run" : "runs"}`;
}

/**
 * Nodes that were still open when the jump passed. Null when the skip was
 * saved before those clips were stored; then the whole unfinished side counts.
 */
function nodesSkippedByJump(
  lesson: AdminCatalogLesson,
  learn: LearnProgress | undefined,
  reviewedIds: ReadonlySet<string>,
  passedIds: ReadonlySet<string>,
): { study: Set<number>; practice: Set<number> } | null {
  if (!learn?.skippedAt || !learn.jumpSkip || !lesson.pathNodes) return null;
  const studySkipped = new Set(learn.jumpSkip.studyClipIds);
  const practiceSkipped = new Set(learn.jumpSkip.practiceClipIds);
  const nodes = lessonPathNodes(lesson.clips, {
    reviewedClipIds: [...reviewedIds].filter((id) => !studySkipped.has(id)),
    completedClipIds: [...passedIds].filter((id) => !practiceSkipped.has(id)),
    studyFinished: finishedBeforeJump(learn, "study"),
    practiceFinished: finishedBeforeJump(learn, "practice"),
    practiceParts: lesson.practiceNodeParts,
    practicePartKeys: learn.practicePartKeys,
  });
  return {
    study: new Set(
      nodes.filter((node) => node.kind === "study" && !node.done).map((node) => node.node),
    ),
    practice: new Set(
      nodes.filter((node) => node.kind === "practice" && !node.done).map((node) => node.node),
    ),
  };
}

function nodeSkippedByJump(
  learn: LearnProgress | undefined,
  kind: "study" | "practice",
  node: number,
  precise: { study: Set<number>; practice: Set<number> } | null,
): boolean {
  if (!learn?.skippedAt) return false;
  if (precise) return precise[kind].has(node);
  return !finishedBeforeJump(learn, kind);
}

function videoSkippedByJump(
  learn: LearnProgress | undefined,
  key: string,
  watchedAt: string | null,
): boolean {
  if (!learn?.skippedAt || !key || !watchedAt) return false;
  if (learn.jumpSkip) return learn.jumpSkip.videoKeys.includes(key);
  return watchedAt === learn.skippedAt;
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
    const watchedAt = entry?.watchedAt ?? null;
    return {
      id: video.id,
      title: video.title,
      titleVi: video.titleVi,
      status: lessonVideoStatus(entry),
      positionSeconds: entry?.positionSeconds ?? 0,
      updatedAt: entry?.updatedAt || null,
      watchedAt,
      skipped: videoSkippedByJump(learn, key, watchedAt),
    };
  });
  const videoTouched = videos.some((video) => video.status !== "not-started");
  const listeningTouched = Boolean(learn && learnTouched(learn));
  const cardsComplete = clipTotal === 0 || completedCount >= clipTotal;
  const videosComplete =
    videos.length === 0 || videos.every((video) => video.status === "watched");
  const touched = listeningTouched || videoTouched || completedCount > 0 || reviewedCount > 0;
  const grammar = grammarActivities(lesson, learn);
  const grammarComplete = grammar.every((activity) => activity.status === "completed");
  const hasItems = clipTotal > 0 || videos.length > 0 || grammar.length > 0;

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
  const studyNote = runNote(studyRunCount, "study", !jumpCreatedRun(learn, "study", studyRunCount));
  const practiceNote = runNote(runCount, "practice", !jumpCreatedRun(learn, "practice", runCount));
  const skippedNodes = nodesSkippedByJump(lesson, learn, reviewedIds, passedIds);
  const pathNodes =
    lesson.pathNodes && lesson.learnKey && clipTotal > 0
      ? lessonPathNodes(lesson.clips, {
          reviewedClipIds: [...reviewedIds],
          completedClipIds: [...passedIds],
          studyFinished: studyCompletedOnce,
          practiceFinished: listeningCompletedOnce,
          practiceParts: lesson.practiceNodeParts,
          practicePartKeys: learn?.practicePartKeys,
        })
      : null;
  const clipActivities: AdminActivityCard[] = pathNodes
    ? pathNodes.map((node) => {
        const study = node.kind === "study";
        const lastOfKind = node.node === node.nodeCount;
        const status: LessonStatus = node.done
          ? "completed"
          : node.clipsDone > 0
            ? "in-progress"
            : "not-started";
        const numbered = node.nodeCount > 1 ? ` ${node.node}` : "";
        return {
          id: lessonNodeActivityId(lesson.id, node.kind, node.node, node.nodeCount),
          label: `${study ? "Study" : "Practice"}${numbered}`,
          status,
          percent: node.done ? 100 : percentOf(node.clipsDone, node.clipCount),
          progressLabel: node.done
            ? ""
            : study
              ? `${node.partsDone}/${node.parts.length}`
              : `${node.clipsDone}/${node.clipCount}`,
          partsDone: node.partsDone,
          partCount: node.parts.length,
          note: lastOfKind ? (study ? studyNote : practiceNote) : null,
          struggling: !study && !node.done && listeningStruggling,
          skipped: nodeSkippedByJump(learn, study ? "study" : "practice", node.node, skippedNodes),
        } satisfies AdminActivityCard;
      })
    : clipTotal === 0
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
                  partsDone: studyDone ? studyParts.total : studyParts.done,
                  partCount: studyParts.total,
                  note: studyNote,
                  struggling: false,
                  skipped: nodeSkippedByJump(learn, "study", 1, skippedNodes),
                } satisfies AdminActivityCard,
              ]
            : []),
          {
            id: `${lesson.id}-listening`,
            label: "Practice",
            status: listeningStatus,
            percent: listeningCompletedOnce ? 100 : percentOf(completedCount, clipTotal),
            progressLabel: listeningCompletedOnce ? "" : `${completedCount}/${clipTotal}`,
            partsDone: 0,
            partCount: 0,
            note: practiceNote,
            struggling: listeningStruggling,
            skipped: nodeSkippedByJump(learn, "practice", 1, skippedNodes),
          },
        ];

  const activities = [...clipActivities, ...grammar];

  // Calculate if everything inside this lesson is completed
  const allVideosCompleted = videos.length === 0 || videos.every((v) => v.status === "watched");
  const allActivitiesCompleted = activities.length === 0 || activities.every((a) => a.status === "completed");
  const isFullyCompleted = hasItems && allVideosCompleted && allActivitiesCompleted;

  const status: LessonStatus = !hasItems
    ? learn?.completedAt
      ? "completed"
      : "not-started"
    : isFullyCompleted ||
        (cardsComplete && videosComplete && grammarComplete && (touched || Boolean(learn?.completedAt)))
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
    skippedAt: learn?.skippedAt ?? null,
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
      living: course.living === true,
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
  kind: "video" | "study" | "practice";
  /** Study clip count or practice card count. Videos leave this empty. */
  count: number | null;
  /** Study or practice parts on this node. Videos are 0. */
  parts: number;
  /** `${level}/${chapter}/${videoId}` so a length can be read from loaded playback. */
  videoKey: string | null;
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
  kind: "video" | "study" | "practice";
  count: number | null;
  parts: number;
  videoKey: string | null;
};

/**
 * The trail the learner level overview draws: every video of a Lektion, then
 * Study and Listening, or alternating Study and Listening nodes on a CEFR Lektion. Built from the catalog so every student is placed on
 * the same nodes regardless of what they have touched.
 */
function levelNodeTemplates(lesson: AdminCatalogLesson): LevelNodeTemplate[] {
  const videos = lesson.videos.map((video) => ({
    id: video.id,
    icon: "smart_display",
    label: video.title,
    kind: "video" as const,
    count: null,
    parts: 0,
    videoKey: lesson.videoKeyPrefix ? `${lesson.videoKeyPrefix}/${video.id}` : null,
  }));
  if (lesson.clips.length === 0) return videos;
  if (lesson.pathNodes && lesson.learnKey) {
    const groups = lessonNodeParts(lesson.clips);
    const nodeCount = groups.length;
    const numbered = (node: number) => (nodeCount > 1 ? ` ${node}` : "");
    return [
      ...videos,
      ...groups.flatMap((parts, index) => {
        const node = index + 1;
        return [
          {
            id: lessonNodeActivityId(lesson.id, "study", node, nodeCount),
            icon: "menu_book",
            label: `Study${numbered(node)}`,
            kind: "study" as const,
            count: parts.reduce((sum, part) => sum + part.length, 0),
            parts: parts.length,
            videoKey: null,
          },
          {
            id: lessonNodeActivityId(lesson.id, "practice", node, nodeCount),
            icon: "headphones",
            label: `Practice${numbered(node)}`,
            kind: "practice" as const,
            count: lesson.nodePracticeCards?.[index] ?? null,
            parts: lesson.practiceNodeParts?.[index]?.length ?? parts.length,
            videoKey: null,
          },
        ];
      }),
    ];
  }
  return [
    ...videos,
    ...(lesson.learnKey
      ? [
          {
            id: `${lesson.id}-study`,
            icon: "menu_book",
            label: "Study",
            kind: "study" as const,
            count: lesson.clips.length,
            parts: splitStudyParts(lesson.clips).length,
            videoKey: null,
          },
        ]
      : []),
    {
      id: `${lesson.id}-listening`,
      icon: "headphones",
      label: "Practice",
      kind: "practice" as const,
      count: lesson.practiceCards ?? null,
      parts: listeningPartCount(lesson.practiceCards ?? 0),
      videoKey: null,
    },
  ];
}

function nodeStatus(
  lesson: AdminLessonDetail | undefined,
  node: LevelNodeTemplate,
): LessonStatus | AdminVideoDetail["status"] | undefined {
  if (!lesson) return undefined;
  if (node.kind === "video") {
    return lesson.videos.find((video) => video.id === node.id)?.status;
  }
  return lesson.activities.find((activity) => activity.id === node.id)?.status;
}

function nodeFinished(
  lesson: AdminLessonDetail | undefined,
  node: LevelNodeTemplate,
): boolean {
  const status = nodeStatus(lesson, node);
  return status === "watched" || status === "completed";
}

function nodeStarted(
  lesson: AdminLessonDetail | undefined,
  node: LevelNodeTemplate,
): boolean {
  const status = nodeStatus(lesson, node);
  return status != null && status !== "not-started";
}

/**
 * The level overview trail with every student parked on the latest node they
 * have started. A student who has finished every node leaves the trail.
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
      kind: node.kind,
      count: node.count,
      parts: node.parts,
      videoKey: node.videoKey,
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
    let latest: { lessonIndex: number; nodeIndex: number } | null = null;
    let unfinished = false;

    for (let lessonIndex = 0; lessonIndex < catalog.lessons.length; lessonIndex++) {
      const lesson = catalog.lessons[lessonIndex]!;
      const detail = member.course?.lessons.find((entry) => entry.id === lesson.id);
      const nodes = levelNodeTemplates(lesson);
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex]!;
        if (!nodeFinished(detail, node)) unfinished = true;
        if (nodeStarted(detail, node)) latest = { lessonIndex, nodeIndex };
      }
    }

    if (latest && unfinished) {
      lessons[latest.lessonIndex]!.nodes[latest.nodeIndex]!.here.push(person);
    } else if (!unfinished) {
      finished.push(person);
    }
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

export type AdminVisitDetailTone = "neutral" | "success" | "warning";

export type AdminVisitDetailItem = {
  title: string;
  context: string | null;
  facts: string[];
  tone: AdminVisitDetailTone;
  /** 0–100 when the item has a measurable share done (clips of a part, minutes of a video). */
  percent: number | null;
};

export type AdminVisitDetailGroup = {
  id: "study" | "listening" | "left" | "video" | "jump";
  label: string;
  items: AdminVisitDetailItem[];
  extraCount: number;
};

export type AdminVisitStats = {
  clipsStudied: number;
  practiceClips: number;
  /** Study parts whose clips were all reviewed in this visit. */
  studyParts: number;
  /** Practice parts finished in this visit. A replay of the same part counts again. */
  practiceParts: number;
  practiceRuns: number;
  leftUnfinished: number;
  videoSeconds: number;
  videosWatched: number;
  /** Jump tests finished in this visit. */
  jumps: number;
  jumpsPassed: number;
};

export type AdminVisitSignalKind = "returning" | "stuck" | "video";

export type AdminVisitRow = {
  id: string;
  headline: string;
  /** Local calendar day the visit started, e.g. "Mon 5 Oct". */
  day: string;
  /** Local clock range, e.g. "09:12–09:40". */
  timeRange: string;
  activeSeconds: number;
  idle: boolean;
  lessons: string[];
  stats: AdminVisitStats;
  lines: string[];
  /** "Onboarding completed" or "Onboarding skipped because …". Null when neither happened. */
  onboarding: string | null;
  signal: string | null;
  signalKind: AdminVisitSignalKind | null;
  details: AdminVisitDetailGroup[];
};

/** What a student did in one hour, day or week of the visit chart, by visit start time. */
export type AdminVisitChartPoint = {
  label: string;
  visits: number;
  activeMinutes: number;
  videoMinutes: number;
  studyParts: number;
  practiceParts: number;
  practiceRuns: number;
  leftUnfinished: number;
  videosWatched: number;
  wrongAttempts: number;
  /** XP awarded in this slot, by award time rather than visit start. */
  xp: number;
};

export type AdminXpSource = "practice" | "review" | "study" | "jump" | "duel" | "quest";

/** One XP award from any source, with when it was given. Keys are Vietnam day and week. */
export type AdminXpEvent = {
  xp: number;
  at: string;
  source: AdminXpSource;
  dayKey: string | null;
  weekKey: string | null;
  lessonKey: string | null;
};

export const ADMIN_XP_SOURCE_LABEL: Record<AdminXpSource, string> = {
  practice: "Listening practice",
  review: "Practice review",
  study: "Study parts",
  jump: "Lesson jump",
  duel: "Duels",
  quest: "Daily quests",
};

export type AdminXpSourceTotal = { source: AdminXpSource; label: string; xp: number; awards: number };

export type AdminStudentXpSummary = {
  total: number;
  week: number;
  today: number;
  awards: number;
  /** Sources that paid anything, most XP first. */
  sources: AdminXpSourceTotal[];
  /** Lessons that paid the most XP, all time. */
  lessons: { lessonKey: string; label: string; xp: number }[];
};

const XP_SUMMARY_LESSON_LIMIT = 5;

/** All-time, this-week and today XP for one learner, split by where it came from. */
export function summarizeStudentXp(
  courses: readonly AdminCatalogCourse[],
  events: readonly AdminXpEvent[],
  now = new Date(),
): AdminStudentXpSummary {
  const todayKey = dayKey(now);
  const currentWeek = weekKey(now);
  const bySource = new Map<AdminXpSource, AdminXpSourceTotal>();
  const byLesson = new Map<string, number>();
  let total = 0;
  let week = 0;
  let today = 0;
  for (const event of events) {
    total += event.xp;
    const at = new Date(event.at);
    if ((event.weekKey ?? weekKey(at)) === currentWeek) week += event.xp;
    if ((event.dayKey ?? dayKey(at)) === todayKey) today += event.xp;
    const entry = bySource.get(event.source) ?? {
      source: event.source,
      label: ADMIN_XP_SOURCE_LABEL[event.source],
      xp: 0,
      awards: 0,
    };
    entry.xp += event.xp;
    entry.awards += 1;
    bySource.set(event.source, entry);
    if (event.lessonKey) byLesson.set(event.lessonKey, (byLesson.get(event.lessonKey) ?? 0) + event.xp);
  }
  return {
    total,
    week,
    today,
    awards: events.length,
    sources: [...bySource.values()].sort((a, b) => b.xp - a.xp),
    lessons: [...byLesson.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, XP_SUMMARY_LESSON_LIMIT)
      .map(([lessonKey, xp]) => ({ lessonKey, label: catalogLesson(courses, lessonKey).lessonLabel, xp })),
  };
}

export type AdminVisitLog = {
  summary: VisitSummary;
  visits: AdminVisitRow[];
  chart: AdminVisitChartPoint[];
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

function visitWhen(visit: Visit): { day: string; timeRange: string } {
  const start = new Date(visit.startedAt);
  const end = new Date(visit.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { day: "Visit", timeRange: "" };
  }
  const clock = (date: Date) =>
    `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  const day = `${WEEKDAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}`;
  const endLabel =
    start.toDateString() === end.toDateString()
      ? clock(end)
      : `${WEEKDAYS[end.getDay()]} ${clock(end)}`;
  return { day, timeRange: `${clock(start)}–${endLabel}` };
}

function formatVisitHeadline(visit: Visit): string {
  const { day, timeRange } = visitWhen(visit);
  if (!timeRange) return day;
  return `${day} · ${timeRange} · ${formatActiveDuration(visit.activeSeconds)}`;
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
  // Level progress keys equal the chapter slug. Living scenes are found by their full lesson key.
  const lesson =
    course?.lessons.find(
      (entry) => entry.learnKey === chapterSlug || entry.videoKeyPrefix === lessonKey,
    ) ?? null;
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

function capItems<T>(items: T[]): { items: T[]; extraCount: number } {
  if (items.length <= VISIT_NAME_CAP) return { items, extraCount: 0 };
  return {
    items: items.slice(0, VISIT_NAME_CAP),
    extraCount: items.length - VISIT_NAME_CAP,
  };
}

function sharePercent(done: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function visitDetails(
  courses: readonly AdminCatalogCourse[],
  visit: Visit,
): AdminVisitDetailGroup[] {
  const groups: AdminVisitDetailGroup[] = [];
  if (visit.clips.length > 0) {
    const items = visit.clips.map((clip): AdminVisitDetailItem => {
      const found = catalogLesson(courses, clip.lessonKey);
      return {
        title: clipTitle(found.lesson, clip.clipId),
        context: found.lessonLabel,
        facts: [],
        tone: "neutral",
        percent: null,
      };
    });
    groups.push({ id: "study", label: "Study", ...capItems(items) });
  }

  const exerciseLessons = visit.exerciseLessons ?? [];
  if (exerciseLessons.length > 0 || visit.exercisesCompleted > 0 || visit.listeningRuns > 0) {
    const items: AdminVisitDetailItem[] =
      exerciseLessons.length > 0
        ? exerciseLessons.map((lesson) => {
            const facts: string[] = [];
            const parts = practicePartsForLesson(courses, lesson);
            if (parts > 0) {
              facts.push(
                `${parts} practice ${parts === 1 ? "part" : "parts"} finished`,
              );
            } else if (lesson.completed > 0) {
              facts.push(
                `${lesson.completed} practice ${lesson.completed === 1 ? "clip" : "clips"} completed`,
              );
            }
            facts.push(
              lesson.fullRuns > 0
                ? `${lesson.fullRuns} practice ${lesson.fullRuns === 1 ? "run" : "runs"} finished`
                : "practice run not finished",
            );
            return {
              title: catalogLesson(courses, lesson.lessonKey).lessonLabel,
              context: null,
              facts,
              tone: lesson.fullRuns > 0 ? "success" : "warning",
              percent: null,
            };
          })
        : lessonLabels(courses, visit).map((label) => ({
            title: label,
            context: null,
            facts: [
              `${visit.exercisesCompleted} practice clips completed`,
              `${visit.listeningRuns} practice runs`,
            ],
            tone: "neutral",
            percent: null,
          }));
    groups.push({ id: "listening", label: "Practice", ...capItems(items) });
  }

  const leftSessions = visit.leftSessions ?? [];
  if (leftSessions.length > 0) {
    const items = leftSessions.map((session): AdminVisitDetailItem => {
      const mode = session.kind === "study" ? "Study" : "Practice";
      return {
        title: catalogLesson(courses, session.lessonKey).lessonLabel,
        context: null,
        facts: [
          `${mode} part ${session.partNumber} of ${session.partCount}`,
          `Left after ${session.clipsDone} of ${session.clipCount} clips`,
        ],
        tone: "warning",
        percent: sharePercent(session.clipsDone, session.clipCount),
      };
    });
    groups.push({ id: "left", label: "Left unfinished", ...capItems(items) });
  }

  const jumps = visit.jumps ?? [];
  if (jumps.length > 0) {
    const items = jumps.map((jump): AdminVisitDetailItem => ({
      title: catalogLesson(courses, jump.lessonKey).lessonLabel,
      context: null,
      facts: [jump.passed ? "Passed the jump test" : "Failed the jump test"],
      tone: jump.passed ? "success" : "warning",
      percent: null,
    }));
    groups.push({ id: "jump", label: "Jump", ...capItems(items) });
  }

  if (visit.videos.length > 0) {
    const items = visit.videos.map((video): AdminVisitDetailItem => {
      const played = formatActiveDuration(video.seconds);
      return {
        title: video.title,
        context: null,
        facts: video.watched
          ? [`${played} played`, "Watched"]
          : [`${played} played`, `Left at ${formatClock(video.leftAtSeconds)}`],
        tone: video.watched ? "success" : "warning",
        percent: video.watched
          ? 100
          : sharePercent(video.leftAtSeconds, video.durationSeconds ?? 0),
      };
    });
    groups.push({ id: "video", label: "Video", ...capItems(items) });
  }

  return groups;
}

/**
 * Whole parts that fit in a clip total.
 * Parts of one lesson differ in length by at most one, so each total belongs
 * to one part count. A few clips past that total are not another part.
 */
function partsCoveredByClips(sizes: readonly number[], clipsDone: number): number {
  if (clipsDone <= 0) return 0;
  const positive = sizes.filter((size) => size > 0);
  if (positive.length === 0) return 0;
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  for (let count = Math.floor(clipsDone / min); count >= 1; count -= 1) {
    const low = count * min;
    const high = count * max;
    if (clipsDone >= low && clipsDone <= high) return count;
    if (clipsDone > high && clipsDone - high < min) return count;
  }
  return 0;
}

function studyPartsFinished(
  courses: readonly AdminCatalogCourse[],
  visit: Visit,
): number {
  const byLesson = new Map<string, Set<string>>();
  for (const clip of visit.clips) {
    const ids = byLesson.get(clip.lessonKey) ?? new Set<string>();
    ids.add(clip.clipId);
    byLesson.set(clip.lessonKey, ids);
  }
  let count = 0;
  for (const [lessonKey, ids] of byLesson) {
    const lesson = catalogLesson(courses, lessonKey).lesson;
    if (!lesson || lesson.clips.length === 0) continue;
    for (const part of splitStudyParts(lesson.clips)) {
      if (part.length > 0 && part.every((clip) => ids.has(clip.id))) count += 1;
    }
  }
  return count;
}

function practicePartsForLesson(
  courses: readonly AdminCatalogCourse[],
  exercise: VisitExerciseLesson,
): number {
  // Visits now count trail parts. Older visits only have clip totals.
  if (exercise.parts != null) return exercise.parts;
  const lesson = catalogLesson(courses, exercise.lessonKey).lesson;
  // Before parts were cut from cards, trail practice finished the same parts as study.
  if (!lesson?.pathNodes || lesson.clips.length === 0) return 0;
  const sizes = splitStudyParts(lesson.clips).map((part) => part.length);
  return partsCoveredByClips(sizes, exercise.completed);
}

function practicePartsFinished(
  courses: readonly AdminCatalogCourse[],
  visit: Visit,
): number {
  return (visit.exerciseLessons ?? []).reduce(
    (sum, lesson) => sum + practicePartsForLesson(courses, lesson),
    0,
  );
}

function visitStats(
  visit: Visit,
  courses: readonly AdminCatalogCourse[] = [],
): AdminVisitStats {
  return {
    clipsStudied: visit.clips.length,
    practiceClips: visit.exercisesCompleted,
    studyParts: studyPartsFinished(courses, visit),
    practiceParts: practicePartsFinished(courses, visit),
    practiceRuns: visit.listeningRuns,
    leftUnfinished: (visit.leftSessions ?? []).length,
    videoSeconds: visit.videos.reduce((sum, video) => sum + video.seconds, 0),
    videosWatched: visit.videos.filter((video) => video.watched).length,
    jumps: (visit.jumps ?? []).length,
    jumpsPassed: (visit.jumps ?? []).filter((jump) => jump.passed).length,
  };
}

function visitIsIdle(stats: AdminVisitStats): boolean {
  return (
    stats.clipsStudied === 0 &&
    stats.practiceClips === 0 &&
    stats.practiceRuns === 0 &&
    stats.videoSeconds < 1 &&
    stats.videosWatched === 0 &&
    stats.leftUnfinished === 0 &&
    stats.jumps === 0
  );
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

/** Mirrors the precedence in `describeVisitSignal`, for picking a badge style. */
function visitSignalKind(input: {
  daysSincePrevious: number | null;
  unfinishedLessonVisits: number | null;
}): AdminVisitSignalKind {
  if (input.daysSincePrevious != null && input.daysSincePrevious >= 7) return "returning";
  if (input.unfinishedLessonVisits != null && input.unfinishedLessonVisits >= 3) return "stuck";
  return "video";
}

function emptyVisitMessage(range: AdminVisitRange): string {
  if (range === "today") return "No visits today.";
  if (range === "7d") return "No visits in the last 7 days.";
  return "No visits recorded yet.";
}

/** Late visit heartbeats can land a little before the jump's own stamp. */
const SKIPPED_JUMP_SLACK_MS = 5 * 60_000;

/**
 * Visits saved before jump tests were logged on them show the jump as an idle
 * visit. A passed jump that skipped a Lektion still left `skippedAt`, so it is
 * put back on the latest visit that started before it and was still open.
 */
function withSkippedJumps(
  courses: readonly AdminCatalogCourse[],
  progress: StoredProgress,
): StoredProgress {
  const visits = progress.visits ?? [];
  if (visits.length === 0) return progress;
  const patched = new Map<string, Visit>();
  for (const course of courses) {
    for (const lesson of course.lessons) {
      if (!lesson.learnKey) continue;
      const skippedAt = progress.learn[lesson.learnKey]?.skippedAt;
      const time = skippedAt ? Date.parse(skippedAt) : Number.NaN;
      if (Number.isNaN(time)) continue;
      const lessonKey = lesson.videoKeyPrefix ?? `${course.id}/${lesson.learnKey}`;
      let target: Visit | null = null;
      for (const visit of visits) {
        const current = patched.get(visit.id) ?? visit;
        if (Date.parse(current.startedAt) > time) continue;
        if (Date.parse(current.endedAt) + SKIPPED_JUMP_SLACK_MS < time) continue;
        if (!target || current.startedAt > target.startedAt) target = current;
      }
      if (!target || (target.jumps ?? []).some((jump) => jump.lessonKey === lessonKey)) continue;
      patched.set(target.id, {
        ...target,
        jumps: [...(target.jumps ?? []), { lessonKey, passed: true }],
        lessons: target.lessons.includes(lessonKey) ? target.lessons : [...target.lessons, lessonKey],
      });
    }
  }
  if (patched.size === 0) return progress;
  return { ...progress, visits: visits.map((visit) => patched.get(visit.id) ?? visit) };
}

export function projectStudentVisits(
  courses: readonly AdminCatalogCourse[],
  storedProgress: StoredProgress,
  range: AdminVisitRange,
  now = new Date(),
  xpEvents: readonly AdminXpEvent[] = [],
): AdminVisitLog {
  const progress = withSkippedJumps(courses, storedProgress);
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
    const signalInput = {
      daysSincePrevious: older ? daysBetweenUtc(older.endedAt, visit.startedAt) : null,
      unfinishedLessonVisits,
      abandonedVideo: abandonedVideo(visit),
    };
    const signal = describeVisitSignal(signalInput);
    const stats = visitStats(visit, courses);
    const idle = visitIsIdle(stats);
    return {
      id: visit.id,
      headline: formatVisitHeadline(visit),
      ...visitWhen(visit),
      activeSeconds: visit.activeSeconds,
      idle,
      lessons: idle ? [] : lessonLabels(courses, visit),
      stats,
      lines: visitLines(courses, visit),
      onboarding: visitOnboardingLine(visit),
      signal,
      signalKind: signal ? visitSignalKind(signalInput) : null,
      details: visitDetails(courses, visit),
    };
  });

  return {
    summary: summarizeVisits(progress, range, now),
    visits,
    chart: visitChart(all, xpEvents, courses, range, now),
    emptyMessage: emptyVisitMessage(range),
  };
}

const DAY_MS = 86_400_000;
/** Above this many days, the all-time chart groups visits by week. */
const VISIT_CHART_DAILY_CAP = 60;

/**
 * Visits bucketed by start time on the viewing device's clock, matching the
 * visit list: hours for today, days for 7 days, days or weeks for all time.
 * XP is bucketed by award time on the same slots.
 */
function visitChart(
  visits: readonly Visit[],
  xpEvents: readonly AdminXpEvent[],
  courses: readonly AdminCatalogCourse[],
  range: AdminVisitRange,
  now: Date,
): AdminVisitChartPoint[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const starts: number[] = [];
  let label: (start: Date) => string;

  if (range === "today") {
    for (let hour = 0; hour < 24; hour += 1) {
      starts.push(new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour).getTime());
    }
    label = (start) => `${start.getHours().toString().padStart(2, "0")}:00`;
  } else {
    let first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    if (range === "all") {
      // XP can predate visit history, so the earliest award also widens the chart.
      const earliest = [
        ...visits.map((visit) => visit.startedAt),
        ...xpEvents.map((award) => award.at),
      ].reduce((min, iso) => {
        const time = Date.parse(iso);
        return Number.isNaN(time) ? min : Math.min(min, time);
      }, today.getTime());
      const e = new Date(earliest);
      const earliestDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
      if (earliestDay < first) first = earliestDay;
    }
    const days = Math.round((today.getTime() - first.getTime()) / DAY_MS) + 1;
    const step = days > VISIT_CHART_DAILY_CAP ? 7 : 1;
    // Walk back from today so the last bucket always ends on today.
    for (let offset = 0; offset < days; offset += step) {
      starts.unshift(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset - (step - 1)).getTime(),
      );
    }
    label =
      step === 1 && range === "7d"
        ? (start) => `${WEEKDAYS[start.getDay()]} ${start.getDate()}`
        : (start) => `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  }

  const points = starts.map((start) => ({
    label: label(new Date(start)),
    visits: 0,
    activeSeconds: 0,
    videoSeconds: 0,
    studyParts: 0,
    practiceParts: 0,
    practiceRuns: 0,
    leftUnfinished: 0,
    videosWatched: 0,
    wrongAttempts: 0,
    xp: 0,
  }));
  /** The slot a timestamp falls in, or -1 outside the chart. */
  const slotOf = (iso: string): number => {
    const time = Date.parse(iso);
    if (Number.isNaN(time) || time < starts[0]) return -1;
    let index = starts.length - 1;
    while (index > 0 && starts[index] > time) index -= 1;
    if (range === "today" && time >= starts[index] + 3_600_000) return -1;
    if (range !== "today" && time >= today.getTime() + DAY_MS) return -1;
    return index;
  };
  for (const visit of visits) {
    const index = slotOf(visit.startedAt);
    if (index < 0) continue;
    const point = points[index];
    const stats = visitStats(visit, courses);
    point.visits += 1;
    point.activeSeconds += visit.activeSeconds;
    point.videoSeconds += stats.videoSeconds;
    point.studyParts += stats.studyParts;
    point.practiceParts += stats.practiceParts;
    point.practiceRuns += stats.practiceRuns;
    point.leftUnfinished += stats.leftUnfinished;
    point.videosWatched += stats.videosWatched;
    point.wrongAttempts += visit.wrongAttempts ?? 0;
  }
  for (const award of xpEvents) {
    const index = slotOf(award.at);
    if (index >= 0) points[index].xp += award.xp;
  }
  const minutes = (seconds: number) => Math.round(seconds / 6) / 10;
  return points.map(({ activeSeconds, videoSeconds, ...point }) => ({
    ...point,
    activeMinutes: minutes(activeSeconds),
    videoMinutes: minutes(videoSeconds),
  }));
}

function visitOnboardingLine(visit: Visit): string | null {
  const entries = visit.onboarding ?? [];
  if (entries.length === 0) return null;
  return entries
    .map((entry) =>
      entry.outcome === "completed" ? "Onboarding completed" : onboardingSkipLine(entry.reasons ?? []),
    )
    .join(" · ");
}

function visitLines(courses: readonly AdminCatalogCourse[], visit: Visit): string[] {
  const clipCount = visit.clips.length;
  const exercises = visit.exercisesCompleted;
  const runs = visit.listeningRuns;
  const videoSeconds = visit.videos.reduce((sum, video) => sum + video.seconds, 0);
  const watched = visit.videos.filter((video) => video.watched);
  const left = visit.leftSessions ?? [];
  const jumps = visit.jumps ?? [];
  const studied =
    clipCount > 0 ||
    exercises > 0 ||
    runs > 0 ||
    videoSeconds >= 1 ||
    watched.length > 0 ||
    left.length > 0 ||
    jumps.length > 0;
  const onboarding = visitOnboardingLine(visit);
  if (!studied) {
    return onboarding ? ["Opened the app, no study", onboarding] : ["Opened the app, no study"];
  }

  const lines: string[] = [];
  const labels = lessonLabels(courses, visit);
  if (labels.length > 0) lines.push(labels.join(", "));
  if (clipCount > 0) {
    lines.push(`${clipCount} ${clipCount === 1 ? "clip" : "clips"} studied`);
  }
  if (exercises > 0 || runs > 0) {
    const parts: string[] = [];
    if (exercises > 0) {
      parts.push(
        `${exercises} practice ${exercises === 1 ? "clip" : "clips"} completed`,
      );
    }
    if (runs > 0) parts.push(`${runs} practice ${runs === 1 ? "run" : "runs"}`);
    lines.push(parts.join(" · "));
  }
  if (left.length > 0) {
    lines.push(
      left.length === 1
        ? "Left 1 session unfinished"
        : `Left ${left.length} sessions unfinished`,
    );
  }
  if (jumps.length > 0) {
    const passed = jumps.filter((jump) => jump.passed).length;
    const failed = jumps.length - passed;
    const parts: string[] = [];
    if (passed > 0) {
      parts.push(passed === 1 ? "Passed a jump test" : `Passed ${passed} jump tests`);
    }
    if (failed > 0) {
      parts.push(failed === 1 ? "Failed a jump test" : `Failed ${failed} jump tests`);
    }
    lines.push(parts.join(" · "));
  }
  if (videoSeconds >= 1 || watched.length > 0) {
    let line = `${formatActiveDuration(videoSeconds)} video`;
    if (watched.length === 1) line += ` · "${watched[0]?.title ?? "Video"}" marked watched`;
    else if (watched.length > 1) line += ` · ${watched.length} marked watched`;
    lines.push(line);
  }
  if (onboarding) lines.push(onboarding);
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
