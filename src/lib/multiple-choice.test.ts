import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeMcOptions,
  buildMcOptions,
  checkMc,
  isMultipleChoiceEligible,
  mcDistractors,
  MC_OPTION_COUNT,
} from "./multiple-choice.js";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const lektion = [
  { id: "c1", translationVi: "tôi làm" }, // 2 words
  { id: "c2", translationVi: "bạn đi" }, // 2 words
  { id: "c3", translationVi: "chúng ta ăn" }, // 3 words
  { id: "c4", translationVi: "Xin chào" }, // 2 words
  { id: "c5", translationVi: "nó đi" }, // 2 words
];

test("distractors match the correct answer's word count and exclude the clip itself", () => {
  const distractors = mcDistractors("tôi làm", "c1", lektion, [], 2, seeded(1));
  assert.equal(distractors?.length, 2);
  for (const text of distractors ?? []) {
    assert.equal(text.trim().split(/\s+/).length, 2);
  }
  assert.ok(!distractors?.includes("tôi làm"));
});

test("falls back to the level pool when the lektion alone doesn't have enough same-length options", () => {
  const thinLektion = [{ id: "c1", translationVi: "tôi làm" }];
  const levelPool = [
    { id: "l1", translationVi: "bạn đi" }, // 2 words
    { id: "l2", translationVi: "em học" }, // 2 words
  ];
  const distractors = mcDistractors("tôi làm", "c1", thinLektion, levelPool, 2, seeded(2));
  assert.equal(distractors?.length, 2);
});

test("returns null when there still aren't enough same-length distractors", () => {
  const distractors = mcDistractors("tôi làm", "c1", [{ id: "c1", translationVi: "tôi làm" }], []);
  assert.equal(distractors, null);
});

test("eligibility requires a non-empty translation and enough distractors", () => {
  assert.equal(isMultipleChoiceEligible({ id: "c1", translationVi: "tôi làm" }, lektion), true);
  assert.equal(isMultipleChoiceEligible({ id: "c1", translationVi: "" }, lektion), false);
  assert.equal(
    isMultipleChoiceEligible({ id: "c1", translationVi: "tôi làm" }, [{ id: "c1", translationVi: "tôi làm" }]),
    false,
  );
});

test("buildMcOptions returns exactly one correct option among MC_OPTION_COUNT options", () => {
  const options = buildMcOptions({ id: "c1", translationVi: "tôi làm" }, lektion, [], seeded(3));
  assert.equal(options?.length, MC_OPTION_COUNT);
  assert.equal(options?.filter((option) => option.correct).length, 1);
  assert.equal(options?.find((option) => option.correct)?.text, "tôi làm");
});

test("checkMc scores 100 for the correct id and 0 otherwise", () => {
  const options = buildMcOptions({ id: "c1", translationVi: "tôi làm" }, lektion, [], seeded(4));
  assert.ok(options);
  const correctId = options?.find((option) => option.correct)?.id ?? "";
  const wrongId = options?.find((option) => !option.correct)?.id ?? "";
  assert.deepEqual(checkMc(correctId, options ?? []), { accuracy: 100, selectedId: correctId, correctId });
  assert.equal(checkMc(wrongId, options ?? []).accuracy, 0);
});

test("German options ignore clips that have no Vietnamese translation", () => {
  const clips = [
    { id: "c1", script: "mein", translationVi: "của tôi" },
    { id: "c2", script: "dein", translationVi: "của bạn" },
    { id: "c3", script: "sein", translationVi: "của anh ấy" },
    { id: "c4", script: "ihr", translationVi: "của cô ấy" },
    { id: "bare", script: "euer" },
  ];
  const options = buildDeMcOptions({ id: "c1", script: "mein" }, clips, [], seeded(1));
  assert.ok(options);
  assert.ok(!options?.some((option) => option.text === "euer"));
});
