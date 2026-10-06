"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import {
  Badge,
  CARD,
  KpiTile,
  Mono,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
import type {
  AdminClassDay,
  AdminClassLeague as League,
  AdminClassQuestStatus,
} from "@/lib/admin-class-league";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayOf(day: string): string {
  return WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? day;
}

function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}.`;
}

function share(done: number, total: number): number {
  return total > 0 ? done / total : 0;
}

function Notice({ children }: { children: string }) {
  return (
    <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
      {children}
    </div>
  );
}

/** One square per day so far: green both daily quests, amber one, grey none. */
function DayDots({ days }: { days: readonly AdminClassDay[] }) {
  return (
    <span className="flex items-center gap-1">
      {days.map((day) => {
        const color =
          day.done >= day.total && day.total > 0
            ? ADMIN_COLORS.emerald
            : day.done > 0
              ? ADMIN_COLORS.amber
              : ADMIN_COLORS.hairline;
        return (
          <span
            key={day.day}
            className="h-3.5 w-3.5 rounded-[3px]"
            style={{ backgroundColor: color }}
            title={`${weekdayOf(day.day)} ${shortDate(day.day)}: ${day.done}/${day.total} daily quests`}
            aria-label={`${weekdayOf(day.day)}: ${day.done} of ${day.total} daily quests`}
          />
        );
      })}
    </span>
  );
}

function QuestLine({ quest }: { quest: AdminClassQuestStatus }) {
  return (
    <li className="flex flex-col gap-1 py-space-8">
      <div className="flex items-start justify-between gap-space-8">
        <p className="text-admin-body-sm font-semibold text-admin-ink">{quest.title}</p>
        <span className="flex shrink-0 items-center gap-1">
          <Badge tone={quest.done ? "emerald" : "neutral"} dot>
            {quest.progress}/{quest.target}
          </Badge>
          {quest.claimed > 0 ? <Badge tone="amber">{quest.claimed} claimed</Badge> : null}
        </span>
      </div>
      <p className="text-admin-body-sm text-admin-ink-subtle">
        {quest.contributors.length > 0 ? quest.contributors.join(", ") : "No one yet"}
      </p>
    </li>
  );
}

export function AdminClassLeague({
  league,
  storeConfigured,
  ready,
  podiumsReady,
}: {
  league: League | null;
  storeConfigured: boolean;
  ready: boolean;
  podiumsReady: boolean;
}) {
  const totals = league?.totals;
  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="Class league"
        subtitle={`The classes board and class quests for this Vietnam week${
          league ? ` (since Monday ${shortDate(league.week)})` : ""
        }. Same ranking and quests learners see. Admins and staff are not counted.`}
      />

      {!storeConfigured ? (
        <Notice>Cloud progress is not configured. This page only reads XP and quests stored in Supabase.</Notice>
      ) : !ready ? (
        <Notice>XP or quest claims could not be read. Check that supabase/xp_awards.sql and supabase/quest_claims.sql have been run.</Notice>
      ) : null}
      {storeConfigured && !podiumsReady ? (
        <Notice>Class podiums are missing. Run supabase/class_podiums.sql once in Supabase.</Notice>
      ) : null}

      {league && totals ? (
        <>
          <section aria-label="Class league totals" className="grid grid-cols-2 gap-space-16 xl:grid-cols-4">
            <KpiTile
              icon="groups"
              label="Classes ranked"
              value={`${formatCount(totals.rankedClasses)} / ${formatCount(totals.classes)}`}
              caption="Classes with XP this week, out of all classes"
              color={ADMIN_COLORS.cobalt}
              progress={share(totals.rankedClasses, totals.classes)}
            />
            <KpiTile
              icon="flag"
              label="Daily quests done"
              value={`${formatCount(totals.dailyDone)} / ${formatCount(totals.dailyTotal)}`}
              caption="Every class, Monday to today"
              color={ADMIN_COLORS.emerald}
              progress={share(totals.dailyDone, totals.dailyTotal)}
            />
            <KpiTile
              icon="diversity_3"
              label="Weekly quests done"
              value={`${formatCount(totals.weeklyDone)} / ${formatCount(totals.classes)}`}
              caption="Classes that finished this week's quest"
              color={ADMIN_COLORS.amber}
              progress={share(totals.weeklyDone, totals.classes)}
            />
            <KpiTile
              icon="redeem"
              label="Claims"
              value={formatCount(totals.claims)}
              caption={`${formatCount(totals.claimXp)} XP paid to contributors this week`}
              color={ADMIN_COLORS.amber}
            />
          </section>

          <TablePanel
            icon="leaderboard"
            title="Classes this week"
            hint="Ranked by total week XP, like the Lớp tab. Squares show each day's daily quests: green both, amber one, grey none."
            color={ADMIN_COLORS.cobalt}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <thead className={THEAD}>
                  <tr>
                    <th className={`${TH} w-14`}>Rank</th>
                    <th className={TH}>Class</th>
                    <th className={`${TH} text-right`}>Active</th>
                    <th className={`${TH} text-right`}>Week XP</th>
                    <th className={`${TH} text-right`}>XP / learner</th>
                    <th className={TH}>Daily quests</th>
                    <th className={TH}>Weekly quest</th>
                    <th className={`${TH} text-right`}>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {league.classes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-space-16 py-space-24 text-center text-admin-body-sm text-admin-ink-muted">
                        No learner has a class yet.
                      </td>
                    </tr>
                  ) : (
                    league.classes.map((row) => (
                      <tr key={row.classKey} className={TR}>
                        <td className="px-space-16 py-space-12 text-admin-body-md font-semibold tabular-nums text-admin-ink">
                          {row.rank ?? "—"}
                        </td>
                        <td className="px-space-16 py-space-12">
                          <p className="text-admin-body-md font-semibold text-admin-ink">{row.name}</p>
                          <p className="text-admin-body-sm text-admin-ink-subtle">{row.learners} learners</p>
                        </td>
                        <td className="whitespace-nowrap px-space-16 py-space-12 text-right text-admin-body-md tabular-nums text-admin-ink">
                          {row.activeLearners} / {row.learners}
                        </td>
                        <td className="px-space-16 py-space-12 text-right text-admin-body-md font-semibold tabular-nums text-admin-ink">
                          {formatCount(row.weekXp)}
                        </td>
                        <td className="px-space-16 py-space-12 text-right text-admin-body-md tabular-nums text-admin-ink-muted">
                          {formatCount(row.xpPerLearner)}
                        </td>
                        <td className="px-space-16 py-space-12">
                          <DayDots days={row.days} />
                        </td>
                        <td className="px-space-16 py-space-12">
                          <p className="text-admin-body-sm text-admin-ink">{row.weekly.title}</p>
                          <Badge tone={row.weekly.done ? "emerald" : "neutral"} dot>
                            {row.weekly.progress}/{row.weekly.target}
                          </Badge>
                        </td>
                        <td className="px-space-16 py-space-12 text-right text-admin-body-sm tabular-nums text-admin-ink-muted">
                          {row.claims} · {formatCount(row.claimXp)} XP
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TablePanel>

          {league.classes.length > 0 ? (
            <section aria-label="Today's class quests" className="flex flex-col gap-space-12">
              <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">
                Today&apos;s class quests · {weekdayOf(league.today)} {shortDate(league.today)}
              </h2>
              <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-2 2xl:grid-cols-3">
                {league.classes.map((row) => (
                  <article key={row.classKey} className={`${CARD} flex flex-col p-space-16`}>
                    <div className="flex items-center justify-between gap-space-8">
                      <h3 className="truncate text-admin-body-md font-semibold text-admin-ink">{row.name}</h3>
                      <Mono>{row.learners} learners</Mono>
                    </div>
                    <ul className="divide-y divide-admin-hairline">
                      {row.today.map((quest) => (
                        <QuestLine key={quest.id} quest={quest} />
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <TablePanel
            icon="emoji_events"
            title="Class podiums"
            hint="Top 3 classes of each finished week, as stored for the class badges. Learners are those who earned XP that week."
            color={ADMIN_COLORS.amber}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Week of</th>
                    <th className={TH}>1st</th>
                    <th className={TH}>2nd</th>
                    <th className={TH}>3rd</th>
                  </tr>
                </thead>
                <tbody>
                  {league.podiums.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-space-16 py-space-24 text-center text-admin-body-sm text-admin-ink-muted">
                        No finished week is ranked yet. Weeks are ranked the first time a learner opens badges after Monday.
                      </td>
                    </tr>
                  ) : (
                    league.podiums.map((week) => (
                      <tr key={week.week} className={TR}>
                        <td className="px-space-16 py-space-12 text-admin-body-md tabular-nums text-admin-ink">
                          {shortDate(week.week)}
                        </td>
                        {[1, 2, 3].map((rank) => {
                          const place = week.places.find((entry) => entry.rank === rank);
                          return (
                            <td key={rank} className="px-space-16 py-space-12">
                              {place ? (
                                <>
                                  <p className="text-admin-body-md font-semibold text-admin-ink">{place.name}</p>
                                  <p className="text-admin-body-sm text-admin-ink-subtle">
                                    {formatCount(place.classXp)} XP · {place.learners} badge{" "}
                                    {place.learners === 1 ? "holder" : "holders"}
                                  </p>
                                </>
                              ) : (
                                <span className="text-admin-body-sm text-admin-ink-faint">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TablePanel>
        </>
      ) : null}
    </main>
  );
}
