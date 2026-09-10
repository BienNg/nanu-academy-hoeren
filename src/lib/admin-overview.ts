import { normalizeProgress, toBerufProgress } from "@/lib/progress";
import type { UserProgressListItem } from "@/lib/progress-store";

export const ADMIN_PAGE_SIZE = 25;

export type AdminSortKey = "lastLogin" | "progress" | "name";
export type AdminSortDir = "asc" | "desc";

export type AdminTrackColumn = {
  slug: string;
  label: string;
  shortLabel: string;
  totalClips: number;
};

export type AdminTrackProgress = {
  slug: string;
  completedCount: number;
  totalClips: number;
  percent: number;
  started: boolean;
};

export type AdminUserRow = {
  userId: string;
  name: string | null;
  email: string | null;
  displayName: string;
  lastLoginAt: string | null;
  lastLoginMs: number;
  overallCompleted: number;
  overallTotal: number;
  overallPercent: number;
  overallStarted: boolean;
  tracks: AdminTrackProgress[];
};

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

export function toAdminUserRow(
  item: UserProgressListItem,
  tracks: readonly AdminTrackColumn[],
): AdminUserRow {
  const progress = normalizeProgress(item.progress);
  const lastLoginAt = item.lastLoginAt ?? item.updatedAt;
  const lastLoginMs = lastLoginAt ? new Date(lastLoginAt).getTime() : 0;
  const trackRows: AdminTrackProgress[] = tracks.map((track) => {
    const summary = toBerufProgress(progress, track.slug, track.totalClips);
    return {
      slug: track.slug,
      completedCount: summary.completedCount,
      totalClips: summary.totalClips,
      percent: summary.percent,
      started: summary.completedCount > 0,
    };
  });

  const overallCompleted = trackRows.reduce(
    (sum, track) => sum + track.completedCount,
    0,
  );
  const overallTotal = trackRows.reduce(
    (sum, track) => sum + track.totalClips,
    0,
  );
  const overallPercent =
    overallTotal === 0
      ? 0
      : Math.min(100, Math.round((overallCompleted / overallTotal) * 100));

  return {
    userId: item.userId,
    name: item.name,
    email: item.email,
    displayName: displayNameFor(item),
    lastLoginAt,
    lastLoginMs: Number.isNaN(lastLoginMs) ? 0 : lastLoginMs,
    overallCompleted,
    overallTotal,
    overallPercent,
    overallStarted: overallCompleted > 0,
    tracks: trackRows,
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
  } else if (sort === "progress") {
    if (a.overallPercent !== b.overallPercent) {
      return (a.overallPercent - b.overallPercent) * sign;
    }
    if (a.overallCompleted !== b.overallCompleted) {
      return (a.overallCompleted - b.overallCompleted) * sign;
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
    const haystack = [row.displayName, row.name, row.email, row.userId]
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
