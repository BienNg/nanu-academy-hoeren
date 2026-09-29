import assert from "node:assert/strict";
import test from "node:test";
import {
  commitAdminProgressClear,
  mergeProgress,
  normalizeProgress,
  progressKeepingServerClears,
  type AdminProgressClear,
  type StoredProgress,
} from "./progress.js";

const AT = "2026-09-29T03:00:00.000Z";

function learned(): StoredProgress {
  return normalizeProgress({
    learn: {
      "lektion-4": {
        currentClipIndex: 2,
        completedClipIds: ["clip-a", "clip-b"],
        runCount: 1,
        runCompletedClipIds: ["clip-a"],
        reviewedClipIds: ["clip-a"],
        studyRunCount: 1,
        studyCompletedAt: "2026-09-20T00:00:00.000Z",
        completedAt: "2026-09-21T00:00:00.000Z",
      },
      "lektion-5": {
        currentClipIndex: 1,
        completedClipIds: ["other"],
        runCount: 1,
        runCompletedClipIds: [],
        reviewedClipIds: [],
        studyRunCount: 0,
        completedAt: "2026-09-22T00:00:00.000Z",
      },
    },
    videos: {
      "a1-1/lektion-4/vid": {
        positionSeconds: 12,
        updatedAt: AT,
        watchedAt: AT,
      },
      "a1-1/lektion-5/vid": {
        positionSeconds: 4,
        updatedAt: AT,
      },
    },
    interview: {
      koch: {
        currentClipIndex: 2,
        completedClipIds: ["shared", "own"],
        completedAt: "2026-09-18T00:00:00.000Z",
      },
    },
    visits: [
      {
        id: "visit-1",
        startedAt: "2026-09-28T10:00:00.000Z",
        endedAt: "2026-09-28T10:20:00.000Z",
        activeSeconds: 600,
        lessons: ["a1-1/lektion-4", "a1-1/lektion-5"],
        clips: [
          { lessonKey: "a1-1/lektion-4", clipId: "clip-a" },
          { lessonKey: "a1-1/lektion-5", clipId: "other" },
        ],
        exercisesCompleted: 3,
        listeningRuns: 1,
        videos: [
          {
            key: "a1-1/lektion-4/vid",
            title: "Video",
            seconds: 30,
            leftAtSeconds: 30,
            watched: true,
          },
        ],
        exerciseLessons: [
          { lessonKey: "a1-1/lektion-4", completed: 2, fullRuns: 1 },
          { lessonKey: "a1-1/lektion-5", completed: 1, fullRuns: 0 },
        ],
      },
    ],
  });
}

const lessonClear: AdminProgressClear = {
  id: "clear-lesson-4",
  at: AT,
  scope: "scoped",
  learn: [
    {
      key: "lektion-4",
      clipIds: ["clip-a", "clip-b"],
      study: true,
      listening: true,
    },
  ],
  videoPrefixes: ["a1-1/lektion-4/"],
  visitLessons: ["a1-1/lektion-4"],
  visitStudy: true,
  visitListening: true,
  visitVideo: true,
};

test("deleting a Lektion removes its study, listening, and video only", () => {
  const next = commitAdminProgressClear(learned(), lessonClear);
  assert.equal(next.learn["lektion-4"], undefined);
  assert.deepEqual(next.learn["lektion-5"]?.completedClipIds, ["other"]);
  assert.equal(next.videos["a1-1/lektion-4/vid"], undefined);
  assert.equal(next.videos["a1-1/lektion-5/vid"]?.positionSeconds, 4);
  assert.equal(next.adminClearAck, undefined);
  const visit = next.visits?.[0];
  assert.deepEqual(
    visit?.clips.map((clip) => clip.clipId),
    ["other"],
  );
  assert.equal(visit?.exercisesCompleted, 1);
  assert.equal(visit?.listeningRuns, 0);
  assert.equal(visit?.videos.length, 0);
  assert.deepEqual(visit?.lessons, ["a1-1/lektion-5"]);
});

test("deleting study keeps listening on the same Lektion", () => {
  const next = commitAdminProgressClear(learned(), {
    id: "clear-study-4",
    at: AT,
    scope: "scoped",
    learn: [{ key: "lektion-4", clipIds: ["clip-a", "clip-b"], study: true, listening: false }],
  });
  const entry = next.learn["lektion-4"];
  assert.deepEqual(entry?.completedClipIds, ["clip-a", "clip-b"]);
  assert.equal(entry?.completedAt, "2026-09-21T00:00:00.000Z");
  assert.deepEqual(entry?.reviewedClipIds, []);
  assert.equal(entry?.studyRunCount, 0);
  assert.equal(entry?.studyCompletedAt, undefined);
});

test("a device merge cannot restore progress an admin deleted", () => {
  const stored = commitAdminProgressClear(learned(), lessonClear);
  const device = learned();
  const synced = mergeProgress(device, stored);
  assert.equal(synced.learn["lektion-4"], undefined);
  assert.deepEqual(synced.learn["lektion-5"]?.completedClipIds, ["other"]);
  assert.equal(synced.videos["a1-1/lektion-4/vid"], undefined);
  assert.deepEqual(synced.adminClearAck, ["clear-lesson-4"]);

  const redone = normalizeProgress({
    ...synced,
    learn: {
      ...synced.learn,
      "lektion-4": {
        currentClipIndex: 1,
        completedClipIds: ["clip-a"],
        runCount: 0,
        runCompletedClipIds: ["clip-a"],
        reviewedClipIds: [],
        studyRunCount: 0,
      },
    },
  });
  const storedAcked = normalizeProgress({
    ...stored,
    adminClears: synced.adminClears,
    adminClearAck: synced.adminClearAck,
  });
  const again = mergeProgress(storedAcked, redone);
  assert.deepEqual(again.learn["lektion-4"]?.completedClipIds, ["clip-a"]);
});

test("a learner upload cannot add or drop an admin clear", () => {
  const stored = commitAdminProgressClear(learned(), lessonClear);
  const forged = commitAdminProgressClear(learned(), {
    id: "forged-all-1",
    at: AT,
    scope: "all",
  });
  const incoming = progressKeepingServerClears(
    normalizeProgress({
      ...learned(),
      adminClears: forged.adminClears,
      adminClearAck: ["clear-lesson-4"],
    }),
    stored,
  );
  const merged = mergeProgress(stored, incoming);
  assert.deepEqual(
    merged.adminClears?.map((clear) => clear.id),
    ["clear-lesson-4"],
  );
  assert.equal(merged.learn["lektion-4"], undefined);
  assert.ok(merged.learn["lektion-5"]);
});

test("deleting all progress keeps the account marker and drops history", () => {
  const next = commitAdminProgressClear(learned(), {
    id: "clear-all-student",
    at: AT,
    scope: "all",
  });
  assert.equal(next.learn["lektion-4"], undefined);
  assert.equal(next.learn["lektion-5"], undefined);
  assert.equal(next.videos["a1-1/lektion-4/vid"], undefined);
  assert.equal(next.interview.koch?.completedClipIds.length ?? 0, 0);
  assert.equal(next.visits, undefined);
  assert.equal(next.streakDays, 0);
  assert.deepEqual(
    next.adminClears?.map((clear) => clear.id),
    ["clear-all-student"],
  );
});

test("deleting one Ausbildung lesson keeps the other lesson's clips", () => {
  const next = commitAdminProgressClear(learned(), {
    id: "clear-koch-own",
    at: AT,
    scope: "scoped",
    interview: [{ slug: "koch", clipIds: ["own"] }],
  });
  assert.deepEqual(next.interview.koch?.completedClipIds, ["shared"]);
  assert.equal(next.interview.koch?.completedAt, undefined);
});
