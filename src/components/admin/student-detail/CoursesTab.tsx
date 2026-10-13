"use client";

import { useMemo } from "react";
import { worldAreas } from "@/data/grammar/world";
import tensesFile from "@/data/grammar/tenses.json";
import { Badge, Button } from "@/components/admin/AdminUi";
import { LessonTimingPath } from "@/components/admin/student-detail/LessonTimingPath";
import { LessonBlock } from "@/components/admin/student-detail/meters";
import {
  AccessSwitch,
  ColumnHeader,
  DeleteProgressButton,
  EmptyPanel,
  Panel,
  formatAbsoluteTime,
} from "@/components/admin/student-detail/shared";
import {
  projectGrammarWorld,
  type AdminCatalogCourse,
  type AdminCourseDetail,
  type AdminGrammarArea,
  type AdminGrammarStage,
  type AdminLessonDetail,
  type LessonStartSignal,
  type StudentProgressTarget,
} from "@/lib/admin-detail";
import { resolveWorld } from "@/lib/grammar-world";
import type { TenseTables } from "@/lib/grammar-lessons";
import type { StoredProgress } from "@/lib/progress";

const grammarAreas = resolveWorld(worldAreas);
const grammarTables = tensesFile as TenseTables;

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
  const grammar = useMemo(
    () => projectGrammarWorld(progress, grammarAreas, grammarTables),
    [progress],
  );

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
      {grammar.areas.length > 0 ? (
        <GrammarWorldPanel
          world={grammar}
          canDelete={canDelete}
          onRequestDelete={onRequestDelete}
        />
      ) : null}
    </div>
  );
}

function GrammarWorldPanel({
  world,
  canDelete,
  onRequestDelete,
}: {
  world: ReturnType<typeof projectGrammarWorld>;
  canDelete: boolean;
  onRequestDelete: (pending: PendingDelete) => void;
}) {
  return (
    <section aria-label="Grammar world" className="flex flex-col gap-space-12">
      <ColumnHeader
        title="Grammar world"
        description={
          world.hasProgress
            ? `${world.stars}/${world.starsTotal} stars`
            : "Not started"
        }
        action={
          canDelete && world.hasProgress ? (
            <Button
              variant="destructive"
              icon="delete"
              onClick={() =>
                onRequestDelete({
                  scope: "grammar-world",
                  label: "grammar world",
                  detail: "Every grammar world stage and flag is cleared. Lektionen stay.",
                })
              }
            >
              Clear
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-space-12">
        {world.areas.filter((area) => area.stages.length > 0).map((area) => (
          <GrammarAreaBlock
            key={area.id}
            area={area}
            canDelete={canDelete}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
    </section>
  );
}

function GrammarAreaBlock({
  area,
  canDelete,
  onRequestDelete,
}: {
  area: AdminGrammarArea;
  canDelete: boolean;
  onRequestDelete: (pending: PendingDelete) => void;
}) {
  const summit = area.summitAt ? formatAbsoluteTime(area.summitAt) : null;
  return (
    <div className="overflow-hidden rounded-admin-card border border-admin-hairline bg-admin-card shadow-admin-card">
      <div className="flex items-center justify-between gap-space-8 border-b border-admin-hairline bg-admin-canvas px-space-16 py-space-8">
        <div className="flex min-w-0 items-center gap-space-8">
          <h4 className="truncate text-admin-body-md font-semibold text-admin-ink">{area.titleDe}</h4>
          <span className="truncate text-admin-body-sm text-admin-ink-subtle">{area.titleVi}</span>
          {summit ? <Badge tone="emerald">Flag {summit}</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-space-8">
          <span className="text-[12px] leading-4 tabular-nums text-admin-ink-subtle">
            {area.hasProgress ? `${area.stars}/${area.starsTotal}` : "Not started"}
          </span>
          {canDelete && area.hasProgress ? (
            <DeleteProgressButton
              label={`Delete ${area.titleDe} progress`}
              onClick={() =>
                onRequestDelete({
                  scope: "grammar-area",
                  areaId: area.id,
                  label: area.titleDe,
                  detail: `Stages and the flag on ${area.titleDe} are cleared. Other areas stay.`,
                })
              }
            />
          ) : null}
        </div>
      </div>
      <ul className="divide-y divide-admin-hairline">
        {area.stages.map((stage) => (
          <GrammarStageRow
            key={stage.id}
            stage={stage}
            canDelete={canDelete}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function GrammarStageRow({
  stage,
  canDelete,
  onRequestDelete,
}: {
  stage: AdminGrammarStage;
  canDelete: boolean;
  onRequestDelete: (pending: PendingDelete) => void;
}) {
  const detail = stage.hasProgress
    ? [
        `${stage.stars}/${stage.starsTotal} stars`,
        stage.reviewRuns > 0 ? `Review ×${stage.reviewRuns}` : null,
        stage.done ? "Done" : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : "Not started";
  return (
    <li className="flex items-center justify-between gap-space-12 px-space-16 py-space-12">
      <div className="min-w-0">
        <p className="truncate text-admin-body-md font-medium text-admin-ink">{stage.titleDe}</p>
        <p className="truncate text-admin-body-sm text-admin-ink-subtle">{stage.titleVi}</p>
      </div>
      <div className="flex shrink-0 items-center gap-space-8">
        <span className="text-admin-body-sm tabular-nums text-admin-ink-muted">{detail}</span>
        {canDelete && stage.hasProgress ? (
          <DeleteProgressButton
            label={`Delete ${stage.titleDe} progress`}
            onClick={() =>
              onRequestDelete({
                scope: "grammar-stage",
                topicId: stage.id,
                label: stage.titleDe,
                detail: `${stage.titleDe} is cleared. Other stages stay.`,
              })
            }
          />
        ) : null}
      </div>
    </li>
  );
}
