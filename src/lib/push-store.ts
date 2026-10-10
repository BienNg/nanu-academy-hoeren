import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeStreakDays,
  collectPracticeDates,
  localCalendarDay,
  normalizeProgress,
  validTimeZone,
  type StoredProgress,
} from "@/lib/progress";
import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  emptyReminderState,
  planStreakReminder,
  REMINDER_ZONE,
  streakReminderCopy,
  type ReminderState,
} from "@/lib/push-reminder";

const SUBSCRIPTIONS = "push_subscriptions";
const REMINDERS = "push_reminders";
const VAPID_SUBJECT = "https://www.nanugo.app";
const PAGE = 500;

export type StoredPushSubscription = {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
};

export function pushPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key ? key : null;
}

export function pushConfigured(): boolean {
  return Boolean(pushPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());
}

function missingSchema(message: string): boolean {
  return /push_subscriptions|push_reminders|does not exist|schema cache|could not find/i.test(message);
}

function configureWebPush(): boolean {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  return true;
}

export async function savePushSubscription(
  userId: string,
  input: { endpoint: string; p256dh: string; auth: string },
): Promise<"saved" | "missing" | "failed"> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return "failed";
  const { error } = await supabase.from(SUBSCRIPTIONS).upsert(
    {
      endpoint: input.endpoint,
      user_id: userId,
      p256dh: input.p256dh,
      auth: input.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (!error) return "saved";
  if (missingSchema(error.message)) return "missing";
  console.error("Supabase savePushSubscription", error.message);
  return "failed";
}

export async function deletePushSubscription(endpoint: string): Promise<"deleted" | "missing" | "failed"> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "failed";
  const { error } = await supabase.from(SUBSCRIPTIONS).delete().eq("endpoint", endpoint);
  if (!error) return "deleted";
  if (missingSchema(error.message)) return "missing";
  console.error("Supabase deletePushSubscription", error.message);
  return "failed";
}

async function eachPage<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<{ rows: T[] } | "missing" | "failed"> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) {
      if (missingSchema(error.message)) return "missing";
      console.error(`Supabase ${table}`, error.message);
      return "failed";
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows };
    from += PAGE;
  }
}

function readDay(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function readReminder(row: {
  user_id?: unknown;
  last_sent_on?: unknown;
  judged_on?: unknown;
  ignored_count?: unknown;
  paused_until?: unknown;
}): [string, ReminderState] | null {
  if (typeof row.user_id !== "string" || !row.user_id) return null;
  const ignored = typeof row.ignored_count === "number" ? row.ignored_count : Number(row.ignored_count);
  return [
    row.user_id,
    {
      lastSentOn: readDay(row.last_sent_on),
      judgedOn: readDay(row.judged_on),
      ignoredCount: Number.isFinite(ignored) ? Math.max(0, ignored) : 0,
      pausedUntil: readDay(row.paused_until),
    },
  ];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

async function progressFor(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, StoredProgress> | "failed"> {
  const progress = new Map<string, StoredProgress>();
  for (const ids of chunk(userIds, 100)) {
    const withDeleted = await supabase
      .from("user_progress")
      .select("user_id, data, deleted_at")
      .in("user_id", ids);
    const query = withDeleted.error ? await supabase.from("user_progress").select("user_id, data").in("user_id", ids) : withDeleted;
    if (query.error) {
      console.error("Supabase reminder progress", query.error.message);
      return "failed";
    }
    for (const row of query.data ?? []) {
      const record = row as { user_id?: unknown; data?: unknown; deleted_at?: unknown };
      if (typeof record.user_id !== "string" || record.deleted_at) continue;
      progress.set(record.user_id, normalizeProgress(record.data as Partial<StoredProgress>));
    }
  }
  return progress;
}

export type ReminderSendResult = {
  ready: boolean;
  sent: number;
  skipped: number;
  removed: number;
  failed: number;
};

async function deliver(
  subscription: StoredPushSubscription,
  payload: { title: string; body: string; url: string },
): Promise<"sent" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60 },
    );
    return "sent";
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (status === 404 || status === 410) return "gone";
    console.error("Web push send failed", status || "unknown");
    return "failed";
  }
}

async function saveReminder(supabase: SupabaseClient, userId: string, state: ReminderState): Promise<void> {
  const { error } = await supabase.from(REMINDERS).upsert(
    {
      user_id: userId,
      last_sent_on: state.lastSentOn,
      judged_on: state.judgedOn,
      ignored_count: state.ignoredCount,
      paused_until: state.pausedUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.error("Supabase saveReminder", error.message);
}

/**
 * One pass for the daily cron. 19:00 in Vietnam is 12:00 UTC.
 * A learner with several browsers gets one shared ignore count.
 */
export async function sendDueStreakReminders(now = new Date()): Promise<ReminderSendResult> {
  const empty = { ready: false, sent: 0, skipped: 0, removed: 0, failed: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase || !configureWebPush()) return empty;

  const listed = await eachPage<StoredPushSubscription & { user_id: string; endpoint: string; p256dh: string; auth: string }>(
    supabase,
    SUBSCRIPTIONS,
    "endpoint, user_id, p256dh, auth",
  );
  if (listed === "missing" || listed === "failed") return empty;

  const subscriptions = listed.rows.flatMap((row) => {
    const record = row as { endpoint?: unknown; user_id?: unknown; p256dh?: unknown; auth?: unknown };
    if (
      typeof record.endpoint !== "string" ||
      typeof record.user_id !== "string" ||
      typeof record.p256dh !== "string" ||
      typeof record.auth !== "string"
    ) {
      return [];
    }
    return [{ endpoint: record.endpoint, userId: record.user_id, p256dh: record.p256dh, auth: record.auth }];
  });
  if (subscriptions.length === 0) return { ...empty, ready: true };

  const userIds = [...new Set(subscriptions.map((row) => row.userId))];
  const remindersListed = await eachPage<{
    user_id: string;
    last_sent_on: string | null;
    judged_on: string | null;
    ignored_count: number;
    paused_until: string | null;
  }>(supabase, REMINDERS, "user_id, last_sent_on, judged_on, ignored_count, paused_until");
  if (remindersListed === "missing" || remindersListed === "failed") return empty;
  const reminders = new Map<string, ReminderState>();
  for (const row of remindersListed.rows) {
    const parsed = readReminder(row);
    if (parsed) reminders.set(parsed[0], parsed[1]);
  }

  const progress = await progressFor(supabase, userIds);
  if (progress === "failed") return empty;

  const byUser = new Map<string, StoredPushSubscription[]>();
  for (const subscription of subscriptions) {
    const list = byUser.get(subscription.userId) ?? [];
    list.push(subscription);
    byUser.set(subscription.userId, list);
  }

  const result: ReminderSendResult = { ready: true, sent: 0, skipped: 0, removed: 0, failed: 0 };
  for (const [userId, devices] of byUser) {
    const stored = progress.get(userId);
    const state = reminders.get(userId) ?? emptyReminderState();
    if (!stored) {
      result.skipped += 1;
      continue;
    }
    const zone = validTimeZone(stored.streakTimeZone) ?? REMINDER_ZONE;
    const stamped = stored.streakTimeZone ? stored : { ...stored, streakTimeZone: zone };
    const today = localCalendarDay(now, zone);
    const dates = new Set(collectPracticeDates(stamped));
    const planned = planStreakReminder({
      state,
      today,
      streakDays: activeStreakDays(stamped, now),
      practicedToday: dates.has(today),
      practicedOn: (day) => dates.has(day),
    });
    if (!planned.send) {
      if (planned.changed) await saveReminder(supabase, userId, planned.next);
      result.skipped += 1;
      continue;
    }

    const payload = streakReminderCopy(activeStreakDays(stamped, now));
    let delivered = false;
    for (const device of devices) {
      const outcome = await deliver(device, payload);
      if (outcome === "sent") delivered = true;
      else if (outcome === "gone") {
        await deletePushSubscription(device.endpoint);
        result.removed += 1;
      } else result.failed += 1;
    }
    const next = delivered ? planned.next : { ...planned.next, lastSentOn: state.lastSentOn };
    if (delivered || planned.changed) await saveReminder(supabase, userId, next);
    if (delivered) result.sent += 1;
  }
  return result;
}
