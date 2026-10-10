"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { loadAdminDuelQuestions, type AdminDuelQuestions } from "@/app/admin/actions";
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
  Pager,
  Segmented,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  paginate,
} from "@/components/admin/AdminUi";
import { CARD_KIND_LABEL } from "@/lib/card-kinds";
import {
  ADMIN_PAGE_SIZE,
  adminRangeLabel,
  buildAdminDuelBoard,
  formatAdminTimestamp,
  type AdminDuelChallenge,
  type AdminDuelLeader,
  type AdminDuelPoint,
  type AdminRange,
  type AdminUserRow,
  type AdminDuelRecord,
} from "@/lib/admin-overview";
import { DUEL_SIZE, type AdminChallengeStatus } from "@/lib/duels";
import type { AdminDuelAnswerTime, AdminDuelSettled } from "@/lib/duel-store";
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

function formatAnswerClock(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<AdminChallengeStatus, string> = {
  open: "Open",
  paused: "Paused",
  ended: "Ended",
};

const STATUS_TONE: Record<AdminChallengeStatus, "cobalt" | "amber" | "neutral"> = {
  open: "cobalt",
  paused: "amber",
  ended: "neutral",
};

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

function AnswerTime({ play }: { play: AdminDuelAnswerTime | undefined }) {
  if (!play) return <span className="text-admin-ink-faint">Not answered</span>;
  if (play.state === "active") {
    return (
      <span>
        <span className="font-semibold text-admin-amber-ink">Still on this question</span>
        <span className="mt-0.5 block tabular-nums text-admin-ink-subtle">Started {formatAnswerClock(play.startedAt)}</span>
      </span>
    );
  }
  if (play.state === "forfeited") {
    return (
      <span>
        <span className="font-semibold text-admin-crimson">Left</span>
        <span className="mt-0.5 block tabular-nums text-admin-ink-subtle">{formatAnswerClock(play.finishedAt)}</span>
      </span>
    );
  }
  return (
    <span>
      <span className="font-semibold tabular-nums text-admin-ink">{formatDuration(play.elapsedMs)}</span>
      <span className="mt-0.5 block tabular-nums text-admin-ink-subtle">{formatAnswerClock(play.finishedAt)}</span>
    </span>
  );
}

function ChallengeQuestions({
  challenge,
  detail,
}: {
  challenge: AdminDuelChallenge;
  detail: AdminDuelQuestions;
}) {
  const byPlayer = new Map<string, Map<number, AdminDuelAnswerTime>>();
  for (const answer of detail.answers) {
    const plays = byPlayer.get(answer.userId) ?? new Map<number, AdminDuelAnswerTime>();
    plays.set(answer.position, answer);
    byPlayer.set(answer.userId, plays);
  }
  const challenger = byPlayer.get(challenge.challengerId);
  const opponent = byPlayer.get(challenge.opponentId);
  return (
    <div className="overflow-x-auto rounded-admin-card border border-admin-hairline bg-admin-canvas">
      <table className="w-full min-w-[720px] border-collapse text-left text-admin-body-sm">
        <thead className="bg-admin-subtle text-admin-label-sm uppercase text-admin-ink-subtle">
          <tr>
            <th className="px-space-12 py-space-8 font-semibold">#</th>
            <th className="px-space-12 py-space-8 font-semibold">Question</th>
            <th className="px-space-12 py-space-8 font-semibold">{challenge.challengerName}</th>
            <th className="px-space-12 py-space-8 font-semibold">{challenge.opponentName}</th>
          </tr>
        </thead>
        <tbody>
          {detail.questions.map((question) => (
            <tr key={question.position} className="border-t border-admin-hairline align-top text-admin-ink">
              <td className="px-space-12 py-space-8 tabular-nums text-admin-ink-muted">{question.position + 1}</td>
              <td className="max-w-[28rem] px-space-12 py-space-8">
                <p className="text-admin-label-sm text-admin-ink-subtle">{CARD_KIND_LABEL[question.kind]}</p>
                <p className="mt-0.5 font-semibold">{question.script ?? "Question text is not in the catalog."}</p>
                {question.translationVi ? (
                  <p className="mt-0.5 text-admin-ink-muted">{question.translationVi}</p>
                ) : null}
              </td>
              <td className="px-space-12 py-space-8">
                <AnswerTime play={challenger?.get(question.position)} />
              </td>
              <td className="px-space-12 py-space-8">
                <AnswerTime play={opponent?.get(question.position)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChallengePanel({ rows }: { rows: readonly AdminDuelChallenge[] }) {
  const [filter, setFilter] = useState<"all" | AdminChallengeStatus>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{
    id: string;
    detail: AdminDuelQuestions | null;
    error: string | null;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const request = useRef(0);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );
  const windowed = paginate(filtered, page, ADMIN_PAGE_SIZE);

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (loaded?.id === id && loaded.detail) return;
    const ticket = request.current + 1;
    request.current = ticket;
    setLoadingId(id);
    void loadAdminDuelQuestions(id)
      .then((result) => {
        if (request.current !== ticket) return;
        setLoaded({
          id,
          detail: result.ok ? result.detail : null,
          error: result.ok ? null : result.error,
        });
        setLoadingId(null);
      })
      .catch(() => {
        if (request.current !== ticket) return;
        setLoaded({ id, detail: null, error: "Could not load this challenge." });
        setLoadingId(null);
      });
  };

  return (
    <TablePanel
      icon="quiz"
      title="Questions and answer times"
      hint="Paused means the sender has not finished every question, so the other student cannot play yet. Open means they can. Times are Vietnam time. A duration is how long the answer took."
      color={ADMIN_COLORS.cobalt}
      trailing={
        <Segmented
          ariaLabel="Challenge status"
          value={filter}
          onSelect={(next) => {
            setFilter(next);
            setPage(1);
          }}
          options={[
            { key: "all", label: "All" },
            { key: "open", label: "Open" },
            { key: "paused", label: "Paused" },
            { key: "ended", label: "Ended" },
          ]}
        />
      }
      footer={
        filtered.length > ADMIN_PAGE_SIZE ? (
          <Pager
            page={windowed.page}
            pageCount={windowed.pageCount}
            start={windowed.start}
            end={windowed.end}
            total={filtered.length}
            noun="challenges"
            onPage={setPage}
          />
        ) : null
      }
    >
      {filtered.length === 0 ? (
        <p className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted sm:px-space-20">
          No challenges in this view.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Challenge</th>
                <th className={TH}>Status</th>
                <th className={TH}>Started</th>
                <th className={`${TH} text-right`}>Answered</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {windowed.pageItems.map((row) => {
                const expanded = openId === row.id;
                const detail = loaded?.id === row.id ? loaded.detail : null;
                const error = loaded?.id === row.id ? loaded.error : null;
                const loading = loadingId === row.id && !detail;
                return (
                  <Fragment key={row.id}>
                    <tr className={TR}>
                      <td className="px-space-16">
                        <span className="font-semibold">{row.challengerName}</span>
                        <span className="text-admin-ink-subtle"> vs </span>
                        <span className="font-semibold">{row.opponentName}</span>
                        {row.status === "ended" ? (
                          <span className="mt-0.5 block text-admin-body-sm text-admin-ink-muted">
                            {row.expired ? "Expired" : row.result}
                            {row.completedAt ? ` · settled ${formatWhen(row.completedAt)}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-space-16">
                        <Badge tone={row.expired ? "crimson" : STATUS_TONE[row.status]}>
                          {row.expired ? "Ended" : STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-space-16 text-admin-body-sm tabular-nums text-admin-ink-muted">
                        {formatWhen(row.createdAt)}
                      </td>
                      <td className="px-space-16 text-right text-admin-body-sm tabular-nums text-admin-ink-muted">
                        {row.status === "ended" ? (
                          row.result
                        ) : (
                          <>
                            {row.challengerSettled}/{DUEL_SIZE}
                            <span className="text-admin-ink-faint"> · </span>
                            {row.opponentSettled}/{DUEL_SIZE}
                          </>
                        )}
                      </td>
                      <td className="px-space-16 text-right">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="rounded-admin-badge text-admin-label-md font-semibold text-admin-cobalt outline-none hover:underline focus-visible:shadow-admin-focus"
                        >
                          {expanded ? "Hide" : "Questions"}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-t border-admin-hairline">
                        <td colSpan={5} className="px-space-16 py-space-12">
                          {loading ? (
                            <p className="text-admin-body-sm text-admin-ink-muted">Loading questions…</p>
                          ) : error ? (
                            <p className="text-admin-body-sm text-admin-crimson">{error}</p>
                          ) : detail ? (
                            detail.questions.length === 0 ? (
                              <p className="text-admin-body-sm text-admin-ink-muted">This challenge has no stored questions.</p>
                            ) : (
                              <ChallengeQuestions challenge={row} detail={detail} />
                            )
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
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
  settled,
  range: serverRange,
  storeConfigured,
  duelsReady,
}: {
  people: readonly AdminUserRow[];
  duels: readonly AdminDuelRecord[];
  settled: readonly AdminDuelSettled[] | null;
  range: AdminRange;
  storeConfigured: boolean;
  duelsReady: boolean;
}) {
  const range = useAdminRange(serverRange);
  const board = useMemo(
    () => buildAdminDuelBoard(people, duels, range, new Date(), settled),
    [people, duels, range, settled],
  );
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="Duels"
        subtitle={`Challenges started and settled ${window}. Days follow Vietnam time. Open and paused challenges are live, not limited to this window.`}
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
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 xl:grid-cols-6"
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
          caption={settled ? "Waiting on the other student" : "Waiting now, not this window"}
          color={ADMIN_COLORS.cobalt}
        />
        <KpiTile
          icon="pause"
          label="Paused"
          value={settled ? formatCount(board.paused) : "—"}
          caption={settled ? "Sender has not finished the questions" : "Answer progress unavailable"}
          color={ADMIN_COLORS.amber}
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

      <ChallengePanel rows={board.challenges} />
    </main>
  );
}
