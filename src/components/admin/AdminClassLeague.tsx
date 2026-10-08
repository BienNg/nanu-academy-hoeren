"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/admin/AdminOutreachCase";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  Badge,
  Button,
  CARD,
  KpiTile,
  Mono,
  PanelHeader,
  TH,
  THEAD,
  TR,
  TablePanel,
  buttonClass,
  formatCount,
  formatPercent,
} from "@/components/admin/AdminUi";
import {
  MOST_ACTIVE_MIN_LEARNERS,
  leagueCardFileName,
  leagueCardUrl,
  resultWeekLabel,
  type AdminClassDay,
  type AdminClassLeague as League,
  type AdminClassQuestStatus,
  type AdminWeekResults,
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

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-admin-body-sm text-admin-ink-faint">—</span>;
  return (
    <Badge tone={rank <= 3 ? "amber" : "neutral"} solid={rank === 1}>
      #{rank}
    </Badge>
  );
}

function WeekLink({ week, icon, label }: { week: string | null; icon: string; label: string }) {
  const content = (
    <>
      <MaterialIcon name={icon} className="text-[18px]" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </>
  );
  if (!week) {
    return (
      <span className={`${buttonClass("secondary")} pointer-events-none opacity-50`} aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link href={`/admin/class-league?week=${week}`} className={buttonClass("secondary")} aria-label={label}>
      {content}
    </Link>
  );
}

const IMAGE_LABEL = {
  idle: "Chép ảnh",
  busy: "Đang tạo ảnh…",
  done: "Đã chép ảnh",
  failed: "Không chép được",
} as const;

/**
 * Copies the podium card so support can paste it into the chat, plus a
 * download link. Where the browser cannot put an image on the clipboard, the
 * card opens in a new tab instead.
 */
function CardImageActions({
  src,
  fileName,
  variant = "secondary",
}: {
  src: string;
  fileName: string;
  variant?: "primary" | "secondary";
}) {
  const [state, setState] = useState<keyof typeof IMAGE_LABEL>("idle");
  const settle = (next: "done" | "failed") => {
    setState(next);
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <div className="flex items-center gap-space-4">
      <Button
        variant={variant}
        icon={state === "done" ? "check" : "image"}
        disabled={state === "busy"}
        onClick={() => {
          if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
            window.open(src, "_blank", "noopener");
            return;
          }
          setState("busy");
          // The blob is passed as a promise so Safari keeps the click as the user gesture.
          const png = fetch(src, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.blob();
          });
          navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
            () => settle("done"),
            () => settle("failed"),
          );
        }}
      >
        {IMAGE_LABEL[state]}
      </Button>
      <a href={src} download={fileName} aria-label="Tải ảnh" title="Tải ảnh" className={buttonClass("ghost")}>
        <MaterialIcon name="download" className="text-[18px]" />
      </a>
    </div>
  );
}

function WeekResults({ results }: { results: AdminWeekResults }) {
  const podium = results.classes.filter((row) => row.rank != null && row.rank <= 3);
  const active = results.mostActive;
  return (
    <section aria-labelledby="week-results" className="flex flex-col gap-space-12">
      <div className="flex flex-wrap items-center justify-between gap-space-8">
        <h2 id="week-results" className="font-admin-display text-admin-headline-sm text-admin-ink">
          Winners · week {resultWeekLabel(results.week)}
        </h2>
        <div className="flex items-center gap-space-8">
          <WeekLink week={results.older} icon="chevron_left" label="Older week" />
          <WeekLink week={results.newer} icon="chevron_right" label="Newer week" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-2">
        <article className={`${CARD} flex flex-col gap-space-16 p-space-16 sm:p-space-20`}>
          <PanelHeader
            icon="emoji_events"
            title="Class podium"
            hint={`${formatCount(results.rankedClasses)} classes earned XP that week. Same ranking as the Lớp tab. Most active needs at least ${MOST_ACTIVE_MIN_LEARNERS} learners.`}
            color={ADMIN_COLORS.amber}
          />
          {podium.length === 0 ? (
            <p className="text-admin-body-sm text-admin-ink-muted">No class earned XP that week.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-admin-hairline">
              {podium.map((row) => (
                <li key={row.classKey} className="flex items-center gap-space-12 py-space-8">
                  <RankBadge rank={row.rank} />
                  <p className="min-w-0 flex-1 truncate text-admin-body-md font-semibold text-admin-ink">{row.name}</p>
                  <span className="text-admin-body-sm tabular-nums text-admin-ink-subtle">
                    {row.activeLearners}/{row.learners} active
                  </span>
                  <span className="w-24 text-right text-admin-body-md font-semibold tabular-nums text-admin-ink">
                    {formatCount(row.weekXp)} XP
                  </span>
                </li>
              ))}
            </ol>
          )}
          <dl className="border-t border-admin-hairline pt-space-12">
            <div className="flex flex-col gap-1">
              <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">Most active</dt>
              <dd className="text-admin-body-md text-admin-ink">
                {active ? (
                  <>
                    <span className="font-semibold">{active.name}</span>{" "}
                    <span className="tabular-nums text-admin-ink-muted">
                      {formatPercent(active.active / active.learners)} · {active.active}/{active.learners}
                    </span>
                  </>
                ) : (
                  <span className="text-admin-ink-faint">—</span>
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article className={`${CARD} flex flex-col gap-space-16 p-space-16 sm:p-space-20`}>
          <PanelHeader
            icon="campaign"
            title="Main group post"
            hint="For the group every class is in. Post the image with the text on Monday morning."
            color={ADMIN_COLORS.cobalt}
          />
          {results.announcement ? (
            <>
              <div className="flex flex-wrap items-center gap-space-8">
                <CardImageActions
                  variant="primary"
                  src={leagueCardUrl(results.week)}
                  fileName={leagueCardFileName(results.week)}
                />
                <CopyButton text={results.announcement} label="Chép tin nhóm chung" />
              </div>
              <div className="flex flex-col gap-space-12 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={leagueCardUrl(results.week)}
                  alt={`Class podium card, week ${resultWeekLabel(results.week)}`}
                  width={1080}
                  height={1920}
                  className="aspect-[9/16] h-auto w-full max-w-[14rem] shrink-0 rounded-admin-control border border-admin-hairline bg-admin-subtle sm:w-40"
                />
                <p className="min-w-0 flex-1 whitespace-pre-line rounded-admin-control bg-admin-canvas p-space-12 text-admin-body-sm text-admin-ink">
                  {results.announcement}
                </p>
              </div>
            </>
          ) : (
            <p className="text-admin-body-sm text-admin-ink-muted">
              {results.rankedClasses > 0
                ? "Only staff see this post, because it names every class."
                : "No class earned XP that week, so there is nothing to announce."}
            </p>
          )}
        </article>
      </div>

      <TablePanel
        icon="military_tech"
        title="Class champions"
        hint="Each class's top 3 by week XP, in board order. Copy each class's post into its own group chat."
        color={ADMIN_COLORS.amber}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={`${TH} w-14`}>Rank</th>
                <th className={TH}>Class</th>
                <th className={TH}>Champion</th>
                <th className={TH}>2nd · 3rd</th>
                <th className={`${TH} text-right`}>Active</th>
                <th className={TH}>Class post</th>
              </tr>
            </thead>
            <tbody>
              {results.classes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-space-16 py-space-24 text-center text-admin-body-sm text-admin-ink-muted">
                    No learner has a class yet.
                  </td>
                </tr>
              ) : (
                results.classes.map((row) => {
                  const [champion, ...rest] = row.champions;
                  const tied = champion != null && rest[0]?.xp === champion.xp;
                  return (
                    <tr key={row.classKey} className={`${TR} align-top`}>
                      <td className="px-space-16 py-space-12">
                        <RankBadge rank={row.rank} />
                      </td>
                      <td className="px-space-16 py-space-12">
                        <p className="text-admin-body-md font-semibold text-admin-ink">{row.name}</p>
                        <p className="text-admin-body-sm tabular-nums text-admin-ink-subtle">
                          {formatCount(row.weekXp)} XP · {row.learners} learners
                        </p>
                      </td>
                      <td className="px-space-16 py-space-12">
                        {champion ? (
                          <>
                            <p className="flex items-center gap-space-8 text-admin-body-md font-semibold text-admin-ink">
                              {champion.name}
                              {tied ? (
                                <span title="Same XP as 2nd. The board ranks whoever reached it first higher.">
                                  <Badge tone="crimson">Tie</Badge>
                                </span>
                              ) : null}
                            </p>
                            <p className="text-admin-body-sm tabular-nums text-admin-ink-subtle">
                              {formatCount(champion.xp)} XP
                            </p>
                          </>
                        ) : (
                          <span className="text-admin-body-sm text-admin-ink-faint">No XP that week</span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-12 text-admin-body-sm text-admin-ink-muted">
                        {rest.length > 0
                          ? rest.map((place) => `${place.name} (${formatCount(place.xp)})`).join(" · ")
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-12 text-right text-admin-body-md tabular-nums text-admin-ink">
                        {row.activeLearners} / {row.learners}
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex flex-col items-start gap-space-8">
                          {champion ? (
                            <CardImageActions
                              src={leagueCardUrl(results.week, row.classKey)}
                              fileName={leagueCardFileName(results.week, row.name)}
                            />
                          ) : null}
                          <CopyButton text={row.message} label="Chép tin lớp" />
                          <details className="text-admin-body-sm">
                            <summary className="cursor-pointer text-admin-ink-subtle hover:text-admin-ink">
                              Preview
                            </summary>
                            <div className="mt-space-8 flex w-[20rem] flex-col gap-space-8">
                              {champion ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={leagueCardUrl(results.week, row.classKey)}
                                  alt={`${row.name} podium card`}
                                  width={1080}
                                  height={1920}
                                  loading="lazy"
                                  className="aspect-[9/16] h-auto w-48 rounded-admin-control border border-admin-hairline bg-admin-subtle"
                                />
                              ) : null}
                              <p className="whitespace-pre-line rounded-admin-control bg-admin-canvas p-space-12 text-admin-ink">
                                {row.message}
                              </p>
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TablePanel>
    </section>
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
        subtitle={`Last week's winning class and class champions with ready-to-post messages, then the classes board and class quests for this Vietnam week${
          league ? ` (since Monday ${shortDate(league.week)})` : ""
        }. Same ranking and quests learners see. Admins, staff, and teachers are not counted.`}
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
          {league.results ? (
            <WeekResults results={league.results} />
          ) : (
            <Notice>That week&apos;s XP or practice could not be read, so its winners are not shown.</Notice>
          )}

          <h2 className="font-admin-display text-admin-headline-sm text-admin-ink">
            This week · since Monday {shortDate(league.week)}
          </h2>
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
