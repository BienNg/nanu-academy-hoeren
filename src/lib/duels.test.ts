import assert from "node:assert/strict";
import test from "node:test";
import {
  DUEL_SIZE,
  awardForPoints,
  clipWinner,
  extractStudiedClips,
  formatDuelTime,
  homeBucket,
  isDuelSchemaMissing,
  isTooFast,
  matchPool,
  pointsFromPlays,
  sampleItems,
  sharedStudied,
  type CatalogClip,
  type ClipPlay,
} from "./duels.js";

const catalog: CatalogClip[] = [
  { lessonKey: "a1-1/lektion-1", chapterSlug: "lektion-1", clipId: "Hallo" },
  { lessonKey: "a1-1/lektion-1", chapterSlug: "lektion-1", clipId: "Tschüss" },
  { lessonKey: "a2-1/lektion-1", chapterSlug: "lektion-1", clipId: "Hallo" },
  { lessonKey: "a1-1/lektion-2", chapterSlug: "lektion-2", clipId: "Bitte" },
];

test("studied clips follow completed listening ids and skip ambiguous chapter keys", () => {
  const clips = extractStudiedClips(
    {
      "lektion-1": { completedClipIds: ["Hallo", "Tschüss"] },
      "lektion-2": { completedClipIds: ["Bitte", "missing"] },
      "a1-1/lektion-2": { completedClipIds: ["Bitte"] },
    },
    catalog,
  );
  const keys = clips.map((clip) => `${clip.lessonKey}/${clip.clipId}`).sort();
  assert.deepEqual(keys, ["a1-1/lektion-1/Tschüss", "a1-1/lektion-2/Bitte"]);
});

test("shared studied clips ignore order and duplicates", () => {
  const shared = sharedStudied(
    [
      { lessonKey: "a1-1/lektion-1", clipId: "Hallo" },
      { lessonKey: "a1-1/lektion-1", clipId: "Hallo" },
      { lessonKey: "a1-1/lektion-2", clipId: "Bitte" },
    ],
    [
      { lessonKey: "a1-1/lektion-2", clipId: "Bitte" },
      { lessonKey: "a1-1/lektion-1", clipId: "Tschüss" },
    ],
  );
  assert.deepEqual(shared, [{ lessonKey: "a1-1/lektion-2", clipId: "Bitte" }]);
});

test("a sample stays inside the source list", () => {
  const source = ["a", "b", "c", "d"];
  const picked = sampleItems(source, 3, () => 0.1);
  assert.equal(picked.length, 3);
  assert.equal(source.join(""), "abcd");
  for (const item of picked) assert.equal(source.includes(item), true);
  assert.equal(sampleItems(source, 10, () => 0).length, 4);
});

test("matchmaking drops classmates at the open-duel cap", () => {
  assert.equal(matchPool({ hasClass: false, candidates: [] }).block, "no_class");
  assert.equal(
    matchPool({
      hasClass: true,
      candidates: [{ userId: "a", shared: 14, openDuels: 0 }],
    }).block,
    "no_overlap",
  );

  const mixed = matchPool({
    hasClass: true,
    candidates: [
      { userId: "full", shared: 20, openDuels: 3 },
      { userId: "open", shared: DUEL_SIZE, openDuels: 2 },
      { userId: "short", shared: 10, openDuels: 0 },
    ],
  });
  assert.equal(mixed.block, "ok");
  assert.deepEqual(mixed.pool, ["open"]);

  const capped = matchPool({
    hasClass: true,
    candidates: [{ userId: "full", shared: 40, openDuels: 3 }],
  });
  assert.equal(capped.block, "cap");
  assert.deepEqual(capped.pool, []);
});

test("the faster time wins a clip, a forfeit loses it, and an equal time is a draw", () => {
  assert.equal(clipWinner(1000, 2000), "left");
  assert.equal(clipWinner(2000, 1000), "right");
  assert.equal(clipWinner(2000, 2000), "neither");
  assert.equal(clipWinner(null, 2000), "right");
  assert.equal(clipWinner(2000, null), "left");
  assert.equal(clipWinner(null, null), "neither");
});

test("duel points ignore clips the opponent has not finished", () => {
  const you: ClipPlay[] = [
    { position: 0, state: "done", elapsedMs: 3000 },
    { position: 1, state: "forfeited", elapsedMs: null },
    { position: 2, state: "done", elapsedMs: 4000 },
  ];
  const them: ClipPlay[] = [
    { position: 0, state: "done", elapsedMs: 5000 },
    { position: 1, state: "done", elapsedMs: 3000 },
    { position: 2, state: "active", elapsedMs: null },
  ];
  const score = pointsFromPlays(you, them, 3);
  assert.equal(score.left, 1);
  assert.equal(score.right, 1);
  assert.equal(score.bothDone, false);
});

test("a tied duel pays 35 XP and a win pays 50 against 20", () => {
  assert.deepEqual(awardForPoints(8, 8), {
    leftXp: 35,
    rightXp: 35,
    leftOutcome: "tie",
    rightOutcome: "tie",
  });
  assert.equal(awardForPoints(9, 6).leftXp, 50);
  assert.equal(awardForPoints(9, 6).rightXp, 20);
  assert.equal(awardForPoints(4, 11).leftOutcome, "loss");
});

test("home buckets separate unopened, in-progress, waiting, and finished duels", () => {
  assert.equal(homeBucket({ youStarted: false, youSettled: 0, opponentSettled: 0 }), "incoming");
  assert.equal(homeBucket({ youStarted: true, youSettled: 4, opponentSettled: 0 }), "playing");
  assert.equal(homeBucket({ youStarted: true, youSettled: 15, opponentSettled: 3 }), "waiting");
  assert.equal(homeBucket({ youStarted: true, youSettled: 15, opponentSettled: 15 }), "history");
});

test("times under two seconds are rejected and labels use a comma", () => {
  assert.equal(isTooFast(1999), true);
  assert.equal(isTooFast(2000), false);
  assert.equal(formatDuelTime(null), "Bỏ");
  assert.equal(formatDuelTime(1500), "1,5s");
  assert.equal(formatDuelTime(65_000), "1:05");
});

test("schema hint only matches missing duel tables", () => {
  assert.equal(
    isDuelSchemaMissing("Could not find the table public.duel_plays in the schema cache"),
    true,
  );
  assert.equal(isDuelSchemaMissing("xp_awards does not exist"), false);
});
