import { getSupabaseAdmin } from "@/lib/progress-store";
import {
  isClassFormat,
  isScheduleDay,
  type ClassLevelStart,
  type ClassSchedule,
} from "@/lib/class-schedule";

const TABLE = "class_schedules";

const COLUMNS = "class_key, class_name, format, weekdays, levels, skipped_dates, updated_at";

type ClassScheduleRow = {
  class_key?: unknown;
  class_name?: unknown;
  format?: unknown;
  weekdays?: unknown;
  levels?: unknown;
  skipped_dates?: unknown;
  updated_at?: unknown;
};

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
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).limit(1000);
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
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        class_key: schedule.classKey,
        class_name: schedule.className,
        format: schedule.format,
        weekdays: schedule.weekdays,
        levels: schedule.levels,
        skipped_dates: schedule.skippedDates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "class_key" },
    )
    .select(COLUMNS)
    .single();
  if (error) {
    if (missingTable(error.message)) {
      throw new Error("Class schedules are not set up yet. Run supabase/class_schedules.sql once.");
    }
    throw new Error(error.message);
  }
  const saved = classScheduleFromRow(data);
  if (!saved) throw new Error("Could not read the saved class schedule.");
  return saved;
}
