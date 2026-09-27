import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  activeStreakDays,
  bumpStreak,
  commitLearnPart,
  completedPartCount,
  firstIncompletePartIndex,
  firstUnlockedStudyHref,
  incrementStudyRunCount,
  listeningPartCount,
  listeningPartSize,
  markLearnClipReviewed,
  mergeProgress,
  normalizeProgress,
  setLearnRunOrder,
  requeueMissedClip,
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
  assert.equal(listeningPartSize(2, 1, 1), 2);
});

test("part size follows the split, including a shuffled lesson of 21", () => {
  assert.equal(listeningPartSize(21, 1, 2), 11);
  assert.equal(listeningPartSize(21, 2, 2), 10);
  assert.equal(listeningPartSize(21, 1, 1), null);
  assert.equal(listeningPartSize(10, 1, 1), 10);
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

test("a missed clip returns later and the following clip takes its place", () => {
  const clips = questions(4);
  const soon = requeueMissedClip(clips, 1, () => 0);
  assert.deepEqual(
    soon.map((clip) => clip.id),
    ["c0", "c2", "c1", "c3"],
  );
  const later = requeueMissedClip(clips, 1, () => 0.99);
  assert.deepEqual(
    later.map((clip) => clip.id),
    ["c0", "c2", "c3", "c1"],
  );
});

test("a missed clip at the end of the part stays last", () => {
  const clips = questions(3);
  assert.deepEqual(
    requeueMissedClip(clips, 2, () => 0).map((clip) => clip.id),
    ["c0", "c1", "c2"],
  );
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

test("the first unlocked study card skips locked lessons and finished passes", () => {
  const levels = [
    {
      slug: "a1-1",
      chapters: [
        { slug: "lektion-1", clipCount: 10 },
        { slug: "video-only", clipCount: 0 },
        { slug: "lektion-2", clipCount: 8 },
      ],
    },
    {
      slug: "a1-2",
      chapters: [{ slug: "lektion-1", clipCount: 12 }],
    },
  ];
  const fresh = normalizeProgress({});
  assert.equal(
    firstUnlockedStudyHref(fresh, levels, ["a1-1"]),
    "/learn/a1-1/lektion-1/study",
  );
  assert.equal(firstUnlockedStudyHref(fresh, levels, []), null);
  assert.equal(
    firstUnlockedStudyHref(fresh, levels, ["a1-2"]),
    "/learn/a1-2/lektion-1/study",
  );

  const studiedFirst = normalizeProgress({
    learn: {
      "lektion-1": {
        currentClipIndex: 0,
        completedClipIds: [],
        runCount: 0,
        runCompletedClipIds: [],
        reviewedClipIds: [],
        studyRunCount: 1,
        studyCompletedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  });
  assert.equal(
    firstUnlockedStudyHref(studiedFirst, levels, ["a1-1"]),
    "/learn/a1-1/lektion-1/study",
  );

  const listeningDone = normalizeProgress({
    learn: {
      "lektion-1": {
        currentClipIndex: 0,
        completedClipIds: [],
        runCount: 1,
        runCompletedClipIds: [],
        reviewedClipIds: [],
        completedAt: "2026-01-02T00:00:00.000Z",
        studyRunCount: 1,
      },
    },
  });
  assert.equal(
    firstUnlockedStudyHref(listeningDone, levels, ["a1-1"]),
    "/learn/a1-1/lektion-2/study",
  );
});

test("completing a study clip extends the day streak", () => {
  const yesterday = new Date("2026-09-27T08:00:00.000Z");
  const today = new Date("2026-09-28T08:00:00.000Z");
  const practiced = bumpStreak(normalizeProgress({}), yesterday);
  const reviewed = markLearnClipReviewed(practiced, "lektion-1", "hallo", today);

  assert.equal(activeStreakDays(reviewed, today), 2);
  assert.ok(reviewed.practiceDates?.includes("2026-09-28"));
  assert.deepEqual(reviewed.learn["lektion-1"]?.reviewedClipIds, ["hallo"]);
});

test("reviewing a study clip again on a later day still counts", () => {
  const first = new Date("2026-09-27T08:00:00.000Z");
  const later = new Date("2026-09-28T08:00:00.000Z");
  const once = markLearnClipReviewed(normalizeProgress({}), "lektion-1", "hallo", first);
  const again = markLearnClipReviewed(once, "lektion-1", "hallo", later);

  assert.deepEqual(again.learn["lektion-1"]?.reviewedClipIds, ["hallo"]);
  assert.equal(activeStreakDays(again, later), 2);
  assert.ok(again.practiceDates?.includes("2026-09-28"));
});

test("a finished study pass counts as a practice day", () => {
  const yesterday = new Date("2026-09-27T08:00:00.000Z");
  const today = new Date("2026-09-28T08:00:00.000Z");
  const practiced = bumpStreak(normalizeProgress({}), yesterday);
  const studied = incrementStudyRunCount(practiced, "lektion-1", today.toISOString());

  assert.equal(studied.activity?.["2026-09-28"]?.studyRuns, 1);
  assert.equal(activeStreakDays(studied, today), 2);
});

test("study clips already stored for today count beside listening days", () => {
  const progress = normalizeProgress({
    practiceDates: ["2026-09-27"],
    lastPracticeDate: "2026-09-27",
    streakDays: 1,
    activity: {
      "2026-09-28": { studyRuns: 0, practiceRuns: 0, clips: 1 },
    },
  });

  assert.equal(activeStreakDays(progress, new Date("2026-09-28T12:00:00.000Z")), 2);
});
