/**
 * Daily quests.
 * Every learner gets three quests a day: one listening, one study, one habit.
 * Which ones is a pure function of the learner and the Vietnam day, so nothing
 * is stored for the assignment. Progress is counted by the server from rows it
 * already wrote (xp_awards, study_xp_awards, duel_xp_awards, lesson_jump_awards). The browser
 * never reports progress or XP.
 *
 * A quest day is the learner's local calendar day, so it resets at midnight
 * on their device. The browser sends its time zone in QUEST_TIME_ZONE_HEADER.
 * Leaderboard weeks stay on Vietnam time.
 *
 * A finished quest pays its XP once per day. Finishing all three pays a bonus.
 * The most a learner can earn from quests in one day is MAX_QUEST_XP.
 */

import { localCalendarDay, validTimeZone } from "./progress";

export type QuestKind = "listening" | "study" | "habit";

export type QuestMetric =
  /** Listening parts that earned XP today. */
  | "listening-parts"
  /** Listening parts that earned XP today with at least `minAccuracy`. */
  | "listening-accurate-parts"
  /** Study parts that earned XP today. */
  | "study-parts"
  /** XP from listening, study and duels today. Quest XP does not count. */
  | "base-xp";

export type QuestDefinition = {
  id: string;
  kind: QuestKind;
  metric: QuestMetric;
  target: number;
  xp: number;
  title: string;
  /** Only for listening-accurate-parts. */
  minAccuracy?: number;
};

export const QUEST_BONUS_ID = "bonus";
export const QUEST_BONUS_XP = 20;
export const QUEST_ACCURACY_MIN = 90;

/** Listening and study parts earn XP only after the server accepts the run. */
export const QUEST_POOL: readonly QuestDefinition[] = [
  { id: "listen-1", kind: "listening", metric: "listening-parts", target: 1, xp: 10, title: "Hoàn thành 1 phần nghe" },
  { id: "listen-2", kind: "listening", metric: "listening-parts", target: 2, xp: 15, title: "Hoàn thành 2 phần nghe" },
  {
    id: "listen-accurate",
    kind: "listening",
    metric: "listening-accurate-parts",
    target: 1,
    xp: 20,
    title: `Hoàn thành 1 phần nghe đúng từ ${QUEST_ACCURACY_MIN}%`,
    minAccuracy: QUEST_ACCURACY_MIN,
  },
  { id: "study-1", kind: "study", metric: "study-parts", target: 1, xp: 10, title: "Hoàn thành 1 phần học" },
  { id: "study-2", kind: "study", metric: "study-parts", target: 2, xp: 15, title: "Hoàn thành 2 phần học" },
  { id: "habit-60", kind: "habit", metric: "base-xp", target: 60, xp: 15, title: "Kiếm 60 XP hôm nay" },
  { id: "habit-100", kind: "habit", metric: "base-xp", target: 100, xp: 20, title: "Kiếm 100 XP hôm nay" },
];

export const QUEST_KINDS: readonly QuestKind[] = ["listening", "study", "habit"];

/** Hardest pick per kind plus the bonus. */
export const MAX_QUEST_XP =
  QUEST_KINDS.reduce(
    (sum, kind) =>
      sum + Math.max(...QUEST_POOL.filter((quest) => quest.kind === kind).map((quest) => quest.xp)),
    0,
  ) + QUEST_BONUS_XP;

/** FNV-1a. Stable across runs and platforms. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** The learner's three quests for a Vietnam day, in listening, study, habit order. */
export function pickDailyQuests(userId: string, day: string): QuestDefinition[] {
  return QUEST_KINDS.map((kind) => {
    const options = QUEST_POOL.filter((quest) => quest.kind === kind);
    return options[hash(`${userId}|${day}|${kind}`) % options.length]!;
  });
}

export function questById(id: string): QuestDefinition | null {
  return QUEST_POOL.find((quest) => quest.id === id) ?? null;
}

/** What the server counted for one learner on one day. */
export type QuestEvents = {
  /** Accuracy (0-100) of each listening part that earned XP today. */
  listeningAccuracies: readonly number[];
  studyParts: number;
  baseXp: number;
};

export const EMPTY_QUEST_EVENTS: QuestEvents = {
  listeningAccuracies: [],
  studyParts: 0,
  baseXp: 0,
};

export type QuestProgress = {
  id: string;
  kind: QuestKind;
  title: string;
  xp: number;
  target: number;
  /** Capped at target. */
  progress: number;
  done: boolean;
};

function measure(quest: QuestDefinition, events: QuestEvents): number {
  switch (quest.metric) {
    case "listening-parts":
      return events.listeningAccuracies.length;
    case "listening-accurate-parts":
      return events.listeningAccuracies.filter(
        (accuracy) => accuracy >= (quest.minAccuracy ?? 0),
      ).length;
    case "study-parts":
      return events.studyParts;
    case "base-xp":
      return events.baseXp;
  }
}

export function evaluateQuests(
  quests: readonly QuestDefinition[],
  events: QuestEvents,
): QuestProgress[] {
  return quests.map((quest) => {
    const value = Math.max(0, Math.floor(measure(quest, events)));
    return {
      id: quest.id,
      kind: quest.kind,
      title: quest.title,
      xp: quest.xp,
      target: quest.target,
      progress: Math.min(value, quest.target),
      done: value >= quest.target,
    };
  });
}

export type QuestClaim = { questId: string; xp: number };

/**
 * Claims that are earned and not yet stored. The bonus appears once every
 * quest is done, in the same pass as the last quest.
 */
export function claimsToCreate(
  progress: readonly QuestProgress[],
  claimedIds: ReadonlySet<string>,
): QuestClaim[] {
  const claims: QuestClaim[] = progress
    .filter((quest) => quest.done && !claimedIds.has(quest.id))
    .map((quest) => ({ questId: quest.id, xp: quest.xp }));
  const allDone = progress.length > 0 && progress.every((quest) => quest.done);
  if (allDone && !claimedIds.has(QUEST_BONUS_ID)) {
    claims.push({ questId: QUEST_BONUS_ID, xp: QUEST_BONUS_XP });
  }
  return claims;
}

/** What one finished part added to today's events. */
export type QuestEventDelta =
  | { kind: "listening"; accuracy: number; xp: number }
  | { kind: "study"; xp: number }
  /** A passed jump test. It only adds to the day's XP. */
  | { kind: "jump"; xp: number };

/** Today's events as they were before `delta` was stored. */
export function eventsBefore(events: QuestEvents, delta: QuestEventDelta | null): QuestEvents {
  if (!delta || delta.xp <= 0) return events;
  const baseXp = Math.max(0, events.baseXp - delta.xp);
  if (delta.kind === "study") {
    return { ...events, studyParts: Math.max(0, events.studyParts - 1), baseXp };
  }
  if (delta.kind === "jump") return { ...events, baseXp };
  const index = events.listeningAccuracies.lastIndexOf(delta.accuracy);
  const listeningAccuracies =
    index < 0
      ? events.listeningAccuracies
      : events.listeningAccuracies.filter((_, at) => at !== index);
  return { ...events, listeningAccuracies, baseXp };
}

/** One quest after a sync, with the progress it had before the part that triggered it. */
export type QuestStep = QuestProgress & { before: number };

export type QuestUpdate = {
  /** XP stored by one sync. */
  xp: number;
  /** Titles of quests that finished in that sync. */
  completed: string[];
  bonus: boolean;
  /** Today's quests. Empty when the board could not be read. */
  quests: QuestStep[];
};

export const NO_QUEST_UPDATE: QuestUpdate = { xp: 0, completed: [], bonus: false, quests: [] };

export function questStepMoved(step: QuestStep): boolean {
  return step.progress > step.before;
}

function readQuestStep(value: unknown): QuestStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.xp !== "number" ||
    typeof raw.target !== "number" ||
    raw.target <= 0 ||
    typeof raw.progress !== "number" ||
    typeof raw.done !== "boolean" ||
    !QUEST_KINDS.includes(raw.kind as QuestKind)
  ) {
    return null;
  }
  const before = typeof raw.before === "number" ? raw.before : raw.progress;
  return {
    id: raw.id,
    kind: raw.kind as QuestKind,
    title: raw.title,
    xp: raw.xp,
    target: raw.target,
    progress: raw.progress,
    done: raw.done,
    before: Math.min(Math.max(0, before), raw.progress),
  };
}

/**
 * Reads the `quests` field a run or study response carries. Null when no
 * quest moved or finished.
 */
export function readQuestUpdate(value: unknown): QuestUpdate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { xp?: unknown; completed?: unknown; bonus?: unknown; quests?: unknown };
  const completed = Array.isArray(raw.completed)
    ? raw.completed.filter((title): title is string => typeof title === "string")
    : [];
  const xp = typeof raw.xp === "number" && raw.xp > 0 ? raw.xp : 0;
  const bonus = raw.bonus === true;
  const quests = Array.isArray(raw.quests)
    ? raw.quests.map(readQuestStep).filter((step): step is QuestStep => step != null)
    : [];
  if (xp === 0 && completed.length === 0 && !bonus && !quests.some(questStepMoved)) return null;
  return { xp, completed, bonus, quests };
}

export const QUEST_TIME_ZONE_HEADER = "x-time-zone";
/** Used when a request carries no valid zone. */
export const QUEST_DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** The zone a request asked for, or Vietnam when it sent none that is real. */
export function resolveQuestZone(value: unknown): string {
  return validTimeZone(value) ?? QUEST_DEFAULT_TIME_ZONE;
}

/** Local calendar day (`YYYY-MM-DD`) of `now` in `zone`. */
export function questDay(now: Date, zone: string): string {
  return localCalendarDay(now, zone);
}

function zoneOffsetMs(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** First instant of calendar day `year-month-day` (month is 1-based, day may overflow) in `zone`. */
function zonedMidnight(year: number, month: number, day: number, zone: string): number {
  const utcMidnight = Date.UTC(year, month - 1, day);
  const guess = utcMidnight - zoneOffsetMs(utcMidnight, zone);
  return utcMidnight - zoneOffsetMs(guess, zone);
}

/** `[start, end)` of local calendar day `day` in `zone`, as ISO timestamps. */
export function zonedDayRange(day: string, zone: string): { start: string; end: string } {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return {
    start: new Date(zonedMidnight(year, month, date, zone)).toISOString(),
    end: new Date(zonedMidnight(year, month, date + 1, zone)).toISOString(),
  };
}

/** Request headers that tell the server this device's time zone. Browser only. */
export function questZoneHeaders(): Record<string, string> {
  try {
    const zone = validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return zone ? { [QUEST_TIME_ZONE_HEADER]: zone } : {};
  } catch {
    return {};
  }
}
