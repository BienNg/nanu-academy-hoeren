import assert from "node:assert/strict";
import test from "node:test";
import { classSessionDays, type ClassScheduleFields } from "./class-schedule.js";
import {
  RATING_COMMENT_MAX,
  behindReasons,
  dailyParts,
  daysSinceSeen,
  isRatingClaimId,
  normalizeRatingInput,
  openRatingSession,
  paceTier,
  partsByDayFromActivity,
  partsPerDay,
  ratingClaimId,
  ratingSubtitle,
  ratingTitle,
  sessionEndsAt,
  summarizeRatings,
  zonedTimeToInstant,
} from "./session-ratings.js";

const LEVELS = [
  { slug: "a1-1", lektionen: 20 },
  { slug: "a1-2", lektionen: 20 },
  { slug: "a2-1", lektionen: 3 },
];

function schedule(overrides: Partial<ClassScheduleFields> = {}): ClassScheduleFields {
  return {
    format: "online_vn",
    // Monday and Thursday. Mon 5 Oct 2026 is Lektion 1.
    weekdays: [1, 4],
    levels: [{ level: "a1-1", startedOn: "2026-10-05" }],
    skippedDates: [],
    sessionStart: "19:30",
    sessionMinutes: 90,
    ...overrides,
  };
}

test("classSessionDays lists one Lektion per class day", () => {
  assert.deepEqual(classSessionDays(schedule(), LEVELS, "2026-10-01", "2026-10-15"), [
    { day: "2026-10-05", level: "a1-1", lektion: 1 },
    { day: "2026-10-08", level: "a1-1", lektion: 2 },
    { day: "2026-10-12", level: "a1-1", lektion: 3 },
    { day: "2026-10-15", level: "a1-1", lektion: 4 },
  ]);
  assert.deepEqual(
    classSessionDays(schedule(), LEVELS, "2026-10-09", "2026-10-12").map((s) => s.day),
    ["2026-10-12"],
  );
});

test("classSessionDays skips days without class", () => {
  const sessions = classSessionDays(schedule({ skippedDates: ["2026-10-08"] }), LEVELS, "2026-10-01", "2026-10-15");
  assert.deepEqual(
    sessions.map((s) => [s.day, s.lektion]),
    [
      ["2026-10-05", 1],
      ["2026-10-12", 2],
      ["2026-10-15", 3],
    ],
  );
});

test("classSessionDays stops a level when the next one starts", () => {
  // a2-1 from Thu 1 Oct would hold Lektion 3 on Thu 8 Oct, but a1-2 starts that day.
  const sessions = classSessionDays(
    schedule({
      levels: [
        { level: "a1-2", startedOn: "2026-10-08" },
        { level: "a2-1", startedOn: "2026-10-01" },
      ],
    }),
    LEVELS,
    "2026-09-01",
    "2026-10-15",
  );
  assert.deepEqual(sessions, [
    { day: "2026-10-01", level: "a2-1", lektion: 1 },
    { day: "2026-10-05", level: "a2-1", lektion: 2 },
    { day: "2026-10-08", level: "a1-2", lektion: 1 },
    { day: "2026-10-12", level: "a1-2", lektion: 2 },
    { day: "2026-10-15", level: "a1-2", lektion: 3 },
  ]);
});

test("classSessionDays ends with the level's last Lektion and needs weekdays", () => {
  const sessions = classSessionDays(
    schedule({ levels: [{ level: "a2-1", startedOn: "2026-10-05" }] }),
    LEVELS,
    "2026-10-01",
    "2026-12-31",
  );
  assert.deepEqual(sessions.map((s) => s.day), ["2026-10-05", "2026-10-08", "2026-10-12"]);
  assert.deepEqual(classSessionDays(schedule({ weekdays: [] }), LEVELS, "2026-10-01", "2026-10-31"), []);
});

test("zonedTimeToInstant follows the class's clock, including the autumn change", () => {
  assert.equal(zonedTimeToInstant("2026-10-12", "19:30", "Asia/Ho_Chi_Minh").toISOString(), "2026-10-12T12:30:00.000Z");
  // Berlin is on summer time (UTC+2) until 25 Oct 2026, winter time (UTC+1) after.
  assert.equal(zonedTimeToInstant("2026-10-12", "19:00", "Europe/Berlin").toISOString(), "2026-10-12T17:00:00.000Z");
  assert.equal(zonedTimeToInstant("2026-10-25", "19:00", "Europe/Berlin").toISOString(), "2026-10-25T18:00:00.000Z");
});

test("sessionEndsAt adds the length, or uses 23:59 without a start time", () => {
  assert.equal(sessionEndsAt(schedule(), "2026-10-12").toISOString(), "2026-10-12T14:00:00.000Z");
  assert.equal(
    sessionEndsAt(schedule({ sessionMinutes: null }), "2026-10-12").toISOString(),
    "2026-10-12T14:00:00.000Z",
  );
  assert.equal(
    sessionEndsAt(schedule({ sessionStart: null }), "2026-10-12").toISOString(),
    "2026-10-12T16:59:00.000Z",
  );
  // 23:30 in Berlin for 30 minutes ends at local midnight.
  assert.equal(
    sessionEndsAt(schedule({ format: "online_de", sessionStart: "23:30", sessionMinutes: 30 }), "2026-10-12").toISOString(),
    "2026-10-12T22:00:00.000Z",
  );
});

test("openRatingSession opens at the end and closes exactly 48 hours later", () => {
  // Mon 12 Oct (Lektion 3) ends 14:00 UTC.
  assert.equal(openRatingSession(schedule(), LEVELS, new Date("2026-10-12T13:59:00Z")), null);
  assert.deepEqual(openRatingSession(schedule(), LEVELS, new Date("2026-10-12T14:00:00Z")), {
    day: "2026-10-12",
    level: "a1-1",
    lektion: 3,
    endsAt: "2026-10-12T14:00:00.000Z",
    closesAt: "2026-10-14T14:00:00.000Z",
  });
  assert.equal(openRatingSession(schedule(), LEVELS, new Date("2026-10-14T13:59:59Z"))?.day, "2026-10-12");
  assert.equal(openRatingSession(schedule(), LEVELS, new Date("2026-10-14T14:00:00Z")), null);
});

test("openRatingSession picks the newest open session, not one still running", () => {
  // Monday and Tuesday: Monday's window is still open while Tuesday's class runs.
  const daily = schedule({ weekdays: [1, 2] });
  assert.equal(openRatingSession(daily, LEVELS, new Date("2026-10-13T13:00:00Z"))?.day, "2026-10-12");
  assert.equal(openRatingSession(daily, LEVELS, new Date("2026-10-13T14:30:00Z"))?.day, "2026-10-13");
});

test("openRatingSession reads a late Berlin class on Berlin's calendar", () => {
  const berlin = schedule({ format: "online_de", sessionStart: "23:30", sessionMinutes: 30 });
  // 22:30 UTC on 12 Oct is already 13 Oct in Vietnam; the Monday session is still the one to rate.
  assert.equal(openRatingSession(berlin, LEVELS, new Date("2026-10-12T22:30:00Z"))?.day, "2026-10-12");
  assert.equal(openRatingSession(berlin, LEVELS, new Date("2026-10-12T21:59:00Z"))?.day, undefined);
});

test("openRatingSession ignores skipped days and classes without times", () => {
  assert.equal(
    openRatingSession(schedule({ skippedDates: ["2026-10-12"] }), LEVELS, new Date("2026-10-12T15:00:00Z")),
    null,
  );
  // Without a start time Monday's session ends at 23:59 Vietnam time.
  const noTime = schedule({ sessionStart: null });
  assert.equal(openRatingSession(noTime, LEVELS, new Date("2026-10-12T15:00:00Z")), null);
  assert.equal(openRatingSession(noTime, LEVELS, new Date("2026-10-12T17:00:00Z"))?.day, "2026-10-12");
});

test("normalizeRatingInput keeps only the tags of the chosen star group", () => {
  const tags = ["fun", "too_fast", "easy", "bogus", "fun"];
  assert.deepEqual(normalizeRatingInput({ stars: 5, tags }), { stars: 5, tags: ["easy", "fun"], comment: null });
  assert.deepEqual(normalizeRatingInput({ stars: 2, tags }), { stars: 2, tags: ["too_fast"], comment: null });
  assert.deepEqual(normalizeRatingInput({ stars: 4, tags: "easy" })?.tags, []);
});

test("normalizeRatingInput trims and caps the comment", () => {
  assert.equal(normalizeRatingInput({ stars: 3, comment: "  Hơi nhanh  " })?.comment, "Hơi nhanh");
  assert.equal(normalizeRatingInput({ stars: 3, comment: "   " })?.comment, null);
  assert.equal(normalizeRatingInput({ stars: 3, comment: 42 })?.comment, null);
  assert.equal(Array.from(normalizeRatingInput({ stars: 3, comment: "a".repeat(400) })?.comment ?? "").length, RATING_COMMENT_MAX);
  // An emoji is one character, never cut in half.
  const edge = `${"a".repeat(RATING_COMMENT_MAX - 1)}😀😀`;
  assert.equal(normalizeRatingInput({ stars: 3, comment: edge })?.comment, `${"a".repeat(RATING_COMMENT_MAX - 1)}😀`);
});

test("normalizeRatingInput refuses stars outside 1–5", () => {
  for (const stars of [0, 6, 2.5, "5", null]) {
    assert.equal(normalizeRatingInput({ stars }), null);
  }
  assert.equal(normalizeRatingInput(null), null);
});

test("rating claim ids are recognised", () => {
  assert.equal(ratingClaimId("g126", "2026-10-14"), "rating:g126:2026-10-14");
  assert.equal(isRatingClaimId(ratingClaimId("g126", "2026-10-14")), true);
  assert.equal(isRatingClaimId("class:practice"), false);
});

test("parts per day count study and listening runs over the last 7 days", () => {
  const counts = partsByDayFromActivity({
    "2026-10-15": { studyRuns: 2, practiceRuns: 3 },
    "2026-10-09": { studyRuns: 1, practiceRuns: 0 },
    // 8 days back: outside the window.
    "2026-10-08": { studyRuns: 10, practiceRuns: 10 },
    "2026-10-10": { studyRuns: 0, practiceRuns: 0 },
  });
  assert.deepEqual(counts, { "2026-10-15": 5, "2026-10-09": 1, "2026-10-08": 20 });
  assert.equal(partsPerDay(counts, "2026-10-15"), 6 / 7);
  assert.equal(partsPerDay({}, "2026-10-15"), 0);
  assert.deepEqual(partsByDayFromActivity(undefined), {});
});

test("dailyParts lists every day oldest first, with zeros", () => {
  assert.deepEqual(dailyParts({ "2026-10-15": 4, "2026-10-13": 1 }, "2026-10-15", 3), [
    { day: "2026-10-13", parts: 1 },
    { day: "2026-10-14", parts: 0 },
    { day: "2026-10-15", parts: 4 },
  ]);
});

test("paceTier splits at 4 and 2 parts a day", () => {
  assert.equal(paceTier(6.3), "good");
  assert.equal(paceTier(4), "good");
  assert.equal(paceTier(3.9), "mid");
  assert.equal(paceTier(2), "mid");
  assert.equal(paceTier(1.99), "low");
});

test("daysSinceSeen counts whole days", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  assert.equal(daysSinceSeen("2026-10-15T01:00:00Z", now), 0);
  assert.equal(daysSinceSeen("2026-10-12T09:00:00Z", now), 3);
  assert.equal(daysSinceSeen(null, now), null);
  assert.equal(daysSinceSeen("not a date", now), null);
});

test("behindReasons flags pace, Lektion and absence on their own", () => {
  const onTrack = { pace: 4.2, lektion: 4, classLektion: 4, daysSinceSeen: 0 };
  assert.deepEqual(behindReasons(onTrack), []);
  assert.deepEqual(behindReasons({ ...onTrack, pace: 1.9 }), ["low-pace"]);
  assert.deepEqual(behindReasons({ ...onTrack, lektion: 3 }), ["behind-lektion"]);
  assert.deepEqual(behindReasons({ ...onTrack, lektion: 5 }), []);
  assert.deepEqual(behindReasons({ ...onTrack, daysSinceSeen: 3 }), ["inactive"]);
  assert.deepEqual(behindReasons({ ...onTrack, daysSinceSeen: 2 }), []);
  assert.deepEqual(behindReasons({ ...onTrack, daysSinceSeen: null }), ["inactive"]);
  // Unknown Lektion numbers are not compared.
  assert.deepEqual(behindReasons({ ...onTrack, lektion: null, classLektion: 4 }), []);
  assert.deepEqual(behindReasons({ pace: 0.6, lektion: 2, classLektion: 4, daysSinceSeen: 6 }), [
    "low-pace",
    "behind-lektion",
    "inactive",
  ]);
});

test("ratingTitle says today, yesterday, or the weekday", () => {
  assert.equal(ratingTitle("2026-10-15", "2026-10-15"), "Buổi học hôm nay thế nào?");
  assert.equal(ratingTitle("2026-10-14", "2026-10-15"), "Buổi học hôm qua thế nào?");
  assert.equal(ratingTitle("2026-10-13", "2026-10-15"), "Buổi học hôm thứ ba thế nào?");
  assert.equal(ratingTitle("2026-10-11", "2026-10-13"), "Buổi học hôm chủ nhật thế nào?");
});

test("ratingSubtitle names the Lektion, weekday and date", () => {
  assert.equal(ratingSubtitle(4, "2026-10-14"), "Lektion 4 · Thứ Tư, 14.10");
});

test("summarizeRatings hides the summary under 3 ratings, newest session first", () => {
  const rows = [
    { day: "2026-10-12", stars: 4, tags: ["easy"] },
    { day: "2026-10-12", stars: 3, tags: [] },
    { day: "2026-10-14", stars: 5, tags: ["easy", "fun"] },
    { day: "2026-10-14", stars: 4, tags: ["easy", "bogus"] },
    { day: "2026-10-14", stars: 2, tags: ["too_fast"] },
    { day: "2026-10-14", stars: 9, tags: ["fun"] },
  ];
  assert.deepEqual(summarizeRatings(rows), [
    {
      day: "2026-10-14",
      ratedCount: 3,
      average: 3.7,
      starCounts: [0, 1, 0, 1, 1],
      tagCounts: { easy: 2, fun: 1, too_fast: 1 },
    },
    { day: "2026-10-12", ratedCount: 2, average: null, starCounts: null, tagCounts: null },
  ]);
});
