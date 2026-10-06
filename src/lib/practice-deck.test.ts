import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeDeck, type PracticeCard } from "./sentence-order.js";
import {
  capOrderCards,
  dealPracticePart,
  insertDiscreteCards,
  maxClipsPerPracticePart,
  mixListeningChoice,
  practiceCardCount,
  GRAMMAR_CLIPS_PER_CARD,
  MAX_ORDER_CARDS,
  MAX_PRACTICE_CARDS,
  VI_INPUT_SHARE,
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
// token) German scripts, so all six are pairing-eligible and none can take chips.
const partClips = [
  { id: "c1", script: "Hallo", translationVi: "Xin chào" },
  { id: "c2", script: "Deutsch", translationVi: "tiếng Đức" },
  { id: "c3", script: "Danke", translationVi: "Cảm ơn" },
  { id: "c4", script: "Tschüss", translationVi: "Tạm biệt" },
  { id: "c5", script: "Bitte", translationVi: "Xin mời" },
  { id: "c6", script: "Ja", translationVi: "Vâng" },
];

// Four-word German lines with three-word Vietnamese lines: every clip can take
// chips, is marked for sentence order, and has enough same-length distractors.
const sentenceClips = [
  ["s1", "Ich trinke gern Kaffee", "tôi thích cà"],
  ["s2", "Wir gehen heute schwimmen", "hôm nay bơi"],
  ["s3", "Er wohnt in Berlin", "anh ở Berlin"],
  ["s4", "Sie kommt aus Wien", "chị từ Wien"],
  ["s5", "Das Wetter ist schön", "trời đẹp quá"],
  ["s6", "Mein Bruder spielt Fußball", "anh chơi bóng"],
  ["s7", "Der Zug kommt spät", "tàu đến muộn"],
  ["s8", "Wir essen um sieben", "ăn lúc bảy"],
].map(([id, script, translationVi]) => ({
  id: id!,
  script: script!,
  translationVi: translationVi!,
  sentenceOrder: true,
}));

function indexOfAnchor(deck: readonly PracticeCard[], clipId: string): number {
  return deck.findIndex(
    (card) => (card.kind === "listening" || card.kind === "listening-choice") && card.clip.id === clipId,
  );
}

const MEANING_KINDS = new Set(["multiple-choice", "vi-choice", "listening-order", "vi-input"]);

test("a part is listening and meaning cards, then pairing, then the order cards", () => {
  const clips = [...partClips, ...sentenceClips.slice(0, 3)];
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = dealPracticePart(clips, clips, [], seeded(seed));
    const kinds = deck.map((card) => card.kind);
    const pairingAt = kinds.indexOf("pairing");
    const firstOrder = kinds.indexOf("order");

    assert.equal(kinds.filter((kind) => kind === "pairing").length, 1);
    assert.equal(kinds.filter((kind) => kind === "order").length, 3);
    assert.equal(firstOrder, pairingAt + 1);
    assert.ok(kinds.slice(firstOrder).every((kind) => kind === "order"));
    assert.ok(kinds.slice(0, pairingAt).every((kind) => kind !== "order" && kind !== "pairing"));
    assert.equal(deck.length, practiceCardCount(clips, clips));
  }
});

test("a part deals at most 4 order cards, cutting clips with listening-order chips first", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const deck = dealPracticePart(sentenceClips, sentenceClips, [], seeded(seed));
    const orders = deck.filter((card) => card.kind === "order");
    const chips = new Set(
      deck.filter((card) => card.kind === "listening-order").map((card) => card.clip.id),
    );
    const withoutChips = sentenceClips.filter((clip) => !chips.has(clip.id)).length;

    assert.equal(orders.length, MAX_ORDER_CARDS);
    assert.equal(new Set(orders.map((card) => card.clip.id)).size, MAX_ORDER_CARDS);
    assert.equal(
      orders.filter((card) => chips.has(card.clip.id)).length,
      Math.max(0, MAX_ORDER_CARDS - withoutChips),
    );
  }
});

test("without a pairing card, the first order card is not the clip of the card before it", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const deck = dealPracticePart(sentenceClips, sentenceClips, [], seeded(seed));
    const first = deck.findIndex((card) => card.kind === "order");
    assert.notEqual(deck[first]?.clip.id, deck[first - 1]?.clip.id);
  }
});

test("which order cards are kept varies across deals", () => {
  const kept = new Set<string>();
  for (let seed = 1; seed <= 30; seed += 1) {
    for (const card of dealPracticePart(sentenceClips, sentenceClips, [], seeded(seed))) {
      if (card.kind === "order") kept.add(card.clip.id);
    }
  }
  assert.equal(kept.size, sentenceClips.length);
});

test("capOrderCards keeps 4, in place, and cuts listening-order clips first", () => {
  const card = (id: string, kind: PracticeCard["kind"]): PracticeCard => ({
    key: `${id}:${kind}`,
    kind,
    clip: { id, script: "a b c" },
  });
  const cards = [
    card("a", "listening-order"),
    card("b", "listening-order"),
    ...["a", "b", "c", "d", "e", "f"].map((id) => card(id, "order")),
  ];
  for (let seed = 1; seed <= 20; seed += 1) {
    const capped = capOrderCards(cards, seeded(seed));
    const orders = capped.filter((entry) => entry.kind === "order").map((entry) => entry.clip.id);
    assert.deepEqual(orders, ["c", "d", "e", "f"]);
    assert.equal(capped.length, 6);
  }
  assert.deepEqual(capOrderCards(cards.slice(0, 5)), cards.slice(0, 5));
});

test("every clip gets one meaning drill, placed after its own listening card", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = insertDiscreteCards(buildPracticeDeck(sentenceClips), sentenceClips, sentenceClips, [], seeded(seed));
    for (const clip of sentenceClips) {
      const drills = deck.filter((card) => MEANING_KINDS.has(card.kind) && card.clip.id === clip.id);
      assert.equal(drills.length, 1, `${clip.id} got ${drills.length} meaning drills`);
      assert.ok(deck.indexOf(drills[0]!) > indexOfAnchor(deck, clip.id));
    }
  }
});

test("the meaning drill kind varies across deals, including listening-order and vi-input", () => {
  const short = new Set<string>();
  const long = new Set<string>();
  for (let seed = 1; seed <= 30; seed += 1) {
    for (const card of dealPracticePart(partClips, partClips, [], seeded(seed))) {
      if (MEANING_KINDS.has(card.kind)) short.add(card.kind);
    }
    for (const card of dealPracticePart(sentenceClips, sentenceClips, [], seeded(seed))) {
      if (MEANING_KINDS.has(card.kind)) long.add(card.kind);
    }
  }
  assert.deepEqual([...short].sort(), ["multiple-choice", "vi-choice", "vi-input"]);
  assert.deepEqual([...long].sort(), ["listening-order", "multiple-choice", "vi-choice", "vi-input"]);
});

test("a listening-order meaning card holds the sentence's chips plus distractors", () => {
  const deck = insertDiscreteCards(buildPracticeDeck(sentenceClips), sentenceClips, sentenceClips, [], seeded(3));
  const cards = deck.filter((card) => card.kind === "listening-order");
  assert.ok(cards.length > 0);
  for (const card of cards) {
    const chips = (card.bank ?? []).map((chip) => chip.text);
    for (const word of card.clip.script.split(" ")) assert.ok(chips.includes(word), word);
    assert.ok(chips.length > card.clip.script.split(" ").length);
  }
});

test("the heaviest clips still fit in one run of at most 20 cards", () => {
  const heavy = Array.from({ length: 12 }, (_, index) => ({
    id: `h${index}`,
    script: `wort ${index} satz`,
    translationVi: `cụm ${index} tiếng`,
    sentenceOrder: true,
  }));
  const maxClips = maxClipsPerPracticePart(heavy);
  assert.equal(maxClips, 7); // listening + one meaning drill each, plus 4 order cards and a pairing card
  assert.ok(practiceCardCount(heavy.slice(0, maxClips), heavy) <= MAX_PRACTICE_CARDS);
  assert.ok(practiceCardCount(heavy.slice(0, maxClips + 1), heavy) > MAX_PRACTICE_CARDS);
});

test("a clip with an empty Vietnamese translation gets its listening card only", () => {
  const letter = { id: "eszett", script: "ß", translationVi: "", sentenceOrder: true };
  const clips = [letter, ...partClips];
  const deck = dealPracticePart(clips, clips, [], seeded(10));

  const letterCards = deck.filter(
    (card) => card.clip.id === letter.id || card.pairItems?.some((item) => item.id === letter.id),
  );
  assert.equal(letterCards.length, 1);
  assert.ok(["listening", "listening-choice"].includes(letterCards[0]!.kind));
});

test("no pairing card is added when fewer than 5 clips are pairing-eligible", () => {
  const thin = partClips.slice(0, 4);
  const deck = dealPracticePart(thin, thin, [], seeded(8));
  assert.equal(deck.filter((card) => card.kind === "pairing").length, 0);
});

test("a part with enough clips for two pairing sets still gets one pairing card", () => {
  const many = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`,
    script: `Wort${index}`,
    translationVi: `từ ${index}`,
  }));
  const deck = dealPracticePart(many, many, [], seeded(2));
  assert.equal(deck.filter((card) => card.kind === "pairing").length, 1);
  assert.equal(deck.length, practiceCardCount(many, many));
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

test("a number clip is dealt as a listening card, with no number-input, chips or typed drill", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = dealPracticePart(livingClips, livingClips, [], seeded(seed));
    const kinds = deck.filter((card) => card.clip.id === "n1").map((card) => card.kind);
    assert.ok(!kinds.includes("number-input"));
    assert.ok(!kinds.includes("order"));
    assert.ok(!kinds.includes("listening-order"));
    assert.ok(!kinds.includes("vi-input"));
    assert.ok(!kinds.includes("vi-choice"));
    assert.equal(kinds.filter((kind) => kind === "listening" || kind === "listening-choice").length, 1);
  }
});

test("a clip with replies gets one reply-choice card after its listening card, and no meaning drill", () => {
  const deck = dealPracticePart(livingClips, livingClips, [], seeded(6));
  const replyCards = deck.filter((card) => card.kind === "reply-choice");
  assert.equal(replyCards.length, 1);
  assert.equal(replyCards[0]?.clip.id, "r1");
  assert.ok(deck.indexOf(replyCards[0]!) > indexOfAnchor(deck, "r1"));
  const options = replyCards[0]?.options ?? [];
  assert.equal(options.length, 3);
  assert.equal(options.filter((option) => option.correct).length, 1);
  assert.equal(options.find((option) => option.text === "Gib mal her.")?.explanation, "Quá suồng sã");
  assert.ok(!deck.some((card) => card.clip.id === "r1" && MEANING_KINDS.has(card.kind)));
});

test("card counting matches the dealt deck for Living clips", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = dealPracticePart(livingClips, livingClips, [], seeded(seed + 100));
    assert.equal(deck.length, practiceCardCount(livingClips, livingClips));
  }
});

test("five picture words fit one part and get a picture pairing card", () => {
  const words = [
    ["w1", "die Nagelfeile", "cái dũa móng"],
    ["w2", "der Nagellack", "sơn móng tay"],
    ["w3", "die Nagelhaut", "da quanh móng"],
    ["w4", "der Nagellackentferner", "nước tẩy sơn móng"],
    ["w5", "das Handtuch", "khăn tay"],
  ].map(([id, script, translationVi]) => ({ id: id!, script: script!, translationVi, imageUrl: `/images/${id}.webp` }));
  assert.equal(maxClipsPerPracticePart(words), 5);
  const deck = dealPracticePart(words, words, [], seeded(9));
  assert.equal(deck.filter((card) => card.kind === "pairing").length, 1);
  assert.ok(!deck.some((card) => card.kind === "vi-input" || card.kind === "vi-choice"));
  assert.ok(deck.length <= MAX_PRACTICE_CARDS);
});

test("75% of listening cards become listening-choice cards in place", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = buildPracticeDeck(partClips);
    const mixed = mixListeningChoice(deck, partClips, [], seeded(seed + 100));
    const choice = mixed.filter((card) => card.kind === "listening-choice");

    assert.equal(mixed.length, deck.length);
    assert.equal(choice.length, 5); // round(6 * 0.75)
    assert.equal(mixed.filter((card) => card.kind === "listening").length, 1);
    for (const card of choice) {
      const at = mixed.indexOf(card);
      assert.equal(deck[at]?.clip.id, card.clip.id);
      assert.equal(card.options?.length, 4);
      assert.equal(card.options?.find((option) => option.correct)?.text, card.clip.script);
    }
  }
});

test("listening cards without German distractors stay typing cards", () => {
  const untranslated = partClips.map((clip) => ({ ...clip, translationVi: "" }));
  const deck = buildPracticeDeck(untranslated);
  const mixed = mixListeningChoice(deck, untranslated, [], seeded(2));
  assert.deepEqual(
    mixed.map((card) => card.kind),
    deck.map((card) => card.kind),
  );
});

const gapClips = [
  ["g1", "Wo ist deine Tasche?", "Túi của bạn ở đâu?", "possessiv"],
  ["g2", "Das ist kein Apfel.", "Đây không phải quả táo.", "negation"],
  ["g3", "Ich komme aus Vietnam.", "Tôi đến từ Việt Nam.", "konjugation"],
  ["g4", "Wohin fahren wir?", "Chúng ta đi đâu?", "w-ort"],
  ["g5", "Die Mutter ist schön.", "Người mẹ đẹp.", "artikel"],
].map(([id, script, translationVi, topicId]) => ({
  id: id!,
  script: script!,
  translationVi: translationVi!,
  sentenceOrder: true,
  gaps: [{ index: 0, word: script!.split(" ")[0]!, topicId: topicId!, labelVi: topicId!, distractors: ["x", "y"] }],
}));

test("each grammar gap card replaces its clip's meaning drill, so the deck keeps its size", () => {
  const withoutGaps = gapClips.map(({ gaps: _gaps, ...clip }) => clip);
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = dealPracticePart(gapClips, gapClips, [], seeded(seed));
    const plain = dealPracticePart(withoutGaps, withoutGaps, [], seeded(seed));
    assert.equal(deck.length, plain.length);
    assert.equal(practiceCardCount(gapClips, gapClips), deck.length);

    const gaps = deck.filter((card) => card.kind === "grammar-gap");
    assert.equal(gaps.length, Math.ceil(gapClips.length / GRAMMAR_CLIPS_PER_CARD));
    assert.equal(new Set(gaps.map((card) => card.clip.id)).size, gaps.length);
    for (const card of gaps) {
      const at = deck.indexOf(card);
      const anchor = deck.findIndex(
        (entry) => (entry.kind === "listening" || entry.kind === "listening-choice") && entry.clip.id === card.clip.id,
      );
      // A card behind the last listening card can only go right after it, as meaning drills do.
      const lastListening = deck.reduce(
        (last, entry, index) => (entry.kind === "listening" || entry.kind === "listening-choice" ? index : last),
        -1,
      );
      assert.ok(anchor >= 0 && (at > anchor + 1 || (anchor === lastListening && at === anchor + 1)));
      assert.ok(!deck.some((entry) => MEANING_KINDS.has(entry.kind) && entry.clip.id === card.clip.id));
      assert.match(card.gap?.prompt ?? "", /^____ /);
      assert.equal(card.options?.find((option) => option.correct)?.text, card.clip.script.split(" ")[0]);
    }
    const firstOrder = deck.findIndex((card) => card.kind === "order");
    if (firstOrder >= 0) assert.ok(deck.slice(firstOrder).every((card) => card.kind === "order"));
  }
});

test("grammar gap cards always include the lesson's fresh topic and mix topics", () => {
  const fresh = gapClips.map((clip) =>
    clip.id === "g2" ? { ...clip, gaps: clip.gaps.map((gap) => ({ ...gap, fresh: true as const })) } : clip,
  );
  for (let seed = 1; seed <= 20; seed += 1) {
    const gaps = dealPracticePart(fresh, fresh, [], seeded(seed)).filter((card) => card.kind === "grammar-gap");
    assert.ok(gaps.some((card) => card.clip.id === "g2"));
    assert.equal(new Set(gaps.map((card) => card.clip.gaps?.[0]?.topicId)).size, gaps.length);
  }
});

test("a part without gaps deals no grammar gap card", () => {
  const deck = dealPracticePart(partClips, partClips, [], seeded(3));
  assert.equal(deck.filter((card) => card.kind === "grammar-gap").length, 0);
});

test("about VI_INPUT_SHARE of meaning drills become vi-input cards, and the card count stays", () => {
  let viInput = 0;
  let meaning = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const deck = dealPracticePart(sentenceClips, sentenceClips, [], seeded(seed));
    assert.equal(deck.length, practiceCardCount(sentenceClips, sentenceClips));
    for (const card of deck) {
      if (card.kind === "vi-input") {
        viInput += 1;
        assert.ok(deck.indexOf(card) > indexOfAnchor(deck, card.clip.id));
      }
      if (MEANING_KINDS.has(card.kind)) meaning += 1;
    }
  }
  const share = viInput / meaning;
  assert.ok(share > VI_INPUT_SHARE / 2 && share < VI_INPUT_SHARE * 2, `share ${share}`);
});
