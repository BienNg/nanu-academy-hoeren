import assert from "node:assert/strict";
import test from "node:test";
import {
  isGrammarWorldRunSchemaMissing,
  parseGrammarWorldLeftInput,
  parseGrammarWorldRunInput,
  parseGrammarWorldStartInput,
} from "./grammar-world-runs.js";

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function finishedBody(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    topicId: "verbkonjugation",
    review: false,
    node: 1,
    part: 2,
    run: 0,
    elapsedMs: 40_000,
    failed: false,
    accuracy: 80,
    cardCount: 2,
    cards: [
      { key: "verbkonjugation:vk-01:form-choice", kind: "form-choice", position: 0, missed: true, answer: "kommst" },
      { key: "verbkonjugation:vk-02:tense-spot", kind: "tense-spot", position: 1, missed: false, answer: "" },
    ],
    ...overrides,
  };
}

test("a finished part keeps the first wrong answer and drops a right card's text", () => {
  const parsed = parseGrammarWorldRunInput(finishedBody());
  assert.ok(parsed);
  assert.equal(parsed.outcome, "success");
  assert.equal(parsed.node, 1);
  assert.equal(parsed.part, 2);
  assert.equal(parsed.cards[0]?.answer, "kommst");
  assert.equal(parsed.cards[1]?.answer, "");
});

test("running out of hearts is a failed part", () => {
  const parsed = parseGrammarWorldRunInput(finishedBody({ failed: true, accuracy: 0, cardCount: 1, cards: [
    { key: "verbkonjugation:vk-01:form-choice", kind: "form-choice", position: 0, missed: true, answer: "kommt" },
  ] }));
  assert.equal(parsed?.outcome, "fail");
});

test("a review is stored on node 0", () => {
  const parsed = parseGrammarWorldRunInput(finishedBody({ review: true, node: 4, part: 2 }));
  assert.equal(parsed?.review, true);
  assert.equal(parsed?.node, 0);
  assert.equal(parsed?.part, 0);
});

test("a right card cannot carry a wrong answer", () => {
  const cards = [
    { key: "verbkonjugation:vk-01:form-choice", kind: "form-choice", position: 0, missed: false, answer: "kommst" },
  ];
  assert.equal(parseGrammarWorldRunInput(finishedBody({ cardCount: 1, cards })), null);
});

test("an unknown card kind is rejected", () => {
  const cards = [
    { key: "verbkonjugation:vk-01:form-choice", kind: "listening", position: 0, missed: true, answer: "x" },
  ];
  assert.equal(parseGrammarWorldRunInput(finishedBody({ cardCount: 1, cards })), null);
});

test("a start and a leave parse on their own", () => {
  assert.deepEqual(parseGrammarWorldStartInput({
    id: RUN_ID,
    topicId: "verbkonjugation",
    review: false,
    node: 1,
    part: 1,
    cardCount: 10,
  }), {
    id: RUN_ID,
    topicId: "verbkonjugation",
    review: false,
    node: 1,
    part: 1,
    cardCount: 10,
  });
  assert.deepEqual(parseGrammarWorldLeftInput({ id: RUN_ID, cardsDone: 3 }), { id: RUN_ID, cardsDone: 3 });
  assert.equal(parseGrammarWorldLeftInput({ id: RUN_ID, cardsDone: 41 }), null);
});

test("a missing grammar-world run table is recognized without catching the XP table", () => {
  assert.equal(
    isGrammarWorldRunSchemaMissing("Could not find the table 'public.grammar_world_runs' in the schema cache"),
    true,
  );
  assert.equal(isGrammarWorldRunSchemaMissing("grammar_world_awards does not exist"), false);
});
