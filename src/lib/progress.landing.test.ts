import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROGRESS,
  landingInterviewSlug,
  landingLevelSlug,
  type ContinueLevelCatalogEntry,
  type StoredProgress,
  type Visit,
} from "./progress.js";

const catalog: ContinueLevelCatalogEntry[] = [
  {
    level: "A1.1",
    slug: "a1-1",
    chapters: [{ slug: "a11-l1", label: "Lektion 1", clipCount: 2, videoIds: [] }],
  },
  {
    level: "A1.2",
    slug: "a1-2",
    chapters: [{ slug: "a12-l1", label: "Lektion 1", clipCount: 2, videoIds: [] }],
  },
  {
    level: "A2.1",
    slug: "a2-1",
    chapters: [{ slug: "a21-l1", label: "Lektion 1", clipCount: 2, videoIds: [] }],
  },
];

function withLearn(chapterSlug: string): StoredProgress {
  return {
    ...structuredClone(DEFAULT_PROGRESS),
    learn: {
      [chapterSlug]: {
        currentClipIndex: 1,
        completedClipIds: ["clip"],
        runCount: 0,
        runCompletedClipIds: [],
        reviewedClipIds: [],
        studyRunCount: 0,
      },
    },
  };
}

function visit(endedAt: string, lessons: string[]): Visit {
  return {
    id: endedAt,
    startedAt: endedAt,
    endedAt,
    activeSeconds: 0,
    lessons,
    clips: [],
    exercisesCompleted: 0,
    listeningRuns: 0,
    videos: [],
  };
}

test("landing opens the last level named in the newest visit", () => {
  const progress = withLearn("a21-l1");
  progress.visits = [
    visit("2026-10-02T00:00:00.000Z", ["a2-1/lektion-1"]),
    visit("2026-10-14T00:00:00.000Z", ["a1-1/lektion-2", "interview/koch"]),
  ];
  assert.equal(
    landingLevelSlug(progress, catalog, ["a1-1", "a1-2", "a2-1"]),
    "a1-1",
  );
  assert.equal(landingLevelSlug(progress, catalog, ["a1-2", "a2-1"]), "a2-1");
});

test("landing opens the highest started level when no visit names one", () => {
  const progress = withLearn("a21-l1");
  assert.equal(
    landingLevelSlug(progress, catalog, ["a1-1", "a1-2", "a2-1"]),
    "a2-1",
  );
  assert.equal(landingLevelSlug(progress, catalog, ["a1-1", "a1-2"]), "a1-1");
});

test("landing opens the earliest unlocked level when nothing is started", () => {
  assert.equal(
    landingLevelSlug(DEFAULT_PROGRESS, catalog, ["a1-2", "a2-1"]),
    "a1-2",
  );
  assert.equal(landingLevelSlug(DEFAULT_PROGRESS, catalog, []), null);
});

test("landing interview uses the last started job, else the first", () => {
  const progress: StoredProgress = {
    ...structuredClone(DEFAULT_PROGRESS),
    interview: {
      koch: {
        currentClipIndex: 1,
        completedClipIds: ["a"],
      },
    },
  };
  assert.equal(landingInterviewSlug(progress, ["koch", "baecker"]), "koch");
  assert.equal(landingInterviewSlug(DEFAULT_PROGRESS, ["koch", "baecker"]), "koch");
  assert.equal(landingInterviewSlug(DEFAULT_PROGRESS, []), null);
});
