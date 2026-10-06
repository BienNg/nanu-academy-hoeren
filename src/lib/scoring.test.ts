import assert from "node:assert/strict";
import test from "node:test";
import { scoreAttempt } from "./scoring.js";

test("punctuation at either end of a word is ignored", () => {
  for (const typed of ["Hallo", "hallo", ",Hallo", "hallo,", "„Hallo!“", "...hallo?"]) {
    assert.equal(scoreAttempt(typed, "Hallo").accuracy, 100, typed);
  }
});

test("punctuation in sentences is ignored", () => {
  assert.equal(scoreAttempt("Vielen, Dank", "Vielen Dank").accuracy, 100);
  assert.equal(scoreAttempt("vielen dank", "Vielen Dank!").accuracy, 100);
  assert.equal(scoreAttempt("Vielen , Dank .", "Vielen Dank").accuracy, 100);
  assert.equal(scoreAttempt("Ja gerne", "Ja – gerne.").accuracy, 100);
});

test("inner punctuation still matters", () => {
  assert.equal(scoreAttempt("3,50", "3,50").accuracy, 100);
  assert.equal(scoreAttempt("350", "3,50").accuracy, 0);
});

test("wrong words are still wrong", () => {
  assert.equal(scoreAttempt("Hallo, Welt", "Hallo Leute").accuracy, 50);
});
