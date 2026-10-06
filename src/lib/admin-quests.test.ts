import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminQuestBoard, type AdminQuestClaimRow } from "./admin-quests";

const DAYS = ["2026-10-05", "2026-10-04"];

function claim(userId: string, questId: string, xp: number, createdAt: string): AdminQuestClaimRow {
  return { userId, questId, xp, createdAt };
}

test("quest stats count completions, perfect days, learners and XP", () => {
  const board = buildAdminQuestBoard(
    [
      claim("a", "listen-1", 10, "2026-10-04T05:00:00Z"),
      claim("a", "study-1", 10, "2026-10-04T06:00:00Z"),
      claim("a", "habit-60", 15, "2026-10-04T07:00:00Z"),
      claim("a", "bonus", 20, "2026-10-04T07:00:00Z"),
      claim("b", "listen-2", 15, "2026-10-05T01:00:00Z"),
    ],
    DAYS,
  );
  assert.equal(board.completed, 4);
  assert.equal(board.perfectDays, 1);
  assert.equal(board.learners, 2);
  assert.equal(board.xp, 70);
  assert.deepEqual(
    board.byKind.map((row) => [row.kind, row.completions, row.xp]),
    [
      ["study", 1, 10],
      ["listening", 2, 25],
      ["habit", 1, 15],
    ],
  );
  assert.deepEqual(board.points, [
    { key: "2026-10-04", quests: 3, perfect: 1 },
    { key: "2026-10-05", quests: 1, perfect: 0 },
  ]);
});

test("quest stats land on the Vietnam day and skip claims outside the window", () => {
  const board = buildAdminQuestBoard(
    [
      // 18:00 UTC on the 4th is 01:00 on the 5th in Vietnam.
      claim("a", "listen-1", 10, "2026-10-04T18:00:00Z"),
      claim("a", "study-1", 10, "2026-10-03T01:00:00Z"),
      claim("a", "study-2", 15, "not a date"),
    ],
    DAYS,
  );
  assert.equal(board.completed, 1);
  assert.deepEqual(board.points, [
    { key: "2026-10-04", quests: 0, perfect: 0 },
    { key: "2026-10-05", quests: 1, perfect: 0 },
  ]);
});

test("an empty window gives zeroes", () => {
  const board = buildAdminQuestBoard([], DAYS);
  assert.equal(board.completed, 0);
  assert.equal(board.learners, 0);
  assert.equal(board.points.length, 2);
});
