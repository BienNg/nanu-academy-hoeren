"use client";

import { Badge, Button } from "@/components/admin/AdminUi";
import { LessonTimingPath } from "@/components/admin/student-detail/LessonTimingPath";
import { LessonBlock } from "@/components/admin/student-detail/meters";
import {
  AccessSwitch,
  ColumnHeader,
  EmptyPanel,
  Panel,
} from "@/components/admin/student-detail/shared";
import type {
  AdminCatalogCourse,
  AdminCourseDetail,
  AdminLessonDetail,
  LessonStartSignal,
  StudentProgressTarget,
} from "@/lib/admin-detail";
import type { StoredProgress } from "@/lib/progress";

export type PendingDelete = StudentProgressTarget & { label: string; detail: string };

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
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-space-16 border-b border-admin-hairline px-space-16 py-space-12 last:border-b-0 ${
        selected ? "bg-admin-cobalt-wash" : ""
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
        <Badge tone={granted ? "emerald" : "neutral"}>{granted ? "Open" : "Locked"}</Badge>
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-w-0 rounded-admin-badge text-left outline-none focus-visible:shadow-admin-focus"
      >
        <span className="flex items-baseline justify-between gap-space-12">
          <span
            className={`truncate text-admin-body-md ${
              selected ? "font-semibold text-admin-cobalt-ink" : "font-medium text-admin-ink"
            }`}
          >
            {course.shortLabel}
          </span>
          <span
            className={`shrink-0 text-admin-label-md font-semibold tabular-nums ${
              selected ? "text-admin-cobalt" : "text-admin-ink-subtle"
            }`}
          >
            {course.started ? `${course.percent}%` : "Not started"}
          </span>
        </span>
        <span className="mt-space-8 block h-1 overflow-hidden rounded-full bg-admin-hairline">
          <span
            className={`block h-full rounded-full ${selected ? "bg-admin-cobalt" : "bg-admin-ink-faint"}`}
            style={{ width: `${course.percent}%` }}
          />
        </span>
      </button>
    </div>
  );
}

export function CoursesTab({
  accessError,
  levels,
  interviewCourses,
  livingCourses,
  course,
  catalogCourse,
  progress,
  signInAts,
  startSignals,
  lessons,
  granted,
  isAdmin,
  canGrant = true,
  interviewAccess,
  accessSaving,
  canDelete,
  onSelectCourse,
  onToggleLevel,
  onToggleInterview,
  onToggleLiving,
  onRequestDelete,
}: {
  accessError: string | null;
  levels: readonly AdminCourseDetail[];
  interviewCourses: readonly AdminCourseDetail[];
  livingCourses: readonly AdminCourseDetail[];
  course: AdminCourseDetail | undefined;
  catalogCourse: AdminCatalogCourse | undefined;
  progress: StoredProgress;
  signInAts: readonly string[];
  startSignals: readonly LessonStartSignal[];
  lessons: readonly AdminLessonDetail[];
  granted: (course: AdminCourseDetail) => boolean;
  isAdmin: boolean;
  /** Teachers can see grants. They cannot change them. */
  canGrant?: boolean;
  interviewAccess: boolean;
  accessSaving: boolean;
  canDelete: boolean;
  onSelectCourse: (courseId: string) => void;
  onToggleLevel: (slug: string) => void;
  onToggleInterview: () => void;
  onToggleLiving: (course: AdminCourseDetail) => void;
  onRequestDelete: (pending: PendingDelete) => void;
}) {
  const done = lessons.filter((lesson) => lesson.status === "completed").length;

  return (
    <div className="flex flex-col gap-space-16">
      {accessError ? (
        <p
          role="alert"
          className="rounded-admin-control border border-admin-crimson-border bg-admin-crimson-wash px-space-12 py-space-8 text-admin-body-sm text-admin-crimson-ink"
        >
          {accessError}
        </p>
      ) : null}
      <div className="grid items-start gap-space-24 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-space-24">
          <section aria-label="Levels" className="flex flex-col gap-space-12">
            <ColumnHeader title="Levels" description="Unlock a level, then open it to see Lektionen." />
            <Panel>
              {levels.length === 0 ? (
                <p className="px-space-16 py-space-16 text-admin-body-sm text-admin-ink-muted">
                  No levels in the catalog.
                </p>
              ) : (
                levels.map((entry) => (
                  <CourseAccessRow
                    key={entry.id}
                    course={entry}
                    selected={entry.id === course?.id}
                    granted={granted(entry)}
                    showSwitch
                    switchDisabled={isAdmin || !canGrant || accessSaving}
                    onSelect={() => onSelectCourse(entry.id)}
                    onToggle={() => onToggleLevel(entry.id)}
                  />
                ))
              )}
            </Panel>
          </section>

          {interviewCourses.length > 0 ? (
            <section aria-label="Interview" className="flex flex-col gap-space-12">
              <ColumnHeader
                title="Interview"
                description="One grant opens every profession track."
                action={
                  <AccessSwitch
                    on={isAdmin || interviewAccess}
                    disabled={isAdmin || !canGrant || accessSaving}
                    label={interviewAccess ? "Lock interview practice" : "Unlock interview practice"}
                    onToggle={onToggleInterview}
                  />
                }
              />
              <Panel>
                {interviewCourses.map((entry) => (
                  <CourseAccessRow
                    key={entry.id}
                    course={entry}
                    selected={entry.id === course?.id}
                    granted={granted(entry)}
                    showSwitch={false}
                    switchDisabled
                    onSelect={() => onSelectCourse(entry.id)}
                    onToggle={() => undefined}
                  />
                ))}
              </Panel>
            </section>
          ) : null}

          {livingCourses.length > 0 ? (
            <section aria-label="Leben in Deutschland" className="flex flex-col gap-space-12">
              <ColumnHeader title="Leben in Deutschland" description="Each workplace is granted on its own." />
              <Panel>
                {livingCourses.map((entry) => (
                  <CourseAccessRow
                    key={entry.id}
                    course={entry}
                    selected={entry.id === course?.id}
                    granted={granted(entry)}
                    showSwitch
                    switchDisabled={isAdmin || !canGrant || accessSaving}
                    onSelect={() => onSelectCourse(entry.id)}
                    onToggle={() => onToggleLiving(entry)}
                  />
                ))}
              </Panel>
            </section>
          ) : null}
        </div>

        <section aria-label="Course progress" className="min-w-0">
          {course ? (
            <div className="flex flex-col gap-space-12">
              <ColumnHeader
                title={course.label}
                description={`${granted(course) ? "Access open" : "Access locked"}${
                  course.started ? ` · ${done}/${lessons.length} done` : " · Not started"
                }`}
                action={
                  canDelete && course.started ? (
                    <Button
                      variant="destructive"
                      icon="delete"
                      onClick={() =>
                        onRequestDelete({
                          scope: "course",
                          courseId: course.id,
                          label: course.label,
                          detail: `Every Lektion in ${course.label} is cleared.`,
                        })
                      }
                    >
                      Clear
                    </Button>
                  ) : null
                }
              />
              {course.kind === "cefr" && !course.living ? (
                <LessonTimingPath
                  course={catalogCourse}
                  progress={progress}
                  signInAts={signInAts}
                  signals={startSignals}
                />
              ) : null}
              {lessons.length === 0 ? (
                <EmptyPanel>No lessons with content in this course yet.</EmptyPanel>
              ) : (
                lessons.map((lesson) => (
                  <LessonBlock
                    key={lesson.id}
                    lesson={lesson}
                    onDeleteLesson={
                      !canDelete || lesson.status === "not-started"
                        ? undefined
                        : () =>
                            onRequestDelete({
                              scope: "lesson",
                              courseId: course.id,
                              lessonId: lesson.id,
                              label: lesson.label,
                              detail: `Study, practice, and videos in ${lesson.label} are cleared.`,
                            })
                    }
                    onDeletePart={
                      canDelete
                        ? (part, label) =>
                            onRequestDelete({
                              scope: "part",
                              courseId: course.id,
                              lessonId: lesson.id,
                              part,
                              label: `${lesson.label} · ${label}`,
                              detail: `${label} in ${lesson.label} is cleared. The rest of the Lektion stays.`,
                            })
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          ) : (
            <EmptyPanel>No courses in the catalog.</EmptyPanel>
          )}
        </section>
      </div>
    </div>
  );
}
