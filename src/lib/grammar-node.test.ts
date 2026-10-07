import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { seedToRandom } from "./blitzrunde.js";
import {
  grammarTopicContent,
  type GrammarTopicContent,
  type StoredGrammarTopic,
  type TenseTables,
} from "./grammar-lessons.js";
import {
  checkChoice,
  checkErrorCheck,
  checkGrammarOrder,
  checkGrammarPairing,
  checkTableFill,
  exampleQuestion,
  grammarNodeLayout,
  grammarPracticeParts,
  checkStudyTranslate,
  grammarStudyParts,
  ruleFor,
  TABLE_STEPS,
  spreadSentences,
  VERB_PART_MIX,
  type GrammarCard,
  type GrammarChoiceQuestion,
} from "./grammar-node.js";
import { chipText, tokenizeSentence } from "./sentence-order.js";

const LESSON = "a1-2/lektion-1";

const tables = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/grammar/tenses.json"), "utf8"),
) as TenseTables;

const stored = (
  JSON.parse(readFileSync(join(process.cwd(), "src/data/levels/a1-2/lektion-1.json"), "utf8")) as {
    grammar: StoredGrammarTopic[];
  }
).grammar[0]!;

const withAudio = grammarTopicContent(stored, tables, LESSON, () => true);
const silent = grammarTopicContent(stored, tables, LESSON, () => false);

function assertQuestion(question: GrammarChoiceQuestion, where: string) {
  assert.equal(question.options.filter((option) => option.correct).length, 1, where);
  assert.ok(question.options.length >= 2 && question.options.length <= 4, where);
  const texts = question.options.map((option) => option.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length, `${where}: options repeat`);
  assert.ok(question.prompt.includes("____"), where);
}

function example(script: string) {
  const found = withAudio.examples.find((entry) => entry.script === script);
  assert.ok(found, script);
  return found;
}

test("study: the slides' parts in order, sein before haben", () => {
  const parts = grammarStudyParts(LESSON, withAudio);
  assert.deepEqual(parts.map((part) => part.key), ["s-sein", "s-haben", "s-uebung"]);
  const flow = (index: number) => parts[index]!.screens.map((screen) => screen.kind);
  assert.deepEqual(flow(0), ["overview", "known", "known", ...Array(TABLE_STEPS).fill("table")]);
  const known = parts[0]!.screens.filter((screen) => screen.kind === "known");
  assert.equal(known[0]!.kind === "known" && known[0].callout, false);
  assert.equal(known[1]!.kind === "known" && known[1].callout, true);
  assert.deepEqual(flow(1), Array(TABLE_STEPS).fill("table"));
  assert.deepEqual(flow(2), [
    "beispiele",
    "beispiele",
    "beispiele",
    "beispiele",
    "choice",
    "choice",
    "choice",
    "translate",
    "translate",
  ]);
  const keys = parts.flatMap((part) => part.screens.map((screen) => screen.key));
  assert.equal(new Set(keys).size, keys.length);
});

test("study: a table fills in one column per step, endings as on the slides", () => {
  const [sein, haben] = grammarStudyParts(LESSON, withAudio);
  const steps = sein!.screens.filter((screen) => screen.kind === "table");
  assert.deepEqual(
    steps.map((screen) => (screen.kind === "table" ? screen.step : 0)),
    [1, 2, 3, 4, 5],
  );
  const table = haben!.screens[0]!;
  assert.ok(table.kind === "table");
  assert.deepEqual(
    table.rows.map((row) => `${row.personLabel}:${row.cells.praeteritum.text}:${row.cells.praeteritum.highlight}`),
    ["ich:hatte:", "du:hattest:st", "er/sie/es:hatte:", "ihr:hattet:t", "wir/sie/Sie:hatten:en"],
  );
  assert.equal(table.rows[0]!.cells.perfekt.text, "habe … gehabt");
  const seinTable = steps[0]!;
  assert.ok(seinTable.kind === "table");
  assert.deepEqual(
    seinTable.rows.map((row) => row.cells.praeteritum.highlight),
    ["", "st", "", "t", "en"],
  );
});

test("study: a step-by-step Beispiele adds a line per screen, a whole one is a single screen", () => {
  const uebung = grammarStudyParts(LESSON, withAudio)[2]!;
  const beispiele = uebung.screens.flatMap((screen) => (screen.kind === "beispiele" ? [screen] : []));
  assert.deepEqual(
    beispiele.map((screen) => `${screen.shown}/${screen.rows.length}:${screen.newest}`),
    ["3/3:null", "1/3:0", "2/3:1", "3/3:2"],
  );
  assert.equal(beispiele[0]!.rows[2]!.de, "Ich war in Berlin.");
  assert.equal(beispiele[1]!.rows[0]!.audioPath, `${LESSON}/a12-l1-gram-18-ich-habe-10-euro.mp3`);
});

test("study: choices keep the slides' A/B order with one right answer", () => {
  const uebung = grammarStudyParts(LESSON, withAudio)[2]!;
  const choices = uebung.screens.flatMap((screen) => (screen.kind === "choice" ? [screen] : []));
  assert.deepEqual(
    choices.map((screen) => screen.options.map((option) => `${option.text}${option.correct ? "*" : ""}`).join(" ")),
    ["ist* war", "ist war*", "Wo bist du? Wo warst du?*"],
  );
  assert.deepEqual(choices[0]!.cue, { vi: "Cô ấy đang ở đâu?", markerVi: "đang", tense: "praesens" });
  assert.equal(choices[2]!.prompt, null);
});

test("study: a translate's chips build every accepted word order", () => {
  const uebung = grammarStudyParts(LESSON, withAudio)[2]!;
  const [, arbeit] = uebung.screens.flatMap((screen) => (screen.kind === "translate" ? [screen] : []));
  assert.ok(arbeit);
  assert.equal(arbeit.answers.length, 2);
  assert.equal(arbeit.audioPaths.length, 2);
  const chips = arbeit.bank.map((chip) => chip.text.toLowerCase());
  assert.ok(chips.includes("habe"), "distractor");
  for (const answer of arbeit.answers) {
    const words = tokenizeSentence(answer).map((word) => chipText(word).toLowerCase());
    for (const word of words) assert.ok(chips.includes(word), `${answer}: ${word}`);
  }
  assert.deepEqual(grammarStudyParts(LESSON, withAudio)[2]!.screens.at(-1), uebung.screens.at(-1), "same deal");
});

test("checkStudyTranslate accepts any answer and names the one given", () => {
  const answers = ["Letzten Monat hatte ich in Berlin eine Arbeit.", "Ich hatte letzten Monat in Berlin eine Arbeit."];
  const second = ["Ich", "hatte", "letzten", "Monat", "in", "Berlin", "eine", "Arbeit"];
  assert.deepEqual(checkStudyTranslate(second, answers), { accuracy: 100, answer: answers[1] });
  const wrong = ["Ich", "habe", "letzten", "Monat", "in", "Berlin", "eine", "Arbeit"];
  const result = checkStudyTranslate(wrong, answers);
  assert.ok(result.accuracy < 100);
  assert.equal(result.answer, answers[0]);
});

test("study: audio paths are null until the MP3 exists", () => {
  for (const part of grammarStudyParts(LESSON, silent)) {
    for (const screen of part.screens) {
      if (screen.kind === "beispiele") assert.ok(screen.rows.every((row) => row.audioPath === null));
      if (screen.kind === "choice") assert.equal(screen.audioPath, null);
      if (screen.kind === "translate") assert.ok(screen.audioPaths.every((path) => path === null));
    }
  }
});

test("exampleQuestion: Präteritum options are the other persons' forms", () => {
  const question = exampleQuestion(tables, example("Ihr hattet Glück."), seedToRandom("a"));
  assert.ok(question);
  assertQuestion(question, "hattet");
  assert.equal(question.prompt, "Ihr ____ Glück.");
  assert.equal(question.hintVi, "Các bạn đã gặp may.");
  assert.deepEqual(
    question.options.map((option) => option.text).sort(),
    ["hatte", "hatten", "hattest", "hattet"],
  );
});

test("exampleQuestion: Perfekt asks for the aux and offers the other one", () => {
  const question = exampleQuestion(tables, example("Ich bin krank gewesen."), seedToRandom("b"));
  assert.ok(question);
  assertQuestion(question, "bin");
  assert.equal(question.prompt, "Ich ____ krank gewesen.");
  assert.ok(question.options.some((option) => option.text === "habe" && !option.correct));
});

test("exampleQuestion: a capitalized verb keeps its case in every option", () => {
  const question = exampleQuestion(tables, example("Hattest du am Wochenende Besuch?"), seedToRandom("c"));
  assert.ok(question);
  assert.ok(question.options.every((option) => /^[A-ZÄÖÜ]/.test(option.text)));
});

test("exampleQuestion: no option that the sentence's pronoun would also allow", () => {
  for (const seed of ["1", "2", "3", "4", "5"]) {
    const question = exampleQuestion(tables, example("Sie ist im Urlaub gewesen."), seedToRandom(seed));
    assert.ok(question);
    assert.ok(!question.options.some((option) => option.text.toLowerCase() === "sind"));
  }
});

test("practice: a part per verb and a mixed part, with stable keys", () => {
  const parts = grammarPracticeParts(LESSON, withAudio, tables);
  assert.deepEqual(parts.map((part) => part.verb), ["haben", "sein", null]);
  const again = grammarPracticeParts(LESSON, withAudio, tables);
  assert.deepEqual(again.map((part) => part.key), parts.map((part) => part.key));
  assert.deepEqual(
    again.map((part) => part.cards.map((card) => card.key)),
    parts.map((part) => part.cards.map((card) => card.key)),
  );
  const elsewhere = grammarPracticeParts("a1-2/lektion-2", withAudio, tables);
  assert.notDeepEqual(elsewhere.map((part) => part.key), parts.map((part) => part.key));
  const max = Object.values(VERB_PART_MIX).reduce((sum, count) => sum + count, 0);
  for (const part of parts) {
    assert.ok(part.cards.length >= 12 && part.cards.length <= max, `${part.verb}: ${part.cards.length} cards`);
    assert.equal(new Set(part.cards.map((card) => card.key)).size, part.cards.length);
  }
});

test("practice: verb parts stay on their verb, the mixed part uses both", () => {
  const [haben, sein, mixed] = grammarPracticeParts(LESSON, withAudio, tables);
  assert.ok(haben!.cards.every((card) => card.verb === "haben"));
  assert.ok(sein!.cards.every((card) => card.verb === "sein"));
  const verbs = new Set(mixed!.cards.map((card) => card.verb));
  assert.ok(verbs.has("haben") && verbs.has("sein"));
  for (const kind of ["form-choice", "tense-transform", "bracket-order", "error-check"] as const) {
    const ofKind = mixed!.cards.filter((card) => card.kind === kind);
    assert.ok(
      ofKind.some((card) => card.verb === "haben") && ofKind.some((card) => card.verb === "sein"),
      `mixed ${kind} uses one verb`,
    );
  }
});

test("practice: warm-up first, then no sentence twice in a row", () => {
  for (const part of grammarPracticeParts(LESSON, withAudio, tables)) {
    assert.equal(part.cards[0]!.kind, "table-fill");
    part.cards.forEach((card, index) => {
      const previous = part.cards[index - 1];
      if (card.sentence && previous) assert.notEqual(card.sentence, previous.sentence, card.key);
    });
  }
});

test("practice: listening cards only with audio", () => {
  const count = (parts: ReturnType<typeof grammarPracticeParts>) =>
    parts.flatMap((part) => part.cards).filter((card) => card.kind === "tense-spot").length;
  assert.equal(count(grammarPracticeParts(LESSON, silent, tables)), 0);
  for (const part of grammarPracticeParts(LESSON, withAudio, tables)) {
    assert.equal(part.cards.filter((card) => card.kind === "tense-spot").length, 2);
  }
  const silentParts = grammarPracticeParts(LESSON, silent, tables);
  assert.ok(silentParts.every((part) => part.cards.some((card) => card.kind === "form-choice")));
});

function allCards(): GrammarCard[] {
  return grammarPracticeParts(LESSON, withAudio, tables).flatMap((part) => part.cards);
}

test("practice: every chip card can be answered from its bank, with at most 2 extra chips", () => {
  for (const card of allCards()) {
    if (card.kind !== "tense-transform" && card.kind !== "bracket-order") continue;
    const words = card.script.trim().split(/\s+/);
    assert.ok(card.bank.length >= words.length && card.bank.length <= words.length + 2, card.key);
    const pool = card.bank.map((chip) => chip.text);
    const chosen = words.map((word) => {
      const at = pool.findIndex((text) => text.toLowerCase() === word.replace(/[.,?!]/g, "").toLowerCase());
      assert.ok(at >= 0, `${card.key}: no chip for "${word}"`);
      return pool.splice(at, 1)[0]!;
    });
    assert.equal(checkGrammarOrder(chosen, card.script).accuracy, 100, card.key);
  }
});

test("practice: choice cards have one right answer", () => {
  for (const card of allCards()) {
    if (card.kind === "form-choice") assertQuestion(card.question, card.key);
    if (card.kind === "tense-spot") {
      assert.equal(card.options.filter((option) => option.correct).length, 1, card.key);
      assert.ok(card.audioPath, card.key);
    }
  }
});

test("practice: table-fill bank holds every blank's answer", () => {
  for (const card of allCards()) {
    if (card.kind !== "table-fill") continue;
    const answers = card.rows.filter((row) => row.text === null).map((row) => row.answer);
    assert.equal(answers.length, 2, card.key);
    const bank = card.bank.map((chip) => chip.text);
    for (const answer of answers) assert.ok(bank.includes(answer), card.key);
    // A blank's form is never shown in another row.
    const shown = card.rows.filter((row) => row.text !== null).map((row) => row.text);
    for (const answer of answers) assert.ok(!shown.includes(answer), `${card.key}: ${answer} is shown`);
    assert.equal(checkTableFill(card.rows, answers).accuracy, 100);
    assert.ok(checkTableFill(card.rows, [answers[0]!, "x"]).accuracy < 100);
  }
});

test("practice: pairing forms are distinct", () => {
  const pairings = allCards().filter((card) => card.kind === "pronoun-pairing");
  assert.ok(pairings.length > 0);
  for (const card of pairings) {
    if (card.kind !== "pronoun-pairing") continue;
    assert.ok(card.items.length >= 4);
    assert.equal(new Set(card.items.map((item) => item.form)).size, card.items.length, card.key);
  }
});

test("checkGrammarPairing matches by form, so shared forms count as right", () => {
  const items = [
    { id: "ich", person: "ich", form: "hatte" },
    { id: "er", person: "er/sie/es", form: "hatte" },
    { id: "du", person: "du", form: "hattest" },
  ];
  const result = checkGrammarPairing(items, [
    { personId: "ich", formId: "er" },
    { personId: "er", formId: "ich" },
    { personId: "du", formId: "ich" },
  ]);
  assert.deepEqual(result.pairs.map((pair) => pair.correct), [true, true, false]);
  assert.equal(result.accuracy, 67);
});

test("error-check: a drill without a fix is a correct sentence", () => {
  const errors = allCards().filter((card) => card.kind === "error-check");
  assert.ok(errors.some((card) => card.kind === "error-check" && card.fix === null));
  assert.equal(checkErrorCheck(null, true).accuracy, 100);
  assert.equal(checkErrorCheck("Ihr hattet Durst.", true).accuracy, 0);
  assert.equal(checkErrorCheck("Ihr hattet Durst.", false).accuracy, 100);
});

test("ruleFor shows one tip about the tense, the verb's own first", () => {
  const tips = withAudio.tips;
  assert.equal(ruleFor(tips, "sein", "perfekt"), tips.find((tip) => tip.id === "partizip-sein")!.textVi);
  assert.equal(ruleFor(tips, "haben", "praeteritum"), tips.find((tip) => tip.id === "endungen")!.textVi);
  assert.equal(ruleFor(tips, "haben", "praesens"), undefined);
});

test("a wrong practice answer shows one tip", () => {
  const texts = new Set(withAudio.tips.map((tip) => tip.textVi));
  const rules = allCards().flatMap((card) => (card.ruleVi && card.kind !== "error-check" ? [card.ruleVi] : []));
  assert.ok(rules.length > 0);
  for (const rule of rules) assert.ok(texts.has(rule), rule);
});

test("checkChoice scores the selected option", () => {
  const options = [
    { id: "a", text: "war", correct: false },
    { id: "correct", text: "warst", correct: true },
  ];
  assert.deepEqual(checkChoice(options, "correct"), { accuracy: 100, correctId: "correct" });
  assert.equal(checkChoice(options, "a").accuracy, 0);
  assert.equal(checkChoice(options, null).accuracy, 0);
});

test("spreadSentences keeps every card", () => {
  const cards = allCards();
  const spread = spreadSentences(cards, seedToRandom("s"));
  assert.deepEqual(spread.map((card) => card.key).sort(), cards.map((card) => card.key).sort());
});

test("layout lists part keys and sizes", () => {
  const layout = grammarNodeLayout(LESSON, withAudio as GrammarTopicContent, tables);
  assert.equal(layout.topicId, "vergangenheit-haben-sein");
  assert.deepEqual(layout.studyParts.map((part) => part.key), ["s-sein", "s-haben", "s-uebung"]);
  assert.deepEqual(
    layout.practiceParts.map((part) => part.key),
    grammarPracticeParts(LESSON, withAudio, tables).map((part) => part.key),
  );
});
