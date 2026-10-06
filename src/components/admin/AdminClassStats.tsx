"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { setAdminUserClass } from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  CARD,
  HeaderChip,
  KpiTile,
  Mono,
  ScopeChips,
  SearchField,
  SortHeader,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import { StudentDetail } from "@/components/admin/StudentDrawer";
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
import { ADMIN_COLORS } from "@/lib/admin-tokens";

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
      className={`whitespace-nowrap px-space-16 py-space-8 text-right font-semibold tabular-nums ${
        value > 0 ? "text-admin-ink" : "text-admin-ink-faint"
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

  const emptyMessage = query.trim()
    ? "No students in this class match your search."
    : waitingHere.length > 0
      ? "No one in this class has signed up yet."
      : "No students in this class.";

  return (
    <>
      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
        <AdminPageHeader
          kicker="People"
          title="Classes"
          subtitle="Compare one class as a group, then open a student for detail."
          trailing={
            <HeaderChip icon="school">
              {formatCount(classOptions.length)} {classOptions.length === 1 ? "class" : "classes"}
            </HeaderChip>
          }
        />

        {!storeConfigured ? (
          <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12 text-admin-body-sm text-admin-crimson-ink">
            Cloud progress is not configured. This view only includes learners who have synced
            progress to Supabase.
          </div>
        ) : null}

        {rows.length === 0 && classOptions.length === 0 ? (
          <section className={`${CARD} px-space-24 py-space-48 text-center`}>
            <p className="text-admin-body-md text-admin-ink-muted">No users have synced progress yet.</p>
          </section>
        ) : (
          <>
            <ScopeChips
              label="Class"
              icon="school"
              ariaLabel="Classes"
              value={activeKey}
              options={chips}
              onSelect={selectClass}
            />

            <section role="tabpanel" aria-label={activeLabel} className="flex flex-col gap-space-20">
              <div>
                <p className="text-admin-label-sm uppercase text-admin-cobalt">Class</p>
                <h2 className="font-admin-display text-admin-headline-lg text-admin-ink">{activeLabel}</h2>
                <p className="mt-1 max-w-xl text-admin-body-md text-admin-ink-subtle">
                  Streaks, lessons, practice runs, and videos for everyone in this class. Assign a
                  class from the student row.
                  {waitingHere.length > 0
                    ? ` ${formatCount(waitingHere.length)} ${
                        waitingHere.length === 1 ? "email is" : "emails are"
                      } waiting to sign up.`
                    : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-space-16 md:grid-cols-3 2xl:grid-cols-6">
                <KpiTile
                  icon="group"
                  label="Students"
                  value={formatCount(stats.studentCount)}
                  caption={waitingHere.length > 0 ? `+${formatCount(waitingHere.length)} waiting` : "Signed up"}
                  color={ADMIN_COLORS.cobalt}
                />
                <KpiTile
                  icon="local_fire_department"
                  label="Avg. streak"
                  value={formatCount(stats.averageStreak)}
                  caption={`${formatCount(stats.activeStreaks)} on a streak`}
                  color={ADMIN_COLORS.ember}
                  progress={stats.studentCount > 0 ? stats.activeStreaks / stats.studentCount : 0}
                  progressLabel="Share of the class on a streak"
                />
                <KpiTile
                  icon="menu_book"
                  label="Courses"
                  value={formatCount(stats.coursesStarted)}
                  caption="Started"
                  color={ADMIN_COLORS.emerald}
                />
                <KpiTile
                  icon="check_circle"
                  label="Lessons"
                  value={formatCount(stats.lessonsCompleted)}
                  caption="All parts finished"
                  color={ADMIN_COLORS.emerald}
                />
                <KpiTile
                  icon="fitness_center"
                  label="Practice runs"
                  value={formatCount(stats.listeningRepetitions)}
                  caption="Finished passes"
                  color={ADMIN_COLORS.violet}
                />
                <KpiTile
                  icon="smart_display"
                  label="Videos"
                  value={formatCount(stats.videosWatched)}
                  caption="Marked watched"
                  color={ADMIN_COLORS.violet}
                />
              </div>

              {waitingHere.length > 0 ? (
                <TablePanel
                  icon="hourglass_top"
                  title="Waiting to sign up"
                  hint={`These emails already belong to ${activeLabel}. They join this class when they sign in.`}
                  color={ADMIN_COLORS.amber}
                >
                  <ul className="flex flex-col">
                    {waitingHere.map((row) => (
                      <li
                        key={row.email}
                        className="flex h-11 items-center gap-space-8 border-t border-admin-hairline px-space-16 first:border-t-0 sm:px-space-20"
                      >
                        <MaterialIcon name="mail" className="text-[16px] text-admin-ink-faint" />
                        <Mono className="truncate text-admin-ink">{row.email}</Mono>
                      </li>
                    ))}
                  </ul>
                </TablePanel>
              ) : null}

              {classError ? (
                <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12 text-admin-body-sm text-admin-crimson-ink">
                  {classError}
                </div>
              ) : null}

              <TablePanel
                icon="group"
                title="Students"
                hint="Select a row for the student summary."
                trailing={
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder="Search this class"
                    label="Search students in this class"
                  />
                }
                footer={
                  query.trim()
                    ? `${formatCount(visibleMembers.length)} of ${formatCount(stats.studentCount)} students`
                    : `${formatCount(stats.studentCount)} ${stats.studentCount === 1 ? "student" : "students"}`
                }
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    <caption className="sr-only">Students in {activeLabel}</caption>
                    <thead className={THEAD}>
                      <tr>
                        <SortHeader label="User" column="name" sort={sort} dir={dir} onSort={handleSort} />
                        <th scope="col" className={`${TH} text-left`}>
                          Class
                        </th>
                        <SortHeader label="Last seen" column="lastLogin" sort={sort} dir={dir} onSort={handleSort} />
                        <SortHeader label="Streak" column="streak" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Courses" column="courses" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader label="Lessons" column="lessons" sort={sort} dir={dir} align="right" onSort={handleSort} />
                        <SortHeader
                          label="Practice runs"
                          column="listening"
                          sort={sort}
                          dir={dir}
                          align="right"
                          onSort={handleSort}
                        />
                        <SortHeader label="Videos" column="videos" sort={sort} dir={dir} align="right" onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody className="text-admin-body-md text-admin-ink">
                      {visibleMembers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted"
                          >
                            {emptyMessage}
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
                              className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                            >
                              <td className="px-space-16 py-space-8">
                                <div className="flex min-w-[12rem] flex-col">
                                  <span className="font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt">
                                    {member.displayName}
                                  </span>
                                  {member.email && member.email !== member.displayName ? (
                                    <span className="truncate text-admin-body-sm text-admin-ink-subtle">
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
                              <td className="whitespace-nowrap px-space-16 py-space-8 text-admin-body-sm tabular-nums">
                                {when ? (
                                  <time dateTime={member.lastLoginAt ?? undefined}>{when}</time>
                                ) : (
                                  <span className="text-admin-ink-subtle">Not seen yet</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-space-16 py-space-8 text-right">
                                <span
                                  className={`inline-flex items-center justify-end gap-space-4 font-semibold tabular-nums ${
                                    member.streakDays > 0 ? "text-admin-ember-ink" : "text-admin-ink-faint"
                                  }`}
                                >
                                  <MaterialIcon
                                    name="local_fire_department"
                                    className={`text-[18px] ${member.streakDays > 0 ? "text-admin-ember" : ""}`}
                                    filled={member.streakDays > 0}
                                  />
                                  {member.streakDays}
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
              </TablePanel>
            </section>
          </>
        )}
      </main>

      {detailRow ? (
        <StudentDetail row={detailRow} catalog={courseCatalog} onClose={closeDetail} />
      ) : null}
    </>
  );
}
