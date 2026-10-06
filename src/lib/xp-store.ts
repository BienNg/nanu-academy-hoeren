import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import {
  buildClassProgress,
  emptyTotals,
  pointsByClass,
  totalsByUser,
  type BlitzrundeBoardExtras,
} from "@/lib/blitzrunde";
import { anyClassHasStartedBlitzrunde, classHasStartedBlitzrunde, listRankedResults } from "@/lib/blitzrunde-store";
import type { ListeningRunInput } from "@/lib/listening-runs";
import { getChapterClips } from "@/lib/levels";
import {
  buildJumpDeck,
  decideJumpXp,
  gradeJumpAnswers,
  isJumpXpSchemaMissing,
  jumpSeed,
  type LessonJumpInput,
} from "@/lib/lesson-jump";
import { getLivingClipsForLessonKey, getLivingWorkplaces } from "@/lib/living";
import { maxClipsPerPracticePart } from "@/lib/practice-deck";
import { practiceNodeLayout } from "@/lib/practice-node";
import {
  learnRunCount,
  listeningPartSize,
  splitStudyParts,
  studyPartCount,
  studyPartSize,
} from "@/lib/progress";
import {
  getCloudProgress,
  getSupabaseAdmin,
  getUserClassName,
  getUserStaff,
  livingAccessFrom,
  readClassName,
  readLevelAccess,
} from "@/lib/progress-store";
import { isDuelSchemaMissing } from "@/lib/duels";
import { listQuestClaimRows } from "@/lib/quest-store";
import {
  assembleLeaderboard,
  dayKey,
  decidePartXp,
  decideStudyPartXp,
  nodePracticeRunSize,
  passesAlreadyFinished,
  emptyLeaderboard,
  googleProfileImage,
  isStudyXpSchemaMissing,
  isXpSchemaMissing,
  boardClassFor,
  leaderboardClassKey,
  leaderboardClassOptions,
  leaderboardDisplayName,
  weekKey,
  type BoardPerson,
  type LeaderboardClassOption,
  type LeaderboardPayload,
  type LeaderboardRange,
  type LeaderboardScope,
  type StudyXpInput,
} from "@/lib/xp";

const XP_TABLE = "xp_awards";
const STUDY_XP_TABLE = "study_xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const JUMP_XP_TABLE = "lesson_jump_awards";
const RUNS_TABLE = "listening_runs";
const PROFILES_TABLE = "user_progress";
const PAGE_SIZE = 1000;

export type XpGrant = {
  ready: boolean;
  xp: number | null;
  kind: string | null;
};

type XpLessonClip = {
  id: string;
  script: string;
  translationVi: string;
  sentenceOrder?: boolean;
  answer?: string;
  replies?: { text: string; correct: boolean; whyVi?: string }[];
  imageUrl?: string;
};

/**
 * The lesson's clips with every field that changes how many cards a clip
 * becomes, so the part size checked here matches the one the browser dealt.
 */
function lessonClipsForXp(lessonKey: string): XpLessonClip[] {
  const living = getLivingClipsForLessonKey(lessonKey);
  if (living) {
    return living.map((clip) => ({
      id: clip.id,
      script: clip.script,
      translationVi: clip.translationVi,
      sentenceOrder: clip.sentenceOrder,
      ...(clip.answer ? { answer: clip.answer } : {}),
      ...(clip.replies ? { replies: clip.replies } : {}),
      ...(clip.imageUrl ? { imageUrl: clip.imageUrl } : {}),
    }));
  }
  const slash = lessonKey.indexOf("/");
  if (slash <= 0) return [];
  try {
    return getChapterClips(lessonKey.slice(0, slash), lessonKey.slice(slash + 1)).map(
      (clip) => ({
        id: clip.id,
        script: clip.script,
        translationVi: clip.translationVi,
        sentenceOrder: clip.sentenceOrder,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Full listening passes already stored for this lesson, excluding the run
 * being scored. A pass is one successful last part. Null when the read fails.
 */
async function finishedListeningPasses(
  supabase: SupabaseClient,
  userId: string,
  lessonKey: string,
  currentRunId: string,
): Promise<number | null> {
  let from = 0;
  let finished = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .select("id, part_number, part_count")
      .eq("user_id", userId)
      .eq("lesson_key", lessonKey)
      .eq("outcome", "success")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Supabase finishedListeningPasses", error.message);
      return null;
    }
    const page = (data ?? []) as {
      id?: unknown;
      part_number?: unknown;
      part_count?: unknown;
    }[];
    for (const row of page) {
      if (row.id === currentRunId) continue;
      if (typeof row.part_number === "number" && row.part_number === row.part_count) {
        finished += 1;
      }
    }
    if (page.length < PAGE_SIZE) return finished;
    from += PAGE_SIZE;
  }
}

/**
 * Earlier paid passes of one study part. Trail nodes replay one node at a
 * time, so passes are counted per part, not per lesson. The study split did
 * not change with nodes, so older awards still match their part. The part
 * being scored is not stored yet. Null when the read fails.
 */
async function finishedStudyPasses(
  supabase: SupabaseClient,
  userId: string,
  lessonKey: string,
  partNumber: number,
): Promise<number | null> {
  if (partNumber < 1) return null;
  const { count, error } = await supabase
    .from(STUDY_XP_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lesson_key", lessonKey)
    .eq("part_number", partNumber);
  if (error) {
    if (!isStudyXpSchemaMissing(error.message)) {
      console.error("Supabase finishedStudyPasses", error.message);
    }
    return null;
  }
  return count ?? 0;
}

/**
 * Earlier successful runs of one trail practice part, excluding the run being
 * scored. The part count is matched too, so a run saved under another part
 * layout of this lesson is not counted. Null when the read fails.
 */
async function finishedPracticePartRuns(
  supabase: SupabaseClient,
  userId: string,
  input: ListeningRunInput,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(RUNS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lesson_key", input.lessonKey)
    .eq("outcome", "success")
    .eq("part_number", input.partNumber)
    .eq("part_count", input.partCount)
    .neq("id", input.id);
  if (error) {
    console.error("Supabase finishedPracticePartRuns", error.message);
    return null;
  }
  return count ?? 0;
}

/** The chapter's clips with every field, so the cards dealt here match the browser's. */
function chapterClipsForLayout(lessonKey: string) {
  const slash = lessonKey.indexOf("/");
  if (slash <= 0) return [];
  try {
    return getChapterClips(lessonKey.slice(0, slash), lessonKey.slice(slash + 1));
  } catch {
    return [];
  }
}

type RunPass = { expectedCount: number | null; finishedPasses: number };

/**
 * Leben-in-Deutschland scenes keep one Practice node: parts follow the card
 * cap, and a pass is one finished last part of the scene.
 */
async function lessonPassForRun(
  supabase: SupabaseClient,
  userId: string,
  input: ListeningRunInput,
  lessonClips: readonly XpLessonClip[],
  chapterSlug: string,
): Promise<RunPass | null> {
  const [recordedFinishes, stored] = await Promise.all([
    finishedListeningPasses(supabase, userId, input.lessonKey, input.id),
    getCloudProgress(userId),
  ]);
  if (recordedFinishes == null) return null;
  return {
    expectedCount: listeningPartSize(
      lessonClips.length,
      input.partNumber,
      input.partCount,
      maxClipsPerPracticePart(lessonClips),
    ),
    finishedPasses: passesAlreadyFinished({
      partNumber: input.partNumber,
      partCount: input.partCount,
      storedRunCount: chapterSlug ? learnRunCount(stored, chapterSlug) : 0,
      recordedFinishes,
    }),
  };
}

/**
 * CEFR Lektionen practise one part of a trail node per run. Parts are cut from
 * the node's cards, so the server deals the same cards to check the run, and
 * a pass is counted per part.
 */
async function nodePassForRun(
  supabase: SupabaseClient,
  userId: string,
  input: ListeningRunInput,
): Promise<RunPass | null> {
  const finishedPasses = await finishedPracticePartRuns(supabase, userId, input);
  if (finishedPasses == null) return null;
  const parts = practiceNodeLayout(input.lessonKey, chapterClipsForLayout(input.lessonKey)).flat();
  return {
    expectedCount: nodePracticeRunSize({
      parts,
      partNumber: input.partNumber,
      partCount: input.partCount,
      runClipIds: input.clips.map((clip) => clip.clipId),
    }),
    finishedPasses,
  };
}

/**
 * Score one saved listening run and store ranked XP.
 * A missing xp_awards table leaves the run saved and reports ready: false.
 */
export async function grantXpForListeningRun(
  userId: string,
  input: ListeningRunInput,
  now = new Date(),
): Promise<XpGrant> {
  if (input.outcome === "fail") return { ready: true, xp: 0, kind: "fail" };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, xp: null, kind: null };

  const slash = input.lessonKey.indexOf("/");
  const chapterSlug = slash > 0 ? input.lessonKey.slice(slash + 1) : "";
  const lessonClips = lessonClipsForXp(input.lessonKey);
  // The pass reads exclude this run, so they start beside the lookup instead of after it.
  const [existing, pass] = await Promise.all([
    supabase.from(XP_TABLE).select("xp, kind").eq("run_id", input.id).maybeSingle(),
    getLivingClipsForLessonKey(input.lessonKey)
      ? lessonPassForRun(supabase, userId, input, lessonClips, chapterSlug)
      : nodePassForRun(supabase, userId, input),
  ]);
  if (existing.error) {
    if (!isXpSchemaMissing(existing.error.message)) {
      console.error("Supabase grantXp lookup", existing.error.message);
    }
    return { ready: false, xp: null, kind: null };
  }
  if (existing.data) {
    const row = existing.data as { xp?: unknown; kind?: unknown };
    return {
      ready: true,
      xp: typeof row.xp === "number" ? row.xp : 0,
      kind: typeof row.kind === "string" ? row.kind : null,
    };
  }

  if (!pass) return { ready: false, xp: null, kind: null };

  const decision = decidePartXp({
    outcome: input.outcome,
    elapsedMs: input.elapsedMs,
    expectedCount: pass.expectedCount,
    results: input.clips,
    lessonClips,
    finishedPasses: pass.finishedPasses,
    now,
  });
  if (!decision.store) return { ready: true, xp: decision.xp, kind: decision.kind };

  const { error } = await supabase.from(XP_TABLE).insert({
    run_id: input.id,
    user_id: userId,
    lesson_key: input.lessonKey,
    part_number: input.partNumber,
    xp: decision.xp,
    kind: decision.kind,
    week_key: decision.weekKey,
    day_key: decision.dayKey,
  });
  if (!error) return { ready: true, xp: decision.xp, kind: decision.kind };

  if (error.code === "23505") {
    const raced = await supabase
      .from(XP_TABLE)
      .select("xp, kind")
      .eq("run_id", input.id)
      .maybeSingle();
    if (raced.data) {
      const row = raced.data as { xp?: unknown; kind?: unknown };
      return {
        ready: true,
        xp: typeof row.xp === "number" ? row.xp : 0,
        kind: typeof row.kind === "string" ? row.kind : "repeat",
      };
    }
    return { ready: true, xp: 0, kind: "repeat" };
  }
  if (!isXpSchemaMissing(error.message)) {
    console.error("Supabase grantXp insert", error.message);
  }
  return { ready: false, xp: null, kind: null };
}

type StudyAwardRow = {
  user_id: string;
  xp: number;
  created_at: string;
  day_key: string;
  week_key: string;
};

function sameClipSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  if (seen.size !== left.length) return false;
  return right.every((id) => seen.has(id));
}

/**
 * Score one finished study part.
 * The first pass of the lesson pays 20 per part. Every later pass pays 10.
 * A missing study_xp_awards table leaves progress saved and reports ready: false.
 */
export async function grantStudyPartXp(
  userId: string,
  input: StudyXpInput,
  now = new Date(),
): Promise<XpGrant> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, xp: null, kind: null };

  const lessonClips = lessonClipsForXp(input.lessonKey);
  const partCount = studyPartCount(lessonClips.length);
  const part = splitStudyParts(lessonClips)[input.partNumber - 1] ?? [];
  const matches =
    input.partCount === partCount &&
    sameClipSet(
      input.clipIds,
      part.map((clip) => clip.id),
    );
  // This part is not stored yet, so its passes are counted beside the lookup.
  const [existing, finishedPasses] = await Promise.all([
    supabase.from(STUDY_XP_TABLE).select("xp").eq("id", input.id).maybeSingle(),
    matches
      ? finishedStudyPasses(supabase, userId, input.lessonKey, input.partNumber)
      : Promise.resolve(0),
  ]);
  if (existing.error) {
    if (!isStudyXpSchemaMissing(existing.error.message)) {
      console.error("Supabase grantStudyXp lookup", existing.error.message);
    }
    return { ready: false, xp: null, kind: null };
  }
  if (existing.data) {
    const row = existing.data as { xp?: unknown };
    return {
      ready: true,
      xp: typeof row.xp === "number" ? row.xp : 0,
      kind: "new",
    };
  }

  if (finishedPasses == null) return { ready: false, xp: null, kind: null };
  const decision = decideStudyPartXp({
    elapsedMs: input.elapsedMs,
    expectedCount: matches
      ? studyPartSize(lessonClips.length, input.partNumber, input.partCount)
      : null,
    clipCount: input.clipIds.length,
    finishedPasses,
    now,
  });
  if (!decision.store) return { ready: true, xp: decision.xp, kind: decision.kind };

  const { error } = await supabase.from(STUDY_XP_TABLE).insert({
    id: input.id,
    user_id: userId,
    lesson_key: input.lessonKey,
    part_number: input.partNumber,
    xp: decision.xp,
    week_key: decision.weekKey,
    day_key: decision.dayKey,
  });
  if (!error) return { ready: true, xp: decision.xp, kind: decision.kind };

  if (error.code === "23505") {
    const raced = await supabase
      .from(STUDY_XP_TABLE)
      .select("xp")
      .eq("id", input.id)
      .maybeSingle();
    if (raced.data) {
      const row = raced.data as { xp?: unknown };
      return {
        ready: true,
        xp: typeof row.xp === "number" ? row.xp : 0,
        kind: "new",
      };
    }
    return { ready: true, xp: 0, kind: "repeat" };
  }
  if (!isStudyXpSchemaMissing(error.message)) {
    console.error("Supabase grantStudyXp insert", error.message);
  }
  return { ready: false, xp: null, kind: null };
}

/**
 * Grade one jump test and store its 35 XP. The server deals the same seeded
 * deck, so only answers that pass it are paid. A missing lesson_jump_awards
 * table leaves progress saved and reports ready: false.
 */
export async function grantLessonJumpXp(
  userId: string,
  input: LessonJumpInput,
  now = new Date(),
): Promise<XpGrant> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, xp: null, kind: null };

  const [existing, stored] = await Promise.all([
    supabase
      .from(JUMP_XP_TABLE)
      .select("id, xp")
      .eq("user_id", userId)
      .eq("lesson_key", input.lessonKey)
      .maybeSingle(),
    getCloudProgress(userId),
  ]);
  if (existing.error) {
    if (!isJumpXpSchemaMissing(existing.error.message)) {
      console.error("Supabase grantJumpXp lookup", existing.error.message);
    }
    return { ready: false, xp: null, kind: null };
  }
  const award = existing.data as { id?: unknown; xp?: unknown } | null;
  // A retried submit of the same attempt reports the award it already got.
  if (award && award.id === input.id) {
    return { ready: true, xp: typeof award.xp === "number" ? award.xp : 0, kind: "new" };
  }

  const clips = chapterClipsForLayout(input.lessonKey);
  if (clips.length === 0) return { ready: true, xp: 0, kind: "rejected" };
  const deck = buildJumpDeck(clips, jumpSeed(input.lessonKey, input.id));
  const grade = gradeJumpAnswers(deck, input.answers);
  const slash = input.lessonKey.indexOf("/");
  const entry = stored.learn[input.lessonKey.slice(slash + 1)];
  const decision = decideJumpXp({
    grade,
    cardCount: deck.length,
    elapsedMs: input.elapsedMs,
    alreadyAwarded: Boolean(award),
    completedWithoutJump: Boolean(entry?.completedAt && !entry.skippedAt),
    now,
  });
  if (!decision.store) return { ready: true, xp: decision.xp, kind: decision.kind };

  const { error } = await supabase.from(JUMP_XP_TABLE).insert({
    id: input.id,
    user_id: userId,
    lesson_key: input.lessonKey,
    xp: decision.xp,
    week_key: decision.weekKey,
    day_key: decision.dayKey,
  });
  if (!error) return { ready: true, xp: decision.xp, kind: decision.kind };
  // Another attempt of this Lektion was paid first.
  if (error.code === "23505") return { ready: true, xp: 0, kind: "repeat" };
  if (!isJumpXpSchemaMissing(error.message)) {
    console.error("Supabase grantJumpXp insert", error.message);
  }
  return { ready: false, xp: null, kind: null };
}

/** One learner's jump XP. A missing table counts as none. */
async function listUserJumpXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ xp: number; day_key: string; week_key: string }[]> {
  const { data, error } = await supabase
    .from(JUMP_XP_TABLE)
    .select("xp, day_key, week_key")
    .eq("user_id", userId);
  if (error) {
    if (!isJumpXpSchemaMissing(error.message)) {
      console.error("Supabase listUserJumpXp", error.message);
    }
    return [];
  }
  return ((data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[]).flatMap(
    (row) =>
      typeof row.xp === "number" &&
      typeof row.day_key === "string" &&
      typeof row.week_key === "string"
        ? [{ xp: row.xp, day_key: row.day_key, week_key: row.week_key }]
        : [],
  );
}

/** Jump awards for the leaderboard range, shaped like study awards. */
async function listJumpAwardRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<StudyAwardRow[]> {
  const rows: StudyAwardRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(JUMP_XP_TABLE)
      .select("user_id, xp, created_at, day_key, week_key")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (!isJumpXpSchemaMissing(error.message)) {
        console.error("Supabase listJumpAwardRows", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      xp?: unknown;
      created_at?: unknown;
      day_key?: unknown;
      week_key?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.created_at !== "string" ||
        typeof row.day_key !== "string" ||
        typeof row.week_key !== "string"
      ) {
        continue;
      }
      rows.push({
        user_id: row.user_id,
        xp: row.xp,
        created_at: row.created_at,
        day_key: row.day_key,
        week_key: row.week_key,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listUserStudyXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ xp: number; day_key: string; week_key: string }[]> {
  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(STUDY_XP_TABLE)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isStudyXpSchemaMissing(error.message)) {
        console.error("Supabase listUserStudyXp", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listStudyAwardRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<StudyAwardRow[]> {
  const rows: StudyAwardRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(STUDY_XP_TABLE)
      .select("user_id, xp, created_at, day_key, week_key")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (!isStudyXpSchemaMissing(error.message)) {
        console.error("Supabase listStudyAwardRows", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      xp?: unknown;
      created_at?: unknown;
      day_key?: unknown;
      week_key?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.created_at !== "string" ||
        typeof row.day_key !== "string" ||
        typeof row.week_key !== "string"
      ) {
        continue;
      }
      rows.push({
        user_id: row.user_id,
        xp: row.xp,
        created_at: row.created_at,
        day_key: row.day_key,
        week_key: row.week_key,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

function mergeStudyAwards(totals: Map<string, XpTotal>, awards: readonly StudyAwardRow[]): void {
  for (const award of awards) {
    if (award.xp <= 0) continue;
    const current = totals.get(award.user_id) ?? { xp: 0, reachedAt: null };
    current.xp += award.xp;
    if (!current.reachedAt || award.created_at > current.reachedAt) {
      current.reachedAt = award.created_at;
    }
    totals.set(award.user_id, current);
  }
}

export type UserXpTotals = {
  ready: boolean;
  today: number;
  week: number;
  total: number;
};

/** One learner's listening XP rows. Null when the table is unreadable. */
async function listUserListeningXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ xp: number; day_key: string; week_key: string }[] | null> {
  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(XP_TABLE)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .order("run_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isXpSchemaMissing(error.message)) {
        console.error("Supabase getUserXpTotals", error.message);
      }
      return null;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

const USER_TOTALS_RPC = "user_xp_totals";

export async function getUserXpTotals(userId: string, now = new Date()): Promise<UserXpTotals> {
  const empty: UserXpTotals = { ready: false, today: 0, week: 0, total: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

  const todayKey = dayKey(now);
  const currentWeek = weekKey(now);
  const summed = await supabase
    .rpc(USER_TOTALS_RPC, { p_user_id: userId, p_day_key: todayKey, p_week_key: currentWeek })
    .maybeSingle();
  if (!summed.error && summed.data) {
    const row = summed.data as Record<string, unknown>;
    return {
      ready: true,
      today: readCount(row.today),
      week: readCount(row.week),
      total: readCount(row.total),
    };
  }
  if (summed.error) noteRpcFallback(USER_TOTALS_RPC, summed.error.message);

  const [rows, duelRows, studyRows, jumpRows, claimRows] = await Promise.all([
    listUserListeningXp(supabase, userId),
    listUserDuelXp(supabase, userId),
    listUserStudyXp(supabase, userId),
    listUserJumpXp(supabase, userId),
    listQuestClaimRows(supabase, null, userId),
  ]);
  if (!rows) return empty;
  let today = 0;
  let week = 0;
  let total = 0;
  for (const row of [...rows, ...duelRows, ...studyRows, ...jumpRows, ...claimRows]) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  return { ready: true, today, week, total };
}

/** The learner's all-time XP, for the completed screen. Null when unreadable. */
export async function readTotalXp(userId: string): Promise<number | null> {
  const totals = await getUserXpTotals(userId);
  return totals.ready ? totals.total : null;
}

type XpAwardSumRow = {
  user_id: string;
  xp: number;
  created_at: string;
};

type DuelAwardRow = XpAwardSumRow & {
  outcome: "win" | "loss" | "tie";
  day_key: string;
  week_key: string;
};

async function listUserDuelXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ xp: number; day_key: string; week_key: string }[]> {
  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(DUEL_XP_TABLE)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .order("duel_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isDuelSchemaMissing(error.message)) {
        console.error("Supabase listUserDuelXp", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listDuelXpRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<DuelAwardRow[] | "missing"> {
  const rows: DuelAwardRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(DUEL_XP_TABLE)
      .select("user_id, xp, outcome, created_at, day_key, week_key")
      .order("duel_id")
      .order("user_id")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (isDuelSchemaMissing(error.message)) return "missing";
      console.error("Supabase listDuelXpRows", error.message);
      return rows;
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      xp?: unknown;
      outcome?: unknown;
      created_at?: unknown;
      day_key?: unknown;
      week_key?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.created_at !== "string" ||
        typeof row.day_key !== "string" ||
        typeof row.week_key !== "string" ||
        (row.outcome !== "win" && row.outcome !== "loss" && row.outcome !== "tie")
      ) {
        continue;
      }
      rows.push({
        user_id: row.user_id,
        xp: row.xp,
        outcome: row.outcome,
        created_at: row.created_at,
        day_key: row.day_key,
        week_key: row.week_key,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function listXpAwardRows(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<XpAwardSumRow[] | null> {
  const rows: XpAwardSumRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(XP_TABLE)
      .select("user_id, xp, created_at")
      .order("run_id")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (!isXpSchemaMissing(error.message)) {
        console.error("Supabase listXpAwardRows", error.message);
      }
      return null;
    }
    const page = (data ?? []) as { user_id?: unknown; xp?: unknown; created_at?: unknown }[];
    for (const row of page) {
      if (typeof row.user_id !== "string" || typeof row.xp !== "number" || typeof row.created_at !== "string") {
        continue;
      }
      rows.push({ user_id: row.user_id, xp: row.xp, created_at: row.created_at });
    }
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

type BoardProfileRow = {
  user_id: string;
  name?: string | null;
  email?: string | null;
  class_name?: unknown;
  level_access?: unknown;
  deleted_at?: string | null;
  image?: string | null;
};

function boardImage(
  row: BoardProfileRow,
  viewerId: string,
  viewerImage: string | null | undefined,
): string | null {
  return (
    googleProfileImage(row.image) ??
    (row.user_id === viewerId ? googleProfileImage(viewerImage) : null)
  );
}

async function listBoardProfiles(supabase: SupabaseClient): Promise<BoardProfileRow[]> {
  const columnSets = [
    "user_id, name, email, class_name, level_access, deleted_at, image",
    "user_id, name, email, class_name, deleted_at, image",
    "user_id, name, email, class_name, deleted_at",
    "user_id, name, email, deleted_at",
  ];
  for (const columns of columnSets) {
    const rows: BoardProfileRow[] = [];
    let from = 0;
    let failed = false;
    for (;;) {
      const { data, error } = await supabase
        .from(PROFILES_TABLE)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        failed = true;
        break;
      }
      const page = (data ?? []) as unknown as BoardProfileRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows.filter((row) => !row.deleted_at);
      from += PAGE_SIZE;
    }
    if (!failed) return rows.filter((row) => !row.deleted_at);
  }
  console.error("Supabase listBoardProfiles", "every column set failed");
  return [];
}

type XpTotal = { xp: number; reachedAt: string | null };

type DuelTotal = XpTotal & {
  /** Latest award with xp > 0. The XP board ignores zero-XP losses. */
  positiveReachedAt: string | null;
  won: number;
  tied: number;
  lost: number;
};

const XP_TOTALS_RPC = "xp_leaderboard_totals";
const BOARD_TOTALS_RPC = "xp_board_totals";
const DUEL_TOTALS_RPC = "duel_xp_leaderboard_totals";
const loggedMissingRpc = new Set<string>();

function noteRpcFallback(name: string, message: string): void {
  if (loggedMissingRpc.has(name)) return;
  loggedMissingRpc.add(name);
  console.error(`${name}() unavailable, summing rows instead. Re-run the SQL in supabase/.`, message);
}

/** Pages through a totals RPC. Null means the function is missing or failed. */
async function readTotalsRpc(
  supabase: SupabaseClient,
  name: string,
  weekKeyFilter: string | null,
): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .rpc(name, { p_week_key: weekKeyFilter })
      .order("user_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      noteRpcFallback(name, error.message);
      return null;
    }
    const page = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

function readCount(value: unknown): number {
  const count = typeof value === "string" ? Number(value) : value;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function readStamp(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Positive listening XP per learner for the range. Null means the XP table is unreadable. */
async function readListeningTotals(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<Map<string, XpTotal> | null> {
  const totals = new Map<string, XpTotal>();
  const summed = await readTotalsRpc(
    supabase,
    XP_TOTALS_RPC,
    range === "week" ? weekKey(now) : null,
  );
  if (summed) {
    for (const row of summed) {
      if (typeof row.user_id !== "string") continue;
      const xp = readCount(row.xp);
      if (xp <= 0) continue;
      totals.set(row.user_id, { xp, reachedAt: readStamp(row.reached_at) });
    }
    return totals;
  }

  const awards = await listXpAwardRows(supabase, range, now);
  if (!awards) return null;
  for (const award of awards) {
    if (award.xp <= 0) continue;
    const current = totals.get(award.user_id) ?? { xp: 0, reachedAt: null };
    current.xp += award.xp;
    if (!current.reachedAt || award.created_at > current.reachedAt) {
      current.reachedAt = award.created_at;
    }
    totals.set(award.user_id, current);
  }
  return totals;
}

/** Positive XP per learner for the range. Null means the XP table is unreadable. */
async function readXpTotals(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<Map<string, XpTotal> | null> {
  const week = range === "week" ? weekKey(now) : null;
  const combined = await readTotalsRpc(supabase, BOARD_TOTALS_RPC, week);
  if (combined) {
    const totals = new Map<string, XpTotal>();
    for (const row of combined) {
      if (typeof row.user_id !== "string") continue;
      const xp = readCount(row.xp);
      if (xp <= 0) continue;
      totals.set(row.user_id, { xp, reachedAt: readStamp(row.reached_at) });
    }
    return totals;
  }

  const [totals, study, jumps, claims] = await Promise.all([
    readListeningTotals(supabase, range, now),
    listStudyAwardRows(supabase, range, now),
    listJumpAwardRows(supabase, range, now),
    listQuestClaimRows(supabase, week),
  ]);
  if (!totals) return null;
  mergeStudyAwards(totals, study);
  mergeStudyAwards(totals, jumps);
  mergeStudyAwards(totals, claims);
  return totals;
}

/** Duel XP and results per learner for the range. */
async function readDuelTotals(
  supabase: SupabaseClient,
  range: LeaderboardRange,
  now: Date,
): Promise<Map<string, DuelTotal> | "missing"> {
  const totals = new Map<string, DuelTotal>();
  const summed = await readTotalsRpc(
    supabase,
    DUEL_TOTALS_RPC,
    range === "week" ? weekKey(now) : null,
  );
  if (summed) {
    for (const row of summed) {
      if (typeof row.user_id !== "string") continue;
      totals.set(row.user_id, {
        xp: readCount(row.xp),
        reachedAt: readStamp(row.reached_at),
        positiveReachedAt: readStamp(row.positive_reached_at),
        won: readCount(row.won),
        tied: readCount(row.tied),
        lost: readCount(row.lost),
      });
    }
    return totals;
  }

  const awards = await listDuelXpRows(supabase, range, now);
  if (awards === "missing") return "missing";
  for (const award of awards) {
    const current = totals.get(award.user_id) ?? {
      xp: 0,
      reachedAt: null,
      positiveReachedAt: null,
      won: 0,
      tied: 0,
      lost: 0,
    };
    current.xp += award.xp;
    if (award.outcome === "win") current.won += 1;
    if (award.outcome === "tie") current.tied += 1;
    if (award.outcome === "loss") current.lost += 1;
    if (!current.reachedAt || award.created_at > current.reachedAt) {
      current.reachedAt = award.created_at;
    }
    if (
      award.xp > 0 &&
      (!current.positiveReachedAt || award.created_at > current.positiveReachedAt)
    ) {
      current.positiveReachedAt = award.created_at;
    }
    totals.set(award.user_id, current);
  }
  return totals;
}

/** Granted workplaces in catalog order, for the XP board's fallback class. */
function boardWorkplaces(row: BoardProfileRow): { slug: string; label: string }[] {
  const granted = livingAccessFrom(readLevelAccess(row.level_access));
  if (granted.length === 0) return [];
  return getLivingWorkplaces().filter((workplace) => granted.includes(workplace.slug));
}

type BoardQuery = {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
  /** Ignored unless the viewer is an admin or staff. */
  classKey?: string | null;
  canPickClass?: boolean;
};

/** Admins and staff may open any class board. Learners stay on their own class. */
export async function canPickLeaderboardClass(user: {
  id?: string | null;
  email?: string | null;
}): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (!user.id) return false;
  return getUserStaff(user.id);
}

function classChoice(
  people: readonly { classKey: string; className: string | null }[],
  input: { canPickClass?: boolean; classKey?: string | null },
): { options: LeaderboardClassOption[]; classKey: string; classLabel: string | null } {
  if (!input.canPickClass) return { options: [], classKey: "", classLabel: null };
  const options = leaderboardClassOptions(people);
  const key = leaderboardClassKey(input.classKey);
  const match = options.find((option) => option.key === key);
  if (!match) return { options, classKey: "", classLabel: null };
  return { options, classKey: match.key, classLabel: match.label };
}

async function markBlitzrundeTab(
  payload: LeaderboardPayload,
  ownClassName: Promise<string | null>,
  canPickClass: boolean,
): Promise<LeaderboardPayload> {
  const ownClass = leaderboardClassKey(await ownClassName);
  const classKey = payload.scope === "class" && payload.classKey ? payload.classKey : ownClass;
  let available = await classHasStartedBlitzrunde(classKey);
  if (!available && canPickClass) available = await anyClassHasStartedBlitzrunde();
  // Duels match within the viewer's own real class, never a picked or workplace board.
  return { ...payload, blitzrundeAvailable: available, duelAvailable: ownClass.length > 0 };
}

export async function getLeaderboard(input: BoardQuery): Promise<LeaderboardPayload> {
  // Read beside the board, so the tab check does not add a round trip.
  const ownClassName = getUserClassName(input.viewerId);
  const finish = (payload: LeaderboardPayload) =>
    markBlitzrundeTab(payload, ownClassName, input.canPickClass === true);
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return finish(blank);

  const [xpTotals, duelTotals, profiles] = await Promise.all([
    readXpTotals(supabase, input.range, now),
    readDuelTotals(supabase, input.range, now),
    listBoardProfiles(supabase),
  ]);
  if (!xpTotals) return finish(blank);

  const totals = new Map<string, { xp: number; reachedAt: string | null }>();
  for (const [userId, total] of xpTotals) totals.set(userId, { ...total });

  if (duelTotals !== "missing") {
    for (const [userId, duel] of duelTotals) {
      // Zero-XP duel losses do not place anyone on the XP board.
      if (duel.xp <= 0 || !duel.positiveReachedAt) continue;
      const current = totals.get(userId) ?? { xp: 0, reachedAt: null };
      current.xp += duel.xp;
      if (!current.reachedAt || duel.positiveReachedAt > current.reachedAt) {
        current.reachedAt = duel.positiveReachedAt;
      }
      totals.set(userId, current);
    }
  }

  const people: BoardPerson[] = profiles.map((row) => {
    const total = totals.get(row.user_id);
    const boardClass = boardClassFor(readClassName(row.class_name), boardWorkplaces(row));
    return {
      userId: row.user_id,
      name: leaderboardDisplayName(row.name),
      classKey: boardClass.classKey,
      className: boardClass.className,
      isAdmin: isAdminUser({
        id: row.user_id,
        email: typeof row.email === "string" ? row.email : null,
      }),
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      image: boardImage(row, input.viewerId, input.viewerImage),
    };
  });
  if (!people.some((person) => person.userId === input.viewerId)) {
    const total = totals.get(input.viewerId);
    people.push({
      userId: input.viewerId,
      name: "Học viên",
      classKey: "",
      className: null,
      isAdmin: false,
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      image: googleProfileImage(input.viewerImage),
    });
  }

  const choice = classChoice(people, input);
  return finish(
    assembleLeaderboard({
      people,
      viewerId: input.viewerId,
      scope: input.scope,
      range: input.range,
      now,
      classKey: choice.classKey || undefined,
      classLabel: choice.classLabel,
      classOptions: choice.options,
    }),
  );
}

export async function getDuelLeaderboard(input: BoardQuery): Promise<LeaderboardPayload> {
  // Read beside the board, so the tab check does not add a round trip.
  const ownClassName = getUserClassName(input.viewerId);
  const finish = (payload: LeaderboardPayload) =>
    markBlitzrundeTab(payload, ownClassName, input.canPickClass === true);
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
    board: "duel",
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return finish(blank);

  const [totals, profiles] = await Promise.all([
    readDuelTotals(supabase, input.range, now),
    listBoardProfiles(supabase),
  ]);
  if (totals === "missing") return finish(blank);

  const people: BoardPerson[] = profiles.map((row) => {
    const total = totals.get(row.user_id);
    const className = readClassName(row.class_name);
    return {
      userId: row.user_id,
      name: leaderboardDisplayName(row.name),
      classKey: leaderboardClassKey(className),
      className,
      isAdmin: isAdminUser({
        id: row.user_id,
        email: typeof row.email === "string" ? row.email : null,
      }),
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      won: total?.won ?? 0,
      tied: total?.tied ?? 0,
      lost: total?.lost ?? 0,
      image: boardImage(row, input.viewerId, input.viewerImage),
    };
  });
  if (!people.some((person) => person.userId === input.viewerId)) {
    const total = totals.get(input.viewerId);
    people.push({
      userId: input.viewerId,
      name: "Học viên",
      classKey: "",
      className: null,
      isAdmin: false,
      xp: total?.xp ?? 0,
      reachedAt: total?.reachedAt ?? null,
      won: total?.won ?? 0,
      tied: total?.tied ?? 0,
      lost: total?.lost ?? 0,
      image: googleProfileImage(input.viewerImage),
    });
  }

  const choice = classChoice(people, input);
  return finish(
    assembleLeaderboard({
      people,
      viewerId: input.viewerId,
      scope: input.scope,
      range: input.range,
      now,
      board: "duel",
      classKey: choice.classKey || undefined,
      classLabel: choice.classLabel,
      classOptions: choice.options,
    }),
  );
}

/**
 * Blitzrunde board: points from finished, ranked rounds (never XP). `xp` holds
 * the points, `won` / `silver` / `bronze` the placements, `rounds` how many
 * ranked rounds were played.
 *
 * Points stay with the class a round was played in. The class board counts
 * only rounds played in the viewer's current class: a student who moved in
 * starts from zero there, and one who moved out stays listed (as `former`)
 * with the points they earned here. The global board adds everything up.
 */
export async function getBlitzrundeLeaderboard(input: BoardQuery): Promise<LeaderboardPayload> {
  // Read beside the board, so the tab check does not add a round trip.
  const ownClassName = getUserClassName(input.viewerId);
  const finish = (payload: LeaderboardPayload) =>
    markBlitzrundeTab(payload, ownClassName, input.canPickClass === true);
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
    board: "blitzrunde",
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return finish(blank);

  const [all, profiles] = await Promise.all([
    listRankedResults({ now }),
    listBoardProfiles(supabase),
  ]);
  if (!all) return finish(blank);
  const currentWeek = weekKey(now);
  const inRange = input.range === "week" ? all.filter((row) => row.weekKey === currentWeek) : all;

  const classOf = new Map(
    profiles.map((row) => [row.user_id, leaderboardClassKey(readClassName(row.class_name))]),
  );
  const choice = classChoice(
    profiles.map((row) => {
      const className = readClassName(row.class_name);
      return { classKey: leaderboardClassKey(className), className };
    }),
    input,
  );
  const viewerClassKey = choice.classKey || classOf.get(input.viewerId) || "";
  const classScope = input.scope === "class" && viewerClassKey.length > 0;
  const counted = classScope ? inRange.filter((row) => row.classKey === viewerClassKey) : inRange;
  const totals = totalsByUser(counted);

  const toPerson = (row: (typeof profiles)[number]): BoardPerson => {
    const total = totals.get(row.user_id) ?? emptyTotals();
    const className = readClassName(row.class_name);
    const ownKey = leaderboardClassKey(className);
    const former = classScope && ownKey !== viewerClassKey;
    return {
      userId: row.user_id,
      name: leaderboardDisplayName(row.name),
      // On the class board, anyone who earned points in this class is ranked in it.
      classKey: classScope ? viewerClassKey : ownKey,
      className,
      isAdmin: isAdminUser({
        id: row.user_id,
        email: typeof row.email === "string" ? row.email : null,
      }),
      xp: total.points,
      reachedAt: total.lastAt,
      won: total.gold,
      silver: total.silver,
      bronze: total.bronze,
      rounds: total.rounds,
      former,
      image: boardImage(row, input.viewerId, input.viewerImage),
    };
  };
  const people: BoardPerson[] = profiles
    .filter((row) => !classScope || classOf.get(row.user_id) === viewerClassKey || totals.has(row.user_id))
    .map(toPerson);
  if (!people.some((person) => person.userId === input.viewerId)) {
    const total = totals.get(input.viewerId) ?? emptyTotals();
    people.push({
      userId: input.viewerId,
      name: "Học viên",
      classKey: "",
      className: null,
      isAdmin: false,
      xp: total.points,
      reachedAt: total.lastAt,
      won: total.gold,
      silver: total.silver,
      bronze: total.bronze,
      rounds: total.rounds,
      image: googleProfileImage(input.viewerImage),
    });
  }

  const payload = assembleLeaderboard({
    people,
    viewerId: input.viewerId,
    scope: input.scope,
    range: input.range,
    now,
    board: "blitzrunde",
    classKey: choice.classKey || undefined,
    classLabel: choice.classLabel,
    classOptions: choice.options,
  });

  const yours = totals.get(input.viewerId) ?? emptyTotals();
  let progress: BlitzrundeBoardExtras["progress"] = null;
  if (viewerClassKey) {
    const members = new Set(
      profiles.filter((row) => classOf.get(row.user_id) === viewerClassKey).map((row) => row.user_id),
    );
    const built = buildClassProgress(all, viewerClassKey, members);
    if (built) {
      // Classmates' account ids never leave the server; the chart only needs a stable key per line.
      const nameById = new Map(profiles.map((row) => [row.user_id, leaderboardDisplayName(row.name)]));
      const names: Record<string, string> = {};
      let youId = "";
      const series = built.series.map((line, index) => {
        const key = `s${index}`;
        names[key] = nameById.get(line.userId) ?? leaderboardDisplayName(null);
        if (line.userId === input.viewerId) youId = key;
        return { ...line, userId: key };
      });
      progress = { ...built, series, names, youId };
    }
  }

  return finish({
    ...payload,
    blitzrunde: {
      yourSilver: yours.silver,
      yourBronze: yours.bronze,
      yourRounds: yours.rounds,
      yourByClass: pointsByClass(inRange, input.viewerId),
      progress,
    },
  });
}

export type AdminListeningXpRow = {
  userId: string;
  xp: number;
  kind: "new" | "review";
  lessonKey: string;
  dayKey: string;
};

export type AdminDuelXpRow = {
  userId: string;
  xp: number;
  dayKey: string;
};

export type AdminXpRead<T> = {
  ready: boolean;
  rows: T[];
};

async function listPagedXpRows<T>(
  table: string,
  columns: string,
  fromDay: string,
  toDay: string,
  parse: (row: Record<string, unknown>) => T | null,
  onMissing: (message: string) => boolean,
  logLabel: string,
): Promise<AdminXpRead<T>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, rows: [] };

  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte("day_key", fromDay)
      .lte("day_key", toDay)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!onMissing(error.message)) {
        console.error(logLabel, error.message);
      }
      return { ready: false, rows: [] };
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      const parsed = parse(row);
      if (parsed) rows.push(parsed);
    }
    if (page.length < PAGE_SIZE) return { ready: true, rows };
    from += PAGE_SIZE;
  }
}

function rpcCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function readUserCounts(
  supabase: SupabaseClient,
  name: string,
  args: { p_from: string; p_to: string },
  field: "parts" | "xp",
): Promise<{ userId: string; count: number }[] | null> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      noteRpcFallback(name, error.message);
    } else {
      console.error(`Supabase ${name}`, error.message);
    }
    return null;
  }
  const rows: { userId: string; count: number }[] = [];
  for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
    if (typeof row.user_id !== "string") continue;
    rows.push({ userId: row.user_id, count: rpcCount(row[field]) });
  }
  return rows;
}

/** Listening plus duel XP in `[fromDay, toDay]`, summed per learner. */
export async function sumAdminRangeXp(
  fromDay: string,
  toDay: string,
): Promise<{ ready: boolean; byUser: Record<string, number> }> {
  const supabase = getSupabaseAdmin();
  const byUser: Record<string, number> = {};
  if (!supabase) return { ready: false, byUser };
  const grouped = await readUserCounts(
    supabase,
    "admin_xp_by_user",
    { p_from: fromDay, p_to: toDay },
    "xp",
  );
  if (grouped) {
    for (const row of grouped) byUser[row.userId] = row.count;
    return { ready: true, byUser };
  }

  const [listening, duels] = await Promise.all([
    listAdminListeningXp(fromDay, toDay),
    listAdminDuelXp(fromDay, toDay),
  ]);
  if (!listening.ready || !duels.ready) return { ready: false, byUser };
  for (const row of listening.rows) byUser[row.userId] = (byUser[row.userId] ?? 0) + row.xp;
  for (const row of duels.rows) byUser[row.userId] = (byUser[row.userId] ?? 0) + row.xp;
  return { ready: true, byUser };
}

/** Finished study parts on Vietnam `day_key`s in `[fromDay, toDay]`, for the given students. */
export async function countAdminStudyParts(
  fromDay: string,
  toDay: string,
  learnerIds: ReadonlySet<string>,
): Promise<{ ready: boolean; count: number; byUser: Record<string, number> }> {
  const supabase = getSupabaseAdmin();
  const byUser: Record<string, number> = {};
  if (!supabase) return { ready: false, count: 0, byUser };
  if (learnerIds.size === 0) return { ready: true, count: 0, byUser };

  const grouped = await readUserCounts(
    supabase,
    "admin_study_part_counts",
    { p_from: fromDay, p_to: toDay },
    "parts",
  );
  if (grouped) {
    let count = 0;
    for (const row of grouped) {
      if (!learnerIds.has(row.userId)) continue;
      byUser[row.userId] = row.count;
      count += row.count;
    }
    return { ready: true, count, byUser };
  }

  let count = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(STUDY_XP_TABLE)
      .select("user_id")
      .gte("day_key", fromDay)
      .lte("day_key", toDay)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isStudyXpSchemaMissing(error.message)) {
        console.error("Supabase countAdminStudyParts", error.message);
      }
      return { ready: false, count: 0, byUser };
    }
    const page = (data ?? []) as { user_id?: unknown }[];
    for (const row of page) {
      if (typeof row.user_id !== "string" || !learnerIds.has(row.user_id)) continue;
      count += 1;
      byUser[row.user_id] = (byUser[row.user_id] ?? 0) + 1;
    }
    if (page.length < PAGE_SIZE) return { ready: true, count, byUser };
    from += PAGE_SIZE;
  }
}

/** Listening XP awarded in `[fromDay, toDay]` Vietnam calendar days. */
export function listAdminListeningXp(
  fromDay: string,
  toDay: string,
): Promise<AdminXpRead<AdminListeningXpRow>> {
  return listPagedXpRows(
    XP_TABLE,
    "user_id, xp, kind, lesson_key, day_key",
    fromDay,
    toDay,
    (row) => {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.lesson_key !== "string" ||
        typeof row.day_key !== "string" ||
        (row.kind !== "new" && row.kind !== "review")
      ) {
        return null;
      }
      return {
        userId: row.user_id,
        xp: row.xp,
        kind: row.kind,
        lessonKey: row.lesson_key,
        dayKey: row.day_key,
      };
    },
    isXpSchemaMissing,
    "Supabase listAdminListeningXp",
  );
}

/** Duel XP awarded in `[fromDay, toDay]` Vietnam calendar days. */
export function listAdminDuelXp(
  fromDay: string,
  toDay: string,
): Promise<AdminXpRead<AdminDuelXpRow>> {
  return listPagedXpRows(
    DUEL_XP_TABLE,
    "user_id, xp, day_key",
    fromDay,
    toDay,
    (row) => {
      if (
        typeof row.user_id !== "string" ||
        typeof row.xp !== "number" ||
        typeof row.day_key !== "string"
      ) {
        return null;
      }
      return { userId: row.user_id, xp: row.xp, dayKey: row.day_key };
    },
    isDuelSchemaMissing,
    "Supabase listAdminDuelXp",
  );
}
