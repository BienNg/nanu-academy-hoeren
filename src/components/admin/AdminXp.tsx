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
  type AdminRange,
  type AdminXpBoard,
  type AdminXpLeader,
  type AdminXpLesson,
  type AdminXpPoint,
} from "@/lib/admin-overview";

const AXIS = "#717785";
const GRID = "#c1c6d6";
const NEW_XP = "#0059b5";
const REVIEW_XP = "#0071e3";
const DUEL_XP = "#5e5e63";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
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

function XpChart({ data }: { data: readonly AdminXpPoint[] }) {
  const hasXp = data.some((point) => point.total > 0);
  if (!hasXp) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 font-body-sm text-body-sm text-on-surface-variant">
        No XP was awarded in this window.
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
        <Bar dataKey="newXp" name="First pass" stackId="xp" fill={NEW_XP} maxBarSize={28} />
        <Bar dataKey="reviewXp" name="Review" stackId="xp" fill={REVIEW_XP} maxBarSize={28} />
        <Bar
          dataKey="duelXp"
          name="Duels"
          stackId="xp"
          fill={DUEL_XP}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LeadersTable({ rows }: { rows: readonly AdminXpLeader[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          Top earners
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          Ranked by total XP in this window, including duels.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          Nobody earned XP in this window.
        </p>
      ) : (
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Student</th>
              <th className="px-space-12 py-space-8">Class</th>
              <th className="px-space-12 py-space-8 text-right">First pass</th>
              <th className="px-space-12 py-space-8 text-right">Review</th>
              <th className="px-space-12 py-space-8 text-right">Duels</th>
              <th className="px-space-16 py-space-8 text-right">Total</th>
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
                  {formatCount(row.newXp)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.reviewXp)}
                </td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.duelXp)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums font-medium">
                  {formatCount(row.xp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LessonsTable({ rows }: { rows: readonly AdminXpLesson[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
      <div className="px-space-16 py-space-12">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface">
          Lessons that paid
        </h2>
        <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
          Practice parts only. Duel XP has no lesson.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
          No practice parts paid XP in this window.
        </p>
      ) : (
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
              <th className="px-space-16 py-space-8">Lesson</th>
              <th className="px-space-12 py-space-8 text-right">Awards</th>
              <th className="px-space-16 py-space-8 text-right">XP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.lessonKey}
                className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
              >
                <td className="px-space-16 py-space-8 font-medium">{row.label}</td>
                <td className="px-space-12 py-space-8 text-right tabular-nums">
                  {formatCount(row.awards)}
                </td>
                <td className="px-space-16 py-space-8 text-right tabular-nums font-medium">
                  {formatCount(row.xp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AdminXp({
  board,
  range,
  storeConfigured,
  xpReady,
}: {
  board: AdminXpBoard;
  range: AdminRange;
  storeConfigured: boolean;
  xpReady: boolean;
}) {
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="XP"
        subtitle={`XP awarded ${window}. Days follow Vietnam time, the same boundary as the learner leaderboard.`}
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only counts XP stored in Supabase.
        </div>
      ) : null}

      {storeConfigured && !xpReady ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          The xp_awards table is missing. Run supabase/xp_awards.sql once in Supabase.
        </div>
      ) : null}

      <section
        aria-label="XP totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Total XP"
          value={formatCount(board.total)}
          icon="bolt"
          hint={`Practice and duels ${window}`}
        />
        <SummaryStat
          label="First pass"
          value={formatCount(board.newXp)}
          icon="star"
          hint="Full XP for a part the first time"
        />
        <SummaryStat
          label="Review"
          value={formatCount(board.reviewXp)}
          icon="replay"
          hint="40% XP, capped at 30 per student per day"
        />
        <SummaryStat
          label="Duels"
          value={formatCount(board.duelXp)}
          icon="swords"
          hint="Win, tie, or expiry payouts"
        />
        <SummaryStat
          label="Earners"
          value={formatCount(board.earners)}
          icon="group"
          hint={`Students who gained XP ${window}`}
        />
      </section>

      <ChartCard
        title="XP by day"
        hint="Stacked by first pass, review, and duels. Empty days stay on the axis."
      >
        <XpChart data={board.points} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <LeadersTable rows={board.leaders} />
        <LessonsTable rows={board.lessons} />
      </div>
    </main>
  );
}
