"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setAdminUserClass } from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { StudentDetailModal } from "@/components/admin/StudentDetailModal";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ACTIVE_USER_TIMELINE_CAP,
  ADMIN_PAGE_SIZE,
  adminRangeLabel,
  adminTimelineClockKey,
  buildActiveUserTimeline,
  classKey,
  formatAdminTimestamp,
  adminRangeVietnamDayKeys,
  listActiveAdminUsers,
  listAdminClasses,
  normalizeClassName,
  paginateAdminUsers,
  timelineDateFromClockKey,
  videoMinutesInRange,
  type ActiveTimelineStudent,
  type AdminActivityStats,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatAbsoluteTime(iso: string | null): string | null {
  return formatAdminTimestamp(iso);
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

const AVATAR_COLORS = ["#0284c7", "#0369a1", "#0f766e", "#b45309", "#7c3aed", "#be123c"];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0]!;
}

function initialFor(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function TimelineAvatar({ name, image }: { name: string; image: string | null }) {
  const [failed, setFailed] = useState(false);
  if (image && !failed) {
    return (
      <span className="relative inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full">
        <Image
          src={image}
          alt=""
          width={28}
          height={28}
          referrerPolicy="no-referrer"
          className="h-7 w-7 rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
      style={{ backgroundColor: avatarColor(name) }}
      aria-hidden="true"
    >
      {initialFor(name)}
    </span>
  );
}

function TimelineStudentButton({
  student,
  onSelect,
}: {
  student: ActiveTimelineStudent;
  onSelect: (userId: string) => void;
}) {
  const when = formatAbsoluteTime(student.lastLoginAt);
  const label = when ? `${student.displayName}, last seen ${when}` : student.displayName;
  return (
    <button
      type="button"
      title={when ? `${student.displayName}, ${when}` : student.displayName}
      aria-label={label}
      onClick={() => onSelect(student.userId)}
      className="inline-flex overflow-hidden rounded-full hover:ring-2 hover:ring-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <TimelineAvatar name={student.displayName} image={student.image} />
    </button>
  );
}

function ActiveUsersTimeline({
  users,
  range,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  range: AdminRange;
  onSelect: (userId: string) => void;
}) {
  const now = useNow();
  const clockKey = now == null ? null : adminTimelineClockKey(new Date(now));
  const timeline = useMemo(() => {
    if (clockKey == null) return null;
    return buildActiveUserTimeline(users, range, timelineDateFromClockKey(clockKey));
  }, [users, range, clockKey]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenKey(null);
  }, [clockKey, range, users]);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  if (!timeline) return null;

  const openColumn = timeline.columns.find((column) => column.key === openKey) ?? null;
  const hidden = openColumn ? openColumn.students.slice(ACTIVE_USER_TIMELINE_CAP) : [];
  const fillsWidth = range === "today" || range === "7d";
  const columnWidth = fillsWidth ? "min-w-0 flex-1" : "w-8 shrink-0";

  return (
    <div className="flex flex-col gap-space-8 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
      <div>
        <h3 className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          Last seen
        </h3>
        <p className="font-caption text-caption text-on-surface-variant">
          {timeline.grain === "hour"
            ? "Each photo sits on the hour of that student's latest visit. Times are Vietnam."
            : "Each photo sits on the day of that student's latest visit. Times are Vietnam."}
        </p>
      </div>
      <div className={fillsWidth ? undefined : "overflow-x-auto"}>
        <div
          className={`flex items-end gap-1 ${fillsWidth ? "w-full" : "min-w-max"}`}
          role="list"
          aria-label="Last seen timeline"
        >
          {timeline.columns.map((column) => {
            const visible = column.students.slice(0, ACTIVE_USER_TIMELINE_CAP);
            const extra = column.students.length - visible.length;
            const axis =
              timeline.grain === "hour"
                ? `${column.label}:00`
                : column.marker
                  ? `${column.marker} ${column.label}`
                  : column.label;
            return (
              <div
                key={column.key}
                role="listitem"
                aria-label={`${axis}, ${column.students.length} ${column.students.length === 1 ? "student" : "students"}`}
                className={`flex ${columnWidth} flex-col items-center`}
              >
                <div className="flex flex-col items-center gap-1">
                  {visible.map((student) => (
                    <TimelineStudentButton
                      key={student.userId}
                      student={student}
                      onSelect={onSelect}
                    />
                  ))}
                  {extra > 0 ? (
                    <button
                      type="button"
                      aria-expanded={openKey === column.key}
                      aria-label={`Show ${extra} more last seen at ${axis}`}
                      onClick={() =>
                        setOpenKey((current) => (current === column.key ? null : column.key))
                      }
                      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-container px-1 font-caption text-caption font-semibold tabular-nums text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      +{extra}
                    </button>
                  ) : null}
                </div>
                <div className="mt-space-8 flex h-8 flex-col items-center justify-end text-center">
                  {column.marker ? (
                    <span className="font-caption text-[10px] leading-none text-on-surface-variant">
                      {column.marker}
                    </span>
                  ) : null}
                  <span className="font-caption text-caption tabular-nums text-on-surface-variant">
                    {column.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hidden.length > 0 && openColumn ? (
        <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-space-8">
          <p className="font-caption text-caption text-on-surface-variant">
            {hidden.length} more at{" "}
            {timeline.grain === "hour"
              ? `${openColumn.label}:00`
              : openColumn.marker
                ? `${openColumn.marker} ${openColumn.label}`
                : openColumn.label}
          </p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {hidden.map((student) => {
              const when = formatAbsoluteTime(student.lastLoginAt);
              return (
                <li key={student.userId}>
                  <button
                    type="button"
                    onClick={() => onSelect(student.userId)}
                    className="flex w-full items-center gap-space-8 rounded-lg px-space-8 py-1 text-left hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                  >
                    <TimelineAvatar name={student.displayName} image={student.image} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-label-sm text-label-sm font-semibold text-on-surface">
                        {student.displayName}
                      </span>
                      {when ? (
                        <span className="block font-caption text-caption text-on-surface-variant">
                          {when}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {timeline.unplaced > 0 ? (
        <p className="font-caption text-caption text-on-surface-variant">
          {timeline.unplaced === 1
            ? "1 active user has no last-seen time in this window."
            : `${timeline.unplaced.toLocaleString("en-GB")} active users have no last-seen time in this window.`}
        </p>
      ) : null}
    </div>
  );
}

function ActiveUsersSection({
  users,
  window,
  range,
  rangeXp,
  rangeXpReady,
  studyPartsByUser,
  practicePartsByUser,
  classSuggestions,
  savingClassIds,
  classError,
  displayClass,
  onSaveClass,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  window: string;
  range: AdminRange;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  studyPartsByUser: Readonly<Record<string, number>> | null;
  practicePartsByUser: Readonly<Record<string, number>> | null;
  classSuggestions: readonly string[];
  savingClassIds: readonly string[];
  classError: string | null;
  displayClass: (row: AdminUserRow) => string | null;
  onSaveClass: (row: AdminUserRow, next: string) => void;
  onSelect: (userId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const now = useNow();
  const paged = useMemo(
    () => paginateAdminUsers(users, page, ADMIN_PAGE_SIZE),
    [users, page],
  );
  const xpTitle = xpRangeTitle(range);
  const vietnamDays = useMemo(() => adminRangeVietnamDayKeys(range), [range]);
  const partTitle = range === "today" ? "Finished today" : `Finished ${window}`;
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
      {classError ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          {classError}
        </div>
      ) : null}
      <ActiveUsersTimeline users={users} range={range} onSelect={onSelect} />
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
                <th className="px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Study parts
                </th>
                <th className="px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Practice parts
                </th>
                <th className="px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Video
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                  const studyParts = studyPartsByUser?.[row.userId] ?? 0;
                  const practiceParts = practicePartsByUser?.[row.userId] ?? 0;
                  const videoMinutes = videoMinutesInRange(row.progress, vietnamDays);
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
                      <ClassCell
                        userId={row.userId}
                        studentName={row.displayName}
                        value={displayClass(row)}
                        suggestions={classSuggestions}
                        saving={savingClassIds.includes(row.userId)}
                        onSave={(next) => onSaveClass(row, next)}
                      />
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
                      <td
                        className="whitespace-nowrap px-space-16 py-space-16 text-right font-label-sm text-label-sm tabular-nums text-on-surface"
                        title={partTitle}
                      >
                        {studyPartsByUser == null ? "—" : formatCount(studyParts)}
                      </td>
                      <td
                        className="whitespace-nowrap px-space-16 py-space-16 text-right font-label-sm text-label-sm tabular-nums text-on-surface"
                        title={`${partTitle}. Passed parts only.`}
                      >
                        {practicePartsByUser == null ? "—" : formatCount(practiceParts)}
                      </td>
                      <td
                        className="whitespace-nowrap px-space-16 py-space-16 text-right font-label-sm text-label-sm tabular-nums text-on-surface"
                        title={`Video played ${window}`}
                      >
                        {videoMinutes === 0 ? "0 min" : `${formatCount(videoMinutes)} min`}
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
  studyPartsByUser: Readonly<Record<string, number>> | null;
  /** Whole listening lessons finished in the Vietnam window. Null keeps the activity count. */
  practiceRuns: number | null;
  practiceParts: number | null;
  practicePartsByUser: Readonly<Record<string, number>> | null;
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
  studyPartsByUser,
  practiceRuns,
  practiceParts,
  practicePartsByUser,
}: AdminOverviewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const [classByUser, setClassByUser] = useState<Record<string, string | null>>({});
  const [savingClassIds, setSavingClassIds] = useState<string[]>([]);
  const [classError, setClassError] = useState<string | null>(null);
  const savingClassRef = useRef(new Set<string>());
  const liveRows = useMemo(
    () =>
      rows.map((row) =>
        Object.hasOwn(classByUser, row.userId)
          ? { ...row, className: classByUser[row.userId] }
          : row,
      ),
    [rows, classByUser],
  );
  const classOptions = useMemo(() => listAdminClasses(liveRows), [liveRows]);
  const activeUsers = useMemo(
    () => listActiveAdminUsers(liveRows, range),
    [liveRows, range],
  );
  const displayClass = useCallback(
    (row: AdminUserRow): string | null => {
      if (!row.className) return null;
      return (
        classOptions.find((option) => option.key === classKey(row.className))?.label ??
        row.className
      );
    },
    [classOptions],
  );
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const detailRow = useMemo(() => {
    const row = liveRows.find((item) => item.userId === detailUserId);
    if (!row) return null;
    return { ...row, className: displayClass(row) };
  }, [liveRows, detailUserId, displayClass]);

  async function saveClass(row: AdminUserRow, nextRaw: string) {
    if (savingClassRef.current.has(row.userId)) return;
    savingClassRef.current.add(row.userId);
    const previous = row.className;
    const next = normalizeClassName(nextRaw);
    setClassByUser((prev) => ({ ...prev, [row.userId]: next || null }));
    setSavingClassIds((prev) =>
      prev.includes(row.userId) ? prev : [...prev, row.userId],
    );
    setClassError(null);
    try {
      const result = await setAdminUserClass(row.userId, next);
      if (!result.ok) {
        setClassByUser((prev) => ({ ...prev, [row.userId]: previous }));
        setClassError(result.error);
        return;
      }
      setClassByUser((prev) => ({ ...prev, [row.userId]: result.className }));
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingClassRef.current.delete(row.userId);
      setSavingClassIds((prev) => prev.filter((id) => id !== row.userId));
    }
  }

  return (
    <>
      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
        <AdminPageHeader
          kicker="Admin"
          title="Overview"
          subtitle={`Platform activity ${window}. Times are Vietnam.`}
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
            studyPartsByUser={studyPartsByUser}
            practicePartsByUser={practicePartsByUser}
            classSuggestions={classOptions.map((option) => option.label)}
            savingClassIds={savingClassIds}
            classError={classError}
            displayClass={displayClass}
            onSaveClass={(row, next) => void saveClass(row, next)}
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
