"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { StudentDetailModal } from "@/components/admin/StudentDetailModal";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ADMIN_PAGE_SIZE,
  adminRangeLabel,
  listActiveAdminUsers,
  paginateAdminUsers,
  type AdminActivityStats,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatAbsoluteTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

function formatRelativeTime(iso: string, nowMs: number): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const delta = then - nowMs;
  const abs = Math.abs(delta);
  if (abs < 45_000) return "just now";
  const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (abs >= ms) return format.format(Math.round(delta / ms), unit);
  }
  return format.format(Math.round(delta / 60_000), "minute");
}

function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ActivityStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
      <div className="flex items-center gap-space-8">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed">
          <MaterialIcon name={icon} className="text-[18px]" />
        </div>
        <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
      </div>
      <p className="mt-space-12 font-headline-lg text-headline-lg tabular-nums text-on-surface">
        {value}
      </p>
      <p className="mt-1 font-caption text-caption text-on-surface-variant">{hint}</p>
    </div>
  );
}

function xpRangeTitle(range: AdminRange): string {
  if (range === "today") return "XP earned today";
  return `XP earned in the last ${adminRangeLabel(range).toLowerCase()}`;
}

function ActiveUsersSection({
  users,
  window,
  range,
  rangeXp,
  rangeXpReady,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  window: string;
  range: AdminRange;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  onSelect: (userId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const now = useNow();
  const paged = useMemo(
    () => paginateAdminUsers(users, page, ADMIN_PAGE_SIZE),
    [users, page],
  );
  const xpTitle = xpRangeTitle(range);
  const rangeStart = paged.total === 0 ? 0 : (paged.page - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(paged.page * ADMIN_PAGE_SIZE, paged.total);

  return (
    <section aria-label="Active users" className="flex flex-col gap-space-12">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Active users</h2>
        <p className="font-caption text-caption text-on-surface-variant">
          Everyone seen or practicing {window}. Click a row to open their detail.
        </p>
      </div>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  User
                </th>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Class
                </th>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Last seen
                </th>
                <th className="px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Streak
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                  >
                    No one has been active {window}.
                  </td>
                </tr>
              ) : (
                paged.pageRows.map((row) => {
                  const lastSeen = formatAbsoluteTime(row.lastLoginAt);
                  const relative =
                    row.lastLoginAt && now != null
                      ? formatRelativeTime(row.lastLoginAt, now)
                      : null;
                  const earned = rangeXp[row.userId] ?? 0;
                  return (
                    <tr
                      key={row.userId}
                      tabIndex={0}
                      onClick={() => onSelect(row.userId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onSelect(row.userId);
                      }}
                      className="cursor-pointer border-t border-outline-variant/20 hover:bg-surface-container-low/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                    >
                      <td className="px-space-16 py-space-16">
                        <div className="flex min-w-[14rem] flex-col">
                          <span className="font-label-md text-label-md font-semibold text-on-surface">
                            {row.displayName}
                          </span>
                          {row.email && row.email !== row.displayName ? (
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              {row.email}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface">
                        {row.className ?? (
                          <span className="text-outline">No class</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface">
                        {lastSeen ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <time dateTime={row.lastLoginAt ?? undefined}>{lastSeen}</time>
                            {relative ? (
                              <span className="font-caption text-caption text-on-surface-variant">
                                {relative}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-outline">Not seen yet</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-16 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`inline-flex items-center gap-space-4 ${
                              row.streakDays > 0 ? "text-on-surface" : "text-outline"
                            }`}
                          >
                            <MaterialIcon
                              name="local_fire_department"
                              className={`text-[16px] ${row.streakDays > 0 ? "text-[#ff9500]" : "text-outline"}`}
                              filled={row.streakDays > 0}
                            />
                            <span className="font-label-sm text-label-sm font-semibold tabular-nums">
                              {row.streakDays}
                            </span>
                          </span>
                          {rangeXpReady ? (
                            <span
                              className={`inline-flex items-center gap-0.5 font-caption text-caption tabular-nums ${
                                earned > 0 ? "text-on-surface" : "text-outline"
                              }`}
                              title={xpTitle}
                            >
                              <MaterialIcon
                                name="bolt"
                                className={`text-[14px] ${earned > 0 ? "text-[#f59e0b]" : "text-outline"}`}
                                filled={earned > 0}
                              />
                              {earned.toLocaleString("en-GB")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {paged.total === 0 ? "0 users" : `${rangeStart}–${rangeEnd} of ${paged.total}`}
          </p>
          <div className="flex items-center gap-space-8">
            <button
              type="button"
              disabled={paged.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={paged.page >= paged.pageCount}
              onClick={() => setPage((current) => Math.min(paged.pageCount, current + 1))}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

type AdminOverviewProps = {
  activity: AdminActivityStats;
  range: AdminRange;
  courseCatalog: readonly AdminCatalogCourse[];
  rows: readonly AdminUserRow[];
  storeConfigured: boolean;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  studyParts: number | null;
  /** Whole listening lessons finished in the Vietnam window. Null keeps the UTC activity count. */
  practiceRuns: number | null;
  practiceParts: number | null;
};

export function AdminOverview({
  activity,
  range,
  courseCatalog,
  rows,
  storeConfigured,
  rangeXp,
  rangeXpReady,
  studyParts,
  practiceRuns,
  practiceParts,
}: AdminOverviewProps) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const activeUsers = useMemo(() => listActiveAdminUsers(rows, range), [rows, range]);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const detailRow = useMemo(
    () => rows.find((row) => row.userId === detailUserId) ?? null,
    [rows, detailUserId],
  );

  return (
    <>
      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
        <AdminPageHeader
          kicker="Admin"
          title="Overview"
          subtitle={`Platform activity ${window}. Days are UTC, the same boundary as streaks.`}
        />

        {!storeConfigured ? (
          <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
            Cloud progress is not configured. This dashboard only counts learners who have
            synced progress to Supabase.
          </div>
        ) : null}

        <section aria-label="Activity" className="flex flex-col gap-space-12">
          <div className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-4">
            <ActivityStat
              label="All students"
              value={formatCount(activity.users)}
              icon="group"
              hint="Every account, including inactive"
            />
            <ActivityStat
              label="Active"
              value={formatCount(activity.activeUsers)}
              icon="person"
              hint={`Used the app ${window}`}
            />
            <ActivityStat
              label="Videos watched"
              value={formatCount(activity.videosWatched)}
              icon="smart_display"
              hint={`Marked watched ${window}`}
            />
            <ActivityStat
              label="Study runs"
              value={formatCount(activity.studyRuns)}
              icon="menu_book"
              hint={`Whole study lessons finished ${window}`}
            />
            <ActivityStat
              label="Study parts"
              value={studyParts == null ? "—" : formatCount(studyParts)}
              icon="auto_stories"
              hint={`Study parts finished ${window}, Vietnam time`}
            />
            <ActivityStat
              label="Practice runs"
              value={formatCount(practiceRuns ?? activity.practiceRuns)}
              icon="headphones"
              hint={`Whole practice lessons finished ${window}, Vietnam time`}
            />
            <ActivityStat
              label="Practice parts"
              value={practiceParts == null ? "—" : formatCount(practiceParts)}
              icon="hearing"
              hint={`Practice parts finished ${window}, Vietnam time`}
            />
          </div>
        </section>

        {storeConfigured ? (
          <ActiveUsersSection
            users={activeUsers}
            window={window}
            range={range}
            rangeXp={rangeXp}
            rangeXpReady={rangeXpReady}
            onSelect={setDetailUserId}
          />
        ) : null}
      </main>

      {detailRow ? (
        <StudentDetailModal
          row={detailRow}
          catalog={courseCatalog}
          onClose={() => setDetailUserId(null)}
        />
      ) : null}
    </>
  );
}
