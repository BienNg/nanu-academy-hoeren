/**
 * Supabase side of the "Ôn tập" tab: Leitner boxes per level clip, review
 * answers, and the review round. Rules live in leitner.ts. Only level lessons
 * get boxes; living scenes and interview clips are left out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import type { SessionClip } from "@/lib/content";
import { getCefrLevels, getCefrLevel, getChapterClips, getLevelChapters } from "@/lib/levels";
import { missedAttempt, type ListeningRunInput, type MissedAnswers } from "@/lib/listening-runs";
import { buildMcOptions, type McOption } from "@/lib/multiple-choice";
import { getCloudProgress, getSupabaseAdmin, getUserLevelAccess } from "@/lib/progress-store";
import {
  addDays,
  applyAnswer,
  BOX_INTERVAL_DAYS,
  boxKey,
  compareReviewPriority,
  isDue,
  replayEvents,
  REVIEW_ROUND_CLIPS,
  vietnamDay,
  type BoxState,
  type ClipEvent,
} from "@/lib/leitner";

const BOXES_TABLE = "clip_boxes";
const ANSWERS_TABLE = "review_answers";
const CLIPS_TABLE = "clip_results";
const PAGE_SIZE = 1000;
const MAX_ANSWERS = REVIEW_ROUND_CLIPS * 4;

export type ReviewCardKind = "multiple-choice" | "vi-input";

export const REVIEW_CARD_KINDS: readonly ReviewCardKind[] = ["multiple-choice", "vi-input"];

export type ReviewClip = SessionClip & {
  lessonKey: string;
  /** "A1.1 · Lektion 3". */
  lessonLabel: string;
  box: number;
  lapses: number;
};

export type ReviewCard = {
  key: string;
  kind: ReviewCardKind;
  clip: ReviewClip;
  /** Four Vietnamese options. Only on multiple-choice cards. */
  options?: McOption[];
};

export type ReviewAnswerInput = {
  lessonKey: string;
  clipId: string;
  missed: boolean;
  missedKinds: ReviewCardKind[];
  missedAnswers: Partial<Record<ReviewCardKind, { entered: string; correct: string }>>;
};

export type BoxMove = {
  lessonKey: string;
  clipId: string;
  /** Null for a clip that had no box yet. */
  from: number | null;
  to: number;
  dueOn: string;
};

/** One practised sentence the student can still review. */
export type LearnedClip = {
  id: string;
  script: string;
  translationVi: string;
  lessonLabel: string;
  box: number;
};

export type ReviewOverview = {
  status: "ready" | "missing" | "error";
  today: string;
  /** Clips per box 0-6, counting only clips the student can still review. */
  boxCounts: number[];
  total: number;
  due: number;
  dueTomorrow: number;
  /** Next day anything is due, when nothing is due today. */
  nextDueOn: string | null;
  /** Practised sentences, grouped-ready: lesson label, then German text. */
  learned: LearnedClip[];
};

type StoredBox = BoxState & { lessonKey: string; clipId: string };

export class LeitnerSchemaError extends Error {
  constructor(message = "Review boxes are not set up") {
    super(message);
    this.name = "LeitnerSchemaError";
  }
}

export function isLeitnerSchemaMissing(message: string): boolean {
  return (
    /clip_boxes|review_answers/i.test(message) &&
    /does not exist|schema cache|could not find the (table|function)/i.test(message)
  );
}

function requireSupabase(): SupabaseClient {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  return supabase;
}

function fail(context: string, message: string): never {
  if (isLeitnerSchemaMissing(message)) throw new LeitnerSchemaError(message);
  throw new Error(`Supabase ${context}: ${message}`);
}

// ---------------------------------------------------------------------------
// Catalog

type LessonEntry = {
  levelSlug: string;
  label: string;
  clips: Map<string, SessionClip>;
  list: SessionClip[];
};

const lessonCache = new Map<string, LessonEntry | null>();
const levelClipCache = new Map<string, SessionClip[]>();

/** A CEFR lesson by `level/chapter` key. Null for living scenes, interviews, and unknown keys. */
function levelLesson(lessonKey: string): LessonEntry | null {
  if (lessonCache.has(lessonKey)) return lessonCache.get(lessonKey) ?? null;
  let entry: LessonEntry | null = null;
  const slash = lessonKey.indexOf("/");
  const level = slash > 0 ? getCefrLevel(lessonKey.slice(0, slash)) : undefined;
  const chapter = level?.chapters.find((item) => item.slug === lessonKey.slice(slash + 1));
  if (level && chapter) {
    try {
      const list = getChapterClips(level.slug, chapter.slug);
      entry = {
        levelSlug: level.slug,
        label: `${level.level} · ${chapter.label}`,
        clips: new Map(list.map((clip) => [clip.id, clip])),
        list,
      };
    } catch {
      entry = null;
    }
  }
  lessonCache.set(lessonKey, entry);
  return entry;
}

export function isLevelLessonKey(lessonKey: string): boolean {
  return levelLesson(lessonKey) !== null;
}

function levelClips(levelSlug: string): SessionClip[] {
  const cached = levelClipCache.get(levelSlug);
  if (cached) return cached;
  const clips = getLevelChapters(levelSlug).flatMap((chapter) => {
    try {
      return getChapterClips(levelSlug, chapter.slug);
    } catch {
      return [];
    }
  });
  levelClipCache.set(levelSlug, clips);
  return clips;
}

type Viewer = { id: string; email?: string | null };

async function accessibleLevels(viewer: Viewer): Promise<(levelSlug: string) => boolean> {
  if (isAdminUser(viewer)) return () => true;
  const granted = new Set(await getUserLevelAccess(viewer.id));
  return (levelSlug) => granted.has(levelSlug);
}

/** The clip, when it still exists, has a translation for both review cards, and its level is open. */
function reviewableClip(
  lessonKey: string,
  clipId: string,
  canOpen: (levelSlug: string) => boolean,
): { lesson: LessonEntry; clip: SessionClip } | null {
  const lesson = levelLesson(lessonKey);
  if (!lesson || !canOpen(lesson.levelSlug)) return null;
  const clip = lesson.clips.get(clipId);
  if (!clip || !clip.translationVi.trim()) return null;
  return { lesson, clip };
}

// ---------------------------------------------------------------------------
// Boxes

function storedBoxFromRow(value: unknown): StoredBox | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.lesson_key !== "string" || typeof row.clip_id !== "string") return null;
  if (typeof row.box !== "number" || typeof row.due_on !== "string") return null;
  return {
    lessonKey: row.lesson_key,
    clipId: row.clip_id,
    box: row.box,
    dueOn: row.due_on.slice(0, 10),
    lapses: typeof row.lapses === "number" ? row.lapses : 0,
  };
}

async function readAllBoxes(supabase: SupabaseClient, userId: string): Promise<StoredBox[]> {
  const boxes: StoredBox[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(BOXES_TABLE)
      .select("lesson_key, clip_id, box, due_on, lapses")
      .eq("user_id", userId)
      .order("lesson_key")
      .order("clip_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail("readAllBoxes", error.message);
    const page = data ?? [];
    for (const row of page) {
      const box = storedBoxFromRow(row);
      if (box) boxes.push(box);
    }
    if (page.length < PAGE_SIZE) return boxes;
  }
}

async function hasAnyBox(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from(BOXES_TABLE).select("user_id").eq("user_id", userId).limit(1);
  if (error) fail("hasAnyBox", error.message);
  return (data ?? []).length > 0;
}

async function readBoxesFor(
  supabase: SupabaseClient,
  userId: string,
  answers: readonly { lessonKey: string; clipId: string }[],
): Promise<Map<string, BoxState>> {
  const clipIds = [...new Set(answers.map((answer) => answer.clipId))];
  const boxes = new Map<string, BoxState>();
  if (clipIds.length === 0) return boxes;
  const { data, error } = await supabase
    .from(BOXES_TABLE)
    .select("lesson_key, clip_id, box, due_on, lapses")
    .eq("user_id", userId)
    .in("clip_id", clipIds);
  if (error) fail("readBoxesFor", error.message);
  for (const row of data ?? []) {
    const box = storedBoxFromRow(row);
    if (box) boxes.set(boxKey(box.lessonKey, box.clipId), box);
  }
  return boxes;
}

function boxRow(userId: string, lessonKey: string, clipId: string, state: BoxState, now: string) {
  return {
    user_id: userId,
    lesson_key: lessonKey,
    clip_id: clipId,
    box: state.box,
    due_on: state.dueOn,
    lapses: state.lapses,
    updated_at: now,
  };
}

/** Applies graded clips to their boxes and returns where each one moved. */
async function applyAnswers(
  supabase: SupabaseClient,
  userId: string,
  answers: readonly { lessonKey: string; clipId: string; missed: boolean }[],
  now: Date,
): Promise<BoxMove[]> {
  if (answers.length === 0) return [];
  const current = await readBoxesFor(supabase, userId, answers);
  const today = vietnamDay(now);
  const stamp = now.toISOString();
  const moves: BoxMove[] = [];
  const rows = [];
  for (const answer of answers) {
    const key = boxKey(answer.lessonKey, answer.clipId);
    const before = current.get(key) ?? null;
    const after = applyAnswer(before, answer.missed, today);
    current.set(key, after);
    moves.push({
      lessonKey: answer.lessonKey,
      clipId: answer.clipId,
      from: before ? before.box : null,
      to: after.box,
      dueOn: after.dueOn,
    });
    if (after !== before) rows.push(boxRow(userId, answer.lessonKey, answer.clipId, after, stamp));
  }
  if (rows.length > 0) {
    const { error } = await supabase
      .from(BOXES_TABLE)
      .upsert(rows, { onConflict: "user_id,lesson_key,clip_id" });
    if (error) fail("applyAnswers", error.message);
  }
  return moves;
}

/**
 * A finished practice part of a level lesson. Every clip it reached is graded:
 * a clip with any wrong card counts as missed. Other courses are ignored, and
 * a missing table only logs, so saving the run itself never fails because of boxes.
 * A student without boxes yet gets their whole history replayed instead, which
 * already includes this run.
 */
export async function recordPracticeBoxes(userId: string, run: ListeningRunInput): Promise<void> {
  if (!isLevelLessonKey(run.lessonKey)) return;
  try {
    const supabase = requireSupabase();
    if (!(await hasAnyBox(supabase, userId))) {
      await rebuildUserBoxes(userId);
      return;
    }
    await applyAnswers(
      supabase,
      userId,
      run.clips.map((clip) => ({ lessonKey: run.lessonKey, clipId: clip.clipId, missed: clip.missed })),
      new Date(),
    );
  } catch (error) {
    if (error instanceof LeitnerSchemaError) return;
    console.error("recordPracticeBoxes", error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------
// Overview and review round

function emptyOverview(status: ReviewOverview["status"], today: string): ReviewOverview {
  return {
    status,
    today,
    boxCounts: BOX_INTERVAL_DAYS.map(() => 0),
    total: 0,
    due: 0,
    dueTomorrow: 0,
    nextDueOn: null,
    learned: [],
  };
}

/**
 * Sentences already finished in practice, even when no listening-run row was saved.
 * Starting another pass resets the part counter on the path, and the finished
 * clips stay on the lesson. Those clips still belong in a box.
 */
function finishedPracticeIds(entry: {
  completedClipIds?: readonly string[];
  runCompletedClipIds?: readonly string[];
}): string[] {
  return [...new Set([...(entry.completedClipIds ?? []), ...(entry.runCompletedClipIds ?? [])])];
}

async function fillBoxesFromFinishedPractice(
  supabase: SupabaseClient,
  userId: string,
  existing: StoredBox[],
): Promise<StoredBox[]> {
  const progress = await getCloudProgress(userId);
  const have = new Set(existing.map((box) => boxKey(box.lessonKey, box.clipId)));
  const today = vietnamDay(new Date());
  const stamp = new Date().toISOString();
  const added: StoredBox[] = [];
  const rows = [];

  for (const [chapterSlug, entry] of Object.entries(progress.learn)) {
    const ids = new Set(finishedPracticeIds(entry));
    if (ids.size === 0) continue;
    for (const level of getCefrLevels()) {
      if (!level.chapters.some((chapter) => chapter.slug === chapterSlug)) continue;
      const lessonKey = `${level.slug}/${chapterSlug}`;
      if (!isLevelLessonKey(lessonKey)) continue;
      let clips: SessionClip[];
      try {
        clips = getChapterClips(level.slug, chapterSlug);
      } catch {
        continue;
      }
      for (const clip of clips) {
        if (!ids.has(clip.id)) continue;
        const key = boxKey(lessonKey, clip.id);
        if (have.has(key)) continue;
        have.add(key);
        const state = applyAnswer(null, false, today);
        const box: StoredBox = { ...state, lessonKey, clipId: clip.id };
        added.push(box);
        rows.push(boxRow(userId, lessonKey, clip.id, state, stamp));
      }
    }
  }

  for (let start = 0; start < rows.length; start += PAGE_SIZE) {
    const { error } = await supabase
      .from(BOXES_TABLE)
      .upsert(rows.slice(start, start + PAGE_SIZE), { onConflict: "user_id,lesson_key,clip_id" });
    if (error) fail("fillBoxesFromFinishedPractice", error.message);
  }
  return added.length > 0 ? [...existing, ...added] : existing;
}

async function reviewableBoxes(
  supabase: SupabaseClient,
  viewer: Viewer,
): Promise<{ box: StoredBox; lesson: LessonEntry; clip: SessionClip }[]> {
  const [stored, canOpen] = await Promise.all([readAllBoxes(supabase, viewer.id), accessibleLevels(viewer)]);
  let boxes = stored;
  if (boxes.length === 0 && (await rebuildUserBoxes(viewer.id)) > 0) {
    boxes = await readAllBoxes(supabase, viewer.id);
  }
  boxes = await fillBoxesFromFinishedPractice(supabase, viewer.id, boxes);
  const rows = [];
  for (const box of boxes) {
    const found = reviewableClip(box.lessonKey, box.clipId, canOpen);
    if (found) rows.push({ box, ...found });
  }
  return rows.sort((left, right) => compareReviewPriority(left.box, right.box));
}

export async function getReviewOverview(viewer: Viewer, now = new Date()): Promise<ReviewOverview> {
  const today = vietnamDay(now);
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyOverview("error", today);
  try {
    const rows = await reviewableBoxes(supabase, viewer);
    const overview = emptyOverview("ready", today);
    const tomorrow = addDays(today, 1);
    for (const { box, lesson, clip } of rows) {
      overview.boxCounts[box.box] = (overview.boxCounts[box.box] ?? 0) + 1;
      overview.total += 1;
      if (isDue(box, today)) overview.due += 1;
      else if (box.dueOn === tomorrow) overview.dueTomorrow += 1;
      if (!isDue(box, today) && (!overview.nextDueOn || box.dueOn < overview.nextDueOn)) {
        overview.nextDueOn = box.dueOn;
      }
      overview.learned.push({
        id: `${box.lessonKey}:${clip.id}`,
        script: clip.script,
        translationVi: clip.translationVi,
        lessonLabel: lesson.label,
        box: box.box,
      });
    }
    overview.learned.sort(
      (left, right) =>
        left.lessonLabel.localeCompare(right.lessonLabel, "vi") ||
        left.script.localeCompare(right.script, "de"),
    );
    if (overview.due > 0) overview.nextDueOn = null;
    return overview;
  } catch (error) {
    if (error instanceof LeitnerSchemaError) return emptyOverview("missing", today);
    console.error("getReviewOverview", error instanceof Error ? error.message : error);
    return emptyOverview("error", today);
  }
}

/** Bottom-nav badge. Zero when anything goes wrong. */
export async function countDueReviews(viewer: Viewer, now = new Date()): Promise<number> {
  const overview = await getReviewOverview(viewer, now);
  return overview.status === "ready" ? overview.due : 0;
}

function shuffled<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

/**
 * The next round: the most urgent due clips, each as a German → Vietnamese
 * multiple-choice card and a Vietnamese → type German card. All choice cards
 * come first, so the German is recognised before it has to be typed.
 */
export async function buildReviewRound(
  viewer: Viewer,
  now = new Date(),
): Promise<{ status: ReviewOverview["status"]; cards: ReviewCard[]; due: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", cards: [], due: 0 };
  const today = vietnamDay(now);
  try {
    const due = (await reviewableBoxes(supabase, viewer)).filter(({ box }) => isDue(box, today));
    const picked = due.slice(0, REVIEW_ROUND_CLIPS);
    const choiceCards: ReviewCard[] = [];
    const inputCards: ReviewCard[] = [];
    for (const { box, lesson, clip } of picked) {
      const reviewClip: ReviewClip = {
        ...clip,
        lessonKey: box.lessonKey,
        lessonLabel: lesson.label,
        box: box.box,
        lapses: box.lapses,
      };
      const key = `${box.lessonKey}:${clip.id}`;
      const options = buildMcOptions(clip, lesson.list, levelClips(lesson.levelSlug));
      if (options) choiceCards.push({ key: `${key}:mc`, kind: "multiple-choice", clip: reviewClip, options });
      inputCards.push({ key: `${key}:input`, kind: "vi-input", clip: reviewClip });
    }
    return { status: "ready", cards: [...shuffled(choiceCards), ...shuffled(inputCards)], due: due.length };
  } catch (error) {
    if (error instanceof LeitnerSchemaError) return { status: "missing", cards: [], due: 0 };
    console.error("buildReviewRound", error instanceof Error ? error.message : error);
    return { status: "error", cards: [], due: 0 };
  }
}

// ---------------------------------------------------------------------------
// Saving a review round

function readReviewKinds(value: unknown): ReviewCardKind[] {
  if (!Array.isArray(value)) return [];
  return REVIEW_CARD_KINDS.filter((kind) => value.includes(kind));
}

function readReviewAttempts(value: unknown): ReviewAnswerInput["missedAnswers"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const answers: ReviewAnswerInput["missedAnswers"] = {};
  for (const kind of REVIEW_CARD_KINDS) {
    const item = record[kind];
    if (!item || typeof item !== "object") continue;
    const attempt = item as Record<string, unknown>;
    if (typeof attempt.entered !== "string" || typeof attempt.correct !== "string") continue;
    const cleaned = missedAttempt(attempt.entered, attempt.correct);
    if (cleaned) answers[kind] = cleaned;
  }
  return answers;
}

export function parseReviewAnswers(value: unknown): ReviewAnswerInput[] | null {
  if (!value || typeof value !== "object") return null;
  const list = (value as Record<string, unknown>).answers;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ANSWERS) return null;
  const seen = new Set<string>();
  const answers: ReviewAnswerInput[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (typeof record.lessonKey !== "string" || typeof record.clipId !== "string") return null;
    if (typeof record.missed !== "boolean") return null;
    const key = boxKey(record.lessonKey, record.clipId);
    if (seen.has(key)) return null;
    seen.add(key);
    answers.push({
      lessonKey: record.lessonKey,
      clipId: record.clipId,
      missed: record.missed,
      missedKinds: record.missed ? readReviewKinds(record.missedKinds) : [],
      missedAnswers: record.missed ? readReviewAttempts(record.missedAnswers) : {},
    });
  }
  return answers;
}

/**
 * Saves a finished round: moves the boxes, then stores one answer row per clip
 * for the clip stats and for rebuilding. Clips that left the catalog or a level
 * the student lost are skipped. No XP, streak, or lesson progress is touched.
 */
export async function saveReviewAnswers(
  viewer: Viewer,
  answers: readonly ReviewAnswerInput[],
  now = new Date(),
): Promise<{ moves: BoxMove[]; due: number }> {
  const supabase = requireSupabase();
  const canOpen = await accessibleLevels(viewer);
  const kept = answers.filter((answer) => reviewableClip(answer.lessonKey, answer.clipId, canOpen));
  const moves = await applyAnswers(supabase, viewer.id, kept, now);
  if (moves.length > 0) {
    const stamp = now.toISOString();
    const rows = kept.map((answer, index) => ({
      user_id: viewer.id,
      lesson_key: answer.lessonKey,
      clip_id: answer.clipId,
      missed: answer.missed,
      missed_kinds: answer.missedKinds,
      missed_answers: answer.missedAnswers as MissedAnswers,
      box_before: moves[index]?.from ?? null,
      box_after: moves[index]?.to ?? 0,
      created_at: stamp,
    }));
    const { error } = await supabase.from(ANSWERS_TABLE).insert(rows);
    if (error) fail("saveReviewAnswers", error.message);
  }
  const overview = await getReviewOverview(viewer, now);
  return { moves, due: overview.due };
}

// ---------------------------------------------------------------------------
// Rebuild and clean-up

async function readEvents(
  supabase: SupabaseClient,
  table: typeof CLIPS_TABLE | typeof ANSWERS_TABLE,
  userId: string,
): Promise<ClipEvent[]> {
  const events: ClipEvent[] = [];
  const columns = table === CLIPS_TABLE ? "lesson_key, clip_id, missed, position, created_at" : "lesson_key, clip_id, missed, created_at";
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (table === ANSWERS_TABLE) fail("readEvents", error.message);
      throw new Error(`Supabase readEvents: ${error.message}`);
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      if (typeof row.lesson_key !== "string" || typeof row.clip_id !== "string") continue;
      if (typeof row.created_at !== "string" || !isLevelLessonKey(row.lesson_key)) continue;
      events.push({
        lessonKey: row.lesson_key,
        clipId: row.clip_id,
        missed: row.missed === true,
        at: row.created_at,
        order: typeof row.position === "number" ? row.position : 0,
      });
    }
    if (page.length < PAGE_SIZE) return events;
  }
}

/**
 * Recomputes every box of one student from their practice and review history.
 * Used for a student's first boxes and after an admin clears lessons.
 */
export async function rebuildUserBoxes(userId: string): Promise<number> {
  const supabase = requireSupabase();
  const [practice, reviews] = await Promise.all([
    readEvents(supabase, CLIPS_TABLE, userId),
    readEvents(supabase, ANSWERS_TABLE, userId),
  ]);
  const boxes = replayEvents([...practice, ...reviews]);
  const { error: deleteError } = await supabase.from(BOXES_TABLE).delete().eq("user_id", userId);
  if (deleteError) fail("rebuildUserBoxes", deleteError.message);
  const stamp = new Date().toISOString();
  const rows = [...boxes.entries()].map(([key, state]) => {
    const [lessonKey = "", clipId = ""] = key.split("\t");
    return boxRow(userId, lessonKey, clipId, state, stamp);
  });
  for (let start = 0; start < rows.length; start += PAGE_SIZE) {
    // Upsert, so two rebuilds running at once do not collide.
    const { error } = await supabase
      .from(BOXES_TABLE)
      .upsert(rows.slice(start, start + PAGE_SIZE), { onConflict: "user_id,lesson_key,clip_id" });
    if (error) fail("rebuildUserBoxes", error.message);
  }
  return rows.length;
}

/**
 * Drops review answers for cleared lessons (or all of them) and rebuilds the
 * student's boxes from what is left. A missing table is not an error.
 */
export async function clearReviewHistory(userId: string, lessonKeys: "all" | readonly string[]): Promise<void> {
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;
  const supabase = requireSupabase();
  try {
    const answers = supabase.from(ANSWERS_TABLE).delete().eq("user_id", userId);
    const { error } = await (lessonKeys === "all" ? answers : answers.in("lesson_key", [...lessonKeys]));
    if (error) fail("clearReviewHistory", error.message);
    if (lessonKeys === "all") {
      const { error: boxError } = await supabase.from(BOXES_TABLE).delete().eq("user_id", userId);
      if (boxError) fail("clearReviewHistory", boxError.message);
      return;
    }
    await rebuildUserBoxes(userId);
  } catch (error) {
    if (error instanceof LeitnerSchemaError) return;
    throw error;
  }
}
