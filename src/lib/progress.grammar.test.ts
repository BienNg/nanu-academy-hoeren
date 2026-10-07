import assert from "node:assert/strict";
import test from "node:test";
import {
  cefrLearnKey,
  commitGrammarPart,
  DEFAULT_PROGRESS,
  isLearnChapterCompleted,
  mergeProgress,
  parseProgress,
  resetLearnProgress,
  type StoredProgress,
} from "./progress.js";
import {
  grammarActivityId,
  grammarLessonDone,
  grammarNodeFromActivityId,
  grammarNodeKeys,
  grammarNodeProgress,
  grammarPartStorageKey,
  type GrammarNodeLayout,
} from "./grammar-node.js";
import { lessonNodeFromActivityId } from "./progress.js";

const NOW = new Date("2026-10-06T10:00:00.000Z");

const layout: GrammarNodeLayout = {
  topicId: "vergangenheit-haben-sein",
  titleVi: "Quá khứ của haben và sein",
  studyParts: [
    { key: "s-haben", titleVi: "haben", screenCount: 8 },
    { key: "s-sein", titleVi: "sein", screenCount: 7 },
  ],
  practiceParts: [
    { key: "gaaa", verb: "haben", cardCount: 17 },
    { key: "gbbb", verb: "sein", cardCount: 17 },
    { key: "gccc", verb: null, cardCount: 15 },
  ],
};

function fresh(): StoredProgress {
  return { ...DEFAULT_PROGRESS, learn: {} };
}

test("a grammar part is stored once, under its topic", () => {
  let progress = commitGrammarPart(fresh(), "lektion-1", grammarPartStorageKey(layout.topicId, "s-haben"), { now: NOW });
  progress = commitGrammarPart(progress, "lektion-1", "vergangenheit-haben-sein:s-haben", { now: NOW });
  assert.deepEqual(progress.learn["lektion-1"]?.grammarPartKeys, ["vergangenheit-haben-sein:s-haben"]);
  assert.equal(isLearnChapterCompleted(progress, "lektion-1"), false);
});

test("the part that completes the Lektion stamps it completed", () => {
  const progress = commitGrammarPart(fresh(), "lektion-1", "t:gccc", { now: NOW, lessonComplete: true });
  assert.equal(isLearnChapterCompleted(progress, "lektion-1"), true);
  assert.equal(progress.learn["lektion-1"]?.completedAt, NOW.toISOString());
});

test("grammar parts survive parsing, merging and a listening reset", () => {
  const left = commitGrammarPart(fresh(), "lektion-1", "t:s-haben", { now: NOW });
  const right = commitGrammarPart(fresh(), "lektion-1", "t:gaaa", { now: NOW });
  const merged = mergeProgress(left, right);
  assert.deepEqual([...(merged.learn["lektion-1"]?.grammarPartKeys ?? [])].sort(), ["t:gaaa", "t:s-haben"]);

  const parsed = parseProgress(JSON.stringify(merged));
  assert.deepEqual([...(parsed.learn["lektion-1"]?.grammarPartKeys ?? [])].sort(), ["t:gaaa", "t:s-haben"]);

  const reset = resetLearnProgress(parsed, "lektion-1");
  assert.equal(reset.learn["lektion-1"]?.grammarPartKeys?.length, 2);
});

test("junk in stored grammar keys is dropped", () => {
  const parsed = parseProgress(
    JSON.stringify({ ...fresh(), learn: { "lektion-1": { completedClipIds: [], currentClipIndex: 0, grammarPartKeys: ["ok", 3, "", null] } } }),
  );
  assert.deepEqual(parsed.learn["lektion-1"]?.grammarPartKeys, ["ok"]);
});

test("a grammar node is done once every part key is stored", () => {
  const keys = grammarNodeKeys(layout, "study");
  assert.deepEqual(keys, ["vergangenheit-haben-sein:s-haben", "vergangenheit-haben-sein:s-sein"]);
  assert.deepEqual(grammarNodeProgress(layout, "study", [keys[0]!]), {
    partDone: [true, false],
    partsDone: 1,
    done: false,
  });
  assert.equal(grammarNodeProgress(layout, "study", keys).done, true);
});

test("the Lektion's grammar is done only with every study and practice part", () => {
  const all = [...grammarNodeKeys(layout, "study"), ...grammarNodeKeys(layout, "practice")];
  const last = all.pop()!;
  assert.equal(grammarLessonDone([layout], all), false);
  assert.equal(grammarLessonDone([layout], all, last), true);
  assert.equal(grammarLessonDone([], []), true);
});

test("grammar trail ids never read as Study or Practice nodes", () => {
  for (const kind of ["study", "practice"] as const) {
    const id = grammarActivityId("a1-2-lektion-1", kind, layout.topicId);
    assert.deepEqual(grammarNodeFromActivityId(id), { kind, topicId: layout.topicId });
    assert.equal(lessonNodeFromActivityId(id), null);
  }
  assert.equal(grammarNodeFromActivityId("a1-2-lektion-1-study-2"), null);
});

test("each level keeps its own Lektion progress; A1.1 keeps its stored keys", () => {
  assert.equal(cefrLearnKey("a1-1", "lektion-1"), "lektion-1");
  assert.equal(cefrLearnKey("a1-2", "lektion-1"), "a1-2/lektion-1");
  const progress = commitGrammarPart(fresh(), cefrLearnKey("a1-2", "lektion-1"), "t:gccc", { now: NOW, lessonComplete: true });
  assert.equal(isLearnChapterCompleted(progress, cefrLearnKey("a1-2", "lektion-1")), true);
  assert.equal(isLearnChapterCompleted(progress, cefrLearnKey("a1-1", "lektion-1")), false);
});
