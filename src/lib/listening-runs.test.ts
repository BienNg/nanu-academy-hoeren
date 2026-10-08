import assert from "node:assert/strict";
import test from "node:test";
import type { CardKind } from "./card-kinds.js";
import {
  CLIP_RANK_LIMIT,
  buildListeningRunRecord,
  clipOutcomeTotalFromRow,
  clipResultsForCardDeck,
  clipResultsForFinishedPart,
  isListeningSchemaMissing,
  parseListeningRunInput,
  placeListeningRuns,
  rankClipOutcomes,
  storedListeningRunFromRow,
  type ClipOutcomeTotal,
  type StoredListeningRun,
} from "./listening-runs.js";

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function successBody(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    lessonKey: "a1-1/lektion-4",
    partNumber: 1,
    partCount: 1,
    outcome: "success",
    accuracy: 100,
    answeredCount: 1,
    clipCount: 1,
    elapsedMs: 1_000,
    clips: [{ clipId: "clip-a", passed: true, missed: false }],
    ...overrides,
  };
}

test("a passed part keeps misses that were corrected", () => {
  const run = buildListeningRunRecord({
    lessonKey: "a1-1/lektion-4",
    partNumber: 2,
    partCount: 3,
    failed: false,
    accuracy: 67,
    clipCount: 3,
    elapsedMs: 120_000,
    clips: [{ id: "a" }, { id: "b" }, { id: "c" }],
    missedClipIds: new Set(["b"]),
    clipIndex: 2,
  });
  assert.ok(run);
  assert.equal(run.outcome, "success");
  assert.equal(run.answeredCount, 3);
  assert.deepEqual(run.clips, [
    { clipId: "a", passed: true, missed: false },
    { clipId: "b", passed: true, missed: true },
    { clipId: "c", passed: true, missed: false },
  ]);
});

test("running out of hearts records only the clips reached", () => {
  const run = buildListeningRunRecord({
    lessonKey: "a1-1/lektion-4",
    partNumber: 1,
    partCount: 2,
    failed: true,
    accuracy: 50,
    clipCount: 4,
    elapsedMs: 40_000,
    clips: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    missedClipIds: new Set(["a", "c"]),
    clipIndex: 2,
  });
  assert.ok(run);
  assert.equal(run.outcome, "fail");
  assert.equal(run.answeredCount, 3);
  assert.equal(run.clipCount, 4);
  assert.deepEqual(run.clips, [
    { clipId: "a", passed: true, missed: true },
    { clipId: "b", passed: true, missed: false },
    { clipId: "c", passed: false, missed: true },
  ]);
});

test("misses still waiting in the queue count as failed", () => {
  const clips = clipResultsForFinishedPart(
    [{ id: "c" }, { id: "a" }, { id: "b" }],
    new Set(["a", "b", "c"]),
    true,
    0,
  );
  assert.deepEqual(clips, [
    { clipId: "c", passed: false, missed: true },
    { clipId: "a", passed: false, missed: true },
    { clipId: "b", passed: false, missed: true },
  ]);
});

test("the first clip can end the part", () => {
  const clips = clipResultsForFinishedPart(
    [{ id: "a" }, { id: "b" }],
    new Set(["a"]),
    true,
    0,
  );
  assert.deepEqual(clips, [{ clipId: "a", passed: false, missed: true }]);
});

test("parse accepts a finished part and rejects a mismatched outcome", () => {
  assert.equal(parseListeningRunInput(successBody())?.cardCount, undefined);
  assert.equal(parseListeningRunInput(successBody({ cardCount: 4 }))?.cardCount, 4);
  assert.equal(parseListeningRunInput(successBody({ cardCount: 0 })), null);
  assert.equal(
    parseListeningRunInput(
      successBody({
        outcome: "fail",
        clips: [{ clipId: "clip-a", passed: true, missed: false }],
      }),
    ),
    null,
  );
  assert.equal(
    parseListeningRunInput(
      successBody({
        clips: [{ clipId: "clip-a", passed: false, missed: true }],
      }),
    ),
    null,
  );
  assert.equal(parseListeningRunInput(successBody({ lessonKey: "not a lesson" })), null);
  assert.equal(parseListeningRunInput(successBody({ accuracy: 101 })), null);
  assert.equal(
    parseListeningRunInput(
      successBody({
        clips: [
          { clipId: "clip-a", passed: true, missed: false },
          { clipId: "clip-a", passed: true, missed: false },
        ],
        answeredCount: 2,
        clipCount: 2,
      }),
    ),
    null,
  );
});

test("a missed card keeps the kinds that were wrong", () => {
  const deck = [
    { clip: { id: "c1" } },
    { clip: { id: "c1" } },
    { clip: { id: "c2" } },
  ];
  const kinds = new Map<string, Set<CardKind>>([
    ["c1", new Set<CardKind>(["order", "listening"])],
    ["c2", new Set<CardKind>(["vi-input"])],
  ]);
  const results = clipResultsForCardDeck(deck, new Set(["c1"]), false, deck.length - 1, kinds);
  assert.deepEqual(results, [
    { clipId: "c1", passed: true, missed: true, missedKinds: ["listening", "order"] },
    { clipId: "c2", passed: true, missed: false },
  ]);
  const parsed = parseListeningRunInput(
    successBody({
      answeredCount: 2,
      clipCount: 2,
      clips: results,
    }),
  );
  assert.ok(parsed);
  assert.deepEqual(parsed.clips[0]?.missedKinds, ["listening", "order"]);
  assert.equal(parsed.clips[1]?.missedKinds, undefined);
});

test("the first wrong try is kept with the right answer", () => {
  const deck = [{ clip: { id: "c1" } }, { clip: { id: "c2" } }];
  const answers = new Map([
    [
      "c1",
      {
        listening: { entered: "  redn  ", correct: "reden" },
        "reply-choice": { entered: "Tschüss", correct: "Hallo" },
        order: { entered: "", correct: "reden" },
      },
    ],
  ]);
  const results = clipResultsForCardDeck(
    deck,
    new Set(["c1"]),
    false,
    deck.length - 1,
    new Map([["c1", new Set<CardKind>(["listening", "multiple-choice"])]]),
    answers,
  );
  assert.deepEqual(results[0]?.missedAnswers, {
    listening: { entered: "redn", correct: "reden" },
    "reply-choice": { entered: "Tschüss", correct: "Hallo" },
  });
  assert.equal(results[1]?.missedAnswers, undefined);
  const parsed = parseListeningRunInput(
    successBody({
      answeredCount: 2,
      clipCount: 2,
      clips: results,
    }),
  );
  assert.deepEqual(parsed?.clips[0]?.missedAnswers?.listening, {
    entered: "redn",
    correct: "reden",
  });
});

test("a stored row keeps clip order", () => {
  const run = storedListeningRunFromRow({
    id: RUN_ID,
    lesson_key: "a1-1/lektion-4",
    part_number: 1,
    part_count: 2,
    outcome: "fail",
    accuracy: 0,
    answered_count: 2,
    clip_count: 4,
    elapsed_ms: 5_000,
    card_count: 9,
    created_at: "2026-09-27T06:00:00.000Z",
    clip_results: [
      { clip_id: "second", passed: false, missed: true, position: 1 },
      {
        clip_id: "first",
        passed: true,
        missed: true,
        position: 0,
        missed_kinds: ["order", "nope"],
        missed_answers: {
          order: { entered: "bleiben reden", correct: "reden bleiben" },
          nope: { entered: "x", correct: "y" },
          listening: { entered: " ", correct: "reden" },
        },
      },
    ],
  });
  assert.ok(run);
  assert.equal(run.createdAt, "2026-09-27T06:00:00.000Z");
  assert.equal(run.cardCount, 9);
  assert.deepEqual(
    run.clips.map((clip) => clip.clipId),
    ["first", "second"],
  );
  assert.deepEqual(run.clips[0]?.missedKinds, ["order"]);
  assert.deepEqual(run.clips[0]?.missedAnswers, {
    order: { entered: "bleiben reden", correct: "reden bleiben" },
  });
  assert.equal(run.clips[1]?.missedKinds, undefined);
});

test("clip totals coerce database counts", () => {
  assert.deepEqual(
    clipOutcomeTotalFromRow({
      lesson_key: "a1-1/lektion-1",
      clip_id: "hallo",
      failures: "2",
      successes: 5,
      students_failed: "1",
      students_passed: 3,
    }),
    {
      lessonKey: "a1-1/lektion-1",
      clipId: "hallo",
      failures: 2,
      successes: 5,
      studentsFailed: 1,
      studentsPassed: 3,
    },
  );
  assert.equal(clipOutcomeTotalFromRow({ lesson_key: "", clip_id: "x" }), null);
});

test("rankings keep the clips students miss and clear most", () => {
  const rows: ClipOutcomeTotal[] = Array.from({ length: CLIP_RANK_LIMIT + 1 }, (_, index) => ({
    lessonKey: "a1-1/lektion-1",
    clipId: `clip-${index}`,
    failures: index,
    successes: CLIP_RANK_LIMIT - index,
    studentsFailed: 1,
    studentsPassed: 1,
  }));
  const ranked = rankClipOutcomes(rows);
  assert.equal(ranked.failed.length, CLIP_RANK_LIMIT);
  assert.equal(ranked.failed[0]?.clipId, `clip-${CLIP_RANK_LIMIT}`);
  assert.equal(ranked.succeeded[0]?.clipId, "clip-0");
  assert.equal(
    ranked.failed.some((row) => row.clipId === "clip-0"),
    false,
  );
  assert.equal(
    ranked.succeeded.some((row) => row.clipId === `clip-${CLIP_RANK_LIMIT}`),
    false,
  );
});

test("practice parts land on the visit that was open, including a late save", () => {
  const run = (id: string, createdAt: string): StoredListeningRun => ({
    id,
    lessonKey: "a1-1/lektion-2",
    partNumber: 2,
    partCount: 9,
    outcome: "fail",
    accuracy: 25,
    answeredCount: 4,
    clipCount: 12,
    elapsedMs: 60_000,
    clips: [],
    createdAt,
  });
  const visits = [
    {
      id: "today",
      startedAt: "2026-10-08T09:06:00.000Z",
      endedAt: "2026-10-08T09:20:00.000Z",
    },
  ];
  const placed = placeListeningRuns(visits, [
    run("inside", "2026-10-08T09:10:00.000Z"),
    run("late", "2026-10-08T09:22:00.000Z"),
    run("next-day", "2026-10-08T12:00:00.000Z"),
  ]);
  assert.deepEqual(
    placed.byVisitId.get("today")?.map((entry) => entry.id),
    ["late", "inside"],
  );
  assert.deepEqual(
    placed.unmatched.map((entry) => entry.id),
    ["next-day"],
  );
});

test("a missing listening table is recognized from the Supabase error", () => {
  assert.equal(
    isListeningSchemaMissing(
      "Could not find the table 'public.listening_runs' in the schema cache",
    ),
    true,
  );
  assert.equal(
    isListeningSchemaMissing(
      "Could not find the function public.clip_outcome_totals without parameters in the schema cache",
    ),
    true,
  );
  assert.equal(isListeningSchemaMissing("insert failed"), false);
});
