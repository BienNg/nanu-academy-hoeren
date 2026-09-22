import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PROGRESS,
  normalizeProgress,
  type StoredProgress,
} from "@/lib/progress";

const TABLE = "user_progress";

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

function getSupabaseAdmin(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

export type UserProfileTouch = {
  email?: string | null;
  name?: string | null;
};

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
  const withIdentity = {
    user_id: userId,
    data: payload,
    updated_at: now,
    last_login_at: now,
    ...(profile.email !== undefined ? { email: profile.email } : {}),
    ...(profile.name !== undefined ? { name: profile.name } : {}),
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert(withIdentity, { onConflict: "user_id" });

  if (!error) return;

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
  lastLoginAt: string | null;
  updatedAt: string | null;
  /** CEFR slugs an admin has granted. Empty means every level stays locked. */
  levelAccess: string[];
  progress: StoredProgress;
};

const LIST_PAGE_SIZE = 1000;

type RawProgressRow = {
  user_id: string;
  data: unknown;
  updated_at?: string | null;
  email?: string | null;
  name?: string | null;
  last_login_at?: string | null;
  deleted_at?: string | null;
  level_access?: unknown;
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

function mapProgressRow(row: RawProgressRow): UserProgressListItem {
  return {
    userId: row.user_id,
    email: typeof row.email === "string" ? row.email : null,
    name: typeof row.name === "string" ? row.name : null,
    lastLoginAt:
      typeof row.last_login_at === "string" ? row.last_login_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    levelAccess: readLevelAccess(row.level_access),
    progress: normalizeProgress(row.data as Partial<StoredProgress>),
  };
}

/**
 * Best-effort identity + last-login write. Progress JSON is never overwritten
 * here; missing profile columns (pre-migration) are ignored.
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

  const patch: {
    last_login_at: string;
    email?: string | null;
    name?: string | null;
  } = { last_login_at: now };
  if (profile.email !== undefined) patch.email = profile.email;
  if (profile.name !== undefined) patch.name = profile.name;

  if (existing) {
    const { error } = await supabase.from(TABLE).update(patch).eq("user_id", userId);
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

export async function listAllUserProgress(): Promise<UserProgressListItem[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // Widest column set first, so a table that predates a migration still lists
  // users instead of failing outright.
  const columnSets = [
    "user_id, data, updated_at, email, name, last_login_at, deleted_at, level_access",
    "user_id, data, updated_at, email, name, last_login_at, deleted_at",
    "user_id, data, updated_at, email, name, last_login_at",
    "user_id, data, updated_at",
  ];

  async function fetchAll(
    client: SupabaseClient,
    columns: string,
  ): Promise<RawProgressRow[] | null> {
    const rows: RawProgressRow[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from(TABLE)
        .select(columns)
        .range(from, from + LIST_PAGE_SIZE - 1);

      if (error) {
        console.error("Supabase listAllUserProgress", error.message);
        return null;
      }

      const page = (data ?? []) as unknown as RawProgressRow[];
      rows.push(...page);
      if (page.length < LIST_PAGE_SIZE) return rows;
      from += LIST_PAGE_SIZE;
    }
  }

  let rows: RawProgressRow[] = [];
  for (const columns of columnSets) {
    const result = await fetchAll(supabase, columns);
    if (result) {
      rows = result;
      break;
    }
  }

  return rows.filter((row) => !row.deleted_at).map(mapProgressRow);
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
