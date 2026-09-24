"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  projectStudentDetail,
  projectStudentVisits,
  type AdminActivityCard,
  type AdminCatalogCourse,
  type AdminCourseDetail,
  type AdminLessonDetail,
  type AdminVideoDetail,
  type AdminVisitRange,
  type AdminVisitRow,
} from "@/lib/admin-detail";
import { formatActiveDuration } from "@/lib/progress";
import type { AdminUserRow } from "@/lib/admin-overview";

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

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function compactDuration(label: string): string {
  return label
    .replace("under 1 min", "<1m")
    .replace(/(\d+)\s+h\s+(\d+)\s+min/g, "$1h $2m")
    .replace(/(\d+)\s+h/g, "$1h")
    .replace(/(\d+)\s+min/g, "$1m");
}

function splitVisitHeadline(headline: string): { day: string; time: string; duration: string } {
  const parts = headline.split(" · ");
  if (parts.length >= 3) {
    return {
      day: parts[0] ?? headline,
      time: parts[1] ?? "",
      duration: compactDuration(parts.slice(2).join(" · ")),
    };
  }
  return { day: headline, time: "", duration: "" };
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] border border-black/[0.06] bg-surface-container-lowest shadow-[0_1px_2px_rgba(27,27,29,0.04),0_12px_32px_rgba(27,27,29,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

function MetricBand({
  items,
  columns = "four",
}: {
  items: { label: string; value: string; detail?: string | null }[];
  columns?: "four" | "two";
}) {
  return (
    <Panel>
      <div className={columns === "two" ? "grid grid-cols-2" : "grid grid-cols-2 lg:grid-cols-4"}>
        {items.map((item, index) => {
          const edge =
            columns === "two"
              ? `${index % 2 === 0 ? "border-r border-black/[0.06]" : ""} ${index < items.length - 2 ? "border-b border-black/[0.06]" : ""}`
              : `${index % 2 === 0 ? "border-r border-black/[0.06]" : ""} ${index < 2 ? "border-b border-black/[0.06] lg:border-b-0" : ""} ${index % 4 !== 3 ? "lg:border-r lg:border-black/[0.06]" : ""}`;
          return (
            <div key={item.label} className={`min-w-0 px-5 py-5 sm:px-6 sm:py-6 ${edge}`}>
              <p className="font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                {item.label}
              </p>
              <p className="mt-2 whitespace-nowrap font-headline-lg text-[1.65rem] font-semibold leading-none tracking-[-0.03em] text-on-surface tabular-nums sm:text-[2rem]">
                {item.value}
              </p>
              <p className="mt-2 min-h-4 truncate font-caption text-caption text-on-surface-variant">
                {item.detail ?? "\u00a0"}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CircleMeter({
  percent,
  center,
  icon,
  accessibleLabel,
  detail,
  struggling = false,
  itemClassName = "w-24",
}: {
  percent: number;
  center: string;
  icon: string;
  accessibleLabel: string;
  detail?: string | null;
  struggling?: boolean;
  itemClassName?: string;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  const progressColor = clamped >= 100 ? "#34C759" : struggling ? "#ff9500" : "#0071e3";

  return (
    <li className={`flex flex-col items-center gap-1 text-center ${itemClassName}`} aria-label={accessibleLabel}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#eae7ea" strokeWidth="3.5" />
          {clamped > 0 ? (
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke={progressColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          ) : null}
        </svg>
        <MaterialIcon name={icon} className="text-[22px] text-[#0066cc]" filled />
      </div>
      {center ? (
        <span className="max-w-full break-words font-label-sm text-label-sm font-semibold leading-tight text-on-surface">
          {center}
        </span>
      ) : null}
      {detail ? (
        <span
          className={`font-caption text-caption leading-tight ${
            struggling ? "font-semibold text-[#9a6700]" : "text-on-surface-variant"
          }`}
        >
          {detail}
        </span>
      ) : null}
    </li>
  );
}

function activityIcon(activity: AdminActivityCard): string {
  return activity.id.endsWith("-study") ? "menu_book" : "headphones";
}

function ActivityMeter({
  activity,
  itemClassName,
}: {
  activity: AdminActivityCard;
  itemClassName?: string;
}) {
  return (
    <CircleMeter
      percent={activity.percent}
      center={activity.progressLabel}
      icon={activityIcon(activity)}
      accessibleLabel={`${activity.label}${activity.progressLabel ? ` ${activity.progressLabel}` : ", completed"}${activity.note ? `, ${activity.note}` : ""}`}
      detail={activity.note}
      struggling={activity.struggling}
      itemClassName={itemClassName}
    />
  );
}

function videoCenter(video: AdminVideoDetail): string {
  if (video.status === "watched") return "";
  if (video.status === "in-progress") return formatClock(video.positionSeconds);
  return "0%";
}

function VideoMeter({
  video,
  caption = "status",
}: {
  video: AdminVideoDetail;
  caption?: "status" | "title";
}) {
  const completed = video.status === "watched";
  const statusLabel = completed ? null : video.status === "in-progress" ? "In progress" : "Not started";
  const showTitle = caption === "title";

  return (
    <CircleMeter
      percent={completed ? 100 : 0}
      center={showTitle ? video.title : videoCenter(video)}
      icon="smart_display"
      accessibleLabel={
        completed
          ? `${video.title}, watched`
          : `${video.title}, ${statusLabel}${video.status === "in-progress" ? ` ${formatClock(video.positionSeconds)}` : ""}`
      }
      detail={showTitle ? null : statusLabel}
      itemClassName={showTitle ? "w-full min-w-0" : "w-24"}
    />
  );
}

export function LessonContentMeters({
  lesson,
  videoCaption = "status",
}: {
  lesson: AdminLessonDetail;
  videoCaption?: "status" | "title";
}) {
  if (lesson.activities.length === 0 && lesson.videos.length === 0) return null;

  const aligned = videoCaption === "title";

  return (
    <ul
      className={
        aligned
          ? "grid w-full justify-start gap-x-space-12 gap-y-space-16 [grid-template-columns:repeat(auto-fill,7.5rem)]"
          : "flex flex-wrap items-start gap-x-space-12 gap-y-space-16"
      }
    >
      {lesson.videos.map((video) => (
        <VideoMeter key={video.id} video={video} caption={videoCaption} />
      ))}
      {lesson.activities.map((activity) => (
        <ActivityMeter
          key={activity.id}
          activity={activity}
          itemClassName={aligned ? "w-full min-w-0" : undefined}
        />
      ))}
    </ul>
  );
}

function LessonBlock({ lesson }: { lesson: AdminLessonDetail }) {
  const when = formatAbsoluteTime(lesson.lastActivityAt);
  const hasMeters = lesson.activities.length > 0 || lesson.videos.length > 0;

  return (
    <div
      className={`overflow-hidden rounded-[20px] border bg-surface-container-lowest shadow-[0_1px_2px_rgba(27,27,29,0.04)] ${
        lesson.struggling ? "border-[#ff9500] ring-1 ring-[#ff9500]" : "border-black/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between gap-space-8 border-b border-outline-variant/20 bg-surface-container-low px-space-16 py-space-12">
        <div className="flex items-center gap-space-8">
          {lesson.status === "completed" ? (
            <MaterialIcon name="check_circle" className="text-[18px] text-[#34C759]" filled />
          ) : lesson.status === "in-progress" ? (
            <MaterialIcon name="pending" className="text-[18px] text-primary" />
          ) : (
            <MaterialIcon name="radio_button_unchecked" className="text-[18px] text-outline-variant" />
          )}
          <h4 className="font-label-md text-label-md font-semibold text-on-surface">{lesson.label}</h4>
        </div>
        <span className="shrink-0 font-caption text-caption font-medium text-on-surface-variant">
          {when ?? "No date"}
        </span>
      </div>
      <div className="px-space-16 py-space-16">
        {hasMeters ? (
          <LessonContentMeters lesson={lesson} />
        ) : (
          <p className="font-body-sm text-body-sm text-outline">No cards in this lesson.</p>
        )}
      </div>
    </div>
  );
}

function visibleLessons(course: AdminCourseDetail): AdminLessonDetail[] {
  return course.lessons.filter(
    (lesson) =>
      lesson.totalCount > 0 ||
      lesson.videos.length > 0 ||
      lesson.status !== "not-started",
  );
}

const VISIT_RANGES: { id: AdminVisitRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "all", label: "All time" },
];

function VisitRangeSwitch({
  range,
  onChange,
}: {
  range: AdminVisitRange;
  onChange: (range: AdminVisitRange) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full bg-black/[0.06] p-1"
      role="group"
      aria-label="Visit range"
    >
      {VISIT_RANGES.map((option) => {
        const selected = option.id === range;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3.5 py-1.5 font-label-sm text-label-sm font-semibold transition-colors ${
              selected
                ? "bg-surface-container-lowest text-on-surface shadow-[0_1px_2px_rgba(27,27,29,0.12)]"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function VisitRow({
  visit,
  open,
  onToggle,
}: {
  visit: AdminVisitRow;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = visit.details.length > 0;
  const { day, time, duration } = splitVisitHeadline(visit.headline);
  const idle = visit.lines.length === 1 && visit.lines[0]?.startsWith("Opened the app");
  const lessonLine = idle ? null : (visit.lines[0] ?? null);
  const facts = idle ? [] : visit.lines.slice(1);

  return (
    <li>
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? onToggle : undefined}
        className={`flex w-full items-start gap-space-16 px-5 py-5 text-left sm:px-6 ${expandable ? "hover:bg-black/[0.02]" : "cursor-default"}`}
      >
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            idle ? "bg-surface-container text-outline" : "bg-primary-fixed text-on-primary-fixed"
          }`}
        >
          <MaterialIcon name={idle ? "hourglass_empty" : "menu_book"} className="text-[20px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-space-12">
            <span className="font-label-md text-label-md font-semibold text-on-surface">{day}</span>
            {duration ? (
              <span className="shrink-0 font-label-md text-label-md font-semibold tabular-nums text-on-surface">
                {duration}
              </span>
            ) : null}
          </span>
          {time ? (
            <span className="mt-0.5 block font-body-sm text-body-sm text-outline">{time}</span>
          ) : null}
          {idle ? (
            <span className="mt-2 block font-body-sm text-body-sm text-on-surface-variant">
              {visit.lines[0]}
            </span>
          ) : lessonLine ? (
            <span className="mt-2 block font-body-md text-body-md text-on-surface">{lessonLine}</span>
          ) : null}
          {facts.length > 0 ? (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {facts.map((fact) => (
                <span
                  key={fact}
                  className="rounded-full bg-surface-container-low px-2.5 py-1 font-caption text-caption font-medium text-on-surface-variant"
                >
                  {fact}
                </span>
              ))}
            </span>
          ) : null}
          {visit.signal ? (
            <span className="mt-3 inline-flex rounded-full bg-primary-fixed px-2.5 py-1 font-caption text-caption font-semibold text-on-primary-fixed">
              {visit.signal}
            </span>
          ) : null}
        </span>
        {expandable ? (
          <MaterialIcon
            name={open ? "expand_less" : "expand_more"}
            className="mt-1 text-[22px] text-outline"
          />
        ) : (
          <span className="w-[22px] shrink-0" aria-hidden="true" />
        )}
      </button>
      {open && visit.details.length > 0 ? (
        <div className="flex flex-col gap-space-16 border-t border-black/[0.06] bg-[#f5f5f7]/80 px-5 py-5 sm:px-6 sm:pl-[4.75rem]">
          {visit.details.map((group) => (
            <div key={group.id}>
              <p className="font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                {group.label}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {group.items.map((item, index) => (
                  <li key={`${group.id}-${index}`} className="font-body-sm text-body-sm text-on-surface">
                    {item}
                  </li>
                ))}
              </ul>
              {group.extraCount > 0 ? (
                <p className="mt-1 font-body-sm text-body-sm text-outline">+{group.extraCount} more</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function StudentDetailModal({
  row,
  catalog,
  onClose,
}: {
  row: AdminUserRow;
  catalog: readonly AdminCatalogCourse[];
  onClose: () => void;
}) {
  const detail = useMemo(
    () => projectStudentDetail(catalog, row.progress),
    [catalog, row.progress],
  );
  const [courseId, setCourseId] = useState(detail.startedCourses[0]?.id ?? "");
  const course =
    detail.startedCourses.find((entry) => entry.id === courseId) ??
    detail.startedCourses[0];
  const lessons = course ? visibleLessons(course) : [];
  const [range, setRange] = useState<AdminVisitRange>("7d");
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const visitLog = useMemo(
    () => projectStudentVisits(catalog, row.progress, range),
    [catalog, row.progress, range],
  );
  const lastLogin = formatAbsoluteTime(row.lastSignInAt);
  const lastSeen = formatAbsoluteTime(row.lastLoginAt);
  const summary = visitLog.summary;
  const signIns = [...row.signIns].reverse();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const identityFacts = [
    row.email && row.email !== row.displayName ? { label: "Email", value: row.email } : null,
    { label: "Sign-in", value: lastLogin ?? "No sign-in recorded" },
    lastSeen ? { label: "Last seen", value: lastSeen } : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center sm:p-6 lg:p-10"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#f5f5f7] shadow-2xl sm:max-h-[min(960px,94dvh)] sm:max-w-[1120px] sm:rounded-[28px] xl:max-w-[1240px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-surface-container-lowest px-5 py-5 sm:px-8">
          <div className="flex items-start justify-between gap-space-16">
            <div className="flex min-w-0 flex-1 items-start gap-space-16">
              <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-primary font-headline-md text-[1.65rem] font-semibold uppercase text-on-primary">
                {row.displayName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-space-8">
                  <p className="font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                    Student
                  </p>
                  {row.className ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface">
                      <MaterialIcon name="school" className="text-[14px]" />
                      {row.className}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-space-4 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                    <MaterialIcon
                      name="local_fire_department"
                      className={`text-[16px] ${row.streakDays > 0 ? "text-[#ff9500]" : "text-outline"}`}
                      filled={row.streakDays > 0}
                    />
                    {row.streakDays} {row.streakDays === 1 ? "day" : "days"}
                  </span>
                </div>
                <h2
                  id="student-detail-title"
                  className="mt-1 truncate font-headline-lg text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-on-surface"
                >
                  {row.displayName}
                </h2>
                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                  {identityFacts.map((fact) => (
                    <div key={fact.label} className="min-w-0">
                      <dt className="font-caption text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                        {fact.label}
                      </dt>
                      <dd className="mt-0.5 max-w-[280px] truncate font-body-sm text-body-sm text-on-surface">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-on-surface transition-colors hover:bg-black/[0.08]"
            >
              <MaterialIcon name="close" className="text-[20px]" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          <section aria-label="Visits">
            <div className="flex flex-wrap items-center justify-between gap-space-12">
              <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                Visits
              </h3>
              <VisitRangeSwitch range={range} onChange={setRange} />
            </div>
            <div className="mt-4">
              <MetricBand
                items={[
                  {
                    label: "Active time",
                    value: compactDuration(formatActiveDuration(summary.activeSeconds)),
                    detail: `${summary.visitCount} ${summary.visitCount === 1 ? "visit" : "visits"}`,
                  },
                  {
                    label: "Clips studied",
                    value: String(summary.clipCount),
                  },
                  {
                    label: "Audio exercises",
                    value: String(summary.exercisesCompleted),
                    detail: `${summary.listeningRuns} full ${summary.listeningRuns === 1 ? "run" : "runs"}`,
                  },
                  {
                    label: "Video",
                    value: compactDuration(formatActiveDuration(summary.videoSeconds)),
                    detail: `${summary.videosWatched} marked watched`,
                  },
                ]}
              />
            </div>
          </section>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.85fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <section aria-label="Visit log">
                {visitLog.visits.length === 0 ? (
                  <Panel>
                    <p className="px-6 py-12 text-center font-body-md text-body-md text-on-surface-variant">
                      {visitLog.emptyMessage}
                    </p>
                  </Panel>
                ) : (
                  <Panel>
                    <ul className="divide-y divide-black/[0.06]">
                      {visitLog.visits.map((visit) => (
                        <VisitRow
                          key={visit.id}
                          visit={visit}
                          open={openVisitId === visit.id}
                          onToggle={() =>
                            setOpenVisitId((current) => (current === visit.id ? null : visit.id))
                          }
                        />
                      ))}
                    </ul>
                  </Panel>
                )}
              </section>

              <section aria-label="Sign-ins">
                <h3 className="px-1 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                  Sign-ins
                </h3>
                <Panel className="mt-4">
                  {signIns.length === 0 ? (
                    <p className="px-6 py-5 font-body-sm text-body-sm text-on-surface-variant">
                      No sign-ins recorded yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-black/[0.06]">
                      {signIns.slice(0, 8).map((stamp) => (
                        <li
                          key={stamp}
                          className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
                        >
                          <MaterialIcon name="login" className="text-[18px] text-outline" />
                          <time
                            dateTime={stamp}
                            className="font-body-sm text-body-sm text-on-surface"
                          >
                            {formatAbsoluteTime(stamp)}
                          </time>
                        </li>
                      ))}
                      {signIns.length > 8 ? (
                        <li className="px-5 py-3 font-body-sm text-body-sm text-outline sm:px-6">
                          +{signIns.length - 8} more
                        </li>
                      ) : null}
                    </ul>
                  )}
                </Panel>
              </section>
            </div>

            <section aria-label="Progress" className="min-w-0">
              <h3 className="px-1 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                Progress
              </h3>
              <div className="mt-4">
                <MetricBand
                  columns="two"
                  items={[
                    { label: "Courses", value: String(detail.coursesStarted) },
                    { label: "Lessons", value: String(detail.lessonsCompleted) },
                    { label: "Listening", value: String(detail.listeningRepetitions) },
                    { label: "Videos", value: String(detail.videosWatched) },
                  ]}
                />
              </div>

              {detail.startedCourses.length === 0 ? (
                <Panel className="mt-4">
                  <p className="px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
                    This student has not started a course yet.
                  </p>
                </Panel>
              ) : (
                <>
                  <div
                    role="tablist"
                    aria-label="Courses"
                    className="mt-4 overflow-hidden rounded-[22px] border border-black/[0.06] bg-surface-container-lowest shadow-[0_1px_2px_rgba(27,27,29,0.04),0_12px_32px_rgba(27,27,29,0.05)]"
                  >
                    {detail.startedCourses.map((entry) => {
                      const selected = entry.id === course?.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => setCourseId(entry.id)}
                          className={`flex w-full flex-col border-b border-black/[0.06] px-5 py-3.5 text-left last:border-b-0 ${
                            selected ? "bg-primary-fixed" : "hover:bg-black/[0.02]"
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span
                              className={`min-w-0 font-label-md text-label-md ${
                                selected ? "font-bold text-on-primary-fixed" : "font-semibold text-on-surface"
                              }`}
                            >
                              {entry.shortLabel}
                            </span>
                            <span
                              className={`shrink-0 font-label-sm text-label-sm font-semibold tabular-nums ${
                                selected ? "text-primary" : "text-on-surface-variant"
                              }`}
                            >
                              {entry.percent}%
                            </span>
                          </span>
                          <span
                            className={`mt-2 block h-1.5 overflow-hidden rounded-full ${
                              selected ? "bg-primary-fixed-dim" : "bg-surface-container-highest"
                            }`}
                          >
                            <span
                              className={`block h-full rounded-full ${selected ? "bg-primary" : "bg-outline"}`}
                              style={{ width: `${entry.percent}%` }}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {course ? (
                    <div className="mt-6 flex flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-3 px-1">
                        <h4 className="min-w-0 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                          {course.label}
                        </h4>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-caption text-caption font-semibold text-on-surface-variant">
                          {lessons.filter((lesson) => lesson.status === "completed").length}/
                          {lessons.length} done
                        </span>
                      </div>
                      {lessons.length === 0 ? (
                        <p className="px-1 font-body-sm text-body-sm text-outline">
                          No lessons with content in this course yet.
                        </p>
                      ) : (
                        lessons.map((lesson) => <LessonBlock key={lesson.id} lesson={lesson} />)
                      )}
                    </div>
                  ) : null}
                </>
              )}

              {detail.notStartedLabels.length > 0 ? (
                <p className="mt-5 px-1 font-body-sm text-body-sm text-outline">
                  Not started: {detail.notStartedLabels.join(", ")}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
