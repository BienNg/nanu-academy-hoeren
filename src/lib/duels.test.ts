import assert from "node:assert/strict";
import test from "node:test";
import {
  DUEL_DEADLINE_MS,
  DUEL_EXPIRE_CHALLENGER_XP,
  DUEL_EXPIRE_OPPONENT_XP,
  DUEL_SIZE,
  awardForPoints,
  challengeExpiresAt,
  incomingChallengeLabel,
  challengeLeftLabel,
  challengeReleasedAt,
  completedAgoLabel,
  clipWinner,
  addToRecord,
  duelEndSteps,
  duelHomeFocus,
  emptyDuelHome,
  timeLeftPhrase,
  type DuelCard,
  DUEL_LOSS_XP,
  DUEL_TIE_XP,
  DUEL_WIN_XP,
  extractStudiedClips,
  clipCanStart,
  dealUniqueDuelCards,
  duelCardsFromClips,
  formatDuelTime,
  homeBucket,
  isChallengeExpired,
  isDuelMatchFailureSchemaMissing,
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
  assert.equal(incomingChallengeLabel("Lan", expires, twoDaysLeft), "Lan thách đấu bạn · Còn 2 ngày");
  assert.equal(incomingChallengeLabel("  ", expires, onDeadline), "Học viên thách đấu bạn");
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

test("extra kinds of one clip still deal that clip once", () => {
  const hallo = { lessonKey: "a1-1/lektion-1", clipId: "hallo" };
  const tschuss = { lessonKey: "a1-1/lektion-1", clipId: "tschuss" };
  const variants = [
    { clip: hallo, kind: "listening" as const },
    { clip: hallo, kind: "vi-input" as const },
    { clip: hallo, kind: "vi-choice" as const },
    { clip: hallo, kind: "listening-order" as const },
    { clip: tschuss, kind: "order" as const },
  ];
  for (let roll = 0; roll < 20; roll += 1) {
    const dealt = dealUniqueDuelCards(variants, 15, () => roll / 20);
    assert.equal(dealt.length, 2);
    assert.equal(new Set(dealt.map((card) => `${card.clip.lessonKey}/${card.clip.clipId}`)).size, 2);
  }
  assert.equal(
    dealUniqueDuelCards(variants, 15, () => 0).find((card) => card.clip.clipId === "hallo")?.kind,
    "listening",
  );
  assert.equal(
    dealUniqueDuelCards(variants, 15, () => 0.99).find((card) => card.clip.clipId === "hallo")?.kind,
    "listening-order",
  );
});

test("a duel uses each clip once, as listening, sentence order, or multiple choice", () => {
  const cards = duelCardsFromClips([
    { lessonKey: "a1-1/lektion-4", clipId: "schon", translationVi: "đã", sentenceOrder: true },
    { lessonKey: "a1-1/lektion-4", clipId: "der", translationVi: "mạo từ", sentenceOrder: false },
    { lessonKey: "a1-1/lektion-4", clipId: "schon", translationVi: "đã", sentenceOrder: true },
    { lessonKey: "a1-1/lektion-3", clipId: "schon", translationVi: "đã", sentenceOrder: false },
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

test("sentence order beats a meaning choice, which beats listening", () => {
  const cards = duelCardsFromClips([
    { lessonKey: "a1-1/lektion-4", clipId: "both", translationVi: "cả hai", sentenceOrder: true, multipleChoice: true },
    { lessonKey: "a1-1/lektion-4", clipId: "mc-only", translationVi: "chỉ chọn", sentenceOrder: false, multipleChoice: true },
    { lessonKey: "a1-1/lektion-4", clipId: "neither", translationVi: "nghe", sentenceOrder: false, multipleChoice: false },
    { lessonKey: "a1-1/lektion-4", clipId: "silent", translationVi: "  ", sentenceOrder: true, multipleChoice: true },
  ]);
  assert.deepEqual(
    cards.map((card) => card.kind),
    ["order", "listening-choice", "listening", "listening"],
  );
});

test("60% of a duel's meaning choices are played from audio", () => {
  const clips = Array.from({ length: 5 }, (_, index) => ({
    lessonKey: "a1-1/lektion-4",
    clipId: `mc-${index}`,
    translationVi: `nghĩa ${index}`,
    sentenceOrder: false,
    multipleChoice: true,
  }));
  for (const roll of [0, 0.3, 0.7, 0.99]) {
    const kinds = duelCardsFromClips(clips, () => roll).map((card) => card.kind);
    assert.equal(kinds.filter((kind) => kind === "listening-choice").length, 3);
    assert.equal(kinds.filter((kind) => kind === "multiple-choice").length, 2);
  }
});

test("a listening-choice duel card needs audio and a translation", () => {
  assert.equal(
    clipCanStart({ kind: "listening-choice", script: "Hallo", audioPath: "hallo.mp3", translationVi: "Xin chào" }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "listening-choice", script: "Hallo", audioPath: null, translationVi: "Xin chào" }),
    false,
  );
  assert.equal(
    clipCanStart({ kind: "listening-choice", script: "Hallo", audioPath: "hallo.mp3", translationVi: " " }),
    false,
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
    clipCanStart({ kind: "vi-choice", script: "Hallo", audioPath: null, translationVi: "Xin chào" }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "vi-input", script: "Hallo", audioPath: null, translationVi: "Xin chào" }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "listening", script: "der", audioPath: "der.mp3", translationVi: null }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "listening", script: "der", audioPath: null, translationVi: "mạo từ" }),
    false,
  );
  assert.equal(
    clipCanStart({ kind: "listening-order", script: "Ich bin hier", audioPath: "a.mp3", translationVi: null }),
    true,
  );
  assert.equal(
    clipCanStart({ kind: "listening-order", script: "Ich bin hier", audioPath: null, translationVi: "tôi ở đây" }),
    false,
  );
});

test("schema hint only matches missing duel tables", () => {
  assert.equal(
    isDuelSchemaMissing("Could not find the table public.duel_plays in the schema cache"),
    true,
  );
  assert.equal(isDuelSchemaMissing("xp_awards does not exist"), false);
  assert.equal(
    isDuelMatchFailureSchemaMissing("Could not find the table public.duel_match_failures in the schema cache"),
    true,
  );
  assert.equal(isDuelMatchFailureSchemaMissing("duels does not exist"), false);
});

const endBase = {
  complete: true,
  expired: false,
  yourOutcome: "win" as const,
  yourXp: null,
  yourPoints: 9,
  opponentPoints: 6,
  opponentName: "Lan",
  expiresAt: null,
};

test("an open duel ends with a done card and then the opponent's turn", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  const steps = duelEndSteps(
    { ...endBase, complete: false, yourOutcome: null, expiresAt: "2026-10-09T00:00:00Z" },
    now,
  );
  assert.deepEqual(
    steps.map((step) => step.kind),
    ["finished", "waiting"],
  );
  assert.equal(steps[1]?.xp, null);
  assert.match(steps[1]?.subtitle ?? "", /Lan còn 2 ngày/);
});

test("an open duel without a saved deadline falls back to the full window", () => {
  const steps = duelEndSteps({ ...endBase, complete: false, yourOutcome: null });
  assert.match(steps[1]?.subtitle ?? "", /còn 3 ngày/);
});

test("a closed duel gets one card with its XP and score", () => {
  const [win] = duelEndSteps(endBase);
  assert.deepEqual([win?.kind, win?.pose, win?.xp, win?.score], ["win", "balloon", DUEL_WIN_XP, true]);
  const [loss] = duelEndSteps({ ...endBase, yourOutcome: "loss", yourPoints: 6, opponentPoints: 9 });
  assert.deepEqual([loss?.kind, loss?.xp, loss?.subtitle], ["loss", DUEL_LOSS_XP, "6–9. Thua vẫn được XP."]);
  const [tie] = duelEndSteps({ ...endBase, yourOutcome: "tie", yourXp: 35 });
  assert.deepEqual([tie?.kind, tie?.xp], ["tie", DUEL_TIE_XP]);
});

test("an expired duel hides the score and pays only the challenger", () => {
  const [won] = duelEndSteps({ ...endBase, expired: true });
  assert.deepEqual([won?.kind, won?.xp, won?.score], ["expired-win", DUEL_EXPIRE_CHALLENGER_XP, false]);
  const [missed] = duelEndSteps({ ...endBase, expired: true, yourOutcome: "loss", yourXp: 0 });
  assert.deepEqual([missed?.kind, missed?.xp, missed?.score], ["expired-loss", null, false]);
});

test("time left reads in the largest whole unit", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  assert.equal(timeLeftPhrase("2026-10-08T12:00:00Z", now), "2 ngày");
  assert.equal(timeLeftPhrase("2026-10-07T03:30:00Z", now), "4 giờ");
  assert.equal(timeLeftPhrase("2026-10-07T00:00:20Z", now), "1 phút");
  assert.equal(timeLeftPhrase("2026-10-06T00:00:00Z", now), null);
});

function homeCard(id: string, expiresAt: string | null = null): DuelCard {
  return {
    id,
    yourName: "Bạn",
    opponentName: "Lan",
    createdAt: "2026-10-01T00:00:00Z",
    challenged: true,
    youSettled: 0,
    opponentStarted: true,
    yourOutcome: null,
    yourXp: null,
    yourPoints: null,
    opponentPoints: null,
    expired: false,
    expiresAt,
  };
}

test("the duel page leads with the challenge closest to running out", () => {
  const home = {
    ...emptyDuelHome(true, "ok"),
    studiedCount: DUEL_SIZE,
    incoming: [homeCard("late", "2026-10-09T00:00:00Z"), homeCard("soon", "2026-10-08T00:00:00Z")],
    playing: [homeCard("mid")],
  };
  const focus = duelHomeFocus(home);
  assert.equal(focus.kind, "incoming");
  assert.equal(focus.kind === "incoming" ? focus.card.id : null, "soon");
  assert.equal(duelHomeFocus({ ...home, incoming: [] }).kind, "playing");
});

test("the duel page asks for study, an intro, a start, or explains the block", () => {
  const ready = { ...emptyDuelHome(true, "ok"), studiedCount: DUEL_SIZE };
  assert.equal(duelHomeFocus({ ...ready, studiedCount: 4 }).kind, "study");
  assert.equal(duelHomeFocus(ready).kind, "intro");
  assert.equal(duelHomeFocus({ ...ready, history: [homeCard("old")] }).kind, "start");
  assert.equal(duelHomeFocus({ ...ready, block: "cap" }).kind, "cap");
  assert.equal(duelHomeFocus({ ...ready, block: "no_class" }).kind, "blocked");
  assert.equal(duelHomeFocus({ ...ready, viewerIsAdmin: true }).kind, "blocked");
  assert.equal(duelHomeFocus(emptyDuelHome(false)).kind, "blocked");
});

test("the record counts each closed outcome once", () => {
  let record = emptyDuelHome(true).record;
  for (const outcome of ["win", "win", "loss", "tie", null] as const) record = addToRecord(record, outcome);
  assert.deepEqual(record, { wins: 2, losses: 1, ties: 1 });
});
