import { MaterialIcon } from "@/components/admin/AdminShell";
import { Badge } from "@/components/admin/AdminUi";
import {
  buildLessonTimingTrail,
  formatLessonGap,
  type AdminCatalogCourse,
  type LessonStartSignal,
  type LessonTimingNode,
} from "@/lib/admin-detail";
import { formatAdminTimestamp } from "@/lib/admin-overview";
import type { StoredProgress } from "@/lib/progress";

const NODE_ICON: Record<LessonTimingNode["kind"], string> = {
  video: "smart_display",
  study: "menu_book",
  practice: "fitness_center",
};

function Clock({ iso }: { iso: string }) {
  const label = formatAdminTimestamp(iso);
  if (!label) return null;
  return <time dateTime={iso}>{label}</time>;
}

/**
 * One student's level path. Each Lektion shows when it opened, how long until
 * the first Study or Practice node, and when finishing it opened the next one.
 */
export function LessonTimingPath({
  course,
  progress,
  signInAts,
  signals,
}: {
  course: AdminCatalogCourse | undefined;
  progress: StoredProgress;
  signInAts: readonly string[];
  signals: readonly LessonStartSignal[];
}) {
  if (!course || course.kind !== "cefr" || course.living) return null;
  const lessons = buildLessonTimingTrail(course, progress, signInAts, signals);
  if (lessons.length === 0) return null;

  return (
    <section aria-label={`${course.shortLabel} path`} className="flex flex-col gap-space-12">
      <div>
        <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">{course.shortLabel} path</h3>
        <p className="mt-1 text-admin-body-sm text-admin-ink-muted">
          Lektion 1 access is the first sign-in or the first activity in this level. Each later
          Lektion opens when the one before it is completed.
        </p>
      </div>
      <ol className="flex w-full flex-col gap-space-16">
        {lessons.map((lesson, index) => {
          const next = lessons[index + 1];
          const first = lesson.nodes.find((node) => node.first);
          return (
            <li key={lesson.id} className="flex flex-col">
              <div className="rounded-admin-card border border-admin-hairline bg-admin-card px-space-16 py-space-12 shadow-admin-card">
                <h4 className="flex min-w-0 items-center gap-space-8 font-admin-display text-admin-headline-sm text-admin-ink">
                  <Badge tone="amber">{course.shortLabel}</Badge>
                  <span className="truncate">{lesson.label}</span>
                </h4>
                <dl className="mt-space-12 grid gap-space-8 sm:grid-cols-3">
                  <div>
                    <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">Access</dt>
                    <dd className="mt-0.5 text-admin-body-sm text-admin-ink">
                      {lesson.accessAt ? <Clock iso={lesson.accessAt} /> : "Not recorded"}
                      {lesson.accessApproximate ? (
                        <span className="mt-0.5 block text-[12px] leading-4 text-admin-ink-subtle">
                          Approximate
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">
                      {first?.label ?? "First node"}
                    </dt>
                    <dd className="mt-0.5 text-admin-body-sm text-admin-ink">
                      {lesson.waitToStartMs != null ? (
                        <>
                          {formatLessonGap(lesson.waitToStartMs)}
                          <span className="mt-0.5 block text-[12px] leading-4 text-admin-ink-subtle">
                            after access
                          </span>
                        </>
                      ) : lesson.startedAt ? (
                        <Clock iso={lesson.startedAt} />
                      ) : (
                        "Not recorded"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">Completed</dt>
                    <dd className="mt-0.5 text-admin-body-sm text-admin-ink">
                      {lesson.completedAt ? <Clock iso={lesson.completedAt} /> : "Not completed"}
                      {lesson.completedAt && next ? (
                        <span className="mt-0.5 block text-[12px] leading-4 text-admin-ink-subtle">
                          Opened {next.label}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </div>
              {lesson.nodes.length > 0 ? (
                <ul className="flex flex-col gap-space-8 py-space-12 pl-space-16">
                  {lesson.nodes.map((node) => (
                    <li key={node.id} className="flex items-center gap-space-8">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-subtle text-admin-ink">
                        <MaterialIcon name={NODE_ICON[node.kind]} className="text-[18px]" />
                      </span>
                      <span className="min-w-0 text-[13px] font-semibold text-admin-ink">{node.label}</span>
                      {node.first && lesson.waitToStartMs != null ? (
                        <span className="text-[12px] text-admin-ink-subtle">
                          {formatLessonGap(lesson.waitToStartMs)} after access
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
