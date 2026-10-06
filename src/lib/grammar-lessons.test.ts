import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  conjugationAudioList,
  conjugationTable,
  endingAfter,
  grammarTopicContent,
  verbForm,
  type StoredGrammarTopic,
  type TenseTables,
} from "./grammar-lessons.js";

const tables = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/grammar/tenses.json"), "utf8"),
) as TenseTables;

function lessonTopic(): StoredGrammarTopic {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), "src/data/levels/a1-2/lektion-1.json"), "utf8"),
  ) as { grammar: StoredGrammarTopic[] };
  return file.grammar[0]!;
}

test("endingAfter returns what a form adds to the ich form", () => {
  assert.equal(endingAfter("hattest", "hatte"), "st");
  assert.equal(endingAfter("hatten", "hatte"), "n");
  assert.equal(endingAfter("waren", "war"), "en");
  assert.equal(endingAfter("hatte", "hatte"), "");
});

test("Perfekt joins the aux's Präsens form and the Partizip", () => {
  assert.deepEqual(verbForm(tables, "haben", "perfekt", "du"), {
    text: "hast … gehabt",
    words: ["hast", "gehabt"],
  });
  assert.deepEqual(verbForm(tables, "sein", "perfekt", "wir"), {
    text: "sind … gewesen",
    words: ["sind", "gewesen"],
  });
  assert.equal(verbForm(tables, "gehen", "perfekt", "ich"), null);
});

test("the haben table matches the class slide", () => {
  const table = conjugationTable(tables, "haben");
  assert.ok(table);
  assert.deepEqual(
    table.rows.map((row) => row.person.label),
    ["ich", "du", "er/sie/es", "ihr", "wir/sie/Sie"],
  );
  assert.deepEqual(
    table.rows.map((row) => row.cells.praesens.text),
    ["habe", "hast", "hat", "habt", "haben"],
  );
  assert.deepEqual(
    table.rows.map((row) => row.cells.praeteritum.text),
    ["hatte", "hattest", "hatte", "hattet", "hatten"],
  );
  assert.deepEqual(
    table.rows.map((row) => row.cells.praeteritum.highlight),
    ["", "st", "", "t", "n"],
  );
  assert.equal(table.rows[2]!.cells.perfekt.spoken, "er hat gehabt");
  assert.deepEqual(
    table.tenses.map((tense) => tense.id),
    ["praesens", "perfekt", "praeteritum"],
  );
});

test("a row without audio plays nothing", () => {
  const table = conjugationTable(tables, "sein", (path) => path.endsWith("praesens-ich.mp3"));
  assert.ok(table);
  assert.equal(table.rows[0]!.cells.praesens.audioPath, "grammar/sein/praesens-ich.mp3");
  assert.equal(table.rows[0]!.cells.praeteritum.audioPath, null);
});

test("every table cell has one audio file", () => {
  const list = conjugationAudioList(tables, ["haben", "sein"]);
  assert.equal(list.length, 2 * 5 * 3);
  assert.equal(new Set(list.map((entry) => entry.audioPath)).size, list.length);
  assert.ok(list.some((entry) => entry.spoken === "du warst"));
});

test("the A1.2 Lektion 1 topic builds both tables and keeps examples without audio silent", () => {
  const topic = lessonTopic();
  const all = grammarTopicContent(topic, tables, "a1-2/lektion-1");
  assert.deepEqual(all.tables.map((table) => table.verb), ["haben", "sein"]);
  assert.equal(all.examples.length, topic.examples.length);
  assert.equal(all.examples[0]!.audioPath, `a1-2/lektion-1/${topic.examples[0]!.filename}`);

  const none = grammarTopicContent(topic, tables, "a1-2/lektion-1", () => false);
  assert.equal(none.examples.length, topic.examples.length);
  assert.ok(none.examples.every((example) => example.audioPath === null));
  assert.equal(none.tables.length, 2);
});

test("every A1.2 Lektion 1 example uses its verb's form for its person and tense", () => {
  const topic = lessonTopic();
  for (const example of topic.examples) {
    const form = verbForm(tables, example.verb, example.tense, example.person);
    assert.ok(form, example.script);
    const words = example.script.toLowerCase().replace(/[.,?!]/g, "").split(/\s+/);
    for (const word of form.words) {
      assert.ok(words.includes(word.toLowerCase()), `${example.script} should contain "${word}"`);
    }
  }
});
