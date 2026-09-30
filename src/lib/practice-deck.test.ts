import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeDeck } from "./sentence-order.js";
import {
  insertDiscreteCards,
  maxClipsPerPracticePart,
  practiceCardCount,
  MAX_PRACTICE_CARDS,
} from "./practice-deck.js";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

// c1-c5 have matching-word-count (2-word) Vietnamese translations, so each is
// multiple-choice eligible against the other four. c6 is the odd one out
// (1-word translation) so it never gets an MC card. All six have short (<=3
// token) German scripts, so all six are pairing-eligible.
const partClips = [
  { id: "c1", script: "Hallo", translationVi: "Xin chào" },
  { id: "c2", script: "Deutsch", translationVi: "tiếng Đức" },
  { id: "c3", script: "Danke", translationVi: "Cảm ơn" },
  { id: "c4", script: "Tschüss", translationVi: "Tạm biệt" },
  { id: "c5", script: "Bitte", translationVi: "Xin mời" },
  { id: "c6", script: "Ja", translationVi: "Vâng" },
];

function indexOfListening(deck: ReturnType<typeof buildPracticeDeck>, clipId: string): number {
  return deck.findIndex((card) => card.kind === "listening" && card.clip.id === clipId);
}

test("layers exactly one pairing card and one MC card per eligible clip onto the deck", () => {
  const base = buildPracticeDeck(partClips, partClips, seeded(1));
  const deck = insertDiscreteCards(base, partClips, partClips, [], seeded(2));

  const listening = deck.filter((card) => card.kind === "listening");
  const pairing = deck.filter((card) => card.kind === "pairing");
  const mc = deck.filter((card) => card.kind === "multiple-choice");

  assert.equal(listening.length, 6);
  assert.equal(pairing.length, 1);
  assert.equal(mc.length, 5); // c1-c5, never c6

  assert.equal(pairing[0]?.pairItems?.length, 5);
  assert.ok(!mc.some((card) => card.clip.id === "c6"));
  for (const card of mc) {
    assert.equal(card.options?.length, 4);
    assert.equal(card.options?.filter((option) => option.correct).length, 1);
  }
});

test("a pairing card is placed after the last of its 5 anchors' listening cards", () => {
  const base = buildPracticeDeck(partClips, partClips, seeded(3));
  const deck = insertDiscreteCards(base, partClips, partClips, [], seeded(4));

  const pairingIndex = deck.findIndex((card) => card.kind === "pairing");
  const anchorIds = deck[pairingIndex]?.pairItems?.map((clip) => clip.id) ?? [];
  const lastAnchorListenIndex = Math.max(...anchorIds.map((id) => indexOfListening(deck, id)));
  assert.ok(pairingIndex > lastAnchorListenIndex);
});

test("each MC card is placed after its own clip's listening card", () => {
  const base = buildPracticeDeck(partClips, partClips, seeded(5));
  const deck = insertDiscreteCards(base, partClips, partClips, [], seeded(6));

  for (const card of deck) {
    if (card.kind !== "multiple-choice") continue;
    const mcIndex = deck.indexOf(card);
    const listenIndex = indexOfListening(deck, card.clip.id);
    assert.ok(mcIndex > listenIndex);
  }
});

test("the heaviest clips still fit in one run of at most 15 cards", () => {
  const heavy = Array.from({ length: 8 }, (_, index) => ({
    id: `h${index}`,
    script: `wort ${index} satz`,
    translationVi: `cụm ${index} tiếng`,
    sentenceOrder: true,
  }));
  const maxClips = maxClipsPerPracticePart(heavy);
  assert.equal(maxClips, 4);
  assert.ok(practiceCardCount(heavy.slice(0, maxClips), heavy) <= MAX_PRACTICE_CARDS);
  assert.ok(practiceCardCount(heavy.slice(0, maxClips + 1), heavy) > MAX_PRACTICE_CARDS);
});

test("a clip with an empty Vietnamese translation is a listening card only", () => {
  const letter = { id: "eszett", script: "ß", translationVi: "", sentenceOrder: true };
  const clips = [letter, ...partClips];
  const base = buildPracticeDeck(clips, clips, seeded(9));
  const deck = insertDiscreteCards(base, clips, clips, [], seeded(10));

  const letterCards = deck.filter(
    (card) => card.clip.id === letter.id || card.pairItems?.some((item) => item.id === letter.id),
  );
  assert.deepEqual(
    letterCards.map((card) => card.kind),
    ["listening"],
  );
});

test("no pairing card is added when fewer than 5 clips are pairing-eligible", () => {
  const thin = partClips.slice(0, 4);
  const base = buildPracticeDeck(thin, thin, seeded(7));
  const deck = insertDiscreteCards(base, thin, thin, [], seeded(8));
  assert.equal(deck.filter((card) => card.kind === "pairing").length, 0);
});
