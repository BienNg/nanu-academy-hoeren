import assert from "node:assert/strict";
import test from "node:test";
import { climbWindowStart, planRankClimb } from "./rank-climb.js";
import type { LeaderboardRow } from "./xp.js";

function board(entries: readonly [name: string, xp: number, isYou?: boolean][]): LeaderboardRow[] {
  return entries.map(([name, xp, isYou = false], index) => ({
    rank: index + 1,
    name,
    xp,
    isYou,
    gapBefore: false,
    won: 0,
    tied: 0,
    lost: 0,
    image: null,
  }));
}

test("climbWindowStart keeps the place in the middle and clamps at the edges", () => {
  assert.equal(climbWindowStart(0, 10, 5), 0);
  assert.equal(climbWindowStart(1, 10, 5), 0);
  assert.equal(climbWindowStart(5, 10, 5), 3);
  assert.equal(climbWindowStart(9, 10, 5), 5);
  assert.equal(climbWindowStart(2, 3, 5), 0);
});

test("planRankClimb takes the part's XP back off to find the old place", () => {
  const rows = board([
    ["A", 80],
    ["B", 60],
    ["You", 55, true],
    ["C", 50],
    ["D", 40],
    ["E", 10],
  ]);
  const climb = planRankClimb(rows, 20);
  assert.ok(climb);
  assert.equal(climb.rankBefore, 5);
  assert.equal(climb.rankAfter, 3);
  assert.equal(climb.xpBefore, 35);
  assert.equal(climb.xpAfter, 55);

  const byName = new Map(climb.rows.map((row) => [row.name, row]));
  assert.deepEqual([byName.get("C")!.before, byName.get("C")!.after], [2, 3]);
  assert.deepEqual([byName.get("D")!.before, byName.get("D")!.after], [3, 4]);
  assert.deepEqual([byName.get("B")!.before, byName.get("B")!.after], [1, 1]);
  assert.deepEqual([byName.get("E")!.before, byName.get("E")!.after], [5, 5]);
});

test("planRankClimb puts the learner below classmates on equal old XP", () => {
  const rows = board([
    ["You", 50, true],
    ["A", 30],
    ["B", 30],
  ]);
  const climb = planRankClimb(rows, 20);
  assert.ok(climb);
  assert.equal(climb.rankBefore, 3);
  assert.equal(climb.rankAfter, 1);
});

test("planRankClimb reports a held place when nobody was passed", () => {
  const climb = planRankClimb(board([["A", 90], ["You", 40, true], ["B", 5]]), 10);
  assert.ok(climb);
  assert.equal(climb.rankBefore, 2);
  assert.equal(climb.rankAfter, 2);
  assert.equal(climb.windowBefore, climb.windowAfter);
});

test("planRankClimb only keeps rows the window passes over", () => {
  const rows = board(
    Array.from({ length: 20 }, (_, index): [string, number, boolean] => [
      index === 1 ? "You" : `P${index}`,
      200 - index * 10,
      index === 1,
    ]),
  );
  // You sit 2nd with 190; 160 XP back off is 30, which is 18th of 20.
  const climb = planRankClimb(rows, 160);
  assert.ok(climb);
  assert.equal(climb.rankBefore, 18);
  assert.equal(climb.rankAfter, 2);
  assert.equal(climb.windowAfter, 0);
  assert.equal(climb.windowBefore, 15);
  assert.equal(climb.rows.length, 20);

  const small = planRankClimb(rows, 20);
  assert.ok(small);
  assert.equal(small.rankBefore, 4);
  assert.ok(small.rows.every((row) => row.after < 6 || row.before < 6));
});

test("planRankClimb has nothing to show without XP or without a row for you", () => {
  const rows = board([["A", 10], ["You", 5, true]]);
  assert.equal(planRankClimb(rows, 0), null);
  assert.equal(planRankClimb(board([["A", 10], ["B", 5]]), 10), null);
  assert.equal(planRankClimb([], 10), null);
});
