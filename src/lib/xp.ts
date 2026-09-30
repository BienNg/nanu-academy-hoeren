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

export type LeaderboardScope = "class" | "global";
export type LeaderboardRange = "week" | "all";
/** "blitzrunde" reuses the xp slot for Blitzrunde points (not XP) and `won` for rounds won. */
export type LeaderboardBoard = "xp" | "duel" | "blitzrunde";

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
  yourXp: number;
  yourRank: number | null;
  yourWon: number;
  yourTied: number;
  yourLost: number;
  board: LeaderboardBoard;
  viewerIsAdmin: boolean;
  rows: LeaderboardRow[];
  /** Only on the Blitzrunde board. */
  blitzrunde?: BlitzrundeBoardExtras;
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
  /** Full study passes of this lesson already finished, not counting this part. */
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
    yourXp: 0,
    yourRank: null,
    yourWon: 0,
    yourTied: 0,
    yourLost: 0,
    viewerIsAdmin: false,
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
}): LeaderboardPayload {
  const board = input.board ?? "xp";
  const base = emptyLeaderboard({ ...input, ready: true, board });
  const viewer = input.people.find((person) => person.userId === input.viewerId);
  const yourXp = viewer?.xp ?? 0;
  const viewerIsAdmin = viewer?.isAdmin ?? false;
  const className = viewer?.className ?? null;
  const classKey = viewer?.classKey ?? "";

  const contenders =
    input.scope === "class"
      ? input.people.filter(
          (person) => !person.isAdmin && classKey.length > 0 && person.classKey === classKey,
        )
      : input.people.filter((person) => !person.isAdmin && person.xp > 0);

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
