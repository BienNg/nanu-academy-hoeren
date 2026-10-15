import { unstable_cache } from "next/cache";
import { buildCefrProgressCatalog } from "@/lib/admin-catalog";
import { projectStudentDetail } from "@/lib/admin-detail";
import { classKey } from "@/lib/admin-overview";
import {
  classSessionDays,
  scheduleToday,
  type ClassSchedule,
} from "@/lib/class-schedule";
import { listCachedClassSchedules } from "@/lib/class-schedule-store";
import { getCefrLevels } from "@/lib/levels";
import { normalizeProgress, todayIsoDate, type StoredProgress } from "@/lib/progress";
import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  PACE_DAYS,
  behindReasons,
  dailyParts,
  daysSinceSeen,
  isRatingTag,
  partsByDayFromActivity,
  partsPerDay,
  paceTier,
  sessionEndsAt,
  summarizeRatings,
  type BehindReason,
  type PaceTier,
  type RatingTag,
  type SessionRatingSummary,
} from "@/lib/session-ratings";
import { dayKey, weekKey, type BoardPerson } from "@/lib/xp";
import { listWeekBoardPeople } from "@/lib/xp-store";

/**
 * Reads for the teacher site (docs/SESSION_RATINGS.md, Part 6). Every read is
 * cached for TEACHER_CACHE_SECONDS per class, so a few teachers opening pages
 * cost a handful of database reads per class at most. Pages check access with
 * `canSeeClass` before calling anything here.
 */

export const TEACHER_CACHE_SECONDS = 5 * 60;
const RATINGS_TABLE = "session_ratings";
const SUMMARY_RPC = "session_rating_summary";
/** Days on the student activity chart. */
export const ACTIVITY_DAYS = 30;

export type TeacherSession = SessionRatingSummary & { level: string; lektion: number };

export type TeacherStudent = {
  userId: string;
  name: string;
  image: string | null;
  weekXp: number;
  /** 1 = most XP this week in the class. */
  rank: number;
  /** Parts a day over the last PACE_DAYS days. */
  pace: number;
  tier: PaceTier;
  /** Lektion the learner is on in the class's level. Null when unknown. */
  lektion: number | null;
  lastSeenAt: string | null;
  daysSinceSeen: number | null;
  videosThisWeek: number;
  reasons: BehindReason[];
  /** Parts per UTC day, oldest first, ACTIVITY_DAYS long, ending today. */
  daily: { day: string; parts: number }[];
  lessonsDone: number;
  lessonsTotal: number;
  videosWatched: number;
  videosTotal: number;
};

export type TeacherClass = {
  key: string;
  name: string;
  levelSlug: string | null;
  levelLabel: string | null;
  /** "T2 & T4 · 19:30", or null without a timetable. */
  scheduleLine: string | null;
  /** The Lektion of the last session held, in the current level. */
  classLektion: number | null;
  /** Held sessions of every level, newest first, with their ratings. */
  sessions: TeacherSession[];
  /** Behind first, then by pace. */
  students: TeacherStudent[];
  /** False when ratings could not be read (table missing). */
  ratingsReady: boolean;
};

export type TeacherRating = {
  userId: string;
  name: string;
  image: string | null;
  stars: number;
  tags: RatingTag[];
  comment: string | null;
  createdAt: string;
};

const VI_SHORT_WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

function scheduleLine(schedule: ClassSchedule): string | null {
  if (schedule.weekdays.length === 0) return null;
  const days = schedule.weekdays.map((day) => VI_SHORT_WEEKDAY[day % 7]).join(" & ");
  return schedule.sessionStart ? `${days} · ${schedule.sessionStart}` : days;
}

function levelOrder() {
  return getCefrLevels().map((level) => ({ slug: level.slug, lektionen: level.chapters.length }));
}

function missing(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/** Learners of the class on this week's board. Admins, staff and teachers are left out. */
function classLearners(people: readonly BoardPerson[], key: string): BoardPerson[] {
  return people.filter(
    (person) => !person.isAdmin && !person.isStaff && !person.isTeacher && classKey(person.className) === key,
  );
}

const cachedWeekBoard = unstable_cache(
  async () => {
    const people = await listWeekBoardPeople(new Date());
    return people?.map(({ userId, name, className, isAdmin, isStaff, isTeacher, xp, image }) => ({
      userId,
      name,
      className,
      isAdmin,
      isStaff,
      isTeacher,
      xp,
      image: image ?? null,
      classKey: classKey(className),
      reachedAt: null,
    })) ?? null;
  },
  ["teacher-week-board"],
  { revalidate: TEACHER_CACHE_SECONDS },
);

async function readSummaries(key: string): Promise<SessionRatingSummary[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const rpc = await supabase.rpc(SUMMARY_RPC, { p_class_key: key });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as Record<string, unknown>[]).flatMap((row) => {
      if (typeof row.session_date !== "string" || typeof row.rated_count !== "number") return [];
      const tagCounts =
        row.tag_counts && typeof row.tag_counts === "object"
          ? (Object.fromEntries(
              Object.entries(row.tag_counts as Record<string, unknown>).filter(
                ([tag, count]) => isRatingTag(tag) && typeof count === "number",
              ),
            ) as Partial<Record<RatingTag, number>>)
          : null;
      return [
        {
          day: row.session_date,
          ratedCount: row.rated_count,
          average: row.average == null ? null : Number(row.average),
          starCounts: Array.isArray(row.star_counts) ? row.star_counts.map(Number) : null,
          tagCounts,
        },
      ];
    });
  }
  // Function not created yet: add up the rated rows here instead.
  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("session_date, stars, tags")
    .eq("class_key", key)
    .eq("status", "rated")
    .limit(5000);
  if (error) {
    if (!missing(error.message)) console.error("Supabase teacher ratings", error.message);
    return null;
  }
  return summarizeRatings(
    (data ?? []).flatMap((row) => {
      const record = row as { session_date?: unknown; stars?: unknown; tags?: unknown };
      return typeof record.session_date === "string" && typeof record.stars === "number"
        ? [{ day: record.session_date, stars: record.stars, tags: Array.isArray(record.tags) ? record.tags.map(String) : [] }]
        : [];
    }),
  );
}

type ProgressSlice = {
  user_id?: unknown;
  last_login_at?: unknown;
  learn?: unknown;
  videos?: unknown;
  activity?: unknown;
};

/** Only the JSON paths the student views use, for the roster only. Never the whole document. */
async function readProgressSlices(userIds: readonly string[]): Promise<Map<string, ProgressSlice>> {
  const slices = new Map<string, ProgressSlice>();
  const supabase = getSupabaseAdmin();
  if (!supabase || userIds.length === 0) return slices;
  const { data, error } = await supabase
    .from("user_progress")
    .select("user_id, last_login_at, learn:data->learn, videos:data->videos, activity:data->activity")
    .in("user_id", [...userIds]);
  if (error) {
    console.error("Supabase teacher progress", error.message);
    return slices;
  }
  for (const row of (data ?? []) as ProgressSlice[]) {
    if (typeof row.user_id === "string") slices.set(row.user_id, row);
  }
  return slices;
}

function studentStats(
  person: BoardPerson,
  rank: number,
  slice: ProgressSlice | undefined,
  progress: StoredProgress,
  levelSlug: string | null,
  classLektion: number | null,
  catalog: ReturnType<typeof buildCefrProgressCatalog>,
  now: Date,
): TeacherStudent {
  const counts = partsByDayFromActivity(progress.activity);
  const today = todayIsoDate(now);
  const pace = partsPerDay(counts, today, PACE_DAYS);
  const course = levelSlug
    ? projectStudentDetail(catalog, progress).courses.find((entry) => entry.id === levelSlug)
    : undefined;
  const lessons = course?.lessons ?? [];
  const firstOpen = lessons.findIndex((lesson) => lesson.status !== "completed");
  const lektion = lessons.length === 0 ? null : firstOpen === -1 ? lessons.length : firstOpen + 1;
  const monday = weekKey(now);
  const videosThisWeek = Object.values(progress.videos).filter(
    (video) => video.watchedAt && dayKey(new Date(video.watchedAt)) >= monday,
  ).length;
  const lastSeenAt = typeof slice?.last_login_at === "string" ? slice.last_login_at : null;
  const seen = daysSinceSeen(lastSeenAt, now);
  return {
    userId: person.userId,
    name: person.name,
    image: person.image ?? null,
    weekXp: person.xp,
    rank,
    pace: Math.round(pace * 10) / 10,
    tier: paceTier(pace),
    lektion,
    lastSeenAt,
    daysSinceSeen: seen,
    videosThisWeek,
    reasons: behindReasons({ pace, lektion, classLektion, daysSinceSeen: seen }),
    daily: dailyParts(counts, today, ACTIVITY_DAYS),
    lessonsDone: course?.completedLessons ?? 0,
    lessonsTotal: course?.totalLessons ?? 0,
    videosWatched: lessons.reduce((sum, lesson) => sum + lesson.videos.filter((video) => video.status === "watched").length, 0),
    videosTotal: lessons.reduce((sum, lesson) => sum + lesson.videos.length, 0),
  };
}

async function loadTeacherClass(key: string): Promise<TeacherClass | null> {
  const now = new Date();
  const [schedules, board, summaries] = await Promise.all([
    listCachedClassSchedules(),
    cachedWeekBoard(),
    readSummaries(key),
  ]);
  const schedule = schedules?.find((entry) => entry.classKey === key) ?? null;
  const learners = classLearners(board ?? [], key);
  if (!schedule && learners.length === 0) return null;
  const name = schedule?.className ?? learners[0]?.className ?? key;
  const levels = getCefrLevels();

  // Held sessions: every class day of every level up to now whose session has ended.
  const firstStart = schedule?.levels[0]?.startedOn;
  const today = schedule ? scheduleToday(schedule.format, now) : null;
  const held =
    schedule && firstStart && today
      ? classSessionDays(schedule, levelOrder(), firstStart, today).filter(
          (session) => sessionEndsAt(schedule, session.day) <= now,
        )
      : [];
  const last = held.at(-1) ?? null;
  const levelSlug = last?.level ?? schedule?.levels.at(-1)?.level ?? null;
  const summaryByDay = new Map((summaries ?? []).map((summary) => [summary.day, summary]));
  const sessions: TeacherSession[] = held
    .map((session) => ({
      ...(summaryByDay.get(session.day) ?? {
        day: session.day,
        ratedCount: 0,
        average: null,
        starCounts: null,
        tagCounts: null,
      }),
      level: session.level,
      lektion: session.lektion,
    }))
    .reverse();

  const ranked = [...learners].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, "vi"));
  const slices = await readProgressSlices(ranked.map((person) => person.userId));
  const catalog = buildCefrProgressCatalog();
  const students = ranked
    .map((person, index) => {
      const slice = slices.get(person.userId);
      const progress = normalizeProgress({
        learn: slice?.learn as StoredProgress["learn"],
        videos: slice?.videos as StoredProgress["videos"],
        activity: slice?.activity as StoredProgress["activity"],
      });
      return studentStats(person, index + 1, slice, progress, levelSlug, last?.lektion ?? null, catalog, now);
    })
    .sort((a, b) => Number(b.reasons.length > 0) - Number(a.reasons.length > 0) || a.pace - b.pace);

  return {
    key,
    name,
    levelSlug,
    levelLabel: levels.find((level) => level.slug === levelSlug)?.level ?? null,
    scheduleLine: schedule ? scheduleLine(schedule) : null,
    classLektion: last?.lektion ?? null,
    sessions,
    students,
    ratingsReady: summaries !== null,
  };
}

const cachedTeacherClass = unstable_cache(loadTeacherClass, ["teacher-class"], {
  revalidate: TEACHER_CACHE_SECONDS,
});

/** One class for the teacher site, or null when it has no timetable and no learners. */
export function readTeacherClass(key: string): Promise<TeacherClass | null> {
  return cachedTeacherClass(key);
}

/**
 * The classes a teacher may open: their assigned ones, or every class with a
 * timetable or learners for owners and staff.
 */
export async function listTeacherClassKeys(classKeys: ReadonlySet<string> | null): Promise<string[]> {
  if (classKeys) return [...classKeys].sort();
  const [schedules, board] = await Promise.all([listCachedClassSchedules(), cachedWeekBoard()]);
  const keys = new Set<string>();
  for (const schedule of schedules ?? []) keys.add(schedule.classKey);
  for (const person of board ?? []) {
    if (!person.isAdmin && !person.isStaff && !person.isTeacher && person.classKey && !person.classKey.startsWith("living:")) {
      keys.add(person.classKey);
    }
  }
  return [...keys].sort();
}

async function loadSessionRatings(key: string, day: string): Promise<TeacherRating[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("user_id, stars, tags, comment, created_at")
    .eq("class_key", key)
    .eq("session_date", day)
    .eq("status", "rated")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (!missing(error.message)) console.error("Supabase teacher session ratings", error.message);
    return null;
  }
  const board = (await cachedWeekBoard()) ?? [];
  const people = new Map(board.map((person) => [person.userId, person]));
  const rows = (data ?? []).flatMap((row) => {
    const record = row as { user_id?: unknown; stars?: unknown; tags?: unknown; comment?: unknown; created_at?: unknown };
    if (typeof record.user_id !== "string" || typeof record.stars !== "number") return [];
    const person = people.get(record.user_id);
    return [
      {
        userId: record.user_id,
        name: person?.name ?? "Học viên",
        image: person?.image ?? null,
        stars: record.stars,
        tags: Array.isArray(record.tags) ? record.tags.filter(isRatingTag) : [],
        comment: typeof record.comment === "string" ? record.comment : null,
        createdAt: typeof record.created_at === "string" ? record.created_at : "",
      },
    ];
  });
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const cachedSessionRatings = unstable_cache(loadSessionRatings, ["teacher-session-ratings"], {
  revalidate: TEACHER_CACHE_SECONDS,
});

/** Named ratings of one session, newest first. Null when ratings cannot be read. */
export function readTeacherSessionRatings(key: string, day: string): Promise<TeacherRating[] | null> {
  return cachedSessionRatings(key, day);
}

async function loadStudentRatings(
  key: string,
  userId: string,
): Promise<{ day: string; stars: number; tags: RatingTag[]; comment: string | null }[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("session_date, stars, tags, comment")
    .eq("class_key", key)
    .eq("user_id", userId)
    .eq("status", "rated")
    .limit(500);
  if (error) {
    if (!missing(error.message)) console.error("Supabase teacher student ratings", error.message);
    return null;
  }
  return (data ?? []).flatMap((row) => {
    const record = row as { session_date?: unknown; stars?: unknown; tags?: unknown; comment?: unknown };
    return typeof record.session_date === "string" && typeof record.stars === "number"
      ? [
          {
            day: record.session_date,
            stars: record.stars,
            tags: Array.isArray(record.tags) ? record.tags.filter(isRatingTag) : [],
            comment: typeof record.comment === "string" ? record.comment : null,
          },
        ]
      : [];
  });
}

const cachedStudentRatings = unstable_cache(loadStudentRatings, ["teacher-student-ratings"], {
  revalidate: TEACHER_CACHE_SECONDS,
});

/** One learner's ratings in a class, by session day. */
export function readTeacherStudentRatings(key: string, userId: string) {
  return cachedStudentRatings(key, userId);
}

