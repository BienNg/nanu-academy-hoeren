import assert from "node:assert/strict";
import test from "node:test";
import { conjugationAnswerMatches, conjugationSegments, presentEnding } from "./conjugation.js";

/** "f[ä]hr|st": changed letters in brackets, the ending after the bar. */
function show(infinitive: string, person: string, form: string): string {
  return conjugationSegments(infinitive, person, form)
    .map((segment) => (segment.tone === "change" ? `[${segment.text}]` : segment.tone === "ending" ? `|${segment.text}` : segment.text))
    .join("");
}

test("regular forms split into stem and ending", () => {
  assert.equal(show("fahren", "ich", "fahre"), "fahr|e");
  assert.equal(show("fahren", "wir", "fahren"), "fahr|en");
  assert.equal(show("fahren", "ihr", "fahrt"), "fahr|t");
  assert.equal(show("fahren", "sie/Sie", "fahren"), "fahr|en");
  assert.equal(show("essen", "ihr", "esst"), "ess|t");
});

test("a changed stem vowel is marked", () => {
  assert.equal(show("fahren", "du", "fährst"), "f[ä]hr|st");
  assert.equal(show("fahren", "er/sie/es", "fährt"), "f[ä]hr|t");
  assert.equal(show("schlafen", "du", "schläfst"), "schl[ä]f|st");
  assert.equal(show("geben", "er/sie/es", "gibt"), "g[i]b|t");
  assert.equal(show("sehen", "du", "siehst"), "s[i]eh|st");
});

test("stems in s or ß take t after du", () => {
  assert.equal(presentEnding("ess", "du"), "t");
  assert.equal(show("essen", "du", "isst"), "[i]ss|t");
  assert.equal(show("lesen", "du", "liest"), "l[i]es|t");
  assert.equal(show("lesen", "er/sie/es", "liest"), "l[i]es|t");
});

test("stems in t or d take an e", () => {
  assert.equal(show("arbeiten", "du", "arbeitest"), "arbeit|est");
  assert.equal(show("finden", "er/sie/es", "findet"), "find|et");
});

test("a form without the expected ending stays one piece", () => {
  assert.deepEqual(conjugationSegments("sein", "ich", "bin"), [{ text: "bin", tone: "change" }]);
});

test("answers match the form, with or without the pronoun", () => {
  const row = { person: "er/sie/es", form: "fährt" };
  assert.equal(conjugationAnswerMatches(row, " Fährt "), true);
  assert.equal(conjugationAnswerMatches(row, "sie fährt"), true);
  assert.equal(conjugationAnswerMatches(row, "fahrt"), false);
  assert.equal(conjugationAnswerMatches(row, "du fährt"), false);
});
