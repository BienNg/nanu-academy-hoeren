import assert from "node:assert/strict";
import test from "node:test";
import {
  VISIT_IDLE_MS,
  describeVisitSignal,
  formatActiveDuration,
  mergeProgress,
  normalizeProgress,
  recordVisitClip,
  recordVisitExercise,
  recordVisitListeningRun,
  recordVisitVideo,
  summarizeVisits,
  todayIsoDate,
  touchVisit,
  videoPlayedSeconds,
  type StoredProgress,
} from "./progress.js";

function blank(): StoredProgress {
  return normalizeProgress({});
}

test("a fresh progress document has no fabricated visits", () => {
  const progress = normalizeProgress({
    learn: {
      "lektion-4": {
        currentClipIndex: 1,
        completedClipIds: ["clip-1"],
        runCount: 2,
        runCompletedClipIds: ["clip-1"],
        reviewedClipIds: ["clip-1"],
        studyRunCount: 1,
      },
    },
  });
  assert.equal(progress.visits, undefined);
  assert.equal(progress.learn["lektion-4"]?.runCount, 2);
});

test("hidden time is skipped and a 15 minute gap starts a new visit", () => {
  const start = new Date("2026-09-24T10:00:00.000Z");
  let result = touchVisit(blank(), start, { preferredId: "visit-a", visibleSeconds: 0 });
  result = touchVisit(result.progress, new Date(start.getTime() + 60_000), {
    preferredId: result.visitId,
    visibleSeconds: 60,
  });
  result = touchVisit(result.progress, new Date(start.getTime() + 6 * 60_000), {
    preferredId: result.visitId,
    visibleSeconds: 60,
  });

  assert.equal(result.progress.visits?.length, 1);
  assert.equal(result.progress.visits?.[0]?.activeSeconds, 120);

  const splitAt = new Date(start.getTime() + 6 * 60_000 + VISIT_IDLE_MS + 60_000);
  const split = touchVisit(result.progress, splitAt, {
    preferredId: result.visitId,
    visibleSeconds: 30,
  });
  assert.equal(split.progress.visits?.length, 2);
  assert.notEqual(split.visitId, result.visitId);
  const older = split.progress.visits?.find((visit) => visit.id === "visit-a");
  const newer = split.progress.visits?.find((visit) => visit.id === split.visitId);
  assert.equal(older?.activeSeconds, 120);
  assert.equal(newer?.activeSeconds, 0);
});

test("merging the same visit keeps the higher counts once", () => {
  const start = new Date("2026-09-24T10:00:00.000Z");
  let left = touchVisit(blank(), start, { preferredId: "shared", visibleSeconds: 0 });
  left = recordVisitExercise(left.progress, start, "shared", "a1-1/lektion-4");
  left = recordVisitExercise(left.progress, start, "shared", "a1-1/lektion-4");
  left = recordVisitClip(left.progress, start, "shared", "a1-1/lektion-4", "clip-1");
  left = touchVisit(left.progress, new Date(start.getTime() + 30_000), {
    preferredId: "shared",
    visibleSeconds: 30,
  });

  let right = touchVisit(blank(), start, { preferredId: "shared", visibleSeconds: 0 });
  for (let count = 0; count < 5; count += 1) {
    right = recordVisitExercise(right.progress, start, "shared", "a1-1/lektion-4");
  }
  right = recordVisitClip(right.progress, start, "shared", "a1-1/lektion-4", "clip-2");
  right = recordVisitListeningRun(right.progress, start, "shared", "a1-1/lektion-4");
  right = touchVisit(right.progress, new Date(start.getTime() + 80_000), {
    preferredId: "shared",
    visibleSeconds: 80,
  });

  const merged = mergeProgress(left.progress, right.progress);
  assert.equal(merged.visits?.length, 1);
  const visit = merged.visits?.[0];
  assert.equal(visit?.exercisesCompleted, 5);
  assert.equal(visit?.listeningRuns, 1);
  assert.equal(visit?.activeSeconds, 80);
  assert.deepEqual(
    visit?.clips.map((clip) => clip.clipId).sort(),
    ["clip-1", "clip-2"],
  );

  const other = touchVisit(blank(), start, { preferredId: "other", visibleSeconds: 0 });
  const both = mergeProgress(merged, other.progress);
  assert.equal(both.visits?.length, 2);
});

test("a seek longer than about 2 seconds is not watch time", () => {
  let played = 0;
  let cursor: number | null = 10;
  for (const sample of [10.25, 10.5, 40, 40.25, 40.5]) {
    played += videoPlayedSeconds(cursor, sample);
    cursor = sample;
  }
  assert.ok(played > 0);
  assert.ok(played < 2);

  assert.equal(videoPlayedSeconds(10, 12), 2);
  assert.equal(videoPlayedSeconds(12, 10), 0);
  assert.equal(videoPlayedSeconds(null, 30), 0);

  const start = new Date("2026-09-24T10:00:00.000Z");
  const opened = touchVisit(blank(), start, { preferredId: "video", visibleSeconds: 0 });
  const recorded = recordVisitVideo(opened.progress, start, "video", {
    key: "a1-1/lektion-4/abc",
    title: "Grammar",
    addSeconds: played,
    leftAtSeconds: 40.5,
    durationSeconds: 12 * 60,
  });
  const video = recorded.progress.visits?.[0]?.videos[0];
  assert.equal(video?.title, "Grammar");
  assert.ok((video?.seconds ?? 0) > 0);
  assert.ok((video?.seconds ?? 0) < 2);
  assert.equal(video?.watched, false);
});

test("aged-out visits roll into the daily activity map without dropping counts", () => {
  const now = new Date();
  const started = new Date(now.getTime() - 100 * 86_400_000);
  let result = touchVisit(blank(), started, { preferredId: "old", visibleSeconds: 0 });
  result = touchVisit(result.progress, new Date(started.getTime() + 120_000), {
    preferredId: "old",
    visibleSeconds: 120,
  });
  result = recordVisitClip(result.progress, started, "old", "a1-1/lektion-4", "clip-1");
  result = recordVisitExercise(result.progress, started, "old", "a1-1/lektion-4");
  result = recordVisitVideo(result.progress, started, "old", {
    key: "a1-1/lektion-4/abc",
    title: "Grammar",
    addSeconds: 90,
    leftAtSeconds: 90,
  });

  const normalized = normalizeProgress(result.progress);
  const day = started.toISOString().slice(0, 10);
  assert.equal(normalized.visits, undefined);
  assert.equal(normalized.activity?.[day]?.clips, 1);
  assert.equal(normalized.activity?.[day]?.exercises, 1);
  assert.equal(normalized.activity?.[day]?.videoSeconds, 90);
  assert.ok((normalized.activity?.[day]?.activeSeconds ?? 0) >= 120);

  const summary = summarizeVisits(normalized, "all", now);
  assert.equal(summary.visitCount, 0);
  assert.equal(summary.clipCount, 1);
  assert.equal(summary.exercisesCompleted, 1);
  assert.equal(summary.videoSeconds, 90);

  const again = normalizeProgress(normalized);
  assert.equal(again.activity?.[day]?.clips, 1);
  assert.equal(again.activity?.[day]?.exercises, 1);
});

test("daily activity keeps the max of each field", () => {
  const day = todayIsoDate(new Date());
  const left = normalizeProgress({
    activity: {
      [day]: {
        studyRuns: 2,
        practiceRuns: 1,
        clips: 4,
        exercises: 3,
        videoSeconds: 20,
        activeSeconds: 60,
      },
    },
  });
  const right = normalizeProgress({
    activity: {
      [day]: {
        studyRuns: 1,
        practiceRuns: 4,
        clips: 2,
        exercises: 8,
        videoSeconds: 5,
        activeSeconds: 100,
      },
    },
  });
  const merged = mergeProgress(left, right).activity?.[day];
  assert.equal(merged?.studyRuns, 2);
  assert.equal(merged?.practiceRuns, 4);
  assert.equal(merged?.clips, 4);
  assert.equal(merged?.exercises, 8);
  assert.equal(merged?.videoSeconds, 20);
  assert.equal(merged?.activeSeconds, 100);
});

test("range totals follow today, 7 days, and all time", () => {
  const now = new Date("2026-09-24T15:00:00.000Z");
  const older = new Date("2026-09-14T10:00:00.000Z");
  let result = touchVisit(blank(), older, { preferredId: "older", visibleSeconds: 0 });
  result = recordVisitClip(result.progress, older, "older", "a1-1/lektion-1", "old-clip");
  result = touchVisit(result.progress, now, { preferredId: "today", visibleSeconds: 0 });
  result = recordVisitClip(result.progress, now, "today", "a1-1/lektion-4", "new-clip");
  result = touchVisit(result.progress, new Date(now.getTime() + 60_000), {
    preferredId: "today",
    visibleSeconds: 60,
  });

  const today = summarizeVisits(result.progress, "today", now);
  assert.equal(today.visitCount, 1);
  assert.equal(today.clipCount, 1);
  assert.equal(today.activeSeconds, 60);

  const week = summarizeVisits(result.progress, "7d", now);
  assert.equal(week.visitCount, 1);
  assert.equal(week.clipCount, 1);

  const all = summarizeVisits(result.progress, "all", now);
  assert.equal(all.visitCount, 2);
  assert.equal(all.clipCount, 2);
});

test("visit signals use one line and the measured gap", () => {
  assert.equal(
    describeVisitSignal({
      daysSincePrevious: 12,
      unfinishedLessonVisits: 3,
      abandonedVideo: { playedSeconds: 120, durationSeconds: 12 * 60 },
    }),
    "Back after 12 days",
  );
  assert.equal(
    describeVisitSignal({
      daysSincePrevious: 2,
      unfinishedLessonVisits: 3,
      abandonedVideo: null,
    }),
    "Same Lektion, third visit, still not finished",
  );
  assert.equal(
    describeVisitSignal({
      daysSincePrevious: null,
      unfinishedLessonVisits: null,
      abandonedVideo: { playedSeconds: 120, durationSeconds: 12 * 60 },
    }),
    "Played 2 min of a 12 min video and left",
  );
  assert.equal(formatActiveDuration(2 * 3600 + 14 * 60), "2 h 14 min");
  assert.equal(formatActiveDuration(38 * 60), "38 min");
});
