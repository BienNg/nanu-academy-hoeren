import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { grammarTopicContent, type StoredGrammarTopic, type TenseTables } from "./grammar-lessons.js";
import { grammarNodeLayout } from "./grammar-node.js";
import { DEFAULT_PROGRESS, type LearnProgress } from "./progress.js";
import { readWorldAreas } from "./grammar-world-files.js";
import {
  firstPracticeNodeDone,
  landingArea,
  mergeWorldProgress,
  normalizeWorldProgress,
  resolveWorld,
  firstOpenStage,
  unpractisedStages,
  withWorldPartDone,
  withWorldReviewDone,
  worldAreaViews,
  worldCardStream,
  worldNodes,
  worldPracticeCardCount,
  worldReviewCards,
  worldStageView,
  worldStageOpen,
  WORLD_REVIEW_CARDS,
  type StoredWorldClip,
  type WorldGate,
  type WorldTopic,
} from "./grammar-world.js";

const root = process.cwd();
const tables = JSON.parse(readFileSync(join(root, "src/data/grammar/tenses.json"), "utf8")) as TenseTables;
const areas = resolveWorld(readWorldAreas());
const konjugation = areas[0]!.topics[0]!;

function withClips(topic: WorldTopic, extra: StoredWorldClip[]): WorldTopic {
  return {
    ...topic,
    clips: [...topic.clips, ...extra.map(({ filename, ...clip }) => ({ ...clip, audioPath: `x/${filename}` }))],
  };
}

const moreClips: StoredWorldClip[] = [
  { id: "x-01", filename: "x1.mp3", script: "Ich wohne in Hamburg.", translationVi: "Tôi sống ở Hamburg.", verb: "wohnen", tense: "praesens", person: "ich" },
  { id: "x-02", filename: "x2.mp3", script: "Wir gehen nach Hause.", translationVi: "Chúng tôi về nhà.", verb: "gehen", tense: "praesens", person: "wir", from: "Ich gehe nach Hause." },
  { id: "x-03", filename: "x3.mp3", script: "Er fragt Anna.", translationVi: "Anh ấy hỏi Anna.", verb: "fragen", tense: "praesens", person: "er", wrong: { script: "Er fragst Anna.", whyVi: "er: -t" } },
];

test("Verbkonjugation fills six nodes, the last five from the added clips", () => {
  assert.equal(worldCardStream(tables, konjugation).length, 272);
  const nodes = worldNodes(tables, konjugation);
  assert.equal(nodes.length, 6);
  assert.deepEqual(
    nodes.map((node) => node.parts.map((part) => part.cards.length)),
    [
      [10, 10, 10, 10],
      [10, 10, 10, 11],
      [15, 15, 15, 17],
      [15, 15, 15, 17],
      [15, 15, 15, 17],
      [15, 15, 15, 8],
    ],
  );
  for (const node of nodes) {
    for (const part of node.parts) {
      assert.equal(part.cards[0]!.kind, "table-fill");
      assert.equal(part.cards[1]!.kind, "pronoun-pairing");
    }
  }
  assert.equal(new Set(nodes.flatMap((node) => node.parts.map((part) => part.key))).size, 24);
});

test("a clip stays in one practice node, and the next node starts on a new clip", () => {
  const stream = worldCardStream(tables, konjugation);
  const nodes = worldNodes(tables, konjugation);
  const owner = new Map<string, number>();
  for (const node of nodes) {
    assert.ok(node.parts.length <= 4);
    if (node.start > 0) {
      assert.notEqual(stream[node.start - 1]!.key.split(":")[1], stream[node.start]!.key.split(":")[1]);
    }
    for (const id of new Set(node.parts.flatMap((part) => part.clipIds))) {
      assert.equal(owner.has(id), false, id);
      owner.set(id, node.node);
    }
  }
  assert.equal(owner.size, konjugation.clips.length);
});

test("card keys do not depend on audio, so adding MP3s keeps saved parts", () => {
  const silent = { ...konjugation, clips: konjugation.clips.map((clip) => ({ ...clip, audioPath: null })) };
  assert.deepEqual(
    worldNodes(tables, silent)[0]!.parts.map((part) => part.key),
    worldNodes(tables, konjugation)[0]!.parts.map((part) => part.key),
  );
  assert.ok(worldCardStream(tables, silent).every((card) => card.kind !== "tense-spot"));
});

test("a node opens only once every clip in it has its MP3", () => {
  const voiced = { ...konjugation, clips: konjugation.clips.map((clip, index) => (index < 23 ? clip : { ...clip, audioPath: null })) };
  const nodes = worldNodes(tables, voiced);
  assert.deepEqual(nodes.map((node) => node.ready), [true, true, false, false, false, false]);

  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const node of nodes.slice(0, 2)) {
    for (const part of node.parts) stage = withWorldPartDone(tables, voiced, stage, part.key);
  }
  const view = worldStageView(tables, voiced, stage);
  assert.equal(view.current, null);
  assert.equal(view.review.unlocked, false);
  const target = { review: false, node: 3, part: 1, run: 0 };
  assert.equal(worldPracticeCardCount(tables, voiced, stage, target), null);
  assert.ok(worldPracticeCardCount(tables, konjugation, stage, target));

  // One missing MP3 is enough to hold back its node.
  const gap = { ...konjugation, clips: konjugation.clips.map((clip) => (clip.id === "vk-15" ? { ...clip, audioPath: null } : clip)) };
  assert.deepEqual(worldNodes(tables, gap).map((node) => node.ready), [true, false, true, true, true, true]);
});

test("every clip gives 2–4 cards with one right form, never a form the pronoun allows", () => {
  for (const clip of konjugation.clips) {
    const cards = worldCardStream(tables, { ...konjugation, clips: [clip] });
    assert.ok(cards.length >= 2 && cards.length <= 4, clip.id);
    assert.equal(cards[0]!.kind, "form-choice");
  }
  const sie = worldCardStream(tables, { ...konjugation, clips: konjugation.clips.filter((clip) => clip.id === "vk-12") });
  const choice = sie.find((card) => card.kind === "form-choice");
  assert.ok(choice && choice.kind === "form-choice");
  assert.equal(choice.question.options.filter((option) => option.correct).length, 1);
  assert.ok(!choice.question.options.some((option) => option.text === "hört"));
});

test("warm-ups stay in Präsens", () => {
  for (const part of worldNodes(tables, konjugation)[0]!.parts) {
    const table = part.cards[0]!;
    assert.ok(table.kind === "table-fill");
    assert.equal(table.tense, "praesens");
    const blanks = table.rows.filter((row) => row.text === null);
    assert.ok(blanks.length >= 3 && blanks.length <= 5, table.key);
    const praesens = new Set(Object.values(tables.verbs).flatMap((verb) => Object.values(verb.praesens)));
    assert.ok(table.bank.every((chip) => praesens.has(chip.text)), table.bank.map((chip) => chip.text).join(" "));
  }
});

test("finishing every part of a node seals it; added clips grow new nodes above", () => {
  const nodes = worldNodes(tables, konjugation);
  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const part of nodes[0]!.parts) stage = withWorldPartDone(tables, konjugation, stage, part.key);
  assert.deepEqual(stage!.nodeEnds, [32]);

  const grown = withClips(konjugation, moreClips);
  const view = worldStageView(tables, grown, stage);
  assert.equal(view.nodes.length, nodes.length);
  assert.equal(view.nodes[0]!.done, true);
  assert.deepEqual(view.nodes[0]!.parts.map((part) => part.key), nodes[0]!.parts.map((part) => part.key));
  assert.ok(view.nodes.at(-1)!.parts.some((part) => part.clipIds.includes("x-01")));
  assert.equal(view.nodes[1]!.done, false);
  assert.deepEqual(view.current, { node: 2, part: 1 });
  assert.equal(view.review.unlocked, false);

  const packed = withClips(
    konjugation,
    Array.from({ length: 8 }, (_, index) => ({
      id: `y-0${index}`,
      filename: `y${index}.mp3`,
      script: "Ich wohne in Hamburg.",
      translationVi: "Tôi sống ở Hamburg.",
      verb: "wohnen",
      tense: "praesens" as const,
      person: "ich",
    })),
  );
  const above = worldNodes(tables, packed);
  assert.ok(above.length > nodes.length);
  assert.equal(above[0]!.end, nodes[0]!.end);
  assert.ok(above.at(-1)!.parts.some((part) => part.clipIds.some((id) => id.startsWith("y-"))));
});

test("a finished short node stays done when clips are added", () => {
  const small = { ...konjugation, clips: konjugation.clips.slice(0, 4) };
  const nodes = worldNodes(tables, small);
  assert.equal(nodes.length, 1);
  assert.ok(nodes[0]!.parts.length < 4);
  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const part of nodes[0]!.parts) stage = withWorldPartDone(tables, small, stage, part.key);

  const grown = { ...konjugation };
  const view = worldStageView(tables, grown, stage);
  assert.equal(view.nodes[0]!.done, true);
  assert.equal(view.nodes[0]!.parts.length, nodes[0]!.parts.length);
  assert.equal(view.nodes[1]!.start, nodes[0]!.end);
});

test("parts from the third node on hold 15 cards", () => {
  const big = { ...konjugation, clips: [...konjugation.clips, ...konjugation.clips, ...konjugation.clips].map((clip, index) => ({ ...clip, id: `c-${index}` })) };
  const nodes = worldNodes(tables, big);
  assert.ok(nodes.length >= 3);
  assert.equal(nodes[2]!.parts[0]!.cards.length, 15);
});

test("the review mixes 15 cards across all clips and changes per run", () => {
  const first = worldReviewCards(tables, konjugation, 0);
  assert.equal(first.length, WORLD_REVIEW_CARDS);
  const clips = new Set(first.map((card) => card.key.split(":")[1]));
  assert.equal(clips.size, WORLD_REVIEW_CARDS);
  const second = worldReviewCards(tables, konjugation, 1);
  assert.notDeepEqual(first.map((card) => card.key), second.map((card) => card.key));
  const grown = withClips(konjugation, moreClips);
  assert.ok(
    Array.from({ length: 40 }, (_, run) => worldReviewCards(tables, grown, run)).some((cards) =>
      cards.some((card) => card.key.includes(":x-0")),
    ),
  );
});

test("a practice part and a review report the cards that pay XP", () => {
  const node = worldNodes(tables, konjugation)[0]!;
  const part = node.parts[0]!;
  assert.equal(
    worldPracticeCardCount(tables, konjugation, undefined, { review: false, node: 1, part: 1, run: 0 }),
    part.cards.length,
  );
  assert.equal(worldPracticeCardCount(tables, konjugation, undefined, { review: false, node: 9, part: 1, run: 0 }), null);
  assert.equal(worldPracticeCardCount(tables, konjugation, undefined, { review: true, node: 0, part: 0, run: 0 }), null);

  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const entry of worldNodes(tables, konjugation)) {
    for (const done of entry.parts) stage = withWorldPartDone(tables, konjugation, stage, done.key);
  }
  assert.equal(
    worldPracticeCardCount(tables, konjugation, stage, { review: true, node: 0, part: 0, run: 0 }),
    worldReviewCards(tables, konjugation, 0).length,
  );
  const played = withWorldReviewDone(stage);
  assert.equal(
    worldPracticeCardCount(tables, konjugation, played, { review: true, node: 0, part: 0, run: 0 }),
    worldReviewCards(tables, konjugation, 0).length,
  );
  assert.equal(worldPracticeCardCount(tables, konjugation, played, { review: true, node: 0, part: 0, run: 5 }), null);
});

test("free play opens the review before any node is done, and that review still pays XP", () => {
  const view = worldStageView(tables, konjugation, undefined, { freePlay: true });
  assert.equal(view.review.unlocked, true);
  assert.equal(view.done, false);
  assert.equal(
    worldPracticeCardCount(tables, konjugation, undefined, { review: true, node: 0, part: 0, run: 0 }, { freePlay: true }),
    WORLD_REVIEW_CARDS,
  );
  assert.equal(worldPracticeCardCount(tables, konjugation, undefined, { review: true, node: 0, part: 0, run: 0 }), null);
  const silent = { ...konjugation, clips: konjugation.clips.map((clip) => ({ ...clip, audioPath: null })) };
  assert.ok(
    worldPracticeCardCount(tables, silent, undefined, { review: false, node: 1, part: 1, run: 0 }, { freePlay: true }),
  );
  assert.equal(worldPracticeCardCount(tables, silent, undefined, { review: false, node: 1, part: 1, run: 0 }), null);
});

test("stage view: review unlocks after every node, done after the review", () => {
  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const node of worldNodes(tables, konjugation)) {
    for (const part of node.parts) stage = withWorldPartDone(tables, konjugation, stage, part.key);
  }
  let view = worldStageView(tables, konjugation, stage);
  assert.equal(view.review.unlocked, true);
  assert.equal(view.done, false);
  view = worldStageView(tables, konjugation, withWorldReviewDone(stage));
  assert.equal(view.done, true);
  assert.equal(view.stars, view.starsTotal);
});

test("a stage opens when the Lektion's first practice node is finished", () => {
  const parts = [{ key: "p1", clipIds: ["c1", "c2"] }];
  const gate: WorldGate = {
    progressKey: "lektion-3",
    practiceParts: parts,
    access: true,
    unlocked: false,
    lessonHref: "/learn/a1-1?lektion=lektion-3",
    lessonLabel: "A1.1 · Lektion 3",
  };
  const withLearn = (patch: Partial<LearnProgress>) => ({
    ...DEFAULT_PROGRESS,
    learn: {
      "lektion-3": {
        currentClipIndex: 0,
        completedClipIds: [],
        runCount: 0,
        runCompletedClipIds: [],
        reviewedClipIds: [],
        studyRunCount: 0,
        ...patch,
      },
    },
  });
  assert.equal(firstPracticeNodeDone(undefined, parts), false);
  assert.equal(worldStageOpen(gate, DEFAULT_PROGRESS), false);
  assert.equal(worldStageOpen(gate, withLearn({ practicePartKeys: ["other"] })), false);
  assert.equal(worldStageOpen(gate, withLearn({ practicePartKeys: ["p1"] })), true);
  assert.equal(worldStageOpen(gate, withLearn({ completedClipIds: ["c1", "c2"] })), true);
  assert.equal(worldStageOpen(gate, withLearn({ runCount: 1 })), true);
  assert.equal(worldStageOpen({ ...gate, access: false }, withLearn({ practicePartKeys: ["p1"] })), false);
  assert.equal(worldStageOpen({ ...gate, unlocked: true }, DEFAULT_PROGRESS), true);
});

test("a word drill blanks the focus word and skips the verb warm-ups", () => {
  const topic: WorldTopic = {
    id: "artikel-probe",
    titleVi: "Mạo từ",
    titleDe: "Artikel",
    opensWith: "a1-1/lektion-4",
    drill: "word",
    tenses: ["praesens"],
    verbs: ["sein"],
    tips: [],
    clips: [
      {
        id: "ar-01",
        audioPath: null,
        script: "Das ist der Mann.",
        translationVi: "Đó là người đàn ông.",
        verb: "sein",
        tense: "praesens",
        person: "er",
        focus: "der",
        choices: ["der", "die", "das"],
      },
    ],
  };
  const [card] = worldCardStream(tables, topic);
  assert.equal(card?.kind, "form-choice");
  if (card?.kind === "form-choice") {
    assert.equal(card.question.prompt, "Das ist ____ Mann.");
    assert.equal(card.question.options.find((option) => option.correct)?.text, "der");
  }
  const nodes = worldNodes(tables, topic);
  assert.equal(nodes[0]?.parts[0]?.cards[0]?.kind, "form-choice");
});

test("areas: badge for open unpractised stages, landing on the newest open stage", () => {
  const views = worldAreaViews(tables, areas, undefined, () => true);
  assert.deepEqual(unpractisedStages(views).map((topic) => topic.id), [
    "verbkonjugation",
    "artikel",
    "w-fragen",
    "temporale-praepositionen",
  ]);
  assert.equal(landingArea(views), "gioi-tu");
  assert.equal(firstOpenStage(views)?.id, "verbkonjugation");
  const closed = worldAreaViews(tables, areas, undefined, () => false);
  assert.equal(firstOpenStage(closed), null);
  assert.equal(closed[0]!.open, false);
  assert.equal(closed[1]!.open, false);
});

test("progress merges as a union and survives normalizing", () => {
  const merged = mergeWorldProgress(
    { stages: { a: { partKeys: ["w1"], nodeEnds: [], reviewRuns: 0, announcedAt: "2026-10-02T00:00:00.000Z" } } },
    { stages: { a: { partKeys: ["w2"], nodeEnds: [32], reviewRuns: 2, announcedAt: "2026-10-01T00:00:00.000Z" } }, summits: { s: "2026-10-03T00:00:00.000Z" } },
  );
  assert.deepEqual(merged, {
    stages: { a: { partKeys: ["w1", "w2"], nodeEnds: [32], reviewRuns: 2, announcedAt: "2026-10-01T00:00:00.000Z" } },
    summits: { s: "2026-10-03T00:00:00.000Z" },
  });
  assert.deepEqual(normalizeWorldProgress(JSON.parse(JSON.stringify(merged))), merged);
  assert.equal(normalizeWorldProgress({ stages: { "Bad Id": {} } }), undefined);
});

test("new verbs in the tables leave A1.2 Lektion 1 practice keys alone", () => {
  const lesson = JSON.parse(readFileSync(join(root, "src/data/levels/a1-2/lektion-1.json"), "utf8")) as {
    grammar: StoredGrammarTopic[];
  };
  const topic = grammarTopicContent(lesson.grammar[0]!, tables, "a1-2/lektion-1");
  assert.deepEqual(
    grammarNodeLayout("a1-2/lektion-1", topic, tables).practiceParts.map((part) => part.key),
    ["ggk75ae", "ga1m1of", "g1d9n0oj"],
  );
});
