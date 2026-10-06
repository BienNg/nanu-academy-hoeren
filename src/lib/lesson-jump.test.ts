import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJumpDeck,
  checkJumpAnswer,
  decideJumpXp,
  gradeJumpAnswers,
  JUMP_CARD_COUNT,
  JUMP_HEARTS,
  JUMP_XP,
  jumpSeed,
  jumpTarget,
  MIN_MS_PER_JUMP_CARD,
  parseLessonJumpInput,
  type JumpAnswer,
} from "./lesson-jump.js";
import {
  completeLessonByJump,
  DEFAULT_PROGRESS,
  isLearnChapterCompleted,
  isStudyChapterCompleted,
  mergeProgress,
  normalizeProgress,
} from "./progress.js";
import type { PracticeCard } from "./sentence-order.js";
import { tokenizeSentence } from "./sentence-order.js";

const WORDS = ["Hallo", "Danke", "Bitte", "Tschüss", "Morgen", "Abend", "Wasser", "Brot"];
const VI = ["xin chào", "cảm ơn", "làm ơn", "tạm biệt", "buổi sáng", "buổi tối", "nước uống", "bánh mì"];

function lessonClips(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `k${index}`,
    script: `Ich sage ${WORDS[index % WORDS.length]} ${index}`,
    translationVi: `tôi nói ${VI[index % VI.length]} ${index}`,
    sentenceOrder: true,
  }));
}

const ID = "6f1c2b8e-3a4d-4c5e-9f60-718293a4b5c6";

function rightAnswer(card: PracticeCard): JumpAnswer {
  if (card.kind === "order") return tokenizeSentence(card.clip.script);
  return card.options?.find((option) => option.correct)?.id ?? "";
}

function wrongAnswer(card: PracticeCard): JumpAnswer {
  if (card.kind === "order") return ["falsch"];
  return card.options?.find((option) => !option.correct)?.id ?? "x";
}

test("a jump deck deals at most 25 cards, one per clip, with no audio or pairing cards", () => {
  const deck = buildJumpDeck(lessonClips(40), jumpSeed("a1-1/lektion-1", ID));
  assert.equal(deck.length, JUMP_CARD_COUNT);
  assert.equal(new Set(deck.map((card) => card.clip.id)).size, deck.length);
  for (const card of deck) {
    assert.ok(["order", "multiple-choice", "vi-choice"].includes(card.kind), card.kind);
  }
});

test("a small Lektion gets a shorter test", () => {
  const deck = buildJumpDeck(lessonClips(9), jumpSeed("a1-1/lektion-1", ID));
  assert.equal(deck.length, 9);
});

test("the same seed deals the same deck, and a new attempt deals another", () => {
  const clips = lessonClips(40);
  const first = buildJumpDeck(clips, jumpSeed("a1-1/lektion-1", ID));
  const again = buildJumpDeck(clips, jumpSeed("a1-1/lektion-1", ID));
  const other = buildJumpDeck(clips, jumpSeed("a1-1/lektion-1", "11111111-2222-4333-8444-555555555555"));
  assert.deepEqual(again, first);
  assert.notDeepEqual(
    other.map((card) => card.key),
    first.map((card) => card.key),
  );
});

test("a clip without a translation never becomes a card", () => {
  const clips = [...lessonClips(8), { id: "bare", script: "Nur Deutsch hier", translationVi: "" }];
  const deck = buildJumpDeck(clips, jumpSeed("a1-1/lektion-1", ID));
  assert.ok(deck.every((card) => card.clip.id !== "bare"));
});

test("grading passes with fewer than three mistakes and fails on the third", () => {
  const deck = buildJumpDeck(lessonClips(30), jumpSeed("a1-1/lektion-2", ID));
  const perfect = deck.map(rightAnswer);
  assert.ok(deck.every((card, at) => checkJumpAnswer(card, perfect[at]!)));
  assert.deepEqual(gradeJumpAnswers(deck, perfect), { answered: deck.length, mistakes: 0, passed: true });

  const twoWrong = deck.map((card, at) => (at < 2 ? wrongAnswer(card) : rightAnswer(card)));
  assert.equal(gradeJumpAnswers(deck, twoWrong).passed, true);

  const threeWrong = deck.map((card, at) => (at < JUMP_HEARTS ? wrongAnswer(card) : rightAnswer(card)));
  assert.deepEqual(gradeJumpAnswers(deck, threeWrong), {
    answered: JUMP_HEARTS,
    mistakes: JUMP_HEARTS,
    passed: false,
  });

  assert.equal(gradeJumpAnswers(deck, perfect.slice(0, -1)).passed, false);
  assert.equal(gradeJumpAnswers([], []).passed, false);
});

test("jump XP pays 35 once, never for a rushed test or an already finished Lektion", () => {
  const now = new Date("2026-10-06T08:00:00Z");
  const grade = { answered: 25, mistakes: 1, passed: true };
  const base = {
    grade,
    cardCount: 25,
    elapsedMs: 25 * MIN_MS_PER_JUMP_CARD,
    alreadyAwarded: false,
    completedWithoutJump: false,
    now,
  };
  assert.deepEqual(decideJumpXp(base), {
    xp: JUMP_XP,
    kind: "new",
    store: true,
    dayKey: "2026-10-06",
    weekKey: "2026-10-05",
  });
  assert.equal(decideJumpXp({ ...base, elapsedMs: 1000 }).kind, "rejected");
  assert.equal(decideJumpXp({ ...base, grade: { ...grade, passed: false } }).kind, "rejected");
  assert.equal(decideJumpXp({ ...base, alreadyAwarded: true }).kind, "repeat");
  assert.equal(decideJumpXp({ ...base, completedWithoutJump: true }).store, false);
});

test("jump input keeps option ids and chip lists, and rejects anything else", () => {
  const parsed = parseLessonJumpInput({
    id: ID.toUpperCase(),
    lessonKey: "a1-1/lektion-3",
    elapsedMs: 40_000,
    answers: ["correct", ["Ich", "sage"]],
  });
  assert.deepEqual(parsed, {
    id: ID,
    lessonKey: "a1-1/lektion-3",
    elapsedMs: 40_000,
    answers: ["correct", ["Ich", "sage"]],
  });
  assert.equal(parseLessonJumpInput({ id: "nope", lessonKey: "a1-1/lektion-3", elapsedMs: 1, answers: [] }), null);
  assert.equal(
    parseLessonJumpInput({ id: ID, lessonKey: "../x", elapsedMs: 1, answers: [] }),
    null,
  );
  assert.equal(
    parseLessonJumpInput({ id: ID, lessonKey: "a1-1/lektion-3", elapsedMs: 1, answers: [3] }),
    null,
  );
  assert.equal(
    parseLessonJumpInput({
      id: ID,
      lessonKey: "a1-1/lektion-3",
      elapsedMs: 1,
      answers: Array.from({ length: JUMP_CARD_COUNT + 1 }, () => "a"),
    }),
    null,
  );
});

test("only the Lektion after the first unfinished one offers a jump", () => {
  const lesson = (done: boolean, playable = true, clipCount = 10) => ({ playable, done, clipCount });
  assert.deepEqual(jumpTarget([lesson(true), lesson(false), lesson(false), lesson(false)]), {
    skipIndex: 1,
    targetIndex: 2,
  });
  assert.deepEqual(jumpTarget([lesson(false), lesson(false)]), { skipIndex: 0, targetIndex: 1 });
  // The last Lektion has nothing after it.
  assert.equal(jumpTarget([lesson(true), lesson(false)]), null);
  // A coming-soon Lektion cannot be jumped to.
  assert.equal(jumpTarget([lesson(false), lesson(false, false)]), null);
  // A Lektion without clips has no test.
  assert.equal(jumpTarget([lesson(false, true, 0), lesson(false)]), null);
  // A Lektion that is already finished is not locked.
  assert.equal(jumpTarget([lesson(false), lesson(true)]), null);
  assert.equal(jumpTarget([lesson(true), lesson(true)]), null);
});

test("a passed jump completes study, practice, and videos, and keeps earlier stamps", () => {
  const now = new Date("2026-10-06T08:00:00Z");
  const start = normalizeProgress({
    ...structuredClone(DEFAULT_PROGRESS),
    learn: {
      "lektion-2": {
        currentClipIndex: 0,
        completedClipIds: ["k0"],
        runCount: 0,
        runCompletedClipIds: ["k0"],
        runClipOrder: ["k0", "k1"],
        reviewedClipIds: [],
        studyRunCount: 0,
      },
    },
    videos: {
      "a1-1/lektion-2/old": { positionSeconds: 0, updatedAt: "2026-01-01T00:00:00Z", watchedAt: "2026-01-01T00:00:00Z" },
    },
  });
  const next = completeLessonByJump(start, "lektion-2", {
    clipIds: ["k0", "k1", "k2"],
    videoKeys: ["a1-1/lektion-2/old", "a1-1/lektion-2/new"],
    now,
  });
  const entry = next.learn["lektion-2"]!;
  assert.ok(isLearnChapterCompleted(next, "lektion-2"));
  assert.ok(isStudyChapterCompleted(next, "lektion-2"));
  assert.equal(entry.skippedAt, now.toISOString());
  assert.equal(entry.runCount, 1);
  assert.equal(entry.studyRunCount, 1);
  assert.deepEqual(entry.completedClipIds, ["k0", "k1", "k2"]);
  assert.deepEqual(entry.reviewedClipIds, ["k0", "k1", "k2"]);
  assert.equal(entry.runClipOrder, undefined);
  assert.equal(next.videos["a1-1/lektion-2/old"]?.watchedAt, "2026-01-01T00:00:00Z");
  assert.equal(next.videos["a1-1/lektion-2/new"]?.watchedAt, now.toISOString());

  // The skip stamp survives a reload and a merge with an older snapshot.
  const reloaded = normalizeProgress(JSON.parse(JSON.stringify(next)));
  assert.equal(reloaded.learn["lektion-2"]?.skippedAt, now.toISOString());
  const merged = mergeProgress(start, reloaded);
  assert.equal(merged.learn["lektion-2"]?.skippedAt, now.toISOString());
  assert.ok(isLearnChapterCompleted(merged, "lektion-2"));
});
