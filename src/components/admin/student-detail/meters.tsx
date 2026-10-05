"use client";

import type { ReactNode } from "react";
import { MaterialIcon } from "@/components/admin/AdminShell";
import {
  DeleteProgressButton,
  formatAbsoluteTime,
  formatClock,
} from "@/components/admin/student-detail/shared";
import type {
  AdminActivityCard,
  AdminCourseDetail,
  AdminLessonDetail,
  AdminVideoDetail,
  StudentProgressPart,
} from "@/lib/admin-detail";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { isStudyActivityId, lessonNodeFromActivityId } from "@/lib/progress";

function CircleMeter({
  percent,
  center,
  icon,
  accessibleLabel,
  detail,
  struggling = false,
  itemClassName = "w-24",
  action,
}: {
  percent: number;
  center: string;
  icon: string;
  accessibleLabel: string;
  detail?: string | null;
  struggling?: boolean;
  itemClassName?: string;
  action?: ReactNode;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);
  const progressColor =
    clamped >= 100 ? ADMIN_COLORS.emerald : struggling ? ADMIN_COLORS.amber : ADMIN_COLORS.cobalt;

  return (
    <li className={`flex flex-col items-center gap-1 text-center ${itemClassName}`} aria-label={accessibleLabel}>
      <div className="relative flex h-14 w-14 items-center justify-center">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={radius} fill="none" stroke={ADMIN_COLORS.hairline} strokeWidth="3" />
          {clamped > 0 ? (
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke={progressColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          ) : null}
        </svg>
        <span className="flex" style={{ color: clamped >= 100 ? ADMIN_COLORS.emerald : ADMIN_COLORS.cobalt }}>
          <MaterialIcon name={icon} className="text-[20px]" filled />
        </span>
      </div>
      {center ? (
        <span className="max-w-full break-words text-admin-label-md font-semibold leading-tight text-admin-ink">
          {center}
        </span>
      ) : null}
      {detail ? (
        <span
          className={`text-[11px] leading-[14px] ${
            struggling ? "font-semibold text-admin-amber-ink" : "text-admin-ink-subtle"
          }`}
        >
          {detail}
        </span>
      ) : null}
      {action}
    </li>
  );
}

function activityIcon(activity: AdminActivityCard): string {
  return isStudyActivityId(activity.id) ? "menu_book" : "headphones";
}

function ActivityMeter({
  activity,
  itemClassName,
  action,
}: {
  activity: AdminActivityCard;
  itemClassName?: string;
  action?: ReactNode;
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
      action={action}
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
  action,
}: {
  video: AdminVideoDetail;
  caption?: "status" | "title";
  action?: ReactNode;
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
      action={action}
    />
  );
}

export function LessonContentMeters({
  lesson,
  videoCaption = "status",
  onDeletePart,
}: {
  lesson: AdminLessonDetail;
  videoCaption?: "status" | "title";
  onDeletePart?: (part: StudentProgressPart, label: string) => void;
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
        <VideoMeter
          key={video.id}
          video={video}
          caption={videoCaption}
          action={
            onDeletePart && video.status !== "not-started" ? (
              <DeleteProgressButton
                label={`Delete ${video.title} progress`}
                className="mt-1 h-7 w-7"
                onClick={() => onDeletePart({ videoId: video.id }, video.title)}
              />
            ) : null
          }
        />
      ))}
      {lesson.activities.map((activity) => {
        const trailNode = lessonNodeFromActivityId(activity.id);
        const part: StudentProgressPart | null = trailNode
          ? trailNode.kind === "study"
            ? "study"
            : "listening"
          : null;
        // Deleting clears that kind for the whole Lektion, so only the first node offers it.
        const showStudyDelete = trailNode?.node === 1;
        return (
          <ActivityMeter
            key={activity.id}
            activity={activity}
            itemClassName={aligned ? "w-full min-w-0" : undefined}
            action={
              onDeletePart && part && showStudyDelete && activity.status !== "not-started" ? (
                <DeleteProgressButton
                  label={`Delete ${activity.label} progress`}
                  className="mt-1 h-7 w-7"
                  onClick={() => onDeletePart(part, activity.label)}
                />
              ) : null
            }
          />
        );
      })}
    </ul>
  );
}

export function LessonBlock({
  lesson,
  onDeleteLesson,
  onDeletePart,
}: {
  lesson: AdminLessonDetail;
  onDeleteLesson?: () => void;
  onDeletePart?: (part: StudentProgressPart, label: string) => void;
}) {
  const when = formatAbsoluteTime(lesson.lastActivityAt);
  const hasMeters = lesson.activities.length > 0 || lesson.videos.length > 0;

  return (
    <div
      className={`overflow-hidden rounded-admin-card border bg-admin-card shadow-admin-card ${
        lesson.struggling ? "border-admin-amber ring-1 ring-admin-amber" : "border-admin-hairline"
      }`}
    >
      <div className="flex items-center justify-between gap-space-8 border-b border-admin-hairline bg-admin-canvas px-space-16 py-space-8">
        <div className="flex min-w-0 items-center gap-space-8">
          {lesson.status === "completed" ? (
            <MaterialIcon name="check_circle" className="text-[18px] text-admin-emerald" filled />
          ) : lesson.status === "in-progress" ? (
            <MaterialIcon name="pending" className="text-[18px] text-admin-cobalt" />
          ) : (
            <MaterialIcon name="radio_button_unchecked" className="text-[18px] text-admin-ink-faint" />
          )}
          <h4 className="truncate text-admin-body-md font-semibold text-admin-ink">{lesson.label}</h4>
          {lesson.struggling ? (
            <span className="shrink-0 rounded-admin-badge bg-admin-amber-wash px-1.5 text-[11px] font-semibold leading-5 text-admin-amber-ink">
              Struggling
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[12px] leading-4 tabular-nums text-admin-ink-subtle">{when ?? "No date"}</span>
          {onDeleteLesson ? (
            <DeleteProgressButton label={`Delete ${lesson.label} progress`} onClick={onDeleteLesson} />
          ) : null}
        </div>
      </div>
      <div className="px-space-16 py-space-16">
        {hasMeters ? (
          <LessonContentMeters lesson={lesson} onDeletePart={onDeletePart} />
        ) : (
          <p className="text-admin-body-sm text-admin-ink-subtle">No cards in this lesson.</p>
        )}
      </div>
    </div>
  );
}

export function visibleLessons(course: AdminCourseDetail): AdminLessonDetail[] {
  return course.lessons.filter(
    (lesson) =>
      lesson.totalCount > 0 ||
      lesson.videos.length > 0 ||
      lesson.status !== "not-started",
  );
}
