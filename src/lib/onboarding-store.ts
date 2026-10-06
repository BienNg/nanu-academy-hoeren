import { onboardingState } from "@/lib/onboarding";
import { getSupabaseAdmin } from "@/lib/progress-store";
import { readTotalXp } from "@/lib/xp-store";

const TABLE = "user_progress";
const COLUMN = "onboarding_completed_at";
const RESET_COLUMN = "onboarding_reset_at";

let loggedMissingColumn = false;

function isMissingColumn(message: string, column: string): boolean {
  return message.includes(column) && /does not exist|schema cache|could not find/i.test(message);
}

function noteMissingColumn(message: string): void {
  if (loggedMissingColumn) return;
  loggedMissingColumn = true;
  console.error(
    "user_progress onboarding columns are missing. Run supabase/onboarding.sql.",
    message,
  );
}

export type OnboardingStatus = {
  completedAt: string | null;
  resetAt: string | null;
};

/**
 * Both stamps, or null when they cannot be read. A missing reset column (the
 * SQL ran before resets existed) reads as "never reset".
 */
async function readOnboardingRow(userId: string): Promise<OnboardingStatus | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;
  for (const columns of [`${COLUMN}, ${RESET_COLUMN}`, COLUMN]) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingColumn(error.message, RESET_COLUMN) && columns !== COLUMN) {
        noteMissingColumn(error.message);
        continue;
      }
      if (isMissingColumn(error.message, COLUMN)) noteMissingColumn(error.message);
      else console.error("Supabase readOnboardingRow", error.message);
      return null;
    }
    const row = (data ?? {}) as { onboarding_completed_at?: string | null; onboarding_reset_at?: string | null };
    return { completedAt: row.onboarding_completed_at ?? null, resetAt: row.onboarding_reset_at ?? null };
  }
  return null;
}

/** Stamp the learner as onboarded. A stamp that is already there is kept. */
export async function markOnboardingComplete(userId: string, at = new Date()): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return false;
  const { error } = await supabase
    .from(TABLE)
    .update({ [COLUMN]: at.toISOString() })
    .eq("user_id", userId)
    .is(COLUMN, null);
  if (error) {
    if (isMissingColumn(error.message, COLUMN)) noteMissingColumn(error.message);
    else console.error("Supabase markOnboardingComplete", error.message);
    return false;
  }
  return true;
}

/** Admin view of one learner's onboarding. Null when it cannot be read. */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus | null> {
  return readOnboardingRow(userId);
}

/**
 * Clear the completed stamp so the tour runs again on the learner's next map
 * visit. The reset stamp keeps the XP rule from marking them done right away.
 */
export async function resetOnboarding(userId: string, at = new Date()): Promise<OnboardingStatus> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress store is not configured");
  const resetAt = at.toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({ [COLUMN]: null, [RESET_COLUMN]: resetAt })
    .eq("user_id", userId);
  if (error) {
    if (isMissingColumn(error.message, RESET_COLUMN) || isMissingColumn(error.message, COLUMN)) {
      noteMissingColumn(error.message);
      throw new Error("Run supabase/onboarding.sql to enable onboarding resets.");
    }
    throw new Error(error.message);
  }
  return { completedAt: null, resetAt };
}

/**
 * Whether the level map should run the first-run tour for this learner.
 * Learners with XP are stamped here, which covers anyone who earned XP after
 * the backfill in supabase/onboarding.sql ran, unless an admin reset them.
 */
export async function shouldShowOnboarding(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  // Local dev without a progress store: show the tour. It cannot be stamped there.
  if (!getSupabaseAdmin()) return true;

  const row = await readOnboardingRow(userId);
  const readable = row !== null;
  const completedAt = row?.completedAt ?? null;
  const resetAt = row?.resetAt ?? null;
  const totalXp = readable && !completedAt && !resetAt ? await readTotalXp(userId) : null;

  const state = onboardingState({ readable, completedAt, resetAt, totalXp });
  if (state === "earned") await markOnboardingComplete(userId);
  return state === "pending";
}
