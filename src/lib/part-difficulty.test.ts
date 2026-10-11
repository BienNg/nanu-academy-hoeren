import assert from "node:assert/strict";
import test from "node:test";
import type { LearningCourseMap } from "./admin-learning";
import {
  DIFFICULTY_THRESHOLDS,
  buildPartDifficultyBoard,
  cohortMembers,
  parseCohortInput,
  parsePartChangeInput,
  parsePartLeftInput,
  parsePartStartInput,
  type DifficultyRun,
  type DifficultyStart,
  type PartRow,
} from "./part-difficulty";

const NOW = Date.parse("2026-10-10T12:00:00+07:00");
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

const COURSE: LearningCourseMap = {
  lessons: new Map([
    ["a1/l1", { key: "a1/l1", label: "Lektion 1", courseId: "a1", courseLabel: "A1", order: 0, paced: true }],
    ["a1/l2", { key: "a1/l2", label: "Lektion 2", courseId: "a1", courseLabel: "A1", order: 1, paced: true }],
  ]),
  partsByCourse: new Map([["a1", 20]]),
};

let nextId = 0;
function uuid(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

function run(
  userId: string,
  partNumber: number,
  passed: boolean,
  daysAgo: number,
  options: { accuracy?: number; lessonKey?: string; partCount?: number; cards?: number; elapsedMs?: number; id?: string } = {},
): DifficultyRun {
  return {
    id: options.id ?? uuid(),
    userId,
    lessonKey: options.lessonKey ?? "a1/l1",
    partNumber,
    partCount: options.partCount ?? 3,
    passed,
    accuracy: options.accuracy ?? (passed ? 85 : 40),
    cards: options.cards ?? 10,
    elapsedMs: options.elapsedMs ?? 5 * MIN,
    at: NOW - daysAgo * DAY,
  };
}

function start(
  userId: string,
  partNumber: number,
  daysAgo: number,
  options: { id?: string; cardsDone?: number | null; lessonKey?: string } = {},
): DifficultyStart {
  return {
    id: options.id ?? uuid(),
    userId,
    lessonKey: options.lessonKey ?? "a1/l1",
    partNumber,
    cardCount: 10,
    at: NOW - daysAgo * DAY,
    cardsDone: options.cardsDone ?? null,
  };
}

function board(runs: DifficultyRun[], starts: DifficultyStart[] = [], studyAt = new Map<string, number[]>()) {
  return buildPartDifficultyBoard({
    runs,
    starts,
    clips: [],
    studyAt,
    changes: [],
    course: COURSE,
    behind: new Set(),
    now: NOW,
  });
}

function part(rows: readonly PartRow[], partNumber: number, lessonKey = "a1/l1"): PartRow {
  const found = rows.find((row) => row.lessonKey === lessonKey && row.partNumber === partNumber);
  assert.ok(found, `part ${lessonKey}#${partNumber}`);
  return found;
}

test("tries split at the first pass; replays are counted apart", () => {
  const { parts } = board([
    run("a", 1, false, 5),
    run("a", 1, true, 4),
    run("a", 1, true, 1),
    run("b", 1, true, 3, { accuracy: 100 }),
  ]);
  const stats = part(parts, 1).stats;
  assert.equal(stats.learners, 2);
  assert.equal(stats.runs, 3);
  assert.equal(stats.replays, 1);
  assert.equal(stats.firstTryPass, 0.5);
  assert.equal(stats.firstTryAccuracy, (0.4 + 1) / 2);
  assert.equal(stats.medianTriesToPass, 1.5);
  assert.equal(stats.failRate, 1 / 3);
});

test("a start with no run is abandoned once it is old enough", () => {
  const finished = start("a", 1, 2);
  const { parts } = board(
    [run("a", 1, true, 2, { id: finished.id })],
    [
      finished,
      start("b", 1, 2, { cardsDone: 4 }),
      start("c", 1, 1, { cardsDone: 8 }),
      // Opened a minute ago: may still be playing.
      { ...start("d", 1, 0), at: NOW - MIN },
    ],
  );
  const stats = part(parts, 1).stats;
  assert.equal(stats.starts, 3);
  assert.equal(stats.abandoned, 2);
  assert.equal(stats.abandonRate, 2 / 3);
  assert.ok(Math.abs((stats.quitPoint ?? 0) - 0.6) < 1e-9);
});

test("starts after a pass are replays, not drop-off", () => {
  const { parts } = board([run("a", 1, true, 5)], [start("a", 1, 2)]);
  const stats = part(parts, 1).stats;
  assert.equal(stats.starts, 0);
  assert.equal(stats.abandoned, 0);
});

test("a fail with no study or practice for a week counts as a quit", () => {
  const { parts } = board(
    [run("gone", 1, false, 20), run("back", 1, false, 20), run("fresh", 1, false, 2)],
    [],
    new Map([["back", [NOW - 19 * DAY]]]),
  );
  const stats = part(parts, 1).stats;
  // The fresh fail is under 7 days old and left out.
  assert.equal(stats.failsEligible, 2);
  assert.equal(stats.quitsAfterFail, 1);
  assert.equal(stats.quitAfterFail, 0.5);
});

test("low accuracy flags a part as too hard; few students stay thin", () => {
  const runs: DifficultyRun[] = [];
  for (const user of ["a", "b", "c", "d", "e"]) runs.push(run(user, 1, true, 3, { accuracy: 50 }));
  for (const user of ["a", "b"]) runs.push(run(user, 2, true, 3, { accuracy: 50 }));
  const { parts } = board(runs);
  const hard = part(parts, 1);
  assert.equal(hard.verdict, "too-hard");
  assert.ok(hard.flags.some((flag) => flag.code === "low-accuracy"));
  assert.equal(part(parts, 2).verdict, "thin");
  assert.deepEqual(part(parts, 2).flags, []);
});

test("a part far below its neighbours is a spike", () => {
  const runs: DifficultyRun[] = [];
  const users = ["a", "b", "c", "d", "e"];
  for (const user of users) {
    runs.push(run(user, 1, true, 5, { accuracy: 88 }));
    runs.push(run(user, 2, true, 4, { accuracy: 65 }));
    runs.push(run(user, 3, true, 3, { accuracy: 86 }));
  }
  const { parts } = board(runs);
  const middle = part(parts, 2);
  assert.ok(middle.neighbor.accuracy != null && middle.neighbor.accuracy < -0.2);
  assert.ok(middle.flags.some((flag) => flag.code === "spike"));
  assert.ok(!part(parts, 1).flags.some((flag) => flag.code === "spike"));
});

test("slow and binge parts are judged against the median part", () => {
  const runs: DifficultyRun[] = [];
  const users = ["a", "b", "c", "d", "e"];
  for (const user of users) {
    runs.push(run(user, 1, true, 5, { elapsedMs: 5 * MIN }));
    runs.push(run(user, 2, true, 4, { elapsedMs: 5 * MIN }));
    runs.push(run(user, 3, true, 3, { elapsedMs: 15 * MIN }));
    runs.push(run(user, 1, true, 3, { lessonKey: "a1/l2", elapsedMs: 1 * MIN, accuracy: 100 }));
  }
  const result = board(runs);
  assert.equal(result.courseMsPerCard, 30_000);
  const slow = part(result.parts, 3);
  assert.equal(slow.stats.timeRatio, 3);
  assert.ok(slow.flags.some((flag) => flag.code === "slow"));
  const fast = part(result.parts, 1, "a1/l2");
  assert.equal(fast.stats.binge, 1);
  assert.ok(fast.flags.some((flag) => flag.code === "binge"));
  assert.equal(fast.verdict, "too-easy");
});

test("finishers who never open the next Lektion make a cliff", () => {
  const runs: DifficultyRun[] = [];
  for (const user of ["a", "b", "c", "d", "e", "f"]) runs.push(run(user, 3, true, 20, { partCount: 3 }));
  runs.push(run("a", 1, true, 18, { lessonKey: "a1/l2" }));
  // Finished too recently to judge.
  runs.push(run("g", 3, true, 2, { partCount: 3 }));
  const { continuation } = board(runs);
  assert.equal(continuation.length, 1);
  const row = continuation[0];
  assert.equal(row.finishers, 6);
  assert.equal(row.continued, 1);
  assert.equal(row.cliff, true);
});

test("before/after compares same-length windows around the change day", () => {
  const changedOn = "2026-10-01";
  const runs: DifficultyRun[] = [
    run("a", 1, false, 15, { accuracy: 40 }),
    run("b", 1, true, 12, { accuracy: 70 }),
    run("c", 1, true, 5, { accuracy: 90 }),
    run("d", 1, true, 4, { accuracy: 100 }),
    // Older than the before window (9 days each side).
    run("e", 1, true, 40, { accuracy: 10 }),
  ];
  const result = buildPartDifficultyBoard({
    runs,
    starts: [],
    clips: [],
    studyAt: new Map(),
    changes: [{ id: "x", lessonKey: "a1/l1", partNumber: 1, changedOn, note: "Split in two", createdBy: null, createdAt: null }],
    course: COURSE,
    behind: new Set(),
    now: NOW,
  });
  const [comparison] = result.changes;
  assert.equal(comparison.days, 9);
  assert.equal(comparison.before?.learners, 2);
  assert.equal(comparison.before?.firstTryAccuracy, 0.55);
  assert.equal(comparison.after?.learners, 2);
  assert.equal(comparison.after?.firstTryAccuracy, 0.95);
});

test("behind-pace students whose open part is this one are counted", () => {
  const runs: DifficultyRun[] = [];
  for (const user of ["a", "b", "c", "d"]) runs.push(run(user, 1, true, 6), run(user, 2, false, 2));
  runs.push(run("e", 1, true, 6), run("e", 2, true, 1));
  const result = buildPartDifficultyBoard({
    runs,
    starts: [],
    clips: [],
    studyAt: new Map(),
    changes: [],
    course: COURSE,
    behind: new Set(["a", "b", "c"]),
    now: NOW,
  });
  const stuck = part(result.parts, 2);
  assert.equal(stuck.stats.openHere, 4);
  assert.equal(stuck.stats.behindHere, 3);
  assert.ok(stuck.flags.some((flag) => flag.code === "behind-pace"));
});

test("clip outcomes flag a part with one hard clip", () => {
  const runs = ["a", "b", "c", "d", "e"].map((user) => run(user, 1, true, 3));
  const result = buildPartDifficultyBoard({
    runs,
    starts: [],
    clips: [
      { lessonKey: "a1/l1", partNumber: 1, clipId: "hard", answers: 10, misses: 6, students: 5 },
      { lessonKey: "a1/l1", partNumber: 1, clipId: "fine", answers: 10, misses: 1, students: 5 },
      { lessonKey: "a1/l1", partNumber: 1, clipId: "rare", answers: 2, misses: 2, students: 2 },
    ],
    studyAt: new Map(),
    changes: [],
    course: COURSE,
    behind: new Set(),
    now: NOW,
  });
  const row = part(result.parts, 1);
  assert.equal(row.stats.hardClips, 1);
  assert.equal(row.stats.worstClips[0].clipId, "hard");
  assert.ok(row.flags.some((flag) => flag.code === "hard-clip"));
});

test("start, left, cohort, and change inputs are validated", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  assert.deepEqual(parsePartStartInput({ id, lessonKey: "a1/l1", partNumber: 2, partCount: 3, cardCount: 12 }), {
    id,
    lessonKey: "a1/l1",
    partNumber: 2,
    partCount: 3,
    cardCount: 12,
  });
  assert.equal(parsePartStartInput({ id, lessonKey: "a1/l1", partNumber: 4, partCount: 3, cardCount: 12 }), null);
  assert.equal(parsePartStartInput({ id: "nope", lessonKey: "a1/l1", partNumber: 1, partCount: 3, cardCount: 1 }), null);
  assert.deepEqual(parsePartLeftInput({ id, cardsDone: 3 }), { id, cardsDone: 3 });
  assert.equal(parsePartLeftInput({ id, cardsDone: -1 }), null);

  assert.deepEqual(parseCohortInput({ name: "  Spring  2026 ", classes: ["A1-01", "a1-01", " B "] }), {
    id: null,
    name: "Spring 2026",
    classes: ["A1-01", "B"],
  });
  assert.equal(parseCohortInput({ name: "Empty", classes: [] }), null);
  assert.equal(parseCohortInput({ name: "", classes: ["A"] }), null);

  assert.deepEqual(parsePartChangeInput({ lessonKey: "a1/l1", partNumber: 2, changedOn: "2026-10-01", note: " hint " }), {
    lessonKey: "a1/l1",
    partNumber: 2,
    changedOn: "2026-10-01",
    note: "hint",
  });
  assert.equal(parsePartChangeInput({ lessonKey: "a1/l1", partNumber: 2, changedOn: "1 Oct" }), null);
});

test("cohort members match classes case-insensitively", () => {
  const ids = cohortMembers(
    { classes: ["A1-01", "b2"] },
    [
      { userId: "x", className: "a1-01" },
      { userId: "y", className: "B2" },
      { userId: "z", className: "C1" },
      { userId: "w", className: null },
    ],
    (name) => (name ?? "").trim().toLowerCase(),
  );
  assert.deepEqual([...ids].sort(), ["x", "y"]);
  assert.equal(DIFFICULTY_THRESHOLDS.minLearners, 5);
});
