"use client";

import { MaterialIcon } from "@/components/admin/AdminShell";
import {
  ColumnHeader,
  MetricBand,
  Panel,
  VisitRangeSwitch,
  compactDuration,
} from "@/components/admin/student-detail/shared";
import type { AdminVisitRange, StudentDetail, projectStudentVisits } from "@/lib/admin-detail";
import { formatActiveDuration } from "@/lib/progress";

type VisitSummary = ReturnType<typeof projectStudentVisits>["summary"];

export function OverviewTab({
  range,
  onRange,
  summary,
  detail,
  isAdmin,
  interviewAccess,
  openLevels,
  totalLevels,
  openLiving,
  totalLiving,
  onChangeAccess,
}: {
  range: AdminVisitRange;
  onRange: (range: AdminVisitRange) => void;
  summary: VisitSummary;
  detail: StudentDetail;
  isAdmin: boolean;
  interviewAccess: boolean;
  openLevels: number;
  totalLevels: number;
  openLiving: number;
  totalLiving: number;
  onChangeAccess: () => void;
}) {
  return (
    <div className="flex flex-col gap-space-24">
      <div className="grid items-start gap-space-24 lg:grid-cols-2">
        <section aria-label="Activity" className="flex flex-col gap-space-12">
          <ColumnHeader title="Activity" action={<VisitRangeSwitch range={range} onChange={onRange} />} />
          <MetricBand
            items={[
              {
                label: "Active time",
                value: compactDuration(formatActiveDuration(summary.activeSeconds)),
                detail: `${summary.visitCount} ${summary.visitCount === 1 ? "visit" : "visits"}`,
              },
              { label: "Clips studied", value: String(summary.clipCount) },
              {
                label: "Practice clips",
                value: String(summary.exercisesCompleted),
                detail: `${summary.listeningRuns} practice ${summary.listeningRuns === 1 ? "run" : "runs"}`,
              },
              {
                label: "Video",
                value: compactDuration(formatActiveDuration(summary.videoSeconds)),
                detail: `${summary.videosWatched} marked watched`,
              },
            ]}
          />
        </section>

        <section aria-label="Learning" className="flex flex-col gap-space-12">
          <ColumnHeader title="Learning" />
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
        </section>
      </div>

      <section aria-label="Course access" className="flex flex-col gap-space-12">
        <ColumnHeader
          title="Course access"
          action={
            <button
              type="button"
              onClick={onChangeAccess}
              className="rounded-admin-badge text-admin-body-md font-semibold text-admin-cobalt outline-none hover:text-admin-cobalt-strong focus-visible:shadow-admin-focus"
            >
              Change access
            </button>
          }
        />
        <Panel>
          {isAdmin ? (
            <p className="flex items-center gap-space-8 px-space-20 py-space-16 text-admin-body-sm text-admin-ink">
              <MaterialIcon name="verified" className="text-[18px] text-admin-cobalt" filled />
              Admins already have every course.
            </p>
          ) : (
            <dl className="grid gap-px bg-admin-hairline sm:grid-cols-3">
              {[
                { label: "Levels", value: String(openLevels), total: totalLevels },
                { label: "Interview", value: interviewAccess ? "Open" : "Locked", total: null },
                { label: "Leben in Deutschland", value: String(openLiving), total: totalLiving },
              ].map((fact) => (
                <div key={fact.label} className="bg-admin-card px-space-20 py-space-16">
                  <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">{fact.label}</dt>
                  <dd className="mt-1 font-admin-display text-admin-headline-md tabular-nums text-admin-ink">
                    {fact.value}
                    {fact.total != null ? (
                      <span className="text-admin-body-md font-medium text-admin-ink-subtle"> / {fact.total}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </section>
    </div>
  );
}
