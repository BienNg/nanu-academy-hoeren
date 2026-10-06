import type { SupabaseClient } from "@supabase/supabase-js";
import {
  badgesToAward,
  buildBadgeBoard,
  EMPTY_BADGE_STATS,
  freshBadge,
  longestStreak,
  type BadgeBoardView,
  type BadgeStats,
  type FreshBadge,
  type StoredBadge,
} from "@/lib/badges";
import { listRankedResults } from "@/lib/blitzrunde-store";
import { collectPracticeDates } from "@/lib/progress";
import { getCloudProgress, getSupabaseAdmin } from "@/lib/progress-store";
import { weekKey } from "@/lib/xp";
import { getUserXpTotals, readWeeklyClassPodiums } from "@/lib/xp-store";

const AWARDS_TABLE = "badge_awards";
const PODIUMS_TABLE = "weekly_podiums";
const PODIUM_WEEKS_TABLE = "weekly_podium_weeks";
const WEEK_MS = 7 * 86_400_000;
/** A week is ranked this long after it ends, so late runs still land in it. */
const WEEK_GRACE_MS = 15 * 60_000;
/** Finished weeks ranked when the podium table is new. */
const PODIUM_BACKFILL_WEEKS = 8;

export const BADGE_SCHEMA_HINT = "Run supabase/badges.sql once in the Supabase SQL editor.";

export function isBadgeSchemaMissing(message: string): boolean {
  return (
    /badge_awards|weekly_podium/i.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

export type BadgeBoard = BadgeBoardView & {
  /** False when the badge tables are missing or the store is not configured. */
  ready: boolean;
};

function notReady(): BadgeBoard {
  return { ready: false, ...buildBadgeBoard(EMPTY_BADGE_STATS, []) };
}

/** How many rows the query matches. 0 when the table is unreadable. */
async function countRows(
  label: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    if (!/does not exist|schema cache|could not find the table/i.test(error.message)) {
      console.error(`Supabase badge count ${label}`, error.message);
    }
    return 0;
  }
  return count ?? 0;
}

async function readPodiumCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ top3: number; first: number }> {
  const { data, error } = await supabase.from(PODIUMS_TABLE).select("rank").eq("user_id", userId);
  if (error) {
    if (!isBadgeSchemaMissing(error.message)) console.error("Supabase badge podiums", error.message);
    return { top3: 0, first: 0 };
  }
  const ranks = ((data ?? []) as { rank?: unknown }[]).map((row) => row.rank);
  return {
    top3: ranks.filter((rank) => typeof rank === "number" && rank <= 3).length,
    first: ranks.filter((rank) => rank === 1).length,
  };
}

async function readBadgeStats(supabase: SupabaseClient, userId: string): Promise<BadgeStats> {
  const head = { count: "exact" as const, head: true };
  const [
    totals,
    listeningParts,
    perfectParts,
    studyParts,
    questBonusDays,
    duelWins,
    progress,
    blitz,
    podiums,
  ] = await Promise.all([
    getUserXpTotals(userId),
    countRows(
      "xp_awards",
      supabase.from("xp_awards").select("run_id", head).eq("user_id", userId).gt("xp", 0),
    ),
    countRows(
      "listening_runs",
      supabase
        .from("listening_runs")
        .select("id", head)
        .eq("user_id", userId)
        .eq("outcome", "success")
        .gte("accuracy", 100),
    ),
    countRows(
      "study_xp_awards",
      supabase.from("study_xp_awards").select("id", head).eq("user_id", userId).gt("xp", 0),
    ),
    countRows(
      "quest_claims",
      supabase.from("quest_claims").select("day_key", head).eq("user_id", userId).eq("quest_id", "bonus"),
    ),
    countRows(
      "duel_xp_awards",
      supabase.from("duel_xp_awards").select("duel_id", head).eq("user_id", userId).eq("outcome", "win"),
    ),
    getCloudProgress(userId),
    listRankedResults({ userId }),
    readPodiumCounts(supabase, userId),
  ]);

  return {
    totalXp: totals.ready ? totals.total : 0,
    listeningParts,
    perfectParts,
    studyParts,
    lessonsDone: Object.values(progress.learn).filter((entry) => entry.completedAt || entry.skippedAt)
      .length,
    bestStreak: Math.max(longestStreak(collectPracticeDates(progress)), progress.streakDays),
    questBonusDays,
    duelWins,
    blitzPodiums: (blitz ?? []).filter((result) => result.rank <= 3).length,
    weekTop3: podiums.top3,
    weekFirst: podiums.first,
  };
}

/**
 * Stores the class podiums of recently finished weeks that are not ranked yet.
 * Cheap once they are: one small read. Two requests racing both write the
 * same rows, and the primary keys keep one copy.
 */
async function rankFinishedWeeks(supabase: SupabaseClient, now: Date): Promise<void> {
  const settled = now.getTime() - WEEK_GRACE_MS;
  const weeks = Array.from({ length: PODIUM_BACKFILL_WEEKS }, (_, index) => {
    const inWeek = new Date(settled - (index + 1) * WEEK_MS);
    return { key: weekKey(inWeek), inWeek };
  });
  const { data, error } = await supabase
    .from(PODIUM_WEEKS_TABLE)
    .select("week_key")
    .in(
      "week_key",
      weeks.map((week) => week.key),
    );
  if (error) {
    if (!isBadgeSchemaMissing(error.message)) console.error("Supabase podium weeks", error.message);
    return;
  }
  const ranked = new Set(((data ?? []) as { week_key?: unknown }[]).map((row) => row.week_key));
  for (const week of weeks.filter((entry) => !ranked.has(entry.key)).reverse()) {
    const places = await readWeeklyClassPodiums(week.inWeek);
    if (!places) return;
    if (places.length > 0) {
      const { error: placeError } = await supabase.from(PODIUMS_TABLE).upsert(
        places.map((place) => ({
          week_key: week.key,
          user_id: place.userId,
          class_key: place.classKey,
          rank: place.rank,
          xp: place.xp,
        })),
        { onConflict: "week_key,user_id", ignoreDuplicates: true },
      );
      if (placeError) {
        console.error("Supabase podium insert", placeError.message);
        return;
      }
    }
    const { error: markError } = await supabase
      .from(PODIUM_WEEKS_TABLE)
      .upsert({ week_key: week.key }, { onConflict: "week_key", ignoreDuplicates: true });
    if (markError) {
      console.error("Supabase podium week mark", markError.message);
      return;
    }
  }
}

async function readStoredBadges(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredBadge[] | "missing" | null> {
  const { data, error } = await supabase
    .from(AWARDS_TABLE)
    .select("badge_id, earned_at, seen_at")
    .eq("user_id", userId);
  if (error) {
    if (isBadgeSchemaMissing(error.message)) return "missing";
    console.error("Supabase badge awards", error.message);
    return null;
  }
  return ((data ?? []) as { badge_id?: unknown; earned_at?: unknown; seen_at?: unknown }[]).flatMap(
    (row) =>
      typeof row.badge_id === "string" && typeof row.earned_at === "string"
        ? [{ id: row.badge_id, earnedAt: row.earned_at, seen: row.seen_at != null }]
        : [],
  );
}

/**
 * Counts the learner's stats, stores badges they just reached, and returns
 * the collection. Safe to call any time. `newly` lists the badges this call
 * stored, which are also in `board.fresh` until marked seen.
 */
export async function syncBadges(
  userId: string,
  now = new Date(),
): Promise<{ board: BadgeBoard; newly: FreshBadge[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { board: notReady(), newly: [] };

  await rankFinishedWeeks(supabase, now);
  const [stored, stats] = await Promise.all([
    readStoredBadges(supabase, userId),
    readBadgeStats(supabase, userId),
  ]);
  if (stored === "missing" || stored === null) return { board: notReady(), newly: [] };

  const toAward = badgesToAward(stats, new Set(stored.map((badge) => badge.id)));
  const newly: FreshBadge[] = [];
  if (toAward.length > 0) {
    // Only rows this request inserted come back, so a badge unlocks once.
    const { data, error } = await supabase
      .from(AWARDS_TABLE)
      .upsert(
        toAward.map((id) => ({ user_id: userId, badge_id: id, earned_at: now.toISOString() })),
        { onConflict: "user_id,badge_id", ignoreDuplicates: true },
      )
      .select("badge_id");
    if (error) {
      console.error("Supabase badge insert", error.message);
    } else {
      const inserted = new Set(((data ?? []) as { badge_id?: unknown }[]).map((row) => row.badge_id));
      for (const id of toAward) {
        if (!inserted.has(id)) continue;
        stored.push({ id, earnedAt: now.toISOString(), seen: false });
        const badge = freshBadge(id);
        if (badge) newly.push(badge);
      }
    }
  }

  return { board: { ready: true, ...buildBadgeBoard(stats, stored) }, newly };
}

/** Marks these badges seen, so the unlock is not shown again. */
export async function markBadgesSeen(userId: string, ids: readonly string[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || ids.length === 0) return;
  const { error } = await supabase
    .from(AWARDS_TABLE)
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("badge_id", [...ids])
    .is("seen_at", null);
  if (error && !isBadgeSchemaMissing(error.message)) {
    console.error("Supabase badge seen", error.message);
  }
}

/** Remove every badge and podium place for this learner. */
export async function deleteUserBadges(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  for (const table of [AWARDS_TABLE, PODIUMS_TABLE]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error && !isBadgeSchemaMissing(error.message)) {
      throw new Error(`Could not delete badges (${error.message}).`);
    }
  }
}
