/**
 * Asynchronous classmate duels. Both players get the same 15 studied clips.
 * The server owns the clock. A shorter time wins the clip. No time loses it.
 */

/** Matches `MIN_MS_PER_CLIP` in xp.ts. A finish under this is rejected. */
const MIN_CLIP_MS = 2000;

export const DUEL_SIZE = 15;
export const MAX_OPEN_WITH_CLASSMATE = 3;
export const DUEL_WIN_XP = 50;
export const DUEL_LOSS_XP = 20;
export const DUEL_TIE_XP = 35;
export const MAX_ANSWER_CHARS = 400;

export const DUEL_SCHEMA_HINT =
  "Chạy supabase/studied_clips.sql và supabase/duels.sql một lần trong Supabase.";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DuelOutcome = "win" | "loss" | "tie";
export type MatchBlock = "ok" | "no_class" | "no_overlap" | "cap" | "admin" | "unavailable";
export type PlayState = "active" | "done" | "forfeited";
export type HomeBucket = "incoming" | "playing" | "waiting" | "history";

export type StudiedClip = {
  lessonKey: string;
  clipId: string;
};

export type CatalogClip = {
  lessonKey: string;
  chapterSlug: string;
  clipId: string;
  script?: string;
  audioPath?: string;
};

export type OpponentCandidate = {
  userId: string;
  shared: number;
  openDuels: number;
};

export type ClipPlay = {
  position: number;
  state: PlayState;
  elapsedMs: number | null;
};

export type DuelClipView = {
  position: number;
  script: string | null;
  audioPath: string | null;
  you: { state: PlayState | "pending"; elapsedMs: number | null };
  opponent: { state: PlayState | "pending" | "hidden"; elapsedMs: number | null };
  winner: "you" | "opponent" | "neither" | "pending";
};

export type DuelView = {
  id: string;
  opponentName: string;
  complete: boolean;
  yourOutcome: DuelOutcome | null;
  yourXp: number | null;
  opponentXp: number | null;
  yourPoints: number;
  opponentPoints: number;
  nextPosition: number | null;
  startedAt: string | null;
  clips: DuelClipView[];
};

export type DuelFeedback = {
  accuracy: number;
  accepted: boolean;
  tooFast: boolean;
  words: { word: string; status: string; typed?: string }[];
};

export type DuelCard = {
  id: string;
  opponentName: string;
  createdAt: string;
  challenged: boolean;
  youSettled: number;
  opponentStarted: boolean;
  yourOutcome: DuelOutcome | null;
  yourXp: number | null;
  yourPoints: number | null;
  opponentPoints: number | null;
};

export type DuelHome = {
  ready: boolean;
  block: MatchBlock;
  studiedCount: number;
  viewerIsAdmin: boolean;
  incoming: DuelCard[];
  playing: DuelCard[];
  waiting: DuelCard[];
  history: DuelCard[];
};

export function isDuelId(value: string): boolean {
  return UUID.test(value);
}

export function isDuelSchemaMissing(message: string): boolean {
  return (
    /studied_clips|duel_xp_awards|duel_plays|duel_clips|duels/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export function studiedKey(lessonKey: string, clipId: string): string {
  return `${lessonKey}\0${clipId}`;
}

export function isTooFast(elapsedMs: number): boolean {
  return elapsedMs < MIN_CLIP_MS;
}

export function elapsedMsBetween(startedAtIso: string, now: Date): number | null {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, now.getTime() - started);
}

/** Completed listening clips that still exist in exactly one catalog lesson. */
export function extractStudiedClips(
  learn: Record<string, { completedClipIds?: readonly string[] } | null | undefined>,
  catalog: readonly CatalogClip[],
): StudiedClip[] {
  const byLesson = new Map<string, Set<string>>();
  const byChapter = new Map<string, CatalogClip[]>();
  for (const clip of catalog) {
    const lesson = byLesson.get(clip.lessonKey) ?? new Set<string>();
    lesson.add(clip.clipId);
    byLesson.set(clip.lessonKey, lesson);
    const list = byChapter.get(clip.chapterSlug) ?? [];
    list.push(clip);
    byChapter.set(clip.chapterSlug, list);
  }

  const found = new Map<string, StudiedClip>();
  for (const [key, entry] of Object.entries(learn)) {
    const ids = entry?.completedClipIds ?? [];
    for (const clipId of ids) {
      if (typeof clipId !== "string" || clipId.length === 0) continue;
      if (key.includes("/")) {
        if (!byLesson.get(key)?.has(clipId)) continue;
        found.set(studiedKey(key, clipId), { lessonKey: key, clipId });
        continue;
      }
      const matches = (byChapter.get(key) ?? []).filter((clip) => clip.clipId === clipId);
      if (matches.length !== 1) continue;
      const match = matches[0]!;
      found.set(studiedKey(match.lessonKey, match.clipId), {
        lessonKey: match.lessonKey,
        clipId: match.clipId,
      });
    }
  }
  return [...found.values()];
}

export function sharedStudied(
  left: readonly StudiedClip[],
  right: readonly StudiedClip[],
): StudiedClip[] {
  const rightKeys = new Set(right.map((clip) => studiedKey(clip.lessonKey, clip.clipId)));
  const seen = new Set<string>();
  const shared: StudiedClip[] = [];
  for (const clip of left) {
    const key = studiedKey(clip.lessonKey, clip.clipId);
    if (!rightKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    shared.push({ lessonKey: clip.lessonKey, clipId: clip.clipId });
  }
  return shared;
}

/** `random` returns a number in [0, 1). */
export function sampleItems<T>(items: readonly T[], count: number, random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const roll = random();
    const slot = Math.min(index, Math.max(0, Math.floor(roll * (index + 1))));
    const current = copy[index]!;
    copy[index] = copy[slot]!;
    copy[slot] = current;
  }
  const take = Math.max(0, Math.min(count, copy.length));
  return copy.slice(0, take);
}

export function matchPool(input: {
  hasClass: boolean;
  candidates: readonly OpponentCandidate[];
}): { block: MatchBlock; pool: string[] } {
  if (!input.hasClass) return { block: "no_class", pool: [] };
  const overlapped = input.candidates.filter((candidate) => candidate.shared >= DUEL_SIZE);
  if (overlapped.length === 0) return { block: "no_overlap", pool: [] };
  const pool = overlapped.filter((candidate) => candidate.openDuels < MAX_OPEN_WITH_CLASSMATE);
  if (pool.length === 0) return { block: "cap", pool: [] };
  return { block: "ok", pool: pool.map((candidate) => candidate.userId) };
}

export function clipWinner(
  leftMs: number | null,
  rightMs: number | null,
): "left" | "right" | "neither" {
  if (leftMs == null && rightMs == null) return "neither";
  if (leftMs == null) return "right";
  if (rightMs == null) return "left";
  if (leftMs < rightMs) return "left";
  if (rightMs < leftMs) return "right";
  return "neither";
}

export function isSettledState(state: string | undefined): boolean {
  return state === "done" || state === "forfeited";
}

export function pointsFromPlays(
  left: readonly ClipPlay[],
  right: readonly ClipPlay[],
  clipCount = DUEL_SIZE,
): { left: number; right: number; bothDone: boolean } {
  const rightByPosition = new Map(right.map((play) => [play.position, play]));
  let leftPoints = 0;
  let rightPoints = 0;
  let settled = 0;
  for (const play of left) {
    if (!isSettledState(play.state)) continue;
    const other = rightByPosition.get(play.position);
    if (!other || !isSettledState(other.state)) continue;
    settled += 1;
    const winner = clipWinner(
      play.state === "done" ? play.elapsedMs : null,
      other.state === "done" ? other.elapsedMs : null,
    );
    if (winner === "left") leftPoints += 1;
    if (winner === "right") rightPoints += 1;
  }
  return { left: leftPoints, right: rightPoints, bothDone: settled >= clipCount };
}

export function awardForPoints(
  leftPoints: number,
  rightPoints: number,
): {
  leftXp: number;
  rightXp: number;
  leftOutcome: DuelOutcome;
  rightOutcome: DuelOutcome;
} {
  if (leftPoints > rightPoints) {
    return {
      leftXp: DUEL_WIN_XP,
      rightXp: DUEL_LOSS_XP,
      leftOutcome: "win",
      rightOutcome: "loss",
    };
  }
  if (rightPoints > leftPoints) {
    return {
      leftXp: DUEL_LOSS_XP,
      rightXp: DUEL_WIN_XP,
      leftOutcome: "loss",
      rightOutcome: "win",
    };
  }
  return {
    leftXp: DUEL_TIE_XP,
    rightXp: DUEL_TIE_XP,
    leftOutcome: "tie",
    rightOutcome: "tie",
  };
}

export function homeBucket(input: {
  youStarted: boolean;
  youSettled: number;
  opponentSettled: number;
  clipCount?: number;
}): HomeBucket {
  const clipCount = input.clipCount ?? DUEL_SIZE;
  const youDone = input.youSettled >= clipCount;
  const themDone = input.opponentSettled >= clipCount;
  if (youDone && themDone) return "history";
  if (!input.youStarted) return "incoming";
  if (!youDone) return "playing";
  return "waiting";
}

export function formatDuelTime(ms: number | null): string {
  if (ms == null) return "Bỏ";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1).replace(".", ",")}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function emptyDuelHome(ready: boolean, block: MatchBlock = "unavailable"): DuelHome {
  return {
    ready,
    block,
    studiedCount: 0,
    viewerIsAdmin: false,
    incoming: [],
    playing: [],
    waiting: [],
    history: [],
  };
}
