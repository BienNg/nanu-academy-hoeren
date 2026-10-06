/**
 * The admin "Class league" page: this week's classes board, each class's
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
import { classLearners, classStandings, dayKey, leaderboardClassOptions, weekKey, type BoardPerson } from "./xp";

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

export function buildAdminClassLeague(input: {
  /** Everyone on the XP board for this week. */
  people: readonly BoardPerson[];
  /** This week's activity of every learner in a class. */
  activity: readonly ClassActivity[];
  /** This week's class quest claims. */
  claims: readonly AdminClassClaim[];
  podiums: readonly AdminClassPodiumRow[];
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
