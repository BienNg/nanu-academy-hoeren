import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassQuestView,
  CLASS_DAILY_POOL,
  CLASS_QUEST_DAILY_XP,
  CLASS_QUEST_WEEKLY_XP,
  CLASS_WEEKLY_POOL,
  classClaimDenial,
  classClaimId,
  classQuestById,
  classQuestTarget,
  evaluateClassQuest,
  isClassQuestId,
  pickClassDailyQuests,
  pickClassWeeklyQuest,
  readClassQuestBoard,
  type ClassActivity,
  type ClassQuestDefinition,
} from "./class-quests.js";
import { buildAdminQuestBoard } from "./admin-quests.js";

const DAY = "2026-10-07";

function quest(id: string): ClassQuestDefinition {
  const found = classQuestById(id);
  assert.ok(found, id);
  return found;
}

function listen(userId: string, accuracy = 80, day = DAY): ClassActivity {
  return { userId, day, kind: "listening", accuracy };
}

function study(userId: string, day = DAY): ClassActivity {
  return { userId, day, kind: "study" };
}

const roster = (count: number) => Array.from({ length: count }, (_, index) => `u${index + 1}`);

test("targets scale with the class, so small and big classes face the same share", () => {
  const practice = quest("practice-60");
  assert.deepEqual([5, 8, 16].map((size) => classQuestTarget(practice, size)), [3, 5, 10]);
  const parts = quest("parts-2");
  assert.deepEqual([5, 8, 16].map((size) => classQuestTarget(parts, size)), [10, 16, 32]);
  assert.equal(classQuestTarget(quest("class-days-5"), 8), 5);
  assert.equal(classQuestTarget(practice, 0), 1);
});

test("everyone means everyone, but a class of 10 or more may miss one learner", () => {
  const everyone = quest("everyone");
  assert.equal(classQuestTarget(everyone, 5), 5);
  assert.equal(classQuestTarget(everyone, 9), 9);
  assert.equal(classQuestTarget(everyone, 10), 9);
  assert.equal(classQuestTarget(everyone, 16), 15);
});

test("a class gets two different daily quests and one weekly quest, the same every time", () => {
  for (const classKey of ["a1 abend", "b1", "a2 morgen"]) {
    for (const day of ["2026-10-05", "2026-10-06", "2026-10-07"]) {
      const picked = pickClassDailyQuests(classKey, day);
      assert.equal(picked.length, 2);
      assert.notEqual(picked[0]!.id, picked[1]!.id);
      assert.deepEqual(pickClassDailyQuests(classKey, day), picked);
    }
    assert.equal(pickClassWeeklyQuest(classKey, "2026-10-05"), pickClassWeeklyQuest(classKey, "2026-10-05"));
  }
  const seen = new Set(
    Array.from({ length: 40 }, (_, index) => pickClassDailyQuests("a1", `2026-11-${String(index % 28 + 1).padStart(2, "0")}`))
      .flat()
      .map((picked) => picked.id),
  );
  assert.equal(seen.size, CLASS_DAILY_POOL.length);
});

test("participation counts learners, not parts, and ignores people outside the class", () => {
  const result = evaluateClassQuest(quest("practice-60"), roster(5), [
    listen("u1"),
    listen("u1"),
    listen("u1"),
    study("u2"),
    listen("outsider"),
    { userId: "u3", day: DAY, kind: "duel" },
  ]);
  assert.deepEqual(result, { target: 3, progress: 2, done: false, contributors: ["u1", "u2"] });
});

test("one learner cannot finish a volume quest alone", () => {
  const parts = quest("parts-2");
  const grinder = Array.from({ length: 20 }, () => listen("u1"));
  const alone = evaluateClassQuest(parts, roster(5), grinder);
  assert.equal(alone.progress, 3);
  assert.equal(alone.done, false);

  const together = evaluateClassQuest(parts, roster(5), [
    ...grinder,
    ...[2, 3, 4, 5].flatMap((n) => [listen(`u${n}`), study(`u${n}`), study(`u${n}`), study(`u${n}`)]),
  ]);
  assert.equal(together.target, 10);
  assert.equal(together.done, true);
  assert.deepEqual(together.contributors, roster(5));
});

test("accuracy quests only count listening parts at 90% or more", () => {
  const result = evaluateClassQuest(quest("accurate-40"), roster(5), [
    listen("u1", 95),
    listen("u2", 89),
    study("u3"),
    listen("u4", 90),
  ]);
  assert.equal(result.target, 2);
  assert.equal(result.done, true);
  assert.deepEqual(result.contributors, ["u1", "u4"]);
});

test("class days count the days on which enough of the class practiced", () => {
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
  const activity = days.flatMap((day, index) =>
    // Three of five learners on four days, two on the last.
    (index < 4 ? ["u1", "u2", "u3"] : ["u1", "u2"]).map((userId) => listen(userId, 80, day)),
  );
  const result = evaluateClassQuest(quest("class-days-5"), roster(5), activity);
  assert.equal(result.progress, 4);
  assert.equal(result.done, false);
  assert.deepEqual(result.contributors, ["u1", "u2", "u3"]);
});

test("only a contributor of a finished, unclaimed quest may claim it", () => {
  const done = { target: 1, progress: 1, done: true, contributors: ["u1"] };
  assert.equal(classClaimDenial({ result: done, viewerId: "u1", claimed: false }), null);
  assert.equal(classClaimDenial({ result: done, viewerId: "u2", claimed: false }), "not-contributor");
  assert.equal(classClaimDenial({ result: done, viewerId: "u1", claimed: true }), "claimed");
  assert.equal(
    classClaimDenial({ result: { ...done, done: false, progress: 0 }, viewerId: "u1", claimed: false }),
    "not-done",
  );
  assert.equal(classClaimDenial({ result: null, viewerId: "u1", claimed: false }), "unknown");
});

test("claim ids keep class quests apart from personal ones", () => {
  assert.equal(classClaimId(quest("practice-60")), "class:practice-60");
  assert.equal(classClaimId(quest("everyone")), "class-week:everyone");
  assert.ok(isClassQuestId("class:parts-2"));
  assert.ok(isClassQuestId("class-week:everyone"));
  assert.ok(!isClassQuestId("listen-1"));
  assert.ok(!isClassQuestId("bonus"));
  for (const entry of [...CLASS_DAILY_POOL, ...CLASS_WEEKLY_POOL]) assert.ok(isClassQuestId(classClaimId(entry)));
});

test("admin quest stats leave class quest claims out", () => {
  const board = buildAdminQuestBoard(
    [
      { userId: "u1", questId: "listen-1", xp: 10, createdAt: "2026-10-07T03:00:00.000Z" },
      { userId: "u1", questId: "class:practice-60", xp: 25, createdAt: "2026-10-07T03:00:00.000Z" },
      { userId: "u2", questId: "class-week:everyone", xp: 80, createdAt: "2026-10-07T03:00:00.000Z" },
    ],
    [DAY],
  );
  assert.equal(board.completed, 1);
  assert.equal(board.xp, 10);
  assert.equal(board.learners, 1);
});

test("the view shows who helped and pays daily and weekly amounts", () => {
  const people = new Map([
    ["u1", { name: "An", image: null }],
    ["u2", { name: "Bình", image: null }],
  ]);
  const daily = buildClassQuestView({
    quest: quest("practice-60"),
    result: { target: 2, progress: 2, done: true, contributors: ["u1", "u2"] },
    viewerId: "u2",
    claimed: false,
    people,
  });
  assert.equal(daily.xp, CLASS_QUEST_DAILY_XP);
  assert.equal(daily.title, "2 bạn trong lớp luyện tập hôm nay");
  assert.deepEqual(daily.contributors.map((person) => person.name), ["An", "Bình"]);
  assert.equal(daily.claimable, true);

  const weekly = buildClassQuestView({
    quest: quest("everyone"),
    result: { target: 5, progress: 1, done: false, contributors: ["u1"] },
    viewerId: "u2",
    claimed: false,
    people,
  });
  assert.equal(weekly.xp, CLASS_QUEST_WEEKLY_XP);
  assert.equal(weekly.youContributed, false);
  assert.equal(weekly.claimable, false);

  const read = readClassQuestBoard({
    ready: true,
    hasClass: true,
    className: "A1",
    learners: 5,
    daily: [daily, { id: 1 }],
    weekly: [weekly],
    dayEndsAt: "x",
    weekEndsAt: "y",
  });
  assert.equal(read?.daily.length, 1);
  assert.equal(readClassQuestBoard({ ready: true, hasClass: false, daily: [daily], weekly: [] }), null);
});
