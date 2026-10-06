import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildClassQuestView,
  classClaimDenial,
  classClaimId,
  classQuestXp,
  evaluateClassQuest,
  pickClassDailyQuests,
  pickClassWeeklyQuest,
  type ClassActivity,
  type ClassQuestBoard,
  type ClassQuestDefinition,
  type ClassQuestDenial,
  type ClassQuestPerson,
  type ClassQuestResult,
} from "@/lib/class-quests";
import { getSupabaseAdmin, getUserClassName } from "@/lib/progress-store";
import { isQuestSchemaMissing } from "@/lib/quest-store";
import { dayKey, leaderboardClassKey, weekEndsAt, weekKey } from "@/lib/xp";
import { listClassLearners } from "@/lib/xp-store";

const CLAIMS_TABLE = "quest_claims";
const XP_TABLE = "xp_awards";
const STUDY_XP_TABLE = "study_xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const RUNS_TABLE = "listening_runs";
const PAGE_SIZE = 1000;
/** Ids per `.in()` filter, so the request URL stays short. */
const IN_CHUNK = 150;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += IN_CHUNK) out.push(items.slice(index, index + IN_CHUNK));
  return out;
}

type Page = { data: unknown[] | null; error: { message: string } | null };

/** Every row of a paged query. Null when a page fails. */
async function readAll(page: (from: number, to: number) => PromiseLike<Page>): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return null;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

/** The following Vietnam midnight. */
function dayEndsAt(now: Date): string {
  const [year, month, day] = dayKey(now).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1) - VN_OFFSET_MS).toISOString();
}

/** What the class's learners did this Vietnam week. Null when listening or study XP is unreadable. */
async function readClassActivity(
  supabase: SupabaseClient,
  userIds: readonly string[],
  week: string,
): Promise<ClassActivity[] | null> {
  const listening: { run_id: string; user_id: string; day_key: string }[] = [];
  const activity: ClassActivity[] = [];
  for (const ids of chunks(userIds)) {
    const [awards, study, duels] = await Promise.all([
      readAll((from, to) =>
        supabase
          .from(XP_TABLE)
          .select("run_id, user_id, day_key")
          .eq("week_key", week)
          .gt("xp", 0)
          .in("user_id", ids)
          .order("run_id")
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from(STUDY_XP_TABLE)
          .select("id, user_id, day_key")
          .eq("week_key", week)
          .gt("xp", 0)
          .in("user_id", ids)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from(DUEL_XP_TABLE)
          .select("duel_id, user_id, day_key")
          .eq("week_key", week)
          .in("user_id", ids)
          .order("duel_id")
          .order("user_id")
          .range(from, to),
      ),
    ]);
    if (!awards || !study) {
      console.error("Supabase class quest activity", "listening or study XP unreadable");
      return null;
    }
    for (const row of awards as { run_id?: unknown; user_id?: unknown; day_key?: unknown }[]) {
      if (typeof row.run_id === "string" && typeof row.user_id === "string" && typeof row.day_key === "string") {
        listening.push({ run_id: row.run_id, user_id: row.user_id, day_key: row.day_key });
      }
    }
    for (const row of study as { user_id?: unknown; day_key?: unknown }[]) {
      if (typeof row.user_id === "string" && typeof row.day_key === "string") {
        activity.push({ userId: row.user_id, day: row.day_key, kind: "study" });
      }
    }
    // Duels are optional. A project without them still has class quests.
    for (const row of (duels ?? []) as { user_id?: unknown; day_key?: unknown }[]) {
      if (typeof row.user_id === "string" && typeof row.day_key === "string") {
        activity.push({ userId: row.user_id, day: row.day_key, kind: "duel" });
      }
    }
  }

  const accuracyByRun = new Map<string, number>();
  for (const ids of chunks(listening.map((row) => row.run_id))) {
    const runs = await supabase.from(RUNS_TABLE).select("id, accuracy").in("id", ids);
    if (runs.error) {
      console.error("Supabase class quest runs", runs.error.message);
      return null;
    }
    for (const run of (runs.data ?? []) as { id?: unknown; accuracy?: unknown }[]) {
      if (typeof run.id === "string" && typeof run.accuracy === "number") accuracyByRun.set(run.id, run.accuracy);
    }
  }
  for (const row of listening) {
    activity.push({
      userId: row.user_id,
      day: row.day_key,
      kind: "listening",
      accuracy: accuracyByRun.get(row.run_id) ?? 0,
    });
  }
  return activity;
}

/** The viewer's class quest claims this week. "missing" when quest_claims does not exist. */
async function readClassClaims(
  supabase: SupabaseClient,
  userId: string,
  week: string,
): Promise<{ questId: string; day: string }[] | "missing" | null> {
  const { data, error } = await supabase
    .from(CLAIMS_TABLE)
    .select("quest_id, day_key")
    .eq("user_id", userId)
    .eq("week_key", week)
    .like("quest_id", "class%");
  if (error) {
    if (isQuestSchemaMissing(error.message)) return "missing";
    console.error("Supabase class quest claims", error.message);
    return null;
  }
  return ((data ?? []) as { quest_id?: unknown; day_key?: unknown }[]).flatMap((row) =>
    typeof row.quest_id === "string" && typeof row.day_key === "string"
      ? [{ questId: row.quest_id, day: row.day_key }]
      : [],
  );
}

type Evaluated = { quest: ClassQuestDefinition; result: ClassQuestResult; claimed: boolean };

type ClassQuestState = {
  board: ClassQuestBoard;
  /** Today's and this week's quests. Empty unless the board is ready. */
  quests: Evaluated[];
};

function emptyBoard(now: Date, ready: boolean, hasClass = false): ClassQuestBoard {
  return {
    ready,
    hasClass,
    className: null,
    learners: 0,
    daily: [],
    weekly: [],
    dayEndsAt: dayEndsAt(now),
    weekEndsAt: weekEndsAt(now),
  };
}

async function readClassQuestState(
  viewerId: string,
  viewerImage: string | null | undefined,
  now: Date,
): Promise<ClassQuestState> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { board: emptyBoard(now, false), quests: [] };

  const classKey = leaderboardClassKey(await getUserClassName(viewerId));
  const roster = classKey ? await listClassLearners(classKey, viewerId, viewerImage) : [];
  if (!roster) return { board: emptyBoard(now, false), quests: [] };
  // Admins, staff and learners without a class have no class quests.
  if (!roster.some((learner) => learner.userId === viewerId)) {
    return { board: emptyBoard(now, true), quests: [] };
  }

  const today = dayKey(now);
  const week = weekKey(now);
  const userIds = roster.map((learner) => learner.userId);
  const [activity, claims] = await Promise.all([
    readClassActivity(supabase, userIds, week),
    readClassClaims(supabase, viewerId, week),
  ]);
  if (!activity || claims === "missing" || claims === null) return { board: emptyBoard(now, false), quests: [] };

  const todayActivity = activity.filter((entry) => entry.day === today);
  const quests: Evaluated[] = [
    ...pickClassDailyQuests(classKey, today).map((quest) => ({
      quest,
      result: evaluateClassQuest(quest, userIds, todayActivity),
      claimed: claims.some((claim) => claim.questId === classClaimId(quest) && claim.day === today),
    })),
    ...[pickClassWeeklyQuest(classKey, week)].map((quest) => ({
      quest,
      result: evaluateClassQuest(quest, userIds, activity),
      claimed: claims.some((claim) => claim.questId === classClaimId(quest)),
    })),
  ];

  const people = new Map<string, ClassQuestPerson>(
    roster.map((learner) => [learner.userId, { name: learner.name, image: learner.image }]),
  );
  const views = quests.map((entry) => buildClassQuestView({ ...entry, viewerId, people }));
  return {
    board: {
      ...emptyBoard(now, true, true),
      className: roster.find((learner) => learner.userId === viewerId)?.className ?? null,
      learners: roster.length,
      daily: views.filter((view) => view.period === "day"),
      weekly: views.filter((view) => view.period === "week"),
    },
    quests,
  };
}

/** Today's and this week's class quests for the viewer's class. */
export async function getClassQuestBoard(
  viewerId: string,
  viewerImage?: string | null,
  now = new Date(),
): Promise<ClassQuestBoard> {
  return (await readClassQuestState(viewerId, viewerImage, now)).board;
}

export type ClassClaimResult = {
  board: ClassQuestBoard;
  /** XP this request stored. 0 when the claim was refused or already paid. */
  xp: number;
  denial: ClassQuestDenial | "unavailable" | null;
};

/**
 * Pays a finished class quest to the viewer if they helped finish it. A quest
 * can only be claimed on its own Vietnam day or week, because only the current
 * quests are offered. Daily claims are unique by the primary key. A weekly
 * claim is stored on the day it is claimed, so it also counts as today's XP,
 * and the read above refuses a second one later in the week.
 */
export async function claimClassQuest(
  viewerId: string,
  viewerImage: string | null | undefined,
  questId: string,
  now = new Date(),
): Promise<ClassClaimResult> {
  const state = await readClassQuestState(viewerId, viewerImage, now);
  const supabase = getSupabaseAdmin();
  if (!state.board.ready || !state.board.hasClass || !supabase) {
    return { board: state.board, xp: 0, denial: "unavailable" };
  }
  const entry = state.quests.find((candidate) => candidate.quest.id === questId) ?? null;
  const denial = classClaimDenial({
    result: entry?.result ?? null,
    viewerId,
    claimed: entry?.claimed ?? false,
  });
  if (denial || !entry) return { board: state.board, xp: 0, denial: denial ?? "unknown" };

  const xp = classQuestXp(entry.quest);
  const { data, error } = await supabase
    .from(CLAIMS_TABLE)
    .upsert(
      {
        user_id: viewerId,
        day_key: dayKey(now),
        quest_id: classClaimId(entry.quest),
        xp,
        week_key: weekKey(now),
      },
      { onConflict: "user_id,day_key,quest_id", ignoreDuplicates: true },
    )
    .select("quest_id");
  if (error) {
    console.error("Supabase class quest claim", error.message);
    return { board: state.board, xp: 0, denial: "unavailable" };
  }
  // No row back means another request paid it first.
  const paid = (data ?? []).length > 0;
  const mark = (view: ClassQuestBoard["daily"][number]) =>
    view.id === questId ? { ...view, claimed: true, claimable: false } : view;
  return {
    board: { ...state.board, daily: state.board.daily.map(mark), weekly: state.board.weekly.map(mark) },
    xp: paid ? xp : 0,
    denial: paid ? null : "claimed",
  };
}
