import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  commitLearnPart,
  completedPartCount,
  firstIncompletePartIndex,
  listeningPartCount,
  mergeProgress,
  normalizeProgress,
  setLearnRunOrder,
  splitListeningParts,
} from "./progress.js";

type Clip = { id: string; script: string };

function questions(count: number): Clip[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    script: "wort",
  }));
}

function lessonClips(level: string, chapter: string): Clip[] {
  const raw = JSON.parse(
    readFileSync(join("src/data/levels", level, `${chapter}.json`), "utf8"),
  ) as { clips?: { filename: string; script: string }[] };
  return (raw.clips ?? [])
    .filter((clip) =>
      existsSync(join("public/audio", level, chapter, clip.filename)),
    )
    .map((clip) => ({ id: clip.filename, script: clip.script }));
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = copy[index];
    copy[index] = copy[swap] as T;
    copy[swap] = current as T;
  }
  return copy;
}

function assertEvenParts(clips: readonly Clip[]): void {
  const parts = splitListeningParts(clips);
  assert.deepEqual(
    parts.flat().map((clip) => clip.id),
    clips.map((clip) => clip.id),
  );
  const sizes = parts.map((part) => part.length);
  if (clips.length <= 15) {
    assert.deepEqual(sizes, [clips.length]);
    return;
  }
  assert.equal(parts.length, Math.min(listeningPartCount(clips.length), clips.length));
  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);
  assert.ok(
    smallest >= 10 && largest <= 15 && largest - smallest <= 1,
    `parts [${sizes.join(", ")}] are outside 10–15 questions`,
  );
}

test("listening lessons split into even parts of 10–15 questions", () => {
  for (const chapter of ["lektion-1", "lektion-2", "lektion-3", "lektion-4"]) {
    const clips = lessonClips("a1-1", chapter);
    if (clips.length === 0) continue;
    assertEvenParts(clips);
    for (const seed of [1, 2, 3, 7]) {
      assertEvenParts(seededShuffle(clips, seed));
    }
  }
});

test("the last part stays in the 10–15 question range", () => {
  assert.deepEqual(
    splitListeningParts(questions(21)).map((part) => part.length),
    [11, 10],
  );
  assert.deepEqual(
    splitListeningParts(questions(32)).map((part) => part.length),
    [11, 11, 10],
  );
  assert.deepEqual(
    splitListeningParts(questions(16)).map((part) => part.length),
    [16],
  );
});

test("a short lesson stays one part", () => {
  const parts = splitListeningParts(questions(2));
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.length, 2);
});

test("progress is stored only when a whole part finishes", () => {
  const clips = questions(30);
  const parts = splitListeningParts(clips);
  assert.ok(parts.length >= 2);
  const blank = normalizeProgress({});
  assert.equal(firstIncompletePartIndex(parts, []), 0);

  const saved = commitLearnPart(
    blank,
    "lektion-3",
    (parts[0] ?? []).map((clip) => clip.id),
    { now: new Date("2026-09-27T00:00:00.000Z") },
  );
  const entry = saved.learn["lektion-3"];
  assert.equal(firstIncompletePartIndex(parts, entry?.completedClipIds ?? []), 1);
  assert.equal(completedPartCount(parts, entry?.completedClipIds ?? []), 1);
  const later = new Set((parts[1] ?? []).map((clip) => clip.id));
  for (const id of entry?.completedClipIds ?? []) {
    assert.equal(later.has(id), false);
  }
  assert.equal(entry?.runCount ?? 0, 0);
  assert.equal(entry?.completedAt, undefined);
});

test("finishing the last part completes the run and clears the cursor", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const first = commitLearnPart(normalizeProgress({}), "lektion-1", ["a", "b"], {
    now,
    finishRun: true,
  });
  const entry = first.learn["lektion-1"];
  assert.equal(entry?.runCount, 1);
  assert.equal(entry?.completedAt, now.toISOString());
  assert.deepEqual(entry?.completedClipIds, ["a", "b"]);
  assert.deepEqual(entry?.runCompletedClipIds, []);
  assert.equal(entry?.runClipOrder, undefined);
  assert.equal(first.activity?.["2026-09-27"]?.practiceRuns, 1);

  const again = commitLearnPart(first, "lektion-1", ["a", "b"], {
    now: new Date("2026-09-28T00:00:00.000Z"),
    finishRun: true,
  });
  assert.equal(again.learn["lektion-1"]?.runCount, 2);
  assert.equal(again.learn["lektion-1"]?.completedAt, now.toISOString());
});

test("a review order survives part commits and resets when replaced", () => {
  let progress = setLearnRunOrder(normalizeProgress({}), "lektion-2", ["a", "b", "c"]);
  progress = commitLearnPart(progress, "lektion-2", ["a"]);
  assert.deepEqual(progress.learn["lektion-2"]?.runClipOrder, ["a", "b", "c"]);
  assert.deepEqual(progress.learn["lektion-2"]?.runCompletedClipIds, ["a"]);
  assert.deepEqual(progress.learn["lektion-2"]?.completedClipIds, ["a"]);

  progress = setLearnRunOrder(progress, "lektion-2", ["c", "b", "a"]);
  assert.deepEqual(progress.learn["lektion-2"]?.runClipOrder, ["c", "b", "a"]);
  assert.deepEqual(progress.learn["lektion-2"]?.runCompletedClipIds, []);
  assert.deepEqual(progress.learn["lektion-2"]?.completedClipIds, ["a"]);
  assert.equal(
    setLearnRunOrder(progress, "lektion-2", ["c", "b", "a"]),
    progress,
  );
});

test("a finished run drops an older in-progress cursor when snapshots merge", () => {
  const base = {
    currentClipIndex: 0,
    completedClipIds: ["a", "b"],
    runCount: 1,
    runCompletedClipIds: [] as string[],
    reviewedClipIds: [] as string[],
    studyRunCount: 0,
    completedAt: "2026-09-27T00:00:00.000Z",
  };
  const finished = normalizeProgress({
    learn: { "lektion-3": { ...base, runCount: 2 } },
  });
  const inProgress = normalizeProgress({
    learn: {
      "lektion-3": {
        ...base,
        runCompletedClipIds: ["a"],
        runClipOrder: ["b", "a"],
      },
    },
  });
  const merged = mergeProgress(finished, inProgress);
  assert.equal(merged.learn["lektion-3"]?.runCount, 2);
  assert.deepEqual(merged.learn["lektion-3"]?.runCompletedClipIds, []);
  assert.equal(merged.learn["lektion-3"]?.runClipOrder, undefined);
  assert.deepEqual(merged.learn["lektion-3"]?.completedClipIds, ["a", "b"]);
});

test("run order round-trips through stored progress", () => {
  const progress = normalizeProgress({
    learn: {
      "lektion-1": {
        currentClipIndex: 0,
        completedClipIds: ["a"],
        runCount: 1,
        runCompletedClipIds: [],
        runClipOrder: ["b", "a"],
        reviewedClipIds: [],
        studyRunCount: 0,
      },
    },
  });
  assert.deepEqual(progress.learn["lektion-1"]?.runClipOrder, ["b", "a"]);
});
