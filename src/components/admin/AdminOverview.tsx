"use client";

import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { describeCatalogClip, type AdminCatalogCourse } from "@/lib/admin-detail";
import {
  adminRangeLabel,
  type AdminActivityStats,
  type AdminRange,
} from "@/lib/admin-overview";
import {
  LISTENING_SCHEMA_HINT,
  type ClipOutcomeTotal,
  type RankedClipOutcomes,
} from "@/lib/listening-runs";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function ActivityStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
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
      <p className="mt-space-12 font-headline-lg text-headline-lg tabular-nums text-on-surface">
        {value}
      </p>
      <p className="mt-1 font-caption text-caption text-on-surface-variant">{hint}</p>
    </div>
  );
}

function clipExcerpt(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 110) return trimmed;
  return `${trimmed.slice(0, 107)}…`;
}

function outcomeCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? singular : plural}`;
}

function ClipRankPanel({
  title,
  icon,
  empty,
  rows,
  catalog,
  count,
  countLabel,
  students,
}: {
  title: string;
  icon: string;
  empty: string;
  rows: readonly ClipOutcomeTotal[];
  catalog: readonly AdminCatalogCourse[];
  count: (row: ClipOutcomeTotal) => number;
  countLabel: readonly [string, string];
  students: (row: ClipOutcomeTotal) => number;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="flex items-center gap-space-8 border-b border-outline-variant/20 px-space-16 py-space-12">
        <MaterialIcon name={icon} className="text-[20px] text-primary" />
        <h3 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          {empty}
        </p>
      ) : (
        <ol>
          {rows.map((row, index) => {
            const described = describeCatalogClip(catalog, row.lessonKey, row.clipId);
            const place = described.lesson
              ? `${described.course} · ${described.lesson}`
              : described.course;
            const studentCount = students(row);
            return (
              <li
                key={`${row.lessonKey}:${row.clipId}`}
                className="flex items-start gap-space-12 border-b border-outline-variant/15 px-space-16 py-space-12 last:border-b-0"
              >
                <span className="mt-0.5 w-5 shrink-0 font-label-sm text-label-sm font-semibold tabular-nums text-outline">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-caption text-caption text-on-surface-variant">
                    {place}
                  </span>
                  <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface">
                    {clipExcerpt(described.prompt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-label-sm text-label-sm font-semibold tabular-nums text-on-surface">
                    {outcomeCount(count(row), countLabel[0], countLabel[1])}
                  </span>
                  <span className="mt-0.5 block font-caption text-caption text-on-surface-variant">
                    {outcomeCount(studentCount, "student", "students")}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ListeningClipSection({
  catalog,
  outcomes,
}: {
  catalog: readonly AdminCatalogCourse[];
  outcomes: RankedClipOutcomes;
}) {
  return (
    <section aria-label="Listening clips" className="flex flex-col gap-space-12">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Listening clips</h2>
        <p className="font-caption text-caption text-on-surface-variant">
          All-time totals across every student. A clip they miss and then correct counts in
          both lists.
        </p>
      </div>
      {outcomes.status === "missing" ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-space-20 py-space-16 font-body-sm text-body-sm text-on-surface-variant">
          {LISTENING_SCHEMA_HINT}
        </div>
      ) : outcomes.status === "error" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Clip results could not be loaded.
        </div>
      ) : (
        <div className="grid gap-space-12 lg:grid-cols-2">
          <ClipRankPanel
            title="Failed most"
            icon="heart_broken"
            empty="No clip has been missed yet."
            rows={outcomes.failed}
            catalog={catalog}
            count={(row) => row.failures}
            countLabel={["miss", "misses"]}
            students={(row) => row.studentsFailed}
          />
          <ClipRankPanel
            title="Succeeded most"
            icon="check_circle"
            empty="No clip has been passed yet."
            rows={outcomes.succeeded}
            catalog={catalog}
            count={(row) => row.successes}
            countLabel={["pass", "passes"]}
            students={(row) => row.studentsPassed}
          />
        </div>
      )}
    </section>
  );
}

type AdminOverviewProps = {
  activity: AdminActivityStats;
  range: AdminRange;
  courseCatalog: readonly AdminCatalogCourse[];
  clipOutcomes: RankedClipOutcomes;
  storeConfigured: boolean;
};

export function AdminOverview({
  activity,
  range,
  courseCatalog,
  clipOutcomes,
  storeConfigured,
}: AdminOverviewProps) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Admin"
        title="Overview"
        subtitle={`Platform activity ${window}. Days are UTC, the same boundary as streaks.`}
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This dashboard only counts learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      <section aria-label="Activity" className="flex flex-col gap-space-12">
        <div className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5">
          <ActivityStat
            label="Users"
            value={formatCount(activity.users)}
            icon="group"
            hint="Accounts with synced progress"
          />
          <ActivityStat
            label="Active"
            value={formatCount(activity.activeUsers)}
            icon="person"
            hint={`Seen or practiced ${window}`}
          />
          <ActivityStat
            label="Videos watched"
            value={formatCount(activity.videosWatched)}
            icon="smart_display"
            hint={`Marked watched ${window}`}
          />
          <ActivityStat
            label="Study runs"
            value={formatCount(activity.studyRuns)}
            icon="menu_book"
            hint={`Finished ${window}`}
          />
          <ActivityStat
            label="Practice runs"
            value={formatCount(activity.practiceRuns)}
            icon="headphones"
            hint={`Listening runs finished ${window}`}
          />
        </div>
      </section>

      {storeConfigured ? (
        <ListeningClipSection catalog={courseCatalog} outcomes={clipOutcomes} />
      ) : null}
    </main>
  );
}
