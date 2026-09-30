"use client";

import { type ReactNode } from "react";
import {
  Area,
  AreaChart,
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
  adminRangeLabel,
  type AdminActivityBoard,
  type AdminActivityGrain,
  type AdminActivityLeader,
  type AdminActivityPoint,
  type AdminActivityStats,
  type AdminRange,
} from "@/lib/admin-overview";

const AXIS = "#717785";
const GRID = "#c1c6d6";
const PRIMARY = "#0059b5";
const PRIMARY_FILL = "#d7e2ff";
const STUDY = "#00458f";
const PRACTICE = "#0071e3";
const VIDEOS = "#5e5e63";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatMinutes(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe < 30) return "0 min";
  const minutes = Math.round(safe / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
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

function tickInterval(count: number, grain: AdminActivityGrain): number | "preserveStartEnd" {
  if (grain === "hour") return 3;
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function PeopleChart({
  data,
  grain,
}: {
  data: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length, grain)}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="activeUsers"
          name="Active people"
          stroke={PRIMARY}
          fill={PRIMARY_FILL}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function WorkChart({
  data,
  grain,
}: {
  data: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  const bars =
    grain === "hour"
      ? [
          { key: "clips", name: "Clips studied", color: STUDY },
          { key: "practiceRuns", name: "Practice runs", color: PRACTICE },
          { key: "videosWatched", name: "Videos watched", color: VIDEOS },
        ]
      : [
          { key: "studyRuns", name: "Study runs", color: STUDY },
          { key: "practiceRuns", name: "Practice runs", color: PRACTICE },
          { key: "videosWatched", name: "Videos watched", color: VIDEOS },
        ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length, grain)}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: AXIS }}
          iconType="circle"
          iconSize={8}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={grain === "hour" ? 12 : 18}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TotalsTable({
  points,
  grain,
}: {
  points: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  const workHeader = grain === "hour" ? "Clips" : "Study";
  const practiceHeader = grain === "hour" ? "Runs" : "Practice";
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          {grain === "hour" ? "By hour" : "By day"}
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          The same numbers as the charts, for scanning and for screen readers.
        </p>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead className="sticky top-0 bg-surface-container-low">
            <tr className="font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">{grain === "hour" ? "Hour" : "Day"}</th>
              <th className="px-space-12 py-space-8 text-right">People</th>
              <th className="px-space-12 py-space-8 text-right">Time</th>
              <th className="px-space-12 py-space-8 text-right">{workHeader}</th>
              <th className="px-space-12 py-space-8 text-right">{practiceHeader}</th>
              <th className="px-space-16 py-space-8 text-right">Videos</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={point.key}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8">{point.label}</td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(point.activeUsers)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatMinutes(point.activeSeconds)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(grain === "hour" ? point.clips : point.studyRuns)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(point.practiceRuns)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums">
                  {formatCount(point.videosWatched)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadersTable({ leaders }: { leaders: readonly AdminActivityLeader[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          Most time in the app
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          Ranked by active minutes in this window, then by videos and runs.
        </p>
      </div>
      {leaders.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          Nobody opened the app in this window.
        </p>
      ) : (
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Student</th>
              <th className="px-space-12 py-space-8">Class</th>
              <th className="px-space-12 py-space-8 text-right">Time</th>
              <th className="px-space-12 py-space-8 text-right">Videos</th>
              <th className="px-space-12 py-space-8 text-right">Study</th>
              <th className="px-space-16 py-space-8 text-right">Practice</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((row) => (
              <tr
                key={row.userId}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8 font-medium">{row.displayName}</td>
                <td className="px-space-12 py-space-8 text-on-surface-variant">
                  {row.className ?? "—"}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatMinutes(row.activeSeconds)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.videosWatched)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.studyRuns)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums">
                  {formatCount(row.practiceRuns)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AdminActivity({
  activity,
  board,
  range,
  storeConfigured,
}: {
  activity: AdminActivityStats;
  board: AdminActivityBoard;
  range: AdminRange;
  storeConfigured: boolean;
}) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const timeInApp = board.points.reduce((sum, point) => sum + point.activeSeconds, 0);

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="Activity"
        subtitle={
          board.grain === "hour"
            ? "Who opened the app today, by Vietnam hour."
            : `Who opened the app ${window}. Each point is a Vietnam day.`
        }
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only counts learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      <section aria-label="Activity totals" className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5">
        <SummaryStat
          label="Active"
          value={formatCount(activity.activeUsers)}
          icon="person"
          hint={`Seen or practiced ${window}`}
        />
        <SummaryStat
          label="Time in app"
          value={formatMinutes(timeInApp)}
          icon="schedule"
          hint={board.grain === "hour" ? "From visits today" : `Active minutes ${window}`}
        />
        <SummaryStat
          label="Videos watched"
          value={formatCount(activity.videosWatched)}
          icon="smart_display"
          hint={`Marked watched ${window}`}
        />
        <SummaryStat
          label="Study runs"
          value={formatCount(activity.studyRuns)}
          icon="menu_book"
          hint={`Finished ${window}`}
        />
        <SummaryStat
          label="Practice runs"
          value={formatCount(activity.practiceRuns)}
          icon="headphones"
          hint={`Practice runs finished ${window}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <ChartCard
          title={board.grain === "hour" ? "People in the app" : "Daily active people"}
          hint={
            board.grain === "hour"
              ? "Unique students whose visit or last-seen time fell in that Vietnam hour."
              : "Unique students seen or practicing on each Vietnam day."
          }
        >
          <PeopleChart data={board.points} grain={board.grain} />
        </ChartCard>
        <ChartCard
          title={board.grain === "hour" ? "Work during those hours" : "Study, practice, and videos"}
          hint={
            board.grain === "hour"
              ? "Study clips and practice runs come from visits. Videos use the watched timestamp."
              : "Finished study runs, practice runs, and videos marked watched."
          }
        >
          <WorkChart data={board.points} grain={board.grain} />
        </ChartCard>
      </div>

      <LeadersTable leaders={board.leaders} />
      <TotalsTable points={board.points} grain={board.grain} />
    </main>
  );
}
