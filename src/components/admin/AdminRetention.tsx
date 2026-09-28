"use client";

import { type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  adminRangeLabel,
  type AdminRange,
  type AdminRetentionBoard,
  type AdminRetentionPerson,
  type AdminRetentionPoint,
  type AdminStreakBucket,
} from "@/lib/admin-overview";

const AXIS = "#717785";
const GRID = "#c1c6d6";
const PRIMARY = "#0059b5";
const STREAK = "#00458f";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

function formatDay(day: string | null): string {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatDaysAgo(daysAgo: number): string {
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "1 day ago";
  return `${daysAgo} days ago`;
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
  payload?: AdminRetentionPoint;
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
  const point = payload[0]?.payload;
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
              {row.name?.includes("%") || row.name === "Came back"
                ? formatPercent(typeof row.value === "number" ? row.value : null)
                : typeof row.value === "number"
                  ? formatCount(row.value)
                  : row.value}
            </span>
          </li>
        ))}
        {point && point.cohort > 0 ? (
          <li className="font-caption text-caption text-on-surface-variant">
            {formatCount(point.returned)} of {formatCount(point.cohort)} came back
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function ReturnChart({ data }: { data: readonly AdminRetentionPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 font-body-sm text-body-sm text-on-surface-variant">
        Not enough days yet to measure a next-day return.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length)}
        />
        <YAxis
          domain={[0, 100]}
          width={36}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar
          dataKey="rate"
          name="Came back"
          fill={PRIMARY}
          radius={[4, 4, 0, 0]}
          maxBarSize={data.length === 1 ? 64 : 28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StreakChart({ data }: { data: readonly AdminStreakBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" name="Students" fill={STREAK} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PeopleTable({
  title,
  hint,
  empty,
  rows,
  valueHeader,
  value,
}: {
  title: string;
  hint: string;
  empty: string;
  rows: readonly AdminRetentionPerson[];
  valueHeader: string;
  value: (row: AdminRetentionPerson) => string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">{title}</h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          {empty}
        </p>
      ) : (
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Student</th>
              <th className="px-space-12 py-space-8">Class</th>
              <th className="px-space-12 py-space-8">Last active</th>
              <th className="px-space-16 py-space-8 text-right">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8 font-medium">{row.displayName}</td>
                <td className="px-space-12 py-space-8 text-on-surface-variant">
                  {row.className ?? "—"}
                </td>
                <td className="px-space-12 py-space-8 text-on-surface-variant">
                  {formatDay(row.lastActiveDay)}
                  <span className="mt-0.5 block font-caption text-caption">
                    {formatDaysAgo(row.daysAgo)}
                  </span>
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums">{value(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AdminRetention({
  board,
  range,
  storeConfigured,
}: {
  board: AdminRetentionBoard;
  range: AdminRange;
  storeConfigured: boolean;
}) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const d1Hint =
    range === "today"
      ? "Of people active yesterday, share who also opened the app today."
      : "Of people active on a UTC day, share who also came the next day.";

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="Retention"
        subtitle={`Who came back ${window}, who is on a streak, and who went quiet. Days are UTC, matching streaks.`}
        trailing={
          board.stickiness != null ? (
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Last-day stickiness{" "}
              <span className="font-semibold tabular-nums text-on-surface">
                {formatPercent(board.stickiness)}
              </span>
            </p>
          ) : null
        }
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only counts learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      <section
        aria-label="Retention totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Returning"
          value={formatCount(board.returning)}
          icon="event_repeat"
          hint={`Active ${window}, also seen before it`}
        />
        <SummaryStat
          label="New"
          value={formatCount(board.newcomers)}
          icon="person_add"
          hint={`First seen ${window}`}
        />
        <SummaryStat
          label="Next-day return"
          value={formatPercent(board.d1Rate)}
          icon="redo"
          hint={
            board.d1Cohort === 0
              ? "No earlier day to compare"
              : `${formatCount(board.d1Returned)} of ${formatCount(board.d1Cohort)} came back`
          }
        />
        <SummaryStat
          label="On a streak"
          value={formatCount(board.onStreak)}
          icon="local_fire_department"
          hint="Current streak of 2 or more UTC days"
        />
        <SummaryStat
          label="Quiet"
          value={formatCount(board.lapsed)}
          icon="hourglass_disabled"
          hint={
            range === "today"
              ? "Last seen before yesterday"
              : `Seen before this window, not ${window}`
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <ChartCard title="Came back the next day" hint={d1Hint}>
          <ReturnChart data={board.d1} />
        </ChartCard>
        <ChartCard
          title="Current streaks"
          hint="Every synced student, including those at zero. The streak is the same one the learner app shows."
        >
          <StreakChart data={board.streaks} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <PeopleTable
          title="Longest streaks"
          hint="Students whose current streak is at least two days."
          empty="Nobody is on a streak of two days or more."
          rows={board.streakLeaders}
          valueHeader="Streak"
          value={(row) => `${row.streakDays} ${row.streakDays === 1 ? "day" : "days"}`}
        />
        <PeopleTable
          title="Gone quiet"
          hint={
            range === "today"
              ? "Last seen two or more UTC days ago."
              : "Practiced or opened the app before this window, not since."
          }
          empty="Nobody in this window looks lapsed."
          rows={board.lapsedPeople}
          valueHeader="Away"
          value={(row) => formatDaysAgo(row.daysAgo)}
        />
      </div>
    </main>
  );
}
