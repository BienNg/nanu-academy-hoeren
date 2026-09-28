import assert from "node:assert/strict";
import test from "node:test";
import {
  DUEL_DEADLINE_MS,
  DUEL_EXPIRE_CHALLENGER_XP,
  DUEL_EXPIRE_OPPONENT_XP,
  DUEL_SIZE,
  awardForPoints,
  challengeExpiresAt,
  challengeLeftLabel,
  challengeReleasedAt,
  completedAgoLabel,
  clipWinner,
  extractStudiedClips,
  clipCanStart,
  duelCardsFromClips,
  formatDuelTime,
  homeBucket,
  isChallengeExpired,
  isDuelSchemaMissing,
  matchPool,
  opponentCanSeeDuel,
  pointsFromPlays,
  sampleItems,
  sharedStudied,
  withClipSettled,
  mergeDuelView,
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

test("a finished study pass counts every clip when the chapter is one lesson", () => {
  const clips = extractStudiedClips(
    {
      "lektion-2": {
        completedClipIds: [],
        reviewedClipIds: [],
        studyRunCount: 1,
        studyCompletedAt: "2026-09-27T15:52:24.821Z",
      },
    },
    catalog,
  );
  assert.deepEqual(clips, [{ lessonKey: "a1-1/lektion-2", clipId: "Bitte" }]);
});

test("reviewed study cards count before the pass is finished", () => {
  const clips = extractStudiedClips(
    { "lektion-2": { reviewedClipIds: ["Bitte", "missing"] } },
    catalog,
  );
  assert.deepEqual(clips, [{ lessonKey: "a1-1/lektion-2", clipId: "Bitte" }]);
});

test("a finished study pass on a shared chapter slug does not assign every level", () => {
  const clips = extractStudiedClips(
    { "lektion-1": { studyRunCount: 1, reviewedClipIds: ["Tschüss"] } },
    catalog,
  );
  assert.deepEqual(clips, [{ lessonKey: "a1-1/lektion-1", clipId: "Tschüss" }]);
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

test("a local settle updates that clip and leaves the next one waiting", () => {
  const view = {
    id: "00000000-0000-4000-8000-000000000001",
    yourName: "Bạn",
    opponentName: "An",
    complete: false,
    yourOutcome: null,
    yourXp: null,
    opponentXp: null,
    yourPoints: 0,
    opponentPoints: 0,
    nextPosition: 0,
    startedAt: null,
    completedAt: null,
    expired: false,
    expiresAt: null,
    clips: [
      {
        position: 0,
        kind: "listening" as const,
        script: "Hallo",
        audioPath: "a1-1/lektion-1/Hallo.mp3",
        translationVi: null,
        options: null,
        you: { state: "pending" as const, elapsedMs: null },
        opponent: { state: "done" as const, elapsedMs: 4000 },
        winner: "pending" as const,
      },
      {
        position: 1,
        kind: "listening" as const,
        script: "Tschüss",
        audioPath: "a1-1/lektion-1/Tschüss.mp3",
        translationVi: null,
        options: null,
        you: { state: "pending" as const, elapsedMs: null },
        opponent: { state: "pending" as const, elapsedMs: null },
        winner: "pending" as const,
      },
    ],
  };
  const faster = withClipSettled(view, 0, { state: "done", elapsedMs: 2500 });
  assert.equal(faster.clips[0]?.winner, "you");
  assert.equal(faster.yourPoints, 1);
  assert.equal(faster.nextPosition, 1);
  const slower = withClipSettled(view, 0, { state: "done", elapsedMs: 9000 });
  assert.equal(slower.clips[0]?.winner, "opponent");
  assert.equal(slower.opponentPoints, 1);
  const stuck = withClipSettled(faster, 0, { state: "forfeited" });
  assert.equal(stuck.clips[0]?.you.state, "done");
  const saved = mergeDuelView(faster, {
    ...view,
    clips: view.clips.map((clip) =>
      clip.position === 0 ? { ...clip, you: { state: "pending" as const, elapsedMs: null } } : clip,
    ),
  });
  assert.equal(saved.clips[0]?.you.state, "done");
  assert.equal(saved.yourPoints, 1);
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
  assert.equal(
    homeBucket({ finished: true, youStarted: false, youSettled: 0, opponentSettled: 15 }),
    "history",
  );
  assert.equal(opponentCanSeeDuel(false, 0), true);
  assert.equal(opponentCanSeeDuel(true, 14), false);
  assert.equal(opponentCanSeeDuel(true, 15), true);
});

test("the challenged person has 3 days after the challenger finishes", () => {
  const plays = Array.from({ length: DUEL_SIZE }, (_, position) => ({
    state: "done" as const,
    finishedAt: `2026-09-01T00:00:${String(position).padStart(2, "0")}.000Z`,
  }));
  assert.equal(challengeReleasedAt(plays.slice(0, 14)), null);
  const released = challengeReleasedAt(plays);
  assert.equal(released, "2026-09-01T00:00:14.000Z");
  const expires = challengeExpiresAt(released);
  assert.equal(expires, new Date(Date.parse(released!) + DUEL_DEADLINE_MS).toISOString());
  const justBefore = new Date(Date.parse(expires!) - 1);
  const onDeadline = new Date(Date.parse(expires!));
  assert.equal(isChallengeExpired(expires, justBefore), false);
  assert.equal(isChallengeExpired(expires, onDeadline), true);
  assert.equal(challengeLeftLabel(expires, justBefore, "you"), "Còn 1 phút");
  const twoDaysLeft = new Date(Date.parse(expires!) - 2 * 24 * 60 * 60 * 1000);
  assert.equal(challengeLeftLabel(expires, twoDaysLeft, "opponent"), "Đối thủ còn 2 ngày");
  assert.equal(challengeLeftLabel(expires, onDeadline, "you"), null);
  assert.equal(DUEL_EXPIRE_CHALLENGER_XP, 35);
  assert.equal(DUEL_EXPIRE_OPPONENT_XP, 0);
});

test("a finished duel is dated in days, then weeks", () => {
  const now = new Date("2026-09-28T03:00:00.000Z");
  assert.equal(completedAgoLabel("2026-09-27T20:00:00.000Z", now), "Hôm nay");
  assert.equal(completedAgoLabel("2026-09-27T16:00:00.000Z", now), "Hôm qua");
  assert.equal(completedAgoLabel("2026-09-24T03:00:00.000Z", now), "4 ngày trước");
  assert.equal(completedAgoLabel("2026-09-21T03:00:00.000Z", now), "1 tuần trước");
  assert.equal(completedAgoLabel("2026-09-07T03:00:00.000Z", now), "3 tuần trước");
  assert.equal(completedAgoLabel("not-a-date", now), null);
});

test("time labels use a comma", () => {
  assert.equal(formatDuelTime(null), "Bỏ");
  assert.equal(formatDuelTime(1500), "1,5s");
  assert.equal(formatDuelTime(65_000), "1:05");
});

test("a duel uses each clip once, as listening, sentence order, or multiple choice", () => {
  const cards = duelCardsFromClips([
    { lessonKey: "a1-1/lektion-4", clipId: "schon", sentenceOrder: true },
    { lessonKey: "a1-1/lektion-4", clipId: "der", sentenceOrder: false },
    { lessonKey: "a1-1/lektion-4", clipId: "schon", sentenceOrder: true },
    { lessonKey: "a1-1/lektion-3", clipId: "schon", sentenceOrder: false },
  ]);
  assert.deepEqual(
    cards.map((card) => [card.clip.lessonKey, card.clip.clipId, card.kind]),
    [
      ["a1-1/lektion-4", "schon", "order"],
      ["a1-1/lektion-4", "der", "listening"],
      ["a1-1/lektion-3", "schon", "listening"],
    ],
  );
  assert.equal(new Set(cards.map((card) => `${card.clip.lessonKey}/${card.clip.clipId}`)).size, cards.length);
});

test("sentence order beats multiple choice, which beats listening", () => {
  const cards = duelCardsFromClips([
    { lessonKey: "a1-1/lektion-4", clipId: "both", sentenceOrder: true, multipleChoice: true },
    { lessonKey: "a1-1/lektion-4", clipId: "mc-only", sentenceOrder: false, multipleChoice: true },
    { lessonKey: "a1-1/lektion-4", clipId: "neither", sentenceOrder: false, multipleChoice: false },
  ]);
  assert.deepEqual(
    cards.map((card) => card.kind),
    ["order", "multiple-choice", "listening"],
  );
});

test("sentence order and multiple choice can start without audio, and dictation still needs it", () => {
  assert.equal(
    clipCanStart({ kind: "order", script: "Die Mutter ist sehr schön.", audioPath: null, translationVi: "Người mẹ rất đẹp." }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "order", script: "Die Mutter ist sehr schön.", audioPath: "x.mp3", translationVi: "  " }),
    false,
  );
  assert.equal(
    clipCanStart({ kind: "multiple-choice", script: "Hallo", audioPath: null, translationVi: "Xin chào" }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "multiple-choice", script: "Hallo", audioPath: "x.mp3", translationVi: "  " }),
    false,
  );
  assert.equal(
    clipCanStart({ kind: "listening", script: "der", audioPath: "der.mp3", translationVi: null }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "listening", script: "der", audioPath: null, translationVi: "mạo từ" }),
    false,
  );
});

test("schema hint only matches missing duel tables", () => {
  assert.equal(
    isDuelSchemaMissing("Could not find the table public.duel_plays in the schema cache"),
    true,
  );
  assert.equal(isDuelSchemaMissing("xp_awards does not exist"), false);
});
