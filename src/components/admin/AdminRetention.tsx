"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  HeaderChip,
  KpiTile,
  THEAD,
  TH,
  TR,
  TablePanel,
  formatCount,
  ChartPanel,
} from "@/components/admin/AdminUi";
import {
  adminRangeLabel,
  type AdminRange,
  type AdminRetentionBoard,
  type AdminRetentionPerson,
  type AdminRetentionPoint,
  type AdminStreakBucket,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;
const RETURN = ADMIN_COLORS.ember;
const STREAK = ADMIN_COLORS.ember;

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
}

function formatDay(day: string | null): string {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatDaysAgo(daysAgo: number): string {
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "1 day ago";
  return `${daysAgo} days ago`;
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
    <div className="rounded-admin-control bg-admin-ink px-space-12 py-space-8 shadow-admin-pop">
      <p className="text-admin-label-md font-semibold text-white/70">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-space-16 text-admin-body-sm text-white"
          >
            <span className="flex items-center gap-space-8">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              {row.name}
            </span>
            <span className="font-semibold tabular-nums">
              {row.name?.includes("%") || row.name === "Came back"
                ? formatPercent(typeof row.value === "number" ? row.value : null)
                : typeof row.value === "number"
                  ? formatCount(row.value)
                  : row.value}
            </span>
          </li>
        ))}
        {point && point.cohort > 0 ? (
          <li className="text-[12px] leading-4 text-white/70">
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
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        Not enough days yet to measure a next-day return.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        <Bar
          dataKey="rate"
          name="Came back"
          fill={RETURN}
          radius={[2, 2, 0, 0]}
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
        <CartesianGrid stroke={GRID} vertical={false} />
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        <Bar dataKey="count" name="Students" fill={STREAK} radius={[2, 2, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PeopleTable({
  icon,
  title,
  hint,
  empty,
  rows,
  valueHeader,
  value,
  tone,
}: {
  icon: string;
  title: string;
  hint: string;
  empty: string;
  rows: readonly AdminRetentionPerson[];
  valueHeader: string;
  value: (row: AdminRetentionPerson) => string;
  tone: "ember" | "crimson";
}) {
  const color = tone === "ember" ? ADMIN_COLORS.ember : ADMIN_COLORS.crimson;
  return (
    <TablePanel icon={icon} title={title} hint={hint} color={color}>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Student</th>
                <th className={TH}>Class</th>
                <th className={TH}>Last active</th>
                <th className={`${TH} text-right`}>{valueHeader}</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {rows.map((row) => (
                <tr key={row.userId} className={TR}>
                  <td className="px-space-16 py-space-8 font-semibold">{row.displayName}</td>
                  <td className="px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                    {row.className ?? "—"}
                  </td>
                  <td className="px-space-16 py-space-8 text-admin-body-sm tabular-nums">
                    {formatDay(row.lastActiveDay)}
                    <span className="block text-[12px] leading-4 text-admin-ink-subtle">
                      {formatDaysAgo(row.daysAgo)}
                    </span>
                  </td>
                  <td
                    className={`px-space-16 py-space-8 text-right font-semibold tabular-nums ${
                      tone === "ember" ? "text-admin-ember-ink" : "text-admin-crimson-ink"
                    }`}
                  >
                    {value(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
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
      : "Of people active on a Vietnam day, share who also came the next day.";

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="Retention"
        subtitle={`Who came back ${window}, who is on a streak, and who went quiet. Times are Vietnam.`}
        trailing={
          board.stickiness != null ? (
            <HeaderChip icon="push_pin">
              Last-day stickiness{" "}
              <span className="font-semibold tabular-nums text-admin-ink">{formatPercent(board.stickiness)}</span>
            </HeaderChip>
          ) : null
        }
      />

      {!storeConfigured ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          Cloud progress is not configured. This page only counts learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      <section
        aria-label="Retention totals"
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          icon="event_repeat"
          label="Returning"
          value={formatCount(board.returning)}
          caption={`Active ${window}, also seen before it`}
          color={ADMIN_COLORS.ember}
        />
        <KpiTile
          icon="person_add"
          label="New"
          value={formatCount(board.newcomers)}
          caption={`First seen ${window}`}
          color={ADMIN_COLORS.cobalt}
        />
        <KpiTile
          icon="redo"
          label="Next-day return"
          value={formatPercent(board.d1Rate)}
          caption={
            board.d1Cohort === 0
              ? "No earlier day to compare"
              : `${formatCount(board.d1Returned)} of ${formatCount(board.d1Cohort)} came back`
          }
          color={ADMIN_COLORS.ember}
          progress={board.d1Rate == null ? undefined : board.d1Rate / 100}
          progressLabel="Next-day return rate"
        />
        <KpiTile
          icon="local_fire_department"
          label="On a streak"
          value={formatCount(board.onStreak)}
          caption="Current streak of 2 or more days"
          color={ADMIN_COLORS.ember}
        />
        <KpiTile
          icon="hourglass_disabled"
          label="Quiet"
          value={formatCount(board.lapsed)}
          caption={range === "today" ? "Last seen before yesterday" : `Seen before this window, not ${window}`}
          color={board.lapsed > 0 ? ADMIN_COLORS.crimson : ADMIN_COLORS.inkSubtle}
        />
      </section>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2 2xl:gap-space-20">
        <ChartPanel color={ADMIN_COLORS.ember} icon="redo" title="Came back the next day" hint={d1Hint}>
          <ReturnChart data={board.d1} />
        </ChartPanel>
        <ChartPanel color={ADMIN_COLORS.ember}
          icon="local_fire_department"
          title="Current streaks"
          hint="Every synced student, including those at zero. The streak is the same one the learner app shows."
        >
          <StreakChart data={board.streaks} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2 2xl:gap-space-20">
        <PeopleTable
          icon="local_fire_department"
          tone="ember"
          title="Longest streaks"
          hint="Students whose current streak is at least two days."
          empty="Nobody is on a streak of two days or more."
          rows={board.streakLeaders}
          valueHeader="Streak"
          value={(row) => `${row.streakDays} ${row.streakDays === 1 ? "day" : "days"}`}
        />
        <PeopleTable
          icon="hourglass_disabled"
          tone="crimson"
          title="Gone quiet"
          hint={
            range === "today"
              ? "Last seen two or more days ago."
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
