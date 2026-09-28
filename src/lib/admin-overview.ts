import { isAdminUser } from "@/lib/admins";
import {
  activeStreakDays,
  normalizeProgress,
  type StoredProgress,
} from "@/lib/progress";
import type {
  AdminStoreProbe,
  UserProgressListItem,
} from "@/lib/progress-store";
import { dayKey, googleProfileImage } from "@/lib/xp";
import type { AdminDuelXpRow, AdminListeningXpRow } from "@/lib/xp-store";
import type { AdminDuelRecord } from "@/lib/duel-store";
import type { AdminListeningRunRecord } from "@/lib/listening-runs";

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
  return userActiveOnDay(row, day, dayWork(row.progress, day));
}

function firstSeenDay(row: AdminUserRow): string | null {
  const days: string[] = [];
  const add = (value: string | null | undefined) => {
    const day = utcDay(value);
    if (day) days.push(day);
  };
  add(row.signIns[0]);
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
  let best: string | null = utcDay(row.lastLoginAt);
  const consider = (value: string | null | undefined) => {
    const day = utcDay(value);
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
 * again on D+1". The selected window still uses UTC calendar days.
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

export type AdminAccessBoard = {
  students: number;
  learners: number;
  withLevel: number;
  locked: number;
  interview: number;
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
): AdminAccessBoard {
  const learners = people.filter((row) => !row.isAdmin);
  const withLevel = learners.filter((row) => row.levelAccess.length > 0).length;
  const locked = learners.length - withLevel;
  const interview = learners.filter((row) => row.interviewAccess).length;

  const levelCounts: AdminAccessLevelCount[] = levels.map((level) => {
    const granted = learners.filter((row) => row.levelAccess.includes(level.slug)).length;
    return {
      slug: level.slug,
      label: level.level,
      granted,
      locked: learners.length - granted,
    };
  });

  const classOptions = listAdminClasses(people);
  const groups: { key: string; label: string }[] = [
    ...classOptions.map((option) => ({ key: option.key, label: option.label })),
  ];
  if (people.some((row) => !classKey(row.className))) {
    groups.push({ key: "", label: "Unassigned" });
  }

  const classes: AdminAccessClassRow[] = groups.map((group) => {
    const members = usersInClass(people, group.key);
    const classLearners = members.filter((row) => !row.isAdmin);
    const grantedBySlug: Record<string, number> = {};
    for (const level of levels) {
      grantedBySlug[level.slug] = members.filter((row) => hasLevel(row, level.slug)).length;
    }
    return {
      key: group.key,
      label: group.label,
      students: members.length,
      learners: classLearners.length,
      locked: classLearners.filter((row) => row.levelAccess.length === 0).length,
      interview: members.filter((row) => hasInterview(row)).length,
      grantedBySlug,
    };
  });

  return {
    students: people.length,
    learners: learners.length,
    withLevel,
    locked,
    interview,
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
 * Finished listening parts stored in listening_runs. Days are UTC, matching Activity.
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
    const day = utcDay(run.createdAt);
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
