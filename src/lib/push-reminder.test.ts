import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyReminderState,
  planStreakReminder,
  shiftIsoDate,
  streakReminderCopy,
  type ReminderState,
} from "./push-reminder.js";

const today = "2026-10-10";

function plan(
  state: ReminderState,
  options: { streakDays?: number; practicedToday?: boolean; practiced?: string[] } = {},
) {
  const practiced = new Set(options.practiced ?? []);
  return planStreakReminder({
    state,
    today,
    streakDays: options.streakDays ?? 6,
    practicedToday: options.practicedToday ?? false,
    practicedOn: (day) => practiced.has(day),
  });
}

test("sends once when the streak is still alive and today is empty", () => {
  const result = plan(emptyReminderState());
  assert.equal(result.send, true);
  assert.equal(result.next.lastSentOn, today);
});

test("skips a learner who already practiced or has no streak", () => {
  assert.equal(plan(emptyReminderState(), { practicedToday: true }).send, false);
  assert.equal(plan(emptyReminderState(), { streakDays: 0 }).send, false);
});

test("does not send twice on the same day", () => {
  const first = plan(emptyReminderState());
  assert.equal(plan(first.next).send, false);
});

test("a finished part on the send day clears the ignore count", () => {
  const state: ReminderState = {
    lastSentOn: "2026-10-09",
    judgedOn: null,
    ignoredCount: 2,
    pausedUntil: null,
  };
  const result = plan(state, { practiced: ["2026-10-09"], streakDays: 7 });
  assert.equal(result.next.ignoredCount, 0);
  assert.equal(result.send, true);
});

test("three ignored reminders pause the next two weeks", () => {
  let state: ReminderState = { ...emptyReminderState(), ignoredCount: 2, lastSentOn: "2026-10-09" };
  const judged = plan(state);
  assert.equal(judged.send, false);
  assert.equal(judged.next.pausedUntil, shiftIsoDate(today, 14));
  assert.equal(judged.next.ignoredCount, 0);

  state = judged.next;
  assert.equal(plan(state, { streakDays: 4 }).send, false);

  const later = planStreakReminder({
    state,
    today: judged.next.pausedUntil ?? today,
    streakDays: 4,
    practicedToday: false,
    practicedOn: () => false,
  });
  assert.equal(later.send, true);
});

test("an ignored send is counted once", () => {
  const state: ReminderState = {
    lastSentOn: "2026-10-09",
    judgedOn: null,
    ignoredCount: 0,
    pausedUntil: null,
  };
  const first = plan(state, { streakDays: 0 });
  assert.equal(first.next.ignoredCount, 1);
  const again = plan({ ...first.next, lastSentOn: "2026-10-09" }, { streakDays: 0 });
  assert.equal(again.next.ignoredCount, 1);
  assert.equal(again.changed, false);
});

test("copy names the streak and opens home", () => {
  assert.deepEqual(streakReminderCopy(6), {
    title: "Chuỗi 6 ngày sắp mất",
    body: "Một phần nữa là giữ được.",
    url: "/",
  });
});
