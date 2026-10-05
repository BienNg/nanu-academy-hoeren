import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_USER_TIMELINE_CAP,
  buildActiveUserTimeline,
  formatRelativeLastSeen,
  type AdminUserRow,
} from "./admin-overview.js";

const NOW = new Date("2026-10-02T06:30:00.000Z");

function row(userId: string, lastLoginAt: string | null, displayName = userId): AdminUserRow {
  const lastLoginMs = lastLoginAt ? Date.parse(lastLoginAt) : 0;
  return {
    userId,
    displayName,
    image: null,
    lastLoginAt,
    lastLoginMs: Number.isNaN(lastLoginMs) ? 0 : lastLoginMs,
    isAdmin: false,
    staff: false,
  } as AdminUserRow;
}

test("today places each student once, from midnight through the current hour", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("early", "2026-10-02T02:15:00.000Z", "Early"),
      row("late", "2026-10-02T07:05:00.000Z", "Late"),
      row("noon", "2026-10-02T05:10:00.000Z", "Noon"),
      row("yesterday", "2026-10-01T06:00:00.000Z", "Yesterday"),
      row("missing", null, "Missing"),
    ],
    "today",
    NOW,
  );

  assert.equal(timeline.grain, "hour");
  assert.deepEqual(
    timeline.columns.map((column) => column.label),
    Array.from({ length: 14 }, (_, hour) => String(hour)),
  );

  const placed = timeline.columns.flatMap((column) =>
    column.students.map((student) => `${column.label}:${student.userId}`),
  );
  assert.deepEqual(placed, ["9:early", "12:noon"]);
  assert.equal(timeline.unplaced, 3);
});

test("students who share an hour stack newest first", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("mid", "2026-10-02T06:10:00.000Z", "Mid"),
      row("newest", "2026-10-02T06:40:00.000Z", "Newest"),
      row("older", "2026-10-02T06:05:00.000Z", "Older"),
    ],
    "today",
    NOW,
  );
  const hour = timeline.columns.find((column) => column.label === "13");
  assert.deepEqual(
    hour?.students.map((student) => student.userId),
    ["newest", "mid", "older"],
  );
});

test("a busy column keeps every student and the avatar cap stays at 8", () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    row(
      `user-${index}`,
      new Date(Date.parse("2026-10-02T06:00:00.000Z") + index * 60_000).toISOString(),
      `User ${String(index).padStart(2, "0")}`,
    ),
  );
  const timeline = buildActiveUserTimeline(rows, "today", NOW);
  const hour = timeline.columns.find((column) => column.label === "13");
  assert.equal(ACTIVE_USER_TIMELINE_CAP, 8);
  assert.equal(hour?.students.length, 10);
  assert.deepEqual(
    hour?.students.slice(0, ACTIVE_USER_TIMELINE_CAP).map((student) => student.userId),
    ["user-9", "user-8", "user-7", "user-6", "user-5", "user-4", "user-3", "user-2"],
  );
  assert.equal(timeline.unplaced, 0);
});

test("a last-seen day outside the window is unplaced", () => {
  const timeline = buildActiveUserTimeline(
    [
      row("inside", "2026-09-26T02:00:00.000Z", "Inside"),
      row("outside", "2026-09-25T02:00:00.000Z", "Outside"),
    ],
    "7d",
    NOW,
  );

  assert.equal(timeline.grain, "day");
  assert.equal(timeline.columns.length, 7);
  assert.equal(timeline.columns[0]?.key, "2026-09-26");
  assert.equal(timeline.columns.at(-1)?.key, "2026-10-02");
  assert.equal(timeline.columns[0]?.label, "Sat 26");
  assert.equal(timeline.columns.at(-1)?.label, "Fri 2");
  assert.deepEqual(
    timeline.columns.flatMap((column) => column.students.map((student) => student.userId)),
    ["inside"],
  );
  assert.equal(timeline.unplaced, 1);
});

test("longer ranges mark the month on the first column and on the 1st", () => {
  const timeline = buildActiveUserTimeline([], "30d", NOW);
  assert.equal(timeline.columns[0]?.marker, "Sept");
  const first = timeline.columns.find((column) => column.key === "2026-10-01");
  assert.equal(first?.marker, "Oct");
  assert.equal(first?.label, "1");
  const second = timeline.columns.find((column) => column.key === "2026-10-02");
  assert.equal(second?.marker, null);
});

test("last seen is hours today, yesterday, or calendar days ago", () => {
  // 2026-10-02 13:30 in Asia/Ho_Chi_Minh.
  assert.equal(formatRelativeLastSeen("2026-10-02T06:00:00.000Z", NOW), "less than an hour ago");
  assert.equal(formatRelativeLastSeen("2026-10-02T05:30:00.000Z", NOW), "1 hour ago");
  assert.equal(formatRelativeLastSeen("2026-10-02T03:30:00.000Z", NOW), "3 hours ago");
  assert.equal(formatRelativeLastSeen("2026-10-01T16:30:00.000Z", NOW), "yesterday");
  assert.equal(formatRelativeLastSeen("2026-09-29T06:30:00.000Z", NOW), "3 days ago");
  assert.equal(formatRelativeLastSeen(null, NOW), null);

  // 00:30 on 3 Oct still calls 23:00 on 2 Oct yesterday.
  const afterMidnight = new Date("2026-10-02T17:30:00.000Z");
  assert.equal(formatRelativeLastSeen("2026-10-02T16:00:00.000Z", afterMidnight), "yesterday");
});
