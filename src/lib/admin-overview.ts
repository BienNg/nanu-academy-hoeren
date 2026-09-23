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
  className: string | null;
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
    className: item.className,
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
  videosWatchedToday: number;
  studyRunsToday: number;
  practiceRunsToday: number;
};

function utcDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
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

/** Totals for the admin overview. "Today" is the UTC calendar day, matching streaks. */
export function buildAdminActivityStats(
  rows: readonly AdminUserRow[],
  now = new Date(),
): AdminActivityStats {
  const today = now.toISOString().slice(0, 10);
  let activeUsers = 0;
  let videosWatchedToday = 0;
  let studyRunsToday = 0;
  let practiceRunsToday = 0;

  for (const row of rows) {
    const videos = videosWatchedOnDay(row.progress, today);
    const studyRuns = studyRunsOnDay(row.progress, today);
    const practiceRuns = practiceRunsOnDay(row.progress, today);
    videosWatchedToday += videos;
    studyRunsToday += studyRuns;
    practiceRunsToday += practiceRuns;

    const active =
      utcDay(row.lastLoginAt) === today ||
      row.progress.lastPracticeDate === today ||
      videos > 0 ||
      studyRuns > 0 ||
      practiceRuns > 0;
    if (active) activeUsers += 1;
  }

  return {
    users: rows.length,
    activeUsers,
    videosWatchedToday,
    studyRunsToday,
    practiceRunsToday,
  };
}
