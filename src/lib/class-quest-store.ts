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
  type ClassQuestResult,
} from "@/lib/class-quests";
import {
  buildAdminClassLeague,
  buildAdminWeekResults,
  dateInWeek,
  finishedWeeks,
  type AdminClassClaim,
  type AdminClassLeague,
  type AdminClassPodiumRow,
  type AdminWeekResults,
} from "@/lib/admin-class-league";
import { isAdminUser } from "@/lib/admins";
import { getSupabaseAdmin, getUserClassName } from "@/lib/progress-store";
import { isQuestSchemaMissing } from "@/lib/quest-store";
import { classLearners, dayKey, leaderboardClassKey, weekEndsAt, weekKey } from "@/lib/xp";
import { listClassLearners, listLearnerClassOptions, readWeekBoardPeople } from "@/lib/xp-store";

const CLAIMS_TABLE = "quest_claims";
const XP_TABLE = "xp_awards";
const STUDY_XP_TABLE = "study_xp_awards";
const DUEL_XP_TABLE = "duel_xp_awards";
const RUNS_TABLE = "listening_runs";
const CLASS_PODIUMS_TABLE = "weekly_class_podiums";
const WEEK_MS = 7 * 86_400_000;
/** Finished weeks of class podiums the admin page shows. */
const ADMIN_PODIUM_WEEKS = 8;
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
  const listening: { run_id: string; user_id: string; day_key: string; xp: number }[] = [];
  const activity: ClassActivity[] = [];
  for (const ids of chunks(userIds)) {
    const [awards, study, duels] = await Promise.all([
      readAll((from, to) =>
        supabase
          .from(XP_TABLE)
          .select("run_id, user_id, day_key, xp")
          .eq("week_key", week)
          .gt("xp", 0)
          .in("user_id", ids)
          .order("run_id")
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from(STUDY_XP_TABLE)
          .select("id, user_id, day_key, xp")
          .eq("week_key", week)
          .gt("xp", 0)
          .in("user_id", ids)
          .order("id")
          .range(from, to),
      ),
      readAll((from, to) =>
        supabase
          .from(DUEL_XP_TABLE)
          .select("duel_id, user_id, day_key, xp")
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
    for (const row of awards as { run_id?: unknown; user_id?: unknown; day_key?: unknown; xp?: unknown }[]) {
      if (typeof row.run_id === "string" && typeof row.user_id === "string" && typeof row.day_key === "string") {
        listening.push({
          run_id: row.run_id,
          user_id: row.user_id,
          day_key: row.day_key,
          xp: typeof row.xp === "number" ? row.xp : 0,
        });
      }
    }
    for (const row of study as { user_id?: unknown; day_key?: unknown; xp?: unknown }[]) {
      if (typeof row.user_id === "string" && typeof row.day_key === "string") {
        activity.push({
          userId: row.user_id,
          day: row.day_key,
          kind: "study",
          xp: typeof row.xp === "number" ? row.xp : 0,
        });
      }
    }
    // Duels are optional. A project without them still has class quests.
    for (const row of (duels ?? []) as { user_id?: unknown; day_key?: unknown; xp?: unknown }[]) {
      if (typeof row.user_id === "string" && typeof row.day_key === "string") {
        activity.push({
          userId: row.user_id,
          day: row.day_key,
          kind: "duel",
          xp: typeof row.xp === "number" ? row.xp : 0,
        });
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
      xp: row.xp,
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
    classKey: "",
    className: null,
    classOptions: [],
    observing: false,
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
  viewer?: { email?: string | null; classKey?: string | null },
): Promise<ClassQuestState> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { board: emptyBoard(now, false), quests: [] };

  const admin = isAdminUser({ id: viewerId, email: viewer?.email });
  const ownClass = leaderboardClassKey(await getUserClassName(viewerId));
  const requested = admin ? leaderboardClassKey(viewer?.classKey) : "";
  let classKey = requested || ownClass;
  let classOptions: { key: string; label: string }[] = [];
  if (admin) {
    const options = await listLearnerClassOptions();
    if (!options) return { board: emptyBoard(now, false), quests: [] };
    classOptions = options;
    if (!classOptions.some((option) => option.key === classKey)) {
      classKey = classOptions.find((option) => option.key === ownClass)?.key ?? classOptions[0]?.key ?? "";
    }
  }

  const roster = classKey ? await listClassLearners(classKey, viewerId, viewerImage) : [];
  if (!roster) return { board: emptyBoard(now, false), quests: [] };
  const onRoster = roster.some((learner) => learner.userId === viewerId);
  // Staff and learners without a class have no class quests. An admin can watch one.
  if (!onRoster && !admin) return { board: emptyBoard(now, true), quests: [] };
  if (roster.length === 0) return { board: emptyBoard(now, true), quests: [] };

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

  const people = new Map(
    roster.map((learner) => [learner.userId, { name: learner.name, image: learner.image }]),
  );
  const views = quests.map((entry) => buildClassQuestView({ ...entry, viewerId, people }));
  return {
    board: {
      ...emptyBoard(now, true, true),
      classKey,
      className:
        classOptions.find((option) => option.key === classKey)?.label ??
        roster.find((learner) => learner.userId === viewerId)?.className ??
        roster[0]?.className ??
        null,
      classOptions,
      observing: !onRoster,
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
  viewer?: { email?: string | null; classKey?: string | null },
): Promise<ClassQuestBoard> {
  return (await readClassQuestState(viewerId, viewerImage, now, viewer)).board;
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

export type AdminClassLeagueData = {
  /** False when XP or quest claims are unreadable. */
  ready: boolean;
  /** False when supabase/class_podiums.sql has not been run. */
  podiumsReady: boolean;
  league: AdminClassLeague | null;
};

async function readAdminClassClaims(supabase: SupabaseClient, week: string): Promise<AdminClassClaim[] | null> {
  const rows = await readAll((from, to) =>
    supabase
      .from(CLAIMS_TABLE)
      .select("user_id, quest_id, xp, day_key")
      .eq("week_key", week)
      .like("quest_id", "class%")
      .order("user_id")
      .order("day_key")
      .order("quest_id")
      .range(from, to),
  );
  if (!rows) return null;
  return (rows as { user_id?: unknown; quest_id?: unknown; xp?: unknown; day_key?: unknown }[]).flatMap((row) =>
    typeof row.user_id === "string" &&
    typeof row.quest_id === "string" &&
    typeof row.xp === "number" &&
    typeof row.day_key === "string"
      ? [{ userId: row.user_id, questId: row.quest_id, xp: row.xp, day: row.day_key }]
      : [],
  );
}

async function readAdminClassPodiums(
  supabase: SupabaseClient,
  now: Date,
): Promise<AdminClassPodiumRow[] | "missing"> {
  const weeks = Array.from({ length: ADMIN_PODIUM_WEEKS }, (_, index) =>
    weekKey(new Date(now.getTime() - (index + 1) * WEEK_MS)),
  );
  const rows = await readAll((from, to) =>
    supabase
      .from(CLASS_PODIUMS_TABLE)
      .select("week_key, user_id, class_key, rank, class_xp")
      .in("week_key", weeks)
      .order("week_key")
      .order("user_id")
      .range(from, to),
  );
  if (!rows) return "missing";
  return (rows as Record<string, unknown>[]).flatMap((row) =>
    typeof row.week_key === "string" &&
    typeof row.user_id === "string" &&
    typeof row.class_key === "string" &&
    typeof row.rank === "number" &&
    typeof row.class_xp === "number"
      ? [{ week: row.week_key, userId: row.user_id, classKey: row.class_key, rank: row.rank, classXp: row.class_xp }]
      : [],
  );
}

/** A finished week's winners and class posts. Null when that week's XP or activity is unreadable. */
export async function readAdminWeekResults(week: string, now = new Date()): Promise<AdminWeekResults | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const people = await readWeekBoardPeople(dateInWeek(week));
  if (!people) return null;
  const activity = await readClassActivity(
    supabase,
    classLearners(people).map((person) => person.userId),
    week,
  );
  return activity ? buildAdminWeekResults({ week, people, activity, now }) : null;
}

/**
 * A finished week's winners, this week's classes board, quests and claims,
 * plus recent class podiums, for admins. `resultWeek` defaults to last week.
 */
export async function readAdminClassLeague(
  now = new Date(),
  resultWeek = finishedWeeks(now)[0]!,
): Promise<AdminClassLeagueData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ready: false, podiumsReady: false, league: null };
  const week = weekKey(now);
  const [people, results] = await Promise.all([
    readWeekBoardPeople(now),
    readAdminWeekResults(resultWeek, now),
  ]);
  if (!people) return { ready: false, podiumsReady: false, league: null };

  const [activity, claims, podiums] = await Promise.all([
    readClassActivity(
      supabase,
      classLearners(people).map((person) => person.userId),
      week,
    ),
    readAdminClassClaims(supabase, week),
    readAdminClassPodiums(supabase, now),
  ]);
  if (!activity || !claims) return { ready: false, podiumsReady: podiums !== "missing", league: null };
  return {
    ready: true,
    podiumsReady: podiums !== "missing",
    league: buildAdminClassLeague({
      people,
      activity,
      claims,
      podiums: podiums === "missing" ? [] : podiums,
      results,
      now,
    }),
  };
}
