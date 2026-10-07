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

test("daily targets are a share of the class, shown as a whole number", () => {
  const practice = quest("practice-60");
  assert.deepEqual([5, 6, 8, 16].map((size) => classQuestTarget(practice, size)), [3, 4, 5, 10]);
  const parts = quest("parts-2");
  assert.deepEqual([5, 6, 8, 16].map((size) => classQuestTarget(parts, size)), [10, 12, 16, 32]);
  assert.equal(classQuestTarget(quest("accurate-40"), 6), 3);
  assert.equal(classQuestTarget(quest("study-50"), 6), 3);
  assert.equal(classQuestTarget(quest("duels-50"), 6), 3);
  assert.equal(classQuestTarget(practice, 0), 1);

  const title = practice.title(classQuestTarget(practice, 6));
  assert.equal(title, "4 bạn trong lớp luyện tập hôm nay");
  assert.equal(title.includes("%"), false);
  assert.equal(quest("study-50").title(3).includes("%"), false);
  assert.equal(quest("duels-50").title(3), "Cả lớp chơi 3 lượt đấu");
  assert.equal(parts.title(12), "Cả lớp hoàn thành 12 phần luyện tập");
});

test("weekly targets stay fixed for every class size", () => {
  for (const size of [1, 6, 16]) {
    assert.equal(classQuestTarget(quest("xp-1000"), size), 1000);
    assert.equal(classQuestTarget(quest("parts-40"), size), 40);
    assert.equal(classQuestTarget(quest("duels-12"), size), 12);
  }
  assert.equal(quest("xp-1000").title(1000), "Cả lớp kiếm 1000 XP tuần này");
  assert.equal(quest("parts-40").title(40), "Cả lớp hoàn thành 40 phần luyện tập tuần này");
  assert.equal(quest("duels-12").title(12), "Cả lớp chơi 12 lượt đấu tuần này");
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
  assert.deepEqual(result, {
    target: 3,
    progress: 2,
    done: false,
    contributors: ["u1", "u2"],
    shares: [
      { userId: "u1", amount: 1 },
      { userId: "u2", amount: 1 },
    ],
  });
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
  assert.deepEqual(
    together.shares.map((share) => share.amount),
    [3, 3, 3, 3, 3],
  );
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

test("the weekly XP pile adds listening, study and duel XP and keeps each share", () => {
  const result = evaluateClassQuest(quest("xp-1000"), roster(6), [
    listen("u1", 80),
    { ...listen("u1"), xp: 35 },
    { ...listen("u1"), xp: 20 },
    { ...study("u2"), xp: 20 },
    { userId: "u3", day: DAY, kind: "duel", xp: 50 },
    { userId: "outsider", day: DAY, kind: "duel", xp: 500 },
  ]);
  assert.equal(result.target, 1000);
  assert.equal(result.progress, 125);
  assert.equal(result.done, false);
  assert.deepEqual(result.shares, [
    { userId: "u1", amount: 55 },
    { userId: "u2", amount: 20 },
    { userId: "u3", amount: 50 },
  ]);
});

test("only a contributor of a finished, unclaimed quest may claim it", () => {
  const done = {
    target: 1,
    progress: 1,
    done: true,
    contributors: ["u1"],
    shares: [{ userId: "u1", amount: 1 }],
  };
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
  assert.equal(classClaimId(quest("xp-1000")), "class-week:xp-1000");
  assert.ok(isClassQuestId("class:parts-2"));
  assert.ok(isClassQuestId("class-week:parts-40"));
  assert.ok(!isClassQuestId("listen-1"));
  assert.ok(!isClassQuestId("bonus"));
  for (const entry of [...CLASS_DAILY_POOL, ...CLASS_WEEKLY_POOL]) assert.ok(isClassQuestId(classClaimId(entry)));
});

test("admin quest stats leave class quest claims out", () => {
  const board = buildAdminQuestBoard(
    [
      { userId: "u1", questId: "listen-1", xp: 10, createdAt: "2026-10-07T03:00:00.000Z" },
      { userId: "u1", questId: "class:practice-60", xp: 25, createdAt: "2026-10-07T03:00:00.000Z" },
      { userId: "u2", questId: "class-week:xp-1000", xp: 80, createdAt: "2026-10-07T03:00:00.000Z" },
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
    result: {
      target: 2,
      progress: 2,
      done: true,
      contributors: ["u1", "u2"],
      shares: [
        { userId: "u1", amount: 1 },
        { userId: "u2", amount: 1 },
      ],
    },
    viewerId: "u2",
    claimed: false,
    people,
  });
  assert.equal(daily.xp, CLASS_QUEST_DAILY_XP);
  assert.equal(daily.title, "2 bạn trong lớp luyện tập hôm nay");
  assert.deepEqual(daily.contributors.map((person) => person.name), ["An", "Bình"]);
  assert.equal(daily.claimable, true);
  assert.equal(daily.showAmounts, false);
  assert.equal(daily.contributors[0]?.amount, 1);

  const weekly = buildClassQuestView({
    quest: quest("xp-1000"),
    result: {
      target: 1000,
      progress: 420,
      done: false,
      contributors: ["u1"],
      shares: [{ userId: "u1", amount: 420 }],
    },
    viewerId: "u2",
    claimed: false,
    people,
  });
  assert.equal(weekly.xp, CLASS_QUEST_WEEKLY_XP);
  assert.equal(weekly.title, "Cả lớp kiếm 1000 XP tuần này");
  assert.equal(weekly.showAmounts, true);
  assert.equal(weekly.contributors[0]?.amount, 420);
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
  assert.equal(read?.observing, false);
  assert.deepEqual(read?.classOptions, []);
  assert.equal(readClassQuestBoard({ ready: true, hasClass: false, daily: [daily], weekly: [] }), null);
});
