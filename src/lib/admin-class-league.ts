/**
 * The admin "Class league" page: a finished week's winners with the messages
 * support posts in the group chats, this week's classes board, each class's
 * quests and claims, and the stored class podiums. Pure, so it can be tested
 * without Supabase. Uses the same ranking and quests learners see.
 */

import {
  classClaimId,
  classQuestXp,
  evaluateClassQuest,
  isClassQuestId,
  pickClassDailyQuests,
  pickClassWeeklyQuest,
  type ClassActivity,
  type ClassQuestDefinition,
} from "./class-quests";
import {
  classLearners,
  classPodiums,
  classStandings,
  dayKey,
  leaderboardClassKey,
  leaderboardClassOptions,
  weekKey,
  type BoardPerson,
} from "./xp";

const WEEK_MS = 7 * 86_400_000;
/** Finished weeks whose winners the page can show. */
export const RESULT_WEEKS = 8;
/** A class needs this many learners to be "most active", so a class of one cannot win it every week. */
export const MOST_ACTIVE_MIN_LEARNERS = 3;
/** Below this many classes with XP, posts say "hạng 2" instead of "hạng 2/3". */
export const RANK_TOTAL_MIN_CLASSES = 5;
const MEDALS = ["🥇", "🥈", "🥉"] as const;

export type AdminWeekChampion = {
  name: string;
  xp: number;
  /** Google profile photo, or null when this learner has none. */
  image: string | null;
};

export type AdminWeekClassResult = {
  classKey: string;
  name: string;
  /** Null when the class had no XP that week. */
  rank: number | null;
  weekXp: number;
  learners: number;
  /** Learners who practiced at least once that week. */
  activeLearners: number;
  /** The class's top 3 learners by week XP, best first, in board order. */
  champions: AdminWeekChampion[];
  /** Every learner who earned XP that week, best first. The class league card shows the first 3. */
  participants: { name: string; xp: number }[];
  /** Post for the class's own group chat. */
  message: string;
};

export type AdminWeekResults = {
  week: string;
  /** Neighbouring finished weeks the page can switch to. */
  older: string | null;
  newer: string | null;
  /** Classes with XP that week, out of every class. */
  rankedClasses: number;
  /** Ranked first, then the classes without XP. */
  classes: AdminWeekClassResult[];
  mostActive: { classKey: string; name: string; active: number; learners: number } | null;
  /** Post for the group every class is in. Null when no class earned XP or the viewer only sees some classes. */
  announcement: string | null;
};

export type AdminClassQuestStatus = {
  id: string;
  title: string;
  xp: number;
  target: number;
  progress: number;
  done: boolean;
  /** Names of who helped, in roster order. */
  contributors: string[];
  /** Learners who claimed it. */
  claimed: number;
};

export type AdminClassDay = {
  day: string;
  /** Daily quests the class finished that day, out of `total`. */
  done: number;
  total: number;
};

export type AdminClassLeagueRow = {
  classKey: string;
  name: string;
  /** Null while the class has no XP this week. */
  rank: number | null;
  learners: number;
  weekXp: number;
  xpPerLearner: number;
  /** Learners who practiced at least once this week. */
  activeLearners: number;
  today: AdminClassQuestStatus[];
  weekly: AdminClassQuestStatus;
  /** Monday to today. */
  days: AdminClassDay[];
  claims: number;
  claimXp: number;
};

export type AdminClassPodiumWeek = {
  week: string;
  places: { rank: number; name: string; classXp: number; learners: number }[];
};

export type AdminClassLeague = {
  week: string;
  today: string;
  /** Null when that week's XP or activity could not be read. */
  results: AdminWeekResults | null;
  classes: AdminClassLeagueRow[];
  /** Newest week first. */
  podiums: AdminClassPodiumWeek[];
  totals: {
    classes: number;
    rankedClasses: number;
    dailyDone: number;
    dailyTotal: number;
    weeklyDone: number;
    claims: number;
    claimXp: number;
  };
};

export type AdminClassClaim = { userId: string; questId: string; xp: number; day: string };

export type AdminClassPodiumRow = {
  week: string;
  userId: string;
  classKey: string;
  rank: number;
  classXp: number;
};

/** Vietnam days from the week's Monday to `today`, oldest first. */
export function weekDaysSoFar(now: Date): string[] {
  const today = dayKey(now);
  const [year, month, day] = weekKey(now).split("-").map(Number) as [number, number, number];
  const days: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    const key = date.toISOString().slice(0, 10);
    days.push(key);
    if (key === today) break;
  }
  return days;
}

/** Mondays of the last finished Vietnam weeks, newest first. */
export function finishedWeeks(now: Date, count = RESULT_WEEKS): string[] {
  return Array.from({ length: count }, (_, index) => weekKey(new Date(now.getTime() - (index + 1) * WEEK_MS)));
}

/** The requested finished week, or last week when it is not one the page shows. */
export function parseResultWeek(value: unknown, now: Date): string {
  const weeks = finishedWeeks(now);
  return typeof value === "string" && weeks.includes(value) ? value : weeks[0]!;
}

/** Noon on the week's Monday in Vietnam: a moment inside that week. */
export function dateInWeek(week: string): Date {
  const [year, month, day] = week.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, 5));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "29.09 – 05.10" for the week starting Monday 2026-09-29. */
export function resultWeekLabel(week: string): string {
  const [year, month, day] = week.split("-").map(Number) as [number, number, number];
  const short = (date: Date) => `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;
  return `${short(new Date(Date.UTC(year, month - 1, day)))} – ${short(new Date(Date.UTC(year, month - 1, day + 6)))}`;
}

function viCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

/** "Lớp A1" whether or not the class name already starts with "Lớp". */
export function leagueClassLabel(name: string, lower = false): string {
  return `${lower ? "lớp" : "Lớp"} ${name.replace(/^lớp\s+/iu, "")}`;
}
/** Where the podium card is drawn. Without `classKey` it is the card for the all-classes group. */
export function leagueCardUrl(week: string, classKey?: string): string {
  const params = new URLSearchParams({ week });
  if (classKey) params.set("class", classKey);
  return `/admin/class-league/card?${params}`;
}

/** "giai-dau-lop-2026-09-28-g128.png". Accents and anything else unsafe in a file name are dropped. */
export function leagueCardFileName(week: string, className?: string): string {
  const slug = (className ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `giai-dau-lop-${week}${slug ? `-${slug}` : ""}.png`;
}

/** "2/6", or just "2" while too few classes take part for the total to sound like an achievement. */
function rankText(rank: number, ranked: number): string {
  return ranked >= RANK_TOTAL_MIN_CLASSES ? `${rank}/${ranked}` : String(rank);
}

function classResultMessage(
  row: Omit<AdminWeekClassResult, "message">,
  context: { weekLabel: string; ranked: number },
): string {
  if (row.rank == null) return "Tuần mới bắt đầu rồi! 💪 Ai sẽ là quán quân đầu tiên của lớp mình?";
  const xp = viCount(row.weekXp);
  const place = rankText(row.rank, context.ranked);
  const head =
    row.rank === 1
      ? `🏆 Lớp mình VÔ ĐỊCH Giải đấu Lớp tuần ${context.weekLabel} với ${xp} XP! Chúc mừng cả lớp 🎉`
      : row.rank <= 3
        ? `🎉 Tuần ${context.weekLabel} lớp mình về hạng ${place} với ${xp} XP!`
        : `💪 Tuần ${context.weekLabel} lớp mình đạt ${xp} XP, xếp hạng ${place}.`;
  const blocks: string[][] = [
    row.rank <= 3
      ? [head, `Các bạn đã góp XP nhận huy hiệu "${row.rank === 1 ? "Lớp vô địch" : "Lớp trên bục"}" 🎖️`]
      : [head],
  ];
  const [champion, ...rest] = row.champions;
  if (champion) {
    const lines = [`🌟 Quán quân tuần của lớp: ${champion.name} – ${viCount(champion.xp)} XP 👏`];
    if (rest.length > 0) lines.push(rest.map((entry, index) => `${MEDALS[index + 1]} ${entry.name}`).join(" · "));
    blocks.push(lines);
  }
  if (row.activeLearners > 0) blocks.push([`Cảm ơn ${row.activeLearners} bạn đã cùng luyện tập! ❤️`]);
  blocks.push(["Tuần mới đã bắt đầu – cả lớp cùng cố gắng nhé! 💪"]);
  return blocks.map((lines) => lines.join("\n")).join("\n\n");
}

function leagueAnnouncement(
  classes: readonly AdminWeekClassResult[],
  mostActive: AdminWeekResults["mostActive"],
  weekLabel: string,
): string | null {
  const ranked = classes.filter((row) => row.rank != null);
  const winner = ranked[0];
  if (!winner) return null;
  const blocks: string[][] = [
    [`🏆 KẾT QUẢ GIẢI ĐẤU LỚP · Tuần ${weekLabel}`],
    ranked.slice(0, 3).map((row, index) => `${MEDALS[index]} ${leagueClassLabel(row.name)} – ${viCount(row.weekXp)} XP`),
    [`Chúc mừng cả ${leagueClassLabel(winner.name, true)}! 🎉 Các bạn đã góp XP nhận huy hiệu "Lớp vô địch".`],
  ];
  const champions = ranked.flatMap((row) =>
    row.champions[0] ? [`• ${leagueClassLabel(row.name)}: ${row.champions[0].name} – ${viCount(row.champions[0].xp)} XP`] : [],
  );
  if (champions.length > 0) blocks.push(["🌟 Quán quân tuần của từng lớp:", ...champions]);
  const extras: string[] = [];
  if (mostActive) {
    const share = Math.round((mostActive.active / mostActive.learners) * 100);
    extras.push(`⚡ Lớp chăm nhất: ${leagueClassLabel(mostActive.name)} – ${share}% học viên luyện tập`);
  }
  if (extras.length > 0) blocks.push(extras);
  blocks.push([`Tuần mới, cơ hội mới – lớp nào sẽ lên ngôi tuần này? Xem tab "Lớp" trong Bảng xếp hạng nhé 💪`]);
  return blocks.map((lines) => lines.join("\n")).join("\n\n");
}

/**
 * A finished week's winners: every class's rank and top 3 learners, the most
 * active class, and the messages support copies into the group chats. `now`
 * decides which finished weeks the page can switch to.
 */
export function buildAdminWeekResults(input: {
  week: string;
  /** Everyone on the XP board for that week. */
  people: readonly BoardPerson[];
  /** That week's activity of every learner in a class. */
  activity: readonly ClassActivity[];
  now: Date;
}): AdminWeekResults {
  const learners = classLearners(input.people);
  const labels = new Map(leaderboardClassOptions(learners).map((option) => [option.key, option.label]));
  const standings = new Map(classStandings(input.people).map((entry, index) => [entry.classKey, index + 1]));
  const byId = new Map(learners.map((person) => [person.userId, person]));
  const champions = new Map<string, (AdminWeekChampion & { rank: number })[]>();
  for (const place of classPodiums(learners)) {
    const list = champions.get(place.classKey) ?? [];
    const person = byId.get(place.userId);
    list.push({ rank: place.rank, name: person?.name ?? place.userId, xp: place.xp, image: person?.image ?? null });
    champions.set(place.classKey, list);
  }
  const rosters = new Map<string, string[]>();
  for (const person of learners) {
    const roster = rosters.get(person.classKey) ?? [];
    roster.push(person.userId);
    rosters.set(person.classKey, roster);
  }

  const weekLabel = resultWeekLabel(input.week);
  const xpOf = new Map(learners.map((person) => [person.userId, Math.max(0, person.xp)]));
  const classes = [...rosters].map(([classKey, ids]): AdminWeekClassResult => {
    const members = new Set(ids);
    const activity = input.activity.filter((entry) => members.has(entry.userId));
    const participants = ids
      .flatMap((id) => {
        const person = byId.get(id);
        const xp = person ? Math.max(0, person.xp) : 0;
        return person && xp > 0 ? [{ name: person.name, xp }] : [];
      })
      .sort(
        (left, right) => right.xp - left.xp || left.name.localeCompare(right.name, "vi", { sensitivity: "base" }),
      );
    const row = {
      classKey,
      name: labels.get(classKey) ?? classKey,
      rank: standings.get(classKey) ?? null,
      weekXp: ids.reduce((sum, id) => sum + (xpOf.get(id) ?? 0), 0),
      learners: ids.length,
      activeLearners: new Set(activity.filter((entry) => entry.kind !== "duel").map((entry) => entry.userId)).size,
      champions: (champions.get(classKey) ?? [])
        .sort((left, right) => left.rank - right.rank)
        .map(({ name, xp, image }) => ({ name, xp, image })),
      participants,
    };
    return { ...row, message: classResultMessage(row, { weekLabel, ranked: standings.size }) };
  });
  classes.sort(
    (left, right) =>
      (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name, "vi", { sensitivity: "base" }),
  );

  const active = classes
    .filter((row) => row.learners >= MOST_ACTIVE_MIN_LEARNERS && row.activeLearners > 0)
    .sort(
      (left, right) =>
        right.activeLearners / right.learners - left.activeLearners / left.learners ||
        right.activeLearners - left.activeLearners ||
        (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY) ||
        left.name.localeCompare(right.name, "vi", { sensitivity: "base" }),
    )[0];
  const mostActive = active
    ? { classKey: active.classKey, name: active.name, active: active.activeLearners, learners: active.learners }
    : null;

  const weeks = finishedWeeks(input.now);
  const index = weeks.indexOf(input.week);
  return {
    week: input.week,
    older: index >= 0 ? (weeks[index + 1] ?? null) : null,
    newer: index > 0 ? weeks[index - 1]! : null,
    rankedClasses: standings.size,
    classes,
    mostActive,
    announcement: leagueAnnouncement(classes, mostActive, weekLabel),
  };
}

export function buildAdminClassLeague(input: {
  /** Everyone on the XP board for this week. */
  people: readonly BoardPerson[];
  /** This week's activity of every learner in a class. */
  activity: readonly ClassActivity[];
  /** This week's class quest claims. */
  claims: readonly AdminClassClaim[];
  podiums: readonly AdminClassPodiumRow[];
  /** The finished week whose winners the page shows, from `buildAdminWeekResults`. */
  results?: AdminWeekResults | null;
  now: Date;
}): AdminClassLeague {
  const today = dayKey(input.now);
  const week = weekKey(input.now);
  const days = weekDaysSoFar(input.now);
  const learners = classLearners(input.people);
  const labels = new Map(leaderboardClassOptions(learners).map((option) => [option.key, option.label]));
  const standings = new Map(classStandings(input.people).map((entry, index) => [entry.classKey, { ...entry, rank: index + 1 }]));

  const rosters = new Map<string, BoardPerson[]>();
  for (const person of learners) {
    const roster = rosters.get(person.classKey) ?? [];
    roster.push(person);
    rosters.set(person.classKey, roster);
  }

  const classOf = new Map(learners.map((person) => [person.userId, person.classKey]));
  const claims = input.claims.filter((claim) => isClassQuestId(claim.questId) && classOf.has(claim.userId));

  const classes = [...rosters].map(([classKey, roster]): AdminClassLeagueRow => {
    const ids = roster.map((person) => person.userId);
    const names = new Map(roster.map((person) => [person.userId, person.name]));
    const members = new Set(ids);
    const activity = input.activity.filter((entry) => members.has(entry.userId));
    const classClaims = claims.filter((claim) => classOf.get(claim.userId) === classKey);

    const status = (quest: ClassQuestDefinition, entries: readonly ClassActivity[], day: string | null) => {
      const result = evaluateClassQuest(quest, ids, entries);
      const claimId = classClaimId(quest);
      return {
        id: quest.id,
        title: quest.title(result.target),
        xp: classQuestXp(quest),
        target: result.target,
        progress: result.progress,
        done: result.done,
        contributors: result.contributors.map((userId) => names.get(userId) ?? userId),
        claimed: classClaims.filter((claim) => claim.questId === claimId && (day == null || claim.day === day)).length,
      };
    };

    const dayStatus = days.map((day) => {
      const quests = pickClassDailyQuests(classKey, day);
      const entries = activity.filter((entry) => entry.day === day);
      return { day, done: quests.filter((quest) => evaluateClassQuest(quest, ids, entries).done).length, total: quests.length };
    });
    const standing = standings.get(classKey);
    const weekXp = roster.reduce((sum, person) => sum + Math.max(0, person.xp), 0);
    return {
      classKey,
      name: labels.get(classKey) ?? classKey,
      rank: standing?.rank ?? null,
      learners: roster.length,
      weekXp,
      xpPerLearner: Math.round(weekXp / roster.length),
      activeLearners: new Set(
        activity.filter((entry) => entry.kind !== "duel").map((entry) => entry.userId),
      ).size,
      today: pickClassDailyQuests(classKey, today).map((quest) =>
        status(quest, activity.filter((entry) => entry.day === today), today),
      ),
      weekly: status(pickClassWeeklyQuest(classKey, week), activity, null),
      days: dayStatus,
      claims: classClaims.length,
      claimXp: classClaims.reduce((sum, claim) => sum + claim.xp, 0),
    };
  });

  classes.sort(
    (left, right) =>
      (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY) ||
      left.name.localeCompare(right.name, "vi", { sensitivity: "base" }),
  );

  const podiumWeeks = new Map<string, Map<string, { rank: number; classKey: string; classXp: number; learners: number }>>();
  for (const row of input.podiums) {
    const places = podiumWeeks.get(row.week) ?? new Map();
    const place = places.get(row.classKey) ?? { rank: row.rank, classKey: row.classKey, classXp: row.classXp, learners: 0 };
    place.learners += 1;
    places.set(row.classKey, place);
    podiumWeeks.set(row.week, places);
  }
  const podiums = [...podiumWeeks]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([podiumWeek, places]) => ({
      week: podiumWeek,
      places: [...places.values()]
        .sort((left, right) => left.rank - right.rank)
        .map((place) => ({
          rank: place.rank,
          name: labels.get(place.classKey) ?? place.classKey,
          classXp: place.classXp,
          learners: place.learners,
        })),
    }));

  const dailyTotal = classes.reduce((sum, row) => sum + row.days.reduce((total, day) => total + day.total, 0), 0);
  return {
    week,
    today,
    results: input.results ?? null,
    classes,
    podiums,
    totals: {
      classes: classes.length,
      rankedClasses: classes.filter((row) => row.rank != null).length,
      dailyDone: classes.reduce((sum, row) => sum + row.days.reduce((total, day) => total + day.done, 0), 0),
      dailyTotal,
      weeklyDone: classes.filter((row) => row.weekly.done).length,
      claims: claims.length,
      claimXp: claims.reduce((sum, claim) => sum + claim.xp, 0),
    },
  };
}

/** Keep the classes a teacher is assigned to, and recount the page totals. */
export function limitAdminClassLeague(
  league: AdminClassLeague,
  classKeys: ReadonlySet<string> | null,
): AdminClassLeague {
  if (!classKeys) return league;
  const classes = league.classes.filter((row) => classKeys.has(row.classKey));
  const podiums = league.podiums
    .map((week) => ({
      ...week,
      places: week.places.filter((place) => classKeys.has(leaderboardClassKey(place.name))),
    }))
    .filter((week) => week.places.length > 0);
  const dailyTotal = classes.reduce(
    (sum, row) => sum + row.days.reduce((total, day) => total + day.total, 0),
    0,
  );
  const results = league.results
    ? {
        ...league.results,
        classes: league.results.classes.filter((row) => classKeys.has(row.classKey)),
        mostActive:
          league.results.mostActive && classKeys.has(league.results.mostActive.classKey)
            ? league.results.mostActive
            : null,
        announcement: null,
      }
    : null;
  return {
    ...league,
    results,
    classes,
    podiums,
    totals: {
      classes: classes.length,
      rankedClasses: classes.filter((row) => row.rank != null).length,
      dailyDone: classes.reduce(
        (sum, row) => sum + row.days.reduce((total, day) => total + day.done, 0),
        0,
      ),
      dailyTotal,
      weeklyDone: classes.filter((row) => row.weekly.done).length,
      claims: classes.reduce((sum, row) => sum + row.claims, 0),
      claimXp: classes.reduce((sum, row) => sum + row.claimXp, 0),
    },
  };
}
