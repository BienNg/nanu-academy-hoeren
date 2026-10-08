import { isAdminUser } from "./admins";
import {
  activeStreakDays,
  normalizeGrantEmail,
  normalizeProgress,
  signInDeviceLabel,
  type AppUseRecord,
  type SignInDevice,
  type SignInRecord,
  type StoredProgress,
} from "./progress";
import type {
  AdminStoreProbe,
  UserProgressListItem,
} from "@/lib/progress-store";
import { classifyOutreach, latestStudyDay, type OutreachActivityDay } from "@/lib/outreach";
import { dayKey, googleProfileImage } from "./xp";
import type { AdminDuelXpRow, AdminListeningXpRow } from "@/lib/xp-store";
import type { AdminDuelRecord } from "@/lib/duel-store";
import type { AdminListeningRunRecord } from "@/lib/listening-runs";

export type { AdminDuelXpRow, AdminListeningXpRow, AdminDuelRecord, AdminListeningRunRecord };

export const ADMIN_PAGE_SIZE = 25;

export const CLASS_NAME_MAX_LENGTH = 64;

export type AdminSortKey = "lastLogin" | "name" | "streak" | "class";
export type AdminSortDir = "asc" | "desc";

export type AdminTrackColumn = {
  slug: string;
  label: string;
  shortLabel: string;
  totalClips: number;
};

export type AdminLevelOption = {
  slug: string;
  level: string;
};

export type AdminUserRow = {
  userId: string;
  name: string | null;
  email: string | null;
  displayName: string;
  /** Google profile photo, or null when none was stored. */
  image: string | null;
  lastLoginAt: string | null;
  lastLoginMs: number;
  streakDays: number;
  isAdmin: boolean;
  levelAccess: string[];
  interviewAccess: boolean;
  /** Leben-in-Deutschland workplace slugs granted. */
  livingAccess: string[];
  className: string | null;
  /** Limited dashboard access. Not the full admin. */
  staff: boolean;
  /** Views assigned classes only. Not combined with staff. */
  teacher: boolean;
  /** Classes this teacher may open. Empty for everyone else. */
  teacherClasses: string[];
  /** Google sign-ins, oldest first. Older rows have no device, browser, or location. */
  signIns: SignInRecord[];
  /** Learner app visits, oldest first. */
  appUses: AppUseRecord[];
  lastSignInAt: string | null;
  progress: StoredProgress;
};

export type AdminClassOption = {
  key: string;
  label: string;
  count: number;
};

export function normalizeClassName(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Case-insensitive grouping key. An empty key means the student has no class. */
export function classKey(value: string | null | undefined): string {
  return normalizeClassName(value ?? "").toLocaleLowerCase("vi");
}

export function shortBerufLabel(label: string): string {
  return label.split(" / ")[0]?.trim() || label;
}

function displayNameFor(item: UserProgressListItem): string {
  const name = item.name?.trim();
  if (name) return name;
  const email = item.email?.trim();
  if (email) return email;
  if (item.userId.length > 12) {
    return `${item.userId.slice(0, 8)}…`;
  }
  return item.userId;
}

export function withSessionIdentity(
  item: UserProgressListItem,
  session: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  },
): UserProgressListItem {
  if (!session.id || session.id !== item.userId) return item;
  return {
    ...item,
    email: item.email ?? session.email ?? null,
    name: item.name ?? session.name ?? null,
    image: item.image ?? googleProfileImage(session.image),
  };
}

export function toAdminUserRow(item: UserProgressListItem): AdminUserRow {
  const progress = normalizeProgress(item.progress);
  const lastLoginAt = item.lastLoginAt ?? item.updatedAt;
  const lastLoginMs = lastLoginAt ? new Date(lastLoginAt).getTime() : 0;

  return {
    userId: item.userId,
    name: item.name,
    email: item.email,
    displayName: displayNameFor(item),
    image: item.image ?? null,
    lastLoginAt,
    lastLoginMs: Number.isNaN(lastLoginMs) ? 0 : lastLoginMs,
    streakDays: activeStreakDays(progress),
    isAdmin: isAdminUser({ email: item.email, id: item.userId }),
    levelAccess: item.levelAccess,
    interviewAccess: item.interviewAccess,
    livingAccess: item.livingAccess ?? [],
    className: item.className,
    staff: item.staff === true,
    teacher: item.teacher === true,
    teacherClasses: item.teacherClasses ?? [],
    signIns: item.signIns ?? [],
    appUses: item.appUses ?? [],
    lastSignInAt: item.signIns?.length ? (item.signIns[item.signIns.length - 1]?.at ?? null) : null,
    progress,
  };
}

function compareRows(
  a: AdminUserRow,
  b: AdminUserRow,
  sort: AdminSortKey,
  dir: AdminSortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  if (sort === "lastLogin") {
    if (a.lastLoginMs !== b.lastLoginMs) {
      return (a.lastLoginMs - b.lastLoginMs) * sign;
    }
  } else if (sort === "streak") {
    if (a.streakDays !== b.streakDays) {
      return (a.streakDays - b.streakDays) * sign;
    }
  } else if (sort === "class") {
    const aKey = classKey(a.className);
    const bKey = classKey(b.className);
    if (!aKey !== !bKey) return aKey ? -1 : 1;
    if (aKey !== bKey) {
      return (
        (a.className ?? "").localeCompare(b.className ?? "", "vi", {
          sensitivity: "base",
        }) * sign
      );
    }
  } else {
    const byName = a.displayName.localeCompare(b.displayName, "en", {
      sensitivity: "base",
    });
    if (byName !== 0) return byName * sign;
  }

  return a.displayName.localeCompare(b.displayName, "en", {
    sensitivity: "base",
  });
}

export function filterAdminUsers(
  rows: readonly AdminUserRow[],
  query: string,
): AdminUserRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => {
    const haystack = [row.displayName, row.name, row.email, row.className, row.userId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function sortAdminUsers(
  rows: readonly AdminUserRow[],
  sort: AdminSortKey,
  dir: AdminSortDir,
): AdminUserRow[] {
  return [...rows].sort((a, b) => compareRows(a, b, sort, dir));
}

export function paginateAdminUsers(
  rows: readonly AdminUserRow[],
  page: number,
  pageSize: number = ADMIN_PAGE_SIZE,
): {
  pageRows: AdminUserRow[];
  page: number;
  pageCount: number;
  total: number;
} {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    pageRows: rows.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total,
  };
}

export type AdminRosterPoint = {
  key: string;
  label: string;
  users: number;
  classes: number;
};

/**
 * Running totals for the Students chart. Each point is how many accounts
 * and classes existed by that Vietnam day. An account counts from its
 * earliest sign-in or activity. A class counts from the earliest day one
 * of its current students was first seen. Accounts with no date stay in
 * the baseline so the last point matches the roster.
 */
export function buildAdminRosterTrend(
  rows: readonly AdminUserRow[],
  now = new Date(),
): AdminRosterPoint[] {
  const days = [...adminRangeVietnamDayKeys("30d", now)].reverse();
  const people = rows.map((row) => ({
    day: firstSeenDay(row),
    className: classKey(row.className),
  }));

  const classFirst = new Map<string, string | null>();
  for (const person of people) {
    if (!person.className) continue;
    const current = classFirst.get(person.className);
    if (current === undefined) {
      classFirst.set(person.className, person.day);
      continue;
    }
    if (person.day && (!current || person.day < current)) {
      classFirst.set(person.className, person.day);
    }
  }

  return days.map((day) => {
    let users = 0;
    for (const person of people) {
      if (!person.day || person.day <= day) users += 1;
    }
    let classes = 0;
    for (const first of classFirst.values()) {
      if (!first || first <= day) classes += 1;
    }
    return {
      key: day,
      label: formatUtcDayLabel(day),
      users,
      classes,
    };
  });
}

type AdminClassMemberHint = {
  className?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  lastSignInAt?: string | null;
  signIns?: AdminUserRow["signIns"];
  progress?: AdminUserRow["progress"];
};

/** Earliest day this person was seen, or the pending-grant update day. */
function classMemberFirstDay(row: AdminClassMemberHint): string | null {
  if (row.progress && row.signIns) {
    return firstSeenDay(row as AdminUserRow);
  }
  return calendarDay(row.updatedAt ?? row.lastLoginAt ?? row.lastSignInAt ?? null);
}

/** Distinct classes, labeled with the most common spelling of each name. */
export function listAdminClasses(
  rows: readonly AdminClassMemberHint[],
): AdminClassOption[] {
  const groups = new Map<string, Map<string, number>>();
  const firstDay = new Map<string, string | null>();
  for (const row of rows) {
    const key = classKey(row.className);
    if (!key) continue;
    const label = normalizeClassName(row.className ?? "");
    const votes = groups.get(key) ?? new Map<string, number>();
    votes.set(label, (votes.get(label) ?? 0) + 1);
    groups.set(key, votes);
    const day = classMemberFirstDay(row);
    const current = firstDay.get(key);
    if (current === undefined) {
      firstDay.set(key, day);
    } else if (day && (!current || day < current)) {
      firstDay.set(key, day);
    }
  }

  const options: AdminClassOption[] = [];
  for (const [key, votes] of groups) {
    let label = "";
    let best = -1;
    let count = 0;
    for (const [candidate, votesFor] of votes) {
      count += votesFor;
      if (
        votesFor > best ||
        (votesFor === best && candidate.localeCompare(label, "vi", { sensitivity: "base" }) < 0)
      ) {
        best = votesFor;
        label = candidate;
      }
    }
    options.push({ key, label, count });
  }

  options.sort((a, b) => {
    const aDay = firstDay.get(a.key) ?? "";
    const bDay = firstDay.get(b.key) ?? "";
    if (aDay !== bDay) {
      if (!aDay) return 1;
      if (!bDay) return -1;
      return bDay.localeCompare(aDay);
    }
    return a.label.localeCompare(b.label, "vi", { sensitivity: "base" });
  });
  return options;
}

export function usersInClass(
  rows: readonly AdminUserRow[],
  key: string,
): AdminUserRow[] {
  return rows.filter((row) => classKey(row.className) === key);
}

export type AdminActivityStats = {
  users: number;
  activeUsers: number;
  videosWatched: number;
  /** Playback seconds while a video was actually playing, in the window. */
  videoSeconds: number;
  /** Distinct videos each learner played at all in the window, summed over learners. */
  videosStarted: number;
  /** Visit-logged playback seconds on those started videos. */
  startedVideoSeconds: number;
  studyRuns: number;
  practiceRuns: number;
};

/** Windows offered by the admin date-range pill. */
export const ADMIN_RANGES = ["today", "7d", "30d", "90d"] as const;

export type AdminRange = (typeof ADMIN_RANGES)[number];

export const DEFAULT_ADMIN_RANGE: AdminRange = "30d";

/** Overview and Activity open on today. Other ranged pages keep the 30-day default. */
export const OVERVIEW_ADMIN_RANGE: AdminRange = "today";

const TODAY_FIRST_ADMIN_PATHS = new Set(["/admin", "/admin/activity"]);

/** The range a ranged admin page shows when the URL has no `?range=`. */
export function defaultAdminRangeForPath(pathname: string): AdminRange {
  return TODAY_FIRST_ADMIN_PATHS.has(pathname) ? OVERVIEW_ADMIN_RANGE : DEFAULT_ADMIN_RANGE;
}

const RANGE_DAYS: Record<AdminRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const RANGE_LABELS: Record<AdminRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

/** Unknown and missing values fall back to `fallback` rather than throwing. */
export function parseAdminRange(
  value: string | string[] | undefined,
  fallback: AdminRange = DEFAULT_ADMIN_RANGE,
): AdminRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return ADMIN_RANGES.find((range) => range === raw) ?? fallback;
}

export function adminRangeLabel(range: AdminRange): string {
  return RANGE_LABELS[range];
}

export function adminRangeDays(range: AdminRange): number {
  return RANGE_DAYS[range];
}

/** Inclusive start and exclusive end of the Vietnam window, as UTC instants. */
export function adminRangeVietnamInterval(
  range: AdminRange,
  now = new Date(),
): { from: string; to: string } {
  const days = adminRangeVietnamDayKeys(range, now);
  const oldest = days[days.length - 1] ?? days[0];
  const newest = days[0];
  const [year, month, day] = newest.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, (month ?? 1) - 1, day) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    from: vietnamDayStartIso(oldest),
    to: vietnamDayStartIso(nextDay),
  };
}

/** Midnight in Asia/Ho_Chi_Minh for a `YYYY-MM-DD` calendar day. */
function vietnamDayStartIso(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, date) - 7 * 60 * 60 * 1000).toISOString();
}

/** Vietnam calendar days in the window, newest first. */
export function adminRangeDayKeys(
  range: AdminRange,
  now = new Date(),
): string[] {
  return adminRangeVietnamDayKeys(range, now);
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Calendar day for an admin chart. A full timestamp uses Asia/Ho_Chi_Minh.
 * A date-only `YYYY-MM-DD` is already a calendar key and stays as written.
 */
function calendarDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return dayKey(date);
}

function vietnamHour(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + VIETNAM_OFFSET_MS).getUTCHours();
}

/** Avatars drawn in one timeline column before the rest collapse into +N. */
export const ACTIVE_USER_TIMELINE_CAP = 20;

export type ActiveTimelineStudent = {
  userId: string;
  displayName: string;
  image: string | null;
  lastLoginAt: string;
  lastLoginMs: number;
};

export type ActiveTimelineColumn = {
  key: string;
  label: string;
  /**
   * Secondary axis text. Today's columns show the Europe/Berlin hour under the
   * Vietnam hour. Longer day ranges show the month on the first column and on the 1st.
   */
  marker: string | null;
  /** Active in the window, newest last-seen first. */
  students: ActiveTimelineStudent[];
  /** Last seen in this column, but not active in the window. Newest first. */
  seen: ActiveTimelineStudent[];
};

export type ActiveUserTimeline = {
  grain: "hour" | "day";
  columns: ActiveTimelineColumn[];
  /** Active rows whose last-seen time is missing or outside this axis. */
  unplaced: number;
};

/**
 * Stable while the Vietnam hour does not change, so a ticking clock does not
 * rebuild the timeline until the axis grows.
 */
export function adminTimelineClockKey(now = new Date()): string {
  const hour = new Date(now.getTime() + VIETNAM_OFFSET_MS).getUTCHours();
  return `${dayKey(now)}T${String(hour).padStart(2, "0")}`;
}

/** Instant at the start of the Vietnam hour encoded by `adminTimelineClockKey`. */
export function timelineDateFromClockKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (!match) return new Date(NaN);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4])) -
      VIETNAM_OFFSET_MS,
  );
}

function timelineStudent(row: AdminUserRow): ActiveTimelineStudent | null {
  if (!row.lastLoginAt) return null;
  const lastLoginMs = new Date(row.lastLoginAt).getTime();
  if (Number.isNaN(lastLoginMs)) return null;
  return {
    userId: row.userId,
    displayName: row.displayName,
    image: row.image,
    lastLoginAt: row.lastLoginAt,
    lastLoginMs,
  };
}

function byNewestSeen(a: ActiveTimelineStudent, b: ActiveTimelineStudent): number {
  if (a.lastLoginMs !== b.lastLoginMs) return b.lastLoginMs - a.lastLoginMs;
  return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
}

/** Europe/Berlin wall-clock hour for a Vietnam hour on `vietnamDay` (`YYYY-MM-DD`). */
function berlinHourLabel(vietnamDay: string, hour: number): string {
  const instant = timelineDateFromClockKey(
    `${vietnamDay}T${String(hour).padStart(2, "0")}`,
  );
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .find((item) => item.type === "hour")?.value;
  return String(Number(part));
}

function timelineDayParts(day: string): { label: string; month: string; dayNum: number } | null {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const dayNum = date.getUTCDate();
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    date,
  );
  return { label: `${weekday} ${dayNum}`, month, dayNum };
}

/**
 * Puts `row` on the active or seen stack. Returns true when an active row
 * could not be placed. Seen-only rows outside the axis are omitted.
 */
function placeTimelineStudent(
  column: ActiveTimelineColumn | undefined,
  row: AdminUserRow,
  activeUserIds?: ReadonlySet<string>,
): boolean {
  const student = timelineStudent(row);
  const active = activeUserIds == null || activeUserIds.has(row.userId);
  if (!student || !column) return active;
  (active ? column.students : column.seen).push(student);
  return false;
}

function sortTimelineColumns(columns: readonly ActiveTimelineColumn[]): void {
  for (const column of columns) {
    column.students.sort(byNewestSeen);
    column.seen.sort(byNewestSeen);
  }
}

/**
 * One column per hour from midnight through the current Vietnam hour, or one
 * column per day in the window. Each student is placed once, at `lastLoginAt`.
 * Active rows whose last-seen time falls outside the axis are counted in
 * `unplaced`. When `activeUserIds` is set, everyone else with a last-seen time
 * on the axis goes on that column's `seen` stack.
 */
export function buildActiveUserTimeline(
  rows: readonly AdminUserRow[],
  range: AdminRange,
  now = new Date(),
  activeUserIds?: ReadonlySet<string>,
): ActiveUserTimeline {
  const today = dayKey(now);
  const currentHour = new Date(now.getTime() + VIETNAM_OFFSET_MS).getUTCHours();

  if (range === "today") {
    const columns: ActiveTimelineColumn[] = Array.from({ length: currentHour + 1 }, (_, hour) => ({
      key: `${today}T${String(hour).padStart(2, "0")}`,
      label: String(hour),
      marker: berlinHourLabel(today, hour),
      students: [],
      seen: [],
    }));
    const byHour = new Map(columns.map((column) => [column.key, column]));
    let unplaced = 0;

    for (const row of rows) {
      const student = timelineStudent(row);
      const hour = student ? vietnamHour(student.lastLoginAt) : null;
      const column =
        student && calendarDay(student.lastLoginAt) === today && hour != null && hour <= currentHour
          ? byHour.get(`${today}T${String(hour).padStart(2, "0")}`)
          : undefined;
      if (placeTimelineStudent(column, row, activeUserIds)) unplaced += 1;
    }

    sortTimelineColumns(columns);
    return { grain: "hour", columns, unplaced };
  }

  const days = [...adminRangeDayKeys(range, now)].reverse();
  const compact = range !== "7d";
  const columns: ActiveTimelineColumn[] = days.map((day, index) => {
    const parts = timelineDayParts(day);
    return {
      key: day,
      label: parts ? (compact ? String(parts.dayNum) : parts.label) : day,
      marker: parts && compact && (index === 0 || parts.dayNum === 1) ? parts.month : null,
      students: [],
      seen: [],
    };
  });
  const byDay = new Map(columns.map((column) => [column.key, column]));
  let unplaced = 0;

  for (const row of rows) {
    const student = timelineStudent(row);
    const day = student ? calendarDay(student.lastLoginAt) : null;
    const column = day ? byDay.get(day) : undefined;
    if (placeTimelineStudent(column, row, activeUserIds)) unplaced += 1;
  }

  sortTimelineColumns(columns);
  return { grain: "day", columns, unplaced };
}

/** Clock time in Asia/Ho_Chi_Minh, e.g. "30 Sept 2026, 11:40". */
export function formatAdminTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Whole Vietnam calendar days from `earlier` to `later` (`YYYY-MM-DD`). */
function calendarDayGap(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  const start = Date.UTC(y1 ?? 0, (m1 ?? 1) - 1, d1 ?? 1);
  const end = Date.UTC(y2 ?? 0, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((end - start) / 86_400_000);
}

/**
 * Last seen relative to now. Same Vietnam calendar day is hours ago,
 * the previous day is "yesterday", and older days are "x days ago".
 */
export function formatRelativeLastSeen(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;

  const dayGap = calendarDayGap(dayKey(then), dayKey(now));
  if (dayGap <= 0) {
    const hours = Math.floor((now.getTime() - then.getTime()) / (60 * 60 * 1000));
    if (hours < 1) return "less than an hour ago";
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (dayGap === 1) return "yesterday";
  return `${dayGap} days ago`;
}

function formatUtcDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function studyRunsOnDay(progress: StoredProgress, day: string): number {
  const recorded = progress.activity?.[day]?.studyRuns ?? 0;
  let firstCompletions = 0;
  for (const entry of Object.values(progress.learn)) {
    if (calendarDay(entry.studyCompletedAt) === day) firstCompletions += 1;
  }
  return Math.max(recorded, firstCompletions);
}

function practiceRunsOnDay(progress: StoredProgress, day: string): number {
  const recorded = progress.activity?.[day]?.practiceRuns ?? 0;
  let firstCompletions = 0;
  for (const entry of Object.values(progress.learn)) {
    if (calendarDay(entry.completedAt) === day) firstCompletions += 1;
  }
  return Math.max(recorded, firstCompletions);
}

/** Playback seconds in the Vietnam window, from daily totals and visit playback. */
export function videoSecondsInRange(
  progress: StoredProgress,
  days: readonly string[],
): number {
  const fromVisits = new Map<string, number>();
  for (const visit of progress.visits ?? []) {
    const day = calendarDay(visit.startedAt);
    if (!day) continue;
    const seconds = visit.videos.reduce((sum, video) => sum + video.seconds, 0);
    fromVisits.set(day, (fromVisits.get(day) ?? 0) + seconds);
  }
  let seconds = 0;
  for (const day of days) {
    const recorded = progress.activity?.[day]?.videoSeconds ?? 0;
    seconds += Math.max(recorded, fromVisits.get(day) ?? 0);
  }
  return seconds;
}

/** Minutes of video playback in the Vietnam window. Under a minute still counts as 1. */
export function videoMinutesInRange(
  progress: StoredProgress,
  days: readonly string[],
): number {
  const seconds = videoSecondsInRange(progress, days);
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

function videosWatchedOnDay(progress: StoredProgress, day: string): number {
  let count = 0;
  for (const entry of Object.values(progress.videos)) {
    if (calendarDay(entry.watchedAt) === day) count += 1;
  }
  return count;
}

function activeSecondsOnDay(progress: StoredProgress, day: string): number {
  const recorded = progress.activity?.[day]?.activeSeconds ?? 0;
  let fromVisits = 0;
  for (const visit of progress.visits ?? []) {
    if (calendarDay(visit.startedAt) === day) fromVisits += visit.activeSeconds;
  }
  return Math.max(recorded, fromVisits);
}

/** Active seconds in the Vietnam window, from daily totals and visit time. */
export function activeSecondsInRange(
  progress: StoredProgress,
  days: readonly string[],
): number {
  let seconds = 0;
  for (const day of days) seconds += activeSecondsOnDay(progress, day);
  return seconds;
}

function dayWork(progress: StoredProgress, day: string): {
  videos: number;
  study: number;
  practice: number;
} {
  return {
    videos: videosWatchedOnDay(progress, day),
    study: studyRunsOnDay(progress, day),
    practice: practiceRunsOnDay(progress, day),
  };
}

/** A finished study or practice card. A miss counts; opening the app does not. */
function visitFinishedCard(visit: { clips: readonly unknown[]; exercisesCompleted: number; listeningRuns: number; wrongAttempts?: number }): boolean {
  return (
    visit.clips.length > 0 ||
    visit.exercisesCompleted > 0 ||
    visit.listeningRuns > 0 ||
    (visit.wrongAttempts ?? 0) > 0
  );
}

function completedCardOnDay(progress: StoredProgress, day: string): boolean {
  if (studyRunsOnDay(progress, day) > 0 || practiceRunsOnDay(progress, day) > 0) return true;
  const dayActivity = progress.activity?.[day];
  if ((dayActivity?.clips ?? 0) > 0 || (dayActivity?.exercises ?? 0) > 0) return true;
  for (const visit of progress.visits ?? []) {
    if (calendarDay(visit.startedAt) === day && visitFinishedCard(visit)) return true;
  }
  return false;
}

function emptyPoint(key: string, label: string): AdminActivityPoint {
  return {
    key,
    label,
    activeUsers: 0,
    activeSeconds: 0,
    videosWatched: 0,
    studyRuns: 0,
    practiceRuns: 0,
    clips: 0,
    videoSeconds: 0,
    videosStarted: 0,
    startedVideoSeconds: 0,
    studyParts: 0,
    practiceParts: 0,
  };
}

/** Today is charted by Vietnam hour; every longer range by Vietnam day. */
export function adminActivityGrain(range: AdminRange): AdminActivityGrain {
  return range === "today" ? "hour" : "day";
}

/**
 * Buckets part timestamps for the activity board. On the daily board a study
 * part's own `dayKey` wins, so the chart agrees with the per-day XP log.
 */
export function bucketPartStamps(
  stamps: readonly { userId: string; at: string; dayKey?: string | null }[],
  grain: AdminActivityGrain,
): AdminPartBuckets {
  const buckets: AdminPartBuckets = {};
  for (const stamp of stamps) {
    const key =
      grain === "day" && stamp.dayKey ? stamp.dayKey : activityBucketKey(stamp.at, grain);
    if (!key) continue;
    const byUser = (buckets[key] ??= {});
    byUser[stamp.userId] = (byUser[stamp.userId] ?? 0) + 1;
  }
  return buckets;
}

/** Total parts per learner across every bucket. */
export function partsByUser(buckets: AdminPartBuckets): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const byUser of Object.values(buckets)) {
    for (const [userId, count] of Object.entries(byUser)) {
      totals[userId] = (totals[userId] ?? 0) + count;
    }
  }
  return totals;
}

/** The activity-board point a timestamp falls in, matching `AdminActivityPoint.key`. */
export function activityBucketKey(at: string, grain: AdminActivityGrain): string | null {
  const day = calendarDay(at);
  if (!day) return null;
  if (grain === "day") return day;
  const hour = vietnamHour(at);
  return hour == null ? null : `${day}T${String(hour).padStart(2, "0")}`;
}

function isRowActiveInWindow(
  row: AdminUserRow,
  days: readonly string[],
  cardUserIds?: ReadonlySet<string>,
): boolean {
  if (cardUserIds?.has(row.userId)) return true;
  return days.some((day) => completedCardOnDay(row.progress, day));
}

/** Students only. Admins, staff, and teachers stay out of engagement totals. */
function learnerRows(rows: readonly AdminUserRow[]): AdminUserRow[] {
  return rows.filter((row) => !row.isAdmin && !row.staff && !row.teacher);
}

/**
 * A teacher sees students in the classes they were assigned. `null` keeps
 * every row, for the owner and staff. Students with no class stay hidden.
 */
export function rowsForClassScope(
  rows: readonly AdminUserRow[],
  classKeys: ReadonlySet<string> | null,
): AdminUserRow[] {
  if (!classKeys) return [...rows];
  return rows.filter((row) => {
    if (row.isAdmin || row.staff || row.teacher) return false;
    const key = classKey(row.className);
    return key.length > 0 && classKeys.has(key);
  });
}

/** Totals over the selected window. Days are Asia/Ho_Chi_Minh. */
export function buildAdminActivityStats(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
  cardUserIds?: ReadonlySet<string>,
): AdminActivityStats {
  const learners = learnerRows(rows);
  const days = adminRangeDayKeys(range, now);
  let activeUsers = 0;
  let videosWatched = 0;
  let videoSeconds = 0;
  let videosStarted = 0;
  let startedVideoSeconds = 0;
  let studyRuns = 0;
  let practiceRuns = 0;
  const daySet = new Set(days);

  for (const row of learners) {
    const started = new Set<string>();
    for (const visit of row.progress.visits ?? []) {
      const day = calendarDay(visit.startedAt);
      if (!day || !daySet.has(day)) continue;
      for (const video of visit.videos) {
        if (video.seconds <= 0) continue;
        started.add(video.key);
        startedVideoSeconds += video.seconds;
      }
    }
    videosStarted += started.size;

    let rowVideos = 0;
    let rowStudy = 0;
    let rowPractice = 0;

    for (const day of days) {
      const work = dayWork(row.progress, day);
      rowVideos += work.videos;
      rowStudy += work.study;
      rowPractice += work.practice;
    }

    videosWatched += rowVideos;
    videoSeconds += videoSecondsInRange(row.progress, days);
    studyRuns += rowStudy;
    practiceRuns += rowPractice;

    if (isRowActiveInWindow(row, days, cardUserIds)) activeUsers += 1;
  }

  return {
    users: learners.length,
    activeUsers,
    videosWatched,
    videoSeconds,
    videosStarted,
    startedVideoSeconds,
    studyRuns,
    practiceRuns,
  };
}

/** Users active in the window, most recently seen first — for the Overview's detailed list. */
export function listActiveAdminUsers(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
  cardUserIds?: ReadonlySet<string>,
): AdminUserRow[] {
  const days = adminRangeDayKeys(range, now);
  return learnerRows(rows)
    .filter((row) => isRowActiveInWindow(row, days, cardUserIds))
    .sort((a, b) => b.lastLoginMs - a.lastLoginMs);
}

export type AdminActivityGrain = "hour" | "day";

export type AdminActivityPoint = {
  key: string;
  label: string;
  activeUsers: number;
  activeSeconds: number;
  videosWatched: number;
  studyRuns: number;
  practiceRuns: number;
  clips: number;
  /** Video playback seconds. */
  videoSeconds: number;
  /** Distinct videos each learner played in this bucket, from visits, summed over learners. */
  videosStarted: number;
  /** Visit-logged playback seconds on those started videos. */
  startedVideoSeconds: number;
  /** Finished study parts, from the study XP log. */
  studyParts: number;
  /** Finished practice parts, from the listening run log. */
  practiceParts: number;
};

/**
 * Finished parts per learner, keyed by activity-board bucket: the point key
 * (`YYYY-MM-DD`, or `YYYY-MM-DDTHH` on today's hourly board) → user id → count.
 */
export type AdminPartBuckets = Record<string, Record<string, number>>;

export type AdminActivityLeader = {
  userId: string;
  displayName: string;
  className: string | null;
  activeSeconds: number;
  videosWatched: number;
  studyRuns: number;
  practiceRuns: number;
};

export type AdminActivityBoard = {
  grain: AdminActivityGrain;
  points: AdminActivityPoint[];
  leaders: AdminActivityLeader[];
};

function buildDailyActivityPoints(
  rows: readonly AdminUserRow[],
  daysNewestFirst: readonly string[],
): AdminActivityPoint[] {
  const points = [...daysNewestFirst].reverse().map((day) =>
    emptyPoint(day, formatUtcDayLabel(day)),
  );
  const indexByDay = new Map(points.map((point, index) => [point.key, index]));

  for (const row of rows) {
    for (const day of daysNewestFirst) {
      const index = indexByDay.get(day);
      if (index == null) continue;
      const point = points[index];
      const work = dayWork(row.progress, day);
      if (completedCardOnDay(row.progress, day)) point.activeUsers += 1;
      point.activeSeconds += activeSecondsOnDay(row.progress, day);
      point.videosWatched += work.videos;
      point.studyRuns += work.study;
      point.practiceRuns += work.practice;
      point.clips += row.progress.activity?.[day]?.clips ?? 0;
      point.videoSeconds += videoSecondsInRange(row.progress, [day]);
    }
  }

  return points;
}

function buildHourlyActivityPoints(
  rows: readonly AdminUserRow[],
  day: string,
): AdminActivityPoint[] {
  const points = Array.from({ length: 24 }, (_, hour) =>
    emptyPoint(
      `${day}T${String(hour).padStart(2, "0")}`,
      `${String(hour).padStart(2, "0")}:00`,
    ),
  );
  const usersByHour = Array.from({ length: 24 }, () => new Set<string>());

  for (const row of rows) {
    for (const visit of row.progress.visits ?? []) {
      if (calendarDay(visit.startedAt) !== day) continue;
      const hour = vietnamHour(visit.startedAt);
      if (hour == null) continue;
      if (visitFinishedCard(visit)) usersByHour[hour].add(row.userId);
      points[hour].activeSeconds += visit.activeSeconds;
      points[hour].clips += visit.clips.length;
      points[hour].practiceRuns += visit.listeningRuns;
      points[hour].videoSeconds += visit.videos.reduce((sum, video) => sum + video.seconds, 0);
    }

    for (const entry of Object.values(row.progress.videos)) {
      if (calendarDay(entry.watchedAt) !== day) continue;
      const hour = vietnamHour(entry.watchedAt);
      if (hour == null) continue;
      points[hour].videosWatched += 1;
    }

    if (completedCardOnDay(row.progress, day) && usersByHour.every((set) => !set.has(row.userId))) {
      // Seen that Vietnam day without a timestamped visit: count them at midnight
      // rather than dropping them from the hourly chart.
      usersByHour[0].add(row.userId);
    }
  }

  return points.map((point, hour) => ({
    ...point,
    activeUsers: usersByHour[hour].size,
  }));
}

function buildActivityLeaders(
  rows: readonly AdminUserRow[],
  days: readonly string[],
): AdminActivityLeader[] {
  const leaders: AdminActivityLeader[] = [];

  for (const row of rows) {
    let videosWatched = 0;
    let studyRuns = 0;
    let practiceRuns = 0;

    for (const day of days) {
      const work = dayWork(row.progress, day);
      videosWatched += work.videos;
      studyRuns += work.study;
      practiceRuns += work.practice;
    }
    const activeSeconds = activeSecondsInRange(row.progress, days);

    leaders.push({
      userId: row.userId,
      displayName: row.displayName,
      className: row.className,
      activeSeconds,
      videosWatched,
      studyRuns,
      practiceRuns,
    });
  }

  leaders.sort((a, b) => {
    if (a.activeSeconds !== b.activeSeconds) return b.activeSeconds - a.activeSeconds;
    const aWork = a.videosWatched + a.studyRuns + a.practiceRuns;
    const bWork = b.videosWatched + b.studyRuns + b.practiceRuns;
    if (aWork !== bWork) return bWork - aWork;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });

  return leaders;
}

/**
 * Time series for the Activity page. Multi-day windows are Vietnam days, oldest
 * first. "Today" is 24 hours in Asia/Ho_Chi_Minh.
 */
export function buildAdminActivityBoard(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
  parts: { study: AdminPartBuckets; practice: AdminPartBuckets } = { study: {}, practice: {} },
): AdminActivityBoard {
  const learners = learnerRows(rows);
  const days = adminRangeDayKeys(range, now);
  const grain = adminActivityGrain(range);
  const points =
    grain === "hour"
      ? buildHourlyActivityPoints(learners, days[0])
      : buildDailyActivityPoints(learners, days);
  const pointByKey = new Map(points.map((point) => [point.key, point]));
  for (const row of learners) {
    const startedByPoint = new Map<string, Set<string>>();
    for (const visit of row.progress.visits ?? []) {
      const point = pointByKey.get(activityBucketKey(visit.startedAt, grain) ?? "");
      if (!point) continue;
      let started = startedByPoint.get(point.key);
      if (!started) {
        started = new Set();
        startedByPoint.set(point.key, started);
      }
      for (const video of visit.videos) {
        if (video.seconds <= 0) continue;
        if (!started.has(video.key)) {
          started.add(video.key);
          point.videosStarted += 1;
        }
        point.startedVideoSeconds += video.seconds;
      }
    }
  }
  for (const point of points) {
    const study = parts.study[point.key];
    const practice = parts.practice[point.key];
    if (!study && !practice) continue;
    for (const row of learners) {
      point.studyParts += study?.[row.userId] ?? 0;
      point.practiceParts += practice?.[row.userId] ?? 0;
    }
  }
  return { grain, points, leaders: buildActivityLeaders(learners, days) };
}

export type AdminClientSlice = {
  key: string;
  label: string;
  /** Students with at least one overlapping visit on this client. */
  students: number;
  /** Visits that overlap the selected window. */
  visits: number;
};

export type AdminClientUsage = {
  devices: AdminClientSlice[];
  browsers: AdminClientSlice[];
  /** Students with a visit in the window, including ones with no client fields. */
  students: number;
  visits: number;
};

const CLIENT_DEVICE_ORDER: readonly SignInDevice[] = ["mobile", "tablet", "desktop"];

function visitOverlapsWindow(visit: AppUseRecord, fromMs: number, toMs: number): boolean {
  const start = Date.parse(visit.at);
  if (Number.isNaN(start)) return false;
  const seen = Date.parse(visit.seenAt);
  const end = Number.isNaN(seen) ? start : Math.max(start, seen);
  return start < toMs && end >= fromMs;
}

/**
 * Browsers and devices used in the selected window. A visit counts when it
 * overlaps the Vietnam interval. One student can appear in more than one slice.
 */
export function buildAdminClientUsage(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminClientUsage {
  const { from, to } = adminRangeVietnamInterval(range, now);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const devices = new Map<string, { students: Set<string>; visits: number }>();
  const browsers = new Map<string, { students: Set<string>; visits: number }>();
  const people = new Set<string>();
  let visits = 0;

  const bump = (
    buckets: Map<string, { students: Set<string>; visits: number }>,
    key: string,
    userId: string,
  ) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { students: new Set(), visits: 0 };
      buckets.set(key, bucket);
    }
    bucket.students.add(userId);
    bucket.visits += 1;
  };

  for (const row of learnerRows(rows)) {
    for (const visit of row.appUses) {
      if (!visitOverlapsWindow(visit, fromMs, toMs)) continue;
      people.add(row.userId);
      visits += 1;
      bump(devices, visit.device ?? "unknown", row.userId);
      bump(browsers, visit.browser?.trim() || "Unknown", row.userId);
    }
  }

  const slice = (
    key: string,
    label: string,
    bucket: { students: Set<string>; visits: number } | undefined,
  ): AdminClientSlice | null => {
    if (!bucket || bucket.students.size === 0) return null;
    return { key, label, students: bucket.students.size, visits: bucket.visits };
  };

  const deviceSlices = CLIENT_DEVICE_ORDER.flatMap((device) => {
    const item = slice(device, signInDeviceLabel(device), devices.get(device));
    return item ? [item] : [];
  });
  const unknownDevice = slice("unknown", "Unknown", devices.get("unknown"));
  if (unknownDevice) deviceSlices.push(unknownDevice);

  const browserSlices = [...browsers.entries()]
    .flatMap(([key, bucket]) => {
      const item = slice(key, key, bucket);
      return item ? [item] : [];
    })
    .sort(
      (a, b) => b.students - a.students || b.visits - a.visits || a.label.localeCompare(b.label),
    );

  return { devices: deviceSlices, browsers: browserSlices, students: people.size, visits };
}

function shiftUtcDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function utcDayDiff(later: string, earlier: string): number {
  const next = Date.parse(`${later}T00:00:00.000Z`);
  const prev = Date.parse(`${earlier}T00:00:00.000Z`);
  if (Number.isNaN(next) || Number.isNaN(prev)) return 0;
  return Math.round((next - prev) / 86_400_000);
}

function isActiveOn(row: AdminUserRow, day: string): boolean {
  return completedCardOnDay(row.progress, day);
}

function firstSeenDay(row: AdminUserRow): string | null {
  const days: string[] = [];
  const add = (value: string | null | undefined) => {
    const day = calendarDay(value);
    if (day) days.push(day);
  };
  add(row.signIns[0]?.at);
  add(row.lastSignInAt);
  add(row.lastLoginAt);
  add(row.progress.lastPracticeDate);
  for (const day of row.progress.practiceDates ?? []) add(day);
  for (const day of Object.keys(row.progress.activity ?? {})) add(day);
  for (const visit of row.progress.visits ?? []) add(visit.startedAt);
  days.sort();
  return days[0] ?? null;
}

function lastActiveDay(row: AdminUserRow): string | null {
  let best: string | null = calendarDay(row.lastLoginAt);
  const consider = (value: string | null | undefined) => {
    const day = calendarDay(value);
    if (day && (!best || day > best)) best = day;
  };
  consider(row.lastSignInAt);
  consider(row.progress.lastPracticeDate);
  for (const day of row.progress.practiceDates ?? []) consider(day);
  for (const day of Object.keys(row.progress.activity ?? {})) consider(day);
  for (const visit of row.progress.visits ?? []) consider(visit.startedAt);
  for (const entry of Object.values(row.progress.videos)) {
    consider(entry.watchedAt);
  }
  for (const entry of Object.values(row.progress.learn)) {
    consider(entry.completedAt);
    consider(entry.studyCompletedAt);
  }
  return best;
}

export type AdminRetentionPoint = {
  key: string;
  label: string;
  cohort: number;
  returned: number;
  rate: number;
};

export type AdminStreakBucket = {
  key: string;
  label: string;
  count: number;
};

export type AdminRetentionPerson = {
  userId: string;
  displayName: string;
  className: string | null;
  lastActiveDay: string | null;
  daysAgo: number;
  streakDays: number;
};

export type AdminRetentionBoard = {
  returning: number;
  newcomers: number;
  d1Rate: number | null;
  d1Cohort: number;
  d1Returned: number;
  onStreak: number;
  lapsed: number;
  stickiness: number | null;
  d1: AdminRetentionPoint[];
  streaks: AdminStreakBucket[];
  streakLeaders: AdminRetentionPerson[];
  lapsedPeople: AdminRetentionPerson[];
};

const STREAK_LEADERS_LIMIT = 8;
const LAPSED_LIMIT = 12;

const STREAK_BUCKETS: { key: string; label: string; matches: (days: number) => boolean }[] = [
  { key: "0", label: "None", matches: (days) => days <= 0 },
  { key: "1", label: "1 day", matches: (days) => days === 1 },
  { key: "2-3", label: "2–3 days", matches: (days) => days >= 2 && days <= 3 },
  { key: "4-7", label: "4–7 days", matches: (days) => days >= 4 && days <= 7 },
  { key: "8+", label: "8+ days", matches: (days) => days >= 8 },
];

/**
 * Comeback metrics for the Retention page. D1 is "active on day D, and
 * again on D+1". The selected window uses Asia/Ho_Chi_Minh calendar days.
 */
export function buildAdminRetentionBoard(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminRetentionBoard {
  const windowDays = adminRangeDayKeys(range, now);
  const today = windowDays[0];
  const oldest = windowDays[windowDays.length - 1];
  const yesterday = shiftUtcDay(today, -1);
  const scanDays = [...new Set([...windowDays, yesterday])];

  const activeByUser = new Map<string, Set<string>>();
  for (const row of rows) {
    const days = new Set<string>();
    for (const day of scanDays) {
      if (isActiveOn(row, day)) days.add(day);
    }
    activeByUser.set(row.userId, days);
  }

  let returning = 0;
  let newcomers = 0;
  let windowActives = 0;
  let lastDayActives = 0;
  let onStreak = 0;

  const lapsedPeople: AdminRetentionPerson[] = [];
  const streakLeaders: AdminRetentionPerson[] = [];

  for (const row of rows) {
    const activeDays = activeByUser.get(row.userId) ?? new Set();
    const activeInWindow = windowDays.some((day) => activeDays.has(day));
    const firstSeen = firstSeenDay(row);
    const lastActive = lastActiveDay(row);

    if (row.streakDays >= 2) {
      onStreak += 1;
      streakLeaders.push({
        userId: row.userId,
        displayName: row.displayName,
        className: row.className,
        lastActiveDay: lastActive,
        daysAgo: lastActive ? utcDayDiff(today, lastActive) : 0,
        streakDays: row.streakDays,
      });
    }

    if (activeInWindow) {
      windowActives += 1;
      if (activeDays.has(today)) lastDayActives += 1;
      if (firstSeen && firstSeen < oldest) returning += 1;
      else newcomers += 1;
    } else if (lastActive && lastActive < (range === "today" ? yesterday : oldest)) {
      lapsedPeople.push({
        userId: row.userId,
        displayName: row.displayName,
        className: row.className,
        lastActiveDay: lastActive,
        daysAgo: utcDayDiff(today, lastActive),
        streakDays: row.streakDays,
      });
    }
  }

  const cohortDays =
    range === "today" ? [yesterday] : [...windowDays].reverse().filter((day) => day < today);

  let d1Cohort = 0;
  let d1Returned = 0;
  const d1: AdminRetentionPoint[] = [];

  for (const day of cohortDays) {
    const next = shiftUtcDay(day, 1);
    let cohort = 0;
    let returned = 0;
    for (const row of rows) {
      const activeDays = activeByUser.get(row.userId) ?? new Set();
      if (!activeDays.has(day)) continue;
      cohort += 1;
      if (activeDays.has(next)) returned += 1;
    }
    d1Cohort += cohort;
    d1Returned += returned;
    if (cohort === 0) continue;
    d1.push({
      key: day,
      label: formatUtcDayLabel(day),
      cohort,
      returned,
      rate: Math.round((1000 * returned) / cohort) / 10,
    });
  }

  const streaks = STREAK_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: rows.filter((row) => bucket.matches(row.streakDays)).length,
  }));

  streakLeaders.sort((a, b) => {
    if (a.streakDays !== b.streakDays) return b.streakDays - a.streakDays;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });
  lapsedPeople.sort((a, b) => {
    if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });

  return {
    returning,
    newcomers,
    d1Rate: d1Cohort === 0 ? null : Math.round((1000 * d1Returned) / d1Cohort) / 10,
    d1Cohort,
    d1Returned,
    onStreak,
    lapsed: lapsedPeople.length,
    stickiness:
      range === "today" || windowActives === 0
        ? null
        : Math.round((1000 * lastDayActives) / windowActives) / 10,
    d1,
    streaks,
    streakLeaders: streakLeaders.slice(0, STREAK_LEADERS_LIMIT),
    lapsedPeople: lapsedPeople.slice(0, LAPSED_LIMIT),
  };
}

/** Vietnam calendar days in the window, newest first. Matches xp_awards.day_key. */
export function adminRangeVietnamDayKeys(
  range: AdminRange,
  now = new Date(),
): string[] {
  const today = dayKey(now);
  const days: string[] = [];
  for (let index = 0; index < RANGE_DAYS[range]; index += 1) {
    days.push(shiftUtcDay(today, -index));
  }
  return days;
}

export type AdminXpPoint = {
  key: string;
  label: string;
  newXp: number;
  reviewXp: number;
  duelXp: number;
  total: number;
};

export type AdminXpLeader = {
  userId: string;
  displayName: string;
  className: string | null;
  xp: number;
  newXp: number;
  reviewXp: number;
  duelXp: number;
};

export type AdminXpLesson = {
  lessonKey: string;
  label: string;
  xp: number;
  awards: number;
};

export type AdminXpBoard = {
  total: number;
  newXp: number;
  reviewXp: number;
  duelXp: number;
  earners: number;
  points: AdminXpPoint[];
  leaders: AdminXpLeader[];
  lessons: AdminXpLesson[];
};

const XP_LEADER_LIMIT = 8;
const XP_LESSON_LIMIT = 8;

function formatLessonKey(lessonKey: string): string {
  const [level, chapter] = lessonKey.split("/");
  if (!level) return lessonKey;
  const course = level.replace(/-/g, ".").toUpperCase();
  if (!chapter) return course;
  const lesson = chapter
    .replace(/^lektion[-_]?/i, "Lektion ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${course} · ${lesson}`;
}

function emptyXpPoint(day: string): AdminXpPoint {
  return {
    key: day,
    label: formatUtcDayLabel(day),
    newXp: 0,
    reviewXp: 0,
    duelXp: 0,
    total: 0,
  };
}

/**
 * Listening and duel XP over the selected window. Days are Asia/Ho_Chi_Minh
 * calendar days, the same boundary as the learner leaderboard.
 */
export function buildAdminXpBoard(
  people: readonly AdminUserRow[],
  listening: readonly AdminListeningXpRow[],
  duels: readonly AdminDuelXpRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminXpBoard {
  const daysNewestFirst = adminRangeVietnamDayKeys(range, now);
  const window = new Set(daysNewestFirst);
  const points = [...daysNewestFirst].reverse().map((day) => emptyXpPoint(day));
  const indexByDay = new Map(points.map((point, index) => [point.key, index]));

  const byUser = new Map<
    string,
    { xp: number; newXp: number; reviewXp: number; duelXp: number }
  >();
  const ensureUser = (userId: string) => {
    const current = byUser.get(userId) ?? { xp: 0, newXp: 0, reviewXp: 0, duelXp: 0 };
    byUser.set(userId, current);
    return current;
  };

  const byLesson = new Map<string, { xp: number; awards: number }>();

  for (const row of listening) {
    if (!window.has(row.dayKey)) continue;
    const point = points[indexByDay.get(row.dayKey) ?? -1];
    if (point) {
      if (row.kind === "review") point.reviewXp += row.xp;
      else point.newXp += row.xp;
      point.total += row.xp;
    }
    const user = ensureUser(row.userId);
    user.xp += row.xp;
    if (row.kind === "review") user.reviewXp += row.xp;
    else user.newXp += row.xp;
    const lesson = byLesson.get(row.lessonKey) ?? { xp: 0, awards: 0 };
    lesson.xp += row.xp;
    lesson.awards += 1;
    byLesson.set(row.lessonKey, lesson);
  }

  for (const row of duels) {
    if (!window.has(row.dayKey)) continue;
    const point = points[indexByDay.get(row.dayKey) ?? -1];
    if (point) {
      point.duelXp += row.xp;
      point.total += row.xp;
    }
    const user = ensureUser(row.userId);
    user.xp += row.xp;
    user.duelXp += row.xp;
  }

  const names = new Map(people.map((row) => [row.userId, row]));
  const leaders: AdminXpLeader[] = [...byUser.entries()]
    .filter(([, totals]) => totals.xp > 0)
    .map(([userId, totals]) => {
      const person = names.get(userId);
      return {
        userId,
        displayName: person?.displayName ?? userId,
        className: person?.className ?? null,
        ...totals,
      };
    });
  leaders.sort((a, b) => {
    if (a.xp !== b.xp) return b.xp - a.xp;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });

  const lessons: AdminXpLesson[] = [...byLesson.entries()].map(([lessonKey, totals]) => ({
    lessonKey,
    label: formatLessonKey(lessonKey),
    xp: totals.xp,
    awards: totals.awards,
  }));
  lessons.sort((a, b) => {
    if (a.xp !== b.xp) return b.xp - a.xp;
    return b.awards - a.awards;
  });

  let newXp = 0;
  let reviewXp = 0;
  let duelXp = 0;
  for (const point of points) {
    newXp += point.newXp;
    reviewXp += point.reviewXp;
    duelXp += point.duelXp;
  }

  return {
    total: newXp + reviewXp + duelXp,
    newXp,
    reviewXp,
    duelXp,
    earners: leaders.length,
    points,
    leaders: leaders.slice(0, XP_LEADER_LIMIT),
    lessons: lessons.slice(0, XP_LESSON_LIMIT),
  };
}

/** Listening plus duel XP for the given Vietnam calendar days, keyed by user id. */
export function xpByUserInDays(
  listening: readonly AdminListeningXpRow[],
  duels: readonly AdminDuelXpRow[],
  days: ReadonlySet<string>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (userId: string, xp: number) => {
    totals[userId] = (totals[userId] ?? 0) + xp;
  };
  for (const row of listening) {
    if (days.has(row.dayKey)) add(row.userId, row.xp);
  }
  for (const row of duels) {
    if (days.has(row.dayKey)) add(row.userId, row.xp);
  }
  return totals;
}

export type AdminDuelPoint = {
  key: string;
  label: string;
  started: number;
  finished: number;
  expired: number;
};

export type AdminDuelLeader = {
  userId: string;
  displayName: string;
  className: string | null;
  wins: number;
  losses: number;
  ties: number;
  played: number;
};

export type AdminDuelMatch = {
  id: string;
  challengerName: string;
  opponentName: string;
  createdAt: string;
  completedAt: string | null;
  result: string;
  expired: boolean;
};

export type AdminDuelBoard = {
  started: number;
  finished: number;
  expired: number;
  open: number;
  players: number;
  points: AdminDuelPoint[];
  leaders: AdminDuelLeader[];
  waiting: AdminDuelMatch[];
  recent: AdminDuelMatch[];
};

const DUEL_LEADER_LIMIT = 8;
const DUEL_LIST_LIMIT = 12;

function vietnamDayOf(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

function personLabel(
  names: Map<string, AdminUserRow>,
  userId: string,
): string {
  return names.get(userId)?.displayName ?? userId;
}

function scoredResult(duel: AdminDuelRecord): {
  winnerId: string | null;
  loserId: string | null;
  tie: boolean;
  label: string;
} {
  if (duel.expired) {
    return {
      winnerId: duel.challengerId,
      loserId: duel.opponentId,
      tie: false,
      label: "Expired",
    };
  }
  const left = duel.challengerPoints ?? 0;
  const right = duel.opponentPoints ?? 0;
  if (left === right) {
    return {
      winnerId: null,
      loserId: null,
      tie: true,
      label: `Tie ${left}–${right}`,
    };
  }
  const challengerWins = left > right;
  return {
    winnerId: challengerWins ? duel.challengerId : duel.opponentId,
    loserId: challengerWins ? duel.opponentId : duel.challengerId,
    tie: false,
    label: `${left}–${right}`,
  };
}

/**
 * Match volume and outcomes. Days are Asia/Ho_Chi_Minh, matching duel XP.
 */
export function buildAdminDuelBoard(
  people: readonly AdminUserRow[],
  duels: readonly AdminDuelRecord[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminDuelBoard {
  const daysNewestFirst = adminRangeVietnamDayKeys(range, now);
  const window = new Set(daysNewestFirst);
  const points = [...daysNewestFirst].reverse().map((day) => ({
    key: day,
    label: formatUtcDayLabel(day),
    started: 0,
    finished: 0,
    expired: 0,
  }));
  const indexByDay = new Map(points.map((point, index) => [point.key, index]));
  const names = new Map(people.map((row) => [row.userId, row]));
  const tallies = new Map<
    string,
    { wins: number; losses: number; ties: number; played: number }
  >();
  const bump = (userId: string) => {
    const current = tallies.get(userId) ?? { wins: 0, losses: 0, ties: 0, played: 0 };
    tallies.set(userId, current);
    return current;
  };

  const players = new Set<string>();
  let started = 0;
  let finished = 0;
  let expired = 0;
  const waiting: AdminDuelMatch[] = [];
  const recent: AdminDuelMatch[] = [];

  for (const duel of duels) {
    const createdDay = vietnamDayOf(duel.createdAt);
    const completedDay = vietnamDayOf(duel.completedAt);
    const createdIn = createdDay != null && window.has(createdDay);
    const completedIn = completedDay != null && window.has(completedDay);

    if (createdIn) {
      started += 1;
      const point = points[indexByDay.get(createdDay)!];
      if (point) point.started += 1;
      players.add(duel.challengerId);
      players.add(duel.opponentId);
    }
    if (completedIn) {
      players.add(duel.challengerId);
      players.add(duel.opponentId);
      const point = points[indexByDay.get(completedDay)!];
      if (duel.expired) {
        expired += 1;
        if (point) point.expired += 1;
      } else {
        finished += 1;
        if (point) point.finished += 1;
      }
      const result = scoredResult(duel);
      if (result.tie) {
        bump(duel.challengerId).ties += 1;
        bump(duel.opponentId).ties += 1;
        bump(duel.challengerId).played += 1;
        bump(duel.opponentId).played += 1;
      } else if (result.winnerId && result.loserId) {
        bump(result.winnerId).wins += 1;
        bump(result.loserId).losses += 1;
        bump(result.winnerId).played += 1;
        bump(result.loserId).played += 1;
      }
      recent.push({
        id: duel.id,
        challengerName: personLabel(names, duel.challengerId),
        opponentName: personLabel(names, duel.opponentId),
        createdAt: duel.createdAt,
        completedAt: duel.completedAt,
        result: result.label,
        expired: duel.expired,
      });
    }
    if (!duel.completedAt) {
      waiting.push({
        id: duel.id,
        challengerName: personLabel(names, duel.challengerId),
        opponentName: personLabel(names, duel.opponentId),
        createdAt: duel.createdAt,
        completedAt: null,
        result: "Waiting",
        expired: false,
      });
    }
  }

  waiting.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  recent.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const leaders: AdminDuelLeader[] = [...tallies.entries()].map(([userId, tally]) => {
    const person = names.get(userId);
    return {
      userId,
      displayName: person?.displayName ?? userId,
      className: person?.className ?? null,
      ...tally,
    };
  });
  leaders.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.ties !== b.ties) return b.ties - a.ties;
    if (a.played !== b.played) return b.played - a.played;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });

  return {
    started,
    finished,
    expired,
    open: waiting.length,
    players: players.size,
    points,
    leaders: leaders.slice(0, DUEL_LEADER_LIMIT),
    waiting: waiting.slice(0, DUEL_LIST_LIMIT),
    recent: recent.slice(0, DUEL_LIST_LIMIT),
  };
}

export type AdminAccessLevelCount = {
  slug: string;
  label: string;
  granted: number;
  locked: number;
};

export type AdminAccessClassRow = {
  key: string;
  label: string;
  students: number;
  learners: number;
  locked: number;
  interview: number;
  grantedBySlug: Record<string, number>;
};

/** An email that has a class before that person has signed in. */
export type AdminWaitingClassMember = {
  className: string | null;
  levelAccess: readonly string[];
  interviewAccess: boolean;
  updatedAt?: string | null;
};

export type AdminAccessBoard = {
  students: number;
  learners: number;
  withLevel: number;
  locked: number;
  interview: number;
  /** Learners with at least one Leben-in-Deutschland workplace. */
  living: number;
  admins: number;
  levels: AdminAccessLevelCount[];
  classes: AdminAccessClassRow[];
};

function hasLevel(row: AdminUserRow, slug: string): boolean {
  return row.isAdmin || row.levelAccess.includes(slug);
}

function hasInterview(row: AdminUserRow): boolean {
  return row.isAdmin || row.interviewAccess;
}

/**
 * Who can open which CEFR levels and the interview track.
 * Admins count as unlocked everywhere and are excluded from "none".
 */
export function buildAdminAccessBoard(
  people: readonly AdminUserRow[],
  levels: readonly AdminLevelOption[],
  waiting: readonly AdminWaitingClassMember[] = [],
): AdminAccessBoard {
  const learners = people.filter((row) => !row.isAdmin);
  const withLevel = learners.filter((row) => row.levelAccess.length > 0).length;
  const locked = learners.length - withLevel;
  const interview = learners.filter((row) => row.interviewAccess).length;
  const living = learners.filter((row) => row.livingAccess.length > 0).length;

  const levelCounts: AdminAccessLevelCount[] = levels.map((level) => {
    const granted = learners.filter((row) => row.levelAccess.includes(level.slug)).length;
    return {
      slug: level.slug,
      label: level.level,
      granted,
      locked: learners.length - granted,
    };
  });

  const classOptions = listAdminClasses([...people, ...waiting]);
  const groups: { key: string; label: string }[] = [
    ...classOptions.map((option) => ({ key: option.key, label: option.label })),
  ];
  if (
    people.some((row) => !classKey(row.className)) ||
    waiting.some((row) => !classKey(row.className))
  ) {
    groups.push({ key: "", label: "Unassigned" });
  }

  const classes: AdminAccessClassRow[] = groups.map((group) => {
    const members = usersInClass(people, group.key);
    const waitingMembers = waiting.filter((row) => classKey(row.className) === group.key);
    const classLearners = members.filter((row) => !row.isAdmin);
    const grantedBySlug: Record<string, number> = {};
    for (const level of levels) {
      grantedBySlug[level.slug] =
        members.filter((row) => hasLevel(row, level.slug)).length +
        waitingMembers.filter((row) => row.levelAccess.includes(level.slug)).length;
    }
    return {
      key: group.key,
      label: group.label,
      students: members.length + waitingMembers.length,
      learners: classLearners.length + waitingMembers.length,
      locked:
        classLearners.filter((row) => row.levelAccess.length === 0).length +
        waitingMembers.filter((row) => row.levelAccess.length === 0).length,
      interview:
        members.filter((row) => hasInterview(row)).length +
        waitingMembers.filter((row) => row.interviewAccess).length,
      grantedBySlug,
    };
  });

  return {
    students: people.length,
    learners: learners.length,
    withLevel,
    locked,
    interview,
    living,
    admins: people.length - learners.length,
    levels: levelCounts,
    classes,
  };
}

export type AdminListeningRunPoint = {
  key: string;
  label: string;
  passed: number;
  failed: number;
};

export type AdminListeningLessonStat = {
  lessonKey: string;
  runs: number;
  passed: number;
  failed: number;
  accuracySum: number;
};

export type AdminListeningRunBoard = {
  runs: number;
  passed: number;
  failed: number;
  students: number;
  avgAccuracy: number;
  points: AdminListeningRunPoint[];
  lessons: AdminListeningLessonStat[];
  recent: AdminListeningRunRecord[];
};

const LISTENING_LESSON_LIMIT = 8;

/**
 * Finished practice parts stored in listening_runs. Days are Asia/Ho_Chi_Minh.
 */
export function buildAdminListeningRunBoard(
  runs: readonly AdminListeningRunRecord[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminListeningRunBoard {
  const daysNewestFirst = adminRangeDayKeys(range, now);
  const window = new Set(daysNewestFirst);
  const points = [...daysNewestFirst].reverse().map((day) => ({
    key: day,
    label: formatUtcDayLabel(day),
    passed: 0,
    failed: 0,
  }));
  const indexByDay = new Map(points.map((point, index) => [point.key, index]));
  const students = new Set<string>();
  const lessonMap = new Map<string, AdminListeningLessonStat>();
  const recent: AdminListeningRunRecord[] = [];
  let passed = 0;
  let failed = 0;
  let accuracySum = 0;

  for (const run of runs) {
    const day = calendarDay(run.createdAt);
    if (day == null || !window.has(day)) continue;
    recent.push(run);
    students.add(run.userId);
    accuracySum += run.accuracy;
    const point = points[indexByDay.get(day)!];
    if (run.outcome === "success") {
      passed += 1;
      if (point) point.passed += 1;
    } else {
      failed += 1;
      if (point) point.failed += 1;
    }
    const lesson = lessonMap.get(run.lessonKey) ?? {
      lessonKey: run.lessonKey,
      runs: 0,
      passed: 0,
      failed: 0,
      accuracySum: 0,
    };
    lesson.runs += 1;
    lesson.accuracySum += run.accuracy;
    if (run.outcome === "success") lesson.passed += 1;
    else lesson.failed += 1;
    lessonMap.set(run.lessonKey, lesson);
  }

  const lessons = [...lessonMap.values()].sort((a, b) => {
    if (a.failed !== b.failed) return b.failed - a.failed;
    if (a.runs !== b.runs) return b.runs - a.runs;
    return a.lessonKey.localeCompare(b.lessonKey);
  });

  recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    runs: recent.length,
    passed,
    failed,
    students: students.size,
    avgAccuracy: recent.length === 0 ? 0 : Math.round(accuracySum / recent.length),
    points,
    lessons: lessons.slice(0, LISTENING_LESSON_LIMIT),
    recent,
  };
}

export type AdminHealthStatus = "ok" | "warn" | "fail" | "skip";

export type AdminHealthCheck = {
  id: string;
  label: string;
  group: "env" | "store" | "content";
  status: AdminHealthStatus;
  detail: string;
  sqlFile?: string;
};

export type AdminHealthCatalogInput = {
  lessonsReady: number;
  lessonsListed: number;
  clipsMissingAudio: number;
  videosBroken: number;
  tracksReady: number;
  tracksListed: number;
  issues: readonly { id: string; label: string; detail: string }[];
};

export type AdminHealthBoard = {
  overall: Exclude<AdminHealthStatus, "skip">;
  checkedAt: string;
  envOk: number;
  envTotal: number;
  storeOk: number;
  storeTotal: number;
  contentIssues: number;
  lessonsReady: number;
  lessonsListed: number;
  clipsMissingAudio: number;
  videosBroken: number;
  env: AdminHealthCheck[];
  stores: AdminHealthCheck[];
  content: AdminHealthCheck[];
  issues: AdminHealthCatalogInput["issues"];
};

function envPresent(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function listAdminHealthEnv(): AdminHealthCheck[] {
  const slack = envPresent(process.env.SLACK_NEW_USER_WEBHOOK_URL);
  return [
    {
      id: "auth-secret",
      label: "AUTH_SECRET",
      group: "env",
      status: envPresent(process.env.AUTH_SECRET) ? "ok" : "fail",
      detail: envPresent(process.env.AUTH_SECRET)
        ? "Set. Sign-in sessions can be signed."
        : "Missing. Google sign-in cannot mint a session.",
    },
    {
      id: "auth-google-id",
      label: "AUTH_GOOGLE_ID",
      group: "env",
      status: envPresent(process.env.AUTH_GOOGLE_ID) ? "ok" : "fail",
      detail: envPresent(process.env.AUTH_GOOGLE_ID)
        ? "Set."
        : "Missing. Google login has no client id.",
    },
    {
      id: "auth-google-secret",
      label: "AUTH_GOOGLE_SECRET",
      group: "env",
      status: envPresent(process.env.AUTH_GOOGLE_SECRET) ? "ok" : "fail",
      detail: envPresent(process.env.AUTH_GOOGLE_SECRET)
        ? "Set."
        : "Missing. Google login has no client secret.",
    },
    {
      id: "supabase-url",
      label: "Supabase URL",
      group: "env",
      status:
        envPresent(process.env.SUPABASE_URL) ||
        envPresent(process.env.NEXT_PUBLIC_SUPABASE_URL)
          ? "ok"
          : "fail",
      detail:
        envPresent(process.env.SUPABASE_URL) ||
        envPresent(process.env.NEXT_PUBLIC_SUPABASE_URL)
          ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is set."
          : "Neither SUPABASE_URL nor NEXT_PUBLIC_SUPABASE_URL is set.",
    },
    {
      id: "supabase-service",
      label: "Supabase service role",
      group: "env",
      status:
        envPresent(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
        envPresent(process.env.SUPABASE_SECRET_KEY)
          ? "ok"
          : "fail",
      detail:
        envPresent(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
        envPresent(process.env.SUPABASE_SECRET_KEY)
          ? "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is set."
          : "Neither service role key is set. Progress and awards cannot be stored.",
    },
    {
      id: "slack-webhook",
      label: "Slack new-user webhook",
      group: "env",
      status: "ok",
      detail: slack
        ? "SLACK_NEW_USER_WEBHOOK_URL is set."
        : "Not set. New-user Slack pings are off.",
    },
  ];
}

function storeCheckStatus(probe: AdminStoreProbe): AdminHealthStatus {
  if (probe.status === "ok") return "ok";
  if (probe.status === "skipped") return "skip";
  if (probe.severity === "warn") return "warn";
  return "fail";
}

function rollup(
  checks: readonly AdminHealthCheck[],
): Exclude<AdminHealthStatus, "skip"> {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

/**
 * Current env, SQL, and disk-file problems. Not a date-ranged report.
 */
export function buildAdminHealthBoard(
  stores: readonly AdminStoreProbe[],
  catalog: AdminHealthCatalogInput,
  now = new Date(),
): AdminHealthBoard {
  const env = listAdminHealthEnv();
  const storeChecks: AdminHealthCheck[] = stores.map((probe) => ({
    id: probe.id,
    label: probe.label,
    group: "store",
    status: storeCheckStatus(probe),
    detail: probe.detail,
    sqlFile: probe.sqlFile,
  }));

  const content: AdminHealthCheck[] = [
    {
      id: "content-audio",
      label: "Clip audio files",
      group: "content",
      status: catalog.clipsMissingAudio > 0 ? "warn" : "ok",
      detail:
        catalog.clipsMissingAudio > 0
          ? `${catalog.clipsMissingAudio} listed CEFR clip${catalog.clipsMissingAudio === 1 ? "" : "s"} have no audio file.`
          : "Every listed CEFR clip has audio.",
    },
    {
      id: "content-videos",
      label: "Lesson video URLs",
      group: "content",
      status: catalog.videosBroken > 0 ? "warn" : "ok",
      detail:
        catalog.videosBroken > 0
          ? `${catalog.videosBroken} YouTube URL${catalog.videosBroken === 1 ? "" : "s"} could not be parsed.`
          : "Every listed lesson video URL parses.",
    },
    {
      id: "content-tracks",
      label: "Interview tracks",
      group: "content",
      status: catalog.tracksReady < catalog.tracksListed ? "warn" : "ok",
      detail: `${catalog.tracksReady} of ${catalog.tracksListed} listed professions have playable clips.`,
    },
    {
      id: "content-issues",
      label: "Urgent catalog files",
      group: "content",
      status: catalog.issues.length > 0 ? "warn" : "ok",
      detail:
        catalog.issues.length > 0
          ? `${catalog.issues.length} missing-audio, broken-URL, orphan, or missing-JSON issue${catalog.issues.length === 1 ? "" : "s"}. Lesson tables stay on Catalog.`
          : "No urgent disk-file issues.",
    },
  ];

  const envRequired = env.filter((check) => check.id !== "slack-webhook");
  const storeCounted = storeChecks.filter((check) => check.status !== "skip");
  const overall = rollup([...envRequired, ...storeChecks, ...content]);

  return {
    overall,
    checkedAt: now.toISOString(),
    envOk: envRequired.filter((check) => check.status === "ok").length,
    envTotal: envRequired.length,
    storeOk: storeCounted.filter((check) => check.status === "ok").length,
    storeTotal: storeCounted.length || storeChecks.length,
    contentIssues: catalog.issues.length,
    lessonsReady: catalog.lessonsReady,
    lessonsListed: catalog.lessonsListed,
    clipsMissingAudio: catalog.clipsMissingAudio,
    videosBroken: catalog.videosBroken,
    env,
    stores: storeChecks,
    content,
    issues: catalog.issues,
  };
}

/** 1.5 hours. At or above this, a learner who finished a part counts as heavy use. */
export const OUTREACH_HEAVY_SECONDS = 90 * 60;

export const OUTREACH_CATEGORIES = ["preaccess", "fresh", "never", "light", "heavy"] as const;

export type OutreachCategory = (typeof OUTREACH_CATEGORIES)[number];

export type OutreachFilter = OutreachCategory | "all";

export type OutreachPending = {
  email: string;
  className: string | null;
  updatedAt: string | null;
};

export type OutreachPerson = {
  id: string;
  category: OutreachCategory;
  name: string | null;
  email: string | null;
  className: string | null;
  /** Active seconds still stored on the account. Null for someone who has not signed up. */
  activeSeconds: number | null;
  /** Finished parts still stored on the account. Null for someone who has not signed up. */
  parts: number | null;
  lastSeenAt: string | null;
  /** Latest stored day with active time. Null for someone who has not studied. */
  lastStudyOn: string | null;
  user: AdminUserRow | null;
};

const OUTREACH_ORDER: Record<OutreachCategory, number> = {
  preaccess: 0,
  fresh: 1,
  never: 2,
  light: 3,
  heavy: 4,
};

/** Active seconds kept on daily activity. Older days are dropped after 120 days. */
export function lifetimeActiveSeconds(progress: StoredProgress): number {
  let seconds = 0;
  for (const day of Object.values(progress.activity ?? {})) {
    seconds += day.activeSeconds ?? 0;
  }
  return seconds;
}

/**
 * Finished lesson parts still on the account.
 * Practice and grammar parts are counted from their keys. A committed study
 * pass, a listening pass saved before part keys, and any finished interview
 * clip each add one, so a learner is not filed as "never" when those keys
 * were not stored.
 */
export function finishedLessonParts(progress: StoredProgress): number {
  let parts = 0;
  let legacyListening = false;
  for (const entry of Object.values(progress.learn)) {
    const practice = entry.practicePartKeys?.length ?? 0;
    parts += practice;
    parts += entry.grammarPartKeys?.length ?? 0;
    if (entry.reviewedClipIds.length > 0 || entry.studyRunCount > 0) parts += 1;
    if (practice === 0 && (entry.runCount > 0 || entry.completedClipIds.length > 0)) {
      legacyListening = true;
    }
  }
  if (parts === 0 && legacyListening) parts = 1;
  for (const entry of Object.values(progress.interview)) {
    if (entry.completedClipIds.length > 0) parts += 1;
  }
  return parts;
}

function outreachActivityDays(progress: StoredProgress): OutreachActivityDay[] {
  const days: OutreachActivityDay[] = [];
  for (const [day, entry] of Object.entries(progress.activity ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const activeSeconds = entry?.activeSeconds ?? 0;
    if (activeSeconds > 0) days.push({ day, activeSeconds });
  }
  return days;
}

function outreachFirstSeenOn(signIns: AdminUserRow["signIns"] | undefined): string | null {
  const at = signIns?.[0]?.at;
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

export function outreachCategoryForUser(
  progress: StoredProgress,
  firstSeenOn: string | null = null,
  today = dayKey(new Date()),
): Exclude<OutreachCategory, "preaccess"> {
  const group = classifyOutreach(
    {
      hasAccount: true,
      parts: finishedLessonParts(progress),
      activeSeconds: lifetimeActiveSeconds(progress),
      studyDays: outreachActivityDays(progress),
      firstSeenOn,
    },
    today,
  );
  return group === "preaccess" ? "never" : group;
}

function outreachLabel(person: Pick<OutreachPerson, "name" | "email">): string {
  return person.name?.trim() || person.email?.trim() || "";
}

/** Internal classes. Outreach is for the later student groups only. */
const OUTREACH_EXCLUDED_CLASSES = new Set(["g01", "ausbildung"]);

function outreachSkipped(row: Pick<AdminUserRow, "isAdmin" | "staff" | "teacher" | "className">): boolean {
  if (row.isAdmin || row.staff || row.teacher) return true;
  return OUTREACH_EXCLUDED_CLASSES.has(classKey(row.className));
}

/** Signed-up learners plus pre-unlock emails that have not created an account. */
export function buildOutreachPeople(
  rows: readonly AdminUserRow[],
  pending: readonly OutreachPending[],
  now = new Date(),
): OutreachPerson[] {
  const today = dayKey(now);
  const signedEmails = new Set<string>();
  const people: OutreachPerson[] = [];

  for (const row of rows) {
    const email = normalizeGrantEmail(row.email ?? "");
    if (email) signedEmails.add(email);
    if (outreachSkipped(row)) continue;
    const parts = finishedLessonParts(row.progress);
    const activeSeconds = lifetimeActiveSeconds(row.progress);
    const studyDays = outreachActivityDays(row.progress);
    people.push({
      id: row.userId,
      category: classifyOutreach(
        {
          hasAccount: true,
          parts,
          activeSeconds,
          studyDays,
          firstSeenOn: outreachFirstSeenOn(row.signIns),
        },
        today,
      ),
      name: row.name,
      email: row.email,
      className: row.className,
      activeSeconds,
      parts,
      lastSeenAt: row.lastLoginAt,
      lastStudyOn: latestStudyDay(studyDays),
      user: row,
    });
  }

  for (const grant of pending) {
    const email = normalizeGrantEmail(grant.email);
    if (!email || signedEmails.has(email)) continue;
    if (OUTREACH_EXCLUDED_CLASSES.has(classKey(grant.className))) continue;
    people.push({
      id: `pending:${email}`,
      category: "preaccess",
      name: null,
      email,
      className: grant.className,
      activeSeconds: null,
      parts: null,
      lastSeenAt: grant.updatedAt,
      lastStudyOn: null,
      user: null,
    });
  }

  people.sort((a, b) => {
    const byCategory = OUTREACH_ORDER[a.category] - OUTREACH_ORDER[b.category];
    if (byCategory !== 0) return byCategory;
    return outreachLabel(a).localeCompare(outreachLabel(b), "vi", { sensitivity: "base" });
  });
  return people;
}

export function filterOutreachPeople(
  people: readonly OutreachPerson[],
  category: OutreachFilter,
  query: string,
): OutreachPerson[] {
  const needle = query.trim().toLowerCase();
  return people.filter((person) => {
    if (category !== "all" && person.category !== category) return false;
    if (!needle) return true;
    const haystack = [person.name, person.email, person.className]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function countOutreachCategories(
  people: readonly OutreachPerson[],
): Record<OutreachCategory, number> {
  const counts: Record<OutreachCategory, number> = {
    preaccess: 0,
    fresh: 0,
    never: 0,
    light: 0,
    heavy: 0,
  };
  for (const person of people) counts[person.category] += 1;
  return counts;
}
