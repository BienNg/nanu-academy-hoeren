"use client";

import { useEffect, useMemo, useState } from "react";
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

function SummaryStat({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string | number;
  icon: string;
  detail?: string | null;
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
      <p className="mt-space-12 font-headline-lg text-headline-lg text-on-surface">{value}</p>
      {detail ? (
        <p className="mt-1 font-caption text-caption text-on-surface-variant">{detail}</p>
      ) : null}
    </div>
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
      className={`overflow-hidden rounded-2xl border bg-surface-container-lowest shadow-sm ${
        lesson.struggling ? "border-[#ff9500] ring-1 ring-[#ff9500]" : "border-outline-variant/30"
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
    <div className="inline-flex rounded-full bg-surface-container-low p-1" role="group" aria-label="Visit range">
      {VISIT_RANGES.map((option) => {
        const selected = option.id === range;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-semibold transition-colors ${
              selected
                ? "bg-surface-container-lowest text-on-surface shadow-sm"
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
  return (
    <li className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        onClick={expandable ? onToggle : undefined}
        className={`flex w-full items-start gap-space-12 px-space-16 py-space-16 text-left ${expandable ? "" : "cursor-default"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-label-md text-label-md font-semibold text-on-surface">
            {visit.headline}
          </span>
          {visit.lines.map((line, index) => (
            <span
              key={`${visit.id}-${index}`}
              className="mt-1 block font-body-sm text-body-sm text-on-surface-variant"
            >
              {line}
            </span>
          ))}
          {visit.signal ? (
            <span className="mt-space-8 block font-body-sm text-body-sm font-semibold text-primary">
              {visit.signal}
            </span>
          ) : null}
        </span>
        {expandable ? (
          <MaterialIcon name={open ? "expand_less" : "expand_more"} className="text-[22px] text-on-surface-variant" />
        ) : null}
      </button>
      {open && visit.details.length > 0 ? (
        <div className="flex flex-col gap-space-16 border-t border-outline-variant/20 px-space-16 py-space-16">
          {visit.details.map((group) => (
            <div key={group.id}>
              <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                {group.label}
              </p>
              <ul className="mt-space-8 flex flex-col gap-1">
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:px-space-24 sm:py-space-24"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl sm:max-h-[min(900px,90dvh)] sm:max-w-3xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest px-space-20 py-space-16 sm:px-space-24">
          <div className="flex items-start justify-between gap-space-16">
            <div className="flex min-w-0 flex-1 items-center gap-space-16">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary font-headline-md text-headline-md uppercase text-on-primary shadow-sm">
                {row.displayName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-space-8">
                  <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
                    Student
                  </p>
                  {row.className ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-surface">
                      <MaterialIcon name="school" className="text-[14px]" />
                      {row.className}
                    </span>
                  ) : null}
                  <span className="h-1 w-1 rounded-full bg-outline-variant/50" />
                  <span className="inline-flex items-center gap-space-4 font-label-sm text-label-sm font-semibold text-on-surface-variant">
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
                  className="mt-1 truncate font-headline-md text-headline-md text-on-surface"
                >
                  {row.displayName}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-space-8 gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
                  {row.email && row.email !== row.displayName ? (
                    <span className="truncate">{row.email}</span>
                  ) : null}
                  {row.email && row.email !== row.displayName && lastLogin ? (
                    <span className="h-1 w-1 rounded-full bg-outline-variant/50" />
                  ) : null}
                  <span>{lastLogin ? `Last login ${lastLogin}` : "No sign-in recorded"}</span>
                  {lastSeen ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-outline-variant/50" />
                      <span>{`Last seen ${lastSeen}`}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-low text-on-surface transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="close" className="text-[20px]" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-space-20 py-space-16 sm:px-space-24">
          <section aria-label="Visits">
            <div className="flex flex-wrap items-center justify-between gap-space-12">
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Visits</h3>
              <VisitRangeSwitch range={range} onChange={setRange} />
            </div>
            <div className="mt-space-16 grid grid-cols-2 gap-space-12 sm:grid-cols-4">
              <SummaryStat
                label="Active time"
                value={formatActiveDuration(summary.activeSeconds)}
                detail={`${summary.visitCount} ${summary.visitCount === 1 ? "visit" : "visits"}`}
                icon="schedule"
              />
              <SummaryStat label="Clips studied" value={summary.clipCount} icon="menu_book" />
              <SummaryStat
                label="Audio exercises"
                value={summary.exercisesCompleted}
                detail={`${summary.listeningRuns} full ${summary.listeningRuns === 1 ? "run" : "runs"}`}
                icon="headphones"
              />
              <SummaryStat
                label="Video"
                value={formatActiveDuration(summary.videoSeconds)}
                detail={`${summary.videosWatched} marked watched`}
                icon="smart_display"
              />
            </div>
            {visitLog.visits.length === 0 ? (
              <p className="py-space-24 text-center font-body-md text-body-md text-on-surface-variant">
                {visitLog.emptyMessage}
              </p>
            ) : (
              <ul className="mt-space-16 flex flex-col gap-space-12">
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
            )}
            <div className="mt-space-20">
              <h4 className="font-label-md text-label-md font-semibold text-on-surface">Sign-ins</h4>
              {signIns.length === 0 ? (
                <p className="mt-space-8 font-body-sm text-body-sm text-on-surface-variant">
                  No sign-ins recorded yet.
                </p>
              ) : (
                <ul className="mt-space-8 flex flex-col gap-1">
                  {signIns.slice(0, 8).map((stamp) => (
                    <li key={stamp} className="font-body-sm text-body-sm text-on-surface-variant">
                      <time dateTime={stamp}>{formatAbsoluteTime(stamp)}</time>
                    </li>
                  ))}
                  {signIns.length > 8 ? (
                    <li className="font-body-sm text-body-sm text-outline">+{signIns.length - 8} more</li>
                  ) : null}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Progress" className="mt-space-24">
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Progress</h3>
            <div className="mt-space-16 grid grid-cols-2 gap-space-12 sm:grid-cols-4">
              <SummaryStat label="Courses" value={detail.coursesStarted} icon="menu_book" />
              <SummaryStat label="Lessons" value={detail.lessonsCompleted} icon="check_circle" />
              <SummaryStat label="Listening" value={detail.listeningRepetitions} icon="headphones" />
              <SummaryStat label="Videos" value={detail.videosWatched} icon="smart_display" />
            </div>
            {detail.startedCourses.length === 0 ? (
              <p className="py-space-24 text-center font-body-md text-body-md text-on-surface-variant">
                This student has not started a course yet.
              </p>
            ) : (
            <>
              <div
                role="tablist"
                aria-label="Courses"
                className="flex gap-space-8 overflow-x-auto pb-space-8 pt-space-4"
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
                      className={`relative flex min-w-[160px] shrink-0 flex-col justify-center overflow-hidden rounded-xl border px-space-16 py-space-12 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary-fixed text-on-primary-fixed ring-1 ring-primary"
                          : "border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      <span className={`block font-label-md text-label-md ${selected ? "font-bold" : "font-semibold"}`}>
                        {entry.shortLabel}
                      </span>
                      <div className="mt-space-8 flex items-center gap-space-8">
                        <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${selected ? "bg-primary-fixed-dim" : "bg-surface-container-highest"}`}>
                          <div
                            className={`h-full rounded-full ${selected ? "bg-primary" : "bg-outline"}`}
                            style={{ width: `${entry.percent}%` }}
                          />
                        </div>
                        <span className={`font-caption text-caption font-semibold ${selected ? "text-primary" : "text-on-surface-variant"}`}>
                          {entry.percent}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {course ? (
                <div className="mt-space-24 flex flex-col gap-space-12">
                  <div className="flex items-baseline justify-between gap-space-8 px-space-4">
                    <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                      {course.label}
                    </h3>
                    <span className="font-label-sm text-label-sm font-medium text-on-surface-variant bg-surface-container-low px-space-8 py-space-4 rounded-full">
                      {lessons.filter((lesson) => lesson.status === "completed").length}/{lessons.length} lessons completed
                    </span>
                  </div>
                  {lessons.length === 0 ? (
                    <p className="font-body-sm text-body-sm text-outline">
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
            <p className="mt-space-20 font-body-sm text-body-sm text-outline">
              Not started: {detail.notStartedLabels.join(", ")}
            </p>
          ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
