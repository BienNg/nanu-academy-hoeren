import { getSupabaseAdmin } from "@/lib/progress-store";

const TABLE = "session_ratings";

function missingTable(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/**
 * Account deletion removes the learner's ratings and "Để sau" answers. A
 * progress wipe keeps them: they are feedback on a class session, not progress.
 */
export async function deleteUserSessionRatings(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId);
  if (error && !missingTable(error.message)) {
    throw new Error(`Could not delete session ratings (${error.message}).`);
  }
}
