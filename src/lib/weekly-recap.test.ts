import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProgress } from "./progress";
import {
  buildWeeklyRecap,
  recapFileName,
  resolveRecapWeek,
  shiftWeekKey,
  weekDayKeys,
  weekStartIso,
} from "./weekly-recap";

// Saturday 3 Oct 2026, 10:00 in Vietnam. Its week starts Monday 28 Sep.
const NOW = new Date("2026-10-03T03:00:00.000Z");

test("week keys shift by whole weeks and list Monday to Sunday", () => {
  assert.equal(shiftWeekKey("2026-09-28", -1), "2026-09-21");
  assert.equal(shiftWeekKey("2026-12-28", 1), "2027-01-04");
  assert.deepEqual(weekDayKeys("2026-09-28"), [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
  assert.equal(weekStartIso("2026-09-28"), "2026-09-27T17:00:00.000Z");
});

test("resolveRecapWeek falls back to this week for bad, future, or old weeks", () => {
  assert.equal(resolveRecapWeek(null, NOW), "2026-09-28");
  assert.equal(resolveRecapWeek("2026-09-21", NOW), "2026-09-21");
  assert.equal(resolveRecapWeek("2026-09-22", NOW), "2026-09-28", "not a Monday");
  assert.equal(resolveRecapWeek("2026-10-05", NOW), "2026-09-28", "future");
  assert.equal(resolveRecapWeek("2026-07-06", NOW), "2026-07-06", "12 weeks back");
  assert.equal(resolveRecapWeek("2026-06-29", NOW), "2026-09-28", "13 weeks back");
  assert.equal(resolveRecapWeek("2026-02-30", NOW), "2026-09-28", "not a date");
});

test("buildWeeklyRecap sums this week against last week", () => {
  const progress = normalizeProgress({
    practiceDates: ["2026-09-28", "2026-09-30", "2026-09-25"],
    lastPracticeDate: "2026-09-30",
    streakTimeZone: "Asia/Ho_Chi_Minh",
  });
  const recap = buildWeeklyRecap({
    week: "2026-09-28",
    progress,
    now: NOW,
    xpRows: [
      { xp: 35, weekKey: "2026-09-28", dayKey: "2026-09-28" },
      { xp: 20, weekKey: "2026-09-28", dayKey: "2026-10-03" },
      { xp: 0, weekKey: "2026-09-28", dayKey: "2026-10-01" },
      { xp: 40, weekKey: "2026-09-21", dayKey: "2026-09-25" },
    ],
    runs: [
      { outcome: "success", accuracy: 100, answeredCount: 6, createdAt: "2026-09-28T02:00:00Z" },
      { outcome: "fail", accuracy: 50, answeredCount: 2, createdAt: "2026-10-03T01:00:00Z" },
      // Sunday 27 Sep 23:30 in Vietnam: last week.
      { outcome: "success", accuracy: 80, answeredCount: 4, createdAt: "2026-09-27T16:30:00Z" },
    ],
  });

  assert.equal(recap.xp, 55);
  assert.equal(recap.previousXp, 40);
  assert.equal(recap.partsPassed, 1);
  assert.equal(recap.clipsPracticed, 8);
  assert.equal(recap.accuracy, 88);
  assert.equal(recap.previousAccuracy, 80);
  assert.deepEqual(
    recap.days.filter((day) => day.active).map((day) => day.label),
    ["T2", "T4", "T7"],
    "zero-XP rows do not mark a day",
  );
  assert.equal(recap.activeDays, 3);
  assert.equal(recap.rangeLabel, "28/09 – 04/10/2026");
  assert.equal(recap.isCurrentWeek, true);
  assert.equal(typeof recap.streakDays, "number");
  assert.equal(recap.headline, "Tiến bộ hơn tuần trước!");
});

test("a past week has no streak and an empty week reads as a rest week", () => {
  const recap = buildWeeklyRecap({
    week: "2026-09-14",
    progress: normalizeProgress({}),
    now: NOW,
    xpRows: [],
    runs: [],
  });
  assert.equal(recap.streakDays, null);
  assert.equal(recap.accuracy, null);
  assert.equal(recap.activeDays, 0);
  assert.equal(recap.headline, "Tuần nghỉ ngơi, sẵn sàng quay lại!");
});

test("range label spans a year change", () => {
  const recap = buildWeeklyRecap({
    week: "2026-12-28",
    progress: normalizeProgress({}),
    now: NOW,
    xpRows: [],
    runs: [],
  });
  assert.equal(recap.rangeLabel, "28/12/2026 – 03/01/2027");
  assert.equal(recapFileName("2026-12-28"), "nanu-tong-ket-tuan-2026-12-28.png");
});
