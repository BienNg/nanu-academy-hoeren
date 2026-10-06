import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ListeningSchemaError,
  adminListeningRunFromRow,
  isListeningSchemaMissing,
  clipOutcomeTotalFromRow,
  storedListeningRunFromRow,
  type AdminListeningRunRecord,
  type ClipOutcomeTotal,
  type ClipStatsRead,
  type ListeningReadStatus,
  type ListeningRunInput,
  type StoredListeningRun,
  type StudentRunsPage,
} from "@/lib/listening-runs";
import { googleProfileImage, isStudyXpSchemaMissing, isXpSchemaMissing } from "@/lib/xp";
import {
  isJumpRunsSchemaMissing,
  isJumpXpSchemaMissing,
  storedJumpRunFromRow,
  type JumpRun,
  type JumpRunOutcome,
  type StoredJumpRun,
  type StudentJumpRunsPage,
} from "@/lib/lesson-jump";
import { workplaceFromAccessSlug } from "@/lib/living-content";
import {
  DEFAULT_PROGRESS,
  completedChapterStamps,
  containsAccountStamps,
  levelAccessAfterPreUnlock,
  nextAppUseLog,
  nextSignInLog,
  normalizeGrantEmail,
  normalizeProgress,
  readAppUseRecords,
  readSignInRecords,
  trimSignInStamps,
  type AppUseRecord,
  type SignInContext,
  type SignInRecord,
  type StoredProgress,
} from "@/lib/progress";

const TABLE = "user_progress";
const PENDING_ACCESS_TABLE = "pending_level_access";
const JUMP_XP_TABLE = "lesson_jump_awards";
const JUMP_RUNS_TABLE = "lesson_jump_runs";
const RUNS_TABLE = "listening_runs";
const CLIPS_TABLE = "clip_results";
const XP_TABLE = "xp_awards";
const TOTALS_RPC = "clip_outcome_totals";
const STUDENT_RUN_PAGE = 25;

/**
 * Reserved `level_access` entry for "Luyện phỏng vấn theo nghề".
 * It is not a CEFR slug. Absent means the Home section stays hidden.
 */
export const INTERVIEW_ACCESS_SLUG = "interview";

export function hasInterviewAccess(slugs: readonly string[]): boolean {
  return slugs.includes(INTERVIEW_ACCESS_SLUG);
}

/** CEFR slugs only: drops the interview and Leben-in-Deutschland flags. */
export function withoutReservedAccess(slugs: readonly string[]): string[] {
  return slugs.filter(
    (slug) => slug !== INTERVIEW_ACCESS_SLUG && workplaceFromAccessSlug(slug) === null,
  );
}

/** Workplace slugs granted through reserved `living-<workplace>` entries. */
export function livingAccessFrom(slugs: readonly string[]): string[] {
  return slugs.flatMap((slug) => {
    const workplace = workplaceFromAccessSlug(slug);
    return workplace ? [workplace] : [];
  });
}

export { levelAccessAfterPreUnlock, normalizeGrantEmail };

/** ILIKE pattern that matches this email and nothing wider. */
function exactEmailIlike(email: string): string {
  return email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Vercel Marketplace may inject NEXT_PUBLIC_SUPABASE_URL; either works server-side. */
function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Prefer service_role; accept newer secret key name if Vercel/Supabase injects it. */
function supabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );
}

let adminClient: { url: string; key: string; client: SupabaseClient } | null = null;

/** One stateless service-role client per server instance, reused across requests. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) return null;
  if (adminClient && adminClient.url === url && adminClient.key === key) {
    return adminClient.client;
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  adminClient = { url, key, client };
  return client;
}

export function isProgressStoreConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

export async function getCloudProgress(
  userId: string,
): Promise<StoredProgress> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return structuredClone(DEFAULT_PROGRESS);

  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase getCloudProgress", error.message);
    return structuredClone(DEFAULT_PROGRESS);
  }
  if (!data?.data) return structuredClone(DEFAULT_PROGRESS);
  return normalizeProgress(data.data as Partial<StoredProgress>);
}

/** One student's document, sign-ins, and app uses. Admin detail panel only. */
export async function getAdminStudentDetail(userId: string): Promise<{
  progress: StoredProgress;
  signIns: SignInRecord[];
  appUses: AppUseRecord[];
} | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;

  const columnSets = [
    "data, sign_in_log, sign_ins, app_uses",
    "data, sign_in_log, sign_ins",
    "data, sign_ins",
    "data",
  ];
  let lastError = "";
  for (const columns of columnSets) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      lastError = error.message;
      continue;
    }
    if (!data) return null;
    const row = data as {
      data?: unknown;
      sign_in_log?: unknown;
      sign_ins?: unknown;
      app_uses?: unknown;
    };
    return {
      progress: normalizeProgress(row.data as Partial<StoredProgress>),
      signIns: readSignIns(row.sign_in_log, row.sign_ins),
      appUses: readAppUseRecords(row.app_uses),
    };
  }
  if (lastError) console.error("Supabase getAdminStudentDetail", lastError);
  return null;
}

export type UserProfileTouch = {
  email?: string | null;
  name?: string | null;
  /** Google profile photo. Anything else is ignored. */
  image?: string | null;
};

function isMissingImageColumn(message: string): boolean {
  return /image/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function isMissingSignInLogColumn(message: string): boolean {
  return /sign_in_log/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

function isMissingAppUsesColumn(message: string): boolean {
  return /app_uses/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

let loggedMissingImageColumn = false;
let imageColumnRetryAt = 0;
let loggedMissingSignInLogColumn = false;
let signInLogColumnRetryAt = 0;
let loggedMissingAppUsesColumn = false;
let appUsesColumnRetryAt = 0;

function appUseWritesPaused(): boolean {
  return Date.now() < appUsesColumnRetryAt;
}

function noteMissingAppUsesColumn(message: string): void {
  appUsesColumnRetryAt = Date.now() + 60_000;
  if (loggedMissingAppUsesColumn) return;
  loggedMissingAppUsesColumn = true;
  console.error(
    "user_progress.app_uses is missing. Re-run supabase/user_progress.sql.",
    message,
  );
}

function signInLogWritesPaused(): boolean {
  return Date.now() < signInLogColumnRetryAt;
}

function noteMissingSignInLogColumn(message: string): void {
  signInLogColumnRetryAt = Date.now() + 60_000;
  if (loggedMissingSignInLogColumn) return;
  loggedMissingSignInLogColumn = true;
  console.error(
    "user_progress.sign_in_log is missing. Re-run supabase/user_progress.sql.",
    message,
  );
}

function imageWritesPaused(): boolean {
  return Date.now() < imageColumnRetryAt;
}

function noteMissingImageColumn(message: string): void {
  imageColumnRetryAt = Date.now() + 60_000;
  if (loggedMissingImageColumn) return;
  loggedMissingImageColumn = true;
  console.error(
    "user_progress.image is missing. Re-run supabase/user_progress.sql.",
    message,
  );
}

/**
 * An account with no lesson progress must not take on another account's
 * history. Returns the existing document when the upload is a copy.
 * A detection failure allows the write so a learner is not blocked.
 */
export async function rejectCopiedInitialProgress(
  userId: string,
  incoming: StoredProgress,
): Promise<StoredProgress | null> {
  const incomingStamps = completedChapterStamps(incoming);
  if (incomingStamps.length === 0) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: own, error: ownError } = await supabase
    .from(TABLE)
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (ownError) {
    console.error("Supabase rejectCopiedInitialProgress", ownError.message);
    return null;
  }
  const ownProgress = normalizeProgress(asProgressData(own?.data));
  const ownStamps = new Set(completedChapterStamps(ownProgress));
  if (incomingStamps.every((stamp) => ownStamps.has(stamp))) return null;

  // Completion stamps live only under `learn`, so skip the rest of each
  // document (visits, videos, activity) to keep this scan's egress small.
  const { data: others, error } = await supabase
    .from(TABLE)
    .select("user_id, learn:data->learn")
    .neq("user_id", userId);
  if (error || !others) {
    if (error) console.error("Supabase rejectCopiedInitialProgress", error.message);
    return null;
  }

  const copied = others.some((row) => {
    const record = row as { user_id?: string; learn?: unknown };
    if (!record.user_id || record.user_id === userId) return false;
    return containsAccountStamps(
      incoming,
      normalizeProgress({ learn: record.learn as StoredProgress["learn"] }),
    );
  });
  if (!copied) return null;
  return ownProgress;
}

function asProgressData(value: unknown): Partial<StoredProgress> | null {
  if (!value || typeof value !== "object") return null;
  return value as Partial<StoredProgress>;
}

export async function setCloudProgress(
  userId: string,
  progress: StoredProgress,
  profile: UserProfileTouch = {},
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Progress store is not configured");
  }

  const payload = normalizeProgress(progress);
  const now = new Date().toISOString();
  // last_login_at here is last seen (a progress write), not a Google sign-in.
  const image = imageWritesPaused() ? null : googleProfileImage(profile.image);
  const withIdentity = {
    user_id: userId,
    data: payload,
    updated_at: now,
    last_login_at: now,
    ...(profile.email !== undefined ? { email: profile.email } : {}),
    ...(profile.name !== undefined ? { name: profile.name } : {}),
    ...(image ? { image } : {}),
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(withIdentity, { onConflict: "user_id" });

  if (!error) return;

  if (image && isMissingImageColumn(error.message)) {
    noteMissingImageColumn(error.message);
    const { image: _image, ...withoutImage } = withIdentity;
    const { error: retryError } = await supabase
      .from(TABLE)
      .upsert(withoutImage, { onConflict: "user_id" });
    if (!retryError) return;
  }

  const { error: fallbackError } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      data: payload,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (fallbackError) {
    throw new Error(`Supabase setCloudProgress: ${fallbackError.message}`);
  }
}

export type UserProgressListItem = {
  userId: string;
  email: string | null;
  name: string | null;
  /** Google profile photo, when the column exists and a sign-in stored one. */
  image: string | null;
  lastLoginAt: string | null;
  updatedAt: string | null;
  /** CEFR slugs an admin has granted. Empty means every level stays locked. */
  levelAccess: string[];
  /** When false, Home hides "Luyện phỏng vấn theo nghề" entirely. */
  interviewAccess: boolean;
  /** Leben-in-Deutschland workplace slugs an admin has granted. */
  livingAccess: string[];
  /** Admin-only class label. Never returned by the learner progress API. */
  className: string | null;
  /** Google sign-ins from the last 90 days, oldest first. Not app-open visits. */
  signIns: SignInRecord[];
  /** Learner app visits from the last 90 days, oldest first. */
  appUses: AppUseRecord[];
  /**
   * Limited dashboard access. Staff can see stats and grant classes and
   * courses. Full admins are a separate allowlist and ignore this flag.
   */
  staff: boolean;
  progress: StoredProgress;
};

const LIST_PAGE_SIZE = 1000;

type RawProgressRow = {
  user_id: string;
  data?: unknown;
  updated_at?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  last_login_at?: string | null;
  deleted_at?: string | null;
  level_access?: unknown;
  class_name?: unknown;
  sign_ins?: unknown;
  sign_in_log?: unknown;
  app_uses?: unknown;
  staff?: unknown;
  practiceDates?: unknown;
  lastPracticeDate?: unknown;
  streakTimeZone?: unknown;
  activity?: unknown;
  visits?: unknown;
  videos?: unknown;
  learn?: unknown;
  interview?: unknown;
};

/** Accepts a JS array or a Postgres array literal such as `{a1-1,a1-2}`. */
export function readLevelAccess(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parsePostgresTextArray(value)
      : [];
  const slugs: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (!slug || slugs.includes(slug)) continue;
    slugs.push(slug);
  }
  return slugs;
}

/** Admin class label. Empty and non-strings become "no class". */
export function readClassName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function parsePostgresTextArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return [];
  const inner =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed.slice(1, -1)
      : trimmed;
  if (!inner) return [];
  return inner.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

export function trimSignIns(values: readonly string[], now = Date.now()): string[] {
  return trimSignInStamps(values, now);
}

function readSignIns(log: unknown, stamps: unknown): SignInRecord[] {
  return readSignInRecords(log, stamps);
}

function mapProgressRow(row: RawProgressRow): UserProgressListItem {
  const access = readLevelAccess(row.level_access);
  return {
    userId: row.user_id,
    email: typeof row.email === "string" ? row.email : null,
    name: typeof row.name === "string" ? row.name : null,
    image: googleProfileImage(row.image),
    lastLoginAt:
      typeof row.last_login_at === "string" ? row.last_login_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    levelAccess: withoutReservedAccess(access),
    interviewAccess: hasInterviewAccess(access),
    livingAccess: livingAccessFrom(access),
    className: readClassName(row.class_name),
    signIns: readSignIns(row.sign_in_log, row.sign_ins),
    appUses: readAppUseRecords(row.app_uses),
    staff: row.staff === true,
    progress: normalizeProgress(progressSource(row)),
  };
}

function progressSource(row: RawProgressRow): Partial<StoredProgress> {
  const sliced =
    row.practiceDates !== undefined ||
    row.lastPracticeDate !== undefined ||
    row.streakTimeZone !== undefined ||
    row.activity !== undefined ||
    row.visits !== undefined ||
    row.videos !== undefined ||
    row.learn !== undefined ||
    row.interview !== undefined;
  if (!sliced) return (row.data ?? {}) as Partial<StoredProgress>;
  return {
    practiceDates: row.practiceDates as StoredProgress["practiceDates"],
    lastPracticeDate:
      typeof row.lastPracticeDate === "string" ? row.lastPracticeDate : undefined,
    streakTimeZone:
      typeof row.streakTimeZone === "string" ? row.streakTimeZone : undefined,
    activity: row.activity as StoredProgress["activity"],
    visits: row.visits as StoredProgress["visits"],
    videos: row.videos as StoredProgress["videos"],
    learn: row.learn as StoredProgress["learn"],
    interview: row.interview as StoredProgress["interview"],
  };
}

/**
 * Best-effort identity + last-seen write. `last_login_at` is the last time
 * this account touched the app, not a Google sign-in. Progress JSON is never
 * overwritten here; missing profile columns (pre-migration) are ignored.
 */
export async function touchUserProfile(
  userId: string,
  profile: UserProfileTouch = {},
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select("user_id, data")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("Supabase touchUserProfile read", readError.message);
    return;
  }

  const image = imageWritesPaused() ? null : googleProfileImage(profile.image);
  const patch: {
    last_login_at: string;
    email?: string | null;
    name?: string | null;
    image?: string;
  } = { last_login_at: now };
  if (profile.email !== undefined) patch.email = profile.email;
  if (profile.name !== undefined) patch.name = profile.name;
  if (image) patch.image = image;

  if (existing) {
    const { error } = await supabase.from(TABLE).update(patch).eq("user_id", userId);
    if (error && image && isMissingImageColumn(error.message)) {
      noteMissingImageColumn(error.message);
      const { image: _image, ...withoutImage } = patch;
      const { error: retryError } = await supabase
        .from(TABLE)
        .update(withoutImage)
        .eq("user_id", userId);
      if (retryError) console.error("Supabase touchUserProfile update", retryError.message);
      return;
    }
    if (error) {
      console.error("Supabase touchUserProfile update", error.message);
    }
    return;
  }

  const insertPayload = {
    user_id: userId,
    data: structuredClone(DEFAULT_PROGRESS),
    updated_at: now,
    level_access: [],
    ...patch,
  };
  const { error } = await supabase.from(TABLE).insert(insertPayload);

  if (error && image && isMissingImageColumn(error.message)) {
    noteMissingImageColumn(error.message);
    const { image: _image, ...withoutImage } = insertPayload;
    const { error: retryError } = await supabase.from(TABLE).insert(withoutImage);
    if (!retryError) return;
  }

  if (error) {
    const { error: fallbackError } = await supabase.from(TABLE).insert({
      user_id: userId,
      data: structuredClone(DEFAULT_PROGRESS),
      updated_at: now,
    });
    if (fallbackError) {
      console.error("Supabase touchUserProfile insert", fallbackError.message);
    }
  }
}

/**
 * One visit while a signed-in learner loads or saves progress.
 * The same device, browser, and city within 15 minutes stays one row.
 * A missing `app_uses` column is ignored until the SQL is re-run.
 */
export async function recordAppUse(
  userId: string,
  context: SignInContext,
  at = new Date(),
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId || appUseWritesPaused()) return;

  const { data, error } = await supabase
    .from(TABLE)
    .select("app_uses")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingAppUsesColumn(error.message)) {
      noteMissingAppUsesColumn(error.message);
      return;
    }
    console.error("Supabase recordAppUse read", error.message);
    return;
  }
  if (!data) return;

  const stampedAt = at.toISOString();
  const next = nextAppUseLog(
    (data as { app_uses?: unknown }).app_uses,
    {
      at: stampedAt,
      device: context.device,
      browser: context.browser,
      location: context.location,
    },
    at.getTime(),
  );
  if (!next.changed) return;

  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ app_uses: next.records })
    .eq("user_id", userId);
  if (updateError && isMissingAppUsesColumn(updateError.message)) {
    noteMissingAppUsesColumn(updateError.message);
    return;
  }
  if (updateError) console.error("Supabase recordAppUse update", updateError.message);
}

type SignInRow = {
  deleted_at?: string | null;
  sign_ins?: unknown;
  sign_in_log?: unknown;
  class_name?: unknown;
};

/**
 * `sign_ins` and `sign_in_log` are optional until `supabase/user_progress.sql`
 * has been re-run. A missing column must not skip the new-account Slack notice.
 */
async function readSignInRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ row: SignInRow | null; hasSignIns: boolean; hasSignInLog: boolean } | null> {
  const attempts: { columns: string; hasSignIns: boolean; hasSignInLog: boolean }[] = [
    {
      columns: "user_id, deleted_at, sign_ins, sign_in_log, class_name",
      hasSignIns: true,
      hasSignInLog: true,
    },
    { columns: "user_id, deleted_at, sign_ins, class_name", hasSignIns: true, hasSignInLog: false },
    { columns: "user_id, deleted_at, sign_ins", hasSignIns: true, hasSignInLog: false },
    { columns: "user_id, deleted_at", hasSignIns: false, hasSignInLog: false },
    { columns: "user_id", hasSignIns: false, hasSignInLog: false },
  ];

  let lastMessage = "read failed";
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(attempt.columns)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) {
      return {
        row: (data as SignInRow | null) ?? null,
        hasSignIns: attempt.hasSignIns,
        hasSignInLog: attempt.hasSignInLog,
      };
    }
    lastMessage = error.message;
  }

  console.error("Supabase recordUserSignIn read", lastMessage);
  return null;
}

/**
 * Append a Google sign-in. Called only when the Auth.js jwt callback receives
 * `account` (a real sign-in), never from a progress heartbeat.
 * `last_login_at` is left alone so it can keep meaning "last seen".
 * Returns whether a provided profile photo was stored.
 */
export async function recordUserSignIn(
  userId: string,
  profile: UserProfileTouch = {},
  at = new Date(),
  context: SignInContext = { device: null, browser: null, location: null },
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return false;

  const existing = await readSignInRow(supabase, userId);
  if (!existing) return false;

  const { row, hasSignIns, hasSignInLog } = existing;
  const stampedAt = at.toISOString();
  const signIns = hasSignIns
    ? trimSignIns([...readSignInRecords(null, row?.sign_ins).map((entry) => entry.at), stampedAt], at.getTime())
    : null;
  const signInLog =
    hasSignInLog && !signInLogWritesPaused()
      ? nextSignInLog(
          row?.sign_in_log,
          {
            at: stampedAt,
            device: context.device,
            browser: context.browser,
            location: context.location,
          },
          at.getTime(),
        )
      : null;
  const requestedImage = googleProfileImage(profile.image);
  const image = requestedImage && !imageWritesPaused() ? requestedImage : null;
  const identity = {
    ...(profile.email !== undefined ? { email: profile.email } : {}),
    ...(profile.name !== undefined ? { name: profile.name } : {}),
    ...(image ? { image } : {}),
  };
  const isNewAccount = !row || Boolean(row.deleted_at);
  const pending = profile.email
    ? await readPendingGrantForSignIn(supabase, profile.email)
    : null;
  const nextLevelAccess =
    pending && pending.slugs.length > 0
      ? levelAccessAfterPreUnlock(
          isNewAccount ? [] : await getUserLevelAccess(userId),
          pending.slugs,
          isNewAccount,
        )
      : null;
  const existingClass = readClassName(row?.class_name);
  const nextClass =
    pending?.className && (isNewAccount || !existingClass) ? pending.className : null;
  let imageSaved = !requestedImage;
  let wroteAccount = false;

  if (row) {
    let patch: Record<string, unknown> = {
      ...identity,
      ...(signIns ? { sign_ins: signIns } : {}),
      ...(signInLog ? { sign_in_log: signInLog } : {}),
      ...(nextLevelAccess ? { level_access: nextLevelAccess } : {}),
      ...(nextClass ? { class_name: nextClass } : {}),
    };
    if (Object.keys(patch).length > 0) {
      let updateError = (
        await supabase.from(TABLE).update(patch).eq("user_id", userId)
      ).error;
      if (updateError && signInLog && isMissingSignInLogColumn(updateError.message)) {
        noteMissingSignInLogColumn(updateError.message);
        const { sign_in_log: _log, ...withoutLog } = patch;
        patch = withoutLog;
        if (Object.keys(patch).length > 0) {
          updateError = (
            await supabase.from(TABLE).update(patch).eq("user_id", userId)
          ).error;
        } else {
          updateError = null;
        }
      }
      if (updateError && image && isMissingImageColumn(updateError.message)) {
        noteMissingImageColumn(updateError.message);
        const { image: _image, ...withoutImage } = patch;
        if (Object.keys(withoutImage).length > 0) {
          const { error: retryError } = await supabase
            .from(TABLE)
            .update(withoutImage)
            .eq("user_id", userId);
          if (retryError) {
            console.error("Supabase recordUserSignIn update", retryError.message);
            return false;
          }
          wroteAccount = true;
        }
      } else if (updateError) {
        console.error("Supabase recordUserSignIn update", updateError.message);
        return false;
      } else {
        wroteAccount = true;
        if (image) imageSaved = true;
      }
    }
  } else {
    const now = at.toISOString();
    let payload: Record<string, unknown> = {
      user_id: userId,
      data: structuredClone(DEFAULT_PROGRESS),
      updated_at: now,
      level_access: nextLevelAccess ?? [],
      ...(nextClass ? { class_name: nextClass } : {}),
      ...(signIns ? { sign_ins: signIns } : {}),
      ...(signInLog ? { sign_in_log: signInLog } : {}),
      ...identity,
    };
    let insertError = (await supabase.from(TABLE).insert(payload)).error;
    if (insertError && signInLog && isMissingSignInLogColumn(insertError.message)) {
      noteMissingSignInLogColumn(insertError.message);
      const { sign_in_log: _log, ...withoutLog } = payload;
      payload = withoutLog;
      insertError = (await supabase.from(TABLE).insert(payload)).error;
    }
    if (insertError && image && isMissingImageColumn(insertError.message)) {
      noteMissingImageColumn(insertError.message);
      const { image: _image, ...withoutImage } = payload;
      const { error: retryError } = await supabase.from(TABLE).insert(withoutImage);
      if (retryError) {
        console.error("Supabase recordUserSignIn insert", retryError.message);
        return false;
      }
      wroteAccount = true;
    } else if (insertError) {
      console.error("Supabase recordUserSignIn insert", insertError.message);
      return false;
    } else {
      wroteAccount = true;
      if (image) imageSaved = true;
    }
  }

  if (wroteAccount && pending && profile.email) {
    await forgetPendingLevelGrant(profile.email);
  }
  if (isNewAccount) await notifyNewUser(profile);
  return imageSaved;
}

/**
 * Store a Google profile photo on an account that already exists.
 * Used for sessions issued before the photo was saved. Does not create a row.
 */
export async function rememberUserImage(userId: string, image: string): Promise<boolean> {
  const safe = googleProfileImage(image);
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId || !safe || imageWritesPaused()) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ image: safe })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (error) {
    if (isMissingImageColumn(error.message)) {
      noteMissingImageColumn(error.message);
      return false;
    }
    console.error("Supabase rememberUserImage", error.message);
    return false;
  }
  return Boolean(data);
}

/** Posts when an account is created, or when a deleted account signs in again. */
async function notifyNewUser(profile: UserProfileTouch): Promise<void> {
  const url = process.env.SLACK_NEW_USER_WEBHOOK_URL?.trim();
  if (!url) {
    console.error("Slack new-user webhook is not configured");
    return;
  }

  const name = profile.name?.trim() || "Unknown";
  const email = profile.email?.trim() || "no email";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `New account: ${name} (${email})`,
      }),
    });
    if (!response.ok) {
      console.error("Slack new-user webhook", response.status);
    }
  } catch (error) {
    console.error("Slack new-user webhook", error);
  }
}

/**
 * How much of each progress document an admin screen needs.
 * `account` is identity plus the small streak fields.
 * `activity` adds visits, daily activity, and video watch state.
 * `videos` is the watch map plus visits (per-video playback seconds) for the videos board.
 * `levels` adds lesson and interview progress for the level paths.
 */
export type AdminListSlice = "account" | "activity" | "levels" | "videos";

const ADMIN_PROFILE_COLUMNS = [
  "user_id, updated_at, email, name, image, last_login_at, deleted_at, level_access, class_name, staff",
  "user_id, updated_at, email, name, image, last_login_at, deleted_at, level_access, class_name",
  "user_id, updated_at, email, name, last_login_at, deleted_at, level_access, class_name",
  "user_id, updated_at, email, name, last_login_at, deleted_at, level_access",
  "user_id, updated_at, email, name, last_login_at, deleted_at",
  "user_id, updated_at, email, name, last_login_at",
  "user_id, updated_at",
];

const FULL_PROGRESS_COLUMNS = [
  "user_id, data, updated_at, email, name, image, last_login_at, deleted_at, level_access, class_name, sign_ins, sign_in_log, app_uses, staff",
  "user_id, data, updated_at, email, name, image, last_login_at, deleted_at, level_access, class_name, sign_ins, sign_in_log, staff",
  "user_id, data, updated_at, email, name, image, last_login_at, deleted_at, level_access, class_name, sign_ins, staff",
  "user_id, data, updated_at, email, name, last_login_at, deleted_at, level_access, class_name, sign_ins",
  "user_id, data, updated_at, email, name, last_login_at, deleted_at, level_access, class_name",
  "user_id, data, updated_at, email, name, last_login_at, deleted_at, level_access",
  "user_id, data, updated_at, email, name, last_login_at, deleted_at",
  "user_id, data, updated_at, email, name, last_login_at",
  "user_id, data, updated_at",
];

function sliceProgressColumns(slice: AdminListSlice): string {
  const keys = [
    "practiceDates:data->practiceDates",
    "lastPracticeDate:data->lastPracticeDate",
    "streakTimeZone:data->streakTimeZone",
    "activity:data->activity",
  ];
  if (slice === "activity" || slice === "videos" || slice === "levels") {
    keys.push("videos:data->videos");
  }
  if (slice === "activity" || slice === "videos") keys.push("visits:data->visits");
  if (slice === "levels") {
    keys.push("learn:data->learn", "interview:data->interview");
  }
  return keys.join(", ");
}

async function fetchProgressPages(
  client: SupabaseClient,
  columns: string,
): Promise<RawProgressRow[] | null> {
  const rows: RawProgressRow[] = [];
  let from = 0;
  const hideDeleted = columns.includes("deleted_at");
  for (;;) {
    let query = client.from(TABLE).select(columns);
    if (hideDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.range(from, from + LIST_PAGE_SIZE - 1);
    if (error) return null;
    const page = (data ?? []) as unknown as RawProgressRow[];
    rows.push(...page);
    if (page.length < LIST_PAGE_SIZE) return rows;
    from += LIST_PAGE_SIZE;
  }
}

function listedProgress(rows: readonly RawProgressRow[]): UserProgressListItem[] {
  return rows.filter((row) => !row.deleted_at).map(mapProgressRow);
}

export async function listAllUserProgress(
  slice: AdminListSlice = "account",
): Promise<UserProgressListItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const progressColumns = sliceProgressColumns(slice);
  const withSignIns = slice === "activity";
  for (const profile of ADMIN_PROFILE_COLUMNS) {
    const base = `${profile}, ${progressColumns}`;
    const sets = withSignIns ? [`${base}, sign_ins`, base] : [base];
    for (const columns of sets) {
      const result = await fetchProgressPages(supabase, columns);
      if (result) return listedProgress(result);
    }
  }

  // A project that rejects JSON-key selects still opens the dashboard.
  console.error(
    "Supabase listAllUserProgress",
    `slice ${slice} failed, reading full progress documents`,
  );
  for (const columns of FULL_PROGRESS_COLUMNS) {
    const result = await fetchProgressPages(supabase, columns);
    if (result) return listedProgress(result);
  }
  console.error("Supabase listAllUserProgress", "every column set failed");
  return [];
}

/**
 * Wipe an account's progress and leave a tombstone. The tombstone is what
 * revokes sessions that were issued before the deletion, so a signed-in
 * browser cannot push its stale local progress back into the table.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Progress store is not configured");
  }

  await deleteUserXpAwards(supabase, userId);
  await deleteUserListeningRuns(supabase, userId);
  await deleteUserJumpRuns(supabase, userId, "all");

  const now = new Date().toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      data: structuredClone(DEFAULT_PROGRESS),
      updated_at: now,
      email: null,
      name: null,
      last_login_at: null,
      deleted_at: now,
      revoked_before: now,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(
      `Could not delete this account (${error.message}). Run supabase/user_progress.sql once to add the deleted_at and revoked_before columns.`,
    );
  }

  // A later sign-in starts locked again. Ignore a missing column so delete
  // still works before the level_access migration is applied.
  const { error: accessError } = await supabase
    .from(TABLE)
    .update({ level_access: [] })
    .eq("user_id", userId);
  if (accessError) {
    console.error("Supabase deleteUserAccount level_access", accessError.message);
  }

  const { error: classError } = await supabase
    .from(TABLE)
    .update({ class_name: null })
    .eq("user_id", userId);
  if (classError) {
    console.error("Supabase deleteUserAccount class_name", classError.message);
  }

  const { error: staffError } = await supabase
    .from(TABLE)
    .update({ staff: false })
    .eq("user_id", userId);
  if (staffError) {
    console.error("Supabase deleteUserAccount staff", staffError.message);
  }
}

/**
 * CEFR slugs granted to this learner. Missing rows and a missing column both
 * mean no access, so a new sign-up stays locked until an admin grants a level.
 */
export const getUserLevelAccess = cache(async (userId: string): Promise<string[]> => {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("level_access")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return [];
  return readLevelAccess((data as { level_access?: unknown }).level_access);
});

export type PendingLevelGrant = {
  email: string;
  levelAccess: string[];
  interviewAccess: boolean;
  livingAccess: string[];
  className: string | null;
  updatedAt: string | null;
};

function mapPendingGrant(row: {
  email?: unknown;
  level_access?: unknown;
  class_name?: unknown;
  updated_at?: unknown;
}): PendingLevelGrant | null {
  if (typeof row.email !== "string") return null;
  const email = normalizeGrantEmail(row.email);
  if (!email) return null;
  const access = readLevelAccess(row.level_access);
  return {
    email,
    levelAccess: withoutReservedAccess(access),
    interviewAccess: hasInterviewAccess(access),
    livingAccess: livingAccessFrom(access),
    className: readClassName(row.class_name),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function pendingGrantIsActive(grant: PendingLevelGrant): boolean {
  return (
    grant.levelAccess.length > 0 ||
    grant.interviewAccess ||
    grant.livingAccess.length > 0 ||
    Boolean(grant.className)
  );
}

function isMissingPendingClassColumn(message: string): boolean {
  return /class_name/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

/** Active account for this email, if one has already signed in. */
export async function findActiveUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeGrantEmail(email);
  if (!supabase || !normalized) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("user_id, deleted_at")
    .ilike("email", exactEmailIlike(normalized))
    .limit(5);

  if (error) {
    throw new Error(
      `Could not check this email (${error.message}). Run supabase/user_progress.sql once.`,
    );
  }

  const match = (data ?? []).find(
    (row) =>
      typeof row.user_id === "string" &&
      row.user_id &&
      !row.deleted_at,
  );
  return match && typeof match.user_id === "string" ? match.user_id : null;
}

/** `null` means the pending-grant table could not be read. */
export async function listPendingLevelGrants(): Promise<PendingLevelGrant[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let { data, error } = await supabase
    .from(PENDING_ACCESS_TABLE)
    .select("email, level_access, class_name, updated_at")
    .order("email", { ascending: true })
    .limit(500);

  if (error && isMissingPendingClassColumn(error.message)) {
    const fallback = await supabase
      .from(PENDING_ACCESS_TABLE)
      .select("email, level_access, updated_at")
      .order("email", { ascending: true })
      .limit(500);
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    const missingTable = /does not exist|schema cache|could not find/i.test(error.message);
    if (!missingTable) {
      console.error("Supabase listPendingLevelGrants", error.message);
    }
    return null;
  }

  const grants: PendingLevelGrant[] = [];
  for (const row of data ?? []) {
    const grant = mapPendingGrant(row);
    if (grant && pendingGrantIsActive(grant)) {
      grants.push(grant);
    }
  }
  return grants;
}

async function readPendingGrantForSignIn(
  supabase: SupabaseClient,
  email: string,
): Promise<{ slugs: string[]; className: string | null } | null> {
  const normalized = normalizeGrantEmail(email);
  if (!normalized) return null;

  let { data, error } = await supabase
    .from(PENDING_ACCESS_TABLE)
    .select("level_access, class_name")
    .eq("email", normalized)
    .maybeSingle();

  if (error && isMissingPendingClassColumn(error.message)) {
    const fallback = await supabase
      .from(PENDING_ACCESS_TABLE)
      .select("level_access")
      .eq("email", normalized)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    console.error("Supabase readPendingGrantForSignIn", error.message);
    return null;
  }
  if (!data) return null;
  const slugs = readLevelAccess((data as { level_access?: unknown }).level_access);
  const className = readClassName((data as { class_name?: unknown }).class_name);
  if (slugs.length === 0 && !className) return null;
  return { slugs, className };
}

export async function upsertPendingLevelGrant(
  email: string,
  levelSlugs: readonly string[],
  className: string | null = null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Cloud progress store is not configured");
  }
  const normalized = normalizeGrantEmail(email);
  if (!normalized) {
    throw new Error("Enter a valid email address.");
  }
  const storedClass = readClassName(className);
  if (levelSlugs.length === 0 && !storedClass) {
    await deletePendingLevelGrant(normalized);
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    email: normalized,
    level_access: [...levelSlugs],
    class_name: storedClass,
    updated_at: now,
  };
  let { error } = await supabase
    .from(PENDING_ACCESS_TABLE)
    .upsert(payload, { onConflict: "email" });

  if (error && isMissingPendingClassColumn(error.message)) {
    if (storedClass) {
      throw new Error(
        "Could not save this class. Run supabase/pending_level_access.sql again to add class_name.",
      );
    }
    const { class_name: _className, ...withoutClass } = payload;
    const fallback = await supabase
      .from(PENDING_ACCESS_TABLE)
      .upsert(withoutClass, { onConflict: "email" });
    error = fallback.error;
  }

  if (error) {
    throw new Error(
      `Could not save this pre-unlock (${error.message}). Run supabase/pending_level_access.sql once.`,
    );
  }
}

export async function deletePendingLevelGrant(email: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Cloud progress store is not configured");
  }
  const normalized = normalizeGrantEmail(email);
  if (!normalized) {
    throw new Error("Enter a valid email address.");
  }

  const { error } = await supabase
    .from(PENDING_ACCESS_TABLE)
    .delete()
    .eq("email", normalized);

  if (error) {
    throw new Error(
      `Could not remove this pre-unlock (${error.message}). Run supabase/pending_level_access.sql once.`,
    );
  }
}

/** Best-effort. A failed delete is retried the next time this email signs in. */
async function forgetPendingLevelGrant(email: string): Promise<void> {
  try {
    await deletePendingLevelGrant(email);
  } catch (error) {
    console.error("Supabase forgetPendingLevelGrant", error);
  }
}

export async function getStoredUserEmail(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return typeof data.email === "string" ? data.email : null;
}

export async function setUserLevelAccess(
  userId: string,
  levelSlugs: readonly string[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Cloud progress store is not configured");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ level_access: [...levelSlugs] })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    throw new Error(
      `Could not update level access (${error.message}). Run supabase/user_progress.sql once to add the level_access column.`,
    );
  }

  if (!data || data.length === 0) {
    throw new Error("This user has not signed in yet.");
  }
}

/** True when `level_access` contains the reserved interview slug. */
export const getUserInterviewAccess = cache(async (userId: string): Promise<boolean> => {
  const slugs = await getUserLevelAccess(userId);
  return hasInterviewAccess(slugs);
});

/** Leben-in-Deutschland workplace slugs from reserved `living-<workplace>` entries. */
export const getUserLivingAccess = cache(async (userId: string): Promise<string[]> => {
  const slugs = await getUserLevelAccess(userId);
  return livingAccessFrom(slugs);
});

const CLASS_NAME_MAX_LENGTH = 64;

/** Admin-only. Passing null clears the class. Learner progress writes leave this column alone. */
export async function setUserClass(
  userId: string,
  className: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Cloud progress store is not configured");
  }

  const normalized = readClassName(className);
  if (normalized && normalized.length > CLASS_NAME_MAX_LENGTH) {
    throw new Error("Class names can be at most 64 characters.");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ class_name: normalized })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    throw new Error(
      `Could not update class (${error.message}). Run supabase/user_progress.sql once to add the class_name column.`,
    );
  }

  if (!data || data.length === 0) {
    throw new Error("This user has not signed in yet.");
  }
}

/** True when this account may open the dashboard as staff. A missing column means no. */
export const getUserStaff = cache(async (userId: string): Promise<boolean> => {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("staff")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return (data as { staff?: unknown }).staff === true;
});

/** The admin-set class label for one learner, or null when they have none. */
export const getUserClassName = cache(async (userId: string): Promise<string | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("class_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return readClassName((data as { class_name?: unknown }).class_name);
});

/** Full admins only. Grants or removes staff dashboard access. */
export async function setUserStaff(userId: string, staff: boolean): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Cloud progress store is not configured");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ staff })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    throw new Error(
      `Could not update staff access (${error.message}). Run supabase/user_progress.sql once to add the staff column.`,
    );
  }

  if (!data || data.length === 0) {
    throw new Error("This user has not signed in yet.");
  }
}

export type AccountAccess = "active" | "revoked";

/**
 * Decides whether a session may still touch its account. A sign-in that
 * happened after the deletion clears the tombstone and starts from zero.
 */
export async function resolveAccountAccess(
  userId: string,
  authAtSeconds: number | undefined,
): Promise<AccountAccess> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "active";

  const { data, error } = await supabase
    .from(TABLE)
    .select("deleted_at, revoked_before")
    .eq("user_id", userId)
    .maybeSingle();

  // Pre-migration tables have neither column; keep the app usable.
  if (error) return "active";

  const row = data as {
    deleted_at?: string | null;
    revoked_before?: string | null;
  } | null;
  if (!row) return "active";

  const revokedMs = row.revoked_before
    ? new Date(row.revoked_before).getTime()
    : Number.NaN;
  if (!Number.isNaN(revokedMs)) {
    const authMs = (authAtSeconds ?? 0) * 1000;
    // The cutoff outlives the tombstone, so other devices still holding a
    // pre-deletion session can never resurrect the old progress.
    if (authMs <= revokedMs) return "revoked";
  }

  if (!row.deleted_at) return "active";

  const { error: reviveError } = await supabase
    .from(TABLE)
    .update({
      data: structuredClone(DEFAULT_PROGRESS),
      updated_at: new Date().toISOString(),
      email: null,
      name: null,
      last_login_at: null,
      deleted_at: null,
    })
    .eq("user_id", userId);

  if (reviveError) {
    console.error("Supabase resolveAccountAccess revive", reviveError.message);
    return "revoked";
  }

  return "active";
}

function emptyStudentRuns(status: StudentRunsPage["status"]): StudentRunsPage {
  return { status, runs: [], total: 0, passed: 0, failed: 0 };
}

function throwIfListeningSchemaMissing(message: string): void {
  if (isListeningSchemaMissing(message)) throw new ListeningSchemaError(message);
}

async function deleteUserListeningRuns(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from(RUNS_TABLE).delete().eq("user_id", userId);
  if (!error || isListeningSchemaMissing(error.message)) return;
  throw new Error(`Could not delete listening runs (${error.message}).`);
}

/**
 * Remove finished listening parts, and the XP rows that point at them.
 * `lessonKeys` of `"all"` clears every run for the student.
 */
export async function deleteListeningRunsForLessons(
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;

  const xp = supabase.from(XP_TABLE).delete().eq("user_id", userId);
  const xpQuery = lessonKeys === "all" ? xp : xp.in("lesson_key", [...lessonKeys]);
  const xpResult = await xpQuery;
  if (xpResult.error && !isXpSchemaMissing(xpResult.error.message)) {
    throw new Error(`Could not delete XP (${xpResult.error.message}).`);
  }
  await deleteUserJumpXp(supabase, userId, lessonKeys);
  await deleteUserJumpRuns(supabase, userId, lessonKeys);

  const runs = supabase.from(RUNS_TABLE).delete().eq("user_id", userId);
  const runsQuery = lessonKeys === "all" ? runs : runs.in("lesson_key", [...lessonKeys]);
  const runsResult = await runsQuery;
  if (runsResult.error && !isListeningSchemaMissing(runsResult.error.message)) {
    throw new Error(`Could not delete listening runs (${runsResult.error.message}).`);
  }
}

async function deleteUserXpAwards(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from(XP_TABLE).delete().eq("user_id", userId);
  if (!error || isXpSchemaMissing(error.message)) {
    await deleteUserStudyXp(supabase, userId, "all");
    await deleteUserJumpXp(supabase, userId, "all");
    return;
  }
  throw new Error(`Could not delete XP (${error.message}).`);
}

async function deleteUserStudyXp(
  supabase: SupabaseClient,
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;
  const query = supabase.from("study_xp_awards").delete().eq("user_id", userId);
  const scoped = lessonKeys === "all" ? query : query.in("lesson_key", [...lessonKeys]);
  const { error } = await scoped;
  if (!error || isStudyXpSchemaMissing(error.message)) return;
  throw new Error(`Could not delete study XP (${error.message}).`);
}

/** Jump XP goes with practice: a Lektion cleared of practice can be skipped, and paid, again. */
async function deleteUserJumpXp(
  supabase: SupabaseClient,
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;
  const query = supabase.from(JUMP_XP_TABLE).delete().eq("user_id", userId);
  const scoped = lessonKeys === "all" ? query : query.in("lesson_key", [...lessonKeys]);
  const { error } = await scoped;
  if (!error || isJumpXpSchemaMissing(error.message)) return;
  throw new Error(`Could not delete jump XP (${error.message}).`);
}

async function deleteUserJumpRuns(
  supabase: SupabaseClient,
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  if (lessonKeys !== "all" && lessonKeys.length === 0) return;
  const query = supabase.from(JUMP_RUNS_TABLE).delete().eq("user_id", userId);
  const scoped = lessonKeys === "all" ? query : query.in("lesson_key", [...lessonKeys]);
  const { error } = await scoped;
  if (!error || isJumpRunsSchemaMissing(error.message)) return;
  throw new Error(`Could not delete jump tests (${error.message}).`);
}

/** Remove study XP for the lessons an admin just cleared. */
export async function deleteStudyXpForLessons(
  userId: string,
  lessonKeys: "all" | readonly string[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");
  await deleteUserStudyXp(supabase, userId, lessonKeys);
}

/** Insert one finished part. A repeated id is ignored so a retry does not double-count. */
export async function insertListeningRun(
  userId: string,
  input: ListeningRunInput,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Progress store is not configured");

  const runRow = (withCards: boolean) => ({
    id: input.id,
    user_id: userId,
    lesson_key: input.lessonKey,
    part_number: input.partNumber,
    part_count: input.partCount,
    outcome: input.outcome,
    accuracy: input.accuracy,
    answered_count: input.answeredCount,
    clip_count: input.clipCount,
    elapsed_ms: input.elapsedMs,
    ...(withCards && input.cardCount != null ? { card_count: input.cardCount } : {}),
  });

  let { data, error } = await supabase
    .from(RUNS_TABLE)
    .upsert(runRow(true), { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error && schemaObjectMissing(error.message, "card_count")) {
    ({ data, error } = await supabase
      .from(RUNS_TABLE)
      .upsert(runRow(false), { onConflict: "id", ignoreDuplicates: true })
      .select("id"));
  }

  if (error) {
    throwIfListeningSchemaMissing(error.message);
    throw new Error(`Supabase insertListeningRun: ${error.message}`);
  }
  if (!data || data.length === 0 || input.clips.length === 0) return;

  const clipRows = (withKinds: boolean, withAnswers: boolean) =>
    input.clips.map((clip, position) => ({
      run_id: input.id,
      user_id: userId,
      lesson_key: input.lessonKey,
      clip_id: clip.clipId,
      passed: clip.passed,
      missed: clip.missed,
      position,
      ...(withKinds ? { missed_kinds: clip.missed ? (clip.missedKinds ?? []) : [] } : {}),
      ...(withAnswers ? { missed_answers: clip.missed ? (clip.missedAnswers ?? {}) : {} } : {}),
    }));

  let { error: clipError } = await supabase.from(CLIPS_TABLE).insert(clipRows(true, true));
  if (clipError && schemaObjectMissing(clipError.message, "missed_answers")) {
    ({ error: clipError } = await supabase.from(CLIPS_TABLE).insert(clipRows(true, false)));
  }
  if (clipError && schemaObjectMissing(clipError.message, "missed_kinds")) {
    ({ error: clipError } = await supabase.from(CLIPS_TABLE).insert(clipRows(false, false)));
  }
  if (!clipError) return;

  const { error: rollbackError } = await supabase.from(RUNS_TABLE).delete().eq("id", input.id);
  if (rollbackError) {
    console.error("Supabase insertListeningRun rollback", rollbackError.message);
  }
  throwIfListeningSchemaMissing(clipError.message);
  throw new Error(`Supabase insertListeningRun clips: ${clipError.message}`);
}

type ListeningRunWindow = { fromIso: string; toIso: string };

function applyRunWindow<T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(
  query: T,
  window: ListeningRunWindow | null,
): T {
  if (!window) return query;
  return query.gte("created_at", window.fromIso).lt("created_at", window.toIso);
}

async function countListeningRuns(
  supabase: SupabaseClient,
  userId: string,
  outcome?: ListeningRunInput["outcome"],
  window: ListeningRunWindow | null = null,
): Promise<number> {
  let query = supabase
    .from(RUNS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  query = applyRunWindow(query, window);
  if (outcome) query = query.eq("outcome", outcome);
  const { count, error } = await query;
  if (error) {
    throwIfListeningSchemaMissing(error.message);
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function listStudentListeningRuns(
  userId: string,
  offset = 0,
  window: ListeningRunWindow | null = null,
): Promise<StudentRunsPage> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyStudentRuns("error");

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  try {
    const studentRunsSelect = (columns: string) =>
      applyRunWindow(
        supabase
          .from(RUNS_TABLE)
          .select(columns)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        window,
      ).range(start, start + STUDENT_RUN_PAGE - 1);

    const runColumns =
      "id, lesson_key, part_number, part_count, outcome, accuracy, answered_count, clip_count, elapsed_ms, created_at";
    const selectRuns = (withCards: boolean, withKinds: boolean, withAnswers: boolean) =>
      studentRunsSelect(
        `${withCards ? `${runColumns}, card_count` : runColumns}, clip_results(clip_id, passed, missed, position${
          withKinds ? ", missed_kinds" : ""
        }${withAnswers ? ", missed_answers" : ""})`,
      );

    let withCards = true;
    let withKinds = true;
    let withAnswers = true;
    let list = await selectRuns(withCards, withKinds, withAnswers);
    if (list.error && schemaObjectMissing(list.error.message, "card_count")) {
      withCards = false;
      list = await selectRuns(withCards, withKinds, withAnswers);
    }
    if (list.error && schemaObjectMissing(list.error.message, "missed_answers")) {
      withAnswers = false;
      list = await selectRuns(withCards, withKinds, withAnswers);
    }
    if (list.error && schemaObjectMissing(list.error.message, "missed_kinds")) {
      withKinds = false;
      list = await selectRuns(withCards, withKinds, withAnswers);
    }

    if (list.error) {
      if (isListeningSchemaMissing(list.error.message)) return emptyStudentRuns("missing");
      console.error("Supabase listStudentListeningRuns", list.error.message);
      return emptyStudentRuns("error");
    }

    const [total, passed, failed] = await Promise.all([
      countListeningRuns(supabase, userId, undefined, window),
      countListeningRuns(supabase, userId, "success", window),
      countListeningRuns(supabase, userId, "fail", window),
    ]);
    const runs = (list.data ?? [])
      .map((row) => storedListeningRunFromRow(row))
      .filter((run): run is StoredListeningRun => run != null);
    return { status: "ready", runs, total, passed, failed };
  } catch (error) {
    if (error instanceof ListeningSchemaError) return emptyStudentRuns("missing");
    const message = error instanceof Error ? error.message : "read failed";
    if (isListeningSchemaMissing(message)) return emptyStudentRuns("missing");
    console.error("Supabase listStudentListeningRuns", message);
    return emptyStudentRuns("error");
  }
}

/**
 * Log one jump test attempt. A finished attempt replaces the quit row a
 * closing tab may have sent first; a quit never replaces a finished one.
 * A missing table is ignored so the jump itself still works.
 */
export async function insertJumpRun(userId: string, run: JumpRun): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const row = {
    id: run.id,
    user_id: userId,
    lesson_key: run.lessonKey,
    outcome: run.outcome,
    card_count: run.cardCount,
    answered_count: run.answeredCount,
    mistakes: run.mistakes,
    accuracy: run.accuracy,
    elapsed_ms: run.elapsedMs,
    cards: run.cards,
  };
  const inserted = await supabase
    .from(JUMP_RUNS_TABLE)
    .upsert(row, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  let error = inserted.error;
  if (!error && (inserted.data ?? []).length === 0 && run.outcome !== "quit") {
    ({ error } = await supabase
      .from(JUMP_RUNS_TABLE)
      .update({ ...row, created_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("user_id", userId)
      .eq("outcome", "quit"));
  }
  if (error && !isJumpRunsSchemaMissing(error.message)) {
    console.error("Supabase insertJumpRun", error.message);
  }
}

async function countJumpRuns(
  supabase: SupabaseClient,
  userId: string,
  outcome: JumpRunOutcome | undefined,
  window: ListeningRunWindow | null,
): Promise<number> {
  let query = supabase
    .from(JUMP_RUNS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  query = applyRunWindow(query, window);
  if (outcome) query = query.eq("outcome", outcome);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function emptyJumpRuns(status: StudentJumpRunsPage["status"]): StudentJumpRunsPage {
  return { status, runs: [], total: 0, passed: 0, failed: 0, quit: 0 };
}

export async function listStudentJumpRuns(
  userId: string,
  offset = 0,
  window: ListeningRunWindow | null = null,
): Promise<StudentJumpRunsPage> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyJumpRuns("error");

  const start = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 10_000) : 0;
  try {
    const list = await applyRunWindow(
      supabase
        .from(JUMP_RUNS_TABLE)
        .select(
          "id, lesson_key, outcome, card_count, answered_count, mistakes, accuracy, elapsed_ms, cards, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      window,
    ).range(start, start + STUDENT_RUN_PAGE - 1);
    if (list.error) throw new Error(list.error.message);

    const [total, passed, failed, quit] = await Promise.all([
      countJumpRuns(supabase, userId, undefined, window),
      countJumpRuns(supabase, userId, "success", window),
      countJumpRuns(supabase, userId, "fail", window),
      countJumpRuns(supabase, userId, "quit", window),
    ]);
    const runs = (list.data ?? [])
      .map((row) => storedJumpRunFromRow(row))
      .filter((run): run is StoredJumpRun => run != null);
    return { status: "ready", runs, total, passed, failed, quit };
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    if (isJumpRunsSchemaMissing(message)) return emptyJumpRuns("missing");
    console.error("Supabase listStudentJumpRuns", message);
    return emptyJumpRuns("error");
  }
}

export async function listClipOutcomeTotals(): Promise<ClipStatsRead> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", rows: [] };

  const { data, error } = await supabase.rpc(TOTALS_RPC);
  if (error) {
    if (isListeningSchemaMissing(error.message)) return { status: "missing", rows: [] };
    console.error("Supabase listClipOutcomeTotals", error.message);
    return { status: "error", rows: [] };
  }

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => clipOutcomeTotalFromRow(row))
    .filter((row): row is ClipOutcomeTotal => row != null);
  return { status: "ready", rows };
}

/**
 * Finished practice parts whose `created_at` is in `[fromIso, toIso)`, for the
 * given students. `runs` counts a whole lesson: the last part passed.
 */
export async function countAdminPracticeParts(
  fromIso: string,
  toIso: string,
  learnerIds: ReadonlySet<string>,
): Promise<{
  ready: boolean;
  parts: number;
  runs: number;
  passedByUser: Record<string, number>;
  partsByUser: Record<string, number>;
}> {
  const supabase = getSupabaseAdmin();
  const passedByUser: Record<string, number> = {};
  const partsByUser: Record<string, number> = {};
  if (!supabase) return { ready: false, parts: 0, runs: 0, passedByUser, partsByUser };
  if (learnerIds.size === 0) {
    return { ready: true, parts: 0, runs: 0, passedByUser, partsByUser };
  }

  const counted = await readPracticePartCounts(supabase, fromIso, toIso, learnerIds);
  if (counted) return counted;

  let parts = 0;
  let runs = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .select("user_id, outcome, part_number, part_count")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) {
      if (!isListeningSchemaMissing(error.message)) {
        console.error("Supabase countAdminPracticeParts", error.message);
      }
      return { ready: false, parts: 0, runs: 0, passedByUser, partsByUser };
    }
    const page = (data ?? []) as {
      user_id?: unknown;
      outcome?: unknown;
      part_number?: unknown;
      part_count?: unknown;
    }[];
    for (const row of page) {
      if (typeof row.user_id !== "string" || !learnerIds.has(row.user_id)) continue;
      parts += 1;
      partsByUser[row.user_id] = (partsByUser[row.user_id] ?? 0) + 1;
      if (row.outcome !== "success") continue;
      passedByUser[row.user_id] = (passedByUser[row.user_id] ?? 0) + 1;
      if (
        typeof row.part_number === "number" &&
        row.part_number === row.part_count
      ) {
        runs += 1;
      }
    }
    if (page.length < LIST_PAGE_SIZE) {
      return { ready: true, parts, runs, passedByUser, partsByUser };
    }
    from += LIST_PAGE_SIZE;
  }
}

export async function listAdminListeningRuns(): Promise<{
  status: ListeningReadStatus;
  rows: AdminListeningRunRecord[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "error", rows: [] };

  const rows: AdminListeningRunRecord[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .select(
        "id, user_id, lesson_key, part_number, part_count, outcome, accuracy, answered_count, clip_count, elapsed_ms, created_at",
      )
      .order("created_at", { ascending: false })
      .range(from, from + LIST_PAGE_SIZE - 1);
    if (error) {
      if (isListeningSchemaMissing(error.message)) return { status: "missing", rows: [] };
      console.error("Supabase listAdminListeningRuns", error.message);
      return { status: "error", rows: [] };
    }
    const page = (data ?? []) as unknown[];
    for (const raw of page) {
      const run = adminListeningRunFromRow(raw);
      if (run) rows.push(run);
    }
    if (page.length < LIST_PAGE_SIZE) return { status: "ready", rows };
    from += LIST_PAGE_SIZE;
  }
}

const MISS_ID_CHUNK = 100;

/**
 * Missed clip ids for the given runs, in clip order. One follow-up for the
 * parts already on the page, not every clip of every historical run.
 */
export async function listAdminMissedClipIds(
  runIds: readonly string[],
): Promise<Record<string, string[]>> {
  const supabase = getSupabaseAdmin();
  const missed: Record<string, string[]> = {};
  if (!supabase || runIds.length === 0) return missed;

  for (let index = 0; index < runIds.length; index += MISS_ID_CHUNK) {
    const chunk = runIds.slice(index, index + MISS_ID_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(CLIPS_TABLE)
        .select("run_id, clip_id, position")
        .eq("missed", true)
        .in("run_id", chunk)
        .order("run_id", { ascending: true })
        .order("position", { ascending: true })
        .range(from, from + LIST_PAGE_SIZE - 1);
      if (error) {
        if (!isListeningSchemaMissing(error.message)) {
          console.error("Supabase listAdminMissedClipIds", error.message);
        }
        return missed;
      }
      const page = (data ?? []) as { run_id?: unknown; clip_id?: unknown }[];
      for (const row of page) {
        if (typeof row.run_id !== "string" || typeof row.clip_id !== "string") continue;
        const list = missed[row.run_id] ?? [];
        list.push(row.clip_id);
        missed[row.run_id] = list;
      }
      if (page.length < LIST_PAGE_SIZE) break;
      from += LIST_PAGE_SIZE;
    }
  }
  return missed;
}

export type AdminStoreProbeStatus = "ok" | "missing" | "error" | "skipped";

export type AdminStoreProbe = {
  id: string;
  label: string;
  sqlFile: string;
  /** Missing tables fail Health. Missing columns that the app already degrades around warn. */
  severity: "fail" | "warn";
  status: AdminStoreProbeStatus;
  detail: string;
};

type StoreProbeSpec = {
  id: string;
  label: string;
  sqlFile: string;
  severity: "fail" | "warn";
  kind: "table" | "column" | "rpc";
  table?: string;
  column?: string;
  rpc?: string;
  dependsOn?: string;
};

const STORE_PROBE_SPECS: readonly StoreProbeSpec[] = [
  {
    id: "user_progress",
    label: "user_progress",
    sqlFile: "supabase/user_progress.sql",
    severity: "fail",
    kind: "table",
    table: TABLE,
    column: "user_id",
  },
  {
    id: "user_progress.image",
    label: "user_progress.image",
    sqlFile: "supabase/user_progress.sql",
    severity: "warn",
    kind: "column",
    table: TABLE,
    column: "image",
    dependsOn: "user_progress",
  },
  {
    id: "listening_runs",
    label: "listening_runs",
    sqlFile: "supabase/listening_runs.sql",
    severity: "fail",
    kind: "table",
    table: RUNS_TABLE,
    column: "id",
  },
  {
    id: "listening_runs.card_count",
    label: "listening_runs.card_count",
    sqlFile: "supabase/clip_result_kinds.sql",
    severity: "warn",
    kind: "column",
    table: RUNS_TABLE,
    column: "card_count",
    dependsOn: "listening_runs",
  },
  {
    id: "clip_results",
    label: "clip_results",
    sqlFile: "supabase/listening_runs.sql",
    severity: "fail",
    kind: "table",
    table: CLIPS_TABLE,
    column: "id",
  },
  {
    id: "clip_results.missed_kinds",
    label: "clip_results.missed_kinds",
    sqlFile: "supabase/clip_result_kinds.sql",
    severity: "warn",
    kind: "column",
    table: CLIPS_TABLE,
    column: "missed_kinds",
    dependsOn: "clip_results",
  },
  {
    id: "clip_results.missed_answers",
    label: "clip_results.missed_answers",
    sqlFile: "supabase/clip_result_answers.sql",
    severity: "warn",
    kind: "column",
    table: CLIPS_TABLE,
    column: "missed_answers",
    dependsOn: "clip_results",
  },
  {
    id: "clip_outcome_totals",
    label: "clip_outcome_totals()",
    sqlFile: "supabase/listening_runs.sql",
    severity: "fail",
    kind: "rpc",
    rpc: TOTALS_RPC,
    dependsOn: "clip_results",
  },
  {
    id: "xp_awards",
    label: "xp_awards",
    sqlFile: "supabase/xp_awards.sql",
    severity: "fail",
    kind: "table",
    table: XP_TABLE,
    column: "run_id",
  },
  {
    id: "study_xp_awards",
    label: "study_xp_awards",
    sqlFile: "supabase/study_xp_awards.sql",
    severity: "warn",
    kind: "table",
    table: "study_xp_awards",
    column: "id",
  },
  {
    id: "lesson_jump_awards",
    label: "lesson_jump_awards",
    sqlFile: "supabase/lesson_jump_awards.sql",
    severity: "warn",
    kind: "table",
    table: "lesson_jump_awards",
    column: "id",
  },
  {
    id: "studied_clips",
    label: "studied_clips",
    sqlFile: "supabase/studied_clips.sql",
    severity: "fail",
    kind: "table",
    table: "studied_clips",
    column: "user_id",
  },
  {
    id: "duels",
    label: "duels",
    sqlFile: "supabase/duels.sql",
    severity: "fail",
    kind: "table",
    table: "duels",
    column: "id",
  },
  {
    id: "duels.expired",
    label: "duels.expired",
    sqlFile: "supabase/duels.sql",
    severity: "warn",
    kind: "column",
    table: "duels",
    column: "expired",
    dependsOn: "duels",
  },
  {
    id: "duel_clips",
    label: "duel_clips",
    sqlFile: "supabase/duels.sql",
    severity: "fail",
    kind: "table",
    table: "duel_clips",
    column: "duel_id",
  },
  {
    id: "duel_plays",
    label: "duel_plays",
    sqlFile: "supabase/duels.sql",
    severity: "fail",
    kind: "table",
    table: "duel_plays",
    column: "duel_id",
  },
  {
    id: "duel_xp_awards",
    label: "duel_xp_awards",
    sqlFile: "supabase/duels.sql",
    severity: "fail",
    kind: "table",
    table: "duel_xp_awards",
    column: "duel_id",
  },
];

const loggedMissingRoutine = new Set<string>();

function routineMissing(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

function noteMissingRoutine(name: string, message: string): void {
  if (loggedMissingRoutine.has(name)) return;
  loggedMissingRoutine.add(name);
  console.error(
    `${name}() unavailable, reading rows instead. Re-run supabase/admin_progress_reads.sql.`,
    message,
  );
}

async function readPracticePartCounts(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  learnerIds: ReadonlySet<string>,
): Promise<{
  ready: boolean;
  parts: number;
  runs: number;
  passedByUser: Record<string, number>;
  partsByUser: Record<string, number>;
} | null> {
  const { data, error } = await supabase.rpc("admin_practice_part_counts", {
    p_from: fromIso,
    p_to: toIso,
  });
  if (error) {
    if (routineMissing(error.message)) {
      noteMissingRoutine("admin_practice_part_counts", error.message);
    } else {
      console.error("Supabase admin_practice_part_counts", error.message);
    }
    return null;
  }
  const passedByUser: Record<string, number> = {};
  const partsByUser: Record<string, number> = {};
  let parts = 0;
  let runs = 0;
  for (const row of (Array.isArray(data) ? data : []) as {
    user_id?: unknown;
    parts?: unknown;
    passed?: unknown;
    runs?: unknown;
  }[]) {
    if (typeof row.user_id !== "string" || !learnerIds.has(row.user_id)) continue;
    const userParts = countFromRpc(row.parts);
    const userPassed = countFromRpc(row.passed);
    const userRuns = countFromRpc(row.runs);
    parts += userParts;
    runs += userRuns;
    if (userParts > 0) partsByUser[row.user_id] = userParts;
    if (userPassed > 0) passedByUser[row.user_id] = userPassed;
  }
  return { ready: true, parts, runs, passedByUser, partsByUser };
}

function countFromRpc(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function schemaObjectMissing(message: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(escaped, "i").test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

function skippedProbe(spec: StoreProbeSpec, detail: string): AdminStoreProbe {
  return {
    id: spec.id,
    label: spec.label,
    sqlFile: spec.sqlFile,
    severity: spec.severity,
    status: "skipped",
    detail,
  };
}

async function runStoreProbe(
  supabase: SupabaseClient,
  spec: StoreProbeSpec,
): Promise<AdminStoreProbe> {
  const base = {
    id: spec.id,
    label: spec.label,
    sqlFile: spec.sqlFile,
    severity: spec.severity,
  };

  if (spec.kind === "rpc") {
    const name = spec.rpc ?? TOTALS_RPC;
    const { error } = await supabase.rpc(name).limit(1);
    if (!error) {
      return { ...base, status: "ok", detail: "Function is reachable." };
    }
    if (schemaObjectMissing(error.message, name)) {
      return {
        ...base,
        status: "missing",
        detail: `Function is not in the schema. Run ${spec.sqlFile}.`,
      };
    }
    return { ...base, status: "error", detail: error.message };
  }

  const table = spec.table;
  const column = spec.column;
  if (!table || !column) {
    return { ...base, status: "error", detail: "Probe is missing a table or column." };
  }

  const { error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true });
  if (!error) {
    return {
      ...base,
      status: "ok",
      detail: spec.kind === "column" ? "Column is present." : "Table is reachable.",
    };
  }
  if (schemaObjectMissing(error.message, spec.kind === "column" ? column : table)) {
    return {
      ...base,
      status: "missing",
      detail:
        spec.kind === "column"
          ? `Column is missing. Re-run the ALTER statements in ${spec.sqlFile}.`
          : `Table is not in the schema. Run ${spec.sqlFile}.`,
    };
  }
  return { ...base, status: "error", detail: error.message };
}

/**
 * Head-only reads of the tables and RPCs admin pages depend on.
 * Does not list rows. Missing env skips every probe.
 */
export async function probeAdminStores(): Promise<AdminStoreProbe[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return STORE_PROBE_SPECS.map((spec) =>
      skippedProbe(spec, "Supabase URL or service role key is not set."),
    );
  }

  const byId = new Map<string, AdminStoreProbe>();
  for (const spec of STORE_PROBE_SPECS) {
    if (spec.dependsOn) {
      const parent = byId.get(spec.dependsOn);
      if (!parent || parent.status !== "ok") {
        const result = skippedProbe(
          spec,
          parent?.status === "missing"
            ? `${spec.dependsOn} is missing, so this was not checked.`
            : `${spec.dependsOn} is not reachable, so this was not checked.`,
        );
        byId.set(spec.id, result);
        continue;
      }
    }
    byId.set(spec.id, await runStoreProbe(supabase, spec));
  }
  return STORE_PROBE_SPECS.map((spec) => byId.get(spec.id)!);
}
