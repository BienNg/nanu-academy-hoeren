/**
 * Class quests.
 * A class gets two quests a Vietnam day and one a Vietnam week. Which ones is
 * a pure function of the class and the day or week, so nothing is stored for
 * the assignment. A daily target is a share of the class, rounded up to a
 * whole number, and the quest shows that number. A weekly target is fixed,
 * sized for a class of about 6: 1000 XP, 40 parts, or 12 duels.
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
  /** Listening, study and duel XP added together. */
  | "xp";

export type ClassQuestDefinition = {
  id: string;
  period: ClassQuestPeriod;
  metric: ClassQuestMetric;
  /**
   * Learner metrics: share of the class. Volume metrics: amount per learner.
   * The title is given the rounded count, so the quest never shows the share.
   * Ignored when `fixedTarget` is set.
   */
  rate?: number;
  /** A target that does not change with the class size. */
  fixedTarget?: number;
  /** Volume metrics only. */
  perLearnerCap?: number;
  icon: string;
  title: (target: number) => string;
};

export const CLASS_QUEST_DAILY_XP = 25;
export const CLASS_QUEST_WEEKLY_XP = 80;
export const CLASS_QUEST_ACCURACY_MIN = 90;
export const CLASS_DAILY_QUEST_COUNT = 2;
/** Weekly piles, sized so a class of about 6 has a real week of work. */
export const CLASS_WEEKLY_XP_TARGET = 1000;
export const CLASS_WEEKLY_PARTS_TARGET = 40;
export const CLASS_WEEKLY_DUELS_TARGET = 12;

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
    icon: "fitness_center",
    title: (n) => `${n} bạn đạt từ ${CLASS_QUEST_ACCURACY_MIN}% một phần luyện tập`,
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
    id: "xp-1000",
    period: "week",
    metric: "xp",
    fixedTarget: CLASS_WEEKLY_XP_TARGET,
    icon: "bolt",
    title: (n) => `Cả lớp kiếm ${n} XP tuần này`,
  },
  {
    id: "parts-40",
    period: "week",
    metric: "parts",
    fixedTarget: CLASS_WEEKLY_PARTS_TARGET,
    icon: "flag",
    title: (n) => `Cả lớp hoàn thành ${n} phần luyện tập tuần này`,
  },
  {
    id: "duels-12",
    period: "week",
    metric: "duels",
    fixedTarget: CLASS_WEEKLY_DUELS_TARGET,
    icon: "swords",
    title: (n) => `Cả lớp chơi ${n} lượt đấu tuần này`,
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
  if (quest.fixedTarget != null) return Math.max(1, Math.floor(quest.fixedTarget));
  const size = Math.max(1, Math.floor(learners));
  return Math.max(1, Math.ceil((quest.rate ?? 0) * size - 1e-9));
}

/** One thing a learner did, as the server stored it. `day` is the Vietnam day. */
export type ClassActivity =
  | { userId: string; day: string; kind: "listening"; accuracy: number; xp?: number }
  | { userId: string; day: string; kind: "study"; xp?: number }
  | { userId: string; day: string; kind: "duel"; xp?: number };

export type ClassQuestShare = { userId: string; amount: number };

export type ClassQuestResult = {
  target: number;
  /** Capped at target. */
  progress: number;
  done: boolean;
  /** Learners who added to the quest, in roster order. */
  contributors: string[];
  /** How much of the bar each contributor filled, in roster order. */
  shares: ClassQuestShare[];
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

function countXp(activity: readonly ClassActivity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of activity) {
    const xp = entry.xp ?? 0;
    if (xp <= 0) continue;
    counts.set(entry.userId, (counts.get(entry.userId) ?? 0) + xp);
  }
  return counts;
}

/** Headcount metrics record that a learner counted, not how many parts they did. */
function asPresence(counts: Map<string, number>): Map<string, number> {
  return new Map([...counts].map(([userId]) => [userId, 1]));
}

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
  let cap = Number.POSITIVE_INFINITY;
  switch (quest.metric) {
    case "practiced":
      counts = asPresence(countBy(own, isPart));
      value = counts.size;
      break;
    case "studied":
      counts = asPresence(countBy(own, (entry) => entry.kind === "study"));
      value = counts.size;
      break;
    case "accurate":
      counts = asPresence(
        countBy(own, (entry) => entry.kind === "listening" && entry.accuracy >= CLASS_QUEST_ACCURACY_MIN),
      );
      value = counts.size;
      break;
    case "parts":
    case "duels":
      counts = countBy(own, quest.metric === "parts" ? isPart : (entry) => entry.kind === "duel");
      cap = quest.perLearnerCap ?? Number.POSITIVE_INFINITY;
      for (const count of counts.values()) value += Math.min(count, cap);
      break;
    case "xp":
      counts = countXp(own);
      for (const xp of counts.values()) value += xp;
      break;
  }

  const shares = roster.flatMap((userId) => {
    const amount = Math.min(counts.get(userId) ?? 0, cap);
    return amount > 0 ? [{ userId, amount }] : [];
  });
  return {
    target,
    progress: Math.min(value, target),
    done: value >= target,
    contributors: shares.map((share) => share.userId),
    shares,
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

export type ClassQuestPerson = { name: string; image: string | null; amount: number };

export type ClassQuestView = {
  id: string;
  period: ClassQuestPeriod;
  title: string;
  icon: string;
  xp: number;
  target: number;
  progress: number;
  done: boolean;
  /** Who helped, with how much of the bar they filled. Never lists who did not. */
  contributors: ClassQuestPerson[];
  /** Parts, duels and XP quests show each contribution. Headcount quests show faces. */
  showAmounts: boolean;
  youContributed: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type ClassQuestClassOption = { key: string; label: string };

export type ClassQuestBoard = {
  ready: boolean;
  /** False when there is no class to show. */
  hasClass: boolean;
  classKey: string;
  className: string | null;
  /** Other classes an admin can open. Empty for a learner. */
  classOptions: ClassQuestClassOption[];
  /** The viewer is watching a class they do not belong to, so they cannot claim. */
  observing: boolean;
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
  people: ReadonlyMap<string, { name: string; image: string | null }>;
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
    contributors: result.shares.flatMap((share) => {
      const person = input.people.get(share.userId);
      return person ? [{ ...person, amount: share.amount }] : [];
    }),
    showAmounts: quest.metric === "parts" || quest.metric === "duels" || quest.metric === "xp",
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
              amount:
                typeof (person as { amount?: unknown }).amount === "number"
                  ? (person as { amount: number }).amount
                  : 0,
            },
          ]
        : [],
    ),
    showAmounts: raw.showAmounts === true,
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
  const classOptions = Array.isArray(raw.classOptions)
    ? raw.classOptions.flatMap((option) =>
        option &&
        typeof option === "object" &&
        typeof (option as { key?: unknown }).key === "string" &&
        typeof (option as { label?: unknown }).label === "string"
          ? [{ key: (option as { key: string }).key, label: (option as { label: string }).label }]
          : [],
      )
    : [];
  return {
    ready: true,
    hasClass: true,
    classKey: typeof raw.classKey === "string" ? raw.classKey : "",
    className: typeof raw.className === "string" ? raw.className : null,
    classOptions,
    observing: raw.observing === true,
    learners: typeof raw.learners === "number" ? raw.learners : 0,
    daily,
    weekly,
    dayEndsAt: typeof raw.dayEndsAt === "string" ? raw.dayEndsAt : "",
    weekEndsAt: typeof raw.weekEndsAt === "string" ? raw.weekEndsAt : "",
  };
}
