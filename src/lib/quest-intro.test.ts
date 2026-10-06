import assert from "node:assert/strict";
import test from "node:test";
import {
  isQuestIntroSurface,
  questIntroGreeting,
  questIntroKey,
  shouldShowQuestIntro,
} from "./quest-intro";
import type { QuestProgress } from "./quests";

function quest(done: boolean): QuestProgress {
  return { id: "listen-1", kind: "listening", title: "x", xp: 10, target: 1, progress: done ? 1 : 0, done };
}

test("quest intro key is per learner", () => {
  assert.notEqual(questIntroKey("a"), questIntroKey("b"));
});

test("quest intro shows on screens the app opens onto", () => {
  for (const path of [
    "/",
    "/duel",
    "/leaderboard",
    "/account",
    "/learn/a1-1",
    "/learn/a1-1/lektion-1",
    "/interview/pflege",
    "/living/restaurant",
  ]) {
    assert.equal(isQuestIntroSurface(path), true, path);
  }
});

test("quest intro stays out of lessons, quests, play screens and admin", () => {
  for (const path of [
    "/quests",
    "/admin",
    "/admin/xp",
    "/learn/a1-1/lektion-1/study",
    "/learn/a1-1/lektion-1/grammar/practice",
    "/living/restaurant/order/practice",
    "/duel/abc",
    "/blitzrunde/abc",
    "/session-ended",
  ]) {
    assert.equal(isQuestIntroSurface(path), false, path);
  }
});

test("quest intro shows once a day while a quest is open", () => {
  const open = [quest(true), quest(false)];
  assert.equal(shouldShowQuestIntro(null, "2026-10-06", open), true);
  assert.equal(shouldShowQuestIntro("2026-10-05", "2026-10-06", open), true);
  assert.equal(shouldShowQuestIntro("2026-10-06", "2026-10-06", open), false);
});

test("quest intro skips a finished or empty board", () => {
  assert.equal(shouldShowQuestIntro(null, "2026-10-06", [quest(true), quest(true)]), false);
  assert.equal(shouldShowQuestIntro(null, "2026-10-06", []), false);
});

test("quest intro greeting follows the hour", () => {
  assert.equal(questIntroGreeting(2), "Chào buổi tối");
  assert.equal(questIntroGreeting(7), "Chào buổi sáng");
  assert.equal(questIntroGreeting(12), "Chào buổi trưa");
  assert.equal(questIntroGreeting(15), "Chào buổi chiều");
  assert.equal(questIntroGreeting(21), "Chào buổi tối");
});
