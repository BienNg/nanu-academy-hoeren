import assert from "node:assert/strict";
import test from "node:test";
import {
  claimsToCreate,
  evaluateQuests,
  eventsBefore,
  EMPTY_QUEST_EVENTS,
  MAX_QUEST_XP,
  pickDailyQuests,
  QUEST_BONUS_ID,
  QUEST_BONUS_XP,
  QUEST_KINDS,
  QUEST_POOL,
  questById,
  questDay,
  resolveQuestZone,
  zonedDayRange,
  readQuestUpdate,
  type QuestDefinition,
} from "./quests";

function quest(id: string): QuestDefinition {
  const found = questById(id);
  assert.ok(found, id);
  return found;
}

test("quest ids are unique and every kind has a quest", () => {
  assert.equal(new Set(QUEST_POOL.map((q) => q.id)).size, QUEST_POOL.length);
  for (const kind of QUEST_KINDS) {
    assert.ok(QUEST_POOL.some((q) => q.kind === kind), kind);
  }
  assert.notEqual(QUEST_POOL.some((q) => q.id === QUEST_BONUS_ID), true);
});

test("a learner gets one listening, one study and one habit quest", () => {
  const picked = pickDailyQuests("user-1", "2026-10-04");
  assert.deepEqual(
    picked.map((q) => q.kind),
    ["listening", "study", "habit"],
  );
});

test("the same learner and day always get the same quests", () => {
  assert.deepEqual(
    pickDailyQuests("user-1", "2026-10-04"),
    pickDailyQuests("user-1", "2026-10-04"),
  );
});

test("quests vary across days and learners", () => {
  const seen = new Set<string>();
  for (let day = 1; day <= 28; day += 1) {
    const key = `2026-10-${String(day).padStart(2, "0")}`;
    seen.add(pickDailyQuests("user-1", key).map((q) => q.id).join(","));
  }
  assert.ok(seen.size > 1);
  const users = new Set<string>();
  for (let user = 0; user < 40; user += 1) {
    users.add(pickDailyQuests(`user-${user}`, "2026-10-04").map((q) => q.id).join(","));
  }
  assert.ok(users.size > 1);
});

test("progress counts parts and is capped at the target", () => {
  const [listen] = evaluateQuests([quest("listen-2")], {
    ...EMPTY_QUEST_EVENTS,
    listeningAccuracies: [70, 80, 100],
  });
  assert.equal(listen!.progress, 2);
  assert.equal(listen!.done, true);

  const [partial] = evaluateQuests([quest("listen-2")], {
    ...EMPTY_QUEST_EVENTS,
    listeningAccuracies: [70],
  });
  assert.equal(partial!.progress, 1);
  assert.equal(partial!.done, false);
});

test("the accuracy quest ignores parts below the bar", () => {
  const events = { ...EMPTY_QUEST_EVENTS, listeningAccuracies: [89, 60] };
  assert.equal(evaluateQuests([quest("listen-accurate")], events)[0]!.done, false);
  const better = { ...events, listeningAccuracies: [89, 90] };
  assert.equal(evaluateQuests([quest("listen-accurate")], better)[0]!.done, true);
});

test("study and habit quests read their own counters", () => {
  const events = { listeningAccuracies: [], studyParts: 2, baseXp: 59 };
  const [study, habit] = evaluateQuests([quest("study-2"), quest("habit-60")], events);
  assert.equal(study!.done, true);
  assert.equal(habit!.done, false);
  assert.equal(habit!.progress, 59);
});

test("claims skip stored quests and the bonus needs all three", () => {
  const picked = [quest("listen-1"), quest("study-1"), quest("habit-60")];
  const events = { listeningAccuracies: [100], studyParts: 1, baseXp: 10 };
  const progress = evaluateQuests(picked, events);
  assert.deepEqual(
    claimsToCreate(progress, new Set()).map((c) => c.questId),
    ["listen-1", "study-1"],
  );
  assert.deepEqual(
    claimsToCreate(progress, new Set(["listen-1"])).map((c) => c.questId),
    ["study-1"],
  );

  const all = evaluateQuests(picked, { ...events, baseXp: 60 });
  const claims = claimsToCreate(all, new Set(["listen-1", "study-1"]));
  assert.deepEqual(
    claims.map((c) => c.questId),
    ["habit-60", QUEST_BONUS_ID],
  );
  assert.equal(claims[1]!.xp, QUEST_BONUS_XP);
  assert.deepEqual(
    claimsToCreate(all, new Set(["listen-1", "study-1", "habit-60", QUEST_BONUS_ID])),
    [],
  );
});

test("a day's quest XP never exceeds the cap", () => {
  for (let user = 0; user < 200; user += 1) {
    const picked = pickDailyQuests(`user-${user}`, "2026-10-04");
    const total = picked.reduce((sum, q) => sum + q.xp, 0) + QUEST_BONUS_XP;
    assert.ok(total <= MAX_QUEST_XP);
  }
});

test("readQuestUpdate keeps real updates and drops empty ones", () => {
  assert.equal(readQuestUpdate(null), null);
  assert.equal(readQuestUpdate({ xp: 0, completed: [], bonus: false }), null);
  assert.deepEqual(readQuestUpdate({ xp: 25, completed: ["A", 3], bonus: true }), {
    xp: 25,
    completed: ["A"],
    bonus: true,
    quests: [],
  });
});

test("readQuestUpdate keeps a quest that moved without finishing", () => {
  const step = {
    id: "study-2",
    kind: "study",
    title: "Hoàn thành 2 phần học",
    xp: 15,
    target: 2,
    progress: 1,
    done: false,
  };
  assert.equal(
    readQuestUpdate({ xp: 0, completed: [], bonus: false, quests: [{ ...step, before: 1 }] }),
    null,
  );
  const update = readQuestUpdate({
    xp: 0,
    completed: [],
    bonus: false,
    quests: [{ ...step, before: 0 }, { id: "bad" }],
  });
  assert.deepEqual(update?.quests, [{ ...step, before: 0 }]);
});

test("eventsBefore takes back exactly the part that triggered the sync", () => {
  const events = { listeningAccuracies: [80, 95, 80], studyParts: 2, baseXp: 90 };
  assert.deepEqual(eventsBefore(events, { kind: "listening", accuracy: 80, xp: 35 }), {
    listeningAccuracies: [80, 95],
    studyParts: 2,
    baseXp: 55,
  });
  assert.deepEqual(eventsBefore(events, { kind: "study", xp: 20 }), {
    listeningAccuracies: [80, 95, 80],
    studyParts: 1,
    baseXp: 70,
  });
  assert.equal(eventsBefore(events, { kind: "study", xp: 0 }), events);
  assert.equal(eventsBefore(events, null), events);
});

test("a request without a real zone falls back to Vietnam", () => {
  assert.equal(resolveQuestZone(null), "Asia/Ho_Chi_Minh");
  assert.equal(resolveQuestZone("Not/AZone"), "Asia/Ho_Chi_Minh");
  assert.equal(resolveQuestZone("Europe/Berlin"), "Europe/Berlin");
});

test("the quest day follows the device zone, not Vietnam", () => {
  // 20:00 UTC on the 4th is 03:00 on the 5th in Vietnam, 22:00 on the 4th in Berlin.
  const now = new Date("2026-10-04T20:00:00Z");
  assert.equal(questDay(now, "Asia/Ho_Chi_Minh"), "2026-10-05");
  assert.equal(questDay(now, "Europe/Berlin"), "2026-10-04");
  assert.equal(questDay(now, "America/Los_Angeles"), "2026-10-04");
});

test("a day range runs from local midnight to the next local midnight", () => {
  assert.deepEqual(zonedDayRange("2026-10-05", "Asia/Ho_Chi_Minh"), {
    start: "2026-10-04T17:00:00.000Z",
    end: "2026-10-05T17:00:00.000Z",
  });
  assert.deepEqual(zonedDayRange("2026-01-15", "America/New_York"), {
    start: "2026-01-15T05:00:00.000Z",
    end: "2026-01-16T05:00:00.000Z",
  });
});

test("a daylight saving day is 23 hours long and ranges stay contiguous", () => {
  const spring = zonedDayRange("2026-03-08", "America/New_York");
  assert.equal(Date.parse(spring.end) - Date.parse(spring.start), 23 * 3_600_000);
  assert.equal(zonedDayRange("2026-03-09", "America/New_York").start, spring.end);
  const fall = zonedDayRange("2026-11-01", "America/New_York");
  assert.equal(Date.parse(fall.end) - Date.parse(fall.start), 25 * 3_600_000);
});
