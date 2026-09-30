import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReviewOutcomes,
  decideReviewXp,
  isReviewDue,
  isReviewSchemaMissing,
  nextReviewState,
  parseReviewSubmit,
  pickReviewItems,
  replayReviewHistory,
  REVIEW_DECK_MAX_XP,
  REVIEW_MAX_BOX,
  REVIEW_PAID_DECKS_PER_DAY,
  reviewDueAt,
  reviewKey,
  reviewLevelSlug,
  type DueReviewItem,
  type ReviewState,
} from "./review.js";

// 20:00 in Vietnam on 2026-09-27.
const NOW = new Date("2026-09-27T13:00:00.000Z");
const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    box: 2,
    dueAt: "2026-09-27T00:00:00.000Z",
    lastReviewedAt: null,
    reviews: 3,
    lapses: 0,
    ...overrides,
  };
}

test("due dates fall on Vietnam midnight", () => {
  // Box 0 is tomorrow 00:00 in Vietnam = 17:00 UTC today.
  assert.equal(reviewDueAt(0, NOW), "2026-09-27T17:00:00.000Z");
  assert.equal(reviewDueAt(1, NOW), "2026-09-29T17:00:00.000Z");
  // 23:30 UTC is already the next day in Vietnam.
  assert.equal(reviewDueAt(0, new Date("2026-09-27T23:30:00.000Z")), "2026-09-28T17:00:00.000Z");
  assert.equal(reviewDueAt(99, NOW), reviewDueAt(REVIEW_MAX_BOX, NOW));
});

test("a new clip answered right starts in box 1", () => {
  const next = nextReviewState(null, "good", NOW);
  assert.equal(next.box, 1);
  assert.equal(next.reviews, 1);
  assert.equal(next.lapses, 0);
  assert.equal(next.dueAt, reviewDueAt(1, NOW));
});

test("a new clip missed starts in box 0 without a lapse", () => {
  const next = nextReviewState(null, "again", NOW);
  assert.equal(next.box, 0);
  assert.equal(next.lapses, 0);
});

test("a due clip answered right moves up one box", () => {
  const next = nextReviewState(state({ box: 2 }), "good", NOW);
  assert.equal(next.box, 3);
  assert.equal(next.reviews, 4);
  assert.equal(next.dueAt, reviewDueAt(3, NOW));
});

test("the top box stays the top box", () => {
  assert.equal(nextReviewState(state({ box: REVIEW_MAX_BOX }), "good", NOW).box, REVIEW_MAX_BOX);
});

test("a miss resets to box 0 and counts a lapse", () => {
  const next = nextReviewState(state({ box: 4, lapses: 1 }), "again", NOW);
  assert.equal(next.box, 0);
  assert.equal(next.lapses, 2);
  assert.equal(next.dueAt, reviewDueAt(0, NOW));
});

test("a right answer before the due date does not skip boxes", () => {
  const early = state({ box: 2, dueAt: "2026-10-05T17:00:00.000Z" });
  const next = nextReviewState(early, "good", NOW);
  assert.equal(next.box, 2);
  assert.equal(next.dueAt, early.dueAt);
  assert.equal(next.reviews, early.reviews);
  assert.equal(next.lastReviewedAt, NOW.toISOString());
});

test("a miss before the due date still resets", () => {
  const early = state({ box: 3, dueAt: "2026-10-05T17:00:00.000Z" });
  assert.equal(nextReviewState(early, "again", NOW).box, 0);
});

test("isReviewDue compares against now", () => {
  assert.equal(isReviewDue({ dueAt: NOW.toISOString() }, NOW), true);
  assert.equal(isReviewDue({ dueAt: "2026-09-28T00:00:00.000Z" }, NOW), false);
  assert.equal(isReviewDue({ dueAt: "not a date" }, NOW), false);
});

test("a batch keeps the worst answer per clip", () => {
  const next = applyReviewOutcomes(
    new Map(),
    [
      { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: false },
      { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: true },
      { lessonKey: "a1-1/lektion-1", clipId: "Tschüss", missed: false },
    ],
    NOW,
  );
  assert.equal(next.get(reviewKey("a1-1/lektion-1", "Hallo"))?.box, 0);
  assert.equal(next.get(reviewKey("a1-1/lektion-1", "Tschüss"))?.box, 1);
});

test("history replays oldest first", () => {
  const states = replayReviewHistory([
    // Out of order on purpose.
    { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: false, createdAt: "2026-09-10T03:00:00.000Z" },
    { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: true, createdAt: "2026-09-01T03:00:00.000Z" },
    { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: false, createdAt: "2026-09-03T03:00:00.000Z" },
    { lessonKey: "a1-1/lektion-1", clipId: "bad", missed: false, createdAt: "nope" },
  ]);
  // miss → box 0 (due 09-02), right on 09-03 → box 1 (due 09-06), right on 09-10 → box 2.
  const hallo = states.get(reviewKey("a1-1/lektion-1", "Hallo"));
  assert.equal(hallo?.box, 2);
  assert.equal(hallo?.reviews, 3);
  assert.equal(states.has(reviewKey("a1-1/lektion-1", "bad")), false);
});

test("pickReviewItems orders by overdue, then lapses, and drops unknown clips", () => {
  const items: DueReviewItem[] = [
    { lessonKey: "a1-1/lektion-1", clipId: "a", dueAt: "2026-09-25T17:00:00.000Z", lapses: 0 },
    { lessonKey: "a1-1/lektion-1", clipId: "b", dueAt: "2026-09-20T17:00:00.000Z", lapses: 0 },
    { lessonKey: "a1-1/lektion-1", clipId: "c", dueAt: "2026-09-25T17:00:00.000Z", lapses: 3 },
    { lessonKey: "a1-1/lektion-1", clipId: "future", dueAt: "2026-10-25T17:00:00.000Z", lapses: 9 },
    { lessonKey: "b1-1/lektion-1", clipId: "locked", dueAt: "2026-09-01T17:00:00.000Z", lapses: 0 },
  ];
  const picked = pickReviewItems(items, (item) => reviewLevelSlug(item.lessonKey) === "a1-1", NOW);
  assert.deepEqual(
    picked.map((item) => item.clipId),
    ["b", "c", "a"],
  );
  assert.equal(pickReviewItems(items, () => true, NOW, 1).length, 1);
});

test("review XP is per clip, capped per session and per day", () => {
  assert.deepEqual(decideReviewXp({ clipCount: 2, elapsedMs: 60_000, paidToday: 0 }), { xp: 6, kind: "new" });
  assert.equal(decideReviewXp({ clipCount: 10, elapsedMs: 60_000, paidToday: 0 }).xp, REVIEW_DECK_MAX_XP);
  assert.deepEqual(decideReviewXp({ clipCount: 10, elapsedMs: 5_000, paidToday: 0 }), { xp: 0, kind: "rejected" });
  assert.deepEqual(
    decideReviewXp({ clipCount: 10, elapsedMs: 60_000, paidToday: REVIEW_PAID_DECKS_PER_DAY }),
    { xp: 0, kind: "capped" },
  );
  assert.equal(decideReviewXp({ clipCount: 0, elapsedMs: 60_000, paidToday: 0 }).kind, "rejected");
});

test("parseReviewSubmit accepts a valid session", () => {
  const parsed = parseReviewSubmit({
    id: ID,
    elapsedMs: 45_000,
    clips: [
      { lessonKey: "a1-1/lektion-1", clipId: "Guten Morgen", missed: false },
      { lessonKey: "a2-1/lektion-3", clipId: "Hallo", missed: true },
    ],
  });
  assert.equal(parsed?.clips.length, 2);
  assert.equal(parsed?.elapsedMs, 45_000);
});

test("parseReviewSubmit rejects bad bodies", () => {
  const clip = { lessonKey: "a1-1/lektion-1", clipId: "Hallo", missed: false };
  assert.equal(parseReviewSubmit(null), null);
  assert.equal(parseReviewSubmit({ id: "x", elapsedMs: 1, clips: [clip] }), null);
  assert.equal(parseReviewSubmit({ id: ID, elapsedMs: -1, clips: [clip] }), null);
  assert.equal(parseReviewSubmit({ id: ID, elapsedMs: 1, clips: [] }), null);
  assert.equal(parseReviewSubmit({ id: ID, elapsedMs: 1, clips: [clip, clip] }), null);
  assert.equal(
    parseReviewSubmit({ id: ID, elapsedMs: 1, clips: [{ ...clip, lessonKey: "../etc" }] }),
    null,
  );
  assert.equal(parseReviewSubmit({ id: ID, elapsedMs: 1, clips: [{ ...clip, clipId: "a/b" }] }), null);
  assert.equal(parseReviewSubmit({ id: ID, elapsedMs: 1, clips: [{ ...clip, missed: "no" }] }), null);
  assert.equal(
    parseReviewSubmit({ id: ID, elapsedMs: 1, clips: Array.from({ length: 11 }, (_, i) => ({ ...clip, clipId: `c${i}` })) }),
    null,
  );
});

test("review schema errors are recognised", () => {
  assert.equal(isReviewSchemaMissing('relation "public.review_items" does not exist'), true);
  assert.equal(isReviewSchemaMissing("Could not find the table 'public.review_xp_awards' in the schema cache"), true);
  assert.equal(isReviewSchemaMissing('relation "public.xp_awards" does not exist'), false);
});
