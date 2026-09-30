"use client";

import { type ReactNode } from "react";
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
  adminRangeLabel,
  formatAdminTimestamp,
  type AdminDuelBoard,
  type AdminDuelLeader,
  type AdminDuelMatch,
  type AdminDuelPoint,
  type AdminRange,
} from "@/lib/admin-overview";

const AXIS = "#717785";
const GRID = "#c1c6d6";
const STARTED = "#0059b5";
const FINISHED = "#0071e3";
const EXPIRED = "#5e5e63";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatWhen(iso: string | null): string {
  return formatAdminTimestamp(iso) ?? "—";
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

function DuelChart({ data }: { data: readonly AdminDuelPoint[] }) {
  const hasVolume = data.some(
    (point) => point.started > 0 || point.finished > 0 || point.expired > 0,
  );
  if (!hasVolume) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 font-body-sm text-body-sm text-on-surface-variant">
        No duels were started or settled in this window.
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
        <Bar dataKey="started" name="Started" stackId="duels" fill={STARTED} maxBarSize={28} />
        <Bar dataKey="finished" name="Finished" stackId="duels" fill={FINISHED} maxBarSize={28} />
        <Bar
          dataKey="expired"
          name="Expired"
          stackId="duels"
          fill={EXPIRED}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LeadersTable({ rows }: { rows: readonly AdminDuelLeader[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          Win record
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          Settled matches in this window. An expired challenge counts as a win for the challenger.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          No matches settled in this window.
        </p>
      ) : (
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Student</th>
              <th className="px-space-12 py-space-8">Class</th>
              <th className="px-space-12 py-space-8 text-right">Wins</th>
              <th className="px-space-12 py-space-8 text-right">Losses</th>
              <th className="px-space-12 py-space-8 text-right">Ties</th>
              <th className="px-space-16 py-space-8 text-right">Played</th>
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
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.wins)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.losses)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.ties)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums font-medium">
                  {formatCount(row.played)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MatchTable({
  title,
  hint,
  empty,
  rows,
  timeLabel,
}: {
  title: string;
  hint: string;
  empty: string;
  rows: readonly AdminDuelMatch[];
  timeLabel: string;
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
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Match</th>
              <th className="px-space-12 py-space-8">{timeLabel}</th>
              <th className="px-space-16 py-space-8 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8">
                  <span className="font-medium">{row.challengerName}</span>
                  <span className="text-on-surface-variant"> vs </span>
                  <span className="font-medium">{row.opponentName}</span>
                </td>
                <td className="px-space-12 py-space-8 tabular-nums text-on-surface-variant">
                  {formatWhen(timeLabel === "Started" ? row.createdAt : row.completedAt)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums">
                  {row.result}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AdminDuels({
  board,
  range,
  storeConfigured,
  duelsReady,
}: {
  board: AdminDuelBoard;
  range: AdminRange;
  storeConfigured: boolean;
  duelsReady: boolean;
}) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="Duels"
        subtitle={`Challenges started and settled ${window}. Days follow Vietnam time. Open matches are live, not limited to this window.`}
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only counts duels stored in Supabase.
        </div>
      ) : null}

      {storeConfigured && !duelsReady ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          The duels table is missing. Run supabase/duels.sql once in Supabase.
        </div>
      ) : null}

      <section
        aria-label="Duel totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Started"
          value={formatCount(board.started)}
          icon="swords"
          hint={`Challenges created ${window}`}
        />
        <SummaryStat
          label="Finished"
          value={formatCount(board.finished)}
          icon="flag"
          hint="Both sides played, not expired"
        />
        <SummaryStat
          label="Expired"
          value={formatCount(board.expired)}
          icon="timer_off"
          hint="Closed after the 3-day deadline"
        />
        <SummaryStat
          label="Open"
          value={formatCount(board.open)}
          icon="hourglass_empty"
          hint="Waiting now, not this window"
        />
        <SummaryStat
          label="Players"
          value={formatCount(board.players)}
          icon="group"
          hint={`Students in a match ${window}`}
        />
      </section>

      <ChartCard
        title="Duels by day"
        hint="Started on the day the challenge was sent. Finished and expired on the day they settled."
      >
        <DuelChart data={board.points} />
      </ChartCard>

      <LeadersTable rows={board.leaders} />

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <MatchTable
          title="Open matches"
          hint="Currently waiting. Oldest challenges still sit here until they finish or expire."
          empty="No open challenges right now."
          rows={board.waiting}
          timeLabel="Started"
        />
        <MatchTable
          title="Recently settled"
          hint={`Finished or expired ${window}. Vietnam time.`}
          empty="No matches settled in this window."
          rows={board.recent}
          timeLabel="Settled"
        />
      </div>
    </main>
  );
}
