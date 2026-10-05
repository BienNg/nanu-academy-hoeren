"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAdminStudentProgress,
  listAdminStudentRuns,
  loadAdminStudentDetail,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
  setAdminUserLivingAccess,
} from "@/app/admin/actions";
import { workplaceFromAccessSlug } from "@/lib/living-content";
import { CARD_KIND_LABEL, MISSED_ATTEMPT_KINDS, MISSED_ATTEMPT_LABEL, type CardKind } from "@/lib/card-kinds";
import { StaffBadge, useAdminRole } from "@/components/admin/AdminShell";
import { RecapShareButton } from "@/components/RecapShareButton";
import {
  describeCatalogClip,
  describeCatalogLesson,
  projectStudentDetail,
  projectStudentVisits,
  type AdminActivityCard,
  type AdminCatalogCourse,
  type AdminCourseDetail,
  type AdminLessonDetail,
  type AdminVideoDetail,
  type AdminVisitDetailGroup,
  type AdminVisitDetailItem,
  type AdminVisitDetailTone,
  type AdminVisitRange,
  type AdminVisitRow,
  type AdminVisitSignalKind,
  type AdminVisitStats,
  type StudentProgressPart,
  type StudentProgressTarget,
} from "@/lib/admin-detail";
import { visitRangeIso } from "@/lib/progress";
import {
  LISTENING_SCHEMA_HINT,
  type StoredListeningRun,
  type StudentRunsPage,
} from "@/lib/listening-runs";
import {
  activeStreakDays,
  formatActiveDuration,
  isStudyActivityId,
  signInSummary,
  lessonNodeFromActivityId,
  type StoredProgress,
} from "@/lib/progress";
import { formatAdminTimestamp, type AdminUserRow } from "@/lib/admin-overview";

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
  return formatAdminTimestamp(iso);
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
  items: { label: string; value: string; detail?: string | null; title?: string }[];
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
            <div key={item.label} title={item.title} className={`min-w-0 px-5 py-5 sm:px-6 sm:py-6 ${edge}`}>
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

function DeleteProgressButton({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] ${className}`}
    >
      <MaterialIcon name="delete" className="text-[18px]" />
    </button>
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

function LessonBlock({
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
      className={`overflow-hidden rounded-[20px] border bg-surface-container-lowest shadow-[0_1px_2px_rgba(27,27,29,0.04)] ${
        lesson.struggling ? "border-[#ff9500] ring-1 ring-[#ff9500]" : "border-black/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between gap-space-8 border-b border-outline-variant/20 bg-surface-container-low px-space-16 py-space-12">
        <div className="flex min-w-0 items-center gap-space-8">
          {lesson.status === "completed" ? (
            <MaterialIcon name="check_circle" className="text-[18px] text-[#34C759]" filled />
          ) : lesson.status === "in-progress" ? (
            <MaterialIcon name="pending" className="text-[18px] text-primary" />
          ) : (
            <MaterialIcon name="radio_button_unchecked" className="text-[18px] text-outline-variant" />
          )}
          <h4 className="truncate font-label-md text-label-md font-semibold text-on-surface">{lesson.label}</h4>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-caption text-caption font-medium text-on-surface-variant">
            {when ?? "No date"}
          </span>
          {onDeleteLesson ? (
            <DeleteProgressButton label={`Delete ${lesson.label} progress`} onClick={onDeleteLesson} />
          ) : null}
        </div>
      </div>
      <div className="px-space-16 py-space-16">
        {hasMeters ? (
          <LessonContentMeters lesson={lesson} onDeletePart={onDeletePart} />
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

type DetailTab = "overview" | "courses" | "activity" | "account";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "courses", label: "Courses" },
  { id: "activity", label: "Activity" },
  { id: "account", label: "Account" },
];

export type StudentAccessPatch = {
  userId: string;
  levelAccess?: string[];
  interviewAccess?: boolean;
  livingAccess?: string[];
};

function DetailTabs({
  tab,
  onChange,
}: {
  tab: DetailTab;
  onChange: (tab: DetailTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Student detail"
      className="flex shrink-0 gap-1 border-b border-black/[0.06] bg-surface-container-lowest px-5 sm:px-8"
    >
      {DETAIL_TABS.map((item) => {
        const selected = item.id === tab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`shrink-0 border-b-2 px-3 py-3 font-label-sm text-label-sm font-semibold transition-colors ${
              selected
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function AccessSwitch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-primary" : "bg-black/15"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(27,27,29,0.25)] transition-[left,right] ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function CourseAccessRow({
  course,
  selected,
  granted,
  showSwitch,
  switchDisabled,
  onSelect,
  onToggle,
}: {
  course: AdminCourseDetail;
  selected: boolean;
  granted: boolean;
  showSwitch: boolean;
  switchDisabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 border-b border-black/[0.06] px-4 py-3 last:border-b-0 ${
        selected ? "bg-primary-fixed" : ""
      }`}
    >
      {showSwitch ? (
        <AccessSwitch
          on={granted}
          disabled={switchDisabled}
          label={granted ? `Lock ${course.shortLabel}` : `Unlock ${course.shortLabel}`}
          onToggle={onToggle}
        />
      ) : (
        <span
          className={`inline-flex h-6 w-fit items-center justify-self-start rounded-full px-2 font-caption text-[11px] font-semibold ${
            granted ? "bg-primary/10 text-primary" : "bg-black/[0.05] text-outline"
          }`}
        >
          {granted ? "Open" : "Locked"}
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-w-0 text-left"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={`truncate font-label-md text-label-md ${
              selected ? "font-bold text-on-primary-fixed" : "font-semibold text-on-surface"
            }`}
          >
            {course.shortLabel}
          </span>
          <span
            className={`shrink-0 font-label-sm text-label-sm font-semibold tabular-nums ${
              selected ? "text-primary" : "text-on-surface-variant"
            }`}
          >
            {course.started ? `${course.percent}%` : "Not started"}
          </span>
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/10">
          <span
            className={`block h-full rounded-full ${selected ? "bg-primary" : "bg-outline"}`}
            style={{ width: `${course.percent}%` }}
          />
        </span>
      </button>
    </div>
  );
}

type VisitCategory = AdminVisitDetailGroup["id"];

const VISIT_CATEGORY: Record<
  VisitCategory,
  { icon: string; tint: string; ink: string; bar: string }
> = {
  study: { icon: "menu_book", tint: "bg-[#0071e3]/10", ink: "text-[#0066cc]", bar: "bg-[#0071e3]" },
  listening: { icon: "headphones", tint: "bg-[#5e5ce6]/10", ink: "text-[#4b48c9]", bar: "bg-[#5e5ce6]" },
  left: { icon: "pending", tint: "bg-[#ff9500]/12", ink: "text-[#9a6700]", bar: "bg-[#ff9500]" },
  video: { icon: "play_circle", tint: "bg-[#ff2d55]/10", ink: "text-[#c4173f]", bar: "bg-[#ff2d55]" },
};

const VISIT_SIGNAL: Record<AdminVisitSignalKind, { icon: string; className: string }> = {
  returning: { icon: "waving_hand", className: "bg-[#0071e3]/10 text-[#0058b0]" },
  stuck: { icon: "replay", className: "bg-[#ff9500]/12 text-[#8a5c00]" },
  video: { icon: "videocam_off", className: "bg-[#ff2d55]/10 text-[#b0123a]" },
};

const DETAIL_TONE: Record<AdminVisitDetailTone, { icon: string; className: string }> = {
  neutral: { icon: "radio_button_unchecked", className: "text-outline" },
  success: { icon: "check_circle", className: "text-[#248a3d]" },
  warning: { icon: "error", className: "text-[#c77700]" },
};

function shortDuration(seconds: number): string {
  return compactDuration(formatActiveDuration(seconds));
}

function visitMetrics(stats: AdminVisitStats): {
  category: VisitCategory;
  icon?: string;
  value: string;
  label: string;
}[] {
  const metrics: { category: VisitCategory; icon?: string; value: string; label: string }[] = [];
  if (stats.clipsStudied > 0) {
    metrics.push({
      category: "study",
      value: String(stats.clipsStudied),
      label: stats.clipsStudied === 1 ? "Clip studied" : "Clips studied",
    });
  }
  if (stats.practiceClips > 0) {
    metrics.push({
      category: "listening",
      value: String(stats.practiceClips),
      label: stats.practiceClips === 1 ? "Practice clip" : "Practice clips",
    });
  }
  if (stats.practiceRuns > 0) {
    metrics.push({
      category: "listening",
      icon: "flag",
      value: String(stats.practiceRuns),
      label: stats.practiceRuns === 1 ? "Practice run" : "Practice runs",
    });
  }
  if (stats.videoSeconds >= 1 || stats.videosWatched > 0) {
    metrics.push({
      category: "video",
      value: shortDuration(stats.videoSeconds),
      label:
        stats.videosWatched > 0
          ? `Video · ${stats.videosWatched} watched`
          : "Video",
    });
  }
  if (stats.leftUnfinished > 0) {
    metrics.push({
      category: "left",
      value: String(stats.leftUnfinished),
      label: "Left unfinished",
    });
  }
  return metrics;
}

function VisitMetricTile({
  category,
  icon,
  value,
  label,
}: {
  category: VisitCategory;
  icon?: string;
  value: string;
  label: string;
}) {
  const style = VISIT_CATEGORY[category];
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-surface-container-low px-3 py-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.tint} ${style.ink}`}
      >
        <MaterialIcon name={icon ?? style.icon} className="text-[18px]" filled />
      </span>
      <span className="min-w-0">
        <span className="block font-label-md text-[15px] font-semibold leading-tight tabular-nums text-on-surface">
          {value}
        </span>
        <span className="block truncate font-caption text-[11px] font-medium leading-tight text-on-surface-variant">
          {label}
        </span>
      </span>
    </li>
  );
}

function VisitDetailGroup({ group }: { group: AdminVisitDetailGroup }) {
  const style = VISIT_CATEGORY[group.id];
  const total = group.items.length + group.extraCount;
  // Study clips usually come in runs from one Lektion; show its name once per run.
  const runs: { context: string | null; items: AdminVisitDetailItem[] }[] = [];
  for (const item of group.items) {
    const last = runs[runs.length - 1];
    if (last && last.context === item.context) last.items.push(item);
    else runs.push({ context: item.context, items: [item] });
  }

  return (
    <section className="min-w-0">
      <h4 className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${style.tint} ${style.ink}`}
        >
          <MaterialIcon name={style.icon} className="text-[15px]" filled />
        </span>
        <span className="font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
          {group.label}
        </span>
        <span className="rounded-full bg-black/[0.05] px-1.5 py-px font-caption text-[11px] font-semibold tabular-nums text-on-surface-variant">
          {total}
        </span>
      </h4>
      <div className="mt-2 overflow-hidden rounded-2xl border border-black/[0.06] bg-surface-container-lowest">
        {runs.map((run, runIndex) => (
          <div key={`${run.context ?? "none"}-${runIndex}`} className="border-b border-black/[0.06] last:border-b-0">
            {run.context ? (
              <p className="flex items-center gap-1.5 bg-black/[0.02] px-3.5 pb-1.5 pt-2 font-caption text-[11px] font-semibold text-outline">
                <MaterialIcon name="school" className="text-[13px]" />
                {run.context}
              </p>
            ) : null}
            <ul className="divide-y divide-black/[0.05]">
              {run.items.map((item, index) => {
                const tone = DETAIL_TONE[item.tone];
                return (
                  <li key={`${group.id}-${runIndex}-${index}`} className="flex gap-2.5 px-3.5 py-2.5">
                    <MaterialIcon
                      name={tone.icon}
                      className={`mt-px text-[17px] ${tone.className}`}
                      filled={item.tone !== "neutral"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-body-sm text-body-sm leading-snug text-on-surface">
                        {item.title}
                      </p>
                      {item.facts.length > 0 ? (
                        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
                          {item.facts.join(" · ")}
                        </p>
                      ) : null}
                      {item.percent != null ? (
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="block h-1 flex-1 overflow-hidden rounded-full bg-black/[0.08]">
                            <span
                              className={`block h-full rounded-full ${
                                item.tone === "success" ? "bg-[#34C759]" : style.bar
                              }`}
                              style={{ width: `${item.percent}%` }}
                            />
                          </span>
                          <span className="w-9 shrink-0 text-right font-caption text-[11px] font-semibold tabular-nums text-on-surface-variant">
                            {item.percent}%
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {group.extraCount > 0 ? (
        <p className="mt-1.5 px-1 font-caption text-caption text-outline">+{group.extraCount} more</p>
      ) : null}
    </section>
  );
}

function VisitCard({
  visit,
  open,
  onToggle,
}: {
  visit: AdminVisitRow;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = visit.details.length > 0;
  const detailId = `visit-detail-${visit.id}`;
  const duration = shortDuration(visit.activeSeconds);
  const signal = visit.signalKind ? VISIT_SIGNAL[visit.signalKind] : null;

  if (visit.idle) {
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-dashed border-black/[0.1] px-4 py-3">
        <MaterialIcon name="hourglass_empty" className="text-[18px] text-outline" />
        <span className="font-label-sm text-label-sm font-semibold tabular-nums text-on-surface-variant">
          {visit.timeRange}
        </span>
        <span className="min-w-0 flex-1 truncate font-body-sm text-body-sm text-outline">
          Opened the app, no study
        </span>
        <span className="shrink-0 font-caption text-caption font-semibold tabular-nums text-outline">
          {duration}
        </span>
      </li>
    );
  }

  const metrics = visitMetrics(visit.stats);

  return (
    <li>
      <Panel className={open ? "ring-2 ring-primary/25" : ""}>
        <button
          type="button"
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? detailId : undefined}
          onClick={expandable ? onToggle : undefined}
          className={`block w-full px-4 py-4 text-left sm:px-5 ${
            expandable ? "transition-colors hover:bg-black/[0.015]" : "cursor-default"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <MaterialIcon name="schedule" className="text-[18px] text-outline" />
              <span className="font-label-md text-label-md font-semibold tabular-nums text-on-surface">
                {visit.timeRange || visit.day}
              </span>
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-on-surface px-2.5 py-1 font-label-sm text-label-sm font-semibold tabular-nums text-surface-container-lowest"
              title="Active time"
            >
              <MaterialIcon name="timer" className="text-[15px]" filled />
              {duration}
            </span>
            {expandable ? (
              <MaterialIcon
                name="expand_more"
                className={`text-[22px] text-outline transition-transform ${open ? "rotate-180" : ""}`}
              />
            ) : (
              <span className="w-[22px] shrink-0" aria-hidden="true" />
            )}
          </span>

          {visit.lessons.length > 0 ? (
            <span className="mt-3 flex flex-wrap gap-1.5">
              {visit.lessons.map((lesson) => (
                <span
                  key={lesson}
                  className="inline-flex max-w-full items-center gap-1 rounded-[8px] bg-primary-fixed px-2 py-1 font-label-sm text-label-sm font-semibold text-on-primary-fixed"
                >
                  <MaterialIcon name="school" className="text-[14px]" />
                  <span className="truncate">{lesson}</span>
                </span>
              ))}
            </span>
          ) : null}

          {metrics.length > 0 ? (
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {metrics.map((metric) => (
                <VisitMetricTile key={`${metric.category}-${metric.label}`} {...metric} />
              ))}
            </ul>
          ) : null}

          {visit.signal && signal ? (
            <span
              className={`mt-3 flex items-center gap-1.5 rounded-[12px] px-3 py-2 font-caption text-caption font-semibold ${signal.className}`}
            >
              <MaterialIcon name={signal.icon} className="text-[16px]" filled />
              {visit.signal}
            </span>
          ) : null}
        </button>
        {open && expandable ? (
          <div
            id={detailId}
            className="flex flex-col gap-4 border-t border-black/[0.06] bg-[#f5f5f7]/70 px-4 py-4 sm:px-5"
          >
            {visit.details.map((group) => (
              <VisitDetailGroup key={group.id} group={group} />
            ))}
          </div>
        ) : null}
      </Panel>
    </li>
  );
}

function VisitFeed({
  visits,
  openVisitId,
  onToggle,
}: {
  visits: AdminVisitRow[];
  openVisitId: string | null;
  onToggle: (id: string) => void;
}) {
  const days: { day: string; visits: AdminVisitRow[]; activeSeconds: number }[] = [];
  for (const visit of visits) {
    const last = days[days.length - 1];
    if (last && last.day === visit.day) {
      last.visits.push(visit);
      last.activeSeconds += visit.activeSeconds;
    } else {
      days.push({ day: visit.day, visits: [visit], activeSeconds: visit.activeSeconds });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {days.map((group) => (
        <section key={group.day} aria-label={group.day}>
          <div className="sticky -top-6 z-[1] -mx-1 flex items-baseline justify-between gap-3 bg-[#f5f5f7]/95 px-1 py-2 backdrop-blur sm:-top-7">
            <h4 className="font-label-md text-label-md font-semibold text-on-surface">{group.day}</h4>
            <span className="font-caption text-caption font-medium tabular-nums text-outline">
              {group.visits.length} {group.visits.length === 1 ? "visit" : "visits"} ·{" "}
              {shortDuration(group.activeSeconds)}
            </span>
          </div>
          <ul className="mt-1 flex flex-col gap-2.5">
            {group.visits.map((visit) => (
              <VisitCard
                key={visit.id}
                visit={visit}
                open={openVisitId === visit.id}
                onToggle={() => onToggle(visit.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ColumnHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-start justify-between gap-space-12 px-1">
      <div className="min-w-0">
        <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
          {title}
        </h3>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{description}</p>
      </div>
      {action}
    </div>
  );
}

function visitStripStats(visits: readonly AdminVisitRow[]) {
  const study = visits.filter((visit) => !visit.idle);
  const studySeconds = study.reduce((sum, visit) => sum + visit.activeSeconds, 0);
  return {
    studyCount: study.length,
    idleCount: visits.length - study.length,
    studySeconds,
    averageSeconds: study.length > 0 ? Math.round(studySeconds / study.length) : 0,
  };
}

function StatStrip({
  items,
}: {
  items: { label: string; value: string; icon?: string; tint?: string; ink?: string }[];
}) {
  const iconic = items.every((item) => item.icon);
  if (iconic) {
    const columns =
      items.length === 4 ? "grid-cols-4" : items.length === 2 ? "grid-cols-2" : "grid-cols-3";
    return (
      <Panel>
        <div className={`grid ${columns}`}>
          {items.map((item, index) => (
            <div
              key={item.label}
              className={`flex min-w-0 flex-col items-center gap-1 px-1.5 py-3 text-center sm:px-2 ${
                index < items.length - 1 ? "border-r border-black/[0.06]" : ""
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${item.tint ?? "bg-[#0071e3]/10"} ${item.ink ?? "text-[#0066cc]"}`}
              >
                <MaterialIcon name={item.icon!} className="text-[18px]" filled />
              </span>
              <p className="font-label-md text-[15px] font-semibold leading-tight tabular-nums text-on-surface">
                {item.value}
              </p>
              <p className="font-caption text-[11px] font-medium leading-tight text-on-surface-variant">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="grid grid-cols-3">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 px-4 py-4 sm:px-5 ${index < items.length - 1 ? "border-r border-black/[0.06]" : ""}`}
          >
            <p className="font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
              {item.label}
            </p>
            <p className="mt-1 font-headline-sm text-headline-sm font-semibold tabular-nums text-on-surface">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function clipStatus(clip: StoredListeningRun["clips"][number]): string {
  if (clip.missed && clip.passed) return "Missed, then passed";
  if (clip.passed) return "Passed";
  return "Missed";
}

function attemptCoversKind(kind: CardKind, answers: StoredListeningRun["clips"][number]["missedAnswers"]): boolean {
  if (!answers) return false;
  if (kind === "listening") return Boolean(answers.listening || answers["number-input"]);
  if (kind === "multiple-choice") return Boolean(answers["multiple-choice"] || answers["reply-choice"]);
  return Boolean(answers[kind]);
}

function ListeningRunRow({
  run,
  catalog,
  open,
  onToggle,
}: {
  run: StoredListeningRun;
  catalog: readonly AdminCatalogCourse[];
  open: boolean;
  onToggle: () => void;
}) {
  const place = describeCatalogLesson(catalog, run.lessonKey);
  const title = place ? `${place.course} · ${place.lesson}` : run.lessonKey;
  const when = formatAbsoluteTime(run.createdAt);
  const missed = run.clips.filter((clip) => clip.missed);
  const firstTry = run.clips.filter((clip) => clip.passed && !clip.missed).length;
  const passedRun = run.outcome === "success";
  const facts = [
    {
      icon: "segment",
      label: run.partCount > 1 ? `Part ${run.partNumber} of ${run.partCount}` : `Part ${run.partNumber}`,
    },
    { icon: "headphones", label: `${run.clips.length} ${run.clips.length === 1 ? "clip" : "clips"}` },
    ...(run.cardCount != null
      ? [{ icon: "style", label: `${run.cardCount} ${run.cardCount === 1 ? "card" : "cards"}` }]
      : []),
    { icon: "timer", label: shortDuration(Math.round(run.elapsedMs / 1000)) },
    missed.length > 0
      ? { icon: "close", label: `${missed.length} missed`, warn: true }
      : { icon: "done_all", label: "No misses" },
  ];

  return (
    <li>
      <Panel className={open ? "ring-2 ring-primary/25" : ""}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start gap-space-12 px-4 py-4 text-left transition-colors hover:bg-black/[0.015] sm:px-5"
      >
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            passedRun ? "bg-[#34C759]/15 text-[#248a3d]" : "bg-[#ff3b30]/10 text-[#ff3b30]"
          }`}
        >
          <MaterialIcon
            name={passedRun ? "check_circle" : "heart_broken"}
            className="text-[20px]"
            filled
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-space-12">
            <span className="font-label-md text-label-md font-semibold text-on-surface">
              {passedRun ? "Passed" : "Out of hearts"}
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold tabular-nums ${
                passedRun ? "bg-[#34C759]/15 text-[#1f7a35]" : "bg-[#ff3b30]/10 text-[#c4251c]"
              }`}
              title="Accuracy"
            >
              {run.accuracy}%
            </span>
          </span>
          <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface">{title}</span>
          {when ? (
            <span className="mt-0.5 block font-body-sm text-body-sm text-outline">{when}</span>
          ) : null}
          <span className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((fact) => (
              <span
                key={fact.label}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-caption text-caption font-medium tabular-nums ${
                  "warn" in fact && fact.warn
                    ? "bg-[#ff3b30]/10 text-[#c4251c]"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                <MaterialIcon name={fact.icon} className="text-[14px]" />
                {fact.label}
              </span>
            ))}
          </span>
        </span>
        <MaterialIcon
          name="expand_more"
          className={`mt-0.5 text-[22px] text-outline transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-space-12 border-t border-black/[0.06] bg-[#f5f5f7]/70 px-4 py-4 sm:px-5">
          {run.clips.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Clip results were not stored for this run.
            </p>
          ) : (
            <>
              {firstTry > 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {firstTry === run.clips.length
                    ? "Every clip was right on the first try."
                    : `${firstTry} ${firstTry === 1 ? "clip was" : "clips were"} right on the first try.`}
                </p>
              ) : null}
              {missed.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {missed.map((clip) => {
                    const described = describeCatalogClip(catalog, run.lessonKey, clip.clipId);
                    const attempts = MISSED_ATTEMPT_KINDS.flatMap((kind) => {
                      const attempt = clip.missedAnswers?.[kind];
                      return attempt ? [{ kind, ...attempt }] : [];
                    });
                    const uncovered = (clip.missedKinds ?? [])
                      .filter((kind) => !attemptCoversKind(kind, clip.missedAnswers))
                      .map((kind) => CARD_KIND_LABEL[kind])
                      .join(" · ");
                    return (
                      <li key={clip.clipId} className="min-w-0">
                        <p className="font-caption text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                          {clipStatus(clip)}
                        </p>
                        {uncovered ? (
                          <p className="mt-0.5 font-caption text-caption font-medium text-on-surface-variant">
                            {uncovered}
                          </p>
                        ) : null}
                        <p className="mt-0.5 font-body-sm text-body-sm text-on-surface">
                          {described.prompt}
                        </p>
                        {attempts.length > 0 ? (
                          <ul className="mt-2 flex flex-col gap-2">
                            {attempts.map((attempt) => (
                              <li key={attempt.kind} className="min-w-0">
                                <p className="font-caption text-caption font-medium text-on-surface-variant">
                                  {MISSED_ATTEMPT_LABEL[attempt.kind]}
                                </p>
                                <p className="font-body-sm text-body-sm text-on-surface">
                                  Entered: {attempt.entered}
                                </p>
                                <p className="font-body-sm text-body-sm text-on-surface-variant">
                                  Correct: {attempt.correct}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      </Panel>
    </li>
  );
}

function practiceEmptyMessage(range: AdminVisitRange): string {
  if (range === "today") return "No finished practice parts today.";
  if (range === "7d") return "No finished practice parts in the last 7 days.";
  return "No finished practice parts yet.";
}

function ListeningRunsSection({
  userId,
  catalog,
  revision,
  range,
  timeZone,
}: {
  userId: string;
  catalog: readonly AdminCatalogCourse[];
  revision: number;
  range: AdminVisitRange;
  timeZone: string | undefined;
}) {
  const [page, setPage] = useState<StudentRunsPage | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const window = useMemo(
    () => visitRangeIso(range, new Date(), timeZone),
    [range, timeZone],
  );
  const requestKey = `${userId}:${revision}:${range}:${window?.fromIso ?? "all"}`;
  const visible = loadedFor === requestKey ? page : null;

  useEffect(() => {
    let cancelled = false;
    void listAdminStudentRuns(userId, 0, window).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadedFor(requestKey);
        setPage({ status: "error", runs: [], total: 0, passed: 0, failed: 0 });
        return;
      }
      setLoadedFor(requestKey);
      setPage({
        status: result.status,
        runs: result.runs,
        total: result.total,
        passed: result.passed,
        failed: result.failed,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, userId, window]);

  async function loadMore() {
    if (!visible || loadingMore || visible.runs.length >= visible.total) return;
    const requestUser = userId;
    const offset = visible.runs.length;
    setLoadingMore(true);
    const result = await listAdminStudentRuns(requestUser, offset, window);
    if (userIdRef.current !== requestUser) {
      setLoadingMore(false);
      return;
    }
    setLoadingMore(false);
    if (!result.ok || result.status !== "ready") return;
    setPage((current) => {
      if (!current) return current;
      const seen = new Set(current.runs.map((run) => run.id));
      const added = result.runs.filter((run) => !seen.has(run.id));
      return {
        ...current,
        runs: [...current.runs, ...added],
        total: result.total,
        passed: result.passed,
        failed: result.failed,
      };
    });
  }

  const earlier = visible ? Math.max(0, visible.total - visible.runs.length) : 0;

  return (
    <section aria-label="Practice" aria-busy={visible == null} className="min-w-0">
      <ColumnHeader
        title="Practice"
        description="Finished practice parts, including ones that ran out of hearts."
      />
      <div className="mt-4">
        {visible == null ? (
          <Panel>
            <p className="px-6 py-10 text-center font-body-sm text-body-sm text-on-surface-variant">
              Loading practice parts…
            </p>
          </Panel>
        ) : visible.status === "missing" ? (
          <Panel>
            <p className="px-6 py-8 font-body-sm text-body-sm text-on-surface-variant">
              {LISTENING_SCHEMA_HINT}
            </p>
          </Panel>
        ) : visible.status === "error" ? (
          <Panel>
            <p className="px-6 py-8 font-body-sm text-body-sm text-on-surface-variant">
              Practice parts could not be loaded.
            </p>
          </Panel>
        ) : visible.total === 0 ? (
          <Panel>
            <p className="px-6 py-10 text-center font-body-sm text-body-sm text-on-surface-variant">
              {practiceEmptyMessage(range)}
            </p>
          </Panel>
        ) : (
          <div className="flex flex-col gap-4">
            <StatStrip
              items={[
                { label: "Finished", value: String(visible.total) },
                { label: "Passed", value: String(visible.passed) },
                { label: "Failed", value: String(visible.failed) },
              ]}
            />
            <ul className="flex flex-col gap-2.5">
              {visible.runs.map((run) => (
                <ListeningRunRow
                  key={run.id}
                  run={run}
                  catalog={catalog}
                  open={openRunId === run.id}
                  onToggle={() => setOpenRunId((current) => (current === run.id ? null : run.id))}
                />
              ))}
            </ul>
            {earlier > 0 ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="self-center rounded-full bg-primary/10 px-4 py-2 font-label-sm text-label-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : `Show ${earlier} earlier ${earlier === 1 ? "run" : "runs"}`}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function StudentDetailModal({
  row,
  catalog,
  onClose,
  onAccessChange,
}: {
  row: AdminUserRow;
  catalog: readonly AdminCatalogCourse[];
  onClose: () => void;
  onAccessChange?: (patch: StudentAccessPatch) => void;
}) {
  const router = useRouter();
  const canDelete = useAdminRole() === "owner";
  const [progressOverride, setProgressOverride] = useState<{
    userId: string;
    progress: StoredProgress;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    (StudentProgressTarget & { label: string; detail: string }) | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [runsRevision, setRunsRevision] = useState(0);
  const [payload, setPayload] = useState<{
    progress: StoredProgress;
    signIns: AdminUserRow["signIns"];
    appUses: AdminUserRow["appUses"];
  } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const serverCaughtUp =
    progressOverride?.userId === row.userId &&
    (progressOverride.progress.adminClears ?? []).every((clear) =>
      (row.progress.adminClears ?? []).some((entry) => entry.id === clear.id),
    );
  const progress =
    progressOverride?.userId === row.userId && !serverCaughtUp
      ? progressOverride.progress
      : (payload?.progress ?? row.progress);
  const detailReady = payload != null;
  const detail = useMemo(
    () => projectStudentDetail(catalog, progress),
    [catalog, progress],
  );
  const [tab, setTab] = useState<DetailTab>("overview");
  const panelRef = useRef<HTMLDivElement>(null);
  const [courseId, setCourseId] = useState("");
  const [levelAccess, setLevelAccess] = useState(row.levelAccess);
  const [interviewAccess, setInterviewAccess] = useState(row.interviewAccess);
  const [livingAccess, setLivingAccess] = useState(row.livingAccess);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const accessSaveRef = useRef(false);
  const levels = detail.courses.filter((course) => course.kind === "cefr" && !course.living);
  const interviewCourses = detail.courses.filter((course) => course.kind === "ausbildung");
  const livingCourses = detail.courses.filter((course) => course.living);
  const course =
    detail.courses.find((entry) => entry.id === courseId) ??
    levels.find((entry) => entry.started) ??
    levels[0] ??
    detail.courses[0];
  const lessons = course ? visibleLessons(course) : [];
  const [range, setRange] = useState<AdminVisitRange>("7d");
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const visitLog = useMemo(
    () => projectStudentVisits(catalog, progress, range),
    [catalog, progress, range],
  );
  const streakDays = activeStreakDays(progress);
  const signIns = [...(payload?.signIns ?? row.signIns)].reverse();
  const appUses = [...(payload?.appUses ?? row.appUses)].reverse();
  const lastSignInAt = payload?.signIns.length
    ? (payload.signIns[payload.signIns.length - 1]?.at ?? row.lastSignInAt)
    : row.lastSignInAt;
  const lastLogin = formatAbsoluteTime(lastSignInAt);
  const lastSeen = formatAbsoluteTime(row.lastLoginAt);
  const summary = visitLog.summary;
  const visitStats = visitStripStats(visitLog.visits);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setDetailError(null);
    void loadAdminStudentDetail(row.userId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setDetailError(result.error);
        return;
      }
      setPayload({
        progress: result.progress,
        signIns: result.signIns,
        appUses: result.appUses,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [row.userId]);

  useEffect(() => {
    setTab("overview");
    setCourseId("");
  }, [row.userId]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [tab, row.userId]);

  useEffect(() => {
    if (accessSaveRef.current) return;
    setLevelAccess(row.levelAccess);
    setInterviewAccess(row.interviewAccess);
    setLivingAccess(row.livingAccess);
  }, [row.userId, row.levelAccess, row.interviewAccess, row.livingAccess]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleting) return;
      if (pendingDelete) {
        setPendingDelete(null);
        setDeleteError(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [deleting, onClose, pendingDelete]);

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    const target: StudentProgressTarget =
      pendingDelete.scope === "all"
        ? { scope: "all" }
        : pendingDelete.scope === "course"
          ? { scope: "course", courseId: pendingDelete.courseId }
          : pendingDelete.scope === "lesson"
            ? {
                scope: "lesson",
                courseId: pendingDelete.courseId,
                lessonId: pendingDelete.lessonId,
              }
            : {
                scope: "part",
                courseId: pendingDelete.courseId,
                lessonId: pendingDelete.lessonId,
                part: pendingDelete.part,
              };
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAdminStudentProgress(row.userId, target);
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setProgressOverride({ userId: row.userId, progress: result.progress });
    setRunsRevision((current) => current + 1);
    setPendingDelete(null);
    router.refresh();
  }

  function courseGranted(entry: AdminCourseDetail): boolean {
    if (row.isAdmin) return true;
    if (entry.living) {
      const workplace = workplaceFromAccessSlug(entry.id);
      return workplace != null && livingAccess.includes(workplace);
    }
    if (entry.kind === "ausbildung") return interviewAccess;
    return levelAccess.includes(entry.id);
  }

  async function toggleLevel(slug: string) {
    if (row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = levelAccess;
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setLevelAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, levelAccess: next });
    try {
      const result = await setAdminUserLevelAccess(row.userId, next);
      if (!result.ok) {
        setLevelAccess(current);
        onAccessChange?.({ userId: row.userId, levelAccess: current });
        setAccessError(result.error);
        return;
      }
      setLevelAccess(result.levelAccess);
      onAccessChange?.({ userId: row.userId, levelAccess: result.levelAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  async function toggleInterview() {
    if (row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = interviewAccess;
    const next = !current;
    setInterviewAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, interviewAccess: next });
    try {
      const result = await setAdminUserInterviewAccess(row.userId, next);
      if (!result.ok) {
        setInterviewAccess(current);
        onAccessChange?.({ userId: row.userId, interviewAccess: current });
        setAccessError(result.error);
        return;
      }
      setInterviewAccess(result.interviewAccess);
      onAccessChange?.({ userId: row.userId, interviewAccess: result.interviewAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  async function toggleLiving(courseEntry: AdminCourseDetail) {
    const workplace = workplaceFromAccessSlug(courseEntry.id);
    if (!workplace || row.isAdmin || accessSaveRef.current) return;
    accessSaveRef.current = true;
    const current = livingAccess;
    const granted = !current.includes(workplace);
    const next = granted
      ? [...current, workplace]
      : current.filter((slug) => slug !== workplace);
    setLivingAccess(next);
    setAccessSaving(true);
    setAccessError(null);
    onAccessChange?.({ userId: row.userId, livingAccess: next });
    try {
      const result = await setAdminUserLivingAccess(row.userId, workplace, granted);
      if (!result.ok) {
        setLivingAccess(current);
        onAccessChange?.({ userId: row.userId, livingAccess: current });
        setAccessError(result.error);
        return;
      }
      setLivingAccess(result.livingAccess);
      onAccessChange?.({ userId: row.userId, livingAccess: result.livingAccess });
      router.refresh();
    } finally {
      accessSaveRef.current = false;
      setAccessSaving(false);
    }
  }

  const openLevelCount = row.isAdmin
    ? levels.length
    : levels.filter((entry) => levelAccess.includes(entry.id)).length;
  const openLivingCount = row.isAdmin
    ? livingCourses.length
    : livingCourses.filter((entry) => courseGranted(entry)).length;

  const identityFacts = [
    row.email && row.email !== row.displayName ? { label: "Email", value: row.email } : null,
    { label: "Sign-in", value: lastLogin ?? "No sign-in recorded" },
    lastSeen ? { label: "Last seen", value: lastSeen } : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center sm:p-4 lg:p-6"
      role="presentation"
      onClick={() => {
        if (deleting) return;
        if (pendingDelete) {
          setPendingDelete(null);
          setDeleteError(null);
          return;
        }
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#f5f5f7] shadow-2xl sm:h-[min(1100px,96dvh)] sm:max-w-[1320px] sm:rounded-[28px] xl:max-w-[1480px] 2xl:max-w-[1640px]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="z-10 shrink-0 border-b border-black/[0.06] bg-surface-container-lowest px-5 py-5 sm:px-8">
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
                  {row.staff && !row.isAdmin ? <StaffBadge /> : null}
                  {row.className ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface">
                      <MaterialIcon name="school" className="text-[14px]" />
                      {row.className}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-space-4 rounded-full bg-surface-container px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                    <MaterialIcon
                      name="local_fire_department"
                      className={`text-[16px] ${streakDays > 0 ? "text-[#ff9500]" : "text-outline"}`}
                      filled={streakDays > 0}
                    />
                    {streakDays} {streakDays === 1 ? "day" : "days"}
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
            <div className="flex shrink-0 items-center gap-2">
              <RecapShareButton
                userId={row.userId}
                audience="staff"
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-label-sm text-label-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <MaterialIcon name="ios_share" className="text-[18px]" />
                <span className="hidden sm:inline">Weekly card</span>
              </RecapShareButton>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete({
                      scope: "all",
                      label: "all progress",
                      detail:
                        "Courses, Lektionen, videos, practice, and visit history are cleared. The account, class, and level access stay.",
                    });
                  }}
                  disabled={!detailReady}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 font-label-sm text-label-sm font-semibold text-[#ff3b30] transition-colors hover:bg-[#ff3b30]/10 disabled:opacity-40"
                >
                  <MaterialIcon name="delete" className="text-[18px]" />
                  <span className="hidden sm:inline">Delete progress</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-on-surface transition-colors hover:bg-black/[0.08]"
              >
                <MaterialIcon name="close" className="text-[20px]" />
              </button>
            </div>
          </div>
        </header>

        <DetailTabs tab={tab} onChange={setTab} />

        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
          {detailReady ? (
            <>
              {tab === "overview" ? (
                <div className="flex flex-col gap-6">
                  <div className="grid items-start gap-6 lg:grid-cols-2">
                    <section aria-label="Activity">
                      <div className="flex flex-wrap items-center justify-between gap-space-12">
                        <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                          Activity
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
                              label: "Practice clips",
                              value: String(summary.exercisesCompleted),
                              detail: `Completed in practice parts · ${summary.listeningRuns} practice ${summary.listeningRuns === 1 ? "run" : "runs"}`,
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

                    <section aria-label="Learning">
                      <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                        Learning
                      </h3>
                      <div className="mt-4">
                        <MetricBand
                          columns="two"
                          items={[
                            {
                              label: "Courses started",
                              value: String(detail.coursesStarted),
                              detail: "Opened",
                              title: "Courses where this student opened a video or finished a clip.",
                            },
                            {
                              label: "Lessons done",
                              value: String(detail.lessonsCompleted),
                              detail: "All parts finished",
                              title:
                                "Lessons where study, practice, and every video are finished. A watched video or one practice run does not count.",
                            },
                            {
                              label: "Practice runs",
                              value: String(detail.listeningRepetitions),
                              detail: "Finished passes",
                              title: "Times this student finished a full practice pass of a lesson.",
                            },
                            {
                              label: "Videos watched",
                              value: String(detail.videosWatched),
                              detail: "Reached the end",
                              title: "Lesson videos marked watched. Starting a video does not count.",
                            },
                          ]}
                        />
                      </div>
                    </section>
                  </div>

                  <section aria-label="Course access">
                    <div className="flex flex-wrap items-center justify-between gap-space-12">
                      <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                        Course access
                      </h3>
                      <button
                        type="button"
                        onClick={() => setTab("courses")}
                        className="font-label-sm text-label-sm font-semibold text-primary"
                      >
                        Change access
                      </button>
                    </div>
                    <Panel className="mt-4">
                      {row.isAdmin ? (
                        <p className="flex items-center gap-2 px-5 py-5 font-body-sm text-body-sm text-on-surface sm:px-6">
                          <MaterialIcon name="verified" className="text-[18px] text-primary" filled />
                          Admins already have every course.
                        </p>
                      ) : (
                        <dl className="grid sm:grid-cols-3">
                          <div className="border-b border-black/[0.06] px-5 py-4 sm:border-b-0 sm:border-r sm:px-6">
                            <dt className="font-caption text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                              Levels
                            </dt>
                            <dd className="mt-1 font-headline-sm text-headline-sm font-semibold text-on-surface">
                              {openLevelCount}
                              <span className="font-body-sm font-medium text-on-surface-variant">
                                {" "}
                                / {levels.length}
                              </span>
                            </dd>
                          </div>
                          <div className="border-b border-black/[0.06] px-5 py-4 sm:border-b-0 sm:border-r sm:px-6">
                            <dt className="font-caption text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                              Interview
                            </dt>
                            <dd className="mt-1 font-headline-sm text-headline-sm font-semibold text-on-surface">
                              {interviewAccess ? "Open" : "Locked"}
                            </dd>
                          </div>
                          <div className="px-5 py-4 sm:px-6">
                            <dt className="font-caption text-[11px] font-semibold uppercase tracking-[0.08em] text-outline">
                              Leben in Deutschland
                            </dt>
                            <dd className="mt-1 font-headline-sm text-headline-sm font-semibold text-on-surface">
                              {openLivingCount}
                              <span className="font-body-sm font-medium text-on-surface-variant">
                                {" "}
                                / {livingCourses.length}
                              </span>
                            </dd>
                          </div>
                        </dl>
                      )}
                    </Panel>
                  </section>
                </div>
              ) : null}

              {tab === "courses" ? (
                <div className="flex flex-col gap-4">
                  {accessError ? (
                    <p className="font-body-sm text-body-sm text-[#ff3b30]" role="alert">
                      {accessError}
                    </p>
                  ) : null}
                  <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)]">
                    <div className="flex min-w-0 flex-col gap-6">
                      <section aria-label="Levels">
                        <h3 className="px-1 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                          Levels
                        </h3>
                        <p className="mt-1 px-1 font-body-sm text-body-sm text-on-surface-variant">
                          Unlock a level, then open it to see Lektionen.
                        </p>
                        <Panel className="mt-4">
                          {levels.length === 0 ? (
                            <p className="px-5 py-6 font-body-sm text-body-sm text-on-surface-variant">
                              No levels in the catalog.
                            </p>
                          ) : (
                            levels.map((entry) => (
                              <CourseAccessRow
                                key={entry.id}
                                course={entry}
                                selected={entry.id === course?.id}
                                granted={courseGranted(entry)}
                                showSwitch
                                switchDisabled={row.isAdmin || accessSaving}
                                onSelect={() => setCourseId(entry.id)}
                                onToggle={() => void toggleLevel(entry.id)}
                              />
                            ))
                          )}
                        </Panel>
                      </section>

                      {interviewCourses.length > 0 ? (
                        <section aria-label="Interview">
                          <div className="flex items-start justify-between gap-3 px-1">
                            <div className="min-w-0">
                              <h3 className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                                Interview
                              </h3>
                              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                                One grant opens every profession track.
                              </p>
                            </div>
                            <AccessSwitch
                              on={row.isAdmin || interviewAccess}
                              disabled={row.isAdmin || accessSaving}
                              label={
                                interviewAccess
                                  ? "Lock interview practice"
                                  : "Unlock interview practice"
                              }
                              onToggle={() => void toggleInterview()}
                            />
                          </div>
                          <Panel className="mt-4">
                            {interviewCourses.map((entry) => (
                              <CourseAccessRow
                                key={entry.id}
                                course={entry}
                                selected={entry.id === course?.id}
                                granted={courseGranted(entry)}
                                showSwitch={false}
                                switchDisabled
                                onSelect={() => setCourseId(entry.id)}
                                onToggle={() => undefined}
                              />
                            ))}
                          </Panel>
                        </section>
                      ) : null}

                      {livingCourses.length > 0 ? (
                        <section aria-label="Leben in Deutschland">
                          <h3 className="px-1 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                            Leben in Deutschland
                          </h3>
                          <p className="mt-1 px-1 font-body-sm text-body-sm text-on-surface-variant">
                            Each workplace is granted on its own.
                          </p>
                          <Panel className="mt-4">
                            {livingCourses.map((entry) => (
                              <CourseAccessRow
                                key={entry.id}
                                course={entry}
                                selected={entry.id === course?.id}
                                granted={courseGranted(entry)}
                                showSwitch
                                switchDisabled={row.isAdmin || accessSaving}
                                onSelect={() => setCourseId(entry.id)}
                                onToggle={() => void toggleLiving(entry)}
                              />
                            ))}
                          </Panel>
                        </section>
                      ) : null}
                    </div>

                    <section aria-label="Course progress" className="min-w-0">
                      {course ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between gap-3 px-1">
                            <div className="min-w-0">
                              <h3 className="truncate font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                                {course.label}
                              </h3>
                              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                                {courseGranted(course) ? "Access open" : "Access locked"}
                                {course.started
                                  ? ` · ${lessons.filter((lesson) => lesson.status === "completed").length}/${lessons.length} done`
                                  : " · Not started"}
                              </p>
                            </div>
                            {canDelete && course.started ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setPendingDelete({
                                    scope: "course",
                                    courseId: course.id,
                                    label: course.label,
                                    detail: `Every Lektion in ${course.label} is cleared.`,
                                  });
                                }}
                                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 font-label-sm text-label-sm font-semibold text-[#ff3b30] transition-colors hover:bg-[#ff3b30]/10"
                              >
                                <MaterialIcon name="delete" className="text-[16px]" />
                                Clear
                              </button>
                            ) : null}
                          </div>
                          {lessons.length === 0 ? (
                            <Panel>
                              <p className="px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
                                No lessons with content in this course yet.
                              </p>
                            </Panel>
                          ) : (
                            lessons.map((lesson) => (
                              <LessonBlock
                                key={lesson.id}
                                lesson={lesson}
                                onDeleteLesson={
                                  !canDelete || lesson.status === "not-started"
                                    ? undefined
                                    : () => {
                                        setDeleteError(null);
                                        setPendingDelete({
                                          scope: "lesson",
                                          courseId: course.id,
                                          lessonId: lesson.id,
                                          label: lesson.label,
                                          detail: `Study, practice, and videos in ${lesson.label} are cleared.`,
                                        });
                                      }
                                }
                                onDeletePart={
                                  canDelete
                                    ? (part, label) => {
                                        setDeleteError(null);
                                        setPendingDelete({
                                          scope: "part",
                                          courseId: course.id,
                                          lessonId: lesson.id,
                                          part,
                                          label: `${lesson.label} · ${label}`,
                                          detail: `${label} in ${lesson.label} is cleared. The rest of the Lektion stays.`,
                                        });
                                      }
                                    : undefined
                                }
                              />
                            ))
                          )}
                        </div>
                      ) : (
                        <Panel>
                          <p className="px-6 py-10 text-center font-body-md text-body-md text-on-surface-variant">
                            No courses in the catalog.
                          </p>
                        </Panel>
                      )}
                    </section>
                  </div>
                </div>
              ) : null}

              {tab === "activity" ? (
                <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-2">
                  <section aria-label="Visit log" className="min-w-0">
                    <ColumnHeader
                      title="Visits"
                      description="Each time the app was open, newest first."
                      action={<VisitRangeSwitch range={range} onChange={setRange} />}
                    />
                    <div className="mt-4 flex flex-col gap-4">
                      {visitLog.visits.length === 0 ? (
                        <Panel>
                          <p className="px-6 py-12 text-center font-body-md text-body-md text-on-surface-variant">
                            {visitLog.emptyMessage}
                          </p>
                        </Panel>
                      ) : (
                        <>
                          <StatStrip
                            items={[
                              {
                                label: "Visits",
                                value: String(visitStats.studyCount),
                                icon: "schedule",
                                tint: "bg-[#0071e3]/10",
                                ink: "text-[#0066cc]",
                              },
                              {
                                label: "Active time",
                                value: shortDuration(visitStats.studySeconds),
                                icon: "timer",
                                tint: "bg-[#5e5ce6]/10",
                                ink: "text-[#4b48c9]",
                              },
                              {
                                label: "Avg. visit",
                                value: shortDuration(visitStats.averageSeconds),
                                icon: "pace",
                                tint: "bg-[#34C759]/12",
                                ink: "text-[#248a3d]",
                              },
                              {
                                label: "No study",
                                value: String(visitStats.idleCount),
                                icon: "hourglass_empty",
                                tint: "bg-black/[0.06]",
                                ink: "text-outline",
                              },
                            ]}
                          />
                          <VisitFeed
                            visits={visitLog.visits}
                            openVisitId={openVisitId}
                            onToggle={(id) =>
                              setOpenVisitId((current) => (current === id ? null : id))
                            }
                          />
                        </>
                      )}
                    </div>
                  </section>
                  <ListeningRunsSection
                    userId={row.userId}
                    catalog={catalog}
                    revision={runsRevision}
                    range={range}
                    timeZone={progress.streakTimeZone}
                  />
                </div>
              ) : null}

              {tab === "account" ? (
                <div className="grid items-start gap-6 lg:grid-cols-2">
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
                          {signIns.slice(0, 8).map((entry) => {
                            const detailText = signInSummary(entry);
                            return (
                              <li key={entry.at} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                                <MaterialIcon name="login" className="text-[18px] text-outline" />
                                <div className="min-w-0">
                                  <time
                                    dateTime={entry.at}
                                    className="block font-body-sm text-body-sm text-on-surface"
                                  >
                                    {formatAbsoluteTime(entry.at)}
                                  </time>
                                  {detailText ? (
                                    <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
                                      {detailText}
                                    </p>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                          {signIns.length > 8 ? (
                            <li className="px-5 py-3 font-body-sm text-body-sm text-outline sm:px-6">
                              +{signIns.length - 8} more
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </Panel>
                  </section>

                  <section aria-label="App use">
                    <h3 className="px-1 font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface">
                      App use
                    </h3>
                    <Panel className="mt-4">
                      {appUses.length === 0 ? (
                        <p className="px-6 py-5 font-body-sm text-body-sm text-on-surface-variant">
                          No app use recorded yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-black/[0.06]">
                          {appUses.slice(0, 8).map((entry) => {
                            const detailText = signInSummary(entry);
                            return (
                              <li
                                key={`${entry.at}-${entry.seenAt}`}
                                className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
                              >
                                <MaterialIcon name="devices" className="text-[18px] text-outline" />
                                <div className="min-w-0">
                                  <time
                                    dateTime={entry.at}
                                    className="block font-body-sm text-body-sm text-on-surface"
                                  >
                                    {formatAbsoluteTime(entry.at)}
                                  </time>
                                  {detailText ? (
                                    <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
                                      {detailText}
                                    </p>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                          {appUses.length > 8 ? (
                            <li className="px-5 py-3 font-body-sm text-body-sm text-outline sm:px-6">
                              +{appUses.length - 8} more
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </Panel>
                  </section>
                </div>
              ) : null}
            </>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {detailError ?? "Loading progress…"}
            </p>
          )}
        </div>
      </div>
      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-6"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            if (deleting) return;
            setPendingDelete(null);
            setDeleteError(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-progress-title"
            className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-progress-title"
              className="font-headline-sm text-headline-sm font-semibold tracking-[-0.02em] text-on-surface"
            >
              Delete {pendingDelete.label}?
            </h2>
            <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
              {pendingDelete.detail} {row.displayName}&apos;s open app drops it the next time it syncs.
            </p>
            {deleteError ? (
              <p className="mt-3 font-body-sm text-body-sm text-[#ff3b30]" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                className="inline-flex h-10 items-center rounded-full px-4 font-label-sm text-label-sm font-semibold text-on-surface transition-colors hover:bg-black/[0.05] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="inline-flex h-10 items-center rounded-full bg-[#ff3b30] px-4 font-label-sm text-label-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete progress"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
