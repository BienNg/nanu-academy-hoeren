/**
 * Ranked XP for a finished listening part.
 * The browser never sends a point total. The server scores the run.
 *
 * A part pays a fixed amount. More clips, longer sentences, and the CEFR
 * band do not change it. The first pass pays 35. The second and third pay
 * 20. Every pass after that pays 10. A new shuffled run on the same day
 * is another pass and pays again.
 */

import type { BlitzrundeBoardExtras } from "./blitzrunde";

export const MIN_MS_PER_CLIP = 2000;
/** Finished passes of one lesson before a part pays the mastered amount. */
export const MASTERED_PASSES = 3;
export const LISTENING_FIRST_PART_XP = 35;
export const LISTENING_RERUN_PART_XP = 20;
export const MASTERED_PART_XP = 10;
export const STUDY_FIRST_PART_XP = 20;
export const STUDY_RERUN_PART_XP = 10;
export const GLOBAL_LEADERBOARD_LIMIT = 50;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export type XpKind = "new" | "review" | "repeat" | "fail" | "rejected";

export type XpClipResult = {
  clipId: string;
  passed: boolean;
  missed: boolean;
};

export type LessonClip = {
  id: string;
  script: string;
};

export type XpDecision = {
  xp: number;
  kind: XpKind;
  dayKey: string;
  weekKey: string;
  /** Write a row so this part cannot earn points again today. */
  store: boolean;
};

export type BoardPerson = {
  userId: string;
  name: string;
  classKey: string;
  className: string | null;
  isAdmin: boolean;
  /** Staff accounts. Left out of the class ranking. */
  isStaff?: boolean;
  /** Teachers. Left out of class rankings, the same as staff. */
  isTeacher?: boolean;
  xp: number;
  reachedAt: string | null;
  won?: number;
  tied?: number;
  lost?: number;
  /** Blitzrunde board only: 2nd / 3rd places and rounds played. */
  silver?: number;
  bronze?: number;
  rounds?: number;
  /** Blitzrunde class board only: earned points here but has since moved to another class. */
  former?: boolean;
  /** Google profile photo, or null when this person has none. */
  image?: string | null;
};

export type LeaderboardClassOption = {
  key: string;
  label: string;
};

export type LeaderboardScope = "class" | "global";
export type LeaderboardRange = "week" | "all";
/**
 * "blitzrunde" reuses the xp slot for Blitzrunde points (not XP) and `won` for rounds won.
 * "classes" ranks whole classes by week XP. Its rows are in `classes`, not `rows`.
 */
export type LeaderboardBoard = "xp" | "duel" | "blitzrunde" | "classes";

export type ClassBoardRow = {
  rank: number;
  name: string;
  /** Week XP of every learner in the class. */
  xp: number;
  /** Learners in the class, those without XP included. */
  members: number;
  /** `xp / members`, rounded. */
  xpPerMember: number;
  isYours: boolean;
};

export type ClassChampionPlace = {
  rank: number;
  name: string;
  xp: number;
  /** The viewer's class today. */
  isYours: boolean;
  /** Learners in the class today, by name. */
  students: { name: string; isYou: boolean }[];
};

export type ClassChampions = {
  /** Monday of the finished week. */
  week: string;
  /** Up to three classes. Empty when no class earned XP that week. */
  places: ClassChampionPlace[];
};

export type ClassBoardExtras = {
  rows: ClassBoardRow[];
  /** Top 3 classes of last week. Absent when it could not be read. */
  lastWeek?: ClassChampions;
  /** Null when the viewer's class is not ranked. */
  yourClassRank: number | null;
  yourClassXp: number;
  /** The viewer's own week XP, counted in their class. 0 for admins and staff. */
  yourContribution: number;
};

export type LeaderboardRow = {
  rank: number | null;
  name: string;
  xp: number;
  isYou: boolean;
  gapBefore: boolean;
  won: number;
  tied: number;
  lost: number;
  image: string | null;
  silver?: number;
  bronze?: number;
  rounds?: number;
  former?: boolean;
};

export type LeaderboardPayload = {
  ready: boolean;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  weekEndsAt: string;
  countdown: string;
  className: string | null;
  /** Class currently ranked when scope is "class". */
  classKey: string | null;
  /** Every class, only for admins and staff. Empty for learners. */
  classOptions: LeaderboardClassOption[];
  yourXp: number;
  yourRank: number | null;
  yourWon: number;
  yourTied: number;
  yourLost: number;
  board: LeaderboardBoard;
  viewerIsAdmin: boolean;
  /** The viewer's class has a Blitzrunde that left the lobby. */
  blitzrundeAvailable: boolean;
  /** The viewer has a real class, so duels can find classmates. */
  duelAvailable: boolean;
  rows: LeaderboardRow[];
  /** Only on the Blitzrunde board. */
  blitzrunde?: BlitzrundeBoardExtras;
  /** Only on the classes board. */
  classes?: ClassBoardExtras;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function vietnamParts(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Calendar day in Asia/Ho_Chi_Minh, `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const parts = vietnamParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Monday of the Vietnam week that contains `date`, `YYYY-MM-DD`. */
export function weekKey(date: Date): string {
  const parts = vietnamParts(date);
  const daysFromMonday = (parts.weekday + 6) % 7;
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - daysFromMonday * 86_400_000);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

/** The following Monday 00:00 in Asia/Ho_Chi_Minh. */
export function weekEndsAt(date: Date): string {
  const [year, month, day] = weekKey(date).split("-").map(Number);
  const mondayStart = Date.UTC(year!, month! - 1, day!) - VN_OFFSET_MS;
  return new Date(mondayStart + 7 * 86_400_000).toISOString();
}

export function formatWeekCountdown(endsAt: string, now: Date): string {
  const ms = Date.parse(endsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "Tuần mới";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? "Còn 1 ngày" : `Còn ${days} ngày`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return hours === 1 ? "Còn 1 giờ" : `Còn ${hours} giờ`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return minutes === 1 ? "Còn 1 phút" : `Còn ${minutes} phút`;
}

export const XP_SCHEMA_HINT =
  "Run supabase/xp_awards.sql once in the Supabase SQL editor.";

export const STUDY_XP_SCHEMA_HINT =
  "Run supabase/study_xp_awards.sql once in the Supabase SQL editor.";

export function isXpSchemaMissing(message: string): boolean {
  return (
    /(?<!study_)xp_awards/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export function isStudyXpSchemaMissing(message: string): boolean {
  return (
    /study_xp_awards/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

/** Same grouping key the admin class list uses. */
export function leaderboardClassKey(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi");
}

/** Prefix of a leaderboard-only class for Leben-in-Deutschland learners. */
export const LIVING_BOARD_CLASS_PREFIX = "living:";

/**
 * Class used on the XP board: the real class when there is one, otherwise the
 * first granted Leben-in-Deutschland workplace, so self-learners in the same
 * workplace compete as one class. Duels and Blitzrunde keep using the real class.
 */
export function boardClassFor(
  className: string | null,
  workplaces: readonly { slug: string; label: string }[],
): { classKey: string; className: string | null } {
  const real = leaderboardClassKey(className);
  if (real) return { classKey: real, className };
  const workplace = workplaces[0];
  if (!workplace) return { classKey: "", className: null };
  return {
    classKey: `${LIVING_BOARD_CLASS_PREFIX}${workplace.slug}`,
    className: workplace.label,
  };
}

/** Distinct classes, labeled with the most common spelling of each name. */
export function leaderboardClassOptions(
  people: readonly { classKey: string; className: string | null }[],
): LeaderboardClassOption[] {
  const groups = new Map<string, Map<string, number>>();
  for (const person of people) {
    if (!person.classKey) continue;
    const label = person.className?.trim() || person.classKey;
    const votes = groups.get(person.classKey) ?? new Map<string, number>();
    votes.set(label, (votes.get(label) ?? 0) + 1);
    groups.set(person.classKey, votes);
  }

  const options: LeaderboardClassOption[] = [];
  for (const [key, votes] of groups) {
    let label = key;
    let best = -1;
    for (const [candidate, count] of votes) {
      if (
        count > best ||
        (count === best && candidate.localeCompare(label, "vi", { sensitivity: "base" }) < 0)
      ) {
        best = count;
        label = candidate;
      }
    }
    options.push({ key, label });
  }
  options.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
  return options;
}

export function leaderboardDisplayName(name: string | null | undefined): string {
  const trimmed = name?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : "Học viên";
}

const GOOGLE_PROFILE_HOST = "lh3.googleusercontent.com";

/** A Google account photo URL, or null for anything else. */
export function googleProfileImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== GOOGLE_PROFILE_HOST) return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/**
 * Full passes already finished before this part.
 * Progress remembers passes from before run history existed. On the last
 * part that count may already include the pass being finished now.
 */
export function passesAlreadyFinished(input: {
  partNumber: number;
  partCount: number;
  storedRunCount: number;
  recordedFinishes: number;
}): number {
  const stored = Math.max(0, Math.floor(input.storedRunCount));
  const recorded = Math.max(0, Math.floor(input.recordedFinishes));
  const fromProgress =
    input.partNumber === input.partCount && input.partCount > 0 ? stored - 1 : stored;
  return Math.max(recorded, fromProgress);
}

/**
 * Clip count a practice run on a CEFR trail node must have, or null when the
 * run does not fit part `partNumber`. Parts are cut from the node's cards, so a
 * run plays every clip with a card in its part, and nothing else.
 */
export function nodePracticeRunSize(input: {
  /** Practice parts of the lesson across every node, in order. */
  parts: readonly { clipIds: readonly string[] }[];
  partNumber: number;
  partCount: number;
  runClipIds: readonly string[];
}): number | null {
  if (input.partCount !== input.parts.length) return null;
  const part = input.parts[input.partNumber - 1];
  if (!part || part.clipIds.length === 0) return null;
  const run = new Set(input.runClipIds);
  if (run.size !== input.runClipIds.length || run.size !== part.clipIds.length) return null;
  if (!part.clipIds.every((id) => run.has(id))) return null;
  return run.size;
}

/** XP for one part from how many full passes of that lesson are already finished. */
export function xpForFinishedPasses(
  finishedPasses: number,
  firstXp: number,
  rerunXp: number,
): { xp: number; kind: "new" | "review" } {
  if (finishedPasses <= 0) return { xp: firstXp, kind: "new" };
  if (finishedPasses >= MASTERED_PASSES) return { xp: MASTERED_PART_XP, kind: "review" };
  return { xp: rerunXp, kind: "review" };
}

function rejected(now: Date): XpDecision {
  return {
    xp: 0,
    kind: "rejected",
    dayKey: dayKey(now),
    weekKey: weekKey(now),
    store: false,
  };
}

export function decidePartXp(input: {
  outcome: "success" | "fail";
  elapsedMs: number;
  /** How many clips this part number must contain. Null when the part is not real. */
  expectedCount: number | null;
  results: readonly XpClipResult[];
  lessonClips: readonly LessonClip[];
  /** Full listening passes of this lesson already finished, not counting this part. */
  finishedPasses: number;
  now: Date;
}): XpDecision {
  const now = input.now;
  const keys = {
    dayKey: dayKey(now),
    weekKey: weekKey(now),
  };
  if (input.outcome === "fail") {
    return { xp: 0, kind: "fail", store: false, ...keys };
  }

  const expected = input.expectedCount;
  if (expected == null || expected < 1 || input.results.length !== expected) return rejected(now);

  const byId = new Map<string, LessonClip>();
  for (const clip of input.lessonClips) {
    if (byId.has(clip.id)) return rejected(now);
    byId.set(clip.id, clip);
  }

  const seen = new Set<string>();
  for (const result of input.results) {
    if (seen.has(result.clipId) || !result.passed) return rejected(now);
    seen.add(result.clipId);
    const clip = byId.get(result.clipId);
    if (!clip) return rejected(now);
  }

  if (input.elapsedMs < expected * MIN_MS_PER_CLIP) return rejected(now);

  const award = xpForFinishedPasses(
    input.finishedPasses,
    LISTENING_FIRST_PART_XP,
    LISTENING_RERUN_PART_XP,
  );
  return { ...award, store: true, ...keys };
}

/**
 * Flat XP for one finished study part. The browser sends the clips and the
 * time spent. This function decides the points.
 */
export function decideStudyPartXp(input: {
  elapsedMs: number;
  /** How many clips this part number must contain. Null when the part is not real. */
  expectedCount: number | null;
  clipCount: number;
  /** Earlier paid passes of this study part, not counting this one. */
  finishedPasses: number;
  now: Date;
}): XpDecision {
  const keys = {
    dayKey: dayKey(input.now),
    weekKey: weekKey(input.now),
  };
  const expected = input.expectedCount;
  if (
    expected == null ||
    expected < 1 ||
    input.clipCount !== expected ||
    input.elapsedMs < expected * MIN_MS_PER_CLIP
  ) {
    return { xp: 0, kind: "rejected", store: false, ...keys };
  }
  const award = xpForFinishedPasses(
    input.finishedPasses,
    STUDY_FIRST_PART_XP,
    STUDY_RERUN_PART_XP,
  );
  return { ...award, store: true, ...keys };
}

const STUDY_XP_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudyXpInput = {
  id: string;
  lessonKey: string;
  partNumber: number;
  partCount: number;
  elapsedMs: number;
  clipIds: string[];
};

function studyInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/** A finished study part the browser may submit. Null when the body is not one. */
export function parseStudyXpInput(value: unknown): StudyXpInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !STUDY_XP_ID.test(record.id)) return null;
  if (typeof record.lessonKey !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.lessonKey)) {
    return null;
  }
  const partNumber = studyInteger(record.partNumber, 1, 99);
  const partCount = studyInteger(record.partCount, 1, 99);
  const elapsedMs = studyInteger(record.elapsedMs, 0, 24 * 60 * 60 * 1000);
  if (partNumber == null || partCount == null || elapsedMs == null || partNumber > partCount) {
    return null;
  }
  if (!Array.isArray(record.clipIds) || record.clipIds.length < 1 || record.clipIds.length > 12) {
    return null;
  }
  const clipIds: string[] = [];
  const seen = new Set<string>();
  for (const id of record.clipIds) {
    if (typeof id !== "string" || id.length < 1 || id.length > 200 || seen.has(id)) return null;
    seen.add(id);
    clipIds.push(id);
  }
  return { id: record.id, lessonKey: record.lessonKey, partNumber, partCount, elapsedMs, clipIds };
}

export function emptyLeaderboard(input: {
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now: Date;
  ready: boolean;
  board?: LeaderboardBoard;
}): LeaderboardPayload {
  const ends = weekEndsAt(input.now);
  return {
    ready: input.ready,
    scope: input.scope,
    range: input.range,
    board: input.board ?? "xp",
    weekEndsAt: ends,
    countdown: formatWeekCountdown(ends, input.now),
    className: null,
    classKey: null,
    classOptions: [],
    yourXp: 0,
    yourRank: null,
    yourWon: 0,
    yourTied: 0,
    yourLost: 0,
    viewerIsAdmin: false,
    blitzrundeAvailable: false,
    duelAvailable: false,
    rows: [],
  };
}

function comparePeople(left: BoardPerson, right: BoardPerson, board: LeaderboardBoard): number {
  if (left.xp !== right.xp) return right.xp - left.xp;
  if (board !== "xp" && (left.won ?? 0) !== (right.won ?? 0)) {
    return (right.won ?? 0) - (left.won ?? 0);
  }
  if (board === "blitzrunde") {
    if ((left.silver ?? 0) !== (right.silver ?? 0)) return (right.silver ?? 0) - (left.silver ?? 0);
    if ((left.bronze ?? 0) !== (right.bronze ?? 0)) return (right.bronze ?? 0) - (left.bronze ?? 0);
  }
  if (left.xp > 0) {
    const leftTime = left.reachedAt ? Date.parse(left.reachedAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.reachedAt ? Date.parse(right.reachedAt) : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
  }
  return left.name.localeCompare(right.name, "vi", { sensitivity: "base" });
}

export function assembleLeaderboard(input: {
  people: readonly BoardPerson[];
  viewerId: string;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now: Date;
  board?: LeaderboardBoard;
  /** Rank this class instead of the viewer's. Callers must already check permission. */
  classKey?: string | null;
  classLabel?: string | null;
  classOptions?: LeaderboardClassOption[];
}): LeaderboardPayload {
  const board = input.board ?? "xp";
  const base = emptyLeaderboard({ ...input, ready: true, board });
  const viewer = input.people.find((person) => person.userId === input.viewerId);
  const yourXp = viewer?.xp ?? 0;
  const viewerIsAdmin = viewer?.isAdmin ?? false;
  const requestedKey = input.scope === "class" && input.classKey ? input.classKey : "";
  const classKey = requestedKey || viewer?.classKey || "";
  const className = requestedKey
    ? (input.classLabel ?? null)
    : classKey
      ? (viewer?.className ?? null)
      : null;

  const contenders =
    input.scope === "class"
      ? input.people.filter(
          (person) =>
            !person.isAdmin &&
            !person.isTeacher &&
            classKey.length > 0 &&
            person.classKey === classKey,
        )
      : input.people.filter((person) => !person.isAdmin && !person.isTeacher && person.xp > 0);

  const ranked = [...contenders].sort((left, right) => comparePeople(left, right, board)).map((person, index) => ({
    person,
    rank: index + 1,
  }));

  const you = ranked.find((entry) => entry.person.userId === input.viewerId);
  let visible = input.scope === "global" ? ranked.slice(0, GLOBAL_LEADERBOARD_LIMIT) : ranked;
  let appended = false;
  if (you && !visible.some((entry) => entry.person.userId === input.viewerId)) {
    visible = [...visible, you];
    appended = true;
  }
  if (!you && !viewerIsAdmin && input.scope === "global") {
    visible = [
      ...visible,
      {
        person: {
          userId: input.viewerId,
          name: viewer?.name ?? "Học viên",
          classKey,
          className,
          isAdmin: false,
          xp: 0,
          reachedAt: null,
          image: viewer?.image ?? null,
        },
        rank: 0,
      },
    ];
    appended = visible.length > 1;
  }

  return {
    ...base,
    className: classKey.length > 0 ? className : null,
    classKey: classKey.length > 0 ? classKey : null,
    classOptions: input.classOptions ?? [],
    yourXp,
    yourRank: you ? you.rank : null,
    yourWon: viewer?.won ?? 0,
    yourTied: viewer?.tied ?? 0,
    yourLost: viewer?.lost ?? 0,
    board,
    viewerIsAdmin,
    rows: visible.map((entry, index) => ({
      rank: entry.rank > 0 ? entry.rank : null,
      name: entry.person.name,
      xp: entry.person.xp,
      isYou: entry.person.userId === input.viewerId,
      gapBefore: appended && index === visible.length - 1 && visible.length > 1,
      won: entry.person.won ?? 0,
      tied: entry.person.tied ?? 0,
      lost: entry.person.lost ?? 0,
      image: entry.person.image ?? null,
      ...(entry.person.silver != null ? { silver: entry.person.silver } : {}),
      ...(entry.person.bronze != null ? { bronze: entry.person.bronze } : {}),
      ...(entry.person.rounds != null ? { rounds: entry.person.rounds } : {}),
      ...(entry.person.former ? { former: true } : {}),
    })),
  };
}

export type ClassPodiumPlace = {
  userId: string;
  classKey: string;
  rank: number;
  xp: number;
};

/**
 * The top `size` of every class on the XP board, ranked as the class board
 * ranks them. Admins, learners without a class and learners without XP never
 * take a place.
 */
export function classPodiums(people: readonly BoardPerson[], size = 3): ClassPodiumPlace[] {
  const byClass = new Map<string, BoardPerson[]>();
  for (const person of people) {
    if (person.isAdmin || person.isTeacher || !person.classKey || person.xp <= 0) continue;
    const list = byClass.get(person.classKey) ?? [];
    list.push(person);
    byClass.set(person.classKey, list);
  }
  const places: ClassPodiumPlace[] = [];
  for (const [classKey, members] of byClass) {
    const ranked = [...members].sort((left, right) => comparePeople(left, right, "xp"));
    ranked.slice(0, size).forEach((person, index) => {
      places.push({ userId: person.userId, classKey, rank: index + 1, xp: person.xp });
    });
  }
  return places;
}

/** Learners who take part in the classes board: real classes, no admins or staff. */
export function classLearners(people: readonly BoardPerson[]): BoardPerson[] {
  return people.filter(
    (person) =>
      !person.isAdmin &&
      !person.isStaff &&
      !person.isTeacher &&
      person.classKey.length > 0 &&
      !person.classKey.startsWith(LIVING_BOARD_CLASS_PREFIX),
  );
}

export type ClassTotal = { classKey: string; name: string; xp: number; members: number; xpPerMember: number };

/** Classes with XP, best first: XP, then XP per learner, then name. */
function rankClassTotals(learners: readonly BoardPerson[]): ClassTotal[] {
  const labels = new Map(leaderboardClassOptions(learners).map((option) => [option.key, option.label]));
  const totals = new Map<string, { xp: number; members: number }>();
  for (const person of learners) {
    const total = totals.get(person.classKey) ?? { xp: 0, members: 0 };
    total.xp += Math.max(0, person.xp);
    total.members += 1;
    totals.set(person.classKey, total);
  }
  return [...totals]
    .filter(([, total]) => total.xp > 0)
    .map(([classKey, total]) => ({
      classKey,
      name: labels.get(classKey) ?? classKey,
      xp: total.xp,
      members: total.members,
      xpPerMember: Math.round(total.xp / total.members),
    }))
    .sort(
      (left, right) =>
        right.xp - left.xp ||
        right.xpPerMember - left.xpPerMember ||
        left.name.localeCompare(right.name, "vi", { sensitivity: "base" }),
    );
}

/**
 * Week XP per class, for the classes board. Only real classes compete:
 * workplace groups, learners without a class, admins and staff are left out.
 * A class shows once one of its learners has XP. Ties go to the higher XP per
 * learner, then the name.
 */
export function rankClasses(people: readonly BoardPerson[], viewerId: string): ClassBoardExtras {
  const learners = classLearners(people);
  const viewer = learners.find((person) => person.userId === viewerId);
  const rows = rankClassTotals(learners).map(({ classKey, ...entry }, index) => ({
    ...entry,
    rank: index + 1,
    isYours: viewer?.classKey === classKey,
  }));
  const yours = rows.find((row) => row.isYours);
  return {
    rows,
    yourClassRank: yours?.rank ?? null,
    yourClassXp: yours?.xp ?? 0,
    yourContribution: viewer ? Math.max(0, viewer.xp) : 0,
  };
}

/** Classes with XP this period, ranked as the classes board ranks them. */
export function classStandings(people: readonly BoardPerson[]): ClassTotal[] {
  return rankClassTotals(classLearners(people));
}

/** One class's place in a stored weekly class podium. */
export type StoredClassPlace = { classKey: string; rank: number; classXp: number };

/**
 * The banner on the classes board, from the stored podium of a finished week.
 * Stored rows are per learner, so each class is kept once. Labels come from
 * the classes learners are in today, and so do the students listed; a class
 * nobody is in any more shows its key and no students.
 */
export function classChampions(
  week: string,
  places: readonly StoredClassPlace[],
  labels: ReadonlyMap<string, string>,
  viewerClassKey: string | null,
  learners: readonly BoardPerson[] = [],
  viewerId: string | null = null,
): ClassChampions {
  const byClass = new Map<string, StoredClassPlace>();
  for (const place of places) if (!byClass.has(place.classKey)) byClass.set(place.classKey, place);
  const rosters = new Map<string, { name: string; isYou: boolean }[]>();
  for (const person of learners) {
    const roster = rosters.get(person.classKey) ?? [];
    roster.push({ name: person.name, isYou: person.userId === viewerId });
    rosters.set(person.classKey, roster);
  }
  for (const roster of rosters.values()) roster.sort((left, right) => left.name.localeCompare(right.name, "vi"));
  return {
    week,
    places: [...byClass.values()]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 3)
      .map((place) => ({
        rank: place.rank,
        name: labels.get(place.classKey) ?? place.classKey,
        xp: place.classXp,
        isYours: viewerClassKey != null && viewerClassKey === place.classKey,
        students: rosters.get(place.classKey) ?? [],
      })),
  };
}

export type ClassBoardPodiumPlace = {
  userId: string;
  classKey: string;
  rank: number;
  /** The class's week XP. */
  classXp: number;
};

/**
 * One place per learner in the top `size` classes of the classes board. Only
 * learners who earned XP that week share the place, so nobody gets a class
 * badge for a week they sat out.
 */
export function classBoardPodiums(people: readonly BoardPerson[], size = 3): ClassBoardPodiumPlace[] {
  const learners = classLearners(people);
  return rankClassTotals(learners)
    .slice(0, size)
    .flatMap((entry, index) =>
      learners
        .filter((person) => person.classKey === entry.classKey && person.xp > 0)
        .map((person) => ({ userId: person.userId, classKey: entry.classKey, rank: index + 1, classXp: entry.xp })),
    );
}

const HOME_RANK_PREVIEW = 3;

/** Short home-screen slice: top of the board, or the window around you when you sit lower. */
export function previewLeaderboardRows(rows: readonly LeaderboardRow[]): LeaderboardRow[] {
  const clean = rows.map((row) => ({ ...row, gapBefore: false }));
  if (clean.length <= HOME_RANK_PREVIEW) return clean;
  const youIndex = clean.findIndex((row) => row.isYou);
  if (youIndex < HOME_RANK_PREVIEW) return clean.slice(0, HOME_RANK_PREVIEW);
  const start = Math.min(youIndex - 1, clean.length - HOME_RANK_PREVIEW);
  return clean.slice(start, start + HOME_RANK_PREVIEW).map((row, index) => ({
    ...row,
    gapBefore: index === 0 && start > 0,
  }));
}
