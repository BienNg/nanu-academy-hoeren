import assert from "node:assert/strict";
import test from "node:test";
import {
  LEARNING_PRACTICE_FAILED,
  LEARNING_STUDY_FINISHED,
  buildLearningBoard,
  type LearningCourseMap,
  type LearningKind,
  type LearningLearner,
  type LearningWindow,
} from "./admin-learning";

const NOW = Date.parse("2026-10-10T12:00:00+07:00");

const COURSE: LearningCourseMap = {
  lessons: new Map([
    [
      "a1/l1",
      { key: "a1/l1", label: "Lektion 1", courseId: "a1", courseLabel: "A1", order: 0, paced: true },
    ],
  ]),
  partsByCourse: new Map([["a1", 40]]),
};

function learner(
  userId: string,
  signup: string | null,
  options: {
    className?: string;
    courseIds?: string[];
    left?: { partNumber: number; at: string; kind?: LearningKind }[];
  } = {},
): LearningLearner {
  return {
    userId,
    displayName: userId,
    email: null,
    className: options.className ?? null,
    classKey: (options.className ?? "").toLowerCase(),
    signupMs: signup ? Date.parse(signup) : null,
    courseIds: options.courseIds ?? ["a1"],
    leftParts: (options.left ?? []).map((entry) => ({
      lessonKey: "a1/l1",
      kind: entry.kind ?? "study",
      partNumber: entry.partNumber,
      at: Date.parse(entry.at),
    })),
  };
}

/** [userId, iso, partNumber, code] */
function windowOf(events: [string, string, number, number?][]): LearningWindow {
  const users: string[] = [];
  const flat: number[] = [];
  for (const [userId, at, partNumber, code] of events) {
    if (!users.includes(userId)) users.push(userId);
    flat.push(
      users.indexOf(userId),
      Math.floor(Date.parse(at) / 60_000),
      0,
      partNumber,
      code ?? LEARNING_STUDY_FINISHED,
    );
  }
  return { ready: true, users, lessons: ["a1/l1"], events: flat, loadedAt: "" };
}

function board(learners: LearningLearner[], window: LearningWindow, windowDays = 30) {
  return buildLearningBoard({
    learners,
    allLearners: learners,
    window,
    course: COURSE,
    windowDays,
    now: NOW,
  });
}

test("activation counts a first part within 48 hours and leaves pending signups out", () => {
  const { activation } = board(
    [
      learner("fast", "2026-10-08T10:00:00+07:00"),
      learner("missed", "2026-10-01T10:00:00+07:00"),
      learner("pending", "2026-10-10T08:00:00+07:00"),
      learner("locked", "2026-10-02T10:00:00+07:00", { courseIds: [] }),
    ],
    windowOf([["fast", "2026-10-08T10:30:00+07:00", 1]]),
  );
  assert.equal(activation.signups, 4);
  assert.equal(activation.activated, 1);
  assert.equal(activation.pending, 1);
  assert.equal(activation.missedWithAccess, 1);
  assert.equal(activation.missedNoAccess, 1);
  assert.equal(activation.rate, 1 / 3);
  assert.equal(activation.medianMinutes, 30);
  assert.equal(activation.buckets.find((bucket) => bucket.key === "1h")?.count, 1);
  assert.equal(activation.noPart, 3);
});

test("pace follows the class schedule, and catch-up needs a week to tell", () => {
  const events: [string, string, number][] = [];
  // Six new parts a day from 4 to 9 October: behind at first, in sync by the 8th.
  let part = 1;
  for (let day = 4; day <= 9; day += 1) {
    for (let index = 0; index < 6; index += 1) {
      events.push(["steady", `2026-10-0${day}T09:0${index}:00+07:00`, part]);
      part += 1;
    }
  }
  events.push(["late", "2026-10-06T09:00:00+07:00", 1], ["late", "2026-10-06T09:10:00+07:00", 2]);
  const { pace } = board(
    [
      learner("steady", "2026-10-01T08:00:00+07:00", { className: "K" }),
      learner("late", "2026-10-05T08:00:00+07:00", { className: "K" }),
    ],
    windowOf(events),
  );
  const steady = pace.students.find((student) => student.userId === "steady");
  const late = pace.students.find((student) => student.userId === "late");
  assert.ok(steady && late);
  assert.equal(steady.courseDay, 10);
  assert.equal(steady.expected, 36);
  assert.equal(steady.done, 36);
  assert.equal(steady.behind, 0);
  assert.equal(steady.onPace, true);
  // The late joiner is held to the class's day 1, not their own signup.
  assert.equal(late.expected, 36);
  assert.equal(late.behind, 34);
  assert.equal(late.daysBehind, 8.5);
  assert.equal(pace.active, 2);
  assert.equal(pace.onPace, 1);
  assert.equal(pace.rate, 0.5);
  assert.equal(pace.catchUp.episodes, 2);
  assert.equal(pace.catchUp.caught, 1);
  assert.equal(pace.catchUp.tooRecent, 1);
  assert.equal(pace.catchUp.rate, 1);
  assert.equal(pace.catchUp.medianDays, 7);
  assert.deepEqual(
    pace.slipByDay.bars.filter((bar) => bar.count > 0).map((bar) => bar.key),
    ["1", "5"],
  );
});

test("continuation and drop-off use part starts, including parts left unfinished", () => {
  const { continuation, dropOff } = board(
    [
      learner("r", "2026-10-01T08:00:00+07:00", {
        left: [{ partNumber: 2, at: "2026-10-09T11:00:00+07:00" }],
      }),
      learner("s", "2026-10-01T08:00:00+07:00", {
        left: [{ partNumber: 2, at: "2026-10-09T12:00:00+07:00" }],
      }),
      learner("t", "2026-10-01T08:00:00+07:00", {
        left: [{ partNumber: 2, at: "2026-10-09T12:30:00+07:00" }],
      }),
    ],
    windowOf([
      ["r", "2026-10-09T09:00:00+07:00", 1],
      ["t", "2026-10-09T13:00:00+07:00", 2, LEARNING_PRACTICE_FAILED],
    ]),
  );
  assert.equal(continuation.continued, 1);
  assert.equal(continuation.eligible, 1);
  assert.equal(continuation.buckets.find((bucket) => bucket.key === "24h")?.count, 1);
  // Three left study part 2. The failed practice part has one starter and stays out.
  assert.deepEqual(
    dropOff.map((row) => [row.key, row.started, row.finished, row.rate]),
    [["a1/l1|study|2", 3, 0, 1]],
  );
});

test("retention counts a part on the exact day after signup, once that day is over", () => {
  const { retention } = board(
    [learner("u", "2026-10-01T08:00:00+07:00")],
    windowOf([
      ["u", "2026-10-01T09:00:00+07:00", 1],
      ["u", "2026-10-02T09:00:00+07:00", 2],
      ["u", "2026-10-08T09:00:00+07:00", 3],
    ]),
  );
  assert.equal(retention.d1.rate, 1);
  assert.equal(retention.d7.rate, 1);
  assert.equal(retention.d30.eligible, 0);
  assert.equal(retention.d30.rate, null);
});
