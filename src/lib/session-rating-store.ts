import { classKey } from "@/lib/admin-overview";
import { isAdminUser } from "@/lib/admins";
import { isScheduleDay } from "@/lib/class-schedule";
import { listCachedClassSchedules } from "@/lib/class-schedule-store";
import { getCefrLevels } from "@/lib/levels";
import { getSupabaseAdmin, getUserClassName, getUserDashboardFlags } from "@/lib/progress-store";
import {
  RATING_XP,
  normalizeRatingInput,
  openRatingSession,
  ratingClaimId,
  type OpenRatingSession,
} from "@/lib/session-ratings";
import { dayKey, weekKey } from "@/lib/xp";

const TABLE = "session_ratings";
const CLAIMS_TABLE = "quest_claims";

/** Set after a rating or "Để sau", so later Home loads skip the database. */
export const RATING_DONE_COOKIE = "nr_rated";

export type PendingRating = OpenRatingSession & { classKey: string };

export type RatingDenial = "invalid" | "closed" | "answered" | "unavailable";

export type RatingResult = { ok: true; xp: number; session: PendingRating } | { ok: false; denial: RatingDenial };

type RatingUser = { id: string; email?: string | null };

function missingTable(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/** Cookie value for one session. Only the newest open session is ever asked, so one cookie is enough. */
export function ratingDoneCookieValue(key: string, day: string): string {
  return encodeURIComponent(`${key}|${day}`);
}

/** Next decodes cookie values when it reads them, so compare both forms. */
function isDoneCookie(cookie: string | undefined, key: string, day: string): boolean {
  if (!cookie) return false;
  const value = ratingDoneCookieValue(key, day);
  return cookie === value || cookie === decodeURIComponent(value);
}

function levelOrder() {
  return getCefrLevels().map((level) => ({ slug: level.slug, lektionen: level.chapters.length }));
}

/**
 * The learner's class session that is open for rating right now, before
 * checking whether they answered it. No database read beyond the cached
 * schedules and the per-request access row. Admins, staff and teachers are
 * never asked, and neither is anyone without a class or class timetable.
 */
async function openSessionFor(user: RatingUser, now: Date): Promise<PendingRating | null> {
  if (isAdminUser(user)) return null;
  const className = await getUserClassName(user.id);
  const key = classKey(className);
  if (!key) return null;
  const flags = await getUserDashboardFlags(user.id);
  if (flags.staff || flags.teacher) return null;
  const schedules = await listCachedClassSchedules();
  const schedule = schedules?.find((entry) => entry.classKey === key);
  if (!schedule) return null;
  const open = openRatingSession(schedule, levelOrder(), now);
  return open ? { ...open, classKey: key } : null;
}

/**
 * What Home should ask, or null. Most loads end before the database: no open
 * session, or the done cookie names this session. Otherwise one primary-key
 * lookup selecting only `status`. Any error shows nothing.
 */
export async function readPendingRating(
  user: RatingUser,
  doneCookie: string | undefined,
  now = new Date(),
): Promise<PendingRating | null> {
  const session = await openSessionFor(user, now);
  if (!session) return null;
  if (isDoneCookie(doneCookie, session.classKey, session.day)) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("status")
    .eq("class_key", session.classKey)
    .eq("session_date", session.day)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.error("Supabase readPendingRating", error.message);
    return null;
  }
  return data ? null : session;
}

/**
 * Stores a rating (`{ classKey, sessionDate, stars, tags, comment }`) or a
 * "Để sau" (`{ classKey, sessionDate, dismiss: true }`). The session must be
 * the learner's open one right now. A second answer is refused by the primary
 * key. A rating then pays RATING_XP as a quest claim.
 */
export async function answerRating(user: RatingUser, body: unknown, now = new Date()): Promise<RatingResult> {
  if (!body || typeof body !== "object") return { ok: false, denial: "invalid" };
  const raw = body as Record<string, unknown>;
  if (typeof raw.classKey !== "string" || !isScheduleDay(raw.sessionDate)) return { ok: false, denial: "invalid" };
  const dismiss = raw.dismiss === true;
  const rating = dismiss ? null : normalizeRatingInput(raw);
  if (!dismiss && !rating) return { ok: false, denial: "invalid" };

  const session = await openSessionFor(user, now);
  if (!session || session.classKey !== raw.classKey || session.day !== raw.sessionDate) {
    return { ok: false, denial: "closed" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, denial: "unavailable" };
  const row = rating
    ? { status: "rated", stars: rating.stars, tags: rating.tags, comment: rating.comment }
    : { status: "dismissed", stars: null, tags: [], comment: null };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      { class_key: session.classKey, session_date: session.day, user_id: user.id, ...row },
      { onConflict: "class_key,session_date,user_id", ignoreDuplicates: true },
    )
    .select("status");
  if (error) {
    if (!missingTable(error.message)) console.error("Supabase answerRating", error.message);
    return { ok: false, denial: "unavailable" };
  }
  // No row back means the learner already answered this session.
  if ((data ?? []).length === 0) return { ok: false, denial: "answered" };
  if (!rating) return { ok: true, xp: 0, session };

  const claim = await supabase
    .from(CLAIMS_TABLE)
    .upsert(
      {
        user_id: user.id,
        day_key: dayKey(now),
        quest_id: ratingClaimId(session.classKey, session.day),
        xp: RATING_XP,
        week_key: weekKey(now),
      },
      { onConflict: "user_id,day_key,quest_id", ignoreDuplicates: true },
    )
    .select("quest_id");
  if (claim.error) {
    // The rating is saved; only the reward is lost.
    console.error("Supabase rating XP claim", claim.error.message);
    return { ok: true, xp: 0, session };
  }
  return { ok: true, xp: (claim.data ?? []).length > 0 ? RATING_XP : 0, session };
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
