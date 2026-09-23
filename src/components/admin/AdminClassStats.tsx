"use client";

import { useCallback, useMemo, useState } from "react";
import { StudentDetailModal } from "@/components/admin/StudentDetailModal";
import { AdminTopBar } from "@/components/admin/AdminUsersDashboard";
import {
  buildClassStats,
  type AdminCatalogCourse,
  type ClassMemberStat,
} from "@/lib/admin-detail";
import {
  classKey,
  listAdminClasses,
  usersInClass,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { ProfileButton } from "@/components/ProfileButton";

type MemberSortKey =
  | "name"
  | "lastLogin"
  | "streak"
  | "courses"
  | "lessons"
  | "listening"
  | "videos";

type SortDir = "asc" | "desc";

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
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

type AdminClassStatsProps = {
  rows: AdminUserRow[];
  courseCatalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
};

export function AdminClassStats({
  rows,
  courseCatalog,
  storeConfigured,
}: AdminClassStatsProps) {
  const classOptions = useMemo(() => listAdminClasses(rows), [rows]);
  const unassignedCount = useMemo(
    () => rows.filter((row) => !classKey(row.className)).length,
    [rows],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemberSortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

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

  const classRows = useMemo(() => usersInClass(rows, activeKey), [rows, activeKey]);
  const stats = useMemo(
    () => buildClassStats(classRows, courseCatalog),
    [classRows, courseCatalog],
  );

  const startedCourses = stats.courses.filter((course) => course.studentsStarted > 0);
  const idleCourses = stats.courses.filter((course) => course.studentsStarted === 0);

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

  const detailRow = useMemo(() => {
    const row = rows.find((item) => item.userId === detailUserId);
    if (!row) return null;
    const label =
      classOptions.find((option) => option.key === classKey(row.className))?.label ??
      row.className;
    return { ...row, className: label };
  }, [rows, detailUserId, classOptions]);

  const closeDetail = useCallback(() => setDetailUserId(null), []);

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
      <AdminTopBar
        title="Class stats"
        section="classes"
        trailing={
          <>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {classOptions.length} {classOptions.length === 1 ? "class" : "classes"}
            </p>
            <ProfileButton />
          </>
        }
      />

      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-24 py-space-24">
        {!storeConfigured ? (
          <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
            Cloud progress is not configured. This view only includes learners
            who have synced progress to Supabase.
          </div>
        ) : null}

        {rows.length === 0 ? (
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
                    {classOptions.length === 0
                      ? "Add a class on the user list, then return here to compare that group."
                      : "Streaks, lessons, listening, and videos for everyone in this class."}
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
                  label="Listening"
                  value={formatCount(stats.listeningRepetitions)}
                  icon="headphones"
                />
                <SummaryStat
                  label="Videos"
                  value={formatCount(stats.videosWatched)}
                  icon="smart_display"
                />
              </div>

              <div className="flex flex-col gap-space-12">
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Course progress</h3>
                {startedCourses.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No one in this class has started a course yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-space-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {startedCourses.map((course) => (
                      <article
                        key={course.id}
                        className="flex flex-col gap-space-8 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-space-16 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-start justify-between gap-space-8">
                          <div className="min-w-0">
                            <p className="font-caption text-caption font-semibold uppercase tracking-wider text-on-surface-variant">
                              {course.kind === "cefr" ? "Listening" : "Ausbildung"}
                            </p>
                            <h4
                              title={course.label}
                              className="truncate font-label-md text-label-md font-semibold text-on-surface"
                            >
                              {course.shortLabel}
                            </h4>
                          </div>
                          <div className="text-right">
                            <p className="font-label-md text-label-md font-semibold tabular-nums text-on-surface">
                              {course.averagePercent}%
                            </p>
                            <p className="font-caption text-caption text-on-surface-variant">
                              Class average
                            </p>
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${course.averagePercent}%`,
                              backgroundColor:
                                course.averagePercent >= 100 ? "#34C759" : "#0071e3",
                            }}
                          />
                        </div>
                        <p className="font-caption text-caption text-on-surface-variant">
                          {course.studentsStarted} of {course.studentCount} started
                        </p>
                      </article>
                    ))}
                  </div>
                )}
                {startedCourses.length > 0 && idleCourses.length > 0 ? (
                  <p className="font-body-sm text-body-sm text-outline">
                    Not started: {idleCourses.map((course) => course.shortLabel).join(", ")}
                  </p>
                ) : null}
              </div>

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
                        <SortHeader label="Last login" column="lastLogin" sort={sort} dir={dir} onSort={handleSort} />
                        <SortHeader label="Streak" column="streak" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Courses" column="courses" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Lessons" column="lessons" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Listening" column="listening" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Videos" column="videos" sort={sort} dir={dir} align="right" onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMembers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                          >
                            No students in this class match your search.
                          </td>
                        </tr>
                      ) : (
                        visibleMembers.map((member) => {
                          const when = formatAbsoluteTime(member.lastLoginAt);
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
                              <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface">
                                {when ? (
                                  <time dateTime={member.lastLoginAt ?? undefined}>{when}</time>
                                ) : (
                                  <span className="text-outline">Never logged in</span>
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
