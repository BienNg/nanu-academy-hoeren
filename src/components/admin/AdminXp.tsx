"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadXpWindow } from "@/app/admin/range-data";
import { AdminPageHeader, useAdminWindow } from "@/components/admin/AdminShell";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  ChartTooltip,
  KpiTile,
  SectionHeading,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  ChartPanel,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import {
  adminRangeLabel,
  adminRangeVietnamDayKeys,
  buildAdminXpBoard,
  type AdminRange,
  type AdminUserRow,
  type AdminXpLeader,
  type AdminXpLesson,
  type AdminXpPoint,
  type AdminDuelXpRow,
  type AdminListeningXpRow,
} from "@/lib/admin-overview";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import { buildAdminQuestBoard, type AdminQuestBoard, type AdminQuestClaimRow, type AdminQuestPoint } from "@/lib/admin-quests";
import type { QuestKind } from "@/lib/quests";

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;
const NEW_XP = ADMIN_COLORS.amber;
const REVIEW_XP = ADMIN_COLORS.amberSoft;
const DUEL_XP = ADMIN_COLORS.cobalt;
const QUEST_DONE = ADMIN_COLORS.amber;
const QUEST_PERFECT = ADMIN_COLORS.emerald;

const XP_LEGEND = [
  { name: "First pass", color: NEW_XP },
  { name: "Review", color: REVIEW_XP },
  { name: "Duels", color: DUEL_XP },
];

const QUEST_LEGEND = [
  { name: "Quests finished", color: QUEST_DONE },
  { name: "All 3 finished", color: QUEST_PERFECT },
];

const QUEST_KIND_LABEL: Record<QuestKind, string> = {
  listening: "Listening",
  study: "Study",
  habit: "Habit (XP goal)",
};

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function XpChart({ data }: { data: readonly AdminXpPoint[] }) {
  const hasXp = data.some((point) => point.total > 0);
  if (!hasXp) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        No XP was awarded in this window.
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
        <Bar dataKey="newXp" name="First pass" stackId="xp" fill={NEW_XP} maxBarSize={28} />
        <Bar dataKey="reviewXp" name="Review" stackId="xp" fill={REVIEW_XP} maxBarSize={28} />
        <Bar
          dataKey="duelXp"
          name="Duels"
          stackId="xp"
          fill={DUEL_XP}
          radius={[2, 2, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function QuestChart({ data }: { data: readonly AdminQuestPoint[] }) {
  if (!data.some((point) => point.quests > 0)) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        No quests were finished in this window.
      </p>
    );
  }
  const rows = data.map((point) => ({
    ...point,
    label: point.key.slice(5),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(rows.length)}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        <Bar dataKey="quests" name="Quests finished" fill={QUEST_DONE} maxBarSize={28} radius={[2, 2, 0, 0]} />
        <Bar dataKey="perfect" name="All 3 finished" fill={QUEST_PERFECT} maxBarSize={28} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function QuestKindTable({ board }: { board: AdminQuestBoard }) {
  return (
    <TablePanel
      icon="flag"
      title="Quests by type"
      hint="Finished quests and the XP they paid. The all-3 bonus is in Quest XP above, not in this table."
      color={ADMIN_COLORS.amber}
    >
      <table className="w-full border-collapse text-left">
        <thead className={THEAD}>
          <tr>
            <th className={TH}>Type</th>
            <th className={`${TH} text-right`}>Finished</th>
            <th className={`${TH} text-right`}>XP</th>
          </tr>
        </thead>
        <tbody className="text-admin-body-md text-admin-ink">
          {board.byKind.map((row) => (
            <tr key={row.kind} className={TR}>
              <td className="px-space-16 font-semibold">{QUEST_KIND_LABEL[row.kind]}</td>
              <td className="px-space-16 text-right tabular-nums">{formatCount(row.completions)}</td>
              <td className="px-space-16 text-right font-semibold tabular-nums text-admin-amber-ink">
                {formatCount(row.xp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

function LeadersTable({
  rows,
  onSelect,
}: {
  rows: readonly AdminXpLeader[];
  onSelect: (userId: string) => void;
}) {
  return (
    <TablePanel
      icon="leaderboard"
      title="Top earners"
      hint="Ranked by total XP in this window, including duels."
      color={ADMIN_COLORS.amber}
    >
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">
          Nobody earned XP in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={`${TH} w-12 text-center`}>#</th>
                <th className={TH}>Student</th>
                <th className={TH}>Class</th>
                <th className={`${TH} text-right`}>First pass</th>
                <th className={`${TH} text-right`}>Review</th>
                <th className={`${TH} text-right`}>Duels</th>
                <th className={`${TH} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {rows.map((row, index) => (
                <tr
                  key={row.userId}
                  tabIndex={0}
                  onClick={() => onSelect(row.userId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSelect(row.userId);
                  }}
                  className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50`}
                >
                  <td className="px-space-16 text-center">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-admin-badge text-admin-label-md font-semibold tabular-nums ${
                        index === 0
                          ? "bg-admin-amber text-white"
                          : index < 3
                            ? "bg-admin-amber-wash text-admin-amber-ink ring-1 ring-inset ring-admin-amber/25"
                            : "text-admin-ink-subtle"
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-space-16">
                    <span className="font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt">
                      {row.displayName}
                    </span>
                  </td>
                  <td className="px-space-16 text-admin-body-sm text-admin-ink-muted">{row.className ?? "—"}</td>
                  <td className="px-space-16 text-right tabular-nums">{formatCount(row.newXp)}</td>
                  <td className="px-space-16 text-right tabular-nums">{formatCount(row.reviewXp)}</td>
                  <td className="px-space-16 text-right tabular-nums">{formatCount(row.duelXp)}</td>
                  <td className="px-space-16 text-right font-semibold tabular-nums text-admin-amber-ink">
                    {formatCount(row.xp)}
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

function LessonsTable({ rows }: { rows: readonly AdminXpLesson[] }) {
  return (
    <TablePanel
      icon="menu_book"
      title="Lessons that paid"
      hint="Practice parts only. Duel XP has no lesson."
      color={ADMIN_COLORS.emerald}
    >
      {rows.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">
          No practice parts paid XP in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Lesson</th>
                <th className={`${TH} text-right`}>Awards</th>
                <th className={`${TH} text-right`}>XP</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {rows.map((row) => (
                <tr key={row.lessonKey} className={TR}>
                  <td className="px-space-16 font-semibold">{row.label}</td>
                  <td className="px-space-16 text-right tabular-nums">{formatCount(row.awards)}</td>
                  <td className="px-space-16 text-right font-semibold tabular-nums text-admin-amber-ink">
                    {formatCount(row.xp)}
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

export function AdminXp({
  rows,
  catalog,
  listening,
  duelXp,
  questClaims,
  questsReady: serverQuestsReady,
  range: serverRange,
  storeConfigured,
  xpReady: serverXpReady,
}: {
  rows: readonly AdminUserRow[];
  catalog: readonly AdminCatalogCourse[];
  listening: readonly AdminListeningXpRow[];
  duelXp: readonly AdminDuelXpRow[];
  questClaims: readonly AdminQuestClaimRow[];
  questsReady: boolean;
  range: AdminRange;
  storeConfigured: boolean;
  xpReady: boolean;
}) {
  const loaded = useAdminWindow(
    serverRange,
    {
      listening,
      duelXp,
      questClaims,
      xpReady: serverXpReady,
      questsReady: serverQuestsReady,
    },
    loadXpWindow,
  );
  const range = loaded.range;
  const xpReady = loaded.value.xpReady;
  const questsReady = loaded.value.questsReady;
  const board = useMemo(
    () => buildAdminXpBoard(rows, loaded.value.listening, loaded.value.duelXp, range),
    [rows, loaded.value.listening, loaded.value.duelXp, range],
  );
  const quests = useMemo(
    () => buildAdminQuestBoard(loaded.value.questClaims, adminRangeVietnamDayKeys(range)),
    [loaded.value.questClaims, range],
  );
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const detailRow = rows.find((row) => row.userId === detailUserId) ?? null;
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="XP"
        subtitle={`XP awarded ${window}. Days follow Vietnam time, the same boundary as the learner leaderboard.`}
      />

      {!storeConfigured ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          Cloud progress is not configured. This page only counts XP stored in Supabase.
        </div>
      ) : null}

      {storeConfigured && !xpReady ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          The xp_awards table is missing. Run supabase/xp_awards.sql once in Supabase.
        </div>
      ) : null}

      {storeConfigured && !questsReady ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
          The quest_claims table is missing. Run supabase/quest_claims.sql once in Supabase.
        </div>
      ) : null}

      <section
        aria-label="XP totals"
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiTile
          icon="bolt"
          label="Total XP"
          value={formatCount(board.total)}
          caption={`Practice and duels ${window}`}
          color={ADMIN_COLORS.amber}
          trend={board.points.map((point) => point.total)}
        />
        <KpiTile
          icon="star"
          label="First pass"
          value={formatCount(board.newXp)}
          caption="Full XP for a part the first time"
          color={ADMIN_COLORS.amber}
        />
        <KpiTile
          icon="replay"
          label="Review"
          value={formatCount(board.reviewXp)}
          caption="40% XP, capped at 30 per student per day"
          color={ADMIN_COLORS.amber}
        />
        <KpiTile
          icon="swords"
          label="Duels"
          value={formatCount(board.duelXp)}
          caption="Win, tie, or expiry payouts"
          color={ADMIN_COLORS.cobalt}
        />
        <KpiTile
          icon="group"
          label="Earners"
          value={formatCount(board.earners)}
          caption={`Students who gained XP ${window}`}
          color={ADMIN_COLORS.cobalt}
        />
      </section>

      <ChartPanel
        color={ADMIN_COLORS.amber}
        icon="bar_chart"
        legend={XP_LEGEND}
        title="XP by day"
        hint="Stacked by first pass, review, and duels. Empty days stay on the axis."
      >
        <XpChart data={board.points} />
      </ChartPanel>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <LeadersTable rows={board.leaders} onSelect={setDetailUserId} />
        <LessonsTable rows={board.lessons} />
      </div>

      <section aria-labelledby="xp-quests" className="flex flex-col gap-space-12">
        <SectionHeading
          id="xp-quests"
          icon="flag"
          title="Daily quests"
          color={ADMIN_COLORS.amber}
          meta="Grouped by Vietnam day, like the XP above"
        />
        <p className="-mt-space-4 text-admin-body-sm text-admin-ink-subtle">
          Quests reset at each learner&apos;s local midnight.
        </p>
        <div className="grid grid-cols-2 gap-space-16 xl:grid-cols-4">
          <KpiTile
            icon="flag"
            label="Quests finished"
            value={formatCount(quests.completed)}
            caption={`Listening, study and habit ${window}`}
            color={ADMIN_COLORS.amber}
          />
          <KpiTile
            icon="redeem"
            label="All 3 finished"
            value={formatCount(quests.perfectDays)}
            caption="Learner-days that earned the bonus"
            color={ADMIN_COLORS.emerald}
          />
          <KpiTile
            icon="group"
            label="Quest players"
            value={
              board.earners > 0
                ? `${formatCount(quests.learners)} · ${Math.min(
                    100,
                    Math.round((quests.learners / board.earners) * 100),
                  )}%`
                : formatCount(quests.learners)
            }
            caption="Students who finished a quest, and their share of XP earners"
            color={ADMIN_COLORS.cobalt}
          />
          <KpiTile
            icon="bolt"
            label="Quest XP"
            value={formatCount(quests.xp)}
            caption="Paid by quests, bonus included"
            color={ADMIN_COLORS.amber}
          />
        </div>
        <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
          <ChartPanel
        color={ADMIN_COLORS.amber}
            icon="flag"
            legend={QUEST_LEGEND}
            title="Quests by day"
            hint="Finished quests, and learners who finished all three."
          >
            <QuestChart data={quests.points} />
          </ChartPanel>
          <QuestKindTable board={quests} />
        </div>
      </section>
      {detailRow ? (
        <StudentDetail row={detailRow} catalog={catalog} onClose={() => setDetailUserId(null)} />
      ) : null}
    </main>
  );
}
