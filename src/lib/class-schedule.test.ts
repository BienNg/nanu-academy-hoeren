import assert from "node:assert/strict";
import test from "node:test";
import {
  classProgress,
  formatScheduleDay,
  isScheduleDay,
  normalizeClassSchedule,
  readSessionStart,
  scheduleToday,
  sessionEndTime,
  type ClassScheduleFields,
} from "./class-schedule.js";

const LEVELS = [
  { slug: "a1-1", lektionen: 20 },
  { slug: "a1-2", lektionen: 20 },
  { slug: "a2-1", lektionen: 3 },
];
const KNOWN = LEVELS.map((level) => level.slug);

function schedule(overrides: Partial<ClassScheduleFields> = {}): ClassScheduleFields {
  return {
    format: "online_vn",
    // Monday and Thursday.
    weekdays: [1, 4],
    levels: [{ level: "a1-1", startedOn: "2026-10-05" }],
    skippedDates: [],
    ...overrides,
  };
}

test("isScheduleDay accepts real days only", () => {
  assert.equal(isScheduleDay("2026-10-13"), true);
  assert.equal(isScheduleDay("2026-02-30"), false);
  assert.equal(isScheduleDay("13.10.2026"), false);
  assert.equal(isScheduleDay(null), false);
});

test("formatScheduleDay shows weekday and German date order", () => {
  assert.equal(formatScheduleDay("2026-10-15"), "Thu 15.10.2026");
});

test("scheduleToday uses German time for classes held from Germany", () => {
  // 23:30 UTC on 12 Oct: already 13 Oct in Vietnam, still 13 Oct 01:30 in Berlin (CEST).
  const now = new Date("2026-10-12T23:30:00Z");
  assert.equal(scheduleToday("online_vn", now), "2026-10-13");
  assert.equal(scheduleToday("online_de", now), "2026-10-13");
  // 20:00 UTC on 12 Oct: 13 Oct in Vietnam, 12 Oct in Berlin.
  const evening = new Date("2026-10-12T20:00:00Z");
  assert.equal(scheduleToday("offline_hanoi", evening), "2026-10-13");
  assert.equal(scheduleToday("online_de", evening), "2026-10-12");
});

test("normalizeClassSchedule drops unknown levels, bad days, and duplicates", () => {
  const result = normalizeClassSchedule(
    {
      format: "offline_saigon",
      weekdays: [4, 1, 1, 9, "2"],
      levels: [
        { level: "a1-2", startedOn: "2026-12-01" },
        { level: "a1-1", startedOn: "2026-10-05" },
        { level: "a1-1", startedOn: "2026-10-06" },
        { level: "z9", startedOn: "2026-10-06" },
        { level: "a2-1", startedOn: "not a day" },
      ],
      skippedDates: ["2026-12-24", "2026-12-24", "2026-02-30", "2026-10-15"],
    },
    KNOWN,
  );
  assert.deepEqual(result, {
    format: "offline_saigon",
    weekdays: [1, 4],
    levels: [
      { level: "a1-1", startedOn: "2026-10-05" },
      { level: "a1-2", startedOn: "2026-12-01" },
    ],
    skippedDates: ["2026-10-15", "2026-12-24"],
    sessionStart: null,
    sessionMinutes: null,
  });
  assert.equal(normalizeClassSchedule("nope", KNOWN), null);
  assert.equal(normalizeClassSchedule({ format: "moon" }, KNOWN)?.format, null);
});

test("normalizeClassSchedule keeps a valid session time only", () => {
  const time = (sessionStart: unknown, sessionMinutes: unknown) => {
    const result = normalizeClassSchedule({ sessionStart, sessionMinutes }, KNOWN);
    return [result?.sessionStart, result?.sessionMinutes];
  };
  assert.deepEqual(time("19:30", 90), ["19:30", 90]);
  assert.deepEqual(time("07:05", 15), ["07:05", 15]);
  assert.deepEqual(time("19:30", null), ["19:30", null]);
  // Out of range lengths and bad times are dropped.
  assert.deepEqual(time("19:30", 10), ["19:30", null]);
  assert.deepEqual(time("19:30", 481), ["19:30", null]);
  assert.deepEqual(time("19:30", 90.5), ["19:30", null]);
  assert.deepEqual(time("24:00", 90), [null, null]);
  assert.deepEqual(time("7:30", 90), [null, null]);
  assert.deepEqual(time("19:30:00", 90), [null, null]);
  // A length needs a start time.
  assert.deepEqual(time(null, 90), [null, null]);
});

test("readSessionStart reads Postgres time values", () => {
  assert.equal(readSessionStart("19:30:00"), "19:30");
  assert.equal(readSessionStart("19:30"), "19:30");
  assert.equal(readSessionStart(null), null);
  assert.equal(readSessionStart("25:00:00"), null);
});

test("sessionEndTime adds the length and wraps past midnight", () => {
  assert.equal(sessionEndTime("19:30", 90), "21:00");
  assert.equal(sessionEndTime("23:30", 45), "00:15");
});

test("next Lektion counts class days before today", () => {
  // Mon 5 Oct = L1, Thu 8 Oct = L2, Mon 12 Oct = L3; Tue 13 Oct → next is Thu 15 Oct = L4.
  const progress = classProgress(schedule(), LEVELS, "2026-10-13");
  assert.equal(progress.kind, "running");
  if (progress.kind !== "running") return;
  assert.equal(progress.lektion, 4);
  assert.equal(progress.nextOn, "2026-10-15");
  assert.equal(progress.total, 20);
});

test("on a class day the next Lektion is today's", () => {
  const progress = classProgress(schedule(), LEVELS, "2026-10-12");
  assert.equal(progress.kind === "running" && progress.lektion, 3);
  assert.equal(progress.kind === "running" && progress.nextOn, "2026-10-12");
});

test("a start date that is not a class day begins on the next class day", () => {
  // Sat 3 Oct start: first class Mon 5 Oct.
  const progress = classProgress(
    schedule({ levels: [{ level: "a1-1", startedOn: "2026-10-03" }] }),
    LEVELS,
    "2026-10-04",
  );
  assert.equal(progress.kind === "running" && progress.lektion, 1);
  assert.equal(progress.kind === "running" && progress.nextOn, "2026-10-05");
});

test("skipped dates do not count as a Lektion", () => {
  const progress = classProgress(schedule({ skippedDates: ["2026-10-08"] }), LEVELS, "2026-10-13");
  assert.equal(progress.kind === "running" && progress.lektion, 3);
  // Skipping the next class day moves the next class.
  const later = classProgress(schedule({ skippedDates: ["2026-10-15"] }), LEVELS, "2026-10-13");
  assert.equal(later.kind === "running" && later.nextOn, "2026-10-19");
});

test("the latest started level sets the pace", () => {
  const progress = classProgress(
    schedule({
      levels: [
        { level: "a1-1", startedOn: "2026-06-01" },
        { level: "a1-2", startedOn: "2026-10-08" },
        { level: "a2-1", startedOn: "2027-03-01" },
      ],
    }),
    LEVELS,
    "2026-10-13",
  );
  assert.equal(progress.kind === "running" && progress.level, "a1-2");
  // Thu 8 Oct = L1, Mon 12 Oct = L2 → next L3.
  assert.equal(progress.kind === "running" && progress.lektion, 3);
});

test("a level whose last Lektion is past is finished", () => {
  // a2-1 has 3 Lektionen: Mon 5, Thu 8, Mon 12 Oct.
  const progress = classProgress(
    schedule({ levels: [{ level: "a2-1", startedOn: "2026-10-05" }] }),
    LEVELS,
    "2026-10-13",
  );
  assert.deepEqual(progress, {
    kind: "finished",
    level: "a2-1",
    startedOn: "2026-10-05",
    total: 3,
    finishedOn: "2026-10-12",
    nextLevel: null,
  });
  const running = classProgress(
    schedule({ levels: [{ level: "a2-1", startedOn: "2026-10-05" }] }),
    LEVELS,
    "2026-10-12",
  );
  assert.equal(running.kind === "running" && running.endsOn, "2026-10-12");
});

test("missing pieces say what to fill in", () => {
  assert.equal(classProgress(schedule({ levels: [] }), LEVELS, "2026-10-13").kind, "no-levels");
  assert.equal(classProgress(schedule({ weekdays: [] }), LEVELS, "2026-10-13").kind, "no-weekdays");
  assert.deepEqual(classProgress(schedule(), LEVELS, "2026-10-01"), {
    kind: "upcoming",
    level: "a1-1",
    startsOn: "2026-10-05",
  });
});
