import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import type { SessionClip } from "@/lib/content";
import { listCatalogClips } from "@/lib/duel-store";
import type { CatalogClip } from "@/lib/duels";
import { getCefrLevel, getChapterClips } from "@/lib/levels";
import type { ClipRunResult } from "@/lib/listening-runs";
import {
  getSupabaseAdmin,
  getUserLevelAccess,
  withoutInterviewAccess,
} from "@/lib/progress-store";
import {
  applyReviewOutcomes,
  decideReviewXp,
  isReviewDue,
  isReviewSchemaMissing,
  pickReviewItems,
  replayReviewHistory,
  reviewKey,
  reviewLevelSlug,
  type DueReviewItem,
  type ReviewHistoryRow,
  type ReviewState,
  type ReviewSubmit,
  type ReviewSummary,
} from "@/lib/review";
import { dayKey, weekKey } from "@/lib/xp";

const ITEMS_TABLE = "review_items";
const XP_TABLE = "review_xp_awards";
const CLIP_RESULTS_TABLE = "clip_results";
const PAGE_SIZE = 1000;
const UPSERT_PAGE = 400;

type ReviewUser = { id: string; email?: string | null };

/** One clip in a review session, with the lesson it came from. */
export type ReviewClip = SessionClip & {
  lessonKey: string;
  /** e.g. "A1.1 · Lektion 4" */
  lessonLabel: string;
};

export type ReviewXpGrant = {
  ready: boolean;
  xp: number | null;
  kind: "new" | "rejected" | "capped" | "repeat" | null;
  reviewed: number;
};

type ItemRow = {
  lesson_key?: unknown;
  clip_id?: unknown;
  box?: unknown;
  due_at?: unknown;
  last_reviewed_at?: unknown;
  reviews?: unknown;
  lapses?: unknown;
};

class ReviewSchemaMissing extends Error {}

function fail(message: string, context: string): never {
  if (isReviewSchemaMissing(message)) throw new ReviewSchemaMissing(message);
  throw new Error(`Supabase ${context}: ${message}`);
}

let catalogIndex: Map<string, CatalogClip> | null = null;

function catalogByKey(): Map<string, CatalogClip> {
  if (catalogIndex) return catalogIndex;
  const index = new Map<string, CatalogClip>();
  for (const clip of listCatalogClips()) index.set(reviewKey(clip.lessonKey, clip.clipId), clip);
  catalogIndex = index;
  return index;
}

/** Levels the learner may open. Null means every level (admins). */
async function allowedLevels(user: ReviewUser): Promise<ReadonlySet<string> | null> {
  if (isAdminUser(user)) return null;
  return new Set(withoutInterviewAccess(await getUserLevelAccess(user.id)));
}

function isOpenClip(
  lessonKey: string,
  clipId: string,
  levels: ReadonlySet<string> | null,
): boolean {
  if (!catalogByKey().has(reviewKey(lessonKey, clipId))) return false;
  return levels === null || levels.has(reviewLevelSlug(lessonKey));
}

function stateFromRow(row: ItemRow): { key: string; state: ReviewState } | null {
  if (
    typeof row.lesson_key !== "string" ||
    typeof row.clip_id !== "string" ||
    typeof row.box !== "number" ||
    typeof row.due_at !== "string"
  ) {
    return null;
  }
  return {
    key: reviewKey(row.lesson_key, row.clip_id),
    state: {
      box: row.box,
      dueAt: row.due_at,
      lastReviewedAt: typeof row.last_reviewed_at === "string" ? row.last_reviewed_at : null,
      reviews: typeof row.reviews === "number" ? row.reviews : 0,
      lapses: typeof row.lapses === "number" ? row.lapses : 0,
    },
  };
}

async function readStates(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, ReviewState & { lessonKey: string; clipId: string }>> {
  const states = new Map<string, ReviewState & { lessonKey: string; clipId: string }>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(ITEMS_TABLE)
      .select("lesson_key, clip_id, box, due_at, last_reviewed_at, reviews, lapses")
      .eq("user_id", userId)
      .order("lesson_key")
      .order("clip_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail(error.message, "readReviewItems");
    const page = (data ?? []) as ItemRow[];
    for (const row of page) {
      const parsed = stateFromRow(row);
      if (!parsed) continue;
      states.set(parsed.key, {
        ...parsed.state,
        lessonKey: row.lesson_key as string,
        clipId: row.clip_id as string,
      });
    }
    if (page.length < PAGE_SIZE) return states;
    from += PAGE_SIZE;
  }
}

async function writeStates(
  supabase: SupabaseClient,
  userId: string,
  states: ReadonlyMap<string, ReviewState>,
): Promise<void> {
  const rows = [...states].map(([key, state]) => {
    const [lessonKey, clipId] = key.split("\u0000") as [string, string];
    return {
      user_id: userId,
      lesson_key: lessonKey,
      clip_id: clipId,
      box: state.box,
      due_at: state.dueAt,
      last_reviewed_at: state.lastReviewedAt,
      reviews: state.reviews,
      lapses: state.lapses,
    };
  });
  for (let start = 0; start < rows.length; start += UPSERT_PAGE) {
    const { error } = await supabase
      .from(ITEMS_TABLE)
      .upsert(rows.slice(start, start + UPSERT_PAGE), {
        onConflict: "user_id,lesson_key,clip_id",
      });
    if (error) fail(error.message, "writeReviewItems");
  }
}

/**
 * Learners already known to have review rows, so the backfill check is
 * skipped. Per server instance; a cold start only costs one head count.
 */
const backfilled = new Set<string>();
const BACKFILL_MEMORY = 5000;

function rememberBackfilled(userId: string): void {
  if (backfilled.size >= BACKFILL_MEMORY) backfilled.clear();
  backfilled.add(userId);
}

/**
 * Seeds the schedule from past listening parts the first time a learner is
 * seen with no review rows. Returns true when it wrote the rows itself.
 */
async function backfillIfEmpty(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (backfilled.has(userId)) return false;
  const { count, error } = await supabase
    .from(ITEMS_TABLE)
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) fail(error.message, "countReviewItems");
  if ((count ?? 0) > 0) {
    rememberBackfilled(userId);
    return false;
  }

  const history: ReviewHistoryRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error: readError } = await supabase
      .from(CLIP_RESULTS_TABLE)
      .select("lesson_key, clip_id, missed, created_at")
      .eq("user_id", userId)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (readError) {
      // No listening history table means nothing to replay.
      console.error("Supabase review backfill", readError.message);
      return false;
    }
    const page = (data ?? []) as {
      lesson_key?: unknown;
      clip_id?: unknown;
      missed?: unknown;
      created_at?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.lesson_key !== "string" ||
        typeof row.clip_id !== "string" ||
        typeof row.missed !== "boolean" ||
        typeof row.created_at !== "string" ||
        !catalogByKey().has(reviewKey(row.lesson_key, row.clip_id))
      ) {
        continue;
      }
      history.push({
        lessonKey: row.lesson_key,
        clipId: row.clip_id,
        missed: row.missed,
        createdAt: row.created_at,
      });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (history.length === 0) return false;
  await writeStates(supabase, userId, replayReviewHistory(history));
  rememberBackfilled(userId);
  return true;
}

/**
 * Schedules the clips of one finished listening part. Called after the
 * part's clip_results are stored, so a first-time backfill already covers it.
 * Never throws: a missing review table must not fail the listening save.
 */
export async function scheduleListeningResults(
  userId: string,
  lessonKey: string,
  clips: readonly ClipRunResult[],
  now = new Date(),
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const outcomes = clips
    .filter((clip) => catalogByKey().has(reviewKey(lessonKey, clip.clipId)))
    .map((clip) => ({ lessonKey, clipId: clip.clipId, missed: clip.missed || !clip.passed }));
  if (outcomes.length === 0) return;
  try {
    if (await backfillIfEmpty(supabase, userId)) return;
    const known = await readStates(supabase, userId);
    await writeStates(supabase, userId, applyReviewOutcomes(known, outcomes, now));
    rememberBackfilled(userId);
  } catch (error) {
    if (error instanceof ReviewSchemaMissing) return;
    console.error("scheduleListeningResults", error);
  }
}

async function dueItems(
  supabase: SupabaseClient,
  user: ReviewUser,
  now: Date,
): Promise<{ due: DueReviewItem[]; total: number; levels: ReadonlySet<string> | null }> {
  await backfillIfEmpty(supabase, user.id);
  const [states, levels] = await Promise.all([readStates(supabase, user.id), allowedLevels(user)]);
  const open = [...states.values()].filter((state) =>
    isOpenClip(state.lessonKey, state.clipId, levels),
  );
  const due = pickReviewItems(
    open.map((state) => ({
      lessonKey: state.lessonKey,
      clipId: state.clipId,
      dueAt: state.dueAt,
      lapses: state.lapses,
    })),
    () => true,
    now,
    Number.POSITIVE_INFINITY,
  );
  return { due, total: open.length, levels };
}

/** Due count for Home and the nav badge. */
export async function getReviewSummary(user: ReviewUser, now = new Date()): Promise<ReviewSummary> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, due: 0, total: 0 };
  try {
    const { due, total } = await dueItems(supabase, user, now);
    return { ready: true, due: due.length, total };
  } catch (error) {
    if (!(error instanceof ReviewSchemaMissing)) console.error("getReviewSummary", error);
    return { ready: false, due: 0, total: 0 };
  }
}

function lessonLabel(lessonKey: string, chapterLabels: Map<string, string>): string {
  const cached = chapterLabels.get(lessonKey);
  if (cached) return cached;
  const [levelSlug, chapterSlug] = lessonKey.split("/") as [string, string];
  const level = getCefrLevel(levelSlug);
  const chapter = level?.chapters.find((entry) => entry.slug === chapterSlug);
  const label = level && chapter ? `${level.level} · ${chapter.label}` : lessonKey;
  chapterLabels.set(lessonKey, label);
  return label;
}

/** The clips for one review session, most overdue first. */
export async function getReviewDeck(
  user: ReviewUser,
  limit: number,
  now = new Date(),
): Promise<{ ready: boolean; clips: ReviewClip[]; due: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, clips: [], due: 0 };
  let picked: DueReviewItem[];
  let dueCount: number;
  try {
    const { due } = await dueItems(supabase, user, now);
    dueCount = due.length;
    picked = due.slice(0, limit);
  } catch (error) {
    if (!(error instanceof ReviewSchemaMissing)) console.error("getReviewDeck", error);
    return { ready: false, clips: [], due: 0 };
  }

  const lessonClips = new Map<string, SessionClip[]>();
  const labels = new Map<string, string>();
  const clips: ReviewClip[] = [];
  for (const item of picked) {
    let lesson = lessonClips.get(item.lessonKey);
    if (!lesson) {
      const [levelSlug, chapterSlug] = item.lessonKey.split("/") as [string, string];
      try {
        lesson = getChapterClips(levelSlug, chapterSlug);
      } catch {
        lesson = [];
      }
      lessonClips.set(item.lessonKey, lesson);
    }
    const clip = lesson.find((entry) => entry.id === item.clipId);
    if (!clip) continue;
    clips.push({
      ...clip,
      lessonKey: item.lessonKey,
      lessonLabel: lessonLabel(item.lessonKey, labels),
    });
  }
  return { ready: true, clips, due: dueCount };
}

/**
 * Stores one finished review session: moves each due clip through its box
 * and pays capped XP. Clips that were not due (or are locked) are ignored,
 * and a repeated id returns the first answer.
 */
export async function recordReviewSession(
  user: ReviewUser,
  input: ReviewSubmit,
  now = new Date(),
): Promise<ReviewXpGrant> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, xp: null, kind: null, reviewed: 0 };

  try {
    const existing = await supabase
      .from(XP_TABLE)
      .select("xp, clip_count")
      .eq("id", input.id)
      .maybeSingle();
    if (existing.error) fail(existing.error.message, "readReviewXp");
    if (existing.data) {
      const row = existing.data as { xp?: unknown; clip_count?: unknown };
      return {
        ready: true,
        xp: typeof row.xp === "number" ? row.xp : 0,
        kind: "repeat",
        reviewed: typeof row.clip_count === "number" ? row.clip_count : 0,
      };
    }

    const [states, levels] = await Promise.all([readStates(supabase, user.id), allowedLevels(user)]);
    const accepted = input.clips.filter((clip) => {
      const state = states.get(reviewKey(clip.lessonKey, clip.clipId));
      return (
        state !== undefined &&
        isReviewDue(state, now) &&
        isOpenClip(clip.lessonKey, clip.clipId, levels)
      );
    });
    if (accepted.length > 0) {
      await writeStates(supabase, user.id, applyReviewOutcomes(states, accepted, now));
    }

    const today = dayKey(now);
    const paid = await supabase
      .from(XP_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("day_key", today)
      .gt("xp", 0);
    if (paid.error) fail(paid.error.message, "countReviewXp");

    const decision = decideReviewXp({
      clipCount: accepted.length,
      elapsedMs: input.elapsedMs,
      paidToday: paid.count ?? 0,
    });
    const { error } = await supabase.from(XP_TABLE).insert({
      id: input.id,
      user_id: user.id,
      xp: decision.xp,
      clip_count: accepted.length,
      week_key: weekKey(now),
      day_key: today,
    });
    if (error) {
      if (error.code === "23505") {
        return { ready: true, xp: 0, kind: "repeat", reviewed: accepted.length };
      }
      fail(error.message, "insertReviewXp");
    }
    return { ready: true, xp: decision.xp, kind: decision.kind, reviewed: accepted.length };
  } catch (error) {
    if (!(error instanceof ReviewSchemaMissing)) console.error("recordReviewSession", error);
    return { ready: false, xp: null, kind: null, reviewed: 0 };
  }
}

/**
 * Drops review schedules, e.g. after an admin clears a lesson. `"all"` also
 * removes review XP (account deletion or a full reset).
 */
export async function forgetReviewItems(
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;
  backfilled.delete(userId);

  const items = supabase.from(ITEMS_TABLE).delete().eq("user_id", userId);
  const scoped = lessonKeys === "all" ? items : items.in("lesson_key", [...lessonKeys]);
  const { error } = await scoped;
  if (error && !isReviewSchemaMissing(error.message)) {
    throw new Error(`Could not delete review schedule (${error.message}).`);
  }
  if (lessonKeys !== "all") return;
  const xp = await supabase.from(XP_TABLE).delete().eq("user_id", userId);
  if (xp.error && !isReviewSchemaMissing(xp.error.message)) {
    throw new Error(`Could not delete review XP (${xp.error.message}).`);
  }
}
