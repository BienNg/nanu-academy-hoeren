import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminClassLeague, weekDaysSoFar } from "./admin-class-league.js";
import { classClaimId, pickClassDailyQuests, type ClassActivity } from "./class-quests.js";
import { dayKey, type BoardPerson } from "./xp.js";

// Wednesday 2026-10-07, 10:00 in Vietnam.
const NOW = new Date("2026-10-07T03:00:00.000Z");

function person(userId: string, xp: number, classKey: string, extras: Partial<BoardPerson> = {}): BoardPerson {
  return { userId, name: userId.toUpperCase(), classKey, className: classKey.toUpperCase(), isAdmin: false, xp, reachedAt: null, ...extras };
}

test("week days run from Monday to today in Vietnam time", () => {
  assert.deepEqual(weekDaysSoFar(NOW), ["2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.deepEqual(weekDaysSoFar(new Date("2026-10-04T18:00:00.000Z")), ["2026-10-05"]);
  assert.equal(dayKey(NOW), "2026-10-07");
});

test("the admin league ranks classes like the board and lists every class", () => {
  const league = buildAdminClassLeague({
    people: [
      person("a1", 100, "a"),
      person("a2", 0, "a"),
      person("b1", 300, "b"),
      person("c1", 0, "c"),
      person("teacher", 500, "a", { isAdmin: true }),
      person("staff", 500, "b", { isStaff: true }),
    ],
    activity: [],
    claims: [],
    podiums: [],
    now: NOW,
  });
  assert.deepEqual(
    league.classes.map((row) => [row.name, row.rank, row.learners, row.weekXp]),
    [
      ["B", 1, 1, 300],
      ["A", 2, 2, 100],
      ["C", null, 1, 0],
    ],
  );
  assert.equal(league.totals.classes, 3);
  assert.equal(league.totals.rankedClasses, 2);
  assert.equal(league.classes[0]!.days.length, 3);
});

test("the admin league shows quest progress, contributors and claims per class", () => {
  const today = "2026-10-07";
  const roster = ["a1", "a2", "a3", "a4", "a5"];
  const activity: ClassActivity[] = roster.flatMap((userId) => [
    { userId, day: today, kind: "listening", accuracy: 95 },
    { userId, day: today, kind: "study" },
    { userId, day: today, kind: "duel" },
    { userId, day: today, kind: "duel" },
  ]);
  const [first] = pickClassDailyQuests("a", today);
  const league = buildAdminClassLeague({
    people: roster.map((userId) => person(userId, 50, "a")),
    activity,
    claims: [
      { userId: "a1", questId: classClaimId(first!), xp: 25, day: today },
      { userId: "outsider", questId: classClaimId(first!), xp: 25, day: today },
      { userId: "a2", questId: "listen-1", xp: 10, day: today },
    ],
    podiums: [],
    now: NOW,
  });
  const row = league.classes[0]!;
  assert.equal(row.activeLearners, 5);
  assert.ok(row.today.every((quest) => quest.done));
  assert.deepEqual(row.today[0]!.contributors, ["A1", "A2", "A3", "A4", "A5"]);
  assert.equal(row.today[0]!.claimed, 1);
  assert.deepEqual(row.days.at(-1), { day: today, done: 2, total: 2 });
  assert.equal(row.claims, 1);
  assert.equal(league.totals.claimXp, 25);
});

test("podium history groups learners per class, newest week first", () => {
  const league = buildAdminClassLeague({
    people: [person("a1", 0, "a"), person("b1", 0, "b")],
    activity: [],
    claims: [],
    podiums: [
      { week: "2026-09-21", userId: "a1", classKey: "a", rank: 1, classXp: 900 },
      { week: "2026-09-28", userId: "b1", classKey: "b", rank: 2, classXp: 400 },
      { week: "2026-09-28", userId: "a1", classKey: "a", rank: 1, classXp: 500 },
      { week: "2026-09-28", userId: "a2", classKey: "a", rank: 1, classXp: 500 },
    ],
    now: NOW,
  });
  assert.deepEqual(league.podiums, [
    {
      week: "2026-09-28",
      places: [
        { rank: 1, name: "A", classXp: 500, learners: 2 },
        { rank: 2, name: "B", classXp: 400, learners: 1 },
      ],
    },
    { week: "2026-09-21", places: [{ rank: 1, name: "A", classXp: 900, learners: 1 }] },
  ]);
});
