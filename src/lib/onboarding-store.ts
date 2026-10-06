import { onboardingState } from "@/lib/onboarding";
import { getSupabaseAdmin } from "@/lib/progress-store";
import { readTotalXp } from "@/lib/xp-store";

const TABLE = "user_progress";
const COLUMN = "onboarding_completed_at";

let loggedMissingColumn = false;

function noteMissingColumn(message: string): void {
  if (loggedMissingColumn) return;
  loggedMissingColumn = true;
  console.error(
    "user_progress.onboarding_completed_at is missing. Run supabase/onboarding.sql.",
    message,
  );
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
    if (error.message.includes(COLUMN)) noteMissingColumn(error.message);
    else console.error("Supabase markOnboardingComplete", error.message);
    return false;
  }
  return true;
}

/**
 * Whether the level map should run the first-run tour for this learner.
 * Learners with XP are stamped here, which covers anyone who earned XP after
 * the backfill in supabase/onboarding.sql ran.
 */
export async function shouldShowOnboarding(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const supabase = getSupabaseAdmin();
  // Local dev without a progress store: show the tour. It cannot be stamped there.
  if (!supabase) return true;

  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMN)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (error.message.includes(COLUMN)) noteMissingColumn(error.message);
    else console.error("Supabase shouldShowOnboarding", error.message);
  }
  const completedAt = (data as { onboarding_completed_at?: string | null } | null)
    ?.onboarding_completed_at ?? null;
  const readable = !error;
  const totalXp = readable && !completedAt ? await readTotalXp(userId) : null;

  const state = onboardingState({ readable, completedAt, totalXp });
  if (state === "earned") await markOnboardingComplete(userId);
  return state === "pending";
}
