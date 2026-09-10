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

export async function setCloudProgress(
  userId: string,
  progress: StoredProgress,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Progress store is not configured");
  }

  const payload = normalizeProgress(progress);
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Supabase setCloudProgress: ${error.message}`);
  }
}
