import assert from "node:assert/strict";
import test from "node:test";
import { climbWindowStart, planClassRankClimb, planRankClimb } from "./rank-climb.js";
import type { ClassBoardRow, LeaderboardRow } from "./xp.js";

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

function classes(
  entries: readonly [name: string, xp: number, members: number, isYours?: boolean][],
): ClassBoardRow[] {
  return entries.map(([name, xp, members, isYours = false], index) => ({
    rank: index + 1,
    name,
    xp,
    members,
    xpPerMember: Math.round(xp / members),
    isYours,
  }));
}

test("planClassRankClimb takes the part's XP off the viewer's class", () => {
  const climb = planClassRankClimb(
    classes([
      ["A1 Tối", 2200, 8],
      ["A1 Sáng", 1800, 8, true],
      ["A2 Chiều", 1600, 6],
      ["B1 Sáng", 1500, 5],
      ["A1 Chiều", 900, 7],
    ]),
    400,
  );
  assert.ok(climb);
  assert.equal(climb.xpBefore, 1400);
  assert.equal(climb.xpAfter, 1800);
  assert.equal(climb.rankBefore, 4);
  assert.equal(climb.rankAfter, 2);
  const yours = climb.rows.find((row) => row.isYours);
  assert.equal(yours?.xpPerMemberBefore, 175);
  assert.equal(yours?.xpPerMemberAfter, 225);
});

test("planClassRankClimb breaks ties by XP per learner, then name", () => {
  const byRate = planClassRankClimb(
    classes([
      ["Bạn", 100, 4, true],
      ["Đông", 80, 2],
      ["An", 80, 8],
    ]),
    20,
  );
  assert.ok(byRate);
  // Before: 80 XP and 20 XP/learner sits under Đông (40) and above An (10).
  assert.equal(byRate.rankBefore, 2);
  assert.equal(byRate.rankAfter, 1);

  const byName = planClassRankClimb(
    classes([
      ["Minh", 80, 5, true],
      ["An", 50, 5],
    ]),
    30,
  );
  assert.ok(byName);
  // Before both have 50 XP and 10 XP/learner, so An stays above Minh.
  assert.equal(byName.rankBefore, 2);
  assert.equal(byName.rankAfter, 1);
});

test("planClassRankClimb starts a new class below every class already ranked", () => {
  const climb = planClassRankClimb(
    classes([
      ["A1 Tối", 400, 4],
      ["A1 Sáng", 25, 5, true],
    ]),
    25,
  );
  assert.ok(climb);
  assert.equal(climb.xpBefore, 0);
  assert.equal(climb.rankBefore, 2);
  assert.equal(climb.rankAfter, 2);
});

test("planClassRankClimb has nothing to show without XP or without your class", () => {
  const rows = classes([["A1 Sáng", 40, 4, true]]);
  assert.equal(planClassRankClimb(rows, 0), null);
  assert.equal(planClassRankClimb(classes([["A1 Tối", 40, 4]]), 10), null);
  assert.equal(planClassRankClimb([], 10), null);
});
