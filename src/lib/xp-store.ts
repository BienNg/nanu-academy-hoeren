import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/admins";
import {
  buildClassProgress,
  emptyTotals,
  pointsByClass,
  totalsByUser,
  type BlitzrundeBoardExtras,
} from "@/lib/blitzrunde";
import { listRankedResults } from "@/lib/blitzrunde-store";
import type { ListeningRunInput } from "@/lib/listening-runs";
import { getChapterClips } from "@/lib/levels";
import { maxClipsPerPracticePart } from "@/lib/practice-deck";
import { listeningPartSize, splitStudyParts, studyPartCount, studyPartSize } from "@/lib/progress";
import { getSupabaseAdmin, readClassName } from "@/lib/progress-store";
import { isReviewSchemaMissing } from "@/lib/review";
import { isDuelSchemaMissing } from "@/lib/duels";
import {
  assembleLeaderboard,
  dayKey,
  decidePartXp,
  decideStudyPartXp,
  emptyLeaderboard,
  googleProfileImage,
  isStudyXpSchemaMissing,
  isXpSchemaMissing,
  leaderboardClassKey,
  leaderboardDisplayName,
  weekKey,
  type BoardPerson,
  type LeaderboardPayload,
  type LeaderboardRange,
  type LeaderboardScope,
  type StudyXpInput,
} from "@/lib/xp";

const XP_TABLE = "xp_awards";
const STUDY_XP_TABLE = "study_xp_awards";
const REVIEW_XP_TABLE = "review_xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const RUNS_TABLE = "listening_runs";
const PROFILES_TABLE = "user_progress";
const PAGE_SIZE = 1000;

export type XpGrant = {
  ready: boolean;
  xp: number | null;
  kind: string | null;
};

function lessonClipsForXp(lessonKey: string): { id: string; script: string; translationVi: string; sentenceOrder?: boolean }[] {
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
 * Full study passes already paid for this lesson. One pass is one award per
 * part. The part being scored is not stored yet. Null when the read fails.
 */
async function finishedStudyPasses(
  supabase: SupabaseClient,
  userId: string,
  lessonKey: string,
  partCount: number,
): Promise<number | null> {
  if (partCount < 1) return null;
  const { count, error } = await supabase
    .from(STUDY_XP_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lesson_key", lessonKey);
  if (error) {
    if (!isStudyXpSchemaMissing(error.message)) {
      console.error("Supabase finishedStudyPasses", error.message);
    }
    return null;
  }
  return Math.floor((count ?? 0) / partCount);
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

  const existing = await supabase
    .from(XP_TABLE)
    .select("xp, kind")
    .eq("run_id", input.id)
    .maybeSingle();
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

  const finishedPasses = await finishedListeningPasses(
    supabase,
    userId,
    input.lessonKey,
    input.id,
  );
  if (finishedPasses == null) return { ready: false, xp: null, kind: null };

  const lessonClips = lessonClipsForXp(input.lessonKey);
  const decision = decidePartXp({
    outcome: input.outcome,
    elapsedMs: input.elapsedMs,
    expectedCount: listeningPartSize(
      lessonClips.length,
      input.partNumber,
      input.partCount,
      maxClipsPerPracticePart(lessonClips),
    ),
    results: input.clips,
    lessonClips,
    finishedPasses,
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

  const existing = await supabase
    .from(STUDY_XP_TABLE)
    .select("xp")
    .eq("id", input.id)
    .maybeSingle();
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

  const lessonClips = lessonClipsForXp(input.lessonKey);
  const partCount = studyPartCount(lessonClips.length);
  const part = splitStudyParts(lessonClips)[input.partNumber - 1] ?? [];
  const matches =
    input.partCount === partCount &&
    sameClipSet(
      input.clipIds,
      part.map((clip) => clip.id),
    );
  const finishedPasses = matches
    ? await finishedStudyPasses(supabase, userId, input.lessonKey, partCount)
    : 0;
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

/** Study and review XP share a row shape: `xp`, `day_key`, `week_key`, keyed by `id`. */
function isSideXpSchemaMissing(message: string): boolean {
  return isStudyXpSchemaMissing(message) || isReviewSchemaMissing(message);
}

async function listUserStudyXp(
  supabase: SupabaseClient,
  userId: string,
  table: string = STUDY_XP_TABLE,
): Promise<{ xp: number; day_key: string; week_key: string }[]> {
  const rows: { xp: number; day_key: string; week_key: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isSideXpSchemaMissing(error.message)) {
        console.error("Supabase listUserStudyXp", table, error.message);
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
  table: string = STUDY_XP_TABLE,
): Promise<StudyAwardRow[]> {
  const rows: StudyAwardRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(table)
      .select("user_id, xp, created_at, day_key, week_key")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (range === "week") query = query.eq("week_key", weekKey(now));
    const { data, error } = await query;
    if (error) {
      if (!isSideXpSchemaMissing(error.message)) {
        console.error("Supabase listStudyAwardRows", table, error.message);
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

export async function getUserXpTotals(userId: string, now = new Date()): Promise<UserXpTotals> {
  const empty: UserXpTotals = { ready: false, today: 0, week: 0, total: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) return empty;

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
      return empty;
    }
    const page = (data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[];
    for (const row of page) {
      if (typeof row.xp !== "number" || typeof row.day_key !== "string" || typeof row.week_key !== "string") {
        continue;
      }
      rows.push({ xp: row.xp, day_key: row.day_key, week_key: row.week_key });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const duelRows = await listUserDuelXp(supabase, userId);
  const studyRows = [
    ...(await listUserStudyXp(supabase, userId)),
    ...(await listUserStudyXp(supabase, userId, REVIEW_XP_TABLE)),
  ];
  const todayKey = dayKey(now);
  const currentWeek = weekKey(now);
  let today = 0;
  let week = 0;
  let total = 0;
  for (const row of rows) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  for (const row of duelRows) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  for (const row of studyRows) {
    total += row.xp;
    if (row.day_key === todayKey) today += row.xp;
    if (row.week_key === currentWeek) week += row.xp;
  }
  return { ready: true, today, week, total };
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

/** Positive XP per learner for the range. Null means the XP table is unreadable. */
async function readXpTotals(
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
    await mergeStudyAwards(totals, await listStudyAwardRows(supabase, range, now));
    await mergeStudyAwards(totals, await listStudyAwardRows(supabase, range, now, REVIEW_XP_TABLE));
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
  await mergeStudyAwards(totals, await listStudyAwardRows(supabase, range, now));
  await mergeStudyAwards(totals, await listStudyAwardRows(supabase, range, now, REVIEW_XP_TABLE));
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

export async function getLeaderboard(input: {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
}): Promise<LeaderboardPayload> {
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return blank;

  const xpTotals = await readXpTotals(supabase, input.range, now);
  if (!xpTotals) return blank;

  const totals = new Map<string, { xp: number; reachedAt: string | null }>();
  for (const [userId, total] of xpTotals) totals.set(userId, { ...total });

  const duelTotals = await readDuelTotals(supabase, input.range, now);
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

  const profiles = await listBoardProfiles(supabase);
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

  return assembleLeaderboard({
    people,
    viewerId: input.viewerId,
    scope: input.scope,
    range: input.range,
    now,
  });
}

export async function getDuelLeaderboard(input: {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
}): Promise<LeaderboardPayload> {
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
    board: "duel",
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return blank;

  const totals = await readDuelTotals(supabase, input.range, now);
  if (totals === "missing") return blank;

  const profiles = await listBoardProfiles(supabase);
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

  return assembleLeaderboard({
    people,
    viewerId: input.viewerId,
    scope: input.scope,
    range: input.range,
    now,
    board: "duel",
  });
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
export async function getBlitzrundeLeaderboard(input: {
  viewerId: string;
  viewerImage?: string | null;
  scope: LeaderboardScope;
  range: LeaderboardRange;
  now?: Date;
}): Promise<LeaderboardPayload> {
  const now = input.now ?? new Date();
  const blank = emptyLeaderboard({
    scope: input.scope,
    range: input.range,
    now,
    ready: false,
    board: "blitzrunde",
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return blank;

  const all = await listRankedResults({ now });
  if (!all) return blank;
  const currentWeek = weekKey(now);
  const inRange = input.range === "week" ? all.filter((row) => row.weekKey === currentWeek) : all;

  const profiles = await listBoardProfiles(supabase);
  const classOf = new Map(
    profiles.map((row) => [row.user_id, leaderboardClassKey(readClassName(row.class_name))]),
  );
  const viewerClassKey = classOf.get(input.viewerId) ?? "";
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

  return {
    ...payload,
    blitzrunde: {
      yourSilver: yours.silver,
      yourBronze: yours.bronze,
      yourRounds: yours.rounds,
      yourByClass: pointsByClass(inRange, input.viewerId),
      progress,
    },
  };
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
