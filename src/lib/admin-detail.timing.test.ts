import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildLessonTimingTrail,
  formatLessonGap,
  projectGrammarWorld,
  projectStudentVisits,
  studentProgressClear,
  type AdminCatalogCourse,
  type LessonStartSignal,
} from "./admin-detail.js";
import { resolveWorld, type StoredWorldArea } from "./grammar-world.js";
import type { TenseTables } from "./grammar-lessons.js";
import { DEFAULT_PROGRESS, normalizeProgress, type LearnProgress, type StoredProgress, type Visit } from "./progress.js";

const grammarTables = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/grammar/tenses.json"), "utf8"),
) as TenseTables;
const grammarAreas = resolveWorld(
  (JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar/world.json"), "utf8")) as { areas: StoredWorldArea[] })
    .areas,
);
const grammarCatalog = grammarAreas.map((area) => ({
  id: area.id,
  topicIds: area.topics.map((topic) => topic.id),
}));

const course: AdminCatalogCourse = {
  id: "a1-1",
  label: "A1.1",
  shortLabel: "A1.1",
  kind: "cefr",
  lessons: [
    {
      id: "a1-1-lektion-1",
      label: "Alphabet",
      learnKey: "lektion-1",
      videoKeyPrefix: "a1-1/lektion-1",
      clips: [{ id: "c1", prompt: "a" }],
      pathNodes: true,
      videos: [],
    },
    {
      id: "a1-1-lektion-2",
      label: "Persona",
      learnKey: "lektion-2",
      videoKeyPrefix: "a1-1/lektion-2",
      clips: [{ id: "c2", prompt: "b" }],
      pathNodes: true,
      videos: [],
    },
  ],
};

function learn(completedAt?: string): LearnProgress {
  return {
    currentClipIndex: 0,
    completedClipIds: [],
    runCount: completedAt ? 1 : 0,
    runCompletedClipIds: [],
    reviewedClipIds: [],
    studyRunCount: 0,
    ...(completedAt ? { completedAt } : {}),
  };
}

function progress(patch: Partial<StoredProgress>): StoredProgress {
  return { ...DEFAULT_PROGRESS, ...patch };
}

test("formats gaps under a minute, then hours and days", () => {
  assert.equal(formatLessonGap(0), "under 1 min");
  assert.equal(formatLessonGap(59_000), "under 1 min");
  assert.equal(formatLessonGap(90 * 60_000), "1h 30m");
  assert.equal(formatLessonGap(26 * 60 * 60_000), "1d 2h");
});

test("Lektion 1 access is the earlier of sign-in and first activity", () => {
  const trail = buildLessonTimingTrail(
    course,
    progress({
      visits: [
        {
          id: "v",
          startedAt: "2026-10-02T03:00:00.000Z",
          endedAt: "2026-10-02T04:00:00.000Z",
          activeSeconds: 10,
          lessons: ["a1-1/lektion-1"],
          clips: [],
          exercisesCompleted: 0,
          listeningRuns: 0,
          videos: [],
        } satisfies Visit,
      ],
    }),
    ["2026-10-01T01:00:00.000Z"],
    [],
  );

  assert.equal(trail[0]?.accessAt, "2026-10-01T01:00:00.000Z");
  assert.equal(trail[0]?.accessApproximate, true);
  assert.equal(trail[0]?.startedAt, null);
  assert.equal(trail[1]?.accessAt, null);
});

test("a later Lektion opens at the previous completion", () => {
  const completedAt = "2026-10-04T12:00:00.000Z";
  const trail = buildLessonTimingTrail(
    course,
    progress({ learn: { "lektion-1": learn(completedAt) } }),
    ["2026-10-01T01:00:00.000Z"],
    [],
  );

  assert.equal(trail[0]?.completedAt, completedAt);
  assert.equal(trail[1]?.accessAt, completedAt);
  assert.equal(trail[1]?.accessApproximate, false);
  assert.equal(trail[1]?.completedAt, null);
});

test("a part-1 study quit is the first-node start, and a later part is not", () => {
  const trail = buildLessonTimingTrail(
    course,
    progress({
      visits: [
        {
          id: "v",
          startedAt: "2026-10-01T02:00:00.000Z",
          endedAt: "2026-10-01T03:00:00.000Z",
          activeSeconds: 10,
          lessons: ["a1-1/lektion-1"],
          clips: [],
          exercisesCompleted: 0,
          listeningRuns: 0,
          videos: [],
          leftSessions: [
            {
              lessonKey: "a1-1/lektion-1",
              kind: "study",
              partNumber: 2,
              partCount: 3,
              clipsDone: 1,
              clipCount: 4,
              startedAt: "2026-10-01T02:10:00.000Z",
              stoppedAt: "2026-10-01T02:20:00.000Z",
            },
            {
              lessonKey: "a1-1/lektion-1",
              kind: "study",
              partNumber: 1,
              partCount: 3,
              clipsDone: 0,
              clipCount: 4,
              startedAt: "2026-10-01T02:00:00.000Z",
              stoppedAt: "2026-10-01T02:05:00.000Z",
            },
          ],
        },
      ],
    }),
    ["2026-10-01T01:00:00.000Z"],
    [],
  );

  assert.equal(trail[0]?.startedAt, "2026-10-01T02:00:00.000Z");
  assert.equal(trail[0]?.waitToStartMs, 60 * 60_000);
  assert.equal(trail[0]?.nodes.find((node) => node.first)?.kind, "study");
});

test("a studied clip before completion counts, and one after completion does not", () => {
  const early: LessonStartSignal = {
    lessonKey: "a1-1/lektion-1",
    studiedAt: "2026-10-01T05:00:00.000Z",
    listeningStartedAt: "2026-10-01T04:00:00.000Z",
  };
  const trail = buildLessonTimingTrail(
    course,
    progress({ learn: { "lektion-1": learn("2026-10-02T00:00:00.000Z") } }),
    ["2026-10-01T01:00:00.000Z"],
    [early],
  );
  assert.equal(trail[0]?.startedAt, early.studiedAt);

  const after = buildLessonTimingTrail(
    course,
    progress({ learn: { "lektion-1": learn("2026-10-02T00:00:00.000Z") } }),
    ["2026-10-01T01:00:00.000Z"],
    [{ lessonKey: "a1-1/lektion-1", studiedAt: "2026-10-03T00:00:00.000Z", listeningStartedAt: null }],
  );
  assert.equal(after[0]?.startedAt, null);
});

test("a listening start is the first node only when that node is practice", () => {
  const drill: AdminCatalogCourse = {
    ...course,
    lessons: [
      {
        id: "a1-1-drill",
        label: "Drill",
        videoKeyPrefix: "a1-1/drill",
        clips: [{ id: "c", prompt: "x" }],
        videos: [],
      },
    ],
  };
  const trail = buildLessonTimingTrail(
    drill,
    progress({}),
    ["2026-10-01T01:00:00.000Z"],
    [
      {
        lessonKey: "a1-1/drill",
        studiedAt: null,
        listeningStartedAt: "2026-10-01T02:30:00.000Z",
      },
    ],
  );
  assert.equal(trail[0]?.nodes.find((node) => node.first)?.kind, "practice");
  assert.equal(trail[0]?.startedAt, "2026-10-01T02:30:00.000Z");
});

test("a start earlier than the previous completion leaves the gap blank", () => {
  const trail = buildLessonTimingTrail(
    course,
    progress({ learn: { "lektion-1": learn("2026-10-04T00:00:00.000Z") } }),
    ["2026-10-01T00:00:00.000Z"],
    [
      {
        lessonKey: "a1-1/lektion-2",
        studiedAt: "2026-10-03T00:00:00.000Z",
        listeningStartedAt: null,
      },
    ],
  );
  assert.equal(trail[1]?.accessAt, "2026-10-04T00:00:00.000Z");
  assert.equal(trail[1]?.startedAt, "2026-10-03T00:00:00.000Z");
  assert.equal(trail[1]?.waitToStartMs, null);
});

test("wrong answers alone are a visit, not an open with no study", () => {
  const log = projectStudentVisits(
    [],
    progress({
      visits: [
        {
          id: "misses",
          startedAt: "2026-10-08T09:06:22.152Z",
          endedAt: "2026-10-08T09:10:26.555Z",
          activeSeconds: 233,
          lessons: [],
          clips: [],
          exercisesCompleted: 0,
          listeningRuns: 0,
          videos: [],
          wrongAttempts: 9,
        } satisfies Visit,
      ],
    }),
    "all",
    new Date("2026-10-08T10:00:00.000Z"),
  );
  const visit = log.visits[0];
  assert.equal(visit?.idle, false);
  assert.equal(visit?.stats.wrongAttempts, 9);
  assert.deepEqual(visit?.lines, ["9 wrong answers"]);
});

test("grammar world projection lists stages and a planted flag", () => {
  const empty = projectGrammarWorld(DEFAULT_PROGRESS, grammarAreas, grammarTables);
  assert.equal(empty.hasProgress, false);
  const area = empty.areas.find((entry) => entry.id === "dong-tu");
  assert.ok(area);
  assert.equal(area.stages.some((stage) => stage.id === "verbkonjugation"), true);

  const played = projectGrammarWorld(
    normalizeProgress({
      grammarWorld: {
        stages: { verbkonjugation: { partKeys: [], nodeEnds: [], reviewRuns: 2 } },
        summits: { "dong-tu": "2026-10-01T00:00:00.000Z" },
      },
    }),
    grammarAreas,
    grammarTables,
  );
  const stage = played.areas.find((entry) => entry.id === "dong-tu")?.stages.find((entry) => entry.id === "verbkonjugation");
  assert.equal(stage?.reviewRuns, 2);
  assert.equal(stage?.hasProgress, true);
  assert.equal(played.areas.find((entry) => entry.id === "dong-tu")?.summitAt, "2026-10-01T00:00:00.000Z");
  assert.equal(played.hasProgress, true);
});

test("grammar world deletes name real stages and areas", () => {
  const at = "2026-10-12T00:00:00.000Z";
  const all = studentProgressClear([], { scope: "grammar-world" }, "clear-grammar-world-1", at, grammarCatalog);
  assert.equal(all?.clear.grammarWorld, true);
  const stage = studentProgressClear(
    [],
    { scope: "grammar-stage", topicId: "verbkonjugation" },
    "clear-grammar-stage1",
    at,
    grammarCatalog,
  );
  assert.deepEqual(stage?.clear.grammarTopics, ["verbkonjugation"]);
  const missing = studentProgressClear(
    [],
    { scope: "grammar-stage", topicId: "no-such-stage" },
    "clear-grammar-missing",
    at,
    grammarCatalog,
  );
  assert.equal(missing, null);
  const area = studentProgressClear([], { scope: "grammar-area", areaId: "dong-tu" }, "clear-grammar-area01", at, grammarCatalog);
  assert.equal(area?.clear.grammarTopics?.includes("verbkonjugation"), true);
  assert.deepEqual(area?.clear.grammarAreas, ["dong-tu"]);
});
