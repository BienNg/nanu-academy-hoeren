"use client";

import { useEffect, useMemo, useState } from "react";
import {
  projectStudentDetail,
  type AdminActivityCard,
  type AdminCatalogCourse,
  type AdminCourseDetail,
  type AdminLessonDetail,
  type AdminVideoDetail,
} from "@/lib/admin-detail";
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

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div
        className={`h-full rounded-full ${percent >= 100 ? "bg-[#34C759]" : "bg-primary-container"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-container-low px-space-16 py-space-12">
      <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-space-4 font-headline-sm text-headline-sm text-on-surface">{value}</p>
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
}: {
  percent: number;
  center: string;
  icon: string;
  accessibleLabel: string;
  detail?: string | null;
  struggling?: boolean;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  const progressColor = clamped >= 100 ? "#34C759" : struggling ? "#ff9500" : "#0071e3";

  return (
    <li className="flex w-24 flex-col items-center gap-1 text-center" aria-label={accessibleLabel}>
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
      <span className="font-label-sm text-label-sm font-semibold leading-tight text-on-surface">
        {center}
      </span>
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

function ActivityMeter({ activity }: { activity: AdminActivityCard }) {
  return (
    <CircleMeter
      percent={activity.percent}
      center={activity.progressLabel}
      icon={activityIcon(activity)}
      accessibleLabel={`${activity.label} ${activity.progressLabel}${activity.note ? `, ${activity.note}` : ""}`}
      detail={activity.note}
      struggling={activity.struggling}
    />
  );
}

function videoCenter(video: AdminVideoDetail): string {
  if (video.status === "watched") return "100%";
  if (video.status === "in-progress") return formatClock(video.positionSeconds);
  return "0%";
}

function VideoMeter({ video }: { video: AdminVideoDetail }) {
  const percent = video.status === "watched" ? 100 : 0;
  const detail =
    video.status === "watched"
      ? "Watched"
      : video.status === "in-progress"
        ? "In progress"
        : "Not started";

  return (
    <CircleMeter
      percent={percent}
      center={videoCenter(video)}
      icon="smart_display"
      accessibleLabel={`${video.title}, ${detail}${video.status === "in-progress" ? ` ${videoCenter(video)}` : ""}`}
      detail={detail}
    />
  );
}

function LessonBlock({ lesson }: { lesson: AdminLessonDetail }) {
  const when = formatAbsoluteTime(lesson.lastActivityAt);
  const hasMeters = lesson.activities.length > 0 || lesson.videos.length > 0;

  return (
    <div
      className={`rounded-2xl border bg-surface-container-lowest px-space-16 py-space-12 ${
        lesson.struggling ? "border-[#ff9500]" : "border-outline-variant/30"
      }`}
    >
      <div className="flex items-baseline justify-between gap-space-8">
        <h4 className="font-label-md text-label-md font-semibold text-on-surface">{lesson.label}</h4>
        <span className="shrink-0 font-caption text-caption text-on-surface-variant">
          {when ?? "No date saved"}
        </span>
      </div>
      {hasMeters ? (
        <ul className="mt-space-12 flex flex-wrap items-start gap-x-space-8 gap-y-space-12">
          {lesson.videos.map((video) => (
            <VideoMeter key={video.id} video={video} />
          ))}
          {lesson.activities.map((activity) => (
            <ActivityMeter key={activity.id} activity={activity} />
          ))}
        </ul>
      ) : (
        <p className="mt-space-8 font-body-sm text-body-sm text-outline">No cards in this lesson.</p>
      )}
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
  const lastLogin = formatAbsoluteTime(row.lastLoginAt);

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
          <div className="flex items-start justify-between gap-space-12">
            <div className="min-w-0">
              <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
                Student
              </p>
              <h2
                id="student-detail-title"
                className="truncate font-headline-sm text-headline-sm text-on-surface"
              >
                {row.displayName}
              </h2>
              {row.email && row.email !== row.displayName ? (
                <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
                  {row.email}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="close" className="text-[22px]" />
            </button>
          </div>
          <div className="mt-space-12 flex flex-wrap gap-x-space-16 gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
            <span>{lastLogin ? `Last login ${lastLogin}` : "Never logged in"}</span>
            <span className="inline-flex items-center gap-space-4">
              <MaterialIcon
                name="local_fire_department"
                className={`text-[16px] ${row.streakDays > 0 ? "text-[#ff9500]" : "text-outline"}`}
                filled={row.streakDays > 0}
              />
              {row.streakDays} {row.streakDays === 1 ? "day" : "days"}
            </span>
          </div>
          <div className="mt-space-16 grid grid-cols-2 gap-space-8 sm:grid-cols-4">
            <SummaryStat label="Courses started" value={detail.coursesStarted} />
            <SummaryStat label="Lessons completed" value={detail.lessonsCompleted} />
            <SummaryStat label="Listening runs" value={detail.listeningRepetitions} />
            <SummaryStat label="Videos watched" value={detail.videosWatched} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-space-20 py-space-16 sm:px-space-24">
          {detail.startedCourses.length === 0 ? (
            <p className="py-space-24 text-center font-body-md text-body-md text-on-surface-variant">
              This student has not started a course yet.
            </p>
          ) : (
            <>
              <div
                role="tablist"
                aria-label="Courses"
                className="flex gap-space-8 overflow-x-auto pb-space-4"
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
                      className={`shrink-0 rounded-full px-space-12 py-space-8 text-left transition-colors ${
                        selected
                          ? "bg-primary-container text-on-primary-container"
                          : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                    >
                      <span className="block font-label-md text-label-md font-semibold">
                        {entry.shortLabel}
                      </span>
                      <span className="block font-caption text-caption opacity-80">
                        {entry.percent}%
                      </span>
                    </button>
                  );
                })}
              </div>

              {course ? (
                <div className="mt-space-16 flex flex-col gap-space-12">
                  <div>
                    <div className="flex items-baseline justify-between gap-space-8">
                      <h3 className="font-label-md text-label-md font-semibold text-on-surface">
                        {course.label}
                      </h3>
                      <span className="font-caption text-caption text-on-surface-variant">
                        {lessons.filter((lesson) => lesson.status === "completed").length}/{lessons.length} lessons · {course.percent}%
                      </span>
                    </div>
                    <div className="mt-space-8">
                      <ProgressBar percent={course.percent} />
                    </div>
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
        </div>
      </div>
    </div>
  );
}
