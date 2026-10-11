import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/progress-store";
import type {
  DifficultyCohort,
  DifficultyReadStatus,
  DifficultyRun,
  DifficultyStart,
  PartChange,
  PartClipOutcome,
  PartLeftInput,
  PartStartInput,
} from "@/lib/part-difficulty";

/** Tables from supabase/part_difficulty.sql. Writes use the service role key. */
const STARTS_TABLE = "practice_part_starts";
const COHORTS_TABLE = "difficulty_cohorts";
const CHANGES_TABLE = "part_changes";
const CLIP_OUTCOMES_RPC = "part_clip_outcomes";
const RUNS_TABLE = "listening_runs";

const PAGE_SIZE = 1000;

export const PART_DIFFICULTY_SCHEMA_HINT =
  "Run supabase/part_difficulty.sql in the Supabase SQL editor to track part starts, cohorts, and content changes.";

export class PartDifficultySchemaError extends Error {
  constructor(message = "Part difficulty storage is not set up") {
    super(message);
    this.name = "PartDifficultySchemaError";
  }
}

function isMissing(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

function failure(name: string, message: string): DifficultyReadStatus {
  if (isMissing(message)) return "missing";
  console.error(`Supabase ${name}`, message);
  return "error";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function stamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/* ------------------------------------------------------------------ */
/* Learner writes                                                      */
/* ------------------------------------------------------------------ */

/** Logs an opened practice part. A repeated id is ignored. */
export async function insertPartStart(userId: string, input: PartStartInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from(STARTS_TABLE).upsert(
    {
      id: input.id,
      user_id: userId,
      lesson_key: input.lessonKey,
      part_number: input.partNumber,
      part_count: input.partCount,
      card_count: input.cardCount,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (!error) return;
  if (isMissing(error.message)) throw new PartDifficultySchemaError(error.message);
  throw new Error(error.message);
}

/** Stamps where the learner left. Only their own, still-open start. */
export async function markPartLeft(userId: string, input: PartLeftInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data, error } = await supabase
    .from(STARTS_TABLE)
    .select("card_count")
    .eq("id", input.id)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (error) {
    if (isMissing(error.message)) throw new PartDifficultySchemaError(error.message);
    throw new Error(error.message);
  }
  if (!data) return;
  const cards = count((data as { card_count?: unknown }).card_count);
  const update = await supabase
    .from(STARTS_TABLE)
    .update({ left_at: new Date().toISOString(), cards_done: Math.min(input.cardsDone, cards) })
    .eq("id", input.id)
    .eq("user_id", userId)
    .is("left_at", null);
  if (update.error) throw new Error(update.error.message);
}

/* ------------------------------------------------------------------ */
/* Admin reads                                                         */
/* ------------------------------------------------------------------ */

type RunRow = {
  id?: unknown;
  user_id?: unknown;
  lesson_key?: unknown;
  part_number?: unknown;
  part_count?: unknown;
  outcome?: unknown;
  accuracy?: unknown;
  clip_count?: unknown;
  card_count?: unknown;
  elapsed_ms?: unknown;
  created_at?: unknown;
};

function runFromRow(row: RunRow): DifficultyRun | null {
  const at = stamp(row.created_at);
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.lesson_key !== "string") {
    return null;
  }
  if (typeof row.part_number !== "number" || at == null) return null;
  const cards = count(row.card_count) || count(row.clip_count);
  return {
    id: row.id.toLowerCase(),
    userId: row.user_id,
    lessonKey: row.lesson_key,
    partNumber: row.part_number,
    partCount: count(row.part_count) || row.part_number,
    passed: row.outcome === "success",
    accuracy: Math.min(100, count(row.accuracy)),
    cards,
    elapsedMs: count(row.elapsed_ms),
    at,
  };
}

async function readPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  map: (row: unknown) => T | null,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    for (const raw of page) {
      const row = map(raw);
      if (row) rows.push(row);
    }
    if (page.length < PAGE_SIZE) return { rows, error: null };
  }
}

/** Every ended practice part of these students, for first-pass journeys. */
export async function listDifficultyRuns(
  learnerIds: ReadonlySet<string>,
): Promise<{ status: DifficultyReadStatus; runs: DifficultyRun[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", runs: [] };
  if (learnerIds.size === 0) return { status: "ready", runs: [] };

  const base =
    "id, user_id, lesson_key, part_number, part_count, outcome, accuracy, clip_count, elapsed_ms, created_at";
  const read = (columns: string) =>
    readPages(
      (from, to) => supabase.from(RUNS_TABLE).select(columns).order("id").range(from, to),
      (raw) => {
        const run = runFromRow(raw as RunRow);
        return run && learnerIds.has(run.userId) ? run : null;
      },
    );
  let result = await read(`${base}, card_count`);
  // card_count arrives with clip_result_kinds.sql. Older projects fall back to clips.
  if (result.error && /card_count/.test(result.error)) result = await read(base);
  if (result.error) return { status: failure("listDifficultyRuns", result.error), runs: [] };
  return { status: "ready", runs: result.rows };
}

export async function listPartStarts(
  learnerIds: ReadonlySet<string>,
): Promise<{ status: DifficultyReadStatus; starts: DifficultyStart[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", starts: [] };
  if (learnerIds.size === 0) return { status: "ready", starts: [] };

  const result = await readPages(
    (from, to) =>
      supabase
        .from(STARTS_TABLE)
        .select("id, user_id, lesson_key, part_number, card_count, started_at, cards_done")
        .order("id")
        .range(from, to),
    (raw) => {
      const row = raw as Record<string, unknown>;
      const at = stamp(row.started_at);
      if (typeof row.id !== "string" || typeof row.user_id !== "string") return null;
      if (!learnerIds.has(row.user_id)) return null;
      if (typeof row.lesson_key !== "string" || typeof row.part_number !== "number" || at == null) {
        return null;
      }
      return {
        id: row.id.toLowerCase(),
        userId: row.user_id,
        lessonKey: row.lesson_key,
        partNumber: row.part_number,
        cardCount: count(row.card_count),
        at,
        cardsDone: typeof row.cards_done === "number" ? row.cards_done : null,
      } satisfies DifficultyStart;
    },
  );
  if (result.error) return { status: failure("listPartStarts", result.error), starts: [] };
  return { status: "ready", starts: result.rows };
}

export async function listPartClipOutcomes(
  learnerIds: ReadonlySet<string>,
): Promise<{ status: DifficultyReadStatus; clips: PartClipOutcome[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", clips: [] };
  if (learnerIds.size === 0) return { status: "ready", clips: [] };

  const ids = [...learnerIds];
  const result = await readPages(
    (from, to) =>
      (supabase as SupabaseClient)
        .rpc(CLIP_OUTCOMES_RPC, { p_user_ids: ids })
        .order("lesson_key")
        .order("part_number")
        .order("clip_id")
        .range(from, to),
    (raw) => {
      const row = raw as Record<string, unknown>;
      if (typeof row.lesson_key !== "string" || typeof row.clip_id !== "string") return null;
      const partNumber = count(row.part_number);
      if (partNumber < 1) return null;
      return {
        lessonKey: row.lesson_key,
        partNumber,
        clipId: row.clip_id,
        answers: count(row.answers),
        misses: count(row.misses),
        students: count(row.students),
      } satisfies PartClipOutcome;
    },
  );
  if (result.error) return { status: failure("listPartClipOutcomes", result.error), clips: [] };
  return { status: "ready", clips: result.rows };
}

/* ------------------------------------------------------------------ */
/* Cohorts                                                             */
/* ------------------------------------------------------------------ */

function cohortFromRow(row: Record<string, unknown>): DifficultyCohort | null {
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  const classes = Array.isArray(row.classes)
    ? row.classes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return { id, name, classes, updatedAt: text(row.updated_at) };
}

export async function listDifficultyCohorts(): Promise<{
  status: DifficultyReadStatus;
  cohorts: DifficultyCohort[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", cohorts: [] };
  const { data, error } = await supabase
    .from(COHORTS_TABLE)
    .select("id, name, classes, updated_at")
    .order("name");
  if (error) return { status: failure("listDifficultyCohorts", error.message), cohorts: [] };
  const cohorts = (data ?? [])
    .map((row) => cohortFromRow(row as Record<string, unknown>))
    .filter((row): row is DifficultyCohort => row != null);
  return { status: "ready", cohorts };
}

export async function saveDifficultyCohortRow(
  input: { id: string | null; name: string; classes: string[] },
  actor: string,
): Promise<DifficultyCohort> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const values = { name: input.name, classes: input.classes, updated_at: new Date().toISOString() };
  const query = input.id
    ? supabase.from(COHORTS_TABLE).update(values).eq("id", input.id)
    : supabase.from(COHORTS_TABLE).insert({ ...values, created_by: actor });
  const { data, error } = await query.select("id, name, classes, updated_at").single();
  if (error) {
    if (isMissing(error.message)) throw new PartDifficultySchemaError(error.message);
    if (/duplicate key|difficulty_cohorts_name_key/i.test(error.message)) {
      throw new Error("A cohort with this name already exists.");
    }
    throw new Error(error.message);
  }
  const cohort = cohortFromRow(data as Record<string, unknown>);
  if (!cohort) throw new Error("The saved cohort could not be read back.");
  return cohort;
}

export async function deleteDifficultyCohortRow(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const { error } = await supabase.from(COHORTS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Change markers                                                      */
/* ------------------------------------------------------------------ */

function changeFromRow(row: Record<string, unknown>): PartChange | null {
  const id = text(row.id);
  const lessonKey = text(row.lesson_key);
  const changedOn = typeof row.changed_on === "string" ? row.changed_on.slice(0, 10) : null;
  if (!id || !lessonKey || !changedOn || typeof row.part_number !== "number") return null;
  return {
    id,
    lessonKey,
    partNumber: row.part_number,
    changedOn,
    note: typeof row.note === "string" ? row.note : "",
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
  };
}

const CHANGE_COLUMNS = "id, lesson_key, part_number, changed_on, note, created_by, created_at";

export async function listPartChanges(): Promise<{ status: DifficultyReadStatus; changes: PartChange[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", changes: [] };
  const { data, error } = await supabase
    .from(CHANGES_TABLE)
    .select(CHANGE_COLUMNS)
    .order("changed_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { status: failure("listPartChanges", error.message), changes: [] };
  const changes = (data ?? [])
    .map((row) => changeFromRow(row as Record<string, unknown>))
    .filter((row): row is PartChange => row != null);
  return { status: "ready", changes };
}

export async function insertPartChangeRow(
  input: { lessonKey: string; partNumber: number; changedOn: string; note: string },
  actor: string,
): Promise<PartChange> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const { data, error } = await supabase
    .from(CHANGES_TABLE)
    .insert({
      lesson_key: input.lessonKey,
      part_number: input.partNumber,
      changed_on: input.changedOn,
      note: input.note,
      created_by: actor,
    })
    .select(CHANGE_COLUMNS)
    .single();
  if (error) {
    if (isMissing(error.message)) throw new PartDifficultySchemaError(error.message);
    throw new Error(error.message);
  }
  const change = changeFromRow(data as Record<string, unknown>);
  if (!change) throw new Error("The saved change could not be read back.");
  return change;
}

export async function deletePartChangeRow(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const { error } = await supabase.from(CHANGES_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
