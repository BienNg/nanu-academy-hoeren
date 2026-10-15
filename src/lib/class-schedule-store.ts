import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  isClassFormat,
  isScheduleDay,
  readSessionMinutes,
  readSessionStart,
  type ClassLevelStart,
  type ClassSchedule,
} from "@/lib/class-schedule";

const TABLE = "class_schedules";

const COLUMNS = "class_key, class_name, format, weekdays, levels, skipped_dates, updated_at";
/** Session time columns come from a later run of class_schedules.sql. Older tables fall back to COLUMNS. */
const COLUMNS_WITH_TIME = `${COLUMNS}, session_start, session_minutes`;

type ClassScheduleRow = {
  class_key?: unknown;
  class_name?: unknown;
  format?: unknown;
  weekdays?: unknown;
  levels?: unknown;
  skipped_dates?: unknown;
  updated_at?: unknown;
  session_start?: unknown;
  session_minutes?: unknown;
};

function missingTimeColumns(message: string): boolean {
  return /session_start|session_minutes/i.test(message);
}

function classScheduleFromRow(row: ClassScheduleRow): ClassSchedule | null {
  if (typeof row.class_key !== "string" || !row.class_key) return null;
  const levels: ClassLevelStart[] = [];
  for (const item of Array.isArray(row.levels) ? row.levels : []) {
    if (!item || typeof item !== "object") continue;
    const { level, startedOn } = item as Record<string, unknown>;
    if (typeof level === "string" && isScheduleDay(startedOn)) levels.push({ level, startedOn });
  }
  return {
    classKey: row.class_key,
    className: typeof row.class_name === "string" ? row.class_name : row.class_key,
    format: isClassFormat(row.format) ? row.format : null,
    weekdays: Array.isArray(row.weekdays)
      ? row.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)
      : [],
    levels: levels.sort((a, b) => a.startedOn.localeCompare(b.startedOn)),
    skippedDates: Array.isArray(row.skipped_dates) ? row.skipped_dates.filter(isScheduleDay).sort() : [],
    sessionStart: readSessionStart(row.session_start),
    sessionMinutes: readSessionMinutes(row.session_minutes),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function missingTable(message: string): boolean {
  return /does not exist|schema cache|could not find/i.test(message);
}

/** `null` means the table could not be read. A few hundred bytes per class. */
export async function listClassSchedules(): Promise<ClassSchedule[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let result: { data: ClassScheduleRow[] | null; error: { message: string } | null } = await supabase
    .from(TABLE)
    .select(COLUMNS_WITH_TIME)
    .limit(1000);
  if (result.error && missingTimeColumns(result.error.message)) {
    result = await supabase.from(TABLE).select(COLUMNS).limit(1000);
  }
  const { data, error } = result;
  if (error) {
    if (!missingTable(error.message)) console.error("Supabase listClassSchedules", error.message);
    return null;
  }
  const schedules: ClassSchedule[] = [];
  for (const row of data ?? []) {
    const schedule = classScheduleFromRow(row);
    if (schedule) schedules.push(schedule);
  }
  return schedules;
}

export async function upsertClassSchedule(
  schedule: Omit<ClassSchedule, "updatedAt">,
): Promise<ClassSchedule> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Cloud progress is not configured.");
  const base = {
    class_key: schedule.classKey,
    class_name: schedule.className,
    format: schedule.format,
    weekdays: schedule.weekdays,
    levels: schedule.levels,
    skipped_dates: schedule.skippedDates,
    updated_at: new Date().toISOString(),
  };
  const sessionStart = schedule.sessionStart ?? null;
  let result: { data: ClassScheduleRow | null; error: { message: string } | null } = await supabase
    .from(TABLE)
    .upsert(
      { ...base, session_start: sessionStart, session_minutes: sessionStart ? (schedule.sessionMinutes ?? null) : null },
      { onConflict: "class_key" },
    )
    .select(COLUMNS_WITH_TIME)
    .single();
  if (result.error && missingTimeColumns(result.error.message)) {
    if (sessionStart) {
      throw new Error("Session times are not set up yet. Run supabase/class_schedules.sql again.");
    }
    result = await supabase.from(TABLE).upsert(base, { onConflict: "class_key" }).select(COLUMNS).single();
  }
  const { data, error } = result;
  if (error || !data) {
    if (error && missingTable(error.message)) {
      throw new Error("Class schedules are not set up yet. Run supabase/class_schedules.sql once.");
    }
    throw new Error(error?.message ?? "Could not save the class schedule.");
  }
  const saved = classScheduleFromRow(data);
  if (!saved) throw new Error("Could not read the saved class schedule.");
  return saved;
}

export const CLASS_SCHEDULES_TAG = "class-schedules";

/**
 * All schedules, cached for an hour. Learner pages read this on every Home
 * load, so it must not hit the database each time. Saving a schedule calls
 * `updateTag(CLASS_SCHEDULES_TAG)`. `null` (table missing) is cached too.
 */
const cachedClassSchedules = unstable_cache(() => listClassSchedules(), [CLASS_SCHEDULES_TAG], {
  revalidate: 60 * 60,
  tags: [CLASS_SCHEDULES_TAG],
});

export function listCachedClassSchedules(): Promise<ClassSchedule[] | null> {
  return cachedClassSchedules();
}
