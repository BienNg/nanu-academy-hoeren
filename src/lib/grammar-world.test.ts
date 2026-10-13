import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { grammarTopicContent, type StoredGrammarTopic, type TenseTables } from "./grammar-lessons.js";
import { grammarNodeLayout } from "./grammar-node.js";
import { DEFAULT_PROGRESS, type LearnProgress } from "./progress.js";
import {
  firstPracticeNodeDone,
  landingArea,
  mergeWorldProgress,
  normalizeWorldProgress,
  resolveWorld,
  unpractisedStages,
  withWorldPartDone,
  withWorldReviewDone,
  worldAreaViews,
  worldCardStream,
  worldNodes,
  worldReviewCards,
  worldStageView,
  worldStageOpen,
  WORLD_REVIEW_CARDS,
  type StoredWorldArea,
  type StoredWorldClip,
  type WorldGate,
  type WorldTopic,
} from "./grammar-world.js";

const root = process.cwd();
const tables = JSON.parse(readFileSync(join(root, "src/data/grammar/tenses.json"), "utf8")) as TenseTables;
const world = JSON.parse(readFileSync(join(root, "src/data/grammar/world.json"), "utf8")) as { areas: StoredWorldArea[] };
const areas = resolveWorld(world.areas);
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

test("Verbkonjugation fills one node of four 10-card parts, warm-ups first", () => {
  assert.equal(worldCardStream(tables, konjugation).length, 32);
  const nodes = worldNodes(tables, konjugation);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0]!.parts.map((part) => part.cards.length), [10, 10, 10, 10]);
  for (const part of nodes[0]!.parts) {
    assert.equal(part.cards[0]!.kind, "table-fill");
    assert.equal(part.cards[1]!.kind, "pronoun-pairing");
  }
  assert.equal(new Set(nodes[0]!.parts.map((part) => part.key)).size, 4);
});

test("card keys do not depend on audio, so adding MP3s keeps saved parts", () => {
  const silent = { ...konjugation, clips: konjugation.clips.map((clip) => ({ ...clip, audioPath: null })) };
  assert.deepEqual(
    worldNodes(tables, silent)[0]!.parts.map((part) => part.key),
    worldNodes(tables, konjugation)[0]!.parts.map((part) => part.key),
  );
  assert.ok(worldCardStream(tables, silent).every((card) => card.kind !== "tense-spot"));
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
  assert.equal(view.nodes.length, 2);
  assert.equal(view.nodes[0]!.done, true);
  assert.deepEqual(view.nodes[0]!.parts.map((part) => part.key), nodes[0]!.parts.map((part) => part.key));
  assert.equal(view.nodes[1]!.done, false);
  assert.deepEqual(view.current, { node: 2, part: 1 });
  assert.equal(view.review.unlocked, false);
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
  assert.equal(clips.size, 12);
  const second = worldReviewCards(tables, konjugation, 1);
  assert.notDeepEqual(first.map((card) => card.key), second.map((card) => card.key));
  const grown = withClips(konjugation, moreClips);
  assert.ok(worldReviewCards(tables, grown, 1).some((card) => card.key.includes(":x-0")));
});

test("stage view: review unlocks after the nodes, done after the review", () => {
  let stage = undefined as ReturnType<typeof withWorldPartDone> | undefined;
  for (const part of worldNodes(tables, konjugation)[0]!.parts) stage = withWorldPartDone(tables, konjugation, stage, part.key);
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

test("areas: badge for open unpractised stages, landing on the newest open stage", () => {
  const views = worldAreaViews(tables, areas, undefined, () => true);
  assert.deepEqual(unpractisedStages(views).map((topic) => topic.id), ["verbkonjugation"]);
  assert.equal(landingArea(views), "dong-tu");
  const closed = worldAreaViews(tables, areas, undefined, () => false);
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
