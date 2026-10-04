/** Finished listening parts, passed or out of hearts. Append-only in Supabase. */

import {
  CARD_KINDS,
  MISSED_ATTEMPT_KINDS,
  type CardKind,
  type MissedAttemptKind,
} from "./card-kinds";
import { questZoneHeaders, readQuestUpdate, type QuestUpdate } from "./quests";

export type ListeningRunOutcome = "success" | "fail";

export type ClipRunResult = {
  clipId: string;
  /** Reached 100% and moved on. */
  passed: boolean;
  /** Wrong at least once. A later correction keeps this true. */
  missed: boolean;
  /** Card kinds that were wrong. Empty on runs stored before this was recorded. */
  missedKinds?: CardKind[];
  /** First wrong try for each practice card on this clip, with the right answer. Absent on older runs. */
  missedAnswers?: MissedAnswers;
};

export type MissedAttempt = {
  entered: string;
  correct: string;
};

export type MissedAnswers = Partial<Record<MissedAttemptKind, MissedAttempt>>;

export type ListeningRunInput = {
  id: string;
  lessonKey: string;
  partNumber: number;
  partCount: number;
  outcome: ListeningRunOutcome;
  accuracy: number;
  answeredCount: number;
  clipCount: number;
  /** Cards dealt in the part. Absent on runs stored before this was recorded. */
  cardCount?: number;
  elapsedMs: number;
  clips: ClipRunResult[];
};

export type StoredListeningRun = ListeningRunInput & {
  createdAt: string;
};

export type ClipOutcomeTotal = {
  lessonKey: string;
  clipId: string;
  failures: number;
  successes: number;
  studentsFailed: number;
  studentsPassed: number;
};

export type ListeningReadStatus = "ready" | "missing" | "error";

export type ClipStatsRead = {
  status: ListeningReadStatus;
  rows: ClipOutcomeTotal[];
};

export type StudentRunsPage = {
  status: ListeningReadStatus;
  runs: StoredListeningRun[];
  total: number;
  passed: number;
  failed: number;
};

export type RankedClipOutcomes = {
  status: ListeningReadStatus;
  failed: ClipOutcomeTotal[];
  succeeded: ClipOutcomeTotal[];
};

export const CLIP_RANK_LIMIT = 8;

export const LISTENING_SCHEMA_HINT =
  "Finished practice parts are not being stored yet. Run supabase/listening_runs.sql once in the Supabase SQL editor.";

const MAX_CLIPS = 40;
/** Listening, order, both choice cards, typing, and pairing can stack on one part. */
const MAX_CARDS = 240;
const MAX_ELAPSED_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPT_CHARS = 400;
const LESSON_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ListeningSchemaError extends Error {
  constructor(message = "Listening run storage is not set up") {
    super(message);
    this.name = "ListeningSchemaError";
  }
}

export function isListeningSchemaMissing(message: string): boolean {
  return (
    /listening_runs|clip_results|clip_outcome_totals/i.test(message) &&
    /does not exist|schema cache|could not find the (table|function)/i.test(message)
  );
}

function integerIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function isClipId(value: string): boolean {
  return value.length >= 1 && value.length <= 180 && !/[\u0000-\u001f\u007f/\\]/.test(value);
}

function wasMissed(clipId: string, missedClipIds: ReadonlySet<string>): boolean {
  return missedClipIds.has(clipId) || missedClipIds.has(clipId.trim());
}

function orderedMissedKinds(kinds: Iterable<string> | undefined): CardKind[] | undefined {
  if (!kinds) return undefined;
  const present = new Set(kinds);
  const ordered = CARD_KINDS.filter((kind) => present.has(kind));
  return ordered.length > 0 ? ordered : undefined;
}

function readMissedKinds(value: unknown, missed: boolean): CardKind[] | undefined {
  if (!missed || !Array.isArray(value)) return undefined;
  return orderedMissedKinds(value.filter((item): item is string => typeof item === "string"));
}

function withMissedKinds(
  clipId: string,
  missed: boolean,
  missedKinds: ReadonlyMap<string, ReadonlySet<CardKind>> | undefined,
): Pick<ClipRunResult, "missedKinds"> {
  if (!missed) return {};
  const kinds = orderedMissedKinds(missedKinds?.get(clipId) ?? missedKinds?.get(clipId.trim()));
  return kinds ? { missedKinds: kinds } : {};
}

export function cleanAttemptText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_ATTEMPT_CHARS);
}

/** Drops a try that is empty after cleanup. The first stored try is the one that counts. */
export function missedAttempt(entered: string, correct: string): MissedAttempt | null {
  const cleanEntered = cleanAttemptText(entered);
  const cleanCorrect = cleanAttemptText(correct);
  if (!cleanEntered || !cleanCorrect) return null;
  return { entered: cleanEntered, correct: cleanCorrect };
}

function readMissedAnswers(value: unknown, missed: boolean): MissedAnswers | undefined {
  if (!missed || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const answers: MissedAnswers = {};
  for (const kind of MISSED_ATTEMPT_KINDS) {
    const item = record[kind];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const attempt = item as Record<string, unknown>;
    if (typeof attempt.entered !== "string" || typeof attempt.correct !== "string") continue;
    const cleaned = missedAttempt(attempt.entered, attempt.correct);
    if (cleaned) answers[kind] = cleaned;
  }
  return Object.keys(answers).length > 0 ? answers : undefined;
}

function withMissedAnswers(
  clipId: string,
  missed: boolean,
  missedAnswers: ReadonlyMap<string, MissedAnswers> | undefined,
): Pick<ClipRunResult, "missedAnswers"> {
  if (!missed) return {};
  const answers = readMissedAnswers(
    missedAnswers?.get(clipId) ?? missedAnswers?.get(clipId.trim()),
    true,
  );
  return answers ? { missedAnswers: answers } : {};
}

/**
 * One result per clip in a finished part.
 * A passed part cleared every clip; misses that were corrected stay missed.
 * A failed part includes clips already cleared, the clip that spent the last
 * heart, and misses still waiting later in the queue. Untouched clips are left out.
 */
export function clipResultsForFinishedPart(
  clips: readonly { id: string }[],
  missedClipIds: ReadonlySet<string>,
  failed: boolean,
  clipIndex: number,
): ClipRunResult[] {
  if (clips.length === 0) return [];
  const seen = new Set<string>();
  const results: ClipRunResult[] = [];
  const add = (clip: { id: string }, passed: boolean) => {
    const clipId = clip.id.trim();
    if (!clipId || seen.has(clipId)) return;
    const missed = wasMissed(clip.id, missedClipIds) || !passed;
    if (!passed && !missed) return;
    seen.add(clipId);
    results.push({ clipId, passed, missed });
  };

  if (!failed) {
    for (const clip of clips) add(clip, true);
    return results;
  }

  const cursor = Math.min(Math.max(0, Math.floor(clipIndex)), clips.length - 1);
  clips.forEach((clip, index) => {
    if (index < cursor) add(clip, true);
  });
  const current = clips[cursor];
  if (current) add(current, false);
  clips.forEach((clip, index) => {
    if (index > cursor && wasMissed(clip.id, missedClipIds)) add(clip, false);
  });
  return results;
}

/**
 * One result per clip. Practice uses one listening card per clip.
 * A clip passed only when every one of its cards was cleared, and missed
 * when any of its cards was wrong once. A failed part leaves out clips
 * that were only partly played and never missed.
 */
export function clipResultsForCardDeck(
  cards: readonly { clip: { id: string } }[],
  missedClipIds: ReadonlySet<string>,
  failed: boolean,
  cardIndex: number,
  missedKinds?: ReadonlyMap<string, ReadonlySet<CardKind>>,
  missedAnswers?: ReadonlyMap<string, MissedAnswers>,
): ClipRunResult[] {
  if (cards.length === 0) return [];
  const clipOrder: string[] = [];
  const lastCardAt = new Map<string, number>();
  cards.forEach((card, index) => {
    const clipId = card.clip.id.trim();
    if (!clipId) return;
    if (!lastCardAt.has(clipId)) clipOrder.push(clipId);
    lastCardAt.set(clipId, index);
  });

  if (!failed) {
    return clipOrder.map((clipId) => {
      const missed = wasMissed(clipId, missedClipIds);
      return {
        clipId,
        passed: true,
        missed,
        ...withMissedKinds(clipId, missed, missedKinds),
        ...withMissedAnswers(clipId, missed, missedAnswers),
      };
    });
  }

  const cursor = Math.min(Math.max(0, Math.floor(cardIndex)), cards.length - 1);
  const currentId = cards[cursor]?.clip.id.trim() ?? "";
  const results: ClipRunResult[] = [];
  for (const clipId of clipOrder) {
    const passed = clipId !== currentId && (lastCardAt.get(clipId) ?? 0) < cursor;
    const missed = wasMissed(clipId, missedClipIds) || clipId === currentId;
    if (!passed && !missed) continue;
    results.push({
      clipId,
      passed,
      missed,
      ...withMissedKinds(clipId, missed, missedKinds),
      ...withMissedAnswers(clipId, missed, missedAnswers),
    });
  }
  return results;
}

export function parseListeningRunInput(value: unknown): ListeningRunInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !UUID.test(record.id)) return null;
  if (typeof record.lessonKey !== "string" || !LESSON_KEY.test(record.lessonKey)) return null;
  const outcome = record.outcome === "success" || record.outcome === "fail" ? record.outcome : null;
  if (!outcome) return null;

  const accuracy = integerIn(record.accuracy, 0, 100);
  const partNumber = integerIn(record.partNumber, 1, 99);
  const partCount = integerIn(record.partCount, 1, 99);
  const clipCount = integerIn(record.clipCount, 1, MAX_CLIPS);
  const answeredCount = integerIn(record.answeredCount, 1, MAX_CLIPS);
  const elapsedMs = integerIn(record.elapsedMs, 0, MAX_ELAPSED_MS);
  const cardCount =
    record.cardCount == null ? undefined : integerIn(record.cardCount, 1, MAX_CARDS);
  if (
    accuracy == null ||
    partNumber == null ||
    partCount == null ||
    clipCount == null ||
    answeredCount == null ||
    elapsedMs == null ||
    cardCount === null ||
    partNumber > partCount ||
    answeredCount > clipCount ||
    !Array.isArray(record.clips) ||
    record.clips.length !== answeredCount
  ) {
    return null;
  }

  const seen = new Set<string>();
  const clips: ClipRunResult[] = [];
  for (const item of record.clips) {
    if (!item || typeof item !== "object") return null;
    const clip = item as Record<string, unknown>;
    if (typeof clip.clipId !== "string" || !isClipId(clip.clipId)) return null;
    if (clip.passed !== true && clip.passed !== false) return null;
    if (clip.missed !== true && clip.missed !== false) return null;
    if (!clip.passed && !clip.missed) return null;
    if (seen.has(clip.clipId)) return null;
    seen.add(clip.clipId);
    const missedKinds = readMissedKinds(clip.missedKinds, clip.missed === true);
    const missedAnswers = readMissedAnswers(clip.missedAnswers, clip.missed === true);
    clips.push({
      clipId: clip.clipId,
      passed: clip.passed,
      missed: clip.missed,
      ...(missedKinds ? { missedKinds } : {}),
      ...(missedAnswers ? { missedAnswers } : {}),
    });
  }

  if (outcome === "success") {
    if (answeredCount !== clipCount || clips.some((clip) => !clip.passed)) return null;
  } else if (!clips.some((clip) => clip.missed && !clip.passed)) {
    return null;
  }

  return {
    id: record.id,
    lessonKey: record.lessonKey,
    partNumber,
    partCount,
    outcome,
    accuracy,
    answeredCount,
    clipCount,
    ...(cardCount != null ? { cardCount } : {}),
    elapsedMs,
    clips,
  };
}

export function buildListeningRunRecord(input: {
  lessonKey: string;
  partNumber: number;
  partCount: number;
  failed: boolean;
  accuracy: number;
  clipCount: number;
  cardCount?: number;
  elapsedMs: number;
  clips: readonly { id: string }[];
  missedClipIds: ReadonlySet<string>;
  clipIndex: number;
  /** Precomputed per-clip results, e.g. from clipResultsForCardDeck. */
  results?: ClipRunResult[];
}): ListeningRunInput | null {
  const clips =
    input.results ??
    clipResultsForFinishedPart(
      input.clips,
      input.missedClipIds,
      input.failed,
      input.clipIndex,
    );
  return parseListeningRunInput({
    id: crypto.randomUUID(),
    lessonKey: input.lessonKey,
    partNumber: input.partNumber,
    partCount: input.partCount,
    outcome: input.failed ? "fail" : "success",
    accuracy: input.accuracy,
    answeredCount: clips.length,
    clipCount: input.clipCount,
    cardCount: input.cardCount,
    elapsedMs: input.elapsedMs,
    clips,
  });
}

export type ListeningRunXp = {
  xp: number | null;
  kind: string | null;
  quests: QuestUpdate | null;
};

/** Saves the run and returns the XP the server awarded. Null when the save failed. */
export async function submitListeningRun(
  input: ListeningRunInput,
): Promise<ListeningRunXp | null> {
  try {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...questZoneHeaders() },
      body: JSON.stringify(input),
      keepalive: true,
    });
    if (!response.ok) {
      console.error("Listening run was not saved", response.status);
      return null;
    }
    const data = (await response.json()) as { xp?: unknown; kind?: unknown; quests?: unknown };
    return {
      xp: typeof data.xp === "number" ? data.xp : null,
      kind: typeof data.kind === "string" ? data.kind : null,
      quests: readQuestUpdate(data.quests),
    };
  } catch (error) {
    console.error("Listening run was not saved", error);
    return null;
  }
}

function readCount(value: unknown): number {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.floor(number), 1_000_000_000);
}

export function clipOutcomeTotalFromRow(value: unknown): ClipOutcomeTotal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.lesson_key !== "string" || typeof row.clip_id !== "string") return null;
  if (!row.lesson_key || !row.clip_id) return null;
  return {
    lessonKey: row.lesson_key,
    clipId: row.clip_id,
    failures: readCount(row.failures),
    successes: readCount(row.successes),
    studentsFailed: readCount(row.students_failed),
    studentsPassed: readCount(row.students_passed),
  };
}

export function storedListeningRunFromRow(value: unknown): StoredListeningRun | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawClips = Array.isArray(row.clip_results) ? row.clip_results : [];
  const clips = rawClips
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const clip = item as Record<string, unknown>;
      if (typeof clip.clip_id !== "string") return null;
      const passed = clip.passed === true;
      const missed = clip.missed === true;
      if (!passed && !missed) return null;
      const missedKinds = readMissedKinds(clip.missed_kinds, missed);
      const missedAnswers = readMissedAnswers(clip.missed_answers, missed);
      return {
        position: readCount(clip.position),
        clip: {
          clipId: clip.clip_id,
          passed,
          missed,
          ...(missedKinds ? { missedKinds } : {}),
          ...(missedAnswers ? { missedAnswers } : {}),
        },
      };
    })
    .filter((item): item is { position: number; clip: ClipRunResult } => item != null)
    .sort((left, right) => left.position - right.position)
    .map((item) => item.clip);

  const parsed = parseListeningRunInput({
    id: row.id,
    lessonKey: row.lesson_key,
    partNumber: row.part_number,
    partCount: row.part_count,
    outcome: row.outcome,
    accuracy: row.accuracy,
    answeredCount: row.answered_count,
    clipCount: row.clip_count,
    cardCount: row.card_count,
    elapsedMs: row.elapsed_ms,
    clips,
  });
  if (!parsed || typeof row.created_at !== "string" || !row.created_at) return null;
  return { ...parsed, createdAt: row.created_at };
}

export type AdminListeningRunRecord = {
  id: string;
  userId: string;
  lessonKey: string;
  partNumber: number;
  partCount: number;
  outcome: ListeningRunOutcome;
  accuracy: number;
  answeredCount: number;
  clipCount: number;
  elapsedMs: number;
  createdAt: string;
};

/** Run row without nested clip_results. Used by the admin listening-runs page. */
export function adminListeningRunFromRow(value: unknown): AdminListeningRunRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !UUID.test(row.id)) return null;
  if (typeof row.user_id !== "string" || !row.user_id) return null;
  if (typeof row.lesson_key !== "string" || !LESSON_KEY.test(row.lesson_key)) return null;
  const outcome =
    row.outcome === "success" || row.outcome === "fail" ? row.outcome : null;
  if (!outcome) return null;
  if (typeof row.created_at !== "string" || !row.created_at) return null;
  const accuracy = integerIn(row.accuracy, 0, 100);
  const partNumber = integerIn(row.part_number, 1, 99);
  const partCount = integerIn(row.part_count, 1, 99);
  const clipCount = integerIn(row.clip_count, 1, MAX_CLIPS);
  const answeredCount = integerIn(row.answered_count, 1, MAX_CLIPS);
  const elapsedMs = integerIn(row.elapsed_ms, 0, MAX_ELAPSED_MS);
  if (
    accuracy == null ||
    partNumber == null ||
    partCount == null ||
    clipCount == null ||
    answeredCount == null ||
    elapsedMs == null ||
    partNumber > partCount ||
    answeredCount > clipCount
  ) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    lessonKey: row.lesson_key,
    partNumber,
    partCount,
    outcome,
    accuracy,
    answeredCount,
    clipCount,
    elapsedMs,
    createdAt: row.created_at,
  };
}

function compareRank(
  count: (row: ClipOutcomeTotal) => number,
  students: (row: ClipOutcomeTotal) => number,
) {
  return (left: ClipOutcomeTotal, right: ClipOutcomeTotal) =>
    count(right) - count(left) ||
    students(right) - students(left) ||
    left.lessonKey.localeCompare(right.lessonKey) ||
    left.clipId.localeCompare(right.clipId);
}

export function rankClipOutcomes(rows: readonly ClipOutcomeTotal[]): {
  failed: ClipOutcomeTotal[];
  succeeded: ClipOutcomeTotal[];
} {
  return {
    failed: [...rows]
      .filter((row) => row.failures > 0)
      .sort(compareRank((row) => row.failures, (row) => row.studentsFailed))
      .slice(0, CLIP_RANK_LIMIT),
    succeeded: [...rows]
      .filter((row) => row.successes > 0)
      .sort(compareRank((row) => row.successes, (row) => row.studentsPassed))
      .slice(0, CLIP_RANK_LIMIT),
  };
}

export function presentClipOutcomes(read: ClipStatsRead): RankedClipOutcomes {
  if (read.status !== "ready") {
    return { status: read.status, failed: [], succeeded: [] };
  }
  return { status: "ready", ...rankClipOutcomes(read.rows) };
}

export function clipAttempts(row: ClipOutcomeTotal): number {
  return row.failures + row.successes;
}

/** Share of stored outcomes that are misses. A corrected miss counts on both sides. */
export function clipMissRate(row: ClipOutcomeTotal): number {
  const attempts = clipAttempts(row);
  return attempts === 0 ? 0 : row.failures / attempts;
}

const HARD_SAMPLE = 3;

export type AdminClipDifficultyBoard = {
  clips: number;
  misses: number;
  passes: number;
  withMisses: number;
  hardest: ClipOutcomeTotal | null;
};

/**
 * All-time clip outcomes. Totals are not a date window; stored parts start when
 * listening_runs.sql was applied.
 */
export function buildAdminClipDifficultyBoard(
  rows: readonly ClipOutcomeTotal[],
): AdminClipDifficultyBoard {
  const seen = rows.filter((row) => clipAttempts(row) > 0);
  const sampled = seen.filter((row) => clipAttempts(row) >= HARD_SAMPLE);
  const pool = sampled.length > 0 ? sampled : seen;
  let hardest: ClipOutcomeTotal | null = null;
  for (const row of pool) {
    if (!hardest) {
      hardest = row;
      continue;
    }
    const rate = clipMissRate(row) - clipMissRate(hardest);
    const misses = row.failures - hardest.failures;
    if (rate > 0 || (rate === 0 && misses > 0)) hardest = row;
  }
  return {
    clips: seen.length,
    misses: seen.reduce((sum, row) => sum + row.failures, 0),
    passes: seen.reduce((sum, row) => sum + row.successes, 0),
    withMisses: seen.filter((row) => row.failures > 0).length,
    hardest,
  };
}
