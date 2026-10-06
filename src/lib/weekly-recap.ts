/**
 * Weekly recap shown on the shareable card. Weeks run Monday to Sunday on the
 * Vietnam calendar, the same weeks as the leaderboard. Pure so the node tests
 * can compile it.
 */

import { activeStreakDays, collectPracticeDates, type StoredProgress } from "./progress";
import { weekKey } from "./xp";

/** How far back a card can go. */
export const RECAP_MAX_WEEKS_BACK = 12;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

export type RecapRun = {
  outcome: "success" | "fail";
  accuracy: number;
  answeredCount: number;
  createdAt: string;
};

export type RecapXpRow = {
  xp: number;
  weekKey: string;
  dayKey: string;
};

export type RecapDay = {
  key: string;
  label: string;
  active: boolean;
};

export type WeeklyRecap = {
  /** Monday of the week, `YYYY-MM-DD`. */
  weekKey: string;
  /** e.g. "29/09 – 05/10/2026". */
  rangeLabel: string;
  isCurrentWeek: boolean;
  days: RecapDay[];
  activeDays: number;
  xp: number;
  previousXp: number;
  /** Practice parts passed. */
  partsPassed: number;
  /** Clips answered in practice parts. */
  clipsPracticed: number;
  /** Mean accuracy weighted by clips answered, or null without practice. */
  accuracy: number | null;
  previousAccuracy: number | null;
  /** Current streak. Only shown for this week; a past week's card would go stale. */
  streakDays: number | null;
  headline: string;
};

function parseDayKey(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(ms).toISOString().slice(0, 10) === key ? ms : null;
}

function formatDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftWeekKey(key: string, weeks: number): string {
  const ms = parseDayKey(key);
  if (ms == null) return key;
  return formatDayKey(ms + weeks * 7 * DAY_MS);
}

/** The seven `YYYY-MM-DD` days of a week, Monday first. */
export function weekDayKeys(key: string): string[] {
  const ms = parseDayKey(key) ?? 0;
  return Array.from({ length: 7 }, (_, index) => formatDayKey(ms + index * DAY_MS));
}

/** Monday 00:00 Vietnam time as an ISO instant. */
export function weekStartIso(key: string): string {
  const ms = parseDayKey(key) ?? 0;
  return new Date(ms - VN_OFFSET_MS).toISOString();
}

/**
 * A requested week, or this week when the value is missing, not a Monday,
 * in the future, or older than `RECAP_MAX_WEEKS_BACK`.
 */
export function resolveRecapWeek(value: string | null | undefined, now = new Date()): string {
  const current = weekKey(now);
  if (!value) return current;
  const ms = parseDayKey(value);
  if (ms == null || new Date(ms).getUTCDay() !== 1) return current;
  if (value > current) return current;
  if (value < shiftWeekKey(current, -RECAP_MAX_WEEKS_BACK)) return current;
  return value;
}

function rangeLabel(key: string): string {
  const days = weekDayKeys(key);
  const [startYear, startMonth, startDay] = days[0]!.split("-");
  const [endYear, endMonth, endDay] = days[6]!.split("-");
  const start =
    startYear === endYear ? `${startDay}/${startMonth}` : `${startDay}/${startMonth}/${startYear}`;
  return `${start} – ${endDay}/${endMonth}/${endYear}`;
}

function weightedAccuracy(runs: readonly RecapRun[]): number | null {
  let answered = 0;
  let weighted = 0;
  for (const run of runs) {
    if (run.answeredCount <= 0) continue;
    answered += run.answeredCount;
    weighted += run.accuracy * run.answeredCount;
  }
  return answered > 0 ? Math.round(weighted / answered) : null;
}

function runsInWeek(runs: readonly RecapRun[], key: string): RecapRun[] {
  const start = weekStartIso(key);
  const end = weekStartIso(shiftWeekKey(key, 1));
  return runs.filter((run) => {
    const at = new Date(run.createdAt).toISOString();
    return at >= start && at < end;
  });
}

function recapHeadline(recap: Omit<WeeklyRecap, "headline">): string {
  if (recap.activeDays === 0 && recap.xp === 0) {
    return recap.isCurrentWeek ? "Tuần mới, khởi đầu mới!" : "Tuần nghỉ ngơi, sẵn sàng quay lại!";
  }
  if (recap.activeDays === 7) return "Học đủ 7/7 ngày. Quá kiên trì!";
  if (recap.accuracy != null && recap.accuracy >= 90) return "Chính xác cực kỳ!";
  if (recap.previousXp > 0 && recap.xp > recap.previousXp) return "Tiến bộ hơn tuần trước!";
  if (recap.activeDays >= 5) return "Chăm chỉ cả tuần. Tuyệt vời!";
  return "Mỗi ngày một chút, tiến bộ mỗi tuần!";
}

export function buildWeeklyRecap(input: {
  week: string;
  progress: StoredProgress;
  xpRows: readonly RecapXpRow[];
  runs: readonly RecapRun[];
  now?: Date;
}): WeeklyRecap {
  const now = input.now ?? new Date();
  const week = input.week;
  const previousWeek = shiftWeekKey(week, -1);
  const isCurrentWeek = week === weekKey(now);

  const practiced = new Set(collectPracticeDates(input.progress));
  for (const row of input.xpRows) {
    if (row.xp > 0) practiced.add(row.dayKey);
  }
  const days = weekDayKeys(week).map((key, index) => ({
    key,
    label: DAY_LABELS[index]!,
    active: practiced.has(key),
  }));

  let xp = 0;
  let previousXp = 0;
  for (const row of input.xpRows) {
    if (row.weekKey === week) xp += row.xp;
    else if (row.weekKey === previousWeek) previousXp += row.xp;
  }

  const thisWeekRuns = runsInWeek(input.runs, week);
  const recap = {
    weekKey: week,
    rangeLabel: rangeLabel(week),
    isCurrentWeek,
    days,
    activeDays: days.filter((day) => day.active).length,
    xp,
    previousXp,
    partsPassed: thisWeekRuns.filter((run) => run.outcome === "success").length,
    clipsPracticed: thisWeekRuns.reduce((sum, run) => sum + Math.max(0, run.answeredCount), 0),
    accuracy: weightedAccuracy(thisWeekRuns),
    previousAccuracy: weightedAccuracy(runsInWeek(input.runs, previousWeek)),
    streakDays: isCurrentWeek ? activeStreakDays(input.progress, now) : null,
  };
  return { ...recap, headline: recapHeadline(recap) };
}

/** Vietnam-local `YYYYMMDD-HHMMSS-mmm`, so two downloads in one second still differ. */
function recapStamp(now: Date): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return (
    `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}` +
    `-${pad(vn.getUTCHours())}${pad(vn.getUTCMinutes())}${pad(vn.getUTCSeconds())}` +
    `-${pad(vn.getUTCMilliseconds(), 3)}`
  );
}

/** `nanu-tong-ket-tuan-2026-09-29-20261005-100412-847.png` */
export function recapFileName(week: string, now = new Date()): string {
  return `nanu-tong-ket-tuan-${week}-${recapStamp(now)}.png`;
}
