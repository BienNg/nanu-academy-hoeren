/**
 * Ranked XP for a finished listening part.
 * The browser never sends a point total. The server scores the run.
 *
 * A part pays a flat amount. More clips do not add points. Longer sentences
 * and a higher CEFR band do. The first pass of a part is full XP. The first
 * pass on a later day is review XP (40%), and review stops at 30 per day.
 * Another pass of the same part on the same day pays nothing.
 */

export const REVIEW_DAILY_CAP = 30;
export const MIN_MS_PER_CLIP = 2000;
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
  /** Google profile photo, or null when this person has none. */
  image?: string | null;
};

export type LeaderboardScope = "class" | "global";
export type LeaderboardRange = "week" | "all";
export type LeaderboardBoard = "xp" | "duel";

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

export function isXpSchemaMissing(message: string): boolean {
  return (
    /xp_awards/i.test(message) &&
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

function bandBase(levelSlug: string): number {
  if (levelSlug.startsWith("a1")) return 20;
  if (levelSlug.startsWith("a2")) return 26;
  if (levelSlug.startsWith("b1")) return 34;
  if (levelSlug.startsWith("b2")) return 44;
  return 20;
}

function scriptWords(script: string): number {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

function applyWordFactor(raw: number, averageWords: number): number {
  if (averageWords < 3) return raw;
  if (averageWords < 7) return Math.round((raw * 115) / 100);
  return Math.round((raw * 130) / 100);
}

function rawPartXp(
  levelSlug: string,
  clips: readonly { script: string; missed: boolean }[],
): number {
  if (clips.length === 0) return 0;
  const firstTry = clips.filter((clip) => !clip.missed).length;
  const accuracyBonus = Math.round((10 * firstTry) / clips.length);
  const words = clips.reduce((sum, clip) => sum + scriptWords(clip.script), 0);
  return applyWordFactor(bandBase(levelSlug) + accuracyBonus, words / clips.length);
}

function reviewAmount(raw: number, reviewXpToday: number): number {
  const uncapped = Math.round((raw * 40) / 100);
  const room = Math.max(0, REVIEW_DAILY_CAP - Math.max(0, reviewXpToday));
  return Math.min(uncapped, room);
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
  levelSlug: string;
  outcome: "success" | "fail";
  elapsedMs: number;
  /** How many clips this part number must contain. Null when the part is not real. */
  expectedCount: number | null;
  results: readonly XpClipResult[];
  lessonClips: readonly LessonClip[];
  priorDayKeys: readonly string[];
  reviewXpToday: number;
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

  const scored: { script: string; missed: boolean }[] = [];
  const seen = new Set<string>();
  for (const result of input.results) {
    if (seen.has(result.clipId) || !result.passed) return rejected(now);
    seen.add(result.clipId);
    const clip = byId.get(result.clipId);
    if (!clip) return rejected(now);
    scored.push({ script: clip.script, missed: result.missed });
  }

  if (input.elapsedMs < expected * MIN_MS_PER_CLIP) return rejected(now);

  const today = keys.dayKey;
  if (input.priorDayKeys.includes(today)) {
    return { xp: 0, kind: "repeat", store: false, ...keys };
  }

  const raw = rawPartXp(input.levelSlug, scored);
  if (input.priorDayKeys.length === 0) {
    return { xp: raw, kind: "new", store: true, ...keys };
  }
  return {
    xp: reviewAmount(raw, input.reviewXpToday),
    kind: "review",
    store: true,
    ...keys,
  };
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
  if (board === "duel" && (left.won ?? 0) !== (right.won ?? 0)) {
    return (right.won ?? 0) - (left.won ?? 0);
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
    })),
  };
}
