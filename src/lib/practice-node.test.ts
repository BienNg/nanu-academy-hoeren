import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ORDER_CARDS, MAX_PRACTICE_CARDS, practiceCardCount } from "./practice-deck.js";
import { cutPracticeCards, practiceNodeDecks, practiceNodeLayout } from "./practice-node.js";
import {
  commitLearnPart,
  DEFAULT_PROGRESS,
  lessonNodeParts,
  lessonPathNodes,
  mergeProgress,
  nextNodePart,
} from "./progress.js";

const WORDS = ["Hallo", "Danke", "Bitte", "Tschüss", "Morgen", "Abend", "Wasser", "Brot"];
const VI = ["xin chào", "cảm ơn", "làm ơn", "tạm biệt", "buổi sáng", "buổi tối", "nước uống", "bánh mì"];

function lessonClips(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `k${index}`,
    script: `${WORDS[index % WORDS.length]} ${index}`,
    translationVi: `${VI[index % VI.length]} ${index}`,
  }));
}

test("practice cards split into the fewest even parts of at most 20", () => {
  const sizes = (count: number) =>
    cutPracticeCards(Array.from({ length: count }, (_, index) => index)).map((part) => part.length);
  assert.deepEqual(sizes(0), []);
  assert.deepEqual(sizes(20), [20]);
  assert.deepEqual(sizes(21), [11, 10]);
  assert.deepEqual(sizes(41), [14, 14, 13]);
  assert.deepEqual(cutPracticeCards([1, 2, 3, 4, 5], [], 2), [[1, 2], [3, 4], [5]]);
});

test("a block of cards is never cut, even when that costs evenness or a part", () => {
  const cards = Array.from({ length: 24 }, (_, index) => index);
  // Cards 10-13 stay together, so the even 12 + 12 cut moves to 10 + 14 or 14 + 10.
  const parts = cutPracticeCards(cards, [{ start: 10, length: 4 }]);
  assert.deepEqual(parts.map((part) => part.length).sort(), [10, 14]);
  assert.ok(parts.some((part) => [10, 11, 12, 13].every((card) => part.includes(card))));
  // Two blocks of 4 around the middle of 20 cards with a cap of 10: three parts are needed.
  const tight = cutPracticeCards(cards.slice(0, 20), [{ start: 7, length: 4 }, { start: 11, length: 4 }], 10);
  for (const part of tight) {
    assert.ok(part.length <= 10);
    assert.ok(!(part.includes(7) && !part.includes(10)));
    assert.ok(!(part.includes(11) && !part.includes(14)));
  }
  assert.equal(tight.length, 3);
});

test("a node never splits a study part's order cards and keeps at most 4 per part", () => {
  const SENTENCES = ["Ich trinke gern Kaffee", "Wir gehen heute schwimmen", "Er wohnt in Berlin", "Sie kommt aus Wien"];
  const clips = Array.from({ length: 48 }, (_, index) => ({
    id: `s${index}`,
    script: `${SENTENCES[index % SENTENCES.length]} ${index}`,
    translationVi: `câu số ${index} nhé`,
    sentenceOrder: true,
  }));
  const decks = practiceNodeDecks("a1/lektion-9", clips);
  assert.equal(decks.length, lessonNodeParts(clips).length);
  for (const parts of decks) {
    assert.ok(parts.length <= 5, `${parts.length} parts`);
    for (const cards of parts) {
      assert.ok(cards.length <= MAX_PRACTICE_CARDS);
      const kinds = cards.map((card) => card.kind);
      assert.ok(kinds.filter((kind) => kind === "order").length <= MAX_ORDER_CARDS);
    }
    // A study part's order cards sit together at the end of one part.
    const flat = parts.flatMap((cards, part) => cards.map((card) => ({ card, part })));
    flat.forEach(({ card, part }, at) => {
      const next = flat[at + 1];
      if (card.kind === "order" && next?.card.kind === "order") assert.equal(next.part, part);
    });
  }
});

test("a node deals every card of its study parts, cut evenly and the same each time", () => {
  const clips = lessonClips(60);
  const decks = practiceNodeDecks("a1/lektion-1", clips);
  const again = practiceNodeDecks("a1/lektion-1", clips);
  const groups = lessonNodeParts(clips);
  assert.equal(decks.length, groups.length);
  assert.deepEqual(
    decks.map((parts) => parts.map((cards) => cards.map((card) => card.key))),
    again.map((parts) => parts.map((cards) => cards.map((card) => card.key))),
  );
  decks.forEach((parts, index) => {
    const expected = (groups[index] ?? []).reduce(
      (sum, part) => sum + practiceCardCount(part, clips),
      0,
    );
    const sizes = parts.map((cards) => cards.length);
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), expected);
    assert.equal(parts.length, Math.ceil(expected / MAX_PRACTICE_CARDS));
    assert.ok(Math.max(...sizes) <= MAX_PRACTICE_CARDS);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  });
});

test("each clip is completed by the last practice part holding one of its cards", () => {
  const clips = lessonClips(30);
  const decks = practiceNodeDecks("a1/lektion-2", clips);
  const layout = practiceNodeLayout("a1/lektion-2", clips);
  layout.forEach((parts, node) => {
    const completed = parts.flatMap((part) => part.completes);
    const nodeClips = (lessonNodeParts(clips)[node] ?? []).flat().map((clip) => clip.id);
    assert.deepEqual([...completed].sort(), [...nodeClips].sort());
    parts.forEach((part, index) => {
      const cards = decks[node]?.[index] ?? [];
      assert.equal(part.cardCount, cards.length);
      assert.deepEqual(part.clipIds, [...new Set(cards.map((card) => card.clip.id))]);
      for (const id of part.completes) {
        const later = parts.slice(index + 1).some((other) => other.clipIds.includes(id));
        assert.equal(later, false, `${id} has a card after the part that completes it`);
      }
    });
    assert.equal(new Set(parts.map((part) => part.key)).size, parts.length);
  });
});

test("a trail practice node counts its card parts and opens the first unfinished one", () => {
  const clips = lessonClips(60);
  const layout = practiceNodeLayout("a1/lektion-3", clips);
  const base = {
    reviewedClipIds: [],
    completedClipIds: [],
    studyFinished: true,
    practiceFinished: false,
    practiceParts: layout,
  };
  const practice = lessonPathNodes(clips, base).filter((node) => node.kind === "practice");
  assert.equal(practice.length, layout.length);
  assert.equal(practice[0]?.parts.length, layout[0]?.length);
  assert.equal(practice[0]?.firstPart, 1);
  assert.equal(practice[1]?.firstPart, (layout[0]?.length ?? 0) + 1);
  const total = layout.reduce((sum, parts) => sum + parts.length, 0);
  assert.equal(practice[0]?.lessonPartCount, total);
  assert.equal(nextNodePart(practice[0]!, [])?.partNumber, 1);

  const first = layout[0]?.[0];
  assert.ok(first);
  const keyed = lessonPathNodes(clips, { ...base, practicePartKeys: [first.key] });
  const node = keyed.find((entry) => entry.kind === "practice" && entry.node === 1)!;
  assert.equal(node.partsDone, 1);
  assert.equal(nextNodePart(node, [])?.partNumber, 2);
  assert.deepEqual(
    nextNodePart(node, [])?.clips.map((clip) => clip.id),
    layout[0]?.[1]?.clipIds,
  );

  // Practice saved under the old parts: a part whose clips are all completed is done.
  const fromClips = lessonPathNodes(clips, { ...base, completedClipIds: first.clipIds });
  assert.equal(fromClips.find((entry) => entry.kind === "practice")?.partDone[0], true);

  // A key from cards that changed no longer counts.
  const stale = lessonPathNodes(clips, { ...base, practicePartKeys: ["p-old"] });
  assert.equal(stale.find((entry) => entry.kind === "practice")?.partsDone, 0);

  const study = lessonPathNodes(clips, base).filter((entry) => entry.kind === "study");
  assert.equal(study[0]?.parts.length, lessonNodeParts(clips)[0]?.length);
});

test("a finished practice part is saved by key and survives a merge", () => {
  const now = new Date("2026-10-06T08:00:00.000Z");
  const left = commitLearnPart(structuredClone(DEFAULT_PROGRESS), "lektion-1", ["k1"], {
    now,
    practicePartKey: "pA",
  });
  const right = commitLearnPart(structuredClone(DEFAULT_PROGRESS), "lektion-1", [], {
    now,
    practicePartKey: "pB",
  });
  assert.deepEqual(left.learn["lektion-1"]?.practicePartKeys, ["pA"]);
  assert.deepEqual(right.learn["lektion-1"]?.completedClipIds, []);
  const merged = mergeProgress(left, right);
  assert.deepEqual([...(merged.learn["lektion-1"]?.practicePartKeys ?? [])].sort(), ["pA", "pB"]);
  assert.deepEqual(merged.learn["lektion-1"]?.completedClipIds, ["k1"]);
});
