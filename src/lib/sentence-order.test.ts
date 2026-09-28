import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPracticeDeck,
  buildWordBank,
  checkOrder,
  distractorCount,
  isSentenceOrderEligible,
  normalizeToken,
} from "./sentence-order.js";
import {
  buildListeningRunRecord,
  clipResultsForCardDeck,
} from "./listening-runs.js";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const lesson = [
  { id: "c1", script: "ich mache", translationVi: "tôi làm", sentenceOrder: true },
  { id: "c2", script: "Wie heißen Sie?", translationVi: "Bạn tên gì?", sentenceOrder: true },
  { id: "c3", script: "Hallo", translationVi: "xin chào", sentenceOrder: false },
  {
    id: "c4",
    script: "Ich komme aus Vietnam und wohne in Berlin.",
    translationVi: "Tôi đến từ Việt Nam và sống ở Berlin.",
    sentenceOrder: true,
  },
];

test("eligibility needs three words, a translation and no exclusion", () => {
  assert.equal(isSentenceOrderEligible({ script: "ich mache das", translationVi: "tôi làm" }), true);
  assert.equal(isSentenceOrderEligible({ script: "ich mache", translationVi: "tôi làm" }), false);
  assert.equal(isSentenceOrderEligible({ script: "Hallo", translationVi: "xin chào" }), false);
  assert.equal(isSentenceOrderEligible({ script: "ich mache !", translationVi: "tôi làm" }), false);
  assert.equal(isSentenceOrderEligible({ script: "ich mache das", translationVi: "" }), false);
  assert.equal(isSentenceOrderEligible({ script: "ich mache das" }), false);
  assert.equal(
    isSentenceOrderEligible({
      script: "ich mache das",
      translationVi: "tôi làm",
      noSentenceOrder: true,
    }),
    false,
  );
});

test("distractor count grows with sentence length", () => {
  assert.equal(distractorCount(2), 1);
  assert.equal(distractorCount(3), 1);
  assert.equal(distractorCount(4), 2);
  assert.equal(distractorCount(6), 2);
  assert.equal(distractorCount(7), 3);
});

test("word bank holds every sentence word plus distractors from other clips", () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const clip = lesson[1]!;
    const bank = buildWordBank(clip, lesson, seeded(seed));
    const sentence = bank.filter((chip) => chip.id.startsWith("w")).map((chip) => chip.text);
    const distractors = bank.filter((chip) => chip.id.startsWith("d"));
    assert.deepEqual([...sentence].sort(), ["Sie", "Wie", "heißen"].sort());
    assert.equal(distractors.length, 1);
    const sentenceForms = new Set(["wie", "heißen", "sie"]);
    for (const chip of distractors) assert.ok(!sentenceForms.has(normalizeToken(chip.text)));
    assert.equal(new Set(bank.map((chip) => chip.id)).size, bank.length);
    const start = bank.slice(0, 3).map((chip) => normalizeToken(chip.text)).join(" ");
    assert.notEqual(start, "wie heißen sie");
  }
});

test("chips drop sentence punctuation so it cannot mark the last word", () => {
  const clip = {
    id: "c5",
    script: "Die Mutter ist sehr schön.",
    translationVi: "Người mẹ rất đẹp.",
  };
  const bank = buildWordBank(clip, [clip], seeded(1));
  assert.deepEqual(
    bank.map((chip) => chip.text).sort(),
    ["Die", "Mutter", "ist", "sehr", "schön"].sort(),
  );
});

test("word bank works without other clips to borrow from", () => {
  const bank = buildWordBank(lesson[0]!, [lesson[0]!], seeded(3));
  assert.deepEqual(bank.map((chip) => chip.text).sort(), ["ich", "mache"]);
});

test("checking ignores case and punctuation but not order", () => {
  assert.equal(checkOrder(["Wie", "heißen", "Sie?"], "Wie heißen Sie?").accuracy, 100);
  assert.equal(checkOrder(["wie", "heißen", "Sie"], "Wie heißen Sie?").accuracy, 100);
  assert.notEqual(checkOrder(["heißen", "Wie", "Sie?"], "Wie heißen Sie?").accuracy, 100);
  assert.notEqual(checkOrder(["Wie", "heißen"], "Wie heißen Sie?").accuracy, 100);
  assert.notEqual(checkOrder(["Wie", "heißen", "Sie?", "ich"], "Wie heißen Sie?").accuracy, 100);
});

test("repeated words can be placed in either order", () => {
  const script = "die Frau und die Kinder";
  assert.equal(checkOrder(["die", "Frau", "und", "die", "Kinder"], script).accuracy, 100);
});

test("deck has a listening card per clip and order cards after their listening card", () => {
  for (let seed = 1; seed < 50; seed += 1) {
    const deck = buildPracticeDeck(lesson, lesson, seeded(seed));
    assert.equal(deck.filter((card) => card.kind === "listening").length, 4);
    assert.equal(deck.filter((card) => card.kind === "order").length, 3);
    assert.equal(new Set(deck.map((card) => card.key)).size, deck.length);
    for (const [index, card] of deck.entries()) {
      if (card.kind !== "order") continue;
      const listen = deck.findIndex(
        (other) => other.kind === "listening" && other.clip.id === card.clip.id,
      );
      assert.ok(listen < index, `order card for ${card.clip.id} came first`);
      assert.ok(card.bank && card.bank.length > 0);
    }
  }
});

test("listening cards keep the part order and order cards come later, not right after", () => {
  const clips = Array.from({ length: 10 }, (_, index) => ({
    id: `c${index}`,
    script: "a b c",
    translationVi: "x",
    sentenceOrder: index % 3 !== 0,
  }));
  for (let seed = 1; seed < 50; seed += 1) {
    const deck = buildPracticeDeck(clips, clips, seeded(seed));
    assert.deepEqual(
      deck.filter((card) => card.kind === "listening").map((card) => card.clip.id),
      clips.map((clip) => clip.id),
    );
    for (const [index, card] of deck.entries()) {
      if (card.kind !== "order") continue;
      const listen = deck.findIndex(
        (other) => other.kind === "listening" && other.clip.id === card.clip.id,
      );
      assert.ok(index - listen >= 2, `order card for ${card.clip.id} came right after`);
    }
  }
});

test("a passed deck reports one result per clip", () => {
  const deck = buildPracticeDeck(lesson, lesson, seeded(7));
  const results = clipResultsForCardDeck(deck, new Set(["c2"]), false, deck.length - 1);
  assert.deepEqual(
    results.map((result) => result.clipId).sort(),
    ["c1", "c2", "c3", "c4"],
  );
  assert.ok(results.every((result) => result.passed));
  assert.deepEqual(
    results.filter((result) => result.missed).map((result) => result.clipId),
    ["c2"],
  );
});

test("a clip whose order card fails is not passed even if listening passed", () => {
  const clip = (id: string) => ({ id, script: "a b", translationVi: "x" });
  const deck = [
    { key: "c1:listen", kind: "listening" as const, clip: clip("c1") },
    { key: "c2:listen", kind: "listening" as const, clip: clip("c2") },
    { key: "c1:order", kind: "order" as const, clip: clip("c1") },
    { key: "c2:order", kind: "order" as const, clip: clip("c2") },
    { key: "c3:listen", kind: "listening" as const, clip: clip("c3") },
  ];
  // Out of hearts on c1's order card. c2's order card was never reached.
  const results = clipResultsForCardDeck(deck, new Set(["c1"]), true, 2);
  assert.deepEqual(results, [{ clipId: "c1", passed: false, missed: true }]);

  const run = buildListeningRunRecord({
    lessonKey: "a1-1/lektion-3",
    partNumber: 1,
    partCount: 2,
    failed: true,
    accuracy: 0,
    clipCount: 3,
    elapsedMs: 20_000,
    clips: deck.map((card) => card.clip),
    missedClipIds: new Set(["c1"]),
    clipIndex: 2,
    results,
  });
  assert.ok(run);
  assert.equal(run.outcome, "fail");
  assert.equal(run.answeredCount, 1);
});

test("a failed deck counts clips with every card cleared as passed", () => {
  const clip = (id: string) => ({ id, script: "a b", translationVi: "x" });
  const deck = [
    { key: "c1:listen", kind: "listening" as const, clip: clip("c1") },
    { key: "c1:order", kind: "order" as const, clip: clip("c1") },
    { key: "c2:listen", kind: "listening" as const, clip: clip("c2") },
    { key: "c3:listen", kind: "listening" as const, clip: clip("c3") },
    { key: "c3:order", kind: "order" as const, clip: clip("c3") },
  ];
  const results = clipResultsForCardDeck(deck, new Set(["c2", "c3"]), true, 3);
  assert.deepEqual(results, [
    { clipId: "c1", passed: true, missed: false },
    { clipId: "c2", passed: true, missed: true },
    { clipId: "c3", passed: false, missed: true },
  ]);
});
