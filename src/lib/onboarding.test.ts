import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_SKIP_REASON,
  ONBOARDING_STEPS,
  onboardingSkipLine,
  onboardingSkipReasons,
  onboardingState,
  vocabHintLessonSlug,
  vocabListOpenedKey,
  type OnboardingRecord,
} from "./onboarding.js";
import {
  mergeProgress,
  normalizeProgress,
  recordVisitClip,
  recordVisitOnboarding,
  touchVisit,
  type StoredProgress,
} from "./progress.js";

function blank(): StoredProgress {
  return normalizeProgress({});
}

const ALL_FOUND = { course: true, video: true, study: true, practice: true, words: true, jump: true };

const record = (patch: Partial<OnboardingRecord>): OnboardingRecord => ({
  readable: true,
  completedAt: null,
  resetAt: null,
  totalXp: 0,
  ...patch,
});

test("the tour walks course, video, study, practice, vocabulary, then jump", () => {
  assert.deepEqual(
    ONBOARDING_STEPS.map((step) => step.target),
    ["course", "video", "study", "practice", "words", "jump"],
  );
});

test("a learner with no XP and no stamp sees the tour", () => {
  assert.equal(onboardingState(record({})), "pending");
});

test("a stamped learner never sees the tour again", () => {
  assert.equal(onboardingState(record({ completedAt: "2026-10-06T09:00:00.000Z" })), "done");
  assert.equal(
    onboardingState(record({ completedAt: "2026-10-06T09:00:00.000Z", totalXp: 0 })),
    "done",
  );
});

test("a learner with XP counts as onboarded and gets stamped", () => {
  assert.equal(onboardingState(record({ totalXp: 1 })), "earned");
  assert.equal(onboardingState(record({ totalXp: 1200 })), "earned");
});

test("an admin reset shows the tour again, even with XP", () => {
  assert.equal(onboardingState(record({ resetAt: "2026-10-06T10:00:00.000Z", totalXp: 900 })), "pending");
  assert.equal(onboardingState(record({ resetAt: "2026-10-06T10:00:00.000Z", totalXp: null })), "pending");
});

test("finishing after a reset stamps it done again", () => {
  assert.equal(
    onboardingState(
      record({ resetAt: "2026-10-06T10:00:00.000Z", completedAt: "2026-10-06T10:05:00.000Z" }),
    ),
    "done",
  );
});

test("unreadable state hides the tour instead of repeating it forever", () => {
  assert.equal(onboardingState(record({ readable: false })), "done");
  assert.equal(onboardingState(record({ totalXp: null })), "done");
});

test("the vocabulary hint stays on the current lesson that has a list", () => {
  assert.equal(vocabListOpenedKey("user-1"), "nanu-vocab-list-opened:user-1");
  assert.equal(
    vocabHintLessonSlug([
      { slug: "lektion-1", hasList: true, current: false },
      { slug: "lektion-5", hasList: true, current: true },
    ]),
    "lektion-5",
  );
});

test("the vocabulary hint falls back to the first open list", () => {
  assert.equal(
    vocabHintLessonSlug([
      { slug: "lektion-1", hasList: false, current: true },
      { slug: "lektion-2", hasList: true, current: false },
    ]),
    "lektion-2",
  );
  assert.equal(
    vocabHintLessonSlug([{ slug: "lektion-1", hasList: false, current: true }]),
    null,
  );
});

test("a complete map has no skip reasons", () => {
  assert.deepEqual(onboardingSkipReasons(ALL_FOUND, true), []);
});

test("each missing target is named in step order", () => {
  assert.deepEqual(
    onboardingSkipReasons({ ...ALL_FOUND, jump: false, video: false }, true),
    [ONBOARDING_SKIP_REASON.video, ONBOARDING_SKIP_REASON.jump],
  );
});

test("no open Lektion replaces the node reasons", () => {
  assert.deepEqual(
    onboardingSkipReasons(
      { course: true, video: false, study: false, practice: false, words: false, jump: false },
      false,
    ),
    [ONBOARDING_SKIP_REASON.noOpenLesson, ONBOARDING_SKIP_REASON.jump],
  );
});

test("skip lines read as one sentence", () => {
  assert.equal(
    onboardingSkipLine([ONBOARDING_SKIP_REASON.noCourse]),
    "Onboarding skipped because no course is unlocked",
  );
  assert.equal(
    onboardingSkipLine(["a", "b", "c"]),
    "Onboarding skipped because a, b and c",
  );
});

test("a skip is logged on the visit once per reason set", () => {
  const start = new Date("2026-10-06T08:00:00.000Z");
  const later = new Date("2026-10-06T08:05:00.000Z");
  const opened = touchVisit(blank(), start, {});
  const first = recordVisitOnboarding(opened.progress, start, opened.visitId, "skipped", [
    ONBOARDING_SKIP_REASON.noCourse,
  ]);
  const again = recordVisitOnboarding(first.progress, later, first.visitId, "skipped", [
    ONBOARDING_SKIP_REASON.noCourse,
  ]);
  const visit = again.progress.visits?.find((entry) => entry.id === again.visitId);
  assert.equal(again.visitId, opened.visitId);
  assert.deepEqual(visit?.onboarding, [
    { at: start.toISOString(), outcome: "skipped", reasons: [ONBOARDING_SKIP_REASON.noCourse] },
  ]);
});

test("a different reason or a completion adds an entry", () => {
  const start = new Date("2026-10-06T08:00:00.000Z");
  const opened = touchVisit(blank(), start, {});
  const skipped = recordVisitOnboarding(opened.progress, start, opened.visitId, "skipped", [
    ONBOARDING_SKIP_REASON.jump,
  ]);
  const done = recordVisitOnboarding(
    skipped.progress,
    new Date("2026-10-06T08:01:00.000Z"),
    skipped.visitId,
    "completed",
  );
  const visit = done.progress.visits?.find((entry) => entry.id === done.visitId);
  assert.deepEqual(
    visit?.onboarding?.map((entry) => entry.outcome),
    ["skipped", "completed"],
  );
  assert.equal(visit?.onboarding?.[1]?.reasons, undefined);
});

test("onboarding alone keeps a visit idle", () => {
  const start = new Date("2026-10-06T08:00:00.000Z");
  const opened = touchVisit(blank(), start, {});
  const logged = recordVisitOnboarding(opened.progress, start, opened.visitId, "completed");
  const touched = touchVisit(logged.progress, new Date("2026-10-06T08:03:00.000Z"), {
    preferredId: logged.visitId,
    visibleSeconds: 180,
  });
  const visit = touched.progress.visits?.find((entry) => entry.id === touched.visitId);
  assert.equal(visit?.activeSeconds, 0);
  assert.equal(visit?.onboarding?.length, 1);
});

test("onboarding entries survive normalize and merge from two devices", () => {
  const start = new Date("2026-10-06T08:00:00.000Z");
  const opened = touchVisit(blank(), start, { preferredId: "visit-a" });
  const phone = recordVisitOnboarding(opened.progress, start, "visit-a", "skipped", [
    ONBOARDING_SKIP_REASON.noCourse,
  ]).progress;
  const laptop = recordVisitClip(
    recordVisitOnboarding(
      opened.progress,
      new Date("2026-10-06T08:02:00.000Z"),
      "visit-a",
      "skipped",
      [ONBOARDING_SKIP_REASON.noCourse],
    ).progress,
    new Date("2026-10-06T08:02:00.000Z"),
    "visit-a",
    "a1-1/lektion-1",
    "clip-1",
  ).progress;
  const merged = normalizeProgress(
    JSON.parse(JSON.stringify(mergeProgress(phone, laptop))) as Partial<StoredProgress>,
  );
  const visit = merged.visits?.find((entry) => entry.id === "visit-a");
  assert.deepEqual(visit?.onboarding, [
    { at: start.toISOString(), outcome: "skipped", reasons: [ONBOARDING_SKIP_REASON.noCourse] },
  ]);
  assert.equal(visit?.clips.length, 1);
});

test("malformed onboarding entries are dropped", () => {
  const progress = normalizeProgress({
    visits: [
      {
        id: "visit-a",
        startedAt: "2026-10-06T08:00:00.000Z",
        endedAt: "2026-10-06T08:00:00.000Z",
        activeSeconds: 0,
        lessons: [],
        clips: [],
        exercisesCompleted: 0,
        listeningRuns: 0,
        videos: [],
        onboarding: [
          { at: "nope", outcome: "completed" },
          { at: "2026-10-06T08:00:00.000Z", outcome: "maybe" },
          { at: "2026-10-06T08:00:00.000Z", outcome: "completed", reasons: ["ignored"] },
        ],
      },
    ] as unknown as StoredProgress["visits"],
  });
  assert.deepEqual(progress.visits?.[0]?.onboarding, [
    { at: "2026-10-06T08:00:00.000Z", outcome: "completed" },
  ]);
});
