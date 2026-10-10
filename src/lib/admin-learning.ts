import type { AdminCatalogCourse } from "./admin-detail";
import type { AdminUserRow } from "./admin-overview";
import { studyPartCount } from "./progress";

/**
 * Learning and pace metrics for the admin Activity page. A "part" is one
 * finished study part (study_xp_awards) or one passed practice part
 * (listening_runs). Days are Asia/Ho_Chi_Minh calendar days, as day numbers
 * since 1970-01-01 so the maths stays integer.
 */

/** The Activity page's tabs. `?tab=learning` opens this one. */
export type ActivityTab = "engagement" | "learning";

export function parseActivityTab(value: string | string[] | undefined): ActivityTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "learning" ? "learning" : "engagement";
}

/** Event codes in `LearningWindow.events`. */
export const LEARNING_STUDY_FINISHED = 0;
export const LEARNING_PRACTICE_PASSED = 1;
export const LEARNING_PRACTICE_FAILED = 2;

/** Numbers per event: user index, epoch minute, lesson index, part number, code. */
export const LEARNING_EVENT_STRIDE = 5;

/** Every part event of the students in scope, dictionary-encoded. */
export type LearningWindow = {
  ready: boolean;
  users: string[];
  lessons: string[];
  /** Flat, `LEARNING_EVENT_STRIDE` numbers per event. */
  events: number[];
  loadedAt: string;
};

/** The live course expects this many parts a day. */
export const PACE_PARTS_PER_DAY = 4;
/** On pace means averaging the daily pace over this many days. */
export const ON_PACE_DAYS = 7;
/** A course student counts as active with a finished part in this many days. */
export const ACTIVE_DAYS = 14;
/** A signup is activated by a finished part within this many hours. */
export const ACTIVATION_HOURS = 48;
/** A finished part continues when another part starts within this many days. */
export const CONTINUE_DAYS = 7;
/** A student who fell behind catches up when back in sync within this many days. */
export const CATCH_UP_DAYS = 7;
/** Parts with fewer starters are left out of the drop-off list. */
export const DROP_OFF_MIN_STARTERS = 3;
/** Weekly signup cohorts in the retention grid. */
export const RETENTION_WEEKS = 12;
/** Day offsets on the retention curve: day 0 is the signup day. */
export const RETENTION_HORIZON = 30;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const VIETNAM_OFFSET_MS = 7 * HOUR_MS;

export function vietnamDayNumber(ms: number): number {
  return Math.floor((ms + VIETNAM_OFFSET_MS) / DAY_MS);
}

function dayStartMs(day: number): number {
  return day * DAY_MS - VIETNAM_OFFSET_MS;
}

export function dayNumberIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function dayNumberLabel(day: number): string {
  return DAY_LABEL.format(new Date(day * DAY_MS));
}

/** The Monday on or before `day`. Day 0 (1970-01-01) was a Thursday. */
function weekStart(day: number): number {
  return day - (((day + 3) % 7) + 7) % 7;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** First index in an ascending list whose value is at least `target`. */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Values in `[from, to)` of an ascending list. */
function countBetween(values: readonly number[], from: number, to: number): number {
  return lowerBound(values, to) - lowerBound(values, from);
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/* ------------------------------------------------------------------ */
/* Course map                                                          */
/* ------------------------------------------------------------------ */

export type LearningLesson = {
  key: string;
  label: string;
  courseId: string;
  courseLabel: string;
  /** Catalog position, for course-order sorting. */
  order: number;
  /** Counts toward the live course schedule: a CEFR level, not Leben in DE. */
  paced: boolean;
};

export type LearningCourseMap = {
  lessons: ReadonlyMap<string, LearningLesson>;
  /** Study plus practice parts per paced course id (CEFR level slug). */
  partsByCourse: ReadonlyMap<string, number>;
};

export function buildLearningCourseMap(
  catalog: readonly AdminCatalogCourse[],
): LearningCourseMap {
  const lessons = new Map<string, LearningLesson>();
  const partsByCourse = new Map<string, number>();
  let order = 0;
  for (const course of catalog) {
    if (course.kind !== "cefr") continue;
    const paced = !course.living;
    let total = 0;
    for (const lesson of course.lessons) {
      const key = lesson.videoKeyPrefix;
      if (!key) continue;
      const study = lesson.learnKey && lesson.clips.length > 0 ? studyPartCount(lesson.clips.length) : 0;
      const practice = (lesson.practiceNodeParts ?? []).reduce((sum, node) => sum + node.length, 0);
      total += study + practice;
      lessons.set(key, {
        key,
        label: lesson.label,
        courseId: course.id,
        courseLabel: course.shortLabel,
        order: order++,
        paced,
      });
    }
    if (paced && total > 0) partsByCourse.set(course.id, total);
  }
  return { lessons, partsByCourse };
}

/* ------------------------------------------------------------------ */
/* Learners and events                                                 */
/* ------------------------------------------------------------------ */

export type LearningKind = "study" | "practice";

export type LearningLearner = {
  userId: string;
  displayName: string;
  email: string | null;
  className: string | null;
  classKey: string;
  /** Earliest sign-in, visit, or practice day we know of. Null when nothing is stored. */
  signupMs: number | null;
  /** Granted course slugs (CEFR level slugs and others). */
  courseIds: readonly string[];
  /** Parts opened and left before they finished, from the stored visits. */
  leftParts: readonly { lessonKey: string; kind: LearningKind; partNumber: number; at: number }[];
};

function earliestMs(values: Iterable<string | null | undefined>): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (!value) continue;
    // A bare day is the start of that Vietnam day.
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(`${value}T00:00:00+07:00`)
      : Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (best == null || ms < best) best = ms;
  }
  return best;
}

/** `classKey` is the case-insensitive class grouping key from admin-overview. */
export function learningLearner(row: AdminUserRow, classKey: string): LearningLearner {
  const visits = row.progress.visits ?? [];
  const stamps: (string | null | undefined)[] = [
    row.lastSignInAt,
    row.lastLoginAt,
    row.progress.lastPracticeDate,
    ...row.signIns.map((entry) => entry.at),
    ...row.appUses.map((entry) => entry.at),
    ...visits.map((visit) => visit.startedAt),
    ...(row.progress.practiceDates ?? []),
    ...Object.keys(row.progress.activity ?? {}),
  ];
  const leftParts: LearningLearner["leftParts"][number][] = [];
  for (const visit of visits) {
    for (const left of visit.leftSessions ?? []) {
      const at = Date.parse(left.startedAt);
      if (Number.isNaN(at)) continue;
      leftParts.push({ lessonKey: left.lessonKey, kind: left.kind, partNumber: left.partNumber, at });
    }
  }
  return {
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    className: row.className,
    classKey,
    signupMs: earliestMs(stamps),
    courseIds: row.levelAccess,
    leftParts,
  };
}

type PartEvent = {
  at: number;
  part: string;
  lessonKey: string;
  finished: boolean;
};

export function learningPartKey(lessonKey: string, kind: LearningKind, partNumber: number): string {
  return `${lessonKey}|${kind}|${partNumber}`;
}

function parsePartKey(key: string): { lessonKey: string; kind: LearningKind; partNumber: number } {
  const [lessonKey, kind, part] = key.split("|");
  return { lessonKey, kind: kind === "practice" ? "practice" : "study", partNumber: Number(part) };
}

/** Raw events per user id: finished, failed, and (from visits) left parts. */
export function decodeLearningEvents(window: LearningWindow): Map<string, PartEvent[]> {
  const byUser = new Map<string, PartEvent[]>();
  const { users, lessons, events } = window;
  for (let index = 0; index + LEARNING_EVENT_STRIDE <= events.length; index += LEARNING_EVENT_STRIDE) {
    const userId = users[events[index]];
    const lessonKey = lessons[events[index + 2]];
    if (userId == null || lessonKey == null) continue;
    const code = events[index + 4];
    const kind: LearningKind = code === LEARNING_STUDY_FINISHED ? "study" : "practice";
    const list = byUser.get(userId) ?? [];
    list.push({
      at: events[index + 1] * MINUTE_MS,
      part: learningPartKey(lessonKey, kind, events[index + 3]),
      lessonKey,
      finished: code !== LEARNING_PRACTICE_FAILED,
    });
    byUser.set(userId, list);
  }
  return byUser;
}

/** One learner's history, sorted and indexed for the metrics below. */
type Timeline = {
  learner: LearningLearner;
  signupMs: number | null;
  signupDay: number | null;
  /** Every start: finishes, fails, and left parts. */
  starts: PartEvent[];
  /** Every finish, replays included. */
  finishes: PartEvent[];
  finishTimes: number[];
  /** First finish of each part, oldest first. */
  firstFinishes: PartEvent[];
  /** First-finish times of parts in paced (CEFR) lessons. */
  pacedNewTimes: number[];
  finishDays: Set<number>;
};

function buildTimeline(
  learner: LearningLearner,
  raw: readonly PartEvent[],
  course: LearningCourseMap,
): Timeline {
  const left: PartEvent[] = learner.leftParts.map((entry) => ({
    at: entry.at,
    part: learningPartKey(entry.lessonKey, entry.kind, entry.partNumber),
    lessonKey: entry.lessonKey,
    finished: false,
  }));
  const starts = [...raw, ...left].sort((a, b) => a.at - b.at);
  const finishes = raw.filter((event) => event.finished).sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const firstFinishes: PartEvent[] = [];
  const pacedNewTimes: number[] = [];
  const finishDays = new Set<number>();
  for (const event of finishes) {
    finishDays.add(vietnamDayNumber(event.at));
    if (seen.has(event.part)) continue;
    seen.add(event.part);
    firstFinishes.push(event);
    if (course.lessons.get(event.lessonKey)?.paced) pacedNewTimes.push(event.at);
  }
  const firstEvent = starts[0]?.at ?? null;
  const signupMs =
    learner.signupMs == null
      ? firstEvent
      : firstEvent == null
        ? learner.signupMs
        : Math.min(learner.signupMs, firstEvent);
  return {
    learner,
    signupMs,
    signupDay: signupMs == null ? null : vietnamDayNumber(signupMs),
    starts,
    finishes,
    finishTimes: finishes.map((event) => event.at),
    firstFinishes,
    pacedNewTimes,
    finishDays,
  };
}

/* ------------------------------------------------------------------ */
/* Board types                                                         */
/* ------------------------------------------------------------------ */

export type LearningBucket = {
  key: string;
  label: string;
  count: number;
  /** Inside the target (48 hours to a first part, 7 days to the next). */
  good: boolean;
};

export type ActivationBoard = {
  signups: number;
  activated: number;
  /** Signed up under 48 hours ago and not activated yet. Left out of the rate. */
  pending: number;
  /** Past 48 hours with no part, and they had course access. */
  missedWithAccess: number;
  /** Past 48 hours with no part, and no course granted (yet). */
  missedNoAccess: number;
  rate: number | null;
  medianMinutes: number | null;
  /** Signups in the window who finished any part, whenever. */
  withFirstPart: number;
  buckets: LearningBucket[];
  /** Signups in the window with no part yet. */
  noPart: number;
};

export type WeeklyPoint = {
  key: string;
  label: string;
  learners: number;
  parts: number;
  perLearner: number | null;
  /** The current week, still running. */
  partial: boolean;
};

export type RetentionCell = { rate: number | null; active: number; eligible: number };

export type RetentionCurvePoint = RetentionCell & { day: number; label: string };

export type RetentionCohort = {
  key: string;
  label: string;
  size: number;
  d1: RetentionCell;
  d7: RetentionCell;
  d30: RetentionCell;
};

export type RetentionBoard = {
  signups: number;
  curve: RetentionCurvePoint[];
  cohorts: RetentionCohort[];
  d1: RetentionCell;
  d7: RetentionCell;
  d30: RetentionCell;
};

export type ContinuationBoard = {
  /** First finishes in the window whose outcome is known. */
  eligible: number;
  continued: number;
  rate: number | null;
  /** Finished under 7 days ago, nothing started since. Left out of the rate. */
  tooRecent: number;
  medianHours: number | null;
  buckets: LearningBucket[];
};

export type DropOffRow = {
  key: string;
  lessonKey: string;
  lessonLabel: string;
  courseLabel: string;
  kind: LearningKind;
  partNumber: number;
  order: number;
  started: number;
  finished: number;
  dropped: number;
  rate: number;
};

export type PaceStudent = {
  userId: string;
  displayName: string;
  email: string | null;
  className: string | null;
  /** Day 1 of this student's schedule. */
  startDay: string;
  /** Today is this day of the schedule. */
  courseDay: number;
  /** Parts the schedule expected by the end of yesterday. */
  expected: number;
  /** Distinct course parts finished, today included. */
  done: number;
  coursePartTotal: number;
  ratio: number | null;
  behind: number;
  daysBehind: number;
  /** New course parts in the last 7 days, today included. */
  lastWeekParts: number;
  onPace: boolean;
  active: boolean;
  courseComplete: boolean;
  lastPartMs: number | null;
};

export type PaceTrendPoint = {
  key: string;
  label: string;
  rate: number | null;
  active: number;
  onPace: number;
  partial: boolean;
};

export type PaceRatioBucket = {
  key: string;
  label: string;
  count: number;
  tone: "critical" | "serious" | "warning" | "fair" | "good";
};

export type CatchUpBoard = {
  /** Fall-behinds that started in the lookback. */
  episodes: number;
  caught: number;
  stillBehind: number;
  tooRecent: number;
  rate: number | null;
  medianDays: number | null;
  lookbackDays: number;
};

export type SlipBar = { key: string; label: string; count: number };

export type PaceSchedule = { key: string; label: string; startDay: string; students: number };

export type PaceBoard = {
  students: PaceStudent[];
  active: number;
  onPace: number;
  rate: number | null;
  trend: PaceTrendPoint[];
  medianRatio: number | null;
  behindStudents: number;
  totalBehind: number;
  medianBehind: number | null;
  medianDaysBehind: number | null;
  ratioBuckets: PaceRatioBucket[];
  catchUp: CatchUpBoard;
  slipByDay: { unit: "day" | "week"; bars: SlipBar[] };
  slipByLesson: SlipBar[];
  slipped: number;
  schedules: PaceSchedule[];
};

export type LearningBoard = {
  windowDays: number;
  activation: ActivationBoard;
  weekly: WeeklyPoint[];
  retention: RetentionBoard;
  continuation: ContinuationBoard;
  dropOff: DropOffRow[];
  pace: PaceBoard;
};

/* ------------------------------------------------------------------ */
/* Activation and time to first part                                   */
/* ------------------------------------------------------------------ */

const FIRST_PART_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: "15m", label: "< 15 min", max: 15 * MINUTE_MS },
  { key: "1h", label: "15–60 min", max: HOUR_MS },
  { key: "6h", label: "1–6 h", max: 6 * HOUR_MS },
  { key: "24h", label: "6–24 h", max: DAY_MS },
  { key: "48h", label: "1–2 days", max: 2 * DAY_MS },
  { key: "7d", label: "2–7 days", max: 7 * DAY_MS },
  { key: "later", label: "7+ days", max: Number.POSITIVE_INFINITY },
];

function bucketIndex(
  buckets: readonly { max: number }[],
  value: number,
): number {
  const index = buckets.findIndex((bucket) => value < bucket.max);
  return index < 0 ? buckets.length - 1 : index;
}

function buildActivation(
  timelines: readonly Timeline[],
  course: LearningCourseMap,
  windowFrom: number,
  now: number,
): ActivationBoard {
  const counts = FIRST_PART_BUCKETS.map(() => 0);
  const delays: number[] = [];
  let signups = 0;
  let activated = 0;
  let pending = 0;
  let missedWithAccess = 0;
  let missedNoAccess = 0;
  let noPart = 0;
  const limit = ACTIVATION_HOURS * HOUR_MS;
  for (const timeline of timelines) {
    if (timeline.signupMs == null || timeline.signupDay == null) continue;
    if (timeline.signupDay < windowFrom) continue;
    signups += 1;
    const first = timeline.finishes[0]?.at ?? null;
    const delay = first == null ? null : Math.max(0, first - timeline.signupMs);
    if (delay != null) {
      delays.push(delay);
      counts[bucketIndex(FIRST_PART_BUCKETS, delay)] += 1;
    } else {
      noPart += 1;
    }
    if (delay != null && delay <= limit) {
      activated += 1;
    } else if (now - timeline.signupMs < limit) {
      pending += 1;
    } else if (timeline.learner.courseIds.some((id) => course.partsByCourse.has(id))) {
      missedWithAccess += 1;
    } else {
      missedNoAccess += 1;
    }
  }
  const medianMs = median(delays);
  return {
    signups,
    activated,
    pending,
    missedWithAccess,
    missedNoAccess,
    rate: rate(activated, activated + missedWithAccess + missedNoAccess),
    medianMinutes: medianMs == null ? null : medianMs / MINUTE_MS,
    withFirstPart: delays.length,
    buckets: FIRST_PART_BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      label: bucket.label,
      count: counts[index],
      good: bucket.max <= limit,
    })),
    noPart,
  };
}

/* ------------------------------------------------------------------ */
/* Weekly active learners and depth                                    */
/* ------------------------------------------------------------------ */

function buildWeekly(timelines: readonly Timeline[], today: number, weeks: number): WeeklyPoint[] {
  const current = weekStart(today);
  const first = current - (weeks - 1) * 7;
  const learners = Array.from({ length: weeks }, () => new Set<string>());
  const parts = Array.from({ length: weeks }, () => 0);
  for (const timeline of timelines) {
    for (const event of timeline.finishes) {
      const index = Math.floor((vietnamDayNumber(event.at) - first) / 7);
      if (index < 0 || index >= weeks) continue;
      learners[index].add(timeline.learner.userId);
      parts[index] += 1;
    }
  }
  return parts.map((count, index) => {
    const start = first + index * 7;
    return {
      key: dayNumberIso(start),
      label: dayNumberLabel(start),
      learners: learners[index].size,
      parts: count,
      perLearner: learners[index].size > 0 ? count / learners[index].size : null,
      partial: start === current,
    };
  });
}

/* ------------------------------------------------------------------ */
/* D1 / D7 / D30 retention                                             */
/* ------------------------------------------------------------------ */

function retentionCell(members: readonly Timeline[], offset: number, today: number): RetentionCell {
  let eligible = 0;
  let active = 0;
  for (const member of members) {
    const day = (member.signupDay ?? 0) + offset;
    // Only finished days: day N must be over before it can be counted.
    if (day >= today) continue;
    eligible += 1;
    if (member.finishDays.has(day)) active += 1;
  }
  return { rate: rate(active, eligible), active, eligible };
}

function buildRetention(timelines: readonly Timeline[], today: number): RetentionBoard {
  const firstWeek = weekStart(today) - (RETENTION_WEEKS - 1) * 7;
  const members = timelines.filter(
    (timeline) => timeline.signupDay != null && timeline.signupDay >= firstWeek,
  );
  const curve: RetentionCurvePoint[] = [];
  for (let day = 0; day <= RETENTION_HORIZON; day += 1) {
    curve.push({ day, label: `D${day}`, ...retentionCell(members, day, today) });
  }
  const cohorts: RetentionCohort[] = [];
  for (let index = RETENTION_WEEKS - 1; index >= 0; index -= 1) {
    const start = firstWeek + index * 7;
    const cohort = members.filter(
      (member) => (member.signupDay ?? 0) >= start && (member.signupDay ?? 0) < start + 7,
    );
    cohorts.push({
      key: dayNumberIso(start),
      label: `${dayNumberLabel(start)} – ${dayNumberLabel(start + 6)}`,
      size: cohort.length,
      d1: retentionCell(cohort, 1, today),
      d7: retentionCell(cohort, 7, today),
      d30: retentionCell(cohort, 30, today),
    });
  }
  return {
    signups: members.length,
    curve,
    cohorts,
    d1: curve[1],
    d7: curve[7],
    d30: curve[30],
  };
}

/* ------------------------------------------------------------------ */
/* Part-to-part continuation                                           */
/* ------------------------------------------------------------------ */

const NEXT_PART_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: "1h", label: "< 1 h", max: HOUR_MS },
  { key: "24h", label: "1–24 h", max: DAY_MS },
  { key: "3d", label: "1–3 days", max: 3 * DAY_MS },
  { key: "7d", label: "3–7 days", max: 7 * DAY_MS + 1 },
  { key: "later", label: "7+ days", max: Number.POSITIVE_INFINITY },
];

function buildContinuation(
  timelines: readonly Timeline[],
  windowFromMs: number,
  now: number,
): ContinuationBoard {
  const counts = NEXT_PART_BUCKETS.map(() => 0);
  const gaps: number[] = [];
  const limit = CONTINUE_DAYS * DAY_MS;
  let continued = 0;
  let eligible = 0;
  let tooRecent = 0;
  let never = 0;
  for (const timeline of timelines) {
    const starts = timeline.starts;
    let cursor = 0;
    for (const finish of timeline.firstFinishes) {
      if (finish.at < windowFromMs) continue;
      while (cursor < starts.length && starts[cursor].at <= finish.at) cursor += 1;
      let next: PartEvent | null = null;
      for (let index = cursor; index < starts.length; index += 1) {
        if (starts[index].part !== finish.part) {
          next = starts[index];
          break;
        }
      }
      const gap = next ? next.at - finish.at : null;
      if (gap != null && gap <= limit) {
        eligible += 1;
        continued += 1;
        gaps.push(gap);
        counts[bucketIndex(NEXT_PART_BUCKETS, gap)] += 1;
      } else if (now - finish.at < limit) {
        tooRecent += 1;
      } else {
        eligible += 1;
        if (gap != null) {
          gaps.push(gap);
          counts[NEXT_PART_BUCKETS.length - 1] += 1;
        } else {
          never += 1;
        }
      }
    }
  }
  const medianMs = median(gaps.filter((gap) => gap <= limit));
  return {
    eligible,
    continued,
    rate: rate(continued, eligible),
    tooRecent,
    medianHours: medianMs == null ? null : medianMs / HOUR_MS,
    buckets: [
      ...NEXT_PART_BUCKETS.map((bucket, index) => ({
        key: bucket.key,
        label: bucket.label,
        count: counts[index],
        good: bucket.max <= limit + 1,
      })),
      { key: "never", label: "Not since", count: never, good: false },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Drop-off by part                                                    */
/* ------------------------------------------------------------------ */

function buildDropOff(
  timelines: readonly Timeline[],
  course: LearningCourseMap,
  windowFromMs: number,
): DropOffRow[] {
  const starters = new Map<string, Set<string>>();
  const finishers = new Map<string, Set<string>>();
  for (const timeline of timelines) {
    const userId = timeline.learner.userId;
    for (const event of timeline.starts) {
      if (event.at < windowFromMs) continue;
      const set = starters.get(event.part) ?? new Set<string>();
      set.add(userId);
      starters.set(event.part, set);
    }
    for (const event of timeline.firstFinishes) {
      const set = finishers.get(event.part) ?? new Set<string>();
      set.add(userId);
      finishers.set(event.part, set);
    }
  }
  const rows: DropOffRow[] = [];
  for (const [key, started] of starters) {
    if (started.size < DROP_OFF_MIN_STARTERS) continue;
    const done = finishers.get(key);
    let finished = 0;
    for (const userId of started) if (done?.has(userId)) finished += 1;
    const { lessonKey, kind, partNumber } = parsePartKey(key);
    const lesson = course.lessons.get(lessonKey);
    rows.push({
      key,
      lessonKey,
      lessonLabel: lesson?.label ?? lessonKey,
      courseLabel: lesson?.courseLabel ?? "",
      kind,
      partNumber,
      // Study parts before practice parts within a Lektion; unknown lessons last.
      order: (lesson?.order ?? 1e6) * 1000 + (kind === "study" ? 0 : 500) + partNumber,
      started: started.size,
      finished,
      dropped: started.size - finished,
      rate: (started.size - finished) / started.size,
    });
  }
  return rows.sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------ */
/* Course pace                                                         */
/* ------------------------------------------------------------------ */

type PacedTimeline = {
  timeline: Timeline;
  startDay: number;
  /** First simulated day: the schedule start, or the signup when they joined later. */
  joinDay: number;
  cap: number;
};

function expectedBy(paced: PacedTimeline, day: number): number {
  return Math.min(paced.cap, Math.max(0, PACE_PARTS_PER_DAY * (day - paced.startDay + 1)));
}

function doneBy(paced: PacedTimeline, endMs: number): number {
  return lowerBound(paced.timeline.pacedNewTimes, endMs);
}

function isBehind(paced: PacedTimeline, day: number): boolean {
  return expectedBy(paced, day) - doneBy(paced, dayStartMs(day + 1)) >= PACE_PARTS_PER_DAY;
}

const RATIO_BUCKETS: { key: string; label: string; max: number; tone: PaceRatioBucket["tone"] }[] = [
  { key: "25", label: "Under 0.25", max: 0.25, tone: "critical" },
  { key: "50", label: "0.25–0.5", max: 0.5, tone: "serious" },
  { key: "75", label: "0.5–0.75", max: 0.75, tone: "warning" },
  { key: "100", label: "0.75–1", max: 1, tone: "fair" },
  { key: "in-sync", label: "1.0 or more", max: Number.POSITIVE_INFINITY, tone: "good" },
];

function buildPace(
  timelines: readonly Timeline[],
  allTimelines: readonly Timeline[],
  course: LearningCourseMap,
  today: number,
  trendDays: number,
  catchUpLookback: number,
  now: number,
): PaceBoard {
  // Day 1 of a class is the earliest signup of anyone in it: the live course started then.
  const classStart = new Map<string, number>();
  for (const timeline of allTimelines) {
    const key = timeline.learner.classKey;
    if (!key || timeline.signupDay == null) continue;
    const current = classStart.get(key);
    if (current == null || timeline.signupDay < current) classStart.set(key, timeline.signupDay);
  }

  const paced: PacedTimeline[] = [];
  for (const timeline of timelines) {
    if (timeline.signupDay == null) continue;
    const cap = timeline.learner.courseIds.reduce(
      (sum, id) => sum + (course.partsByCourse.get(id) ?? 0),
      0,
    );
    if (cap <= 0) continue;
    const startDay = classStart.get(timeline.learner.classKey) ?? timeline.signupDay;
    paced.push({ timeline, startDay, joinDay: Math.max(startDay, timeline.signupDay), cap });
  }

  const weekFrom = dayStartMs(today - (ON_PACE_DAYS - 1));
  const activeFrom = dayStartMs(today - (ACTIVE_DAYS - 1));
  const students: PaceStudent[] = paced.map((entry) => {
    const { timeline, cap } = entry;
    const done = timeline.pacedNewTimes.length;
    // Expected by the end of yesterday: today's work is a head start, not a debt.
    const expected = expectedBy(entry, today - 1);
    const lastWeekParts = countBetween(timeline.pacedNewTimes, weekFrom, now + 1);
    const courseComplete = done >= cap;
    const behind = Math.max(0, expected - done);
    return {
      userId: timeline.learner.userId,
      displayName: timeline.learner.displayName,
      email: timeline.learner.email,
      className: timeline.learner.className,
      startDay: dayNumberIso(entry.startDay),
      courseDay: today - entry.startDay + 1,
      expected,
      done,
      coursePartTotal: cap,
      ratio: expected > 0 ? done / expected : null,
      behind,
      daysBehind: behind / PACE_PARTS_PER_DAY,
      lastWeekParts,
      onPace: courseComplete || lastWeekParts >= PACE_PARTS_PER_DAY * ON_PACE_DAYS,
      active: countBetween(timeline.finishTimes, activeFrom, now + 1) > 0,
      courseComplete,
      lastPartMs: timeline.finishTimes.at(-1) ?? null,
    };
  });

  const active = students.filter((student) => student.active);
  const onPace = active.filter((student) => student.onPace).length;

  const trend: PaceTrendPoint[] = [];
  for (let day = today - (trendDays - 1); day <= today; day += 1) {
    const end = Math.min(now + 1, dayStartMs(day + 1));
    let activeCount = 0;
    let onPaceCount = 0;
    for (const entry of paced) {
      if (entry.joinDay > day) continue;
      const { timeline } = entry;
      if (countBetween(timeline.finishTimes, dayStartMs(day - (ACTIVE_DAYS - 1)), end) === 0) continue;
      activeCount += 1;
      const week = countBetween(timeline.pacedNewTimes, dayStartMs(day - (ON_PACE_DAYS - 1)), end);
      if (week >= PACE_PARTS_PER_DAY * ON_PACE_DAYS || doneBy(entry, end) >= entry.cap) {
        onPaceCount += 1;
      }
    }
    trend.push({
      key: dayNumberIso(day),
      label: dayNumberLabel(day),
      rate: rate(onPaceCount, activeCount),
      active: activeCount,
      onPace: onPaceCount,
      partial: day === today,
    });
  }

  const ratioCounts = RATIO_BUCKETS.map(() => 0);
  for (const student of students) {
    if (student.ratio == null) continue;
    ratioCounts[bucketIndex(RATIO_BUCKETS, student.ratio)] += 1;
  }

  // Fall-behinds and slip points, simulated day by day up to yesterday.
  const yesterday = today - 1;
  const lookbackFrom = today - catchUpLookback;
  let episodes = 0;
  let caught = 0;
  let stillBehind = 0;
  let tooRecent = 0;
  const catchDays: number[] = [];
  const slipDays: number[] = [];
  const slipLessons = new Map<string, number>();
  for (const entry of paced) {
    let wasBehind = false;
    let slipped = false;
    for (let day = entry.joinDay; day <= yesterday; day += 1) {
      const behind = isBehind(entry, day);
      if (behind && !wasBehind) {
        if (!slipped) {
          slipped = true;
          slipDays.push(day - entry.startDay + 1);
          const end = dayStartMs(day + 1);
          const starts = entry.timeline.starts;
          let last: PartEvent | undefined;
          for (const event of starts) {
            if (event.at >= end) break;
            last = event;
          }
          const key = last?.lessonKey ?? "";
          slipLessons.set(key, (slipLessons.get(key) ?? 0) + 1);
        }
        if (day >= lookbackFrom) {
          episodes += 1;
          let back: number | null = null;
          for (let next = day + 1; next <= Math.min(day + CATCH_UP_DAYS, yesterday); next += 1) {
            if (!isBehind(entry, next)) {
              back = next - day;
              break;
            }
          }
          if (back != null) {
            caught += 1;
            catchDays.push(back);
          } else if (day + CATCH_UP_DAYS <= yesterday) {
            stillBehind += 1;
          } else {
            tooRecent += 1;
          }
        }
      }
      wasBehind = behind;
    }
  }

  const maxSlip = slipDays.reduce((max, day) => Math.max(max, day), 0);
  const byWeek = maxSlip > 28;
  const slipCounts = new Map<number, number>();
  for (const day of slipDays) {
    const bin = byWeek ? Math.ceil(day / 7) : day;
    slipCounts.set(bin, (slipCounts.get(bin) ?? 0) + 1);
  }
  const binCount = byWeek ? Math.ceil(maxSlip / 7) : maxSlip;
  const slipBars: SlipBar[] = Array.from({ length: binCount }, (_, index) => ({
    key: String(index + 1),
    label: byWeek ? `Wk ${index + 1}` : `Day ${index + 1}`,
    count: slipCounts.get(index + 1) ?? 0,
  }));

  const slipByLesson = [...slipLessons.entries()]
    .map(([key, count]) => {
      const lesson = course.lessons.get(key);
      return {
        key: key || "none",
        label: key
          ? lesson
            ? `${lesson.courseLabel} · ${lesson.label}`
            : key
          : "Before a first part",
        count,
        order: lesson?.order ?? -1,
      };
    })
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ key, label, count }) => ({ key, label, count }));

  const behindList = students.filter((student) => student.behind > 0);
  const schedules = new Map<string, PaceSchedule>();
  for (const entry of paced) {
    const key = entry.timeline.learner.classKey;
    const existing = schedules.get(key);
    if (existing) {
      existing.students += 1;
      continue;
    }
    schedules.set(key, {
      key,
      label: entry.timeline.learner.className ?? "No class (own signup day)",
      startDay: key ? dayNumberIso(entry.startDay) : "",
      students: 1,
    });
  }

  return {
    students,
    active: active.length,
    onPace,
    rate: rate(onPace, active.length),
    trend,
    medianRatio: median(
      students.flatMap((student) => (student.ratio == null ? [] : [student.ratio])),
    ),
    behindStudents: behindList.length,
    totalBehind: behindList.reduce((sum, student) => sum + student.behind, 0),
    medianBehind: median(behindList.map((student) => student.behind)),
    medianDaysBehind: median(behindList.map((student) => student.daysBehind)),
    ratioBuckets: RATIO_BUCKETS.map((bucket, index) => ({
      key: bucket.key,
      label: bucket.label,
      count: ratioCounts[index],
      tone: bucket.tone,
    })),
    catchUp: {
      episodes,
      caught,
      stillBehind,
      tooRecent,
      rate: rate(caught, caught + stillBehind),
      medianDays: median(catchDays),
      lookbackDays: catchUpLookback,
    },
    slipByDay: { unit: byWeek ? "week" : "day", bars: slipBars },
    slipByLesson,
    slipped: slipDays.length,
    schedules: [...schedules.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

/**
 * Every metric of the learning and pace tab.
 *
 * - `learners`: students in the current class scope.
 * - `allLearners`: every student, so a class's schedule start does not move
 *   when the scope narrows.
 * - `windowDays`: the date tab. Weekly charts, retention cohorts, and the
 *   catch-up lookback reach further back on purpose; the board says how far.
 */
export function buildLearningBoard({
  learners,
  allLearners,
  window,
  course,
  windowDays,
  now = Date.now(),
}: {
  learners: readonly LearningLearner[];
  allLearners: readonly LearningLearner[];
  window: LearningWindow;
  course: LearningCourseMap;
  windowDays: number;
  now?: number;
}): LearningBoard {
  const events = decodeLearningEvents(window);
  const timelineOf = (learner: LearningLearner) =>
    buildTimeline(learner, events.get(learner.userId) ?? [], course);
  const timelines = learners.map(timelineOf);
  const scoped = new Map(timelines.map((timeline) => [timeline.learner.userId, timeline]));
  const allTimelines = allLearners.map(
    (learner) => scoped.get(learner.userId) ?? timelineOf(learner),
  );

  const today = vietnamDayNumber(now);
  const windowFrom = today - (windowDays - 1);
  const windowFromMs = dayStartMs(windowFrom);
  const weeks = Math.min(14, Math.max(8, Math.ceil(windowDays / 7) + 1));

  return {
    windowDays,
    activation: buildActivation(timelines, course, windowFrom, now),
    weekly: buildWeekly(timelines, today, weeks),
    retention: buildRetention(timelines, today),
    continuation: buildContinuation(timelines, windowFromMs, now),
    dropOff: buildDropOff(timelines, course, windowFromMs),
    pace: buildPace(
      timelines,
      allTimelines,
      course,
      today,
      Math.max(14, windowDays),
      Math.max(30, windowDays),
      now,
    ),
  };
}
