import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  isGrammarWorldRunSchemaMissing,
  type GrammarWorldLeftInput,
  type GrammarWorldLeftRow,
  type GrammarWorldLogStatus,
  type GrammarWorldMissRow,
  type GrammarWorldRunInput,
  type GrammarWorldRunOutcome,
  type GrammarWorldRunRow,
  type GrammarWorldStartInput,
} from "@/lib/grammar-world-runs";

const RUNS_TABLE = "grammar_world_runs";
const CARDS_TABLE = "grammar_world_cards";
const STARTS_TABLE = "grammar_world_starts";

/** Newest rows the admin page reads for one date range. */
const RANGE_LIMIT = 400;
const MISS_CHUNK = 80;

export class GrammarWorldRunSchemaError extends Error {
  constructor(message = "Grammar world runs are not set up") {
    super(message);
    this.name = "GrammarWorldRunSchemaError";
  }
}

function throwIfMissing(message: string): void {
  if (isGrammarWorldRunSchemaMissing(message)) throw new GrammarWorldRunSchemaError(message);
}

export async function insertGrammarWorldRun(userId: string, input: GrammarWorldRunInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");

  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .upsert(
      {
        id: input.id,
        user_id: userId,
        topic_id: input.topicId,
        node: input.node,
        part: input.part,
        review: input.review,
        outcome: input.outcome,
        accuracy: input.accuracy,
        answered_count: input.cards.length,
        card_count: input.cardCount,
        elapsed_ms: input.elapsedMs,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    throwIfMissing(error.message);
    throw new Error(`Supabase insertGrammarWorldRun: ${error.message}`);
  }
  if (!data || data.length === 0 || input.cards.length === 0) return;

  const { error: cardError } = await supabase.from(CARDS_TABLE).insert(
    input.cards.map((card) => ({
      run_id: input.id,
      user_id: userId,
      topic_id: input.topicId,
      card_key: card.key,
      kind: card.kind,
      position: card.position,
      missed: card.missed,
      answer: card.missed ? card.answer : "",
    })),
  );
  if (!cardError) return;

  const { error: rollbackError } = await supabase.from(RUNS_TABLE).delete().eq("id", input.id);
  if (rollbackError) console.error("Supabase insertGrammarWorldRun rollback", rollbackError.message);
  throwIfMissing(cardError.message);
  throw new Error(`Supabase insertGrammarWorldRun cards: ${cardError.message}`);
}

export async function insertGrammarWorldStart(userId: string, input: GrammarWorldStartInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  const { error } = await supabase.from(STARTS_TABLE).upsert(
    {
      id: input.id,
      user_id: userId,
      topic_id: input.topicId,
      node: input.node,
      part: input.part,
      review: input.review,
      card_count: input.cardCount,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    throwIfMissing(error.message);
    throw new Error(`Supabase insertGrammarWorldStart: ${error.message}`);
  }
}

export async function markGrammarWorldLeft(userId: string, input: GrammarWorldLeftInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  const { error } = await supabase
    .from(STARTS_TABLE)
    .update({ left_at: new Date().toISOString(), cards_done: input.cardsDone })
    .eq("id", input.id)
    .eq("user_id", userId)
    .is("left_at", null);
  if (error) {
    throwIfMissing(error.message);
    throw new Error(`Supabase markGrammarWorldLeft: ${error.message}`);
  }
}

/** Removes the practice log for one learner, or for the listed stages. */
export async function deleteGrammarWorldRuns(
  userId: string,
  topicIds: "all" | readonly string[],
): Promise<void> {
  if (topicIds !== "all" && topicIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  for (const table of [RUNS_TABLE, STARTS_TABLE]) {
    const query = supabase.from(table).delete().eq("user_id", userId);
    const scoped = topicIds === "all" ? query : query.in("topic_id", [...topicIds]);
    const { error } = await scoped;
    if (!error || isGrammarWorldRunSchemaMissing(error.message)) continue;
    throw new Error(`Could not delete grammar world runs (${error.message}).`);
  }
}

type RangeRead = {
  status: GrammarWorldLogStatus;
  runs: GrammarWorldRunRow[];
  left: GrammarWorldLeftRow[];
  misses: GrammarWorldMissRow[];
  capped: boolean;
};

function emptyRange(status: GrammarWorldLogStatus): RangeRead {
  return { status, runs: [], left: [], misses: [], capped: false };
}

function runFromRow(row: Record<string, unknown>): GrammarWorldRunRow | null {
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.topic_id !== "string") return null;
  if (row.outcome !== "success" && row.outcome !== "fail") return null;
  if (typeof row.created_at !== "string") return null;
  const node = Number(row.node);
  const part = Number(row.part);
  const accuracy = Number(row.accuracy);
  const answeredCount = Number(row.answered_count);
  const cardCount = Number(row.card_count);
  const elapsedMs = Number(row.elapsed_ms);
  if (![node, part, accuracy, answeredCount, cardCount, elapsedMs].every(Number.isFinite)) return null;
  return {
    id: row.id,
    userId: row.user_id,
    topicId: row.topic_id,
    node,
    part,
    review: row.review === true,
    outcome: row.outcome as GrammarWorldRunOutcome,
    accuracy,
    answeredCount,
    cardCount,
    elapsedMs,
    createdAt: row.created_at,
  };
}

function leftFromRow(row: Record<string, unknown>): GrammarWorldLeftRow | null {
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.topic_id !== "string") return null;
  if (typeof row.started_at !== "string") return null;
  const node = Number(row.node);
  const part = Number(row.part);
  const cardCount = Number(row.card_count);
  if (![node, part, cardCount].every(Number.isFinite)) return null;
  const cardsDone = row.cards_done == null ? null : Number(row.cards_done);
  return {
    id: row.id,
    userId: row.user_id,
    topicId: row.topic_id,
    node,
    part,
    review: row.review === true,
    cardCount,
    startedAt: row.started_at,
    leftAt: typeof row.left_at === "string" ? row.left_at : null,
    cardsDone: cardsDone != null && Number.isFinite(cardsDone) ? cardsDone : null,
  };
}

function missFromRow(row: Record<string, unknown>): GrammarWorldMissRow | null {
  if (typeof row.run_id !== "string" || typeof row.card_key !== "string" || typeof row.kind !== "string") return null;
  const position = Number(row.position);
  if (!Number.isFinite(position)) return null;
  return {
    runId: row.run_id,
    cardKey: row.card_key,
    kind: row.kind,
    position,
    answer: typeof row.answer === "string" ? row.answer : "",
  };
}

async function rangedRows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: "created_at" | "started_at",
  fromIso: string,
  toIso: string,
): Promise<{ missing: boolean; message: string | null; rows: Record<string, unknown>[]; capped: boolean }> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .gte(column, fromIso)
    .lt(column, toIso)
    .order(column, { ascending: false })
    .limit(RANGE_LIMIT);
  if (error) {
    return {
      missing: isGrammarWorldRunSchemaMissing(error.message),
      message: error.message,
      rows: [],
      capped: false,
    };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { missing: false, message: null, rows, capped: rows.length >= RANGE_LIMIT };
}

/**
 * Finished parts and leaves in `[fromIso, toIso)`, plus the missed cards of
 * those parts. Passed cards stay in the table and are not sent to the page.
 */
export async function listAdminGrammarWorldRuns(fromIso: string, toIso: string): Promise<RangeRead> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyRange("error");

  const [runRead, startRead] = await Promise.all([
    rangedRows(
      supabase,
      RUNS_TABLE,
      "id, user_id, topic_id, node, part, review, outcome, accuracy, answered_count, card_count, elapsed_ms, created_at",
      "created_at",
      fromIso,
      toIso,
    ),
    rangedRows(
      supabase,
      STARTS_TABLE,
      "id, user_id, topic_id, node, part, review, card_count, started_at, left_at, cards_done",
      "started_at",
      fromIso,
      toIso,
    ),
  ]);
  if (runRead.missing || startRead.missing) return emptyRange("missing");
  if (runRead.message || startRead.message) {
    console.error("Supabase listAdminGrammarWorldRuns", runRead.message ?? startRead.message);
    return emptyRange("error");
  }

  const runs = runRead.rows.flatMap((row) => {
    const parsed = runFromRow(row);
    return parsed ? [parsed] : [];
  });
  const finished = new Set(runs.map((run) => run.id));
  const droppedBefore = Date.now() - 10 * 60 * 1000;
  const left = startRead.rows.flatMap((row) => {
    const parsed = leftFromRow(row);
    if (!parsed || finished.has(parsed.id)) return [];
    const started = Date.parse(parsed.startedAt);
    if (parsed.leftAt == null && !(started < droppedBefore)) return [];
    return [parsed];
  });

  const missedIds = runs.filter((run) => run.outcome === "fail" || run.accuracy < 100).map((run) => run.id);
  const misses: GrammarWorldMissRow[] = [];
  for (let index = 0; index < missedIds.length; index += MISS_CHUNK) {
    const chunk = missedIds.slice(index, index + MISS_CHUNK);
    const { data, error } = await supabase
      .from(CARDS_TABLE)
      .select("run_id, card_key, kind, position, answer")
      .eq("missed", true)
      .in("run_id", chunk);
    if (error) {
      if (isGrammarWorldRunSchemaMissing(error.message)) return emptyRange("missing");
      console.error("Supabase listAdminGrammarWorldRuns cards", error.message);
      return emptyRange("error");
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const parsed = missFromRow(row);
      if (parsed) misses.push(parsed);
    }
  }

  return {
    status: "ready",
    runs,
    left,
    misses,
    capped: runRead.capped || startRead.capped,
  };
}
