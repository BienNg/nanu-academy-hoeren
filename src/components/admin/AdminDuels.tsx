"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, useAdminRange } from "@/components/admin/AdminShell";
import {
  Badge,
  ChartPanel,
  ChartTooltip,
  KpiTile,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import {
  adminRangeLabel,
  buildAdminDuelBoard,
  formatAdminTimestamp,
  type AdminDuelLeader,
  type AdminDuelMatch,
  type AdminDuelPoint,
  type AdminRange,
  type AdminUserRow,
  type AdminDuelRecord,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;
const STARTED = ADMIN_COLORS.cobalt;
const FINISHED = ADMIN_COLORS.amber;
const EXPIRED = ADMIN_COLORS.inkFaint;

const DUEL_LEGEND = [
  { name: "Started", color: STARTED },
  { name: "Finished", color: FINISHED },
  { name: "Expired", color: EXPIRED },
];

function formatWhen(iso: string | null): string {
  return formatAdminTimestamp(iso) ?? "—";
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
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        No duels were started or settled in this window.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        <Bar dataKey="started" name="Started" stackId="duels" fill={STARTED} maxBarSize={28} />
        <Bar dataKey="finished" name="Finished" stackId="duels" fill={FINISHED} maxBarSize={28} />
        <Bar
          dataKey="expired"
          name="Expired"
          stackId="duels"
          fill={EXPIRED}
          radius={[2, 2, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LeadersTable({ rows }: { rows: readonly AdminDuelLeader[] }) {
  return (
    <TablePanel
      icon="emoji_events"
      title="Win record"
      hint="Settled matches in this window. An expired challenge counts as a win for the challenger."
      color={ADMIN_COLORS.amber}
    >
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">
          No matches settled in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Student</th>
                <th className={TH}>Class</th>
                <th className={`${TH} text-right`}>Wins</th>
                <th className={`${TH} text-right`}>Losses</th>
                <th className={`${TH} text-right`}>Ties</th>
                <th className={`${TH} text-right`}>Played</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md tabular-nums text-admin-ink">
              {rows.map((row) => (
                <tr key={row.userId} className={TR}>
                  <td className="px-space-16 font-semibold">{row.displayName}</td>
                  <td className="px-space-16 text-admin-body-sm text-admin-ink-muted">{row.className ?? "—"}</td>
                  <td className="px-space-16 text-right font-semibold text-admin-amber-ink">{formatCount(row.wins)}</td>
                  <td className="px-space-16 text-right">{formatCount(row.losses)}</td>
                  <td className="px-space-16 text-right text-admin-ink-muted">{formatCount(row.ties)}</td>
                  <td className="px-space-16 text-right font-semibold">{formatCount(row.played)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
  );
}

function MatchTable({
  icon,
  title,
  hint,
  empty,
  rows,
  timeLabel,
}: {
  icon: string;
  title: string;
  hint: string;
  empty: string;
  rows: readonly AdminDuelMatch[];
  timeLabel: string;
}) {
  return (
    <TablePanel icon={icon} title={title} hint={hint} color={timeLabel === "Started" ? ADMIN_COLORS.cobalt : ADMIN_COLORS.amber}>
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Match</th>
                <th className={TH}>{timeLabel}</th>
                <th className={`${TH} text-right`}>Result</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {rows.map((row) => (
                <tr key={row.id} className={TR}>
                  <td className="px-space-16">
                    <span className="font-semibold">{row.challengerName}</span>
                    <span className="text-admin-ink-subtle"> vs </span>
                    <span className="font-semibold">{row.opponentName}</span>
                  </td>
                  <td className="whitespace-nowrap px-space-16 text-admin-body-sm tabular-nums text-admin-ink-muted">
                    {formatWhen(timeLabel === "Started" ? row.createdAt : row.completedAt)}
                  </td>
                  <td className="px-space-16 text-right">
                    <Badge tone={timeLabel === "Started" ? "cobalt" : "neutral"}>{row.result}</Badge>
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

export function AdminDuels({
  people,
  duels,
  range: serverRange,
  storeConfigured,
  duelsReady,
}: {
  people: readonly AdminUserRow[];
  duels: readonly AdminDuelRecord[];
  range: AdminRange;
  storeConfigured: boolean;
  duelsReady: boolean;
}) {
  const range = useAdminRange(serverRange);
  const board = useMemo(
    () => buildAdminDuelBoard(people, duels, range),
    [people, duels, range],
  );
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="Duels"
        subtitle={`Challenges started and settled ${window}. Days follow Vietnam time. Open matches are live, not limited to this window.`}
      />

      {!storeConfigured ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          Cloud progress is not configured. This page only counts duels stored in Supabase.
        </div>
      ) : null}

      {storeConfigured && !duelsReady ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          The duels table is missing. Run supabase/duels.sql once in Supabase.
        </div>
      ) : null}

      <section
        aria-label="Duel totals"
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          icon="swords"
          label="Started"
          value={formatCount(board.started)}
          caption={`Challenges created ${window}`}
          color={ADMIN_COLORS.cobalt}
          trend={board.points.map((point) => point.started)}
        />
        <KpiTile
          icon="flag"
          label="Finished"
          value={formatCount(board.finished)}
          caption="Both sides played, not expired"
          color={ADMIN_COLORS.amber}
        />
        <KpiTile
          icon="timer_off"
          label="Expired"
          value={formatCount(board.expired)}
          caption="Closed after the 3-day deadline"
          color={ADMIN_COLORS.inkSubtle}
        />
        <KpiTile
          icon="hourglass_empty"
          label="Open"
          value={formatCount(board.open)}
          caption="Waiting now, not this window"
          color={ADMIN_COLORS.cobalt}
        />
        <KpiTile
          icon="group"
          label="Players"
          value={formatCount(board.players)}
          caption={`Students in a match ${window}`}
          color={ADMIN_COLORS.amber}
        />
      </section>

      <ChartPanel
        icon="bar_chart"
        color={ADMIN_COLORS.amber}
        legend={DUEL_LEGEND}
        title="Duels by day"
        hint="Started on the day the challenge was sent. Finished and expired on the day they settled."
      >
        <DuelChart data={board.points} />
      </ChartPanel>

      <LeadersTable rows={board.leaders} />

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2 2xl:gap-space-20">
        <MatchTable
          icon="hourglass_empty"
          title="Open matches"
          hint="Currently waiting. Oldest challenges still sit here until they finish or expire."
          empty="No open challenges right now."
          rows={board.waiting}
          timeLabel="Started"
        />
        <MatchTable
          icon="history"
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
