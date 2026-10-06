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
  grammarStudyParts,
  sentenceBracket,
  spreadSentences,
  VERB_PART_MIX,
  type GrammarCard,
  type GrammarChoiceQuestion,
} from "./grammar-node.js";

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

test("study: one part per verb, the intro only in the first", () => {
  const parts = grammarStudyParts(LESSON, withAudio, tables);
  assert.deepEqual(parts.map((part) => part.key), ["s-haben", "s-sein"]);
  assert.equal(parts[0]!.screens[0]!.kind, "intro");
  assert.ok(!parts[1]!.screens.some((screen) => screen.kind === "intro"));
  for (const part of parts) {
    const kinds = part.screens.map((screen) => screen.kind);
    assert.ok(kinds.includes("table"), part.key);
    assert.ok(kinds.includes("bracket"), part.key);
    assert.ok(kinds.includes("examples"), part.key);
    assert.equal(kinds.filter((kind) => kind === "check").length, 3, part.key);
    assert.equal(kinds[kinds.length - 1], "check", part.key);
  }
});

test("study: each part shows its own verb's tips and examples", () => {
  const [haben, sein] = grammarStudyParts(LESSON, withAudio, tables);
  const tipIds = (part: typeof haben) =>
    part!.screens.flatMap((screen) => (screen.kind === "tips" ? screen.tips.map((tip) => tip.id) : []));
  assert.ok(tipIds(haben).includes("partizip-haben"));
  assert.ok(!tipIds(haben).includes("partizip-sein"));
  assert.ok(tipIds(sein).includes("partizip-sein"));
  assert.ok(tipIds(sein).includes("endungen"));
  const examples = sein!.screens.flatMap((screen) => (screen.kind === "examples" ? screen.examples : []));
  assert.ok(examples.length > 0 && examples.every((entry) => entry.verb === "sein"));
});

test("study: every check has one right answer and distinct options", () => {
  for (const part of grammarStudyParts(LESSON, withAudio, tables)) {
    for (const screen of part.screens) {
      if (screen.kind === "check") assertQuestion(screen.question, screen.key);
    }
  }
});

test("study: the bracket picks a Perfekt statement", () => {
  const [haben, sein] = grammarStudyParts(LESSON, withAudio, tables);
  const bracket = haben!.screens.find((screen) => screen.kind === "bracket");
  assert.ok(bracket && bracket.kind === "bracket");
  assert.deepEqual(bracket.bracket, {
    lead: "Ich",
    aux: "habe",
    middle: "gestern Fieber",
    partizip: "gehabt",
    tail: ".",
  });
  const seinBracket = sein!.screens.find((screen) => screen.kind === "bracket");
  assert.ok(seinBracket && seinBracket.kind === "bracket");
  assert.equal(seinBracket.bracket.aux, "bin");
  assert.equal(seinBracket.bracket.partizip, "gewesen");
});

test("sentenceBracket: a question has no lead and keeps its mark", () => {
  assert.deepEqual(sentenceBracket("Hast du gestern Unterricht gehabt?", "hast", "gehabt"), {
    lead: "",
    aux: "Hast",
    middle: "du gestern Unterricht",
    partizip: "gehabt",
    tail: "?",
  });
  assert.equal(sentenceBracket("Ich war müde.", "bin", "gewesen"), null);
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
  assert.deepEqual(layout.studyParts.map((part) => part.key), ["s-haben", "s-sein"]);
  assert.deepEqual(
    layout.practiceParts.map((part) => part.key),
    grammarPracticeParts(LESSON, withAudio, tables).map((part) => part.key),
  );
});
