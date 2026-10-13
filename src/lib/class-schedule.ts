/**
 * Class timetable: where a class meets, on which weekdays, which level began
 * on which date, and the dates without class. One class day is one Lektion,
 * so the next Lektion follows from those alone.
 */

export const CLASS_FORMATS = ["online_de", "online_vn", "offline_saigon", "offline_hanoi"] as const;
export type ClassFormat = (typeof CLASS_FORMATS)[number];

export const CLASS_FORMAT_LABEL: Record<ClassFormat, string> = {
  online_de: "Online · Germany",
  online_vn: "Online · Vietnam",
  offline_saigon: "Offline · Saigon",
  offline_hanoi: "Offline · Hanoi",
};

/** "Today" is the class's local day: German time for classes held from Germany. */
export const CLASS_FORMAT_TIME_ZONE: Record<ClassFormat, string> = {
  online_de: "Europe/Berlin",
  online_vn: "Asia/Ho_Chi_Minh",
  offline_saigon: "Asia/Ho_Chi_Minh",
  offline_hanoi: "Asia/Ho_Chi_Minh",
};

/** ISO weekdays, 1 = Monday … 7 = Sunday. */
export const CLASS_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const CLASS_WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MAX_LEVELS = 24;
const MAX_SKIPPED = 300;

export type ClassLevelStart = {
  /** Level slug from chapters.json, e.g. "a1-2". */
  level: string;
  /** First class day of this level, "YYYY-MM-DD". */
  startedOn: string;
};

export type ClassScheduleFields = {
  format: ClassFormat | null;
  weekdays: number[];
  /** Oldest first. */
  levels: ClassLevelStart[];
  /** Days without class (holidays, cancelled lessons), oldest first. */
  skippedDates: string[];
};

export type ClassSchedule = ClassScheduleFields & {
  classKey: string;
  className: string;
  updatedAt: string | null;
};

export function isClassFormat(value: unknown): value is ClassFormat {
  return typeof value === "string" && (CLASS_FORMATS as readonly string[]).includes(value);
}

/** A real calendar day as "YYYY-MM-DD". */
export function isScheduleDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function emptyClassSchedule(): ClassScheduleFields {
  return { format: null, weekdays: [], levels: [], skippedDates: [] };
}

/**
 * Cleans untrusted input. Unknown levels, bad days, and duplicates are
 * dropped rather than rejected; `null` only for input that is not an object.
 */
export function normalizeClassSchedule(
  input: unknown,
  knownLevels: readonly string[],
): ClassScheduleFields | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const known = new Set(knownLevels);

  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7))].sort(
        (a, b) => a - b,
      )
    : [];

  const levels: ClassLevelStart[] = [];
  const seenLevels = new Set<string>();
  for (const item of Array.isArray(raw.levels) ? raw.levels : []) {
    if (!item || typeof item !== "object") continue;
    const { level, startedOn } = item as Record<string, unknown>;
    if (typeof level !== "string" || !known.has(level) || seenLevels.has(level)) continue;
    if (!isScheduleDay(startedOn)) continue;
    seenLevels.add(level);
    levels.push({ level, startedOn });
  }
  levels.sort((a, b) => a.startedOn.localeCompare(b.startedOn));

  const skippedDates = Array.isArray(raw.skippedDates)
    ? [...new Set(raw.skippedDates.filter(isScheduleDay))].sort()
    : [];

  return {
    format: isClassFormat(raw.format) ? raw.format : null,
    weekdays,
    levels: levels.slice(-MAX_LEVELS),
    skippedDates: skippedDates.slice(-MAX_SKIPPED),
  };
}

export function scheduleToday(format: ClassFormat | null, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLASS_FORMAT_TIME_ZONE[format ?? "online_vn"],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addScheduleDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function isoWeekday(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** "Thu 15.10.2026" */
export function formatScheduleDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${CLASS_WEEKDAY_LABEL[isoWeekday(day) - 1]} ${date}.${month}.${year}`;
}

export type ClassProgress =
  | { kind: "no-levels" }
  | { kind: "no-weekdays"; level: string; startedOn: string }
  | { kind: "upcoming"; level: string; startsOn: string }
  | {
      kind: "running";
      level: string;
      startedOn: string;
      /** The Lektion of the next class day (today's if there is class today). */
      lektion: number;
      total: number;
      nextOn: string;
      /** Day of the level's last Lektion. */
      endsOn: string;
    }
  | {
      kind: "finished";
      level: string;
      startedOn: string;
      total: number;
      finishedOn: string;
      /** Next level in catalog order, if any. */
      nextLevel: string | null;
    };

/** Safety stop: ~14 years of days. Weekdays are never empty here, so it is never reached. */
const MAX_SCAN_DAYS = 5000;

/**
 * The level that started most recently (on or before today) sets the pace.
 * Class days from its start date count up from Lektion 1; days before today
 * are done, so on a class day the next Lektion is today's.
 */
export function classProgress(
  schedule: ClassScheduleFields,
  levelOrder: readonly { slug: string; lektionen: number }[],
  today: string,
): ClassProgress {
  const levels = [...schedule.levels].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  if (levels.length === 0) return { kind: "no-levels" };
  const started = levels.filter((entry) => entry.startedOn <= today);
  const current = started.at(-1);
  if (!current) return { kind: "upcoming", level: levels[0].level, startsOn: levels[0].startedOn };

  const weekdays = new Set(schedule.weekdays);
  if (weekdays.size === 0) {
    return { kind: "no-weekdays", level: current.level, startedOn: current.startedOn };
  }

  const index = levelOrder.findIndex((entry) => entry.slug === current.level);
  const total = Math.max(1, levelOrder[index]?.lektionen ?? 20);
  const skipped = new Set(schedule.skippedDates);

  let done = 0;
  let nextOn: string | null = null;
  let held = 0;
  let day = current.startedOn;
  for (let step = 0; step < MAX_SCAN_DAYS && held < total; step++, day = addScheduleDays(day, 1)) {
    if (!weekdays.has(isoWeekday(day)) || skipped.has(day)) continue;
    held += 1;
    if (day < today) {
      done += 1;
    } else if (!nextOn) {
      nextOn = day;
    }
    if (held === total) break;
  }

  if (!nextOn) {
    return {
      kind: "finished",
      level: current.level,
      startedOn: current.startedOn,
      total,
      finishedOn: day,
      nextLevel: index >= 0 ? (levelOrder[index + 1]?.slug ?? null) : null,
    };
  }
  return {
    kind: "running",
    level: current.level,
    startedOn: current.startedOn,
    lektion: done + 1,
    total,
    nextOn,
    endsOn: day,
  };
}
