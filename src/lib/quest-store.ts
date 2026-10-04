import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  claimsToCreate,
  evaluateQuests,
  eventsBefore,
  MAX_QUEST_XP,
  pickDailyQuests,
  questDay,
  QUEST_BONUS_ID,
  QUEST_BONUS_XP,
  NO_QUEST_UPDATE,
  type QuestEventDelta,
  type QuestEvents,
  type QuestProgress,
  type QuestStep,
  type QuestUpdate,
  zonedDayRange,
} from "@/lib/quests";
import type { AdminQuestClaimRow } from "@/lib/admin-quests";
import { weekKey } from "@/lib/xp";

const CLAIMS_TABLE = "quest_claims";
const XP_TABLE = "xp_awards";
const STUDY_XP_TABLE = "study_xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const RUNS_TABLE = "listening_runs";
const PAGE_SIZE = 1000;

export const QUEST_SCHEMA_HINT =
  "Run supabase/quest_claims.sql once in the Supabase SQL editor.";

export function isQuestSchemaMissing(message: string): boolean {
  return (
    /quest_claims/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export type QuestBoard = {
  /** False when the quest table is missing or the store is not configured. */
  ready: boolean;
  dayKey: string;
  quests: QuestProgress[];
  bonus: { xp: number; claimed: boolean };
  /** Quest XP stored today, bonus included. */
  earnedXp: number;
  maxXp: number;
};

function emptyBoard(day: string, ready: boolean): QuestBoard {
  return {
    ready,
    dayKey: day,
    quests: [],
    bonus: { xp: QUEST_BONUS_XP, claimed: false },
    earnedXp: 0,
    maxXp: MAX_QUEST_XP,
  };
}

async function readEvents(
  supabase: SupabaseClient,
  userId: string,
  range: { start: string; end: string },
): Promise<QuestEvents | null> {
  // The learner's local day, so rows are matched by time and not by the
  // Vietnam day_key the XP tables store.
  const inDay = <T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
    query: T,
  ) => query.gte("created_at", range.start).lt("created_at", range.end);
  const [listening, study, duels] = await Promise.all([
    inDay(supabase.from(XP_TABLE).select("run_id, xp").eq("user_id", userId)),
    inDay(supabase.from(STUDY_XP_TABLE).select("xp").eq("user_id", userId)),
    inDay(supabase.from(DUEL_XP_TABLE).select("xp").eq("user_id", userId)),
  ]);
  if (listening.error || study.error) {
    const message = (listening.error ?? study.error)!.message;
    console.error("Supabase quest events", message);
    return null;
  }
  // Duels are optional. A project without them still has quests.
  const duelRows = duels.error ? [] : ((duels.data ?? []) as { xp?: unknown }[]);

  const awards = ((listening.data ?? []) as { run_id?: unknown; xp?: unknown }[]).filter(
    (row): row is { run_id: string; xp: number } =>
      typeof row.run_id === "string" && typeof row.xp === "number",
  );
  const studyRows = ((study.data ?? []) as { xp?: unknown }[]).filter(
    (row): row is { xp: number } => typeof row.xp === "number",
  );

  const paying = awards.filter((award) => award.xp > 0);
  const accuracyByRun = new Map<string, number>();
  if (paying.length > 0) {
    const runs = await supabase
      .from(RUNS_TABLE)
      .select("id, accuracy")
      .in(
        "id",
        paying.map((award) => award.run_id),
      );
    if (runs.error) {
      console.error("Supabase quest runs", runs.error.message);
      return null;
    }
    for (const run of (runs.data ?? []) as { id?: unknown; accuracy?: unknown }[]) {
      if (typeof run.id === "string" && typeof run.accuracy === "number") {
        accuracyByRun.set(run.id, run.accuracy);
      }
    }
  }

  const sum = (rows: readonly { xp?: unknown }[]) =>
    rows.reduce((total, row) => total + (typeof row.xp === "number" ? row.xp : 0), 0);

  return {
    listeningAccuracies: paying.map((award) => accuracyByRun.get(award.run_id) ?? 0),
    studyParts: studyRows.filter((row) => row.xp > 0).length,
    baseXp: sum(awards) + sum(studyRows) + sum(duelRows),
  };
}

async function readClaims(
  supabase: SupabaseClient,
  userId: string,
  day: string,
): Promise<Map<string, number> | "missing" | null> {
  const { data, error } = await supabase
    .from(CLAIMS_TABLE)
    .select("quest_id, xp")
    .eq("user_id", userId)
    .eq("day_key", day);
  if (error) {
    if (isQuestSchemaMissing(error.message)) return "missing";
    console.error("Supabase quest claims", error.message);
    return null;
  }
  const claims = new Map<string, number>();
  for (const row of (data ?? []) as { quest_id?: unknown; xp?: unknown }[]) {
    if (typeof row.quest_id === "string" && typeof row.xp === "number") {
      claims.set(row.quest_id, row.xp);
    }
  }
  return claims;
}

function boardFrom(
  day: string,
  progress: QuestProgress[],
  claims: ReadonlyMap<string, number>,
): QuestBoard {
  let earnedXp = 0;
  for (const xp of claims.values()) earnedXp += xp;
  return {
    ready: true,
    dayKey: day,
    quests: progress,
    bonus: { xp: QUEST_BONUS_XP, claimed: claims.has(QUEST_BONUS_ID) },
    earnedXp,
    maxXp: MAX_QUEST_XP,
  };
}

/**
 * Counts today's progress, stores XP for quests that just finished, and
 * returns the board. Safe to call any time. A quest pays once per local day
 * in `zone`. `latest` is the part that triggered the sync, so the update can
 * say how far each quest moved.
 */
export async function syncQuests(
  userId: string,
  zone: string,
  now = new Date(),
  latest: QuestEventDelta | null = null,
): Promise<{ board: QuestBoard; update: QuestUpdate }> {
  const day = questDay(now, zone);
  const supabase = getSupabaseAdmin();
  if (!supabase) return { board: emptyBoard(day, false), update: NO_QUEST_UPDATE };

  const claims = await readClaims(supabase, userId, day);
  if (claims === "missing" || claims === null) {
    return { board: emptyBoard(day, false), update: NO_QUEST_UPDATE };
  }
  const events = await readEvents(supabase, userId, zonedDayRange(day, zone));
  if (!events) return { board: emptyBoard(day, false), update: NO_QUEST_UPDATE };

  const picked = pickDailyQuests(userId, day);
  const progress = evaluateQuests(picked, events);
  const earlier = evaluateQuests(picked, eventsBefore(events, latest));
  const steps: QuestStep[] = progress.map((quest, index) => ({
    ...quest,
    before: Math.min(earlier[index]?.progress ?? quest.progress, quest.progress),
  }));
  const toCreate = claimsToCreate(progress, new Set(claims.keys()));
  if (toCreate.length === 0) {
    return {
      board: boardFrom(day, progress, claims),
      update: { ...NO_QUEST_UPDATE, quests: steps },
    };
  }

  // Insert one by one. A row that already exists means another request paid
  // it first, and the primary key keeps the quest from paying twice.
  const week = weekKey(now);
  const stored: { questId: string; xp: number }[] = [];
  for (const claim of toCreate) {
    const { error } = await supabase.from(CLAIMS_TABLE).insert({
      user_id: userId,
      day_key: day,
      quest_id: claim.questId,
      xp: claim.xp,
      week_key: week,
    });
    if (!error) {
      stored.push(claim);
      claims.set(claim.questId, claim.xp);
    } else if (error.code === "23505") {
      claims.set(claim.questId, claim.xp);
    } else if (!isQuestSchemaMissing(error.message)) {
      console.error("Supabase quest claim insert", error.message);
    }
  }

  const titles = new Map(progress.map((quest) => [quest.id, quest.title]));
  return {
    board: boardFrom(day, progress, claims),
    update: {
      xp: stored.reduce((sum, claim) => sum + claim.xp, 0),
      completed: stored
        .filter((claim) => claim.questId !== QUEST_BONUS_ID)
        .map((claim) => titles.get(claim.questId) ?? claim.questId),
      bonus: stored.some((claim) => claim.questId === QUEST_BONUS_ID),
      quests: steps,
    },
  };
}

/** Same as syncQuests, but a quest failure never breaks the caller. */
export async function syncQuestsQuietly(
  userId: string,
  zone: string,
  latest: QuestEventDelta | null = null,
): Promise<QuestUpdate> {
  try {
    return (await syncQuests(userId, zone, new Date(), latest)).update;
  } catch (error) {
    console.error("syncQuests", error);
    return NO_QUEST_UPDATE;
  }
}

export type QuestClaimRow = {
  user_id: string;
  xp: number;
  created_at: string;
  day_key: string;
  week_key: string;
};

/** Quest XP rows for the leaderboard. A missing table gives no rows. */
export async function listQuestClaimRows(
  supabase: SupabaseClient,
  week: string | null,
  userId?: string,
): Promise<QuestClaimRow[]> {
  const rows: QuestClaimRow[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from(CLAIMS_TABLE)
      .select("user_id, xp, created_at, day_key, week_key")
      .order("user_id")
      .order("day_key")
      .order("quest_id")
      .range(from, from + PAGE_SIZE - 1);
    if (week) query = query.eq("week_key", week);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) {
      if (!isQuestSchemaMissing(error.message)) {
        console.error("Supabase listQuestClaimRows", error.message);
      }
      return rows;
    }
    const page = (data ?? []) as Partial<QuestClaimRow>[];
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

/**
 * Quest claims in `[fromDay, toDay]` Vietnam calendar days, for the admin XP page.
 * Matched by timestamp, because quest days follow each learner's own time zone.
 */
export async function listAdminQuestClaims(
  fromDay: string,
  toDay: string,
): Promise<{ ready: boolean; rows: AdminQuestClaimRow[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, rows: [] };
  const start = zonedDayRange(fromDay, "Asia/Ho_Chi_Minh").start;
  const end = zonedDayRange(toDay, "Asia/Ho_Chi_Minh").end;

  const rows: AdminQuestClaimRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(CLAIMS_TABLE)
      .select("user_id, quest_id, xp, created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at")
      .order("user_id")
      .order("quest_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (!isQuestSchemaMissing(error.message)) {
        console.error("Supabase listAdminQuestClaims", error.message);
      }
      return { ready: false, rows: [] };
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      quest_id?: unknown;
      xp?: unknown;
      created_at?: unknown;
    }[];
    for (const row of page) {
      if (
        typeof row.user_id === "string" &&
        typeof row.quest_id === "string" &&
        typeof row.xp === "number" &&
        typeof row.created_at === "string"
      ) {
        rows.push({
          userId: row.user_id,
          questId: row.quest_id,
          xp: row.xp,
          createdAt: row.created_at,
        });
      }
    }
    if (page.length < PAGE_SIZE) return { ready: true, rows };
    from += PAGE_SIZE;
  }
}
