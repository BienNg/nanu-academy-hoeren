"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { setAdminUserClass } from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { StudentDetailModal } from "@/components/admin/StudentDetailModal";
import {
  buildClassStats,
  type AdminCatalogCourse,
  type ClassMemberStat,
} from "@/lib/admin-detail";
import {
  classKey,
  formatAdminTimestamp,
  listAdminClasses,
  normalizeClassName,
  usersInClass,
  type AdminUserRow,
} from "@/lib/admin-overview";

type MemberSortKey =
  | "name"
  | "lastLogin"
  | "streak"
  | "courses"
  | "lessons"
  | "listening"
  | "videos";

type SortDir = "asc" | "desc";

function formatAbsoluteTime(iso: string | null): string | null {
  return formatAdminTimestamp(iso);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function SummaryStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint?: string;
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
      {hint ? (
        <p className="mt-1 font-caption text-caption text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  column,
  sort,
  dir,
  align = "left",
  onSort,
}: {
  label: string;
  column: MemberSortKey;
  sort: MemberSortKey;
  dir: SortDir;
  align?: "left" | "right";
  onSort: (column: MemberSortKey) => void;
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-space-4 rounded-md px-space-4 py-0.5 transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        {label}
        <MaterialIcon
          name={
            !active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"
          }
          className={`text-[16px] ${active ? "text-primary" : "text-outline"}`}
        />
      </button>
    </th>
  );
}

function loginMs(iso: string | null): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function compareMembers(a: ClassMemberStat, b: ClassMemberStat, sort: MemberSortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  if (sort === "lastLogin") {
    const delta = loginMs(a.lastLoginAt) - loginMs(b.lastLoginAt);
    if (delta !== 0) return delta * sign;
  } else if (sort === "streak") {
    if (a.streakDays !== b.streakDays) return (a.streakDays - b.streakDays) * sign;
  } else if (sort === "courses") {
    if (a.coursesStarted !== b.coursesStarted) return (a.coursesStarted - b.coursesStarted) * sign;
  } else if (sort === "lessons") {
    if (a.lessonsCompleted !== b.lessonsCompleted) {
      return (a.lessonsCompleted - b.lessonsCompleted) * sign;
    }
  } else if (sort === "listening") {
    if (a.listeningRepetitions !== b.listeningRepetitions) {
      return (a.listeningRepetitions - b.listeningRepetitions) * sign;
    }
  } else if (sort === "videos") {
    if (a.videosWatched !== b.videosWatched) return (a.videosWatched - b.videosWatched) * sign;
  } else {
    const byName = a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
    if (byName !== 0) return byName * sign;
  }
  return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
}

function CountCell({ value }: { value: number }) {
  return (
    <td
      className={`whitespace-nowrap px-space-16 py-space-16 text-right font-label-md text-label-md font-semibold tabular-nums ${
        value > 0 ? "text-on-surface" : "text-outline"
      }`}
    >
      {formatCount(value)}
    </td>
  );
}

type WaitingClassMember = {
  email: string;
  className: string | null;
};

type AdminClassStatsProps = {
  rows: AdminUserRow[];
  courseCatalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
  pending?: readonly WaitingClassMember[];
};

export function AdminClassStats({
  rows,
  courseCatalog,
  storeConfigured,
  pending = [],
}: AdminClassStatsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [classByUser, setClassByUser] = useState<Record<string, string | null>>({});
  const [savingClassIds, setSavingClassIds] = useState<string[]>([]);
  const [classError, setClassError] = useState<string | null>(null);
  const savingClassRef = useRef(new Set<string>());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemberSortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const liveRows = useMemo(
    () =>
      rows.map((row) =>
        Object.hasOwn(classByUser, row.userId)
          ? { ...row, className: classByUser[row.userId] }
          : row,
      ),
    [rows, classByUser],
  );
  const classOptions = useMemo(
    () => listAdminClasses([...liveRows, ...pending]),
    [liveRows, pending],
  );
  const unassignedCount = useMemo(
    () => liveRows.filter((row) => !classKey(row.className)).length,
    [liveRows],
  );

  const activeKey = useMemo(() => {
    const selectable = new Set(classOptions.map((option) => option.key));
    if (unassignedCount > 0) selectable.add("");
    if (selectedKey !== null && selectable.has(selectedKey)) return selectedKey;
    return classOptions[0]?.key ?? "";
  }, [selectedKey, classOptions, unassignedCount]);

  const activeLabel =
    activeKey === ""
      ? "Unassigned"
      : (classOptions.find((option) => option.key === activeKey)?.label ?? "Class");

  const classRows = useMemo(() => usersInClass(liveRows, activeKey), [liveRows, activeKey]);
  const waitingHere = useMemo(
    () => pending.filter((row) => row.className && classKey(row.className) === activeKey),
    [pending, activeKey],
  );
  const stats = useMemo(
    () => buildClassStats(classRows, courseCatalog),
    [classRows, courseCatalog],
  );

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? stats.members.filter((member) => {
          const haystack = [member.displayName, member.email].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(needle);
        })
      : stats.members;
    return [...matched].sort((a, b) => compareMembers(a, b, sort, dir));
  }, [stats.members, query, sort, dir]);

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

  const detailRow = useMemo(() => {
    const row = liveRows.find((item) => item.userId === detailUserId);
    if (!row) return null;
    return { ...row, className: displayClass(row) };
  }, [liveRows, detailUserId, displayClass]);

  const closeDetail = useCallback(() => setDetailUserId(null), []);

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
      const fromKey = classKey(previous);
      const toKey = classKey(result.className);
      setSelectedKey((current) => {
        const viewing = current ?? activeKey;
        if (viewing !== fromKey) return current;
        const stillHere = liveRows.some(
          (item) => item.userId !== row.userId && classKey(item.className) === fromKey,
        );
        return stillHere ? current : toKey;
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingClassRef.current.delete(row.userId);
      setSavingClassIds((prev) => prev.filter((id) => id !== row.userId));
    }
  }

  function selectClass(key: string) {
    setSelectedKey(key);
    setQuery("");
  }

  function handleSort(column: MemberSortKey) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir(column === "name" ? "asc" : "desc");
    }
  }

  const chips = [
    ...classOptions.map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
    })),
    ...(unassignedCount > 0
      ? [{ key: "", label: "Unassigned", count: unassignedCount }]
      : []),
  ];

  return (
    <>
      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
        <AdminPageHeader
          kicker="People"
          title="Classes"
          subtitle="Compare one class as a group, then open a student for detail."
          trailing={
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {classOptions.length} {classOptions.length === 1 ? "class" : "classes"}
            </p>
          }
        />

        {!storeConfigured ? (
          <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
            Cloud progress is not configured. This view only includes learners
            who have synced progress to Supabase.
          </div>
        ) : null}

        {rows.length === 0 && classOptions.length === 0 ? (
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-space-24 py-space-48 text-center shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
            <p className="font-body-md text-body-md text-on-surface-variant">
              No users have synced progress yet.
            </p>
          </section>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Classes"
              className="flex flex-wrap gap-space-8"
            >
              {chips.map((chip) => {
                const selected = chip.key === activeKey;
                return (
                  <button
                    key={chip.key || "unassigned"}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectClass(chip.key)}
                    className={`inline-flex h-9 items-center gap-space-8 rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                      selected
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {chip.label}
                    <span className={`tabular-nums ${selected ? "text-on-primary/80" : "text-on-surface-variant"}`}>
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <section role="tabpanel" aria-label={activeLabel} className="flex flex-col gap-space-20">
              <div className="flex flex-wrap items-end justify-between gap-space-12">
                <div>
                  <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
                    Class
                  </p>
                  <h2 className="font-headline-md text-headline-md tracking-tight text-on-surface">
                    {activeLabel}
                  </h2>
                  <p className="mt-1 max-w-xl font-body-sm text-body-sm text-on-surface-variant">
                    Streaks, lessons, practice runs, and videos for everyone in this class.
                    Assign a class from the student row.
                    {waitingHere.length > 0
                      ? ` ${formatCount(waitingHere.length)} ${
                          waitingHere.length === 1 ? "email is" : "emails are"
                        } waiting to sign up.`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-space-12 md:grid-cols-3">
                <SummaryStat
                  label="Students"
                  value={formatCount(stats.studentCount)}
                  icon="group"
                />
                <SummaryStat
                  label="Avg. streak"
                  value={formatCount(stats.averageStreak)}
                  icon="local_fire_department"
                  hint={`${formatCount(stats.activeStreaks)} active`}
                />
                <SummaryStat
                  label="Courses"
                  value={formatCount(stats.coursesStarted)}
                  icon="menu_book"
                />
                <SummaryStat
                  label="Lessons"
                  value={formatCount(stats.lessonsCompleted)}
                  icon="check_circle"
                />
                <SummaryStat
                  label="Practice runs"
                  value={formatCount(stats.listeningRepetitions)}
                  icon="headphones"
                />
                <SummaryStat
                  label="Videos"
                  value={formatCount(stats.videosWatched)}
                  icon="smart_display"
                />
              </div>

              {waitingHere.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
                  <div className="border-b border-outline-variant/20 px-space-16 py-space-12">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">
                      Waiting to sign up
                    </h3>
                    <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
                      These emails already belong to {activeLabel}. They join this class when they sign in.
                    </p>
                  </div>
                  <ul className="flex flex-col">
                    {waitingHere.map((row) => (
                      <li
                        key={row.email}
                        className="border-t border-outline-variant/15 px-space-16 py-space-12 font-label-md text-label-md font-semibold text-on-surface first:border-t-0"
                      >
                        {row.email}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {classError ? (
                <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
                  {classError}
                </div>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-space-12 border-b border-outline-variant/20 px-space-16 py-space-12">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Students</h3>
                  <label className="relative w-full max-w-xs">
                    <span className="sr-only">Search students in this class</span>
                    <MaterialIcon
                      name="search"
                      className="pointer-events-none absolute left-space-12 top-1/2 -translate-y-1/2 text-[18px] text-outline"
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search this class"
                      className="h-10 w-full rounded-2xl border border-outline-variant/50 bg-surface py-space-8 pl-10 pr-space-12 font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
                    />
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    <caption className="sr-only">Students in {activeLabel}</caption>
                    <thead className="bg-surface-container-low">
                      <tr>
                        <SortHeader label="User" column="name" sort={sort} dir={dir} onSort={handleSort} />
                        <th
                          scope="col"
                          className="whitespace-nowrap px-space-16 py-space-12 text-left font-label-sm text-label-sm font-semibold text-on-surface-variant"
                        >
                          Class
                        </th>
                        <SortHeader label="Last seen" column="lastLogin" sort={sort} dir={dir} onSort={handleSort} />
                        <SortHeader label="Streak" column="streak" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Courses" column="courses" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Lessons" column="lessons" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Practice runs" column="listening" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Videos" column="videos" sort={sort} dir={dir} align="right" onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMembers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                          >
                            {query.trim()
                              ? "No students in this class match your search."
                              : waitingHere.length > 0
                                ? "No one in this class has signed up yet."
                                : "No students in this class."}
                          </td>
                        </tr>
                      ) : (
                        visibleMembers.map((member) => {
                          const when = formatAbsoluteTime(member.lastLoginAt);
                          const row = liveRows.find((item) => item.userId === member.userId);
                          return (
                            <tr
                              key={member.userId}
                              tabIndex={0}
                              onClick={() => setDetailUserId(member.userId)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") setDetailUserId(member.userId);
                              }}
                              className="cursor-pointer border-t border-outline-variant/20 hover:bg-surface-container-low/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                            >
                              <td className="px-space-16 py-space-16">
                                <div className="flex min-w-[12rem] flex-col">
                                  <span className="font-label-md text-label-md font-semibold text-on-surface">
                                    {member.displayName}
                                  </span>
                                  {member.email && member.email !== member.displayName ? (
                                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                                      {member.email}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              {row ? (
                                <ClassCell
                                  userId={row.userId}
                                  studentName={row.displayName}
                                  value={displayClass(row)}
                                  suggestions={classOptions.map((option) => option.label)}
                                  saving={savingClassIds.includes(row.userId)}
                                  onSave={(next) => void saveClass(row, next)}
                                />
                              ) : (
                                <td />
                              )}
                              <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface">
                                {when ? (
                                  <time dateTime={member.lastLoginAt ?? undefined}>{when}</time>
                                ) : (
                                  <span className="text-outline">Not seen yet</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-space-16 py-space-16 text-right">
                                <span
                                  className={`inline-flex items-center justify-end gap-space-4 ${
                                    member.streakDays > 0 ? "text-on-surface" : "text-outline"
                                  }`}
                                >
                                  <MaterialIcon
                                    name="local_fire_department"
                                    className={`text-[18px] ${
                                      member.streakDays > 0 ? "text-[#ff9500]" : "text-outline"
                                    }`}
                                    filled={member.streakDays > 0}
                                  />
                                  <span className="font-label-md text-label-md font-semibold tabular-nums">
                                    {member.streakDays}
                                  </span>
                                </span>
                              </td>
                              <CountCell value={member.coursesStarted} />
                              <CountCell value={member.lessonsCompleted} />
                              <CountCell value={member.listeningRepetitions} />
                              <CountCell value={member.videosWatched} />
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-outline-variant/20 px-space-16 py-space-12">
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {query.trim()
                      ? `${visibleMembers.length} of ${stats.studentCount} students`
                      : `${stats.studentCount} ${stats.studentCount === 1 ? "student" : "students"}`}
                    . Select a row for lesson detail.
                  </p>
                </div>
              </section>
            </section>
          </>
        )}
      </main>

      {detailRow ? (
        <StudentDetailModal row={detailRow} catalog={courseCatalog} onClose={closeDetail} />
      ) : null}
    </>
  );
}
