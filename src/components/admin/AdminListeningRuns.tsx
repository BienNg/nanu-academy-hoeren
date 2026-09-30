"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  describeCatalogClip,
  describeCatalogLesson,
  type AdminCatalogCourse,
} from "@/lib/admin-detail";
import {
  ADMIN_PAGE_SIZE,
  adminRangeLabel,
  type AdminListeningLessonStat,
  type AdminListeningRunBoard,
  type AdminListeningRunPoint,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { LISTENING_SCHEMA_HINT, type ListeningReadStatus } from "@/lib/listening-runs";

const AXIS = "#717785";
const GRID = "#c1c6d6";
const PASSED = "#0059b5";
const FAILED = "#ba1a1a";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function SummaryStat({
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

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">{hint}</p>
      </div>
      <div className="h-64 w-full px-space-8 pb-space-12 sm:h-72">{children}</div>
    </section>
  );
}

type TooltipRow = {
  name?: string;
  value?: number | string;
  color?: string;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipRow[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-space-12 py-space-8 shadow-sm">
      <p className="font-label-sm text-label-sm font-semibold text-on-surface">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-space-16 font-caption text-caption text-on-surface-variant"
          >
            <span className="flex items-center gap-space-8">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              {row.name}
            </span>
            <span className="tabular-nums text-on-surface">
              {typeof row.value === "number" ? formatCount(row.value) : row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function RunChart({ data }: { data: readonly AdminListeningRunPoint[] }) {
  const hasVolume = data.some((point) => point.passed > 0 || point.failed > 0);
  if (!hasVolume) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 font-body-sm text-body-sm text-on-surface-variant">
        No finished parts in this window.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length)}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} iconType="circle" iconSize={8} />
        <Bar dataKey="passed" name="Passed" stackId="runs" fill={PASSED} maxBarSize={28} />
        <Bar
          dataKey="failed"
          name="Failed"
          stackId="runs"
          fill={FAILED}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LessonsTable({
  rows,
  catalog,
}: {
  rows: readonly AdminListeningLessonStat[];
  catalog: readonly AdminCatalogCourse[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          Lessons that failed
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          Ranked by failed parts in this window.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          No finished parts in this window.
        </p>
      ) : (
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Lesson</th>
              <th className="px-space-12 py-space-8 text-right">Passed</th>
              <th className="px-space-12 py-space-8 text-right">Failed</th>
              <th className="px-space-16 py-space-8 text-right">Avg. accuracy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const place = describeCatalogLesson(catalog, row.lessonKey);
              const label = place ? `${place.course} · ${place.lesson}` : row.lessonKey;
              return (
                <tr
                  key={row.lessonKey}
                  className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
                >
                  <td className="px-space-16 py-space-8 font-medium">{label}</td>
                  <td className="px-space-12 py-space-8 text-right tabular-nums">
                    {formatCount(row.passed)}
                  </td>
                  <td className="px-space-12 py-space-8 text-right tabular-nums">
                    {formatCount(row.failed)}
                  </td>
                  <td className="px-space-16 py-space-8 text-right tabular-nums font-medium">
                    {row.runs === 0 ? "—" : `${Math.round(row.accuracySum / row.runs)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MissedWords({
  catalog,
  lessonKey,
  clipIds,
}: {
  catalog: readonly AdminCatalogCourse[];
  lessonKey: string;
  clipIds: readonly string[];
}) {
  if (clipIds.length === 0) return null;
  return (
    <ul className="mt-1 max-w-[14rem] space-y-0.5">
      {clipIds.map((clipId) => (
        <li key={clipId} className="font-caption text-caption text-on-surface">
          {describeCatalogClip(catalog, lessonKey, clipId).prompt}
        </li>
      ))}
    </ul>
  );
}

export function AdminListeningRuns({
  board,
  people,
  catalog,
  range,
  status,
  storeConfigured,
  missedClipIds,
}: {
  board: AdminListeningRunBoard;
  people: readonly AdminUserRow[];
  catalog: readonly AdminCatalogCourse[];
  range: AdminRange;
  status: ListeningReadStatus;
  storeConfigured: boolean;
  missedClipIds: Record<string, readonly string[]>;
}) {
  const names = useMemo(
    () => new Map(people.map((row) => [row.userId, row.displayName])),
    [people],
  );
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "fail">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return board.recent.filter((run) => {
      if (outcome !== "all" && run.outcome !== outcome) return false;
      if (!needle) return true;
      const place = describeCatalogLesson(catalog, run.lessonKey);
      const name = names.get(run.userId) ?? run.userId;
      const haystack = [name, place?.course, place?.lesson, run.lessonKey]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [board.recent, catalog, names, outcome, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * ADMIN_PAGE_SIZE, filtered.length);

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Learning"
        title="Practice"
        subtitle={`Finished practice parts ${window}. Days are UTC, the same boundary as Activity.`}
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. Finished parts live in Supabase.
        </div>
      ) : null}

      {storeConfigured && status === "missing" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          {LISTENING_SCHEMA_HINT}
        </div>
      ) : null}

      {storeConfigured && status === "error" ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Practice parts could not be loaded.
        </div>
      ) : null}

      <section
        aria-label="Practice totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Practice parts"
          value={formatCount(board.runs)}
          icon="headphones"
          hint={`Finished ${window}`}
        />
        <SummaryStat
          label="Passed"
          value={formatCount(board.passed)}
          icon="check_circle"
          hint="Cleared every clip in the part"
        />
        <SummaryStat
          label="Failed"
          value={formatCount(board.failed)}
          icon="heart_broken"
          hint="Ran out of hearts"
        />
        <SummaryStat
          label="Accuracy"
          value={board.runs === 0 ? "—" : `${board.avgAccuracy}%`}
          icon="percent"
          hint="Average across finished parts"
        />
        <SummaryStat
          label="Students"
          value={formatCount(board.students)}
          icon="group"
          hint={`Who finished a part ${window}`}
        />
      </section>

      <ChartCard
        title="Parts by day"
        hint="UTC days. A part is counted on the day it finished."
      >
        <RunChart data={board.points} />
      </ChartCard>

      <LessonsTable rows={board.lessons} catalog={catalog} />

      <section className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-space-12 px-space-16 py-space-12">
          <div>
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Recent parts
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Newest first. Open a student on Students for clip-by-clip detail.
            </p>
          </div>
          <div className="flex flex-col gap-space-12 lg:flex-row lg:items-center">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Search practice parts</span>
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-space-12 top-1/2 -translate-y-1/2 text-[20px] text-outline"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search student or lesson"
                className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-space-8 pl-10 pr-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
              />
            </label>
            <div role="tablist" aria-label="Filter by outcome" className="flex flex-wrap gap-space-8">
              {(
                [
                  ["all", "All"],
                  ["success", "Passed"],
                  ["fail", "Failed"],
                ] as const
              ).map(([id, label]) => {
                const on = outcome === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setOutcome(id);
                      setPage(1);
                    }}
                    className={`inline-flex h-9 items-center rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                      on
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  When
                </th>
                <th className="px-space-12 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Student
                </th>
                <th className="px-space-12 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Lesson
                </th>
                <th className="px-space-12 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Result
                </th>
                <th className="px-space-12 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Accuracy
                </th>
                <th className="px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                  >
                    {board.recent.length === 0
                      ? "No finished parts in this window."
                      : "No parts match this filter."}
                  </td>
                </tr>
              ) : (
                pageRows.map((run) => {
                  const place = describeCatalogLesson(catalog, run.lessonKey);
                  const lesson = place
                    ? `${place.course} · ${place.lesson}`
                    : run.lessonKey;
                  return (
                    <tr
                      key={run.id}
                      className="border-t border-outline-variant/20 font-body-sm text-body-sm text-on-surface"
                    >
                      <td className="px-space-16 py-space-12 align-top">
                        <p className="whitespace-nowrap tabular-nums text-on-surface-variant">
                          {formatWhen(run.createdAt)}
                        </p>
                        {run.accuracy < 100 ? (
                          <MissedWords
                            catalog={catalog}
                            lessonKey={run.lessonKey}
                            clipIds={missedClipIds[run.id] ?? []}
                          />
                        ) : null}
                      </td>
                      <td className="px-space-12 py-space-12 font-medium">
                        {names.get(run.userId) ?? run.userId}
                      </td>
                      <td className="px-space-12 py-space-12">
                        <p>{lesson}</p>
                        <p className="font-caption text-caption text-on-surface-variant">
                          Part {run.partNumber} of {run.partCount}
                        </p>
                      </td>
                      <td className="px-space-12 py-space-12">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                            run.outcome === "success"
                              ? "bg-[#34C759]/15 text-[#248a3d]"
                              : "bg-[#ff3b30]/10 text-[#ff3b30]"
                          }`}
                          aria-label={run.outcome === "success" ? "Passed" : "Out of hearts"}
                        >
                          <MaterialIcon
                            name={run.outcome === "success" ? "check_circle" : "heart_broken"}
                            className="text-[18px]"
                            filled
                          />
                        </span>
                      </td>
                      <td className="px-space-12 py-space-12 text-right tabular-nums">
                        {run.accuracy}%
                      </td>
                      <td className="px-space-16 py-space-12 text-right tabular-nums">
                        {formatElapsed(run.elapsedMs)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {filtered.length === 0
              ? "0 parts"
              : `${rangeStart}–${rangeEnd} of ${filtered.length}`}
          </p>
          <div className="flex items-center gap-space-8">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container disabled:text-outline"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
