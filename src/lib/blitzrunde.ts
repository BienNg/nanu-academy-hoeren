/**
 * Blitzrunde: a live, class-wide quiz at the end of a lesson.
 *
 * The server builds one deck per round from a stored seed, so every student
 * gets the same cards in the same order. Each browser races through that deck
 * for 7 minutes, scores itself, and sends one result bundle. The server stores
 * what the browser reports (it does not re-check answers) and only validates
 * that the numbers are in range. Points never count toward XP.
 *
 * Relative imports only, so the node tests can compile this file.
 */

import { buildWordBank, isSentenceOrderEligible, type WordChip } from "./sentence-order";
import { buildMcOptions, type McOption } from "./multiple-choice";
import { buildPairingSet, PAIRING_SET_SIZE } from "./pairing";

/** Material Symbol for Blitzrunde. `bolt` stays reserved for XP. */
export const BLITZRUNDE_ICON = "speed";

export const BLITZRUNDE_DURATION_MS = 7 * 60 * 1000;
export const HEARTBEAT_MS = 15_000;
/** Three missed heartbeats and a student counts as disconnected. */
export const STALE_MS = 45_000;
/** After the teacher ends a round, phones still have this long to upload a result. */
export const LATE_SUBMIT_MS = 2 * 60 * 1000;
export const MIN_RANKED = 2;
/** Below this many cards the round is short; the admin picker warns. */
export const THIN_DECK_WARNING = 10;

export const BASE_POINTS = 1000;
export const SPEED_WINDOW_MS = 20_000;
export const SPEED_FLOOR = 0.3;
export const STREAK_STEP = 0.1;
export const STREAK_CAP = 5;
export const MAX_QUESTION_POINTS = Math.round(BASE_POINTS * (1 + STREAK_CAP * STREAK_STEP));

export const BLITZRUNDE_SCHEMA_HINT =
  "Run supabase/blitzrunde.sql once in the Supabase SQL editor.";

export function isBlitzrundeSchemaMissing(message: string): boolean {
  return (
    /blitzrunde_/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export type BlitzrundeKind = "order" | "multiple-choice" | "pairing";
export type BlitzrundeStatus = "lobby" | "active" | "ended" | "cancelled";
export type BlitzrundeEndReason = "time_up" | "teacher_ended";
export type BlitzrundeFinishReason = "deck_done" | "time_up" | "teacher_ended";
export type ParticipantStatus = "waiting" | "playing" | "finished" | "disconnected" | "no_result";

export type PairingItem = { id: string; vi: string; de: string };

export type BlitzrundeCard =
  | {
      position: number;
      kind: "order";
      clipId: string;
      translationVi: string;
      script: string;
      bank: WordChip[];
    }
  | {
      position: number;
      kind: "multiple-choice";
      clipId: string;
      prompt: string;
      options: McOption[];
    }
  | {
      position: number;
      kind: "pairing";
      clipIds: string[];
      items: PairingItem[];
    };

export type BlitzrundeSourceClip = {
  id: string;
  script: string;
  translationVi?: string;
  sentenceOrder?: boolean;
};

/** Deterministic PRNG (mulberry32) seeded from a string, so a stored seed rebuilds the same deck. */
export function seedToRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

type UnplacedCard =
  | Omit<Extract<BlitzrundeCard, { kind: "order" }>, "position">
  | Omit<Extract<BlitzrundeCard, { kind: "multiple-choice" }>, "position">
  | Omit<Extract<BlitzrundeCard, { kind: "pairing" }>, "position">;

/**
 * Every eligible card of one Lektion, never listening (no audio in class).
 * Pairing sets come first so each short clip is paired at most once; a set
 * may borrow from the rest of the level, but only while most of it (3 of 5)
 * is from this Lektion — otherwise the deck would drift into other lessons.
 * Then one sentence-order card per eligible clip and one multiple-choice
 * card per clip with enough same-length distractors. One seeded shuffle.
 */
export function buildBlitzrundeDeck(input: {
  lektionClips: readonly BlitzrundeSourceClip[];
  levelClips: readonly BlitzrundeSourceClip[];
  seed: string;
}): BlitzrundeCard[] {
  const random = seedToRandom(input.seed);
  const lektionIds = new Set(input.lektionClips.map((clip) => clip.id));
  const cards: UnplacedCard[] = [];

  const usedForPairing = new Set<string>();
  for (;;) {
    const set = buildPairingSet(input.lektionClips, input.levelClips, usedForPairing, random);
    if (!set) break;
    const fromLektion = set.filter((clip) => lektionIds.has(clip.id)).length;
    if (fromLektion < Math.ceil(PAIRING_SET_SIZE / 2)) break;
    for (const clip of set) usedForPairing.add(clip.id);
    cards.push({
      kind: "pairing",
      clipIds: set.map((clip) => clip.id),
      items: set.map((clip) => ({ id: clip.id, vi: clip.translationVi ?? "", de: clip.script })),
    });
  }

  for (const clip of input.lektionClips) {
    const eligible = clip.sentenceOrder ?? isSentenceOrderEligible(clip);
    if (!eligible || !clip.translationVi) continue;
    cards.push({
      kind: "order",
      clipId: clip.id,
      translationVi: clip.translationVi,
      script: clip.script,
      bank: buildWordBank(clip, input.lektionClips, random),
    });
  }

  for (const clip of input.lektionClips) {
    const translationVi = clip.translationVi;
    if (!translationVi || !translationVi.trim()) continue;
    const options = buildMcOptions(
      { id: clip.id, translationVi },
      input.lektionClips,
      input.levelClips,
      random,
    );
    if (!options) continue;
    cards.push({ kind: "multiple-choice", clipId: clip.id, prompt: clip.script, options });
  }

  return shuffle(cards, random).map((card, position) => ({ ...card, position }) as BlitzrundeCard);
}

export function deckKindCounts(deck: readonly { kind: BlitzrundeKind }[]): Record<BlitzrundeKind, number> {
  const counts: Record<BlitzrundeKind, number> = { order: 0, "multiple-choice": 0, pairing: 0 };
  for (const card of deck) counts[card.kind] += 1;
  return counts;
}

/** Pairing always ends solved; each wrong pair on the way costs one of the five. */
export function pairingAccuracy(mistakes: number, total: number = PAIRING_SET_SIZE): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, total - Math.max(0, mistakes)) / total) * 100);
}

/** 1.0 for an instant answer, falling linearly to 0.3 at 20 s and staying there. */
export function speedFactor(timeMs: number): number {
  const clamped = Math.min(Math.max(timeMs, 0), SPEED_WINDOW_MS);
  return SPEED_FLOOR + (1 - SPEED_FLOOR) * (1 - clamped / SPEED_WINDOW_MS);
}

/** Streak bonus uses the streak *before* this answer: +10% per correct answer in a row, up to +50%. */
export function questionPoints(accuracy: number, timeMs: number, streakBefore: number): number {
  if (accuracy <= 0) return 0;
  const fraction = Math.min(accuracy, 100) / 100;
  const bonus = 1 + Math.min(Math.max(streakBefore, 0), STREAK_CAP) * STREAK_STEP;
  return Math.round(BASE_POINTS * fraction * speedFactor(timeMs) * bonus);
}

/** Only a fully correct answer extends the streak; anything else resets it. */
export function nextStreak(accuracy: number, streakBefore: number): number {
  return accuracy >= 100 ? streakBefore + 1 : 0;
}

export type AnswerRecord = {
  position: number;
  kind: BlitzrundeKind;
  accuracy: number;
  timeMs: number;
  points: number;
  /** Streak after this answer. */
  streak: number;
  answer: string[] | string | number | null;
};

export type AnswerSummary = {
  finalScore: number;
  answered: number;
  correct: number;
  avgMs: number;
  longestStreak: number;
};

export function summarizeAnswers(answers: readonly AnswerRecord[]): AnswerSummary {
  let finalScore = 0;
  let correct = 0;
  let totalMs = 0;
  let longestStreak = 0;
  for (const answer of answers) {
    finalScore += answer.points;
    if (answer.accuracy >= 100) correct += 1;
    totalMs += answer.timeMs;
    longestStreak = Math.max(longestStreak, answer.streak);
  }
  return {
    finalScore,
    answered: answers.length,
    correct,
    avgMs: answers.length === 0 ? 0 : Math.round(totalMs / answers.length),
    longestStreak,
  };
}

export type RankableParticipant = AnswerSummary & {
  completedDeck: boolean;
  name?: string;
};

/** Points, then correct answers, then finished the deck, then faster, then longer streak. */
export function compareParticipants(a: RankableParticipant, b: RankableParticipant): number {
  if (a.finalScore !== b.finalScore) return b.finalScore - a.finalScore;
  if (a.correct !== b.correct) return b.correct - a.correct;
  if (a.completedDeck !== b.completedDeck) return a.completedDeck ? -1 : 1;
  if (a.answered > 0 && b.answered > 0 && a.avgMs !== b.avgMs) return a.avgMs - b.avgMs;
  if (a.longestStreak !== b.longestStreak) return b.longestStreak - a.longestStreak;
  return (a.name ?? "").localeCompare(b.name ?? "", "vi", { sensitivity: "base" });
}

/** Rank 1..n; entries that compare equal share a rank. */
export function rankParticipants<T extends RankableParticipant>(list: readonly T[]): (T & { rank: number })[] {
  const sorted = [...list].sort(compareParticipants);
  const ranked: (T & { rank: number })[] = [];
  sorted.forEach((entry, index) => {
    const previous = ranked[index - 1];
    const tied =
      previous &&
      compareParticipants({ ...previous, name: "" }, { ...entry, name: "" }) === 0;
    ranked.push({ ...entry, rank: tied && previous ? previous.rank : index + 1 });
  });
  return ranked;
}

export function canStartRanked(joinedCount: number): boolean {
  return joinedCount >= MIN_RANKED;
}

export function computeEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + BLITZRUNDE_DURATION_MS);
}

export function isStale(lastSeenAt: string | null, now: Date): boolean {
  if (!lastSeenAt) return true;
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return true;
  return now.getTime() - seen > STALE_MS;
}

export function participantStatus(input: {
  sessionStatus: BlitzrundeStatus;
  submittedAt: string | null;
  lastSeenAt: string | null;
  endedAt?: string | null;
  now: Date;
}): ParticipantStatus {
  if (input.submittedAt) return "finished";
  if (input.sessionStatus === "lobby") return "waiting";
  if (input.sessionStatus === "active") {
    return isStale(input.lastSeenAt, input.now) ? "disconnected" : "playing";
  }
  // The phone only notices an early end on its next heartbeat, then uploads.
  // Until that lands, a student who was just seen is still in the round.
  if (input.sessionStatus === "ended" && input.lastSeenAt && withinLateSubmit(input.endedAt, input.now)) {
    return "playing";
  }
  return input.lastSeenAt ? "disconnected" : "no_result";
}

function withinLateSubmit(endedAt: string | null | undefined, now: Date): boolean {
  if (!endedAt) return false;
  const closed = Date.parse(endedAt);
  if (!Number.isFinite(closed)) return false;
  return now.getTime() - closed <= LATE_SUBMIT_MS;
}

/** Milliseconds left in the round, never negative. */
export function remainingMs(endsAt: string | null, now: number): number {
  if (!endsAt) return BLITZRUNDE_DURATION_MS;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - now);
}

export type SubmitBundle = {
  answers: AnswerRecord[];
  finishReason: BlitzrundeFinishReason;
};

function boundedInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

const KINDS: readonly BlitzrundeKind[] = ["order", "multiple-choice", "pairing"];
const FINISH_REASONS: readonly BlitzrundeFinishReason[] = ["deck_done", "time_up", "teacher_ended"];

function parseAnswerValue(kind: BlitzrundeKind, value: unknown): AnswerRecord["answer"] | undefined {
  if (value == null) return null;
  if (kind === "order") {
    if (!Array.isArray(value) || value.length > 40) return undefined;
    const words: string[] = [];
    for (const word of value) {
      if (typeof word !== "string" || word.length > 60) return undefined;
      words.push(word);
    }
    return words;
  }
  if (kind === "multiple-choice") {
    return typeof value === "string" && value.length <= 20 ? value : undefined;
  }
  return boundedInt(value, 0, 99) ?? undefined;
}

/**
 * The browser's result bundle. Values are range-checked and positions must be
 * 0..n-1 in order (students go through the deck front to back), but the
 * accuracy and points are taken as reported.
 */
export function parseSubmitBundle(value: unknown, deckLength: number): SubmitBundle | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const finishReason = FINISH_REASONS.find((reason) => reason === record.finishReason);
  if (!finishReason) return null;
  if (!Array.isArray(record.answers) || record.answers.length > deckLength) return null;

  const answers: AnswerRecord[] = [];
  for (const [index, raw] of record.answers.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const kind = KINDS.find((candidate) => candidate === item.kind);
    const position = boundedInt(item.position, 0, deckLength - 1);
    const accuracy = boundedInt(item.accuracy, 0, 100);
    const timeMs = boundedInt(item.timeMs, 0, BLITZRUNDE_DURATION_MS);
    const points = boundedInt(item.points, 0, MAX_QUESTION_POINTS);
    const streak = boundedInt(item.streak, 0, deckLength);
    if (!kind || position !== index || accuracy == null || timeMs == null || points == null || streak == null) {
      return null;
    }
    const answer = parseAnswerValue(kind, item.answer);
    if (answer === undefined) return null;
    answers.push({ position, kind, accuracy, timeMs, points, streak, answer });
  }
  return { answers, finishReason };
}

export function parseHeartbeatIndex(value: unknown, deckLength: number): number | null {
  if (!value || typeof value !== "object") return null;
  return boundedInt((value as Record<string, unknown>).index, 0, deckLength);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBlitzrundeId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ── Board & class progress ─────────────────────────────────────────────────

/** One student's result in one finished, ranked round, tagged with the class the round was played in. */
export type BoardResult = {
  sessionId: string;
  userId: string;
  finalScore: number;
  rank: number;
  classKey: string;
  classLabel: string;
  lektionLabel: string;
  /** When the round ran (start time), ISO. */
  playedAt: string;
  weekKey: string | null;
};

export type BlitzTotals = {
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  rounds: number;
  lastAt: string | null;
};

export function emptyTotals(): BlitzTotals {
  return { points: 0, gold: 0, silver: 0, bronze: 0, rounds: 0, lastAt: null };
}

export function totalsByUser(results: readonly BoardResult[]): Map<string, BlitzTotals> {
  const totals = new Map<string, BlitzTotals>();
  for (const result of results) {
    const total = totals.get(result.userId) ?? emptyTotals();
    total.points += result.finalScore;
    total.rounds += 1;
    if (result.rank === 1) total.gold += 1;
    else if (result.rank === 2) total.silver += 1;
    else if (result.rank === 3) total.bronze += 1;
    if (!total.lastAt || result.playedAt > total.lastAt) total.lastAt = result.playedAt;
    totals.set(result.userId, total);
  }
  return totals;
}

export type ClassPoints = { classKey: string; classLabel: string; points: number; rounds: number };

/** One student's points per class they played in, most points first (label = newest spelling). */
export function pointsByClass(results: readonly BoardResult[], userId: string): ClassPoints[] {
  const byClass = new Map<string, ClassPoints & { labelAt: string }>();
  for (const result of results) {
    if (result.userId !== userId) continue;
    const entry = byClass.get(result.classKey) ?? {
      classKey: result.classKey,
      classLabel: result.classLabel,
      points: 0,
      rounds: 0,
      labelAt: "",
    };
    entry.points += result.finalScore;
    entry.rounds += 1;
    if (result.playedAt >= entry.labelAt) {
      entry.classLabel = result.classLabel;
      entry.labelAt = result.playedAt;
    }
    byClass.set(result.classKey, entry);
  }
  return [...byClass.values()]
    .map((entry) => ({
      classKey: entry.classKey,
      classLabel: entry.classLabel,
      points: entry.points,
      rounds: entry.rounds,
    }))
    .sort((left, right) => right.points - left.points);
}

export type ProgressRound = { sessionId: string; lektionLabel: string; playedAt: string };
export type ProgressSeries = { userId: string; totals: (number | null)[]; total: number; member: boolean };
export type ClassProgress = {
  classKey: string;
  classLabel: string;
  rounds: ProgressRound[];
  series: ProgressSeries[];
};

export const PROGRESS_ROUND_LIMIT = 20;

/**
 * Each student's running Blitzrunde total over the rounds played in one class,
 * in date order. Points stay with the class they were earned in:
 * - a line starts at the student's first round in this class (null before,
 *   so someone who joined later doesn't show a fake flat zero);
 * - a current member who skips a round stays flat;
 * - someone who has since left the class stops after their last round here.
 * Only the newest `limit` rounds are returned, but totals include everything before.
 */
export function buildClassProgress(
  results: readonly BoardResult[],
  classKey: string,
  currentMemberIds: ReadonlySet<string>,
  limit: number = PROGRESS_ROUND_LIMIT,
): ClassProgress | null {
  const rows = results.filter((result) => result.classKey === classKey);
  if (rows.length === 0) return null;

  const roundMap = new Map<string, ProgressRound & { classLabel: string }>();
  for (const row of rows) {
    const round = roundMap.get(row.sessionId);
    if (!round || row.playedAt < round.playedAt) {
      roundMap.set(row.sessionId, {
        sessionId: row.sessionId,
        lektionLabel: row.lektionLabel,
        playedAt: row.playedAt,
        classLabel: row.classLabel,
      });
    }
  }
  const rounds = [...roundMap.values()].sort(
    (left, right) => left.playedAt.localeCompare(right.playedAt) || left.sessionId.localeCompare(right.sessionId),
  );
  const roundIndex = new Map(rounds.map((round, index) => [round.sessionId, index]));

  const playedByUser = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const index = roundIndex.get(row.sessionId);
    if (index == null) continue;
    const played = playedByUser.get(row.userId) ?? new Map<number, number>();
    played.set(index, (played.get(index) ?? 0) + row.finalScore);
    playedByUser.set(row.userId, played);
  }

  const start = Math.max(0, rounds.length - limit);
  const series: ProgressSeries[] = [];
  for (const [userId, played] of playedByUser) {
    const indexes = [...played.keys()];
    const first = Math.min(...indexes);
    const last = Math.max(...indexes);
    const member = currentMemberIds.has(userId);
    let running = 0;
    const totals = rounds.map((_round, index) => {
      running += played.get(index) ?? 0;
      if (index < first) return null;
      if (!member && index > last) return null;
      return running;
    });
    const windowed = totals.slice(start);
    if (windowed.every((value) => value == null)) continue;
    series.push({ userId, totals: windowed, total: running, member });
  }
  series.sort((left, right) => right.total - left.total || left.userId.localeCompare(right.userId));

  const newest = rounds[rounds.length - 1];
  return {
    classKey,
    classLabel: newest?.classLabel ?? classKey,
    rounds: rounds.slice(start).map((round) => ({
      sessionId: round.sessionId,
      lektionLabel: round.lektionLabel,
      playedAt: round.playedAt,
    })),
    series,
  };
}

/** Extra numbers the Blitzrunde board carries on top of the shared leaderboard payload. */
export type BlitzrundeBoardExtras = {
  yourSilver: number;
  yourBronze: number;
  yourRounds: number;
  /** Your points in each class you played in, for the current range. */
  yourByClass: ClassPoints[];
  /** Running totals for your current class (all time), or null. */
  progress: (ClassProgress & { names: Record<string, string>; youId: string }) | null;
};
