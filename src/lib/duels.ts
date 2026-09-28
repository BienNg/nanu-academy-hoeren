/**
 * Asynchronous classmate duels. Both players get the same 15 studied clips.
 * Each clip is either dictation or sentence order, and it appears once.
 * The browser scores and times a clip, then saves it in the background.
 * The server checks the answer and keeps the first result. A shorter time
 * wins the clip. No time loses it.
 */

import type { CardKind } from "./card-kinds";

export const DUEL_SIZE = 15;
export const MAX_OPEN_WITH_CLASSMATE = 3;
export const DUEL_WIN_XP = 50;
export const DUEL_LOSS_XP = 20;
export const DUEL_TIE_XP = 35;
/** Days the challenged person has once the challenger has finished every clip. */
export const DUEL_DEADLINE_DAYS = 3;
export const DUEL_DEADLINE_MS = DUEL_DEADLINE_DAYS * 24 * 60 * 60 * 1000;
/** Flat payout when the challenged person misses the deadline. */
export const DUEL_EXPIRE_CHALLENGER_XP = 35;
export const DUEL_EXPIRE_OPPONENT_XP = 0;
export const MAX_ANSWER_CHARS = 400;

export const DUEL_SCHEMA_HINT =
  "Chạy supabase/studied_clips.sql và supabase/duels.sql một lần trong Supabase.";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DuelOutcome = "win" | "loss" | "tie";
export type MatchBlock = "ok" | "no_class" | "no_overlap" | "cap" | "admin" | "unavailable";
export type PlayState = "active" | "done" | "forfeited";
export type DuelCardKind = CardKind;
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
  translationVi?: string;
  /** True when this clip can be a sentence-order card. */
  sentenceOrder?: boolean;
  /** True when this clip has enough same-word-count distractors for a multiple-choice card. */
  multipleChoice?: boolean;
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
  kind: DuelCardKind;
  script: string | null;
  audioPath: string | null;
  translationVi: string | null;
  /** The 4 answer options, fixed at duel-creation time. Only for multiple-choice cards. */
  options: { id: string; text: string; correct: boolean }[] | null;
  you: { state: PlayState | "pending"; elapsedMs: number | null };
  opponent: { state: PlayState | "pending" | "hidden"; elapsedMs: number | null };
  winner: "you" | "opponent" | "neither" | "pending";
};

/**
 * One card per clip. An eligible clip is sentence order; failing that,
 * multiple choice if it has enough distractors; every other clip stays
 * dictation. A repeated clip is dropped so it cannot appear twice.
 */
export function duelCardsFromClips<
  T extends {
    lessonKey: string;
    clipId: string;
    sentenceOrder?: boolean;
    multipleChoice?: boolean;
  },
>(clips: readonly T[]): { clip: T; kind: DuelCardKind }[] {
  const seen = new Set<string>();
  const cards: { clip: T; kind: DuelCardKind }[] = [];
  for (const clip of clips) {
    const key = studiedKey(clip.lessonKey, clip.clipId);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind: DuelCardKind = clip.sentenceOrder
      ? "order"
      : clip.multipleChoice
        ? "multiple-choice"
        : "listening";
    cards.push({ clip, kind });
  }
  return cards;
}

export function clipCanStart(clip: {
  kind?: DuelCardKind;
  script: string | null;
  audioPath: string | null;
  translationVi?: string | null;
} | null | undefined): boolean {
  if (!clip?.script) return false;
  if (clip.kind === "order" || clip.kind === "multiple-choice") {
    return Boolean(clip.translationVi?.trim());
  }
  return Boolean(clip.audioPath);
}

export type DuelView = {
  id: string;
  yourName: string;
  opponentName: string;
  complete: boolean;
  yourOutcome: DuelOutcome | null;
  yourXp: number | null;
  opponentXp: number | null;
  yourPoints: number;
  opponentPoints: number;
  nextPosition: number | null;
  startedAt: string | null;
  /** When both sides finished, or the deadline closed the duel. */
  completedAt: string | null;
  /** Set when the challenged person missed the deadline. XP is flat, not scored from clips. */
  expired: boolean;
  /** When the challenged person's 3 days run out. Null before the challenge is released. */
  expiresAt: string | null;
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
  yourName: string;
  opponentName: string;
  createdAt: string;
  challenged: boolean;
  youSettled: number;
  opponentStarted: boolean;
  yourOutcome: DuelOutcome | null;
  yourXp: number | null;
  yourPoints: number | null;
  opponentPoints: number | null;
  expired: boolean;
  /** When the challenged person's 3 days run out. Null before release or after the duel closes. */
  expiresAt: string | null;
};

export type DuelHome = {
  ready: boolean;
  block: MatchBlock;
  studiedCount: number;
  /** Study session to open when the learner has not studied enough clips yet. */
  studyHref: `/learn/${string}/${string}/study` | null;
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

export function elapsedMsBetween(startedAtIso: string, now: Date): number | null {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, now.getTime() - started);
}

type LearnClipProgress = {
  completedClipIds?: readonly string[];
  reviewedClipIds?: readonly string[];
  studyRunCount?: number;
  studyCompletedAt?: string;
};

function studyPassFinished(entry: LearnClipProgress | null | undefined): boolean {
  if (!entry) return false;
  if (typeof entry.studyCompletedAt === "string" && entry.studyCompletedAt.length > 0) return true;
  return typeof entry.studyRunCount === "number" && entry.studyRunCount > 0;
}

function rememberClip(found: Map<string, StudiedClip>, lessonKey: string, clipId: string): void {
  found.set(studiedKey(lessonKey, clipId), { lessonKey, clipId });
}

/**
 * Clips a learner can be quizzed on. A listening completion, a study card
 * they have reviewed, or a finished study pass all count. A chapter slug
 * that exists in more than one lesson is skipped unless the saved key
 * already names the lesson.
 */
export function extractStudiedClips(
  learn: Record<string, LearnClipProgress | null | undefined>,
  catalog: readonly CatalogClip[],
): StudiedClip[] {
  const byLesson = new Map<string, Set<string>>();
  const byChapter = new Map<string, CatalogClip[]>();
  const lessonsByChapter = new Map<string, Set<string>>();
  for (const clip of catalog) {
    const lesson = byLesson.get(clip.lessonKey) ?? new Set<string>();
    lesson.add(clip.clipId);
    byLesson.set(clip.lessonKey, lesson);
    const list = byChapter.get(clip.chapterSlug) ?? [];
    list.push(clip);
    byChapter.set(clip.chapterSlug, list);
    const lessons = lessonsByChapter.get(clip.chapterSlug) ?? new Set<string>();
    lessons.add(clip.lessonKey);
    lessonsByChapter.set(clip.chapterSlug, lessons);
  }

  const found = new Map<string, StudiedClip>();
  const addNamed = (key: string, clipId: string) => {
    if (clipId.length === 0) return;
    if (key.includes("/")) {
      if (!byLesson.get(key)?.has(clipId)) return;
      rememberClip(found, key, clipId);
      return;
    }
    const matches = (byChapter.get(key) ?? []).filter((clip) => clip.clipId === clipId);
    if (matches.length !== 1) return;
    const match = matches[0]!;
    rememberClip(found, match.lessonKey, match.clipId);
  };

  for (const [key, entry] of Object.entries(learn)) {
    for (const clipId of [...(entry?.completedClipIds ?? []), ...(entry?.reviewedClipIds ?? [])]) {
      if (typeof clipId !== "string") continue;
      addNamed(key, clipId);
    }
    if (!studyPassFinished(entry)) continue;
    if (key.includes("/")) {
      for (const clipId of byLesson.get(key) ?? []) rememberClip(found, key, clipId);
      continue;
    }
    const lessons = lessonsByChapter.get(key);
    if (!lessons || lessons.size !== 1) continue;
    const lessonKey = [...lessons][0]!;
    for (const clipId of byLesson.get(lessonKey) ?? []) rememberClip(found, lessonKey, clipId);
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

export type LocalClipResult = { state: "done"; elapsedMs: number } | { state: "forfeited" };

function recountView(view: DuelView, clips: readonly DuelClipView[]): DuelView {
  let yourPoints = 0;
  let opponentPoints = 0;
  const scored = clips.map((clip) => {
    const youSettled = isSettledState(clip.you.state);
    const themSettled = isSettledState(clip.opponent.state);
    let winner: DuelClipView["winner"] = "pending";
    if (youSettled && themSettled) {
      const side = clipWinner(
        clip.you.state === "done" ? clip.you.elapsedMs : null,
        clip.opponent.state === "done" ? clip.opponent.elapsedMs : null,
      );
      if (side === "left") {
        winner = "you";
        yourPoints += 1;
      } else if (side === "right") {
        winner = "opponent";
        opponentPoints += 1;
      } else {
        winner = "neither";
      }
    }
    return { ...clip, winner };
  });
  const pending = scored.find((clip) => clip.you.state === "pending" || clip.you.state === "active");
  const bothDone = scored.length >= DUEL_SIZE && scored.every((clip) => clip.winner !== "pending");
  const award = bothDone && !view.expired ? awardForPoints(yourPoints, opponentPoints) : null;
  return {
    ...view,
    clips: scored,
    yourPoints,
    opponentPoints,
    nextPosition: pending?.position ?? null,
    complete: view.complete || bothDone,
    yourOutcome: view.expired ? view.yourOutcome : (award?.leftOutcome ?? (bothDone ? view.yourOutcome : null)),
    yourXp: view.expired ? view.yourXp : (award?.leftXp ?? (bothDone ? view.yourXp : null)),
    opponentXp: view.expired ? view.opponentXp : (award?.rightXp ?? (bothDone ? view.opponentXp : null)),
  };
}

/** Apply one local clip result without waiting for the server. */
export function withClipSettled(view: DuelView, position: number, result: LocalClipResult): DuelView {
  const clips = view.clips.map((clip) => {
    if (clip.position !== position || isSettledState(clip.you.state)) return clip;
    return {
      ...clip,
      you:
        result.state === "done"
          ? { state: "done" as const, elapsedMs: result.elapsedMs }
          : { state: "forfeited" as const, elapsedMs: null },
    };
  });
  return recountView(view, clips);
}

/**
 * Keep a local result that has not been saved yet. A saved server result wins.
 */
export function mergeDuelView(local: DuelView, server: DuelView): DuelView {
  if (server.expired) return server;
  const clips = server.clips.map((remote) => {
    const mine = local.clips.find((clip) => clip.position === remote.position);
    if (!mine) return remote;
    const keepLocalYou = isSettledState(mine.you.state) && !isSettledState(remote.you.state);
    return {
      ...remote,
      you: keepLocalYou ? mine.you : remote.you,
      kind: remote.kind ?? mine.kind,
      script: remote.script ?? mine.script,
      audioPath: remote.audioPath ?? mine.audioPath,
      translationVi: remote.translationVi ?? mine.translationVi,
    };
  });
  return recountView({ ...server, complete: server.complete }, clips);
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
  finished?: boolean;
  youStarted: boolean;
  youSettled: number;
  opponentSettled: number;
  clipCount?: number;
}): HomeBucket {
  if (input.finished) return "history";
  const clipCount = input.clipCount ?? DUEL_SIZE;
  const youDone = input.youSettled >= clipCount;
  const themDone = input.opponentSettled >= clipCount;
  if (youDone && themDone) return "history";
  if (!input.youStarted) return "incoming";
  if (!youDone) return "playing";
  return "waiting";
}

/**
 * When the challenger finished every clip. The challenged person's 3 days
 * start then, because that is when they can first play.
 */
export function challengeReleasedAt(
  plays: readonly { state: string; finishedAt: string | null }[],
  clipCount = DUEL_SIZE,
): string | null {
  const settled = plays.filter((play) => isSettledState(play.state));
  if (settled.length < clipCount) return null;
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestIso: string | null = null;
  for (const play of settled) {
    if (!play.finishedAt) continue;
    const at = Date.parse(play.finishedAt);
    if (!Number.isFinite(at) || at < latestMs) continue;
    latestMs = at;
    latestIso = new Date(at).toISOString();
  }
  return latestIso;
}

export function challengeExpiresAt(releasedAt: string | null): string | null {
  if (!releasedAt) return null;
  const released = Date.parse(releasedAt);
  if (!Number.isFinite(released)) return null;
  return new Date(released + DUEL_DEADLINE_MS).toISOString();
}

export function isChallengeExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return false;
  return now.getTime() >= deadline;
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Calendar age in Vietnam, such as "Hôm qua", "4 ngày trước", or "2 tuần trước". */
export function completedAgoLabel(iso: string, now = new Date()): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const dayIndex = (ms: number) => Math.floor((ms + VIETNAM_OFFSET_MS) / 86_400_000);
  const days = dayIndex(now.getTime()) - dayIndex(at);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 tuần trước" : `${weeks} tuần trước`;
}

/** Remaining time, such as "Còn 2 ngày" or "Đối thủ còn 4 giờ". Null once the deadline has passed. */
export function challengeLeftLabel(
  expiresAt: string | null,
  now: Date,
  subject: "you" | "opponent",
): string | null {
  if (!expiresAt || isChallengeExpired(expiresAt, now)) return null;
  const left = Date.parse(expiresAt) - now.getTime();
  const prefix = subject === "opponent" ? "Đối thủ còn" : "Còn";
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (left >= day) return `${prefix} ${Math.ceil(left / day)} ngày`;
  if (left >= hour) return `${prefix} ${Math.ceil(left / hour)} giờ`;
  return `${prefix} ${Math.max(1, Math.ceil(left / minute))} phút`;
}

/** The opponent sees a duel only after the person who started it finishes all clips. */
export function opponentCanSeeDuel(viewerIsOpponent: boolean, challengerSettled: number, clipCount = DUEL_SIZE): boolean {
  if (!viewerIsOpponent) return true;
  return challengerSettled >= clipCount;
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
    studyHref: null,
    viewerIsAdmin: false,
    incoming: [],
    playing: [],
    waiting: [],
    history: [],
  };
}
