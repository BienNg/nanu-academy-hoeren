/**
 * Session ratings (docs/SESSION_RATINGS.md): which class session a learner is
 * asked about, what a rating may contain, and the pace rules the teacher site
 * uses to flag learners who fall behind. Pure: no database, no clock.
 */

import {
  CLASS_FORMAT_TIME_ZONE,
  DEFAULT_SESSION_MINUTES,
  addScheduleDays,
  classSessionDays,
  scheduleToday,
  type ClassScheduleFields,
} from "./class-schedule";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Learners can rate from the end of a session until this long after it. */
export const RATING_WINDOW_MS = 48 * 60 * MINUTE_MS;
/** Under this many ratings, a session's average, star counts and tag counts stay hidden. Same as in session_rating_summary(). */
export const SESSION_RATING_SUMMARY_MIN = 3;
export const RATING_COMMENT_MAX = 300;
/** XP for a sent rating, stored as a quest claim. */
export const RATING_XP = 10;

export const RATING_LABELS = ["", "Chưa tốt", "Tạm được", "Bình thường", "Tốt", "Tuyệt vời"] as const;

/** Offered for 4–5 stars. */
export const RATING_TAGS_HIGH = ["easy", "fun", "good_exercises", "engaged_teacher", "good_pace"] as const;
/** Offered for 1–3 stars. */
export const RATING_TAGS_LOW = ["too_fast", "too_slow", "confusing", "little_speaking", "tech_issues"] as const;

export type RatingTag = (typeof RATING_TAGS_HIGH)[number] | (typeof RATING_TAGS_LOW)[number];

export const RATING_TAG_LABEL: Record<RatingTag, string> = {
  easy: "Dễ hiểu",
  fun: "Vui",
  good_exercises: "Bài tập hay",
  engaged_teacher: "Giáo viên nhiệt tình",
  good_pace: "Tốc độ vừa phải",
  too_fast: "Quá nhanh",
  too_slow: "Quá chậm",
  confusing: "Khó hiểu",
  little_speaking: "Ít luyện nói",
  tech_issues: "Lỗi âm thanh/kỹ thuật",
};

export function ratingTagsFor(stars: number): readonly RatingTag[] {
  return stars >= 4 ? RATING_TAGS_HIGH : RATING_TAGS_LOW;
}

export function isRatingTag(value: unknown): value is RatingTag {
  return typeof value === "string" && Object.hasOwn(RATING_TAG_LABEL, value);
}

// ---------------------------------------------------------------------------
// Session times

/** How far local time in `timeZone` is ahead of UTC at `instant`, in ms. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a local wall-clock time ("YYYY-MM-DD", "HH:MM") happens in `timeZone`. */
export function zonedTimeToInstant(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, date, hour, minute);
  // Two passes settle the offset on days the clocks change.
  const first = naive - zoneOffsetMs(naive, timeZone);
  return new Date(naive - zoneOffsetMs(first, timeZone));
}

/** When the class session on `day` ends. Without a start time: 23:59 local. */
export function sessionEndsAt(schedule: ClassScheduleFields, day: string): Date {
  const timeZone = CLASS_FORMAT_TIME_ZONE[schedule.format ?? "online_vn"];
  if (!schedule.sessionStart) return zonedTimeToInstant(day, "23:59", timeZone);
  const start = zonedTimeToInstant(day, schedule.sessionStart, timeZone);
  const minutes = schedule.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  return new Date(start.getTime() + minutes * MINUTE_MS);
}

export type OpenRatingSession = {
  /** Session day "YYYY-MM-DD" in the class's time zone. */
  day: string;
  level: string;
  lektion: number;
  endsAt: string;
  closesAt: string;
};

/**
 * The newest session of the class whose rating window (its end to 48 hours
 * later) contains `now`, or null. A session still running does not hide an
 * older one that is open.
 */
export function openRatingSession(
  schedule: ClassScheduleFields,
  levelOrder: readonly { slug: string; lektionen: number }[],
  now: Date,
): OpenRatingSession | null {
  const today = scheduleToday(schedule.format, now);
  // The window is 48 h from the end, so no open session started more than 3 days ago.
  const sessions = classSessionDays(schedule, levelOrder, addScheduleDays(today, -3), today);
  for (const session of sessions.reverse()) {
    const endsAt = sessionEndsAt(schedule, session.day);
    const closesAt = new Date(endsAt.getTime() + RATING_WINDOW_MS);
    if (now >= endsAt && now < closesAt) {
      return { ...session, endsAt: endsAt.toISOString(), closesAt: closesAt.toISOString() };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sheet copy

const VI_WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;

function viWeekday(day: string): string {
  return VI_WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
}

/** "Buổi học hôm qua thế nào?", or the weekday when the session was earlier. `today` is the learner's calendar day. */
export function ratingTitle(day: string, today: string): string {
  if (day === today) return "Buổi học hôm nay thế nào?";
  if (day === addScheduleDays(today, -1)) return "Buổi học hôm qua thế nào?";
  return `Buổi học hôm ${viWeekday(day).toLocaleLowerCase("vi")} thế nào?`;
}

/** "Lektion 4 · Thứ Tư, 14.10" */
export function ratingSubtitle(lektion: number, day: string): string {
  const [, month, date] = day.split("-");
  return `Lektion ${lektion} · ${viWeekday(day)}, ${date}.${month}`;
}

// ---------------------------------------------------------------------------
// Rating input

export type RatingInput = {
  stars: number;
  tags: RatingTag[];
  comment: string | null;
};

/**
 * Cleans what the sheet sends. Unknown tags and tags from the other star
 * group are dropped, in the sheet's order. The comment is trimmed and cut at
 * RATING_COMMENT_MAX characters. `null` when the stars are not 1–5.
 */
export function normalizeRatingInput(input: unknown): RatingInput | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const stars = raw.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) return null;

  const sent = new Set(Array.isArray(raw.tags) ? raw.tags.filter(isRatingTag) : []);
  const tags = ratingTagsFor(stars).filter((tag) => sent.has(tag));

  const text = typeof raw.comment === "string" ? raw.comment.trim() : "";
  // By code point, like Postgres char_length, so an emoji is never cut in half.
  const comment = Array.from(text).slice(0, RATING_COMMENT_MAX).join("").trim();

  return { stars, tags, comment: comment.length > 0 ? comment : null };
}

export type SessionRatingSummary = {
  day: string;
  ratedCount: number;
  /** Rounded to one decimal. Null under SESSION_RATING_SUMMARY_MIN ratings. */
  average: number | null;
  /** [1★, 2★, 3★, 4★, 5★]. Null under SESSION_RATING_SUMMARY_MIN ratings. */
  starCounts: number[] | null;
  /** Null under SESSION_RATING_SUMMARY_MIN ratings. */
  tagCounts: Partial<Record<RatingTag, number>> | null;
};

/**
 * What session_rating_summary() returns, worked out in code from rated rows.
 * Used when that SQL function is missing. Newest session first.
 */
export function summarizeRatings(rows: readonly { day: string; stars: number; tags: readonly string[] }[]): SessionRatingSummary[] {
  const byDay = new Map<string, { stars: number[]; tags: Map<RatingTag, number> }>();
  for (const row of rows) {
    if (!Number.isInteger(row.stars) || row.stars < 1 || row.stars > 5) continue;
    const entry = byDay.get(row.day) ?? { stars: [0, 0, 0, 0, 0], tags: new Map() };
    entry.stars[row.stars - 1] += 1;
    for (const tag of row.tags) if (isRatingTag(tag)) entry.tags.set(tag, (entry.tags.get(tag) ?? 0) + 1);
    byDay.set(row.day, entry);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entry]) => {
      const ratedCount = entry.stars.reduce((sum, count) => sum + count, 0);
      const enough = ratedCount >= SESSION_RATING_SUMMARY_MIN;
      const total = entry.stars.reduce((sum, count, index) => sum + count * (index + 1), 0);
      return {
        day,
        ratedCount,
        average: enough ? Math.round((total / ratedCount) * 10) / 10 : null,
        starCounts: enough ? entry.stars : null,
        tagCounts: enough ? Object.fromEntries(entry.tags) : null,
      };
    });
}

/** Quest claim id for a sent rating, so its XP counts on every board. */
export function ratingClaimId(classKey: string, day: string): string {
  return `rating:${classKey}:${day}`;
}

export function isRatingClaimId(questId: string): boolean {
  return questId.startsWith("rating:");
}

// ---------------------------------------------------------------------------
// Pace

export const PARTS_PER_DAY_TARGET = 4;
/** Under this many parts a day over PACE_DAYS, a learner is behind. */
export const PARTS_PER_DAY_LOW = 2;
export const PACE_DAYS = 7;
/** This many days or more since last seen, a learner is behind. */
export const INACTIVE_DAYS = 3;

export type PaceTier = "good" | "mid" | "low";

/** Finished study and listening runs per UTC day, from `StoredProgress.activity`. */
export function partsByDayFromActivity(
  activity: Readonly<Record<string, { studyRuns?: number; practiceRuns?: number } | undefined>> | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [day, entry] of Object.entries(activity ?? {})) {
    const parts = (entry?.studyRuns ?? 0) + (entry?.practiceRuns ?? 0);
    if (parts > 0) counts[day] = parts;
  }
  return counts;
}

/** Average parts a day over the `days` days ending on `today`, today included. */
export function partsPerDay(
  countsByDay: Readonly<Record<string, number>>,
  today: string,
  days = PACE_DAYS,
): number {
  let total = 0;
  for (let back = 0; back < days; back++) total += countsByDay[addScheduleDays(today, -back)] ?? 0;
  return total / days;
}

/** Parts per day for each of the `days` days ending on `today`, oldest first. */
export function dailyParts(
  countsByDay: Readonly<Record<string, number>>,
  today: string,
  days: number,
): { day: string; parts: number }[] {
  return Array.from({ length: days }, (_, index) => {
    const day = addScheduleDays(today, index - days + 1);
    return { day, parts: countsByDay[day] ?? 0 };
  });
}

export function paceTier(pace: number): PaceTier {
  if (pace >= PARTS_PER_DAY_TARGET) return "good";
  if (pace >= PARTS_PER_DAY_LOW) return "mid";
  return "low";
}

/** Whole days since `lastSeenAt`. Never seen: null. */
export function daysSinceSeen(lastSeenAt: string | null, now: Date): number | null {
  if (!lastSeenAt) return null;
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return null;
  return Math.max(0, Math.floor((now.getTime() - seen) / DAY_MS));
}

export type BehindReason = "low-pace" | "behind-lektion" | "inactive";

/**
 * Why a learner counts as behind; empty when they are not. Lektion numbers
 * are compared only when both are known. Never seen counts as inactive.
 */
export function behindReasons(input: {
  pace: number;
  lektion: number | null;
  classLektion: number | null;
  daysSinceSeen: number | null;
}): BehindReason[] {
  const reasons: BehindReason[] = [];
  if (input.pace < PARTS_PER_DAY_LOW) reasons.push("low-pace");
  if (input.lektion !== null && input.classLektion !== null && input.lektion < input.classLektion) {
    reasons.push("behind-lektion");
  }
  if (input.daysSinceSeen === null || input.daysSinceSeen >= INACTIVE_DAYS) reasons.push("inactive");
  return reasons;
}
