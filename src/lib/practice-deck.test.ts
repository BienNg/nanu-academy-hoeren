import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeDeck } from "./sentence-order.js";
import {
  insertDiscreteCards,
  maxClipsPerPracticePart,
  mixListeningChoice,
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

const MEANING_KINDS = new Set(["multiple-choice", "vi-input", "vi-choice"]);

test("layers exactly one pairing card and one meaning drill per translated clip onto the deck", () => {
  const base = buildPracticeDeck(partClips, partClips, seeded(1));
  const deck = insertDiscreteCards(base, partClips, partClips, [], seeded(2));

  const listening = deck.filter((card) => card.kind === "listening");
  const pairing = deck.filter((card) => card.kind === "pairing");
  const mc = deck.filter((card) => card.kind === "multiple-choice");

  assert.equal(listening.length, 6);
  assert.equal(pairing.length, 1);
  assert.equal(deck.length, 6 + 1 + 6);
  for (const clip of partClips) {
    const drills = deck.filter((card) => MEANING_KINDS.has(card.kind) && card.clip.id === clip.id);
    assert.equal(drills.length, 1, `${clip.id} got ${drills.length} meaning drills`);
  }

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
    if (card.kind !== "multiple-choice" && card.kind !== "vi-choice" && card.kind !== "vi-input") continue;
    const cardIndex = deck.indexOf(card);
    const listenIndex = indexOfListening(deck, card.clip.id);
    assert.ok(cardIndex > listenIndex);
  }
});

test("the heaviest clips still fit in one run of at most 20 cards", () => {
  const heavy = Array.from({ length: 8 }, (_, index) => ({
    id: `h${index}`,
    script: `wort ${index} satz`,
    translationVi: `cụm ${index} tiếng`,
    sentenceOrder: true,
  }));
  const maxClips = maxClipsPerPracticePart(heavy);
  assert.equal(maxClips, 6); // listening + order + one meaning drill = 3 cards each
  assert.ok(practiceCardCount(heavy.slice(0, maxClips), heavy) <= MAX_PRACTICE_CARDS);
  assert.ok(practiceCardCount(heavy.slice(0, maxClips + 1), heavy) > MAX_PRACTICE_CARDS);
});

test("every clip gets one meaning drill, and the kind varies across deals", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 30; seed += 1) {
    const deck = insertDiscreteCards(
      buildPracticeDeck(partClips, partClips, seeded(seed)),
      partClips,
      partClips,
      [],
      seeded(seed + 200),
    );
    assert.equal(deck.length, practiceCardCount(partClips, partClips));
    for (const card of deck) if (MEANING_KINDS.has(card.kind)) seen.add(card.kind);
  }
  assert.deepEqual([...seen].sort(), ["multiple-choice", "vi-choice", "vi-input"]);
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

const livingClips = [
  {
    id: "n1",
    script: "Das macht fünfunddreißig Euro fünfzig.",
    translationVi: "Tổng cộng là ba mươi lăm euro năm mươi.",
    sentenceOrder: false,
    answer: "35,50",
  },
  {
    id: "r1",
    script: "Kann ich mit Karte zahlen?",
    translationVi: "Tôi trả bằng thẻ được không?",
    sentenceOrder: true,
    replies: [
      { text: "Ja, natürlich.", correct: true },
      { text: "Gib mal her.", correct: false, whyVi: "Quá suồng sã" },
      { text: "Um drei Uhr.", correct: false, whyVi: "Không liên quan" },
    ],
  },
  {
    id: "p1",
    script: "Bitte nehmen Sie kurz Platz.",
    translationVi: "Mời chị ngồi chờ một chút.",
    sentenceOrder: true,
  },
];

test("a number clip is dealt as a number-input card instead of dictation", () => {
  const base = buildPracticeDeck(livingClips, livingClips, seeded(3));
  const deck = insertDiscreteCards(base, livingClips, livingClips, [], seeded(4));
  const numberCards = deck.filter((card) => card.clip.id === "n1");
  const kinds = numberCards.map((card) => card.kind);
  assert.ok(kinds.includes("number-input"));
  assert.ok(!kinds.includes("listening"));
  assert.ok(!kinds.includes("order"));
  assert.ok(!kinds.includes("vi-input"));
  assert.ok(!kinds.includes("vi-choice"));
  assert.equal(kinds.filter((kind) => kind === "number-input").length, 1);
});

test("a clip with replies gets one reply-choice card after its listening card", () => {
  const base = buildPracticeDeck(livingClips, livingClips, seeded(5));
  const deck = insertDiscreteCards(base, livingClips, livingClips, [], seeded(6));
  const listenAt = indexOfListening(deck, "r1");
  const replyCards = deck.filter((card) => card.kind === "reply-choice");
  assert.equal(replyCards.length, 1);
  const replyAt = deck.indexOf(replyCards[0]!);
  assert.ok(replyAt > listenAt);
  const options = replyCards[0]?.options ?? [];
  assert.equal(options.length, 3);
  assert.equal(options.filter((option) => option.correct).length, 1);
  assert.equal(options.find((option) => option.text === "Gib mal her.")?.explanation, "Quá suồng sã");
  assert.ok(!deck.some((card) => card.kind === "reply-choice" && card.clip.id !== "r1"));
});

test("card counting matches the dealt deck for Living clips", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = insertDiscreteCards(
      buildPracticeDeck(livingClips, livingClips, seeded(seed)),
      livingClips,
      livingClips,
      [],
      seeded(seed + 100),
    );
    assert.equal(deck.length, practiceCardCount(livingClips, livingClips));
  }
  const withoutReplies = livingClips.map((clip) => ({ ...clip, replies: undefined }));
  assert.equal(
    practiceCardCount(livingClips, livingClips),
    practiceCardCount(withoutReplies, withoutReplies) + 1,
  );
});

test("five picture words fit one part and get a picture pairing card", () => {
  const words = [
    ["w1", "die Nagelfeile", "cái dũa móng"],
    ["w2", "der Nagellack", "sơn móng tay"],
    ["w3", "die Nagelhaut", "da quanh móng"],
    ["w4", "der Nagellackentferner", "nước tẩy sơn móng"],
    ["w5", "das Handtuch", "khăn tay"],
  ].map(([id, script, translationVi]) => ({ id, script, translationVi, imageUrl: `/images/${id}.webp` }));
  assert.equal(maxClipsPerPracticePart(words), 5);
  const deck = insertDiscreteCards(buildPracticeDeck(words, words, seeded(8)), words, words, [], seeded(9));
  assert.equal(deck.filter((card) => card.kind === "pairing").length, 1);
  assert.ok(!deck.some((card) => card.kind === "vi-input" || card.kind === "vi-choice"));
  assert.ok(deck.length <= MAX_PRACTICE_CARDS);
});

test("60% of listening cards become listening-choice cards in place", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = insertDiscreteCards(
      buildPracticeDeck(partClips, partClips, seeded(seed)),
      partClips,
      partClips,
      [],
      seeded(seed + 50),
    );
    const mixed = mixListeningChoice(deck, partClips, [], seeded(seed + 100));
    const choice = mixed.filter((card) => card.kind === "listening-choice");

    assert.equal(mixed.length, deck.length);
    assert.equal(choice.length, 4); // round(6 * 0.6)
    assert.equal(mixed.filter((card) => card.kind === "listening").length, 2);
    for (const card of choice) {
      const at = mixed.indexOf(card);
      assert.equal(deck[at]?.kind, "listening");
      assert.equal(deck[at]?.clip.id, card.clip.id);
      assert.equal(card.options?.length, 4);
      assert.equal(card.options?.find((option) => option.correct)?.text, card.clip.script);
    }
  }
});

test("listening cards without German distractors stay typing cards", () => {
  const untranslated = partClips.map((clip) => ({ ...clip, translationVi: "" }));
  const deck = buildPracticeDeck(untranslated, untranslated, seeded(1));
  const mixed = mixListeningChoice(deck, untranslated, [], seeded(2));
  assert.deepEqual(
    mixed.map((card) => card.kind),
    deck.map((card) => card.kind),
  );
});
