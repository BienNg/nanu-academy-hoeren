"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { setAdminUserClass } from "@/app/admin/actions";
import { loadOverviewWindow } from "@/app/admin/range-data";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import {
  AdminPageHeader,
  MaterialIcon,
  useAdminWindow,
} from "@/components/admin/AdminShell";
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
import { LessonPathIcon } from "@/app/learn/[levelSlug]/LevelViewClient";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ACTIVE_USER_TIMELINE_CAP,
  ADMIN_PAGE_SIZE,
  activeSecondsInRange,
  adminRangeLabel,
  adminTimelineClockKey,
  buildActiveUserTimeline,
  buildAdminActivityStats,
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
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";

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

type DomainStat = {
  label: string;
  value: string;
  hint: string;
  /** Path glyph, as tall as the label, number, and hint together. */
  icon?: string;
};

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
          <h3 className="truncate text-admin-label-sm uppercase text-admin-ink-muted">
            {title}
          </h3>
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
        className={`grid gap-space-12 ${stats.length === 3 ? "grid-cols-3" : stats.length === 1 ? "grid-cols-1" : "grid-cols-2"} divide-x divide-admin-hairline`}
      >
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex min-w-0 items-center gap-space-12 ${index > 0 ? "pl-space-16" : ""}`}
          >
            {stat.icon ? (
              <span
                className={`relative h-[70px] shrink-0 ${
                  stat.icon === "menu_book" ? "w-[4.75rem]" : "w-[4.5rem]"
                }`}
              >
                <LessonPathIcon
                  name={stat.icon}
                  onWhite
                  className={`absolute top-1/2 left-1/2 h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 ${
                    stat.icon === "menu_book" ? "scale-[1.22]" : "scale-90"
                  }`}
                />
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col">
              <dt className="truncate text-admin-body-sm text-admin-ink-muted">
                {stat.label}
              </dt>
              <dd className="font-admin-display text-admin-metric tabular-nums text-admin-ink">
                {stat.value}
              </dd>
              <dd className="text-[12px] leading-4 text-admin-ink-subtle">
                {stat.hint}
              </dd>
            </div>
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
  muted = false,
}: {
  name: string;
  image: string | null;
  size?: 20 | 24;
  /** Gray treatment for students who were seen but did not finish a card. */
  muted?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 20 ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]";
  const wash = muted ? "grayscale" : "";
  if (image && !failed) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden rounded-full ${box} ${wash}`}
      >
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
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${muted ? "text-admin-ink-muted" : "text-white"} ${box}`}
      style={{
        backgroundColor: muted ? ADMIN_COLORS.hairline : avatarColor(name),
      }}
      aria-hidden="true"
    >
      {initialFor(name)}
    </span>
  );
}

const TIMELINE_AVATAR = 20;
/** Avatar plus a gap wide enough that the card-colored rings never touch. */
const TIMELINE_STEP_SPACED = TIMELINE_AVATAR + 4;
/** Tightest overlap a crowded column squeezes to before it may overflow. */
const TIMELINE_STEP_MIN = 8;
/** Room the +N chip takes above a stack (h-5 plus mb-1). */
const TIMELINE_MORE_CHIP = 24;
/** Column bottom padding (pb-space-8). */
const TIMELINE_COLUMN_PAD = 8;

/**
 * Vertical distance between avatar tops in one column: spaced apart while the
 * stack fits the plot, then overlapping just enough to stay inside it.
 */
function timelineStep(
  count: number,
  plotHeight: number | null,
  hasMore: boolean,
): number {
  if (count < 2 || plotHeight == null) return TIMELINE_STEP_SPACED;
  const room =
    plotHeight -
    TIMELINE_COLUMN_PAD -
    (hasMore ? TIMELINE_MORE_CHIP : 0) -
    TIMELINE_AVATAR;
  const fit = Math.floor(room / (count - 1));
  return Math.max(TIMELINE_STEP_MIN, Math.min(TIMELINE_STEP_SPACED, fit));
}

function TimelineStudentButton({
  student,
  spacing,
  seen = false,
  onSelect,
}: {
  student: ActiveTimelineStudent;
  /** Margin to the avatar drawn above this one; negative overlaps it. */
  spacing: number;
  /** Seen in this column without finishing a card in the window. */
  seen?: boolean;
  onSelect: (userId: string) => void;
}) {
  const when = formatAbsoluteTime(student.lastLoginAt);
  const label = when
    ? seen
      ? `${student.displayName}, seen ${when}, no card finished`
      : `${student.displayName}, last seen ${when}`
    : student.displayName;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [nudge, setNudge] = useState(0);

  const placeTip = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    setTip((current) =>
      current && current.x === x && current.y === y ? current : { x, y },
    );
  }, []);

  const hideTip = useCallback(() => {
    setTip(null);
    setNudge(0);
  }, []);

  useEffect(() => {
    if (!tip) return;
    const follow = () => placeTip();
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [tip, placeTip]);

  useLayoutEffect(() => {
    const node = tipRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    let delta = 0;
    if (rect.left < margin) delta = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) {
      delta = window.innerWidth - margin - rect.right;
    }
    if (delta !== 0) setNudge((current) => current + delta);
  }, [tip]);

  return (
    <span
      className="relative inline-flex hover:z-10 focus-within:z-10"
      style={{ marginTop: spacing }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        onClick={() => onSelect(student.userId)}
        onMouseEnter={placeTip}
        onMouseLeave={hideTip}
        onFocus={placeTip}
        onBlur={hideTip}
        className={`inline-flex rounded-full ring-2 outline-none transition-transform hover:scale-110 hover:ring-admin-cobalt focus-visible:ring-admin-cobalt ${
          seen
            ? "opacity-80 ring-admin-border hover:opacity-100"
            : "ring-admin-card"
        }`}
      >
        <StudentAvatar
          name={student.displayName}
          image={student.image}
          muted={seen}
        />
      </button>
      {tip ? (
        <span
          ref={tipRef}
          role="presentation"
          className="pointer-events-none fixed z-30 w-max max-w-[14rem] rounded-admin-control bg-admin-ink px-space-8 py-space-4 text-left shadow-admin-pop"
          style={{
            left: tip.x,
            top: tip.y - 8,
            transform: `translate(calc(-50% + ${nudge}px), -100%)`,
          }}
        >
          <span className="block truncate text-admin-label-md font-semibold text-white">
            {student.displayName}
          </span>
          {when ? (
            <span className="block text-[11px] leading-[14px] text-white/70">
              {seen ? `Seen ${when}` : `Last seen ${when}`}
            </span>
          ) : null}
          {seen ? (
            <span className="block text-[11px] leading-[14px] text-white/70">
              No card finished
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function ActiveUsersTimeline({
  users,
  activeUserIds,
  range,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  /** Learners who finished a card in the window. Everyone else on the axis is seen-only. */
  activeUserIds: ReadonlySet<string>;
  range: AdminRange;
  onSelect: (userId: string) => void;
}) {
  const now = useNow();
  const clockKey = now == null ? null : adminTimelineClockKey(new Date(now));
  const timeline = useMemo(() => {
    if (clockKey == null) return null;
    return buildActiveUserTimeline(
      users,
      range,
      timelineDateFromClockKey(clockKey),
      activeUserIds,
    );
  }, [users, range, clockKey, activeUserIds]);
  // The open overflow list belongs to one timeline; a new clock tick, range, or
  // user list makes it stale, so it is dropped by comparison instead of an effect.
  const [open, setOpen] = useState<{
    key: string;
    clockKey: string | null;
    range: AdminRange;
    users: readonly AdminUserRow[];
    activeUserIds: ReadonlySet<string>;
  } | null>(null);
  const openKey =
    open &&
    open.clockKey === clockKey &&
    open.range === range &&
    open.users === users &&
    open.activeUserIds === activeUserIds
      ? open.key
      : null;
  const [plotHeight, setPlotHeight] = useState<number | null>(null);
  const plotObserver = useRef<ResizeObserver | null>(null);
  const plotRef = useCallback((node: HTMLDivElement | null) => {
    plotObserver.current?.disconnect();
    plotObserver.current = null;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPlotHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(node);
    plotObserver.current = observer;
  }, []);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  if (!timeline) return <div className={`${CARD} h-64`} aria-hidden="true" />;

  const openColumn =
    timeline.columns.find((column) => column.key === openKey) ?? null;
  const hiddenActive = openColumn
    ? openColumn.students.slice(ACTIVE_USER_TIMELINE_CAP)
    : [];
  const hiddenSeen = openColumn
    ? openColumn.seen.slice(ACTIVE_USER_TIMELINE_CAP)
    : [];
  const fillsWidth = range === "today" || range === "7d";
  const columnWidth = fillsWidth ? "min-w-11 flex-1" : "w-14 shrink-0";
  const columnLabel = (column: { label: string; marker: string | null }) =>
    timeline.grain === "hour"
      ? `${column.label}:00`
      : column.marker
        ? `${column.marker} ${column.label}`
        : column.label;

  return (
    <div
      className={`${CARD} flex h-full flex-col gap-space-12 p-space-16 sm:p-space-20`}
    >
      <PanelHeader
        icon="timeline"
        title="Last seen"
        color={ADMIN_COLORS.ember}
        hint={
          timeline.grain === "hour"
            ? "Each pair of stacks sits on the Vietnam hour of that student's latest visit. Color finished a card in this window; gray was seen and did not. The smaller number is the same hour in Germany."
            : "Each pair of stacks sits on the Vietnam day of that student's latest visit. Color finished a card in this window; gray was seen and did not."
        }
        trailing={
          <ul className="flex flex-wrap items-center gap-space-12 text-admin-label-md text-admin-ink-muted">
            <li className="flex items-center gap-space-4">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: ADMIN_COLORS.ember }}
                aria-hidden="true"
              />
              Active
            </li>
            <li className="flex items-center gap-space-4">
              <span
                className="h-2.5 w-2.5 rounded-full bg-admin-hairline ring-1 ring-admin-border"
                aria-hidden="true"
              />
              Seen only
            </li>
          </ul>
        }
      />
      {/* The plot is absolutely placed so avatar stacks never stretch the card;
          stacks adapt to its height instead. Tooltips are fixed so a card that
          spills past the plot cannot grow this scroller and resize the stacks. */}
      <div className="relative min-h-72 flex-1">
        <div
          className="absolute inset-0 flex flex-col overflow-x-auto overflow-y-hidden pt-space-48"
        >
          <div
            ref={plotRef}
            className={`flex min-h-0 flex-1 items-end gap-0.5 border-b border-admin-hairline ${fillsWidth ? "w-full" : "min-w-max"}`}
            role="list"
            aria-label="Last seen timeline"
          >
            {timeline.columns.map((column) => {
              const visibleActive = column.students.slice(
                0,
                ACTIVE_USER_TIMELINE_CAP,
              );
              const visibleSeen = column.seen.slice(
                0,
                ACTIVE_USER_TIMELINE_CAP,
              );
              const extra =
                column.students.length -
                visibleActive.length +
                (column.seen.length - visibleSeen.length);
              const axis = columnLabel(column);
              const busy =
                column.students.length > 0 || column.seen.length > 0;
              const hasMore = extra > 0;
              const activeStep = timelineStep(
                visibleActive.length,
                plotHeight,
                hasMore,
              );
              const seenStep = timelineStep(
                visibleSeen.length,
                plotHeight,
                hasMore,
              );
              const counts = [
                column.students.length > 0
                  ? `${column.students.length} active`
                  : null,
                column.seen.length > 0
                  ? `${column.seen.length} seen`
                  : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <div
                  key={column.key}
                  role="listitem"
                  aria-label={
                    counts ? `${axis}, ${counts}` : `${axis}, no students`
                  }
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
                            : {
                                key: column.key,
                                clockKey,
                                range,
                                users,
                                activeUserIds,
                              },
                        )
                      }
                      className="mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-subtle px-1 text-[10px] font-semibold tabular-nums text-admin-ink-muted ring-2 ring-admin-card outline-none hover:bg-admin-hairline focus-visible:shadow-admin-focus"
                    >
                      +{extra}
                    </button>
                  ) : null}
                  <div className="flex w-full items-end justify-center gap-2">
                    {visibleActive.length > 0 ? (
                      <div className="flex flex-col-reverse items-center">
                        {visibleActive.map((student, index) => (
                          <TimelineStudentButton
                            key={student.userId}
                            student={student}
                            spacing={
                              index === visibleActive.length - 1
                                ? 0
                                : activeStep - TIMELINE_AVATAR
                            }
                            onSelect={onSelect}
                          />
                        ))}
                      </div>
                    ) : null}
                    {visibleSeen.length > 0 ? (
                      <div className="flex flex-col-reverse items-center">
                        {visibleSeen.map((student, index) => (
                          <TimelineStudentButton
                            key={student.userId}
                            student={student}
                            seen
                            spacing={
                              index === visibleSeen.length - 1
                                ? 0
                                : seenStep - TIMELINE_AVATAR
                            }
                            onSelect={onSelect}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {!busy ? (
                    <span
                      className="h-1 w-1 rounded-full bg-admin-hairline"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
            className={`flex shrink-0 gap-0.5 ${fillsWidth ? "w-full" : "min-w-max"}`}
            aria-hidden="true"
          >
            {timeline.columns.map((column) => (
              <div
                key={column.key}
                className={`flex ${columnWidth} h-8 flex-col items-center justify-start pt-1 text-center`}
              >
                <span className="text-[11px] leading-[14px] tabular-nums text-admin-ink-subtle">
                  {column.label}
                </span>
                {column.marker ? (
                  <span className="text-[10px] leading-3 text-admin-ink-faint">
                    {column.marker}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      {(hiddenActive.length > 0 || hiddenSeen.length > 0) && openColumn ? (
        <div className="flex flex-col gap-1 rounded-admin-control border border-admin-hairline bg-admin-canvas p-space-8">
          <p className="px-space-4 text-admin-label-md text-admin-ink-muted">
            {hiddenActive.length + hiddenSeen.length} more at{" "}
            {columnLabel(openColumn)}
          </p>
          <ul className="flex max-h-48 flex-col overflow-y-auto">
            {[
              ...hiddenActive.map((student) => ({ student, seen: false })),
              ...hiddenSeen.map((student) => ({ student, seen: true })),
            ].map(({ student, seen }) => {
              const when = formatAbsoluteTime(student.lastLoginAt);
              return (
                <li key={student.userId}>
                  <button
                    type="button"
                    onClick={() => onSelect(student.userId)}
                    className="flex w-full items-center gap-space-8 rounded-admin-control px-space-8 py-1.5 text-left outline-none hover:bg-admin-subtle focus-visible:shadow-admin-focus"
                  >
                    <StudentAvatar
                      name={student.displayName}
                      image={student.image}
                      size={24}
                      muted={seen}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-admin-label-md font-semibold text-admin-ink">
                        {student.displayName}
                      </span>
                      <span className="block text-[11px] leading-[14px] text-admin-ink-subtle">
                        {seen ? "Seen only" : "Active"}
                        {when ? ` · ${when}` : ""}
                      </span>
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
  displayClass,
  onSelect,
}: {
  title: string;
  icon: string;
  color: string;
  empty: string;
  items: readonly { row: AdminUserRow; value: string }[];
  displayClass: (row: AdminUserRow) => string | null;
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
        <p className="px-space-8 py-space-8 text-admin-body-sm text-admin-ink-subtle">
          {empty}
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item, index) => {
            const className = displayClass(item.row);
            return (
              <li key={item.row.userId}>
                <button
                  type="button"
                  onClick={() => onSelect(item.row.userId)}
                  className="flex w-full items-center gap-space-8 rounded-admin-control px-space-8 py-1.5 text-left outline-none transition-colors hover:bg-admin-canvas focus-visible:shadow-admin-focus"
                >
                  <span className="w-4 shrink-0 text-right text-admin-label-md tabular-nums text-admin-ink-faint">
                    {index + 1}
                  </span>
                  <StudentAvatar
                    name={item.row.displayName}
                    image={item.row.image ?? null}
                    size={24}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-space-4">
                    <span className="min-w-0 truncate text-admin-body-md font-medium text-admin-ink">
                      {item.row.displayName}
                    </span>
                    {className ? (
                      <span
                        title={className}
                        className="h-4 max-w-[7rem] shrink-0 truncate rounded-admin-badge bg-admin-subtle px-1 text-[10px] font-medium leading-4 text-admin-ink-subtle"
                      >
                        {className}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="shrink-0 text-admin-label-md font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {item.value}
                  </span>
                </button>
              </li>
            );
          })}
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
  displayClass,
  onSelect,
}: {
  users: readonly AdminUserRow[];
  range: AdminRange;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  displayClass: (row: AdminUserRow) => string | null;
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
        .map((item) => ({
          row: item.row,
          value: `${formatCount(item.xp)} XP`,
        })),
    [users, rangeXp],
  );
  return (
    <div
      className={`${CARD} flex h-full flex-col gap-space-16 p-space-16 sm:p-space-20`}
    >
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
        displayClass={displayClass}
        onSelect={onSelect}
      />
      {rangeXpReady ? (
        <HighlightList
          title={xpRangeTitle(range)}
          icon="bolt"
          color={ADMIN_COLORS.amber}
          empty="No XP earned in this window."
          items={earners}
          displayClass={displayClass}
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
  const rangeStart =
    paged.total === 0 ? 0 : (paged.page - 1) * ADMIN_PAGE_SIZE + 1;
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
              <th className={`${TH} text-right`}>Active time</th>
              <th className={`${TH} text-right`}>Video</th>
            </tr>
          </thead>
          <tbody className="text-admin-body-md text-admin-ink">
            {paged.pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
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
                const activeSeconds = activeSecondsInRange(
                  row.progress,
                  vietnamDays,
                );
                const videoMinutes = videoMinutesInRange(
                  row.progress,
                  vietnamDays,
                );
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
                        <StudentAvatar
                          name={row.displayName}
                          image={row.image ?? null}
                          size={24}
                        />
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
                          <time dateTime={row.lastLoginAt ?? undefined}>
                            {lastSeen}
                          </time>
                          {relative ? (
                            <span className="text-[12px] leading-4 text-admin-ink-subtle">
                              {relative}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-admin-ink-subtle">
                          Not seen yet
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-space-16 py-space-8 text-right">
                      <div className="flex flex-col items-end">
                        <span
                          className={`inline-flex items-center gap-space-4 text-admin-label-md font-semibold tabular-nums ${
                            row.streakDays > 0
                              ? "text-admin-ember-ink"
                              : "text-admin-ink-faint"
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
                              earned > 0
                                ? "text-admin-amber-ink"
                                : "text-admin-ink-faint"
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
                      {practicePartsByUser == null
                        ? "—"
                        : formatCount(practiceParts)}
                    </td>
                    <td
                      className="whitespace-nowrap px-space-16 py-space-8 text-right tabular-nums"
                      title={`Active time ${window}`}
                    >
                      {formatActiveDuration(activeSeconds)}
                    </td>
                    <td
                      className="whitespace-nowrap px-space-16 py-space-8 text-right tabular-nums"
                      title={`Video played ${window}`}
                    >
                      {videoMinutes === 0
                        ? "0 min"
                        : `${formatCount(videoMinutes)} min`}
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
  range: AdminRange;
  courseCatalog: readonly AdminCatalogCourse[];
  rows: readonly AdminUserRow[];
  storeConfigured: boolean;
  rangeXp: Readonly<Record<string, number>>;
  rangeXpReady: boolean;
  studyParts: number | null;
  studyPartsByUser: Readonly<Record<string, number>> | null;
  practiceParts: number | null;
  practicePartsByUser: Readonly<Record<string, number>> | null;
  /** Learners who finished a study or practice part in the window, pass or fail. */
  cardUserIds: readonly string[];
};

export function AdminOverview({
  range: serverRange,
  courseCatalog,
  rows,
  storeConfigured,
  rangeXp,
  rangeXpReady,
  studyParts,
  studyPartsByUser,
  practiceParts,
  practicePartsByUser,
  cardUserIds,
}: AdminOverviewProps) {
  const windowData = useAdminWindow(
    serverRange,
    {
      rangeXp,
      rangeXpReady,
      studyParts,
      studyPartsByUser,
      practiceParts,
      practicePartsByUser,
      cardUserIds,
    },
    loadOverviewWindow,
  );
  const range = windowData.range;
  const {
    rangeXp: earnedXp,
    rangeXpReady: earnedReady,
    studyParts: studyPartCount,
    studyPartsByUser: studyByUser,
    practiceParts: practicePartCount,
    practicePartsByUser: practiceByUser,
    cardUserIds: activeCardIds,
  } = windowData.value;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const window =
    range === "today"
      ? "today"
      : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const [classByUser, setClassByUser] = useState<Record<string, string | null>>(
    {},
  );
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
  const cardUsers = useMemo(() => new Set(activeCardIds), [activeCardIds]);
  const learners = useMemo(
    () => liveRows.filter((row) => !row.isAdmin && !row.staff),
    [liveRows],
  );
  const activeUsers = useMemo(
    () => listActiveAdminUsers(liveRows, range, new Date(), cardUsers),
    [liveRows, range, cardUsers],
  );
  const activeUserIds = useMemo(
    () => new Set(activeUsers.map((row) => row.userId)),
    [activeUsers],
  );
  const activity = useMemo(
    () => buildAdminActivityStats(liveRows, range, new Date(), cardUsers),
    [liveRows, range, cardUsers],
  );
  const displayClass = useCallback(
    (row: AdminUserRow): string | null => {
      if (!row.className) return null;
      return (
        classOptions.find((option) => option.key === classKey(row.className))
          ?.label ?? row.className
      );
    },
    [classOptions],
  );
  const activeShare =
    activity.users > 0 ? activity.activeUsers / activity.users : 0;
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
            Cloud progress is not configured. This dashboard only counts
            learners who have synced progress to Supabase.
          </div>
        ) : null}

        <section
          aria-labelledby="overview-metrics"
          className="flex flex-col gap-space-12"
        >
          <SectionHeading
            id="overview-metrics"
            icon="grid_view"
            title="At a glance"
            meta={adminRangeLabel(range)}
          />
          <div className="grid grid-cols-1 gap-space-16 md:grid-cols-2 2xl:gap-space-20">
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
              title="Study & practice"
              color={ADMIN_COLORS.emerald}
              stats={[
                {
                  label: "Study parts",
                  value:
                    studyPartCount == null ? "—" : formatCount(studyPartCount),
                  hint: "Parts finished",
                  icon: "menu_book",
                },
                {
                  label: "Practice parts",
                  value:
                    practicePartCount == null
                      ? "—"
                      : formatCount(practicePartCount),
                  hint: "Parts finished",
                  icon: "fitness_center",
                },
              ]}
            />
          </div>
        </section>

        {storeConfigured ? (
          <>
            <section
              aria-labelledby="overview-live"
              className="flex flex-col gap-space-12"
            >
              <SectionHeading
                id="overview-live"
                icon="monitoring"
                title="Who was here"
                meta={`${formatCount(activeUsers.length)} active ${window}`}
              />
              <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-12 2xl:gap-space-20">
                <div className="min-w-0 lg:col-span-8">
                  <ActiveUsersTimeline
                    users={learners}
                    activeUserIds={activeUserIds}
                    range={range}
                    onSelect={setDetailUserId}
                  />
                </div>
                <div className="min-w-0 lg:col-span-4">
                  <HighlightsPanel
                    users={activeUsers}
                    range={range}
                    rangeXp={earnedXp}
                    rangeXpReady={earnedReady}
                    displayClass={displayClass}
                    onSelect={setDetailUserId}
                  />
                </div>
              </div>
            </section>

            <section
              aria-labelledby="overview-users"
              className="flex flex-col gap-space-12"
            >
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
                rangeXp={earnedXp}
                rangeXpReady={earnedReady}
                studyPartsByUser={studyByUser}
                practicePartsByUser={practiceByUser}
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
