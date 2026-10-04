import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProgress, type StoredProgress } from "@/lib/progress";
import { getSupabaseAdmin, readClassName } from "@/lib/progress-store";
import {
  buildWeeklyRecap,
  shiftWeekKey,
  weekStartIso,
  type RecapRun,
  type RecapXpRow,
  type WeeklyRecap,
} from "@/lib/weekly-recap";
import { googleProfileImage, leaderboardDisplayName } from "@/lib/xp";

const PROFILE_TABLE = "user_progress";
const XP_TABLES = ["xp_awards", "study_xp_awards", "duel_xp_awards"] as const;
const RUNS_TABLE = "listening_runs";

export type RecapProfile = {
  displayName: string;
  image: string | null;
  className: string | null;
};

export type WeeklyRecapCard = {
  profile: RecapProfile;
  recap: WeeklyRecap;
};

async function readProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profile: RecapProfile; progress: StoredProgress } | null> {
  // Older projects may lack the image or class column; fall back without them.
  const columnSets = [
    "data, name, image, class_name, deleted_at",
    "data, name, class_name, deleted_at",
    "data, name",
  ];
  for (const columns of columnSets) {
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) continue;
    if (!data) return null;
    const row = data as {
      data?: unknown;
      name?: string | null;
      image?: unknown;
      class_name?: unknown;
      deleted_at?: string | null;
    };
    if (row.deleted_at) return null;
    return {
      profile: {
        displayName: leaderboardDisplayName(row.name),
        image: googleProfileImage(row.image),
        className: readClassName(row.class_name),
      },
      progress: normalizeProgress(row.data as Partial<StoredProgress>),
    };
  }
  return null;
}

async function readXpRows(
  supabase: SupabaseClient,
  userId: string,
  weeks: readonly string[],
): Promise<RecapXpRow[]> {
  const reads = XP_TABLES.map(async (table) => {
    const { data, error } = await supabase
      .from(table)
      .select("xp, day_key, week_key")
      .eq("user_id", userId)
      .in("week_key", weeks);
    // A table that is not set up yet counts as no XP.
    if (error) return [];
    return ((data ?? []) as { xp?: unknown; day_key?: unknown; week_key?: unknown }[]).flatMap(
      (row) =>
        typeof row.xp === "number" &&
        typeof row.day_key === "string" &&
        typeof row.week_key === "string"
          ? [{ xp: row.xp, dayKey: row.day_key, weekKey: row.week_key }]
          : [],
    );
  });
  return (await Promise.all(reads)).flat();
}

async function readRuns(
  supabase: SupabaseClient,
  userId: string,
  fromWeek: string,
  toWeek: string,
): Promise<RecapRun[]> {
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select("outcome, accuracy, answered_count, created_at")
    .eq("user_id", userId)
    .gte("created_at", weekStartIso(fromWeek))
    .lt("created_at", weekStartIso(shiftWeekKey(toWeek, 1)));
  if (error) return [];
  return (
    (data ?? []) as {
      outcome?: unknown;
      accuracy?: unknown;
      answered_count?: unknown;
      created_at?: unknown;
    }[]
  ).flatMap((row) =>
    (row.outcome === "success" || row.outcome === "fail") &&
    typeof row.accuracy === "number" &&
    typeof row.answered_count === "number" &&
    typeof row.created_at === "string"
      ? [
          {
            outcome: row.outcome,
            accuracy: row.accuracy,
            answeredCount: row.answered_count,
            createdAt: row.created_at,
          },
        ]
      : [],
  );
}

/** The recap card data for one learner and week, or null when the account is gone. */
export async function loadWeeklyRecapCard(
  userId: string,
  week: string,
  now = new Date(),
): Promise<WeeklyRecapCard | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;

  const previousWeek = shiftWeekKey(week, -1);
  const [account, xpRows, runs] = await Promise.all([
    readProfile(supabase, userId),
    readXpRows(supabase, userId, [previousWeek, week]),
    readRuns(supabase, userId, previousWeek, week),
  ]);
  if (!account) return null;

  return {
    profile: account.profile,
    recap: buildWeeklyRecap({ week, progress: account.progress, xpRows, runs, now }),
  };
}
