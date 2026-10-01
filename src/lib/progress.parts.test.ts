import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isSentenceOrderEligible } from "./sentence-order.js";
import { maxClipsPerPracticePart, practiceCardCount, MAX_PRACTICE_CARDS } from "./practice-deck.js";
import {
  activeStreakDays,
  bumpStreak,
  commitLearnPart,
  completedPartCount,
  nextListeningPart,
  nextStudyPart,
  practiceRerunRing,
  absorbAddedLessonClips,
  firstIncompletePartIndex,
  firstUnlockedStudyHref,
  incrementStudyRunCount,
  listeningPartCount,
  listeningPartSize,
  MIN_PRACTICE_CLIPS,
  markLearnClipReviewed,
  mergeProgress,
  normalizeProgress,
  openListeningParts,
  preservedReviewOrder,
  setLearnRunOrder,
  requeueMissedClip,
  splitListeningParts,
  splitStudyParts,
  settledStudyReviewedIds,
  completedStudyPartCount,
  studyPartCount,
  studyPartSize,
  MAX_STUDY_CLIPS,
} from "./progress.js";

type Clip = {
  id: string;
  script: string;
  translationVi?: string;
  sentenceOrder?: boolean;
};

function questions(count: number): Clip[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    script: "wort",
  }));
}

function lessonClips(level: string, chapter: string): Clip[] {
  const raw = JSON.parse(
    readFileSync(join("src/data/levels", level, `${chapter}.json`), "utf8"),
  ) as {
    clips?: { filename: string; script: string; translationVi?: string; noSentenceOrder?: boolean }[];
  };
  return (raw.clips ?? [])
    .filter((clip) =>
      existsSync(join("public/audio", level, chapter, clip.filename)),
    )
    .map((clip) => ({
      id: clip.filename,
      script: clip.script,
      translationVi: clip.translationVi ?? "",
      sentenceOrder: isSentenceOrderEligible(clip),
    }));
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
  const maxClips = maxClipsPerPracticePart(clips);
  assert.deepEqual(
    parts.flat().map((clip) => clip.id),
    clips.map((clip) => clip.id),
  );
  const sizes = parts.map((part) => part.length);
  assert.equal(parts.length, listeningPartCount(clips.length, maxClips));
  const bound = maxClips >= MIN_PRACTICE_CLIPS ? maxClips : MIN_PRACTICE_CLIPS;
  parts.forEach((part, index) => {
    assert.equal(
      part.length,
      listeningPartSize(clips.length, index + 1, parts.length, maxClips),
    );
    assert.ok(
      part.length <= bound,
      `parts [${sizes.join(", ")}] grow past ${bound} clips`,
    );
    if (part.length < MIN_PRACTICE_CLIPS) {
      assert.equal(index, parts.length - 1);
    }
    if (part.length <= maxClips) {
      const cards = practiceCardCount(part, clips);
      assert.ok(
        cards <= MAX_PRACTICE_CARDS,
        `a part of ${part.length} clips dealt ${cards} cards`,
      );
    }
  });
}

test("listening lessons split so each run aims for at most 20 cards", () => {
  for (const chapter of ["lektion-1", "lektion-2", "lektion-3", "lektion-4"]) {
    const clips = lessonClips("a1-1", chapter);
    if (clips.length === 0) continue;
    assertEvenParts(clips);
    for (const seed of [1, 2, 3, 7]) {
      assertEvenParts(seededShuffle(clips, seed));
    }
  }
});

test("parts stay even, aim for 20 one-card clips, and never drop below 6", () => {
  assert.deepEqual(
    splitListeningParts(questions(21)).map((part) => part.length),
    [11, 10],
  );
  assert.deepEqual(
    splitListeningParts(questions(32)).map((part) => part.length),
    [16, 16],
  );
  assert.deepEqual(
    splitListeningParts(questions(16)).map((part) => part.length),
    [16],
  );
  assert.deepEqual(
    splitListeningParts(questions(13), 4).map((part) => part.length),
    [6, 6, 1],
  );
  assert.deepEqual(
    splitListeningParts(questions(10), 4).map((part) => part.length),
    [6, 4],
  );
  assert.deepEqual(
    splitListeningParts(questions(5), 4).map((part) => part.length),
    [5],
  );
  assert.deepEqual(
    splitListeningParts(questions(22), 4).map((part) => part.length),
    [6, 6, 6, 4],
  );
  assert.deepEqual(
    splitListeningParts(questions(8), 4).map((part) => part.length),
    [6, 2],
  );
});

test("a short lesson stays one part", () => {
  const parts = splitListeningParts(questions(2));
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.length, 2);
  assert.equal(listeningPartSize(2, 1, 1), 2);
});

test("study parts stay even and never hold more than 12 clips", () => {
  assert.deepEqual(
    splitStudyParts(questions(12)).map((part) => part.length),
    [12],
  );
  assert.deepEqual(
    splitStudyParts(questions(13)).map((part) => part.length),
    [7, 6],
  );
  assert.deepEqual(
    splitStudyParts(questions(31)).map((part) => part.length),
    [11, 10, 10],
  );
  const sizes = splitStudyParts(questions(107)).map((part) => part.length);
  assert.equal(sizes.reduce((sum, size) => sum + size, 0), 107);
  assert.equal(sizes.length, studyPartCount(107));
  assert.ok(Math.max(...sizes) <= MAX_STUDY_CLIPS);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.equal(studyPartSize(31, 1, 3), 11);
  assert.equal(studyPartSize(31, 2, 3), 10);
  assert.equal(studyPartSize(31, 1, 1), null);
});

test("an unfinished study part does not count and its clips are dropped", () => {
  const clips = questions(107);
  const reviewed = clips.slice(0, 31).map((clip) => clip.id);
  const kept = settledStudyReviewedIds(clips, reviewed);
  assert.equal(kept.length, 24);
  assert.deepEqual(
    completedStudyPartCount(clips, reviewed),
    { done: 2, total: 9 },
  );
  assert.equal(kept.at(-1), clips[23]?.id);
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

test("a rerun part stays finished when merged with a snapshot that lists every clip", () => {
  const clips = questions(32);
  const ids = clips.map((clip) => clip.id);
  const order = [...ids].reverse();
  const partOne = order.slice(0, 16);
  const base = {
    currentClipIndex: 0,
    completedClipIds: ids,
    runCount: 1,
    reviewedClipIds: [] as string[],
    studyRunCount: 0,
    completedAt: "2026-09-27T00:00:00.000Z",
  };
  const partial = normalizeProgress({
    learn: {
      "lektion-1": {
        ...base,
        runCompletedClipIds: partOne,
        runClipOrder: order,
      },
    },
  });
  const finishedPass = normalizeProgress({
    learn: {
      "lektion-1": {
        ...base,
        runCompletedClipIds: ids,
      },
    },
  });
  const merged = mergeProgress(finishedPass, partial);
  assert.deepEqual(merged.learn["lektion-1"]?.runClipOrder, order);
  assert.deepEqual(merged.learn["lektion-1"]?.runCompletedClipIds, partOne);
  const next = nextListeningPart(
    clips,
    ids,
    1,
    merged.learn["lektion-1"]?.runClipOrder,
    merged.learn["lektion-1"]?.runCompletedClipIds ?? [],
  );
  assert.equal(next?.partNumber, 2);
  assert.equal(next?.freshReplay, false);
});

test("a missing run cursor does not copy the finished lesson into the rerun", () => {
  const progress = normalizeProgress(
    JSON.parse(`{
      "learn": {
        "lektion-1": {
          "currentClipIndex": 4,
          "completedClipIds": ["a", "b", "c", "d"],
          "runCount": 1,
          "reviewedClipIds": [],
          "studyRunCount": 0,
          "completedAt": "2026-09-27T00:00:00.000Z"
        }
      }
    }`),
  );
  assert.deepEqual(progress.learn["lektion-1"]?.runCompletedClipIds, []);
  assert.equal(progress.learn["lektion-1"]?.runClipOrder, undefined);
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

test("clips added to a finished lesson are marked completed and studied", () => {
  const progress = normalizeProgress({
    learn: {
      "lektion-1": {
        currentClipIndex: 2,
        completedClipIds: ["a", "b"],
        completedAt: "2026-09-01T00:00:00.000Z",
        reviewedClipIds: ["a", "b"],
        studyRunCount: 1,
        studyCompletedAt: "2026-09-01T00:00:00.000Z",
        runCount: 1,
        runCompletedClipIds: [],
      },
    },
  });
  const next = absorbAddedLessonClips(progress, [
    { chapterSlug: "lektion-1", clipIds: ["a", "new", "b", "tail"] },
  ]);
  assert.deepEqual(next.learn["lektion-1"]?.completedClipIds, ["a", "b", "new", "tail"]);
  assert.deepEqual(next.learn["lektion-1"]?.reviewedClipIds, ["a", "b", "new", "tail"]);
  assert.equal(next.learn["lektion-1"]?.completedAt, "2026-09-01T00:00:00.000Z");
  assert.equal(absorbAddedLessonClips(next, [
    { chapterSlug: "lektion-1", clipIds: ["a", "new", "b", "tail"] },
  ]), next);
});

test("a clip inserted into a finished part is kept, and a clip after it stays new", () => {
  const ids = [...Array.from({ length: 11 }, (_, index) => `d${index}`), "old"];
  const progress = normalizeProgress({
    learn: {
      "lektion-2": {
        currentClipIndex: 11,
        completedClipIds: ids.slice(0, 11),
        reviewedClipIds: ["d0", "d1"],
        runCount: 0,
        runCompletedClipIds: ids.slice(0, 11),
        studyRunCount: 0,
      },
    },
  });
  const catalog = ["d0", "fresh", ...ids.slice(1), "appended"];
  const next = absorbAddedLessonClips(progress, [
    { chapterSlug: "lektion-2", clipIds: catalog },
  ]);
  const completed = next.learn["lektion-2"]?.completedClipIds ?? [];
  assert.equal(completed.includes("fresh"), true);
  assert.equal(completed.includes("appended"), false);
  assert.equal(completed.includes("old"), false);
  assert.deepEqual(next.learn["lektion-2"]?.reviewedClipIds, ["d0", "d1", "fresh"]);

  const open = openListeningParts(
    catalog.map((id) => ({ id })),
    completed,
  );
  assert.equal(open.parts[0]?.some((clip) => clip.id === "d0"), false);
  assert.equal(open.parts.flat().some((clip) => clip.id === "fresh"), false);
  assert.equal(open.parts.flat().some((clip) => clip.id === "appended"), true);
  assert.equal(open.partNumber, 2);
});

test("a cleared study replay is not filled back in", () => {
  const progress = normalizeProgress({
    learn: {
      "lektion-1": {
        currentClipIndex: 1,
        completedClipIds: ["a"],
        reviewedClipIds: [],
        studyRunCount: 1,
        studyCompletedAt: "2026-09-01T00:00:00.000Z",
        runCount: 0,
        runCompletedClipIds: [],
      },
    },
  });
  const next = absorbAddedLessonClips(progress, [
    { chapterSlug: "lektion-1", clipIds: ["a", "b"] },
  ]);
  assert.deepEqual(next.learn["lektion-1"]?.reviewedClipIds, []);
});

test("the next study part is the open one, and a finished lesson starts again at part 1", () => {
  const clips = questions(16);
  const first = nextStudyPart(clips, [], 0);
  assert.equal(first?.partNumber, 1);
  assert.equal(first?.rerun, false);
  assert.equal(first?.clips.length, 8);

  const mid = nextStudyPart(
    clips,
    clips.slice(0, 8).map((clip) => clip.id),
    0,
  );
  assert.equal(mid?.partNumber, 2);
  assert.equal(mid?.rerun, false);

  const again = nextStudyPart(
    clips,
    clips.map((clip) => clip.id),
    1,
  );
  assert.equal(again?.partNumber, 1);
  assert.equal(again?.rerun, true);
  assert.equal(again?.freshReplay, true);
  assert.equal(again?.clips.length, 8);
});

test("the next listening part follows the first pass, then the stored shuffle", () => {
  const clips = questions(32);
  const first = nextListeningPart(
    clips,
    clips.slice(0, 16).map((clip) => clip.id),
    0,
    undefined,
    [],
  );
  assert.equal(first?.partNumber, 2);
  assert.equal(first?.rerun, false);

  const fresh = nextListeningPart(clips, clips.map((clip) => clip.id), 1, undefined, []);
  assert.equal(fresh?.partNumber, 1);
  assert.equal(fresh?.rerun, true);
  assert.equal(fresh?.freshReplay, true);

  const order = [...clips].reverse().map((clip) => clip.id);
  const underway = nextListeningPart(clips, [], 1, order, order.slice(0, 16));
  assert.equal(underway?.partNumber, 2);
  assert.equal(underway?.rerun, true);
  assert.equal(underway?.freshReplay, false);
});

test("a rerun ring stays full until the first part of that rerun is finished", () => {
  const clips = questions(32);
  const idle = practiceRerunRing(clips, 1, undefined, []);
  assert.equal(idle.mastered, false);
  assert.equal(idle.percent, 100);
  assert.equal(idle.doneParts, 0);
  assert.equal(idle.partCount, 2);

  const order = clips.map((clip) => clip.id);
  const firstPart = splitListeningParts(clips)[0]?.map((clip) => clip.id) ?? [];
  const started = practiceRerunRing(clips, 1, order, firstPart);
  assert.equal(started.doneParts, 1);
  assert.equal(started.percent, 50);

  const mastered = practiceRerunRing(clips, 3, order, firstPart);
  assert.equal(mastered.mastered, true);
  assert.equal(mastered.percent, 100);
});

test("an in-progress review keeps its order when new clips are already finished", () => {
  assert.deepEqual(
    preservedReviewOrder(["a", "b", "c"], ["b", "a"], ["a", "b", "c"]),
    ["b", "a"],
  );
  assert.equal(preservedReviewOrder(["a", "b", "c"], ["b", "a"], ["a", "b"]), null);
  assert.equal(preservedReviewOrder(["a", "b"], ["b", "a"], ["a", "b"]), null);
});
