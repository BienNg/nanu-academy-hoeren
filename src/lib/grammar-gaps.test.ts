import assert from "node:assert/strict";
import test from "node:test";
import {
  blankScript,
  buildGapOptions,
  findClipGaps,
  topicsForLesson,
  type GrammarTopic,
  type VerbTable,
} from "./grammar-gaps.js";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const verbs: VerbTable = {
  essen: { ich: "esse", du: "isst", er: "isst", wir: "essen", ihr: "esst", sie: "essen" },
  kommen: { ich: "komme", du: "kommst", er: "kommt", wir: "kommen", ihr: "kommt", sie: "kommen" },
  sein: { ich: "bin", du: "bist", er: "ist", wir: "sind", ihr: "seid", sie: "sind" },
};

const konjugation: GrammarTopic = { id: "konjugation", labelVi: "Chia động từ", from: "a/3", auto: true, verbs: true };
const artikel: GrammarTopic = {
  id: "artikel",
  labelVi: "Mạo từ",
  from: "a/4",
  auto: true,
  onlyBeforeNoun: true,
  ruleVi: "der/die/das",
  sets: [["der", "die", "das"]],
};
const wOrt: GrammarTopic = { id: "w-ort", labelVi: "Wo", from: "a/4", auto: true, sets: [["wo", "woher", "wohin"]] };
const possessiv: GrammarTopic = {
  id: "possessiv",
  labelVi: "Sở hữu",
  from: "a/5",
  auto: true,
  onlyBeforeNoun: true,
  sets: [["mein", "meine"], ["ihr", "ihre"]],
};
const negation: GrammarTopic = { id: "negation", labelVi: "nicht/kein", from: "a/6", auto: true, sets: [["nicht", "kein", "keine"]] };
const akkusativ: GrammarTopic = { id: "akkusativ", labelVi: "Akkusativ", from: "a/9", auto: true, sets: [["kein", "keinen"]] };
const all = [konjugation, artikel, wOrt, possessiv, negation, akkusativ];

const order = ["a/1", "a/2", "a/3", "a/4", "a/5", "a/6", "a/7", "a/8", "a/9"];

function words(clip: { script: string; translationVi?: string; noGaps?: boolean | string[] }, topics = all) {
  return findClipGaps(clip, topics, verbs).map((gap) => gap.word);
}

test("topics unlock from their lesson on", () => {
  assert.deepEqual(topicsForLesson(all, "a/2", order), []);
  assert.deepEqual(topicsForLesson(all, "a/4", order).map((topic) => topic.id), ["konjugation", "artikel", "w-ort"]);
  assert.equal(topicsForLesson(all, "a/9", order).length, all.length);
  assert.deepEqual(topicsForLesson(all, "elsewhere", order), []);
});

test("a sentence gets a gap for each form of an unlocked auto topic", () => {
  const gaps = findClipGaps({ script: "Wo ist meine Tasche?", translationVi: "Túi của tôi ở đâu?" }, all, verbs);
  assert.deepEqual(
    gaps.map((gap) => [gap.word, gap.topicId, gap.distractors]),
    [
      ["Wo", "w-ort", ["Woher", "Wohin"]],
      ["ist", "konjugation", ["bin", "bist", "sind", "seid"]],
      ["meine", "possessiv", ["mein"]],
    ],
  );
});

test("onlyBeforeNoun skips a word not followed by a noun", () => {
  // Demonstrative das, pronoun ihr: the next word is lowercase.
  assert.deepEqual(words({ script: "Das ist mein Vater.", translationVi: "Đây là bố tôi." }), ["ist", "mein"]);
  assert.deepEqual(words({ script: "Ihr kommt aus Vietnam.", translationVi: "Các bạn đến từ Việt Nam." }), ["kommt"]);
  assert.deepEqual(words({ script: "Die Mutter ist schön.", translationVi: "Mẹ đẹp." }), ["Die", "ist"]);
});

test("a verb form never matches a capitalized noun mid-sentence", () => {
  assert.deepEqual(words({ script: "Wo ist mein Essen?", translationVi: "Đồ ăn của tôi ở đâu?" }), ["Wo", "ist", "mein"]);
  assert.deepEqual(words({ script: "Essen Sie Brot?", translationVi: "Ông có ăn bánh mì không?" }), ["Essen"]);
});

test("options are cased like the word in the sentence", () => {
  const [gap] = findClipGaps({ script: "Kommst du?", translationVi: "Bạn đến không?" }, all, verbs);
  assert.deepEqual(gap?.distractors, ["Komme", "Kommt", "Kommen"]);
});

test("no gap without a translation or with a single word", () => {
  assert.deepEqual(words({ script: "Wo ist mein Vater?" }), []);
  assert.deepEqual(words({ script: "Wo", translationVi: "Ở đâu" }), []);
  assert.deepEqual(words({ script: "du kommst", translationVi: "bạn đến" }), ["kommst"]);
});

test("noGaps drops the whole clip or just the listed words", () => {
  const clip = { script: "Wo ist mein Vater?", translationVi: "Bố tôi ở đâu?" };
  assert.deepEqual(words({ ...clip, noGaps: true }), []);
  assert.deepEqual(words({ ...clip, noGaps: ["ist", "Wo"] }), ["mein"]);
});

test("explicit gaps ignore auto and the noun rule, and can bring their own options", () => {
  const manual: GrammarTopic = { ...artikel, auto: false };
  const topics = [konjugation, manual];
  const clip = { script: "Das ist das Auto.", translationVi: "Đây là chiếc ô tô." };
  assert.deepEqual(words(clip, topics), ["ist"]);

  const gaps = findClipGaps({ ...clip, gaps: [{ word: "das", topic: "artikel", occurrence: 2 }] }, topics, verbs);
  assert.deepEqual(
    gaps.map((gap) => [gap.index, gap.topicId]),
    [
      [1, "konjugation"],
      [2, "artikel"],
    ],
  );

  const [custom] = findClipGaps(
    { script: "Ich bin gefahren.", translationVi: "Tôi đã đi.", gaps: [{ word: "bin", options: ["bin", "habe"], whyVi: "fahren → sein" }] },
    [],
    verbs,
  );
  assert.deepEqual(custom?.distractors, ["habe"]);
  assert.equal(custom?.topicId, null);
  assert.equal(custom?.ruleVi, "fahren → sein");
});

test("a later topic adds its forms to the options of an older one", () => {
  const clip = { script: "Das ist kein Apfel.", translationVi: "Đây không phải quả táo." };
  const before = findClipGaps(clip, topicsForLesson(all, "a/6", order), verbs).find((gap) => gap.word === "kein");
  const after = findClipGaps(clip, topicsForLesson(all, "a/9", order), verbs).find((gap) => gap.word === "kein");
  assert.deepEqual(before?.distractors, ["nicht", "keine"]);
  assert.deepEqual(after?.distractors, ["nicht", "keine", "keinen"]);
});

test("gaps of the lesson's own topic are fresh", () => {
  const clip = { script: "Wo ist meine Tasche?", translationVi: "Túi của tôi ở đâu?" };
  const gaps = findClipGaps(clip, all, verbs, "a/5");
  assert.deepEqual(
    gaps.filter((gap) => gap.fresh).map((gap) => gap.word),
    ["meine"],
  );
});

test("blankScript keeps punctuation around the blank", () => {
  assert.equal(blankScript("Wo ist deine Tasche?", 2), "Wo ist ____ Tasche?");
  assert.equal(blankScript("Arbeiten Sie morgen nicht?", 3), "Arbeiten Sie morgen ____?");
});

test("gap options hold the word and at most three distractors with the rule", () => {
  const [gap] = findClipGaps({ script: "ich bin", translationVi: "tôi là" }, all, verbs);
  assert.ok(gap);
  for (let seed = 1; seed <= 10; seed += 1) {
    const options = buildGapOptions({ ...gap, ruleVi: "rule" }, seeded(seed));
    assert.equal(options.length, 4);
    assert.equal(options.filter((option) => option.correct).length, 1);
    assert.equal(options.find((option) => option.correct)?.text, "bin");
    assert.ok(options.filter((option) => !option.correct).every((option) => option.explanation === "rule"));
    assert.equal(new Set(options.map((option) => option.text)).size, 4);
  }
});
