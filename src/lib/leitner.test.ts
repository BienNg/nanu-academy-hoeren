import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  applyAnswer,
  boxKey,
  compareReviewPriority,
  daysBetween,
  intervalLabel,
  replayEvents,
  vietnamDay,
  type BoxState,
  type ClipEvent,
} from "./leitner.js";

test("vietnamDay switches at midnight in Vietnam, not UTC", () => {
  assert.equal(vietnamDay(new Date("2026-10-01T16:59:59Z")), "2026-10-01");
  assert.equal(vietnamDay(new Date("2026-10-01T17:00:00Z")), "2026-10-02");
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-10-02", "2026-10-25"), 23);
});

test("a new clip starts in box 1 when right and box 0 when missed", () => {
  assert.deepEqual(applyAnswer(null, false, "2026-10-01"), { box: 1, dueOn: "2026-10-04", lapses: 0 });
  assert.deepEqual(applyAnswer(null, true, "2026-10-01"), { box: 0, dueOn: "2026-10-02", lapses: 0 });
});

test("right on a due clip moves it up one box", () => {
  const state: BoxState = { box: 2, dueOn: "2026-10-11", lapses: 0 };
  assert.deepEqual(applyAnswer(state, false, "2026-10-11"), { box: 3, dueOn: "2026-10-25", lapses: 0 });
  // Overdue counts as due.
  assert.deepEqual(applyAnswer(state, false, "2026-10-20"), { box: 3, dueOn: "2026-11-03", lapses: 0 });
});

test("right before the due day changes nothing", () => {
  const state: BoxState = { box: 3, dueOn: "2026-10-25", lapses: 1 };
  assert.equal(applyAnswer(state, false, "2026-10-18"), state);
});

test("any miss drops to box 0 with a lapse, due or not", () => {
  const state: BoxState = { box: 4, dueOn: "2026-12-01", lapses: 1 };
  assert.deepEqual(applyAnswer(state, true, "2026-10-18"), { box: 0, dueOn: "2026-10-19", lapses: 2 });
});

test("box 6 is the ceiling and comes back every 120 days", () => {
  const state: BoxState = { box: 6, dueOn: "2026-10-02", lapses: 0 };
  assert.deepEqual(applyAnswer(state, false, "2026-10-02"), { box: 6, dueOn: "2027-01-30", lapses: 0 });
});

test("replay follows the Guten Morgen example", () => {
  // Day 1 is 2026-10-01. 03:00 UTC is 10:00 in Vietnam.
  const day = (n: number) => `${addDays("2026-10-01", n - 1)}T03:00:00Z`;
  const event = (n: number, missed: boolean): ClipEvent => ({
    lessonKey: "a1-1/lektion-1",
    clipId: "guten-morgen",
    missed,
    at: day(n),
  });
  const events = [
    event(26, false),
    event(1, false),
    event(4, false),
    event(18, false), // early replay: stays in box 3
    event(11, false),
    event(25, true),
  ];
  const state = replayEvents(events).get(boxKey("a1-1/lektion-1", "guten-morgen"));
  assert.deepEqual(state, { box: 1, dueOn: addDays("2026-10-01", 28), lapses: 1 });
});

test("replay keeps clips of different lessons apart and orders same-moment clips", () => {
  const at = "2026-10-01T03:00:00Z";
  const boxes = replayEvents([
    { lessonKey: "a1-1/lektion-2", clipId: "x", missed: false, at, order: 1 },
    { lessonKey: "a1-1/lektion-1", clipId: "x", missed: true, at, order: 0 },
  ]);
  assert.equal(boxes.get(boxKey("a1-1/lektion-1", "x"))?.box, 0);
  assert.equal(boxes.get(boxKey("a1-1/lektion-2", "x"))?.box, 1);
});

test("review priority: lapses, then box, then oldest due day", () => {
  const states: BoxState[] = [
    { box: 2, dueOn: "2026-10-01", lapses: 0 },
    { box: 0, dueOn: "2026-10-02", lapses: 0 },
    { box: 0, dueOn: "2026-09-30", lapses: 0 },
    { box: 3, dueOn: "2026-10-02", lapses: 2 },
  ];
  const sorted = [...states].sort(compareReviewPriority);
  assert.deepEqual(
    sorted.map((state) => `${state.box}/${state.lapses}/${state.dueOn}`),
    ["3/2/2026-10-02", "0/0/2026-09-30", "0/0/2026-10-02", "2/0/2026-10-01"],
  );
});

test("interval labels follow the box table", () => {
  assert.deepEqual(
    [1, 3, 7, 14, 30, 60, 120].map(intervalLabel),
    ["1 ngày", "3 ngày", "1 tuần", "2 tuần", "1 tháng", "2 tháng", "4 tháng"],
  );
});
