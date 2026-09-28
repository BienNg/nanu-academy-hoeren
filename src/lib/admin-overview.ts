import { isAdminUser } from "@/lib/admins";
import {
  activeStreakDays,
  normalizeProgress,
  type StoredProgress,
} from "@/lib/progress";
import type { UserProgressListItem } from "@/lib/progress-store";

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
  lastLoginAt: string | null;
  lastLoginMs: number;
  streakDays: number;
  isAdmin: boolean;
  levelAccess: string[];
  interviewAccess: boolean;
  className: string | null;
  /** Google sign-ins, oldest first. Empty until the next real sign-in after this ships. */
  signIns: string[];
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
  session: { id?: string | null; email?: string | null; name?: string | null },
): UserProgressListItem {
  if (!session.id || session.id !== item.userId) return item;
  return {
    ...item,
    email: item.email ?? session.email ?? null,
    name: item.name ?? session.name ?? null,
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
    lastLoginAt,
    lastLoginMs: Number.isNaN(lastLoginMs) ? 0 : lastLoginMs,
    streakDays: activeStreakDays(progress),
    isAdmin: isAdminUser({ email: item.email, id: item.userId }),
    levelAccess: item.levelAccess,
    interviewAccess: item.interviewAccess,
    className: item.className,
    signIns: item.signIns ?? [],
    lastSignInAt: item.signIns?.length ? (item.signIns[item.signIns.length - 1] ?? null) : null,
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

/** Distinct classes, labeled with the most common spelling of each name. */
export function listAdminClasses(rows: readonly AdminUserRow[]): AdminClassOption[] {
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = classKey(row.className);
    if (!key) continue;
    const label = normalizeClassName(row.className ?? "");
    const votes = groups.get(key) ?? new Map<string, number>();
    votes.set(label, (votes.get(label) ?? 0) + 1);
    groups.set(key, votes);
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

  options.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
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
  studyRuns: number;
  practiceRuns: number;
};

/** Windows offered by the admin date-range pill. */
export const ADMIN_RANGES = ["today", "7d", "30d", "90d"] as const;

export type AdminRange = (typeof ADMIN_RANGES)[number];

export const DEFAULT_ADMIN_RANGE: AdminRange = "30d";

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

/** Unknown and missing values fall back to the default rather than throwing. */
export function parseAdminRange(
  value: string | string[] | undefined,
): AdminRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return ADMIN_RANGES.find((range) => range === raw) ?? DEFAULT_ADMIN_RANGE;
}

export function adminRangeLabel(range: AdminRange): string {
  return RANGE_LABELS[range];
}

export function adminRangeDays(range: AdminRange): number {
  return RANGE_DAYS[range];
}

/** UTC calendar days in the window, newest first, matching the streak boundary. */
export function adminRangeDayKeys(
  range: AdminRange,
  now = new Date(),
): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: string[] = [];
  for (let index = 0; index < RANGE_DAYS[range]; index += 1) {
    days.push(new Date(end - index * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

function utcDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function utcHour(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCHours();
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
    if (utcDay(entry.studyCompletedAt) === day) firstCompletions += 1;
  }
  return Math.max(recorded, firstCompletions);
}

function practiceRunsOnDay(progress: StoredProgress, day: string): number {
  const recorded = progress.activity?.[day]?.practiceRuns ?? 0;
  let firstCompletions = 0;
  for (const entry of Object.values(progress.learn)) {
    if (utcDay(entry.completedAt) === day) firstCompletions += 1;
  }
  return Math.max(recorded, firstCompletions);
}

function videosWatchedOnDay(progress: StoredProgress, day: string): number {
  let count = 0;
  for (const entry of Object.values(progress.videos)) {
    if (utcDay(entry.watchedAt) === day) count += 1;
  }
  return count;
}

function activeSecondsOnDay(progress: StoredProgress, day: string): number {
  const recorded = progress.activity?.[day]?.activeSeconds ?? 0;
  let fromVisits = 0;
  for (const visit of progress.visits ?? []) {
    if (utcDay(visit.startedAt) === day) fromVisits += visit.activeSeconds;
  }
  return Math.max(recorded, fromVisits);
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

function userTouchedDay(progress: StoredProgress, day: string): boolean {
  const dayActivity = progress.activity?.[day];
  return (
    progress.lastPracticeDate === day ||
    (dayActivity?.activeSeconds ?? 0) > 0 ||
    (dayActivity?.clips ?? 0) > 0 ||
    (dayActivity?.exercises ?? 0) > 0 ||
    (dayActivity?.videoSeconds ?? 0) > 0
  );
}

function userActiveOnDay(
  row: AdminUserRow,
  day: string,
  work: { videos: number; study: number; practice: number },
): boolean {
  return (
    userTouchedDay(row.progress, day) ||
    utcDay(row.lastLoginAt) === day ||
    work.videos > 0 ||
    work.study > 0 ||
    work.practice > 0
  );
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
  };
}

/** Totals over the selected window. Days are UTC calendar days, matching streaks. */
export function buildAdminActivityStats(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminActivityStats {
  const days = adminRangeDayKeys(range, now);
  const window = new Set(days);
  let activeUsers = 0;
  let videosWatched = 0;
  let studyRuns = 0;
  let practiceRuns = 0;

  for (const row of rows) {
    let rowVideos = 0;
    let rowStudy = 0;
    let rowPractice = 0;
    let touched = false;

    for (const day of days) {
      const work = dayWork(row.progress, day);
      rowVideos += work.videos;
      rowStudy += work.study;
      rowPractice += work.practice;
      touched = touched || userTouchedDay(row.progress, day);
    }

    videosWatched += rowVideos;
    studyRuns += rowStudy;
    practiceRuns += rowPractice;

    const lastSeenDay = utcDay(row.lastLoginAt);
    const active =
      touched ||
      (lastSeenDay != null && window.has(lastSeenDay)) ||
      rowVideos > 0 ||
      rowStudy > 0 ||
      rowPractice > 0;
    if (active) activeUsers += 1;
  }

  return {
    users: rows.length,
    activeUsers,
    videosWatched,
    studyRuns,
    practiceRuns,
  };
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
};

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

const ACTIVITY_LEADER_LIMIT = 8;

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
      if (userActiveOnDay(row, day, work)) point.activeUsers += 1;
      point.activeSeconds += activeSecondsOnDay(row.progress, day);
      point.videosWatched += work.videos;
      point.studyRuns += work.study;
      point.practiceRuns += work.practice;
      point.clips += row.progress.activity?.[day]?.clips ?? 0;
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
      if (utcDay(visit.startedAt) !== day) continue;
      const hour = utcHour(visit.startedAt);
      if (hour == null) continue;
      usersByHour[hour].add(row.userId);
      points[hour].activeSeconds += visit.activeSeconds;
      points[hour].clips += visit.clips.length;
      points[hour].practiceRuns += visit.listeningRuns;
    }

    if (utcDay(row.lastLoginAt) === day) {
      const hour = utcHour(row.lastLoginAt);
      if (hour != null) usersByHour[hour].add(row.userId);
    }

    for (const entry of Object.values(row.progress.videos)) {
      if (utcDay(entry.watchedAt) !== day) continue;
      const hour = utcHour(entry.watchedAt);
      if (hour == null) continue;
      points[hour].videosWatched += 1;
    }

    const work = dayWork(row.progress, day);
    if (userActiveOnDay(row, day, work) && usersByHour.every((set) => !set.has(row.userId))) {
      // Seen that UTC day without a timestamped visit: count them at midnight
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
    let activeSeconds = 0;
    let videosWatched = 0;
    let studyRuns = 0;
    let practiceRuns = 0;

    for (const day of days) {
      const work = dayWork(row.progress, day);
      activeSeconds += activeSecondsOnDay(row.progress, day);
      videosWatched += work.videos;
      studyRuns += work.study;
      practiceRuns += work.practice;
    }

    if (
      activeSeconds <= 0 &&
      videosWatched <= 0 &&
      studyRuns <= 0 &&
      practiceRuns <= 0
    ) {
      continue;
    }

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

  return leaders.slice(0, ACTIVITY_LEADER_LIMIT);
}

/**
 * Time series for the Activity page. Multi-day windows are UTC days, oldest
 * first. "Today" is 24 UTC hours so a single-day range still has a chart.
 */
export function buildAdminActivityBoard(
  rows: readonly AdminUserRow[],
  range: AdminRange = DEFAULT_ADMIN_RANGE,
  now = new Date(),
): AdminActivityBoard {
  const days = adminRangeDayKeys(range, now);
  if (range === "today") {
    const day = days[0];
    return {
      grain: "hour",
      points: buildHourlyActivityPoints(rows, day),
      leaders: buildActivityLeaders(rows, days),
    };
  }
  return {
    grain: "day",
    points: buildDailyActivityPoints(rows, days),
    leaders: buildActivityLeaders(rows, days),
  };
}
