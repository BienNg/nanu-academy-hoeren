"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setAdminUserClass } from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  CARD,
  HeaderChip,
  IconTile,
  PanelHeader,
  Pager,
  SectionHeading,
  TH,
  THEAD,
  TR,
  formatCount,
  formatPercent,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
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

type DomainStat = { label: string; value: string; hint: string };

/** One silo of the metric deck: a coloured rule, a domain banner, and its stats. */
function DomainCard({
  icon,
  title,
  color,
  badge,
  stats,
}: {
  icon: string;
  title: string;
  color: string;
  badge?: string;
  stats: readonly DomainStat[];
}) {
  return (
    <article
      className={`${CARD} flex flex-col gap-space-16 border-t-2 p-space-16 2xl:p-space-20`}
      style={{ borderTopColor: color }}
    >
      <header className="flex items-center justify-between gap-space-8">
        <div className="flex min-w-0 items-center gap-space-8">
          <IconTile icon={icon} color={color} />
          <h3 className="truncate text-admin-label-sm uppercase text-admin-ink-muted">{title}</h3>
        </div>
        {badge ? (
          <span
            className="inline-flex h-5 shrink-0 items-center rounded-admin-badge px-1.5 text-[12px] font-semibold leading-4 tabular-nums"
            style={{ backgroundColor: `${color}14`, color }}
          >
            {badge}
          </span>
        ) : null}
      </header>
      <dl
        className={`grid gap-space-12 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"} divide-x divide-admin-hairline`}
      >
        {stats.map((stat, index) => (
          <div key={stat.label} className={`flex min-w-0 flex-col ${index > 0 ? "pl-space-12" : ""}`}>
            <dt className="truncate text-admin-body-sm text-admin-ink-muted">{stat.label}</dt>
            <dd className="font-admin-display text-admin-metric tabular-nums text-admin-ink">
              {stat.value}
            </dd>
            <dd className="text-[12px] leading-4 text-admin-ink-subtle">{stat.hint}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function xpRangeTitle(range: AdminRange): string {
  if (range === "today") return "XP earned today";
  return `XP earned in the last ${adminRangeLabel(range).toLowerCase()}`;
}

const AVATAR_COLORS = [
  ADMIN_COLORS.cobalt,
  ADMIN_COLORS.violet,
  ADMIN_COLORS.emerald,
  ADMIN_COLORS.ember,
  ADMIN_COLORS.amber,
  ADMIN_COLORS.inkMuted,
];

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

function StudentAvatar({
  name,
  image,
  size = 20,
}: {
  name: string;
  image: string | null;
  size?: 20 | 24;
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 20 ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  if (image && !failed) {
    return (
      <span className={`relative inline-flex shrink-0 overflow-hidden rounded-full ${box}`}>
        <Image
          src={image}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${box}`}
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
    <span className="group/avatar relative -mt-1.5 inline-flex last:mt-0 hover:z-10 focus-within:z-10">
      <button
        type="button"
        aria-label={label}
        onClick={() => onSelect(student.userId)}
        className="inline-flex rounded-full ring-2 ring-admin-card outline-none transition-transform hover:scale-110 hover:ring-admin-cobalt focus-visible:ring-admin-cobalt"
      >
        <StudentAvatar name={student.displayName} image={student.image} />
      </button>
      <span
        role="presentation"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-space-8 hidden w-max max-w-[14rem] -translate-x-1/2 rounded-admin-control bg-admin-ink px-space-8 py-space-4 text-left shadow-admin-pop group-hover/avatar:block group-focus-within/avatar:block"
      >
        <span className="block truncate text-admin-label-md font-semibold text-white">
          {student.displayName}
        </span>
        {when ? (
          <span className="block text-[11px] leading-[14px] text-white/70">Last seen {when}</span>
        ) : null}
      </span>
    </span>
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
  // The open overflow list belongs to one timeline; a new clock tick, range, or
  // user list makes it stale, so it is dropped by comparison instead of an effect.
  const [open, setOpen] = useState<{
    key: string;
    clockKey: string | null;
    range: AdminRange;
    users: readonly AdminUserRow[];
  } | null>(null);
  const openKey =
    open && open.clockKey === clockKey && open.range === range && open.users === users
      ? open.key
      : null;

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  if (!timeline) return <div className={`${CARD} h-64`} aria-hidden="true" />;

  const openColumn = timeline.columns.find((column) => column.key === openKey) ?? null;
  const hidden = openColumn ? openColumn.students.slice(ACTIVE_USER_TIMELINE_CAP) : [];
  const fillsWidth = range === "today" || range === "7d";
  const columnWidth = fillsWidth ? "min-w-0 flex-1" : "w-7 shrink-0";
  const columnLabel = (column: { label: string; marker: string | null }) =>
    timeline.grain === "hour"
      ? `${column.label}:00`
      : column.marker
        ? `${column.marker} ${column.label}`
        : column.label;

  return (
    <div className={`${CARD} flex h-full flex-col gap-space-12 p-space-16 sm:p-space-20`}>
      <PanelHeader
        icon="timeline"
        title="Last seen"
        color={ADMIN_COLORS.ember}
        hint={
          timeline.grain === "hour"
            ? "Each avatar sits on the Vietnam hour of that student's latest visit. Hover for details."
            : "Each avatar sits on the Vietnam day of that student's latest visit. Hover for details."
        }
      />
      {/* Top padding leaves room for the hover card inside the scroll box. */}
      <div className={`flex-1 pt-space-48 ${fillsWidth ? "" : "overflow-x-auto"}`}>
        <div
          className={`flex h-full items-end gap-0.5 border-b border-admin-hairline ${fillsWidth ? "w-full" : "min-w-max"}`}
          role="list"
          aria-label="Last seen timeline"
        >
          {timeline.columns.map((column) => {
            const visible = column.students.slice(0, ACTIVE_USER_TIMELINE_CAP);
            const extra = column.students.length - visible.length;
            const axis = columnLabel(column);
            const busy = column.students.length > 0;
            return (
              <div
                key={column.key}
                role="listitem"
                aria-label={`${axis}, ${column.students.length} ${column.students.length === 1 ? "student" : "students"}`}
                className={`flex ${columnWidth} flex-col items-center justify-end pb-space-8`}
              >
                {extra > 0 ? (
                  <button
                    type="button"
                    aria-expanded={openKey === column.key}
                    aria-label={`Show ${extra} more last seen at ${axis}`}
                    onClick={() =>
                      setOpen((current) =>
                        current?.key === column.key && openKey === column.key
                          ? null
                          : { key: column.key, clockKey, range, users },
                      )
                    }
                    className="mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-subtle px-1 text-[10px] font-semibold tabular-nums text-admin-ink-muted ring-2 ring-admin-card outline-none hover:bg-admin-hairline focus-visible:shadow-admin-focus"
                  >
                    +{extra}
                  </button>
                ) : null}
                <div className="flex flex-col-reverse items-center">
                  {visible.map((student) => (
                    <TimelineStudentButton
                      key={student.userId}
                      student={student}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                {!busy ? (
                  <span className="h-1 w-1 rounded-full bg-admin-hairline" aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className={`flex gap-0.5 ${fillsWidth ? "w-full" : "min-w-max"}`} aria-hidden="true">
          {timeline.columns.map((column) => (
            <div
              key={column.key}
              className={`flex ${columnWidth} h-8 flex-col items-center justify-start pt-1 text-center`}
            >
              <span className="text-[11px] leading-[14px] tabular-nums text-admin-ink-subtle">
                {column.label}
              </span>
              {column.marker ? (
                <span className="text-[10px] leading-3 text-admin-ink-faint">{column.marker}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {hidden.length > 0 && openColumn ? (
        <div className="flex flex-col gap-1 rounded-admin-control border border-admin-hairline bg-admin-canvas p-space-8">
          <p className="px-space-4 text-admin-label-md text-admin-ink-muted">
            {hidden.length} more at {columnLabel(openColumn)}
          </p>
          <ul className="flex max-h-48 flex-col overflow-y-auto">
            {hidden.map((student) => {
              const when = formatAbsoluteTime(student.lastLoginAt);
              return (
                <li key={student.userId}>
                  <button
                    type="button"
                    onClick={() => onSelect(student.userId)}
                    className="flex w-full items-center gap-space-8 rounded-admin-control px-space-8 py-1.5 text-left outline-none hover:bg-admin-subtle focus-visible:shadow-admin-focus"
                  >
                    <StudentAvatar name={student.displayName} image={student.image} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-admin-label-md font-semibold text-admin-ink">
                        {student.displayName}
                      </span>
                      {when ? (
                        <span className="block text-[11px] leading-[14px] text-admin-ink-subtle">
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
        <p className="text-admin-body-sm text-admin-ink-subtle">
          {timeline.unplaced === 1
            ? "1 active user has no last-seen time in this window."
            : `${timeline.unplaced.toLocaleString("en-GB")} active users have no last-seen time in this window.`}
        </p>
      ) : null}
    </div>
  );
}

const HIGHLIGHT_COUNT = 5;

function HighlightList({
  title,
  icon,
  color,
  empty,
  items,
  onSelect,
}: {
  title: string;
  icon: string;
  color: string;
  empty: string;
  items: readonly { row: AdminUserRow; value: string }[];
  onSelect: (userId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-space-4">
      <h4 className="flex items-center gap-space-4 px-space-8 text-admin-label-sm uppercase text-admin-ink-subtle">
        <span className="flex" style={{ color }}>
          <MaterialIcon name={icon} className="text-[16px]" filled />
        </span>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="px-space-8 py-space-8 text-admin-body-sm text-admin-ink-subtle">{empty}</p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item, index) => (
            <li key={item.row.userId}>
              <button
                type="button"
                onClick={() => onSelect(item.row.userId)}
                className="flex w-full items-center gap-space-8 rounded-admin-control px-space-8 py-1.5 text-left outline-none transition-colors hover:bg-admin-canvas focus-visible:shadow-admin-focus"
              >
                <span className="w-4 shrink-0 text-right text-admin-label-md tabular-nums text-admin-ink-faint">
                  {index + 1}
                </span>
                <StudentAvatar name={item.row.displayName} image={item.row.image ?? null} size={24} />
                <span className="min-w-0 flex-1 truncate text-admin-body-md font-medium text-admin-ink">
                  {item.row.displayName}
                </span>
                <span
                  className="shrink-0 text-admin-label-md font-semibold tabular-nums"
                  style={{ color }}
                >
                  {item.value}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The 4-column insight feed beside the timeline: who is on a streak, who earned most. */
function HighlightsPanel({
  users,
  range,
  rangeXp,
  rangeXpReady,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  range: AdminRange;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  onSelect: (userId: string) => void;
}) {
  const streaks = useMemo(
    () =>
      users
        .filter((row) => row.streakDays > 0)
        .sort((a, b) => b.streakDays - a.streakDays)
        .slice(0, HIGHLIGHT_COUNT)
        .map((row) => ({ row, value: `${row.streakDays} d` })),
    [users],
  );
  const earners = useMemo(
    () =>
      users
        .map((row) => ({ row, xp: rangeXp[row.userId] ?? 0 }))
        .filter((item) => item.xp > 0)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, HIGHLIGHT_COUNT)
        .map((item) => ({ row: item.row, value: `${formatCount(item.xp)} XP` })),
    [users, rangeXp],
  );
  return (
    <div className={`${CARD} flex h-full flex-col gap-space-16 p-space-16 sm:p-space-20`}>
      <PanelHeader
        icon="insights"
        title="Highlights"
        color={ADMIN_COLORS.amber}
        hint="Among active users. Click a name for their detail."
      />
      <HighlightList
        title="Longest streaks"
        icon="local_fire_department"
        color={ADMIN_COLORS.ember}
        empty="No one is on a streak."
        items={streaks}
        onSelect={onSelect}
      />
      {rangeXpReady ? (
        <HighlightList
          title={xpRangeTitle(range)}
          icon="bolt"
          color={ADMIN_COLORS.amber}
          empty="No XP earned in this window."
          items={earners}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}

function ActiveUsersTable({
  users,
  window,
  range,
  rangeXp,
  rangeXpReady,
  studyPartsByUser,
  practicePartsByUser,
  classSuggestions,
  savingClassIds,
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
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead className={THEAD}>
            <tr>
              <th className={TH}>User</th>
              <th className={TH}>Class</th>
              <th className={TH}>Last seen</th>
              <th className={`${TH} text-right`}>Streak</th>
              <th className={`${TH} text-right`}>Study parts</th>
              <th className={`${TH} text-right`}>Practice parts</th>
              <th className={`${TH} text-right`}>Video</th>
            </tr>
          </thead>
          <tbody className="text-admin-body-md text-admin-ink">
            {paged.pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted"
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
                    className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                  >
                    <td className="px-space-16 py-space-8">
                      <div className="flex min-w-[14rem] items-center gap-space-12">
                        <StudentAvatar name={row.displayName} image={row.image ?? null} size={24} />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt">
                            {row.displayName}
                          </span>
                          {row.email && row.email !== row.displayName ? (
                            <span className="truncate text-admin-body-sm text-admin-ink-subtle">
                              {row.email}
                            </span>
                          ) : null}
                        </div>
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
                    <td className="whitespace-nowrap px-space-16 py-space-8 text-admin-body-sm text-admin-ink">
                      {lastSeen ? (
                        <div className="flex flex-col items-start">
                          <time dateTime={row.lastLoginAt ?? undefined}>{lastSeen}</time>
                          {relative ? (
                            <span className="text-[12px] leading-4 text-admin-ink-subtle">{relative}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-admin-ink-subtle">Not seen yet</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-space-16 py-space-8 text-right">
                      <div className="flex flex-col items-end">
                        <span
                          className={`inline-flex items-center gap-space-4 text-admin-label-md font-semibold tabular-nums ${
                            row.streakDays > 0 ? "text-admin-ember-ink" : "text-admin-ink-faint"
                          }`}
                        >
                          <MaterialIcon
                            name="local_fire_department"
                            className={`text-[16px] ${row.streakDays > 0 ? "text-admin-ember" : ""}`}
                            filled={row.streakDays > 0}
                          />
                          {row.streakDays}
                        </span>
                        {rangeXpReady ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[12px] leading-4 tabular-nums ${
                              earned > 0 ? "text-admin-amber-ink" : "text-admin-ink-faint"
                            }`}
                            title={xpTitle}
                          >
                            <MaterialIcon
                              name="bolt"
                              className={`text-[14px] ${earned > 0 ? "text-admin-amber" : ""}`}
                              filled={earned > 0}
                            />
                            {earned.toLocaleString("en-GB")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="whitespace-nowrap px-space-16 py-space-8 text-right tabular-nums"
                      title={partTitle}
                    >
                      {studyPartsByUser == null ? "—" : formatCount(studyParts)}
                    </td>
                    <td
                      className="whitespace-nowrap px-space-16 py-space-8 text-right tabular-nums"
                      title={`${partTitle}. Passed parts only.`}
                    >
                      {practicePartsByUser == null ? "—" : formatCount(practiceParts)}
                    </td>
                    <td
                      className="whitespace-nowrap px-space-16 py-space-8 text-right tabular-nums"
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

      <div className="border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-12 sm:px-space-20">
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          start={rangeStart}
          end={rangeEnd}
          total={paged.total}
          noun="users"
          onPage={setPage}
        />
      </div>
    </div>
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
  /** Learners who finished a study or practice part in the window, pass or fail. */
  cardUserIds: readonly string[];
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
  cardUserIds,
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
  const cardUsers = useMemo(() => new Set(cardUserIds), [cardUserIds]);
  const activeUsers = useMemo(
    () => listActiveAdminUsers(liveRows, range, new Date(), cardUsers),
    [liveRows, range, cardUsers],
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
  const activeShare = activity.users > 0 ? activity.activeUsers / activity.users : 0;
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
      <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
        <AdminPageHeader
          kicker="Admin"
          title="Overview"
          subtitle={`Platform activity ${window}.`}
          trailing={<HeaderChip icon="public">Vietnam time · GMT+7</HeaderChip>}
        />

        {!storeConfigured ? (
          <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
            Cloud progress is not configured. This dashboard only counts learners who have
            synced progress to Supabase.
          </div>
        ) : null}

        <section aria-labelledby="overview-metrics" className="flex flex-col gap-space-12">
          <SectionHeading
            id="overview-metrics"
            icon="grid_view"
            title="At a glance"
            meta={adminRangeLabel(range)}
          />
          <div className="grid grid-cols-1 gap-space-16 md:grid-cols-2 xl:grid-cols-3 2xl:gap-space-20">
            <DomainCard
              icon="local_fire_department"
              title="Engagement"
              color={ADMIN_COLORS.ember}
              badge={`${formatPercent(activeShare)} active`}
              stats={[
                {
                  label: "Active",
                  value: formatCount(activity.activeUsers),
                  hint: `Finished a card ${window}`,
                },
                {
                  label: "All students",
                  value: formatCount(activity.users),
                  hint: "Every account",
                },
              ]}
            />
            <DomainCard
              icon="menu_book"
              title="Curriculum"
              color={ADMIN_COLORS.emerald}
              stats={[
                {
                  label: "Study runs",
                  value: formatCount(activity.studyRuns),
                  hint: "Whole lessons",
                },
                {
                  label: "Study parts",
                  value: studyParts == null ? "—" : formatCount(studyParts),
                  hint: "Parts finished",
                },
              ]}
            />
            <div className="md:col-span-2 xl:col-span-1">
              <DomainCard
                icon="headphones"
                title="Video & audio"
                color={ADMIN_COLORS.violet}
                stats={[
                  {
                    label: "Videos",
                    value: formatCount(activity.videosWatched),
                    hint: "Marked watched",
                  },
                  {
                    label: "Practice runs",
                    value: formatCount(practiceRuns ?? activity.practiceRuns),
                    hint: "Whole lessons",
                  },
                  {
                    label: "Practice parts",
                    value: practiceParts == null ? "—" : formatCount(practiceParts),
                    hint: "Parts finished",
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {storeConfigured ? (
          <>
            <section aria-labelledby="overview-live" className="flex flex-col gap-space-12">
              <SectionHeading
                id="overview-live"
                icon="monitoring"
                title="Who was here"
                meta={`${formatCount(activeUsers.length)} active ${window}`}
              />
              <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-12 2xl:gap-space-20">
                <div className="min-w-0 lg:col-span-8">
                  <ActiveUsersTimeline
                    users={activeUsers}
                    range={range}
                    onSelect={setDetailUserId}
                  />
                </div>
                <div className="min-w-0 lg:col-span-4">
                  <HighlightsPanel
                    users={activeUsers}
                    range={range}
                    rangeXp={rangeXp}
                    rangeXpReady={rangeXpReady}
                    onSelect={setDetailUserId}
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="overview-users" className="flex flex-col gap-space-12">
              <SectionHeading
                id="overview-users"
                icon="group"
                title="Active users"
                meta="Click a row to open their detail"
              />
              {classError ? (
                <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
                  {classError}
                </div>
              ) : null}
              <ActiveUsersTable
                users={activeUsers}
                window={window}
                range={range}
                rangeXp={rangeXp}
                rangeXpReady={rangeXpReady}
                studyPartsByUser={studyPartsByUser}
                practicePartsByUser={practicePartsByUser}
                classSuggestions={classOptions.map((option) => option.label)}
                savingClassIds={savingClassIds}
                displayClass={displayClass}
                onSaveClass={(row, next) => void saveClass(row, next)}
                onSelect={setDetailUserId}
              />
            </section>
          </>
        ) : null}
      </main>

      {detailRow ? (
        <StudentDetail
          row={detailRow}
          catalog={courseCatalog}
          onClose={() => setDetailUserId(null)}
        />
      ) : null}
    </>
  );
}
