/**
 * Class quests.
 * A class gets two quests a Vietnam day and one a Vietnam week. Which ones is
 * a pure function of the class and the day or week, so nothing is stored for
 * the assignment. Targets scale with the class's learners, so a class of 5 and
 * a class of 16 face the same share.
 *
 * Progress is counted by the server from rows it already wrote (xp_awards,
 * study_xp_awards, duel_xp_awards, listening_runs). A finished quest pays XP
 * to every learner who added to it, once they tap claim, until the day or week
 * ends. Claims live in quest_claims under ids starting with `class`, so the XP
 * counts on every board like any other quest XP.
 */

export type ClassQuestPeriod = "day" | "week";

export type ClassQuestMetric =
  /** Learners with a paid listening or study part. */
  | "practiced"
  /** Learners with a paid study part. */
  | "studied"
  /** Learners with a paid listening part at CLASS_QUEST_ACCURACY_MIN or more. */
  | "accurate"
  /** Paid listening and study parts, each learner counted up to `perLearnerCap`. */
  | "parts"
  /** Duels finished, each learner counted up to `perLearnerCap`. */
  | "duels"
  /** Days on which `rate` of the class practiced. Weekly only. */
  | "class-days";

export type ClassQuestDefinition = {
  id: string;
  period: ClassQuestPeriod;
  metric: ClassQuestMetric;
  /**
   * Learner metrics: share of the class. Volume metrics: amount per learner.
   * "class-days": share of the class that must practice on a day.
   */
  rate: number;
  /** Volume metrics only. */
  perLearnerCap?: number;
  /** "class-days" only. */
  days?: number;
  icon: string;
  title: (target: number) => string;
};

export const CLASS_QUEST_DAILY_XP = 25;
export const CLASS_QUEST_WEEKLY_XP = 80;
export const CLASS_QUEST_ACCURACY_MIN = 90;
export const CLASS_DAILY_QUEST_COUNT = 2;
/** From this many learners, "everyone" lets one learner miss out. */
export const CLASS_EVERYONE_SLACK_FROM = 10;

export const CLASS_DAILY_POOL: readonly ClassQuestDefinition[] = [
  {
    id: "practice-60",
    period: "day",
    metric: "practiced",
    rate: 0.6,
    icon: "groups",
    title: (n) => `${n} bạn trong lớp luyện tập hôm nay`,
  },
  {
    id: "parts-2",
    period: "day",
    metric: "parts",
    rate: 2,
    perLearnerCap: 3,
    icon: "fitness_center",
    title: (n) => `Cả lớp hoàn thành ${n} phần luyện tập`,
  },
  {
    id: "accurate-40",
    period: "day",
    metric: "accurate",
    rate: 0.4,
    icon: "hearing",
    title: (n) => `${n} bạn đạt từ ${CLASS_QUEST_ACCURACY_MIN}% một phần luyện nghe`,
  },
  {
    id: "study-50",
    period: "day",
    metric: "studied",
    rate: 0.5,
    icon: "menu_book",
    title: (n) => `${n} bạn học một phần từ vựng`,
  },
  {
    id: "duels-50",
    period: "day",
    metric: "duels",
    rate: 0.5,
    perLearnerCap: 2,
    icon: "swords",
    title: (n) => `Cả lớp chơi ${n} lượt đấu`,
  },
];

export const CLASS_WEEKLY_POOL: readonly ClassQuestDefinition[] = [
  {
    id: "everyone",
    period: "week",
    metric: "practiced",
    rate: 1,
    icon: "diversity_3",
    title: (n) => `Cả lớp cùng luyện tập tuần này: ${n} bạn`,
  },
  {
    id: "class-days-5",
    period: "week",
    metric: "class-days",
    rate: 0.6,
    days: 5,
    icon: "local_fire_department",
    title: (n) => `${n} ngày có 60% lớp luyện tập`,
  },
  {
    id: "parts-6",
    period: "week",
    metric: "parts",
    rate: 6,
    perLearnerCap: 10,
    icon: "flag",
    title: (n) => `Cả lớp hoàn thành ${n} phần luyện tập tuần này`,
  },
];

const DAILY_PREFIX = "class:";
const WEEKLY_PREFIX = "class-week:";

/** The quest_claims id a class quest is stored under. */
export function classClaimId(quest: ClassQuestDefinition): string {
  return `${quest.period === "day" ? DAILY_PREFIX : WEEKLY_PREFIX}${quest.id}`;
}

/** True for quest_claims rows that belong to class quests, not personal ones. */
export function isClassQuestId(id: string): boolean {
  return id.startsWith(DAILY_PREFIX) || id.startsWith(WEEKLY_PREFIX);
}

export function classQuestXp(quest: ClassQuestDefinition): number {
  return quest.period === "day" ? CLASS_QUEST_DAILY_XP : CLASS_QUEST_WEEKLY_XP;
}

/** FNV-1a. Stable across runs and platforms. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** The class's quests for a Vietnam day: two different daily quests. */
export function pickClassDailyQuests(classKey: string, day: string): ClassQuestDefinition[] {
  const remaining = [...CLASS_DAILY_POOL];
  const picked: ClassQuestDefinition[] = [];
  for (let slot = 0; slot < CLASS_DAILY_QUEST_COUNT && remaining.length > 0; slot += 1) {
    const index = hash(`${classKey}|${day}|${slot}`) % remaining.length;
    picked.push(remaining.splice(index, 1)[0]!);
  }
  return picked;
}

/** The class's quest for a Vietnam week (`week` is its Monday). */
export function pickClassWeeklyQuest(classKey: string, week: string): ClassQuestDefinition {
  return CLASS_WEEKLY_POOL[hash(`${classKey}|${week}|week`) % CLASS_WEEKLY_POOL.length]!;
}

export function classQuestById(id: string): ClassQuestDefinition | null {
  return [...CLASS_DAILY_POOL, ...CLASS_WEEKLY_POOL].find((quest) => quest.id === id) ?? null;
}

/** What the quest asks of a class with `learners` learners. Never below 1. */
export function classQuestTarget(quest: ClassQuestDefinition, learners: number): number {
  const size = Math.max(1, Math.floor(learners));
  if (quest.metric === "class-days") return quest.days ?? 1;
  if (quest.metric === "practiced" && quest.rate >= 1) {
    return size >= CLASS_EVERYONE_SLACK_FROM ? size - 1 : size;
  }
  return Math.max(1, Math.ceil(quest.rate * size - 1e-9));
}

/** One thing a learner did, as the server stored it. `day` is the Vietnam day. */
export type ClassActivity =
  | { userId: string; day: string; kind: "listening"; accuracy: number }
  | { userId: string; day: string; kind: "study" }
  | { userId: string; day: string; kind: "duel" };

export type ClassQuestResult = {
  target: number;
  /** Capped at target. */
  progress: number;
  done: boolean;
  /** Learners who added to the quest, in roster order. */
  contributors: string[];
};

function countBy(
  activity: readonly ClassActivity[],
  match: (entry: ClassActivity) => boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of activity) {
    if (match(entry)) counts.set(entry.userId, (counts.get(entry.userId) ?? 0) + 1);
  }
  return counts;
}

const isPart = (entry: ClassActivity) => entry.kind === "listening" || entry.kind === "study";

/**
 * Progress of one quest. `activity` must already be cut to the quest's day or
 * week. Learners not in `roster` never count.
 */
export function evaluateClassQuest(
  quest: ClassQuestDefinition,
  roster: readonly string[],
  activity: readonly ClassActivity[],
): ClassQuestResult {
  const members = new Set(roster);
  const own = activity.filter((entry) => members.has(entry.userId));
  const target = classQuestTarget(quest, roster.length);

  let value = 0;
  let counts: Map<string, number>;
  switch (quest.metric) {
    case "practiced":
      counts = countBy(own, isPart);
      value = counts.size;
      break;
    case "studied":
      counts = countBy(own, (entry) => entry.kind === "study");
      value = counts.size;
      break;
    case "accurate":
      counts = countBy(
        own,
        (entry) => entry.kind === "listening" && entry.accuracy >= CLASS_QUEST_ACCURACY_MIN,
      );
      value = counts.size;
      break;
    case "parts":
    case "duels": {
      counts = countBy(own, quest.metric === "parts" ? isPart : (entry) => entry.kind === "duel");
      const cap = quest.perLearnerCap ?? Number.POSITIVE_INFINITY;
      for (const count of counts.values()) value += Math.min(count, cap);
      break;
    }
    case "class-days": {
      counts = countBy(own, isPart);
      const needed = Math.max(1, Math.ceil(quest.rate * Math.max(1, roster.length) - 1e-9));
      const byDay = new Map<string, Set<string>>();
      for (const entry of own) {
        if (!isPart(entry)) continue;
        const learners = byDay.get(entry.day) ?? new Set<string>();
        learners.add(entry.userId);
        byDay.set(entry.day, learners);
      }
      value = [...byDay.values()].filter((learners) => learners.size >= needed).length;
      break;
    }
  }

  return {
    target,
    progress: Math.min(value, target),
    done: value >= target,
    contributors: roster.filter((userId) => (counts.get(userId) ?? 0) > 0),
  };
}

export type ClassQuestDenial = "unknown" | "not-done" | "not-contributor" | "claimed";

/** Why the viewer may not claim this quest now, or null when they may. */
export function classClaimDenial(input: {
  result: ClassQuestResult | null;
  viewerId: string;
  claimed: boolean;
}): ClassQuestDenial | null {
  if (!input.result) return "unknown";
  if (input.claimed) return "claimed";
  if (!input.result.done) return "not-done";
  if (!input.result.contributors.includes(input.viewerId)) return "not-contributor";
  return null;
}

export type ClassQuestPerson = { name: string; image: string | null };

export type ClassQuestView = {
  id: string;
  period: ClassQuestPeriod;
  title: string;
  icon: string;
  xp: number;
  target: number;
  progress: number;
  done: boolean;
  /** Avatars of who helped. Never lists who did not. */
  contributors: ClassQuestPerson[];
  youContributed: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type ClassQuestBoard = {
  ready: boolean;
  /** False when the viewer is not a learner in a class. */
  hasClass: boolean;
  className: string | null;
  learners: number;
  daily: ClassQuestView[];
  weekly: ClassQuestView[];
  /** The following Vietnam midnight and Monday midnight. */
  dayEndsAt: string;
  weekEndsAt: string;
};

export function buildClassQuestView(input: {
  quest: ClassQuestDefinition;
  result: ClassQuestResult;
  viewerId: string;
  claimed: boolean;
  people: ReadonlyMap<string, ClassQuestPerson>;
}): ClassQuestView {
  const { quest, result } = input;
  return {
    id: quest.id,
    period: quest.period,
    title: quest.title(result.target),
    icon: quest.icon,
    xp: classQuestXp(quest),
    target: result.target,
    progress: result.progress,
    done: result.done,
    contributors: result.contributors.flatMap((userId) => {
      const person = input.people.get(userId);
      return person ? [person] : [];
    }),
    youContributed: result.contributors.includes(input.viewerId),
    claimed: input.claimed,
    claimable: classClaimDenial({ result, viewerId: input.viewerId, claimed: input.claimed }) === null,
  };
}

function readView(value: unknown): ClassQuestView | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    (raw.period !== "day" && raw.period !== "week") ||
    typeof raw.title !== "string" ||
    typeof raw.icon !== "string" ||
    typeof raw.xp !== "number" ||
    typeof raw.target !== "number" ||
    raw.target <= 0 ||
    typeof raw.progress !== "number" ||
    typeof raw.done !== "boolean" ||
    !Array.isArray(raw.contributors)
  ) {
    return null;
  }
  return {
    id: raw.id,
    period: raw.period,
    title: raw.title,
    icon: raw.icon,
    xp: raw.xp,
    target: raw.target,
    progress: raw.progress,
    done: raw.done,
    contributors: raw.contributors.flatMap((person) =>
      person && typeof person === "object" && typeof (person as { name?: unknown }).name === "string"
        ? [
            {
              name: (person as { name: string }).name,
              image:
                typeof (person as { image?: unknown }).image === "string"
                  ? (person as { image: string }).image
                  : null,
            },
          ]
        : [],
    ),
    youContributed: raw.youContributed === true,
    claimed: raw.claimed === true,
    claimable: raw.claimable === true,
  };
}

/** Reads a GET or POST /api/class-quests body. Null when there is nothing to show. */
export function readClassQuestBoard(value: unknown): ClassQuestBoard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.ready !== true || raw.hasClass !== true) return null;
  const read = (list: unknown) =>
    Array.isArray(list) ? list.map(readView).filter((view): view is ClassQuestView => view != null) : [];
  const daily = read(raw.daily);
  const weekly = read(raw.weekly);
  if (daily.length === 0 && weekly.length === 0) return null;
  return {
    ready: true,
    hasClass: true,
    className: typeof raw.className === "string" ? raw.className : null,
    learners: typeof raw.learners === "number" ? raw.learners : 0,
    daily,
    weekly,
    dayEndsAt: typeof raw.dayEndsAt === "string" ? raw.dayEndsAt : "",
    weekEndsAt: typeof raw.weekEndsAt === "string" ? raw.weekEndsAt : "",
  };
}
